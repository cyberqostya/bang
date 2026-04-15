import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 3001);
const SEAT_COUNT = 8;
const DEFAULT_HEALTH = 4;
const BULLET_SKIN_COUNT = 11;
const MAX_ROOM_NAME_LENGTH = 15;
const MAX_PASSWORD_LENGTH = 40;
const MAX_ACTIVE_ROOMS = 100;
const MAX_ROOM_CREATES_PER_WINDOW = 5;
const ROOM_CREATE_WINDOW_MS = 10 * 60 * 1000;
const PLAYER_DISCONNECT_GRACE_MS = 40 * 60 * 1000;
const EMPTY_ROOM_GRACE_MS = 40 * 60 * 1000;
const GAME_TTL_MS = 5 * 60 * 60 * 1000;

const rooms = new Map();
const clients = new Map();
const disconnectTimers = new Map();
const emptyRoomTimers = new Map();
const roomCreateAttempts = new Map();
const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (socket, request) => {
  const client = {
    connectionId: randomUUID(),
    playerId: null,
    ip: getClientIp(request),
    socket,
    roomId: null,
    seatIndex: null,
  };

  clients.set(socket, client);

  socket.on("message", (rawMessage) => {
    const message = parseMessage(rawMessage);

    if (!message) return;

    handleMessage(client, message);
  });

  socket.on("close", () => {
    clients.delete(socket);

    if (client.roomId) {
      maybeScheduleEmptyRoomCleanup(client.roomId);
    }

    if (client.playerId && !hasConnectedClient(client.playerId)) {
      markPlayerDisconnected(client.playerId);
    }
  });
});

function handleMessage(client, message) {
  if (message.type === "client:hello") {
    attachPlayer(client, message.payload);
    return;
  }

  if (message.type === "room:create") {
    createRoom(client, message.payload);
    return;
  }

  if (message.type === "room:join") {
    joinRoom(client, message.payload);
    return;
  }

  if (message.type === "room:take-seat") {
    takeSeat(client, message.payload);
    return;
  }

  if (message.type === "room:leave-seat") {
    leaveSeat(client.roomId, client.playerId);
    broadcastRoom(client.roomId);
    broadcastRooms();
    return;
  }

  if (message.type === "room:start-game") {
    startGame(client);
  }
}

function attachPlayer(client, payload = {}) {
  const playerId = normalizePlayerId(payload.playerId) || randomUUID();
  const playerRoom = findRoomByPlayerId(playerId) || findHostedRoomByPlayerId(playerId);

  client.playerId = playerId;
  clearDisconnectTimer(playerId);

  if (playerRoom) {
    client.roomId = playerRoom.id;
    clearEmptyRoomTimer(playerRoom.id);

    const seatIndex = findSeatIndexByPlayerId(playerRoom, playerId);
    client.seatIndex = seatIndex;

    if (seatIndex !== null) {
      playerRoom.seats[seatIndex].player.connected = true;
    }
  }

  send(client.socket, "client:init", {
    playerId,
    rooms: getPublicRooms(),
    room: playerRoom ? getPublicRoom(playerRoom) : null,
  });

  if (playerRoom) {
    broadcastRoom(playerRoom.id);
  }
}

function createRoom(client, payload = {}) {
  if (!client.playerId) {
    sendError(client.socket, "Игрок еще не подключен");
    return;
  }

  if (client.roomId && rooms.has(client.roomId)) {
    sendError(client.socket, "Вы уже в комнате");
    return;
  }

  if (rooms.size >= MAX_ACTIVE_ROOMS) {
    sendError(client.socket, "Слишком много активных комнат");
    return;
  }

  if (!canCreateRoom(client.ip)) {
    sendError(client.socket, "Слишком много комнат, попробуйте позже");
    return;
  }

  const name = normalizeRoomName(payload.name);
  const password = normalizePassword(payload.password);

  if (!name) {
    sendError(client.socket, "Введите название комнаты");
    return;
  }

  if (!password) {
    sendError(client.socket, "Введите пароль комнаты");
    return;
  }

  const room = {
    id: randomUUID(),
    name,
    password,
    status: "lobby",
    hostPlayerId: client.playerId,
    seats: createEmptySeats(),
    createdAt: Date.now(),
    startedAt: null,
    gameExpirationTimer: null,
  };

  rooms.set(room.id, room);
  client.roomId = room.id;
  client.seatIndex = null;

  send(client.socket, "room:update", { room: getPublicRoom(room) });
  broadcastRooms();
}

function joinRoom(client, payload = {}) {
  if (!client.playerId) {
    sendError(client.socket, "Игрок еще не подключен");
    return;
  }

  const roomId = String(payload.roomId || "");
  const room = rooms.get(roomId);

  if (!room) {
    sendError(client.socket, "Комната не найдена");
    broadcastRooms();
    return;
  }

  const isKnownPlayer = room.hostPlayerId === client.playerId || findSeatIndexByPlayerId(room, client.playerId) !== null;

  if (room.status === "game" && !isKnownPlayer) {
    sendError(client.socket, "Игра уже идет");
    return;
  }

  if (!isKnownPlayer && room.password !== normalizePassword(payload.password)) {
    sendError(client.socket, "Неверный пароль");
    return;
  }

  client.roomId = room.id;
  client.seatIndex = findSeatIndexByPlayerId(room, client.playerId);
  clearEmptyRoomTimer(room.id);

  send(client.socket, "room:update", { room: getPublicRoom(room) });
}

function takeSeat(client, payload = {}) {
  const room = getClientRoom(client);

  if (!room) {
    sendError(client.socket, "Сначала войдите в комнату");
    return;
  }

  if (room.status !== "lobby") {
    sendError(client.socket, "Игра уже началась");
    return;
  }

  const seatIndex = Number(payload.seatIndex);
  const name = normalizeName(payload.name);
  const seat = room.seats[seatIndex];

  if (!seat || !name) {
    sendError(client.socket, "Некорректное место или имя");
    return;
  }

  if (seat.player && seat.player.playerId !== client.playerId) {
    sendError(client.socket, "Место уже занято");
    return;
  }

  leaveSeat(room.id, client.playerId, { resetEmptyRoom: false });

  seat.player = {
    playerId: client.playerId,
    name,
    health: DEFAULT_HEALTH,
    maxHealth: DEFAULT_HEALTH,
    bulletSkinIndex: getRandomBulletSkinIndex(),
    connected: true,
  };
  client.seatIndex = seatIndex;

  clearEmptyRoomTimer(room.id);
  broadcastRoom(room.id);
  broadcastRooms();
}

function startGame(client) {
  const room = getClientRoom(client);

  if (!room) {
    sendError(client.socket, "Сначала войдите в комнату");
    return;
  }

  if (client.playerId !== room.hostPlayerId) {
    sendError(client.socket, "Начать игру может только создатель комнаты");
    return;
  }

  if (findSeatIndexByPlayerId(room, client.playerId) === null) {
    sendError(client.socket, "Сначала займите место за столом");
    return;
  }

  if (getSeatedPlayersCount(room) < 2) {
    sendError(client.socket, "Нужно минимум два игрока за столом");
    return;
  }

  room.status = "game";
  room.startedAt = Date.now();
  scheduleGameExpiration(room);
  broadcastRoom(room.id);
  broadcastRooms();
}

function leaveSeat(roomId, playerId, options = {}) {
  if (!roomId || !playerId) return;

  const room = rooms.get(roomId);

  if (!room) return;

  const { resetEmptyRoom = true } = options;
  const seatIndex = findSeatIndexByPlayerId(room, playerId);

  if (seatIndex === null) return;

  const seat = room.seats[seatIndex];

  if (seat?.player?.playerId === playerId) {
    seat.player = null;
  }

  clearDisconnectTimer(playerId);
  updateConnectedClientsSeat(room.id, playerId, null);

  if (resetEmptyRoom && getSeatedPlayersCount(room) === 0) {
    if (room.status === "game") {
      deleteRoom(room.id);
      return;
    }

    maybeScheduleEmptyRoomCleanup(room.id);
  }
}

function markPlayerDisconnected(playerId) {
  const room = findRoomByPlayerId(playerId);

  if (!room) return;

  const seatIndex = findSeatIndexByPlayerId(room, playerId);

  if (seatIndex === null) return;

  room.seats[seatIndex].player.connected = false;
  updateConnectedClientsSeat(room.id, playerId, null);
  clearDisconnectTimer(playerId);

  const timer = setTimeout(() => {
    disconnectTimers.delete(playerId);
    leaveSeat(room.id, playerId);
    broadcastRoom(room.id);
    broadcastRooms();
  }, PLAYER_DISCONNECT_GRACE_MS);

  disconnectTimers.set(playerId, timer);
  broadcastRoom(room.id);
}

function deleteRoom(roomId) {
  const room = rooms.get(roomId);

  if (!room) return;

  clearGameExpiration(room);
  clearEmptyRoomTimer(room.id);

  room.seats.forEach((seat) => {
    if (seat.player) {
      clearDisconnectTimer(seat.player.playerId);
    }
  });

  rooms.delete(room.id);

  clients.forEach((client) => {
    if (client.roomId === room.id) {
      client.roomId = null;
      client.seatIndex = null;
      send(client.socket, "room:closed", { roomId: room.id });
    }
  });

  broadcastRooms();
}

function getClientRoom(client) {
  return client.roomId ? rooms.get(client.roomId) : null;
}

function getPublicRoom(room) {
  return {
    id: room.id,
    name: room.name,
    status: room.status,
    hostPlayerId: room.hostPlayerId,
    seats: room.seats,
  };
}

function getPublicRooms() {
  return Array.from(rooms.values()).map((room) => ({
    id: room.id,
    name: room.name,
    status: room.status,
    playersCount: getSeatedPlayersCount(room),
  }));
}

function getSeatedPlayersCount(room) {
  return room.seats.filter((seat) => seat.player).length;
}

function findRoomByPlayerId(playerId) {
  return Array.from(rooms.values()).find((room) => findSeatIndexByPlayerId(room, playerId) !== null) || null;
}

function findHostedRoomByPlayerId(playerId) {
  return Array.from(rooms.values()).find((room) => room.hostPlayerId === playerId) || null;
}

function findSeatIndexByPlayerId(room, playerId) {
  const seat = room.seats.find((candidate) => candidate.player?.playerId === playerId);

  return seat ? seat.index : null;
}

function createEmptySeats() {
  return Array.from({ length: SEAT_COUNT }, (_, index) => ({
    index,
    player: null,
  }));
}

function scheduleGameExpiration(room) {
  clearGameExpiration(room);

  room.gameExpirationTimer = setTimeout(() => {
    deleteRoom(room.id);
  }, GAME_TTL_MS);
}

function clearGameExpiration(room) {
  if (!room.gameExpirationTimer) return;

  clearTimeout(room.gameExpirationTimer);
  room.gameExpirationTimer = null;
}

function maybeScheduleEmptyRoomCleanup(roomId) {
  const room = rooms.get(roomId);

  if (!room || room.status === "game") return;
  if (getSeatedPlayersCount(room) > 0) return;
  if (hasConnectedClientInRoom(roomId)) return;

  clearEmptyRoomTimer(roomId);

  const timer = setTimeout(() => {
    emptyRoomTimers.delete(roomId);

    const currentRoom = rooms.get(roomId);

    if (!currentRoom) return;
    if (currentRoom.status !== "game" && getSeatedPlayersCount(currentRoom) === 0 && !hasConnectedClientInRoom(roomId)) {
      deleteRoom(roomId);
    }
  }, EMPTY_ROOM_GRACE_MS);

  emptyRoomTimers.set(roomId, timer);
}

function clearEmptyRoomTimer(roomId) {
  const timer = emptyRoomTimers.get(roomId);

  if (!timer) return;

  clearTimeout(timer);
  emptyRoomTimers.delete(roomId);
}

function clearDisconnectTimer(playerId) {
  const timer = disconnectTimers.get(playerId);

  if (!timer) return;

  clearTimeout(timer);
  disconnectTimers.delete(playerId);
}

function updateConnectedClientsSeat(roomId, playerId, seatIndex) {
  clients.forEach((client) => {
    if (client.roomId === roomId && client.playerId === playerId) {
      client.seatIndex = seatIndex;
    }
  });
}

function hasConnectedClient(playerId) {
  return Array.from(clients.values()).some((client) => client.playerId === playerId);
}

function hasConnectedClientInRoom(roomId) {
  return Array.from(clients.values()).some((client) => client.roomId === roomId);
}

function broadcastRoom(roomId) {
  const room = roomId ? rooms.get(roomId) : null;

  if (!room) return;

  const payload = { room: getPublicRoom(room) };

  clients.forEach((client) => {
    if (client.roomId === roomId) {
      send(client.socket, "room:update", payload);
    }
  });
}

function broadcastRooms() {
  const payload = { rooms: getPublicRooms() };

  clients.forEach((client) => {
    send(client.socket, "rooms:update", payload);
  });
}

function send(socket, type, payload) {
  if (socket.readyState !== socket.OPEN) return;

  socket.send(JSON.stringify({ type, payload }));
}

function sendError(socket, message) {
  send(socket, "error", { message });
}

function parseMessage(rawMessage) {
  try {
    return JSON.parse(rawMessage.toString());
  } catch {
    return null;
  }
}

function normalizeName(value) {
  return String(value || "").trim().slice(0, 20);
}

function normalizeRoomName(value) {
  return String(value || "").trim().slice(0, MAX_ROOM_NAME_LENGTH);
}

function normalizePassword(value) {
  return String(value || "").trim().slice(0, MAX_PASSWORD_LENGTH);
}

function normalizePlayerId(value) {
  const playerId = String(value || "").trim();

  return /^[a-zA-Z0-9-]{12,80}$/.test(playerId) ? playerId : "";
}

function getRandomBulletSkinIndex() {
  return Math.floor(Math.random() * BULLET_SKIN_COUNT);
}

function canCreateRoom(ip) {
  const now = Date.now();
  const attempts = (roomCreateAttempts.get(ip) || []).filter((timestamp) => now - timestamp < ROOM_CREATE_WINDOW_MS);

  if (attempts.length >= MAX_ROOM_CREATES_PER_WINDOW) {
    roomCreateAttempts.set(ip, attempts);
    return false;
  }

  attempts.push(now);
  roomCreateAttempts.set(ip, attempts);

  return true;
}

function getClientIp(request) {
  const forwardedFor = request.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string") {
    return forwardedFor.split(",")[0].trim();
  }

  return request.socket.remoteAddress || "unknown";
}

console.log(`Bang WebSocket server is running on ws://localhost:${PORT}`);
