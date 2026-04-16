import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import {
  getClientIp,
  normalizeName,
  normalizePassword,
  normalizePlayerId,
  normalizeRoomName,
  parseMessage,
} from "./utils.js";
import { cardConfig, createTestDeck } from "./cards.js";
import { getRolesForPlayerCount, roleConfig } from "./roles.js";

export function startGameServer() {
  const rooms = new Map();
  const clients = new Map();
  const disconnectTimers = new Map();
  const emptyRoomTimers = new Map();
  const roomCreateAttempts = new Map();
  const wss = new WebSocketServer({ port: config.port });

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
      const closedRoomId = client.roomId;

      clients.delete(socket);

      if (closedRoomId) {
        maybeScheduleEmptyRoomCleanup(closedRoomId);
        broadcastRoomList();
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

    if (message.type === "room:leave-room") {
      leaveRoom(client);
      return;
    }

    if (message.type === "room:close") {
      closeRoom(client);
      return;
    }

    if (message.type === "room:take-seat") {
      takeSeat(client, message.payload);
      return;
    }

    if (message.type === "room:leave-seat") {
      leaveSeat(client.roomId, client.playerId);
      broadcastRoom(client.roomId);
      broadcastRoomList();
      return;
    }

    if (message.type === "room:start-game") {
      startGame(client);
      return;
    }

    if (message.type === "game:action") {
      applyGameAction(client, message.payload);
      return;
    }

    if (message.type === "game:finish-room") {
      finishRoom(client);
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
      room: playerRoom ? getPublicRoom(playerRoom, playerId) : null,
    });

    if (playerRoom) {
      broadcastRoom(playerRoom.id);
      broadcastRoomList();
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

    if (rooms.size >= config.maxActiveRooms) {
      sendError(client.socket, "Слишком много активных комнат");
      return;
    }

    if (!canCreateRoom(client.ip)) {
      sendError(client.socket, "Слишком много комнат, попробуйте позже");
      return;
    }

    const name = normalizeRoomName(payload.name, config.maxRoomNameLength);
    const password = normalizePassword(payload.password, config.maxPasswordLength);

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
      game: createEmptyGameState(),
      createdAt: Date.now(),
      startedAt: null,
      gameExpirationTimer: null,
    };

    rooms.set(room.id, room);
    client.roomId = room.id;
    client.seatIndex = null;

    send(client.socket, "room:update", { room: getPublicRoom(room, client.playerId) });
    broadcastRoomList();
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
      broadcastRoomList();
      return;
    }

    const isKnownPlayer = room.hostPlayerId === client.playerId || findSeatIndexByPlayerId(room, client.playerId) !== null;

    if (room.status === "game" && !isKnownPlayer) {
      sendError(client.socket, "Игра уже идет");
      return;
    }

    if (!isKnownPlayer && room.password !== normalizePassword(payload.password, config.maxPasswordLength)) {
      sendError(client.socket, "Неверный пароль");
      return;
    }

    client.roomId = room.id;
    client.seatIndex = findSeatIndexByPlayerId(room, client.playerId);
    clearEmptyRoomTimer(room.id);

    send(client.socket, "room:update", { room: getPublicRoom(room, client.playerId) });
    broadcastRoomList();
  }

  function leaveRoom(client) {
    const roomId = client.roomId;

    if (!roomId) {
      send(client.socket, "room:left", { rooms: getPublicRooms() });
      return;
    }

    const room = rooms.get(roomId);

    if (!room) {
      client.roomId = null;
      client.seatIndex = null;
      send(client.socket, "room:left", { rooms: getPublicRooms() });
      return;
    }

    const wasSeated = findSeatIndexByPlayerId(room, client.playerId) !== null;

    if (room.status === "game" && wasSeated) {
      leaveGame(room, client.playerId);
      client.roomId = null;
      client.seatIndex = null;

      send(client.socket, "room:left", { rooms: getPublicRooms() });

      if (rooms.has(roomId)) {
        broadcastRoom(roomId);
        broadcastRoomList();
      }

      return;
    }

    leaveSeat(room.id, client.playerId, { resetEmptyRoom: true });
    client.roomId = null;
    client.seatIndex = null;

    send(client.socket, "room:left", { rooms: getPublicRooms() });

    if (rooms.has(roomId)) {
      broadcastRoom(roomId);
      broadcastRoomList();
    }
  }

  function closeRoom(client) {
    const room = getClientRoom(client);

    if (!room) {
      sendError(client.socket, "Сначала войдите в комнату");
      return;
    }

    if (client.playerId !== room.hostPlayerId) {
      sendError(client.socket, "Закрыть комнату может только создатель");
      return;
    }

    deleteRoom(room.id);
  }

  function finishRoom(client) {
    const room = getClientRoom(client);

    if (!room) {
      sendError(client.socket, "Сначала войдите в комнату");
      return;
    }

    if (room.status !== "finished") {
      sendError(client.socket, "Игра еще не завершена");
      return;
    }

    if (findSeatIndexByPlayerId(room, client.playerId) === null && client.playerId !== room.hostPlayerId) {
      sendError(client.socket, "Завершить комнату может участник игры");
      return;
    }

    deleteRoom(room.id);
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
      health: config.defaultHealth,
      maxHealth: config.defaultHealth,
      bulletSkinIndex: getRandomBulletSkinIndex(),
      bulletSkinKey: "default",
      roleId: null,
      isRoleRevealed: false,
      isAlive: true,
      connected: true,
      leftGame: false,
      hand: [],
      messages: [],
    };
    client.seatIndex = seatIndex;

    clearEmptyRoomTimer(room.id);
    broadcastRoom(room.id);
    broadcastRoomList();
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

    assignRoles(room);
    room.status = "game";
    room.startedAt = Date.now();
    startTurn(room, room.game.turnPlayerId);
    scheduleGameExpiration(room);
    broadcastRoom(room.id);
    broadcastRoomList();
  }

  function applyGameAction(client, payload = {}) {
    const room = getClientRoom(client);

    if (!room) {
      sendError(client.socket, "Сначала войдите в комнату");
      return;
    }

    if (room.status !== "game") {
      sendError(client.socket, "Игра еще не началась");
      return;
    }

    const actorSeatIndex = findSeatIndexByPlayerId(room, client.playerId);

    if (actorSeatIndex === null) {
      sendError(client.socket, "Сначала займите место за столом");
      return;
    }

    if (!room.seats[actorSeatIndex].player.isAlive) {
      sendError(client.socket, "Вы уже вне игры");
      return;
    }

    if (payload.action === "endTurn") {
      endTurn(client, room);
      return;
    }

    if (room.game.turnPlayerId !== client.playerId) {
      sendError(client.socket, "Сейчас не ваш ход");
      return;
    }

    if (payload.action === "discardCard") {
      discardCardFromHand(client, room, payload);
      return;
    }

    if (payload.action === "bang") {
      playCardAction(client, room, payload);
      return;
    }

    sendError(client.socket, "Неизвестное действие");
  }

  function endTurn(client, room) {
    if (room.game.winner) {
      sendError(client.socket, "Игра уже завершена");
      return;
    }

    if (room.game.turnPlayerId !== client.playerId) {
      sendError(client.socket, "Завершить можно только свой ход");
      return;
    }

    const actor = room.seats.find((seat) => seat.player?.playerId === client.playerId)?.player;

    if (!actor) {
      sendError(client.socket, "Игрок не найден");
      return;
    }

    if (actor.hand.length > actor.health) {
      sendError(client.socket, `Сбросьте лишние карты до ${actor.health}`);
      return;
    }

    completeTurn(room, client.playerId);
    broadcastRoom(room.id);
  }

  function completeTurn(room, playerId) {
    const nextPlayerId = getNextTurnPlayerId(room, playerId);

    if (!nextPlayerId) {
      return false;
    }

    startTurn(room, nextPlayerId);
    addGameEvent(room, "Ход передан следующему игроку.");
    return true;
  }

  function discardCardFromHand(client, room, payload = {}) {
    const actor = room.seats.find((seat) => seat.player?.playerId === client.playerId)?.player;
    const cardIndex = actor?.hand.findIndex((card) => card.instanceId === payload.cardInstanceId) ?? -1;

    if (!actor || cardIndex === -1) {
      sendError(client.socket, "Карты нет на руке");
      return;
    }

    if (actor.hand.length <= actor.health) {
      sendError(client.socket, "Лишних карт нет");
      return;
    }

    const [discardedCard] = actor.hand.splice(cardIndex, 1);

    room.game.discard.push(discardedCard);

    if (actor.hand.length <= actor.health) {
      completeTurn(room, client.playerId);
    }

    broadcastRoom(room.id);
  }

  function playCardAction(client, room, payload = {}) {
    const actor = room.seats.find((seat) => seat.player?.playerId === client.playerId)?.player;
    const cardIndex = actor?.hand.findIndex((card) => card.instanceId === payload.cardInstanceId) ?? -1;

    if (!actor || cardIndex === -1) {
      sendError(client.socket, "Карты нет на руке");
      return;
    }

    const card = actor.hand[cardIndex];
    const configForCard = cardConfig[card.cardId];

    if (!configForCard || configForCard.action !== payload.action) {
      sendError(client.socket, "Некорректная карта");
      return;
    }

    if (configForCard.effectLimitKey && room.game.turnPlayedEffects[client.playerId]?.[configForCard.effectLimitKey]) {
      sendError(client.socket, "Эту карту уже играли в этот ход");
      return;
    }

    if (payload.action === "bang") {
      const result = applyBangAction(client, room, payload);

      if (!result) return;

      addPlayerMessage(result.targetPlayer, {
        type: "target-card",
        actorName: actor.name,
        cardTitle: configForCard.title,
        text: formatTargetMessage(configForCard, actor),
      });
    }

    if (configForCard.effectLimitKey) {
      room.game.turnPlayedEffects[client.playerId] = {
        ...room.game.turnPlayedEffects[client.playerId],
        [configForCard.effectLimitKey]: true,
      };
    }

    if (configForCard.disposable) {
      const [discardedCard] = actor.hand.splice(cardIndex, 1);
      room.game.discard.push(discardedCard);
    }

    broadcastRoom(room.id);
  }

  function applyBangAction(client, room, payload = {}) {
    const targetPlayerId = normalizePlayerId(payload.targetPlayerId);

    if (!targetPlayerId || targetPlayerId === client.playerId) {
      sendError(client.socket, "Некорректная цель");
      return false;
    }

    const targetSeatIndex = findSeatIndexByPlayerId(room, targetPlayerId);

    if (targetSeatIndex === null) {
      sendError(client.socket, "Игрок не найден");
      return false;
    }

    const targetPlayer = room.seats[targetSeatIndex].player;

    if (!targetPlayer.isAlive) {
      sendError(client.socket, "Игрок уже выбыл");
      return false;
    }

    targetPlayer.health = Math.max(0, targetPlayer.health - 1);
    revealDeadPlayer(room, targetPlayer);
    checkVictory(room);
    return { targetPlayer };
  }

  function leaveGame(room, playerId) {
    const seatIndex = findSeatIndexByPlayerId(room, playerId);

    if (seatIndex === null) return;

    const player = room.seats[seatIndex].player;

    player.leftGame = true;
    player.connected = false;
    player.health = 0;
    player.isAlive = false;
    player.isRoleRevealed = true;

    if (player.hand.length > 0) {
      room.game.discard.push(...player.hand);
      player.hand = [];
    }

    clearDisconnectTimer(playerId);
    updateConnectedClientsSeat(room.id, playerId, null);
    addGameEvent(room, `${player.name} покинул игру. Роль раскрыта.`);
    checkVictory(room);

    if (room.status === "game" && !room.game.winner && room.game.turnPlayerId === playerId) {
      completeTurn(room, playerId);
    }
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
      broadcastRoomList();
    }, config.playerDisconnectGraceMs);

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

    broadcastRoomList();
  }

  function getClientRoom(client) {
    return client.roomId ? rooms.get(client.roomId) : null;
  }

  function getPublicRoom(room, viewerPlayerId) {
    return {
      id: room.id,
      name: room.name,
      status: room.status,
      hostPlayerId: room.hostPlayerId,
      game: getPublicGame(room),
      seats: room.seats.map((seat) => ({
        index: seat.index,
        player: seat.player ? getPublicPlayer(room, seat.player, viewerPlayerId) : null,
      })),
    };
  }

  function getPublicGame(room) {
    return {
      turnPlayerId: room.game.turnPlayerId,
      winner: room.game.winner,
      winnerText: room.game.winnerText,
      events: room.game.events,
      deckCount: room.game.deck.length,
      discardCount: room.game.discard.length,
    };
  }

  function getPublicPlayer(room, player, viewerPlayerId) {
    const role = player.roleId ? roleConfig[player.roleId] : null;
    const canSeeRole = Boolean(role && (player.playerId === viewerPlayerId || role.isPublic || player.isRoleRevealed));

    return {
      playerId: player.playerId,
      name: player.name,
      health: player.health,
      maxHealth: player.maxHealth,
      bulletSkinIndex: player.bulletSkinIndex,
      bulletSkinKey: player.bulletSkinKey,
      connected: player.connected,
      leftGame: player.leftGame,
      isAlive: player.isAlive,
      isRoleRevealed: player.isRoleRevealed,
      handCount: player.hand?.length || 0,
      hand: player.playerId === viewerPlayerId ? getPublicHand(room, player) : [],
      messages: player.playerId === viewerPlayerId ? player.messages || [] : [],
      role: canSeeRole ? {
        id: role.id,
        label: role.label,
        team: role.team,
      } : null,
    };
  }

  function getPublicHand(room, player) {
    return (player.hand || []).map((card) => {
      const configForCard = cardConfig[card.cardId];

      return {
        ...card,
        title: configForCard.title,
        image: configForCard.image,
        action: configForCard.action,
        needsTarget: configForCard.needsTarget,
        disposable: configForCard.disposable,
        effectLimitKey: configForCard.effectLimitKey,
        suit: configForCard.suit,
        rank: configForCard.rank,
        targetMessage: configForCard.targetMessage,
        isPlayable: isCardPlayable(room, player, configForCard),
      };
    });
  }

  function isCardPlayable(room, player, configForCard) {
    if (room.status !== "game") return false;
    if (!player.isAlive || room.game.turnPlayerId !== player.playerId) return false;
    if (!configForCard.effectLimitKey) return true;

    return !room.game.turnPlayedEffects[player.playerId]?.[configForCard.effectLimitKey];
  }

  function getPublicRooms() {
    return Array.from(rooms.values()).map((room) => ({
      id: room.id,
      name: room.name,
      status: room.status,
      playersCount: getRoomPlayersCount(room),
      maxPlayers: room.seats.length,
    }));
  }

  function getRoomPlayersCount(room) {
    const playerIds = new Set();

    clients.forEach((client) => {
      if (client.roomId === room.id && client.playerId) {
        playerIds.add(client.playerId);
      }
    });

    room.seats.forEach((seat) => {
      if (seat.player && !seat.player.leftGame) {
        playerIds.add(seat.player.playerId);
      }
    });

    return playerIds.size;
  }

  function getSeatedPlayersCount(room) {
    return room.seats.filter((seat) => seat.player).length;
  }

  function findRoomByPlayerId(playerId) {
    return Array.from(rooms.values()).find((room) => findSeatIndexByPlayerId(room, playerId) !== null) || null;
  }

  function findHostedRoomByPlayerId(playerId) {
    return Array.from(rooms.values()).find((room) => room.status === "lobby" && room.hostPlayerId === playerId) || null;
  }

  function findSeatIndexByPlayerId(room, playerId) {
    const seat = room.seats.find((candidate) => candidate.player?.playerId === playerId && !candidate.player.leftGame);

    return seat ? seat.index : null;
  }

  function createEmptySeats() {
    return Array.from({ length: config.seatCount }, (_, index) => ({
      index,
      player: null,
    }));
  }

  function createEmptyGameState() {
    return {
      turnPlayerId: null,
      winner: null,
      winnerText: "",
      events: [],
      deck: [],
      discard: [],
      turnPlayedEffects: {},
    };
  }

  function assignRoles(room) {
    const players = room.seats
      .filter((seat) => seat.player)
      .map((seat) => seat.player);
    const roles = shuffle(getRolesForPlayerCount(players.length));

    players.forEach((player, index) => {
      player.roleId = roles[index];
      player.isRoleRevealed = player.roleId === "sheriff";
      player.isAlive = true;
      player.leftGame = false;
      player.connected = true;
      player.health = config.defaultHealth;
      player.maxHealth = config.defaultHealth;
      player.hand = [];
      player.messages = [];

      if (player.roleId === "sheriff") {
        player.maxHealth += 1;
        player.health += 1;
        player.bulletSkinKey = "sheriff";
        room.game.turnPlayerId = player.playerId;
      } else {
        player.bulletSkinKey = "default";
      }
    });

    room.game.winner = null;
    room.game.winnerText = "";
    room.game.events = [];
    room.game.deck = shuffle(createTestDeck());
    room.game.discard = [];
    room.game.turnPlayedEffects = {};
    dealInitialHands(room);
    addGameEvent(room, "Роли розданы. Шериф ходит первым.");
  }

  function dealInitialHands(room) {
    room.seats.forEach((seat) => {
      if (seat.player) {
        drawCards(room, seat.player.playerId, seat.player.health);
      }
    });
  }

  function startTurn(room, playerId) {
    if (!playerId) return;

    room.game.turnPlayerId = playerId;
    room.game.turnPlayedEffects[playerId] = {};
    drawCards(room, playerId, 2);
  }

  function drawCards(room, playerId, count) {
    const player = room.seats.find((seat) => seat.player?.playerId === playerId)?.player;
    const drawnCards = [];

    if (!player) return;

    for (let index = 0; index < count; index += 1) {
      refillDeckIfNeeded(room);

      const card = room.game.deck.shift();

      if (!card) return;

      drawnCards.push(card);
    }

    player.hand = [
      ...drawnCards,
      ...player.hand,
    ];
  }

  function refillDeckIfNeeded(room) {
    if (room.game.deck.length >= 7 || room.game.discard.length === 0) return;

    room.game.deck = [
      ...room.game.deck,
      ...shuffle(room.game.discard),
    ];
    room.game.discard = [];
    addGameEvent(room, "Сброс перемешан и ушел под колоду.");
  }

  function addPlayerMessage(player, message) {
    player.messages = [
      {
        id: randomUUID(),
        createdAt: Date.now(),
        ...message,
      },
      ...(player.messages || []),
    ].slice(0, 5);
  }

  function formatTargetMessage(configForCard, actor) {
    return (configForCard.targetMessage || "")
      .replace("{actor}", actor.name)
      .replace("{card}", configForCard.title);
  }

  function revealDeadPlayer(room, player) {
    if (player.health > 0 || !player.isAlive) return;

    player.isAlive = false;
    player.isRoleRevealed = true;

    const role = roleConfig[player.roleId];

    addGameEvent(room, `${player.name} выбыл. Роль: ${role?.label || "неизвестно"}.`);

    if (player.roleId === "outlaw") {
      addGameEvent(room, `За убийство бандита положен бонус: ${player.name}.`);
    }
  }

  function checkVictory(room) {
    const alivePlayers = getAlivePlayers(room);
    const sheriff = room.seats.find((seat) => seat.player?.roleId === "sheriff")?.player || null;

    if (room.game.winner || !sheriff) return;

    if (!sheriff.isAlive) {
      finishGame(room, "outlaws", "Бандиты победили: шериф убит.");
      return;
    }

    if (alivePlayers.length === 1 && alivePlayers[0].roleId === "renegade") {
      finishGame(room, "renegade", "Ренегат победил: он остался единственным выжившим.");
      return;
    }

    const hasEnemyOfSheriff = alivePlayers.some((player) => player.roleId === "outlaw" || player.roleId === "renegade");

    if (!hasEnemyOfSheriff) {
      finishGame(room, "law", "Шериф и помощники победили: все бандиты и ренегаты убиты.");
    }
  }

  function finishGame(room, winner, winnerText) {
    room.status = "finished";
    room.game.winner = winner;
    room.game.winnerText = winnerText;
    room.seats.forEach((seat) => {
      if (seat.player) {
        seat.player.isRoleRevealed = true;
      }
    });
    addGameEvent(room, winnerText);
  }

  function getAlivePlayers(room) {
    return room.seats
      .filter((seat) => seat.player?.isAlive)
      .map((seat) => seat.player);
  }

  function getNextTurnPlayerId(room, currentPlayerId) {
    const currentSeatIndex = findSeatIndexByPlayerId(room, currentPlayerId);

    if (currentSeatIndex === null) return null;

    for (let offset = 1; offset <= room.seats.length; offset += 1) {
      const nextSeatIndex = (currentSeatIndex + offset) % room.seats.length;
      const nextPlayer = room.seats[nextSeatIndex].player;

      if (nextPlayer?.isAlive) {
        return nextPlayer.playerId;
      }
    }

    return null;
  }

  function addGameEvent(room, text) {
    room.game.events = [
      ...room.game.events.slice(-4),
      {
        id: randomUUID(),
        text,
      },
    ];
  }

  function shuffle(items) {
    return [...items].sort(() => Math.random() - 0.5);
  }

  function scheduleGameExpiration(room) {
    clearGameExpiration(room);

    room.gameExpirationTimer = setTimeout(() => {
      deleteRoom(room.id);
    }, config.gameTtlMs);
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
    }, config.emptyRoomGraceMs);

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

    clients.forEach((client) => {
      if (client.roomId === roomId) {
        send(client.socket, "room:update", { room: getPublicRoom(room, client.playerId) });
      }
    });
  }

  function broadcastRoomList() {
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

  function canCreateRoom(ip) {
    const now = Date.now();
    const attempts = (roomCreateAttempts.get(ip) || []).filter((timestamp) => now - timestamp < config.roomCreateWindowMs);

    if (attempts.length >= config.maxRoomCreatesPerWindow) {
      roomCreateAttempts.set(ip, attempts);
      return false;
    }

    attempts.push(now);
    roomCreateAttempts.set(ip, attempts);

    return true;
  }

  function getRandomBulletSkinIndex() {
    return Math.floor(Math.random() * config.bulletSkinCount);
  }

  console.log(`Bang WebSocket server is running on ws://localhost:${config.port}`);
}
