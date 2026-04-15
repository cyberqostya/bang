import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 3001);
const SEAT_COUNT = 8;

const room = {
  id: "main",
  name: "Салун",
  status: "lobby",
  hostClientId: null,
  seats: Array.from({ length: SEAT_COUNT }, (_, index) => ({
    index,
    player: null,
  })),
};

const clients = new Map();
const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (socket) => {
  const client = {
    id: randomUUID(),
    socket,
    seatIndex: null,
  };

  clients.set(socket, client);
  send(socket, "client:init", { clientId: client.id, room: getPublicRoom() });

  socket.on("message", (rawMessage) => {
    const message = parseMessage(rawMessage);

    if (!message) return;

    handleMessage(client, message);
  });

  socket.on("close", () => {
    leaveSeat(client);
    clients.delete(socket);
    broadcastRoom();
  });
});

function handleMessage(client, message) {
  if (message.type === "room:take-seat") {
    takeSeat(client, message.payload);
    return;
  }

  if (message.type === "room:leave-seat") {
    leaveSeat(client);
    broadcastRoom();
    return;
  }

  if (message.type === "room:start-game") {
    startGame(client);
  }
}

function takeSeat(client, payload = {}) {
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

  if (seat.player && seat.player.clientId !== client.id) {
    sendError(client.socket, "Место уже занято");
    return;
  }

  leaveSeat(client);

  seat.player = {
    clientId: client.id,
    name,
    health: 4,
  };
  client.seatIndex = seatIndex;

  if (!room.hostClientId) {
    room.hostClientId = client.id;
  }

  broadcastRoom();
}

function startGame(client) {
  if (client.id !== room.hostClientId) {
    sendError(client.socket, "Начать игру может только первый игрок");
    return;
  }

  if (getSeatedPlayersCount() < 2) {
    sendError(client.socket, "Нужно минимум два игрока за столом");
    return;
  }

  room.status = "game";
  broadcastRoom();
}

function leaveSeat(client) {
  if (client.seatIndex === null) return;

  const seat = room.seats[client.seatIndex];

  if (seat?.player?.clientId === client.id) {
    seat.player = null;
  }

  client.seatIndex = null;

  if (room.hostClientId === client.id) {
    room.hostClientId = room.seats.find((candidate) => candidate.player)?.player.clientId || null;
  }
}

function getPublicRoom() {
  return {
    id: room.id,
    name: room.name,
    status: room.status,
    hostClientId: room.hostClientId,
    seats: room.seats,
  };
}

function getSeatedPlayersCount() {
  return room.seats.filter((seat) => seat.player).length;
}

function broadcastRoom() {
  const payload = { room: getPublicRoom() };

  clients.forEach((client) => {
    send(client.socket, "room:update", payload);
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

console.log(`Bang WebSocket server is running on ws://localhost:${PORT}`);
