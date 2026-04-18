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
import { cardConfig, createDeck } from "./cards.js";
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
    const seatedRoom = findRoomByPlayerId(playerId);
    const playerRoom = seatedRoom || findHostedRoomByPlayerId(playerId);

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

    if (
      playerRoom?.status === "game" &&
      getRoomPlayersCount(playerRoom) === 0
    ) {
      deleteRoom(playerRoom.id);
    }

    send(client.socket, "client:init", {
      playerId,
      rooms: getPublicRooms(),
      room:
        playerRoom && rooms.has(playerRoom.id)
          ? getPublicRoom(playerRoom, playerId)
          : null,
    });

    if (playerRoom && rooms.has(playerRoom.id)) {
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
    const password = normalizePassword(
      payload.password,
      config.maxPasswordLength,
    );

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
      finishedRoomTimer: null,
    };

    rooms.set(room.id, room);
    client.roomId = room.id;
    client.seatIndex = null;

    send(client.socket, "room:update", {
      room: getPublicRoom(room, client.playerId),
    });
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

    if (room.status === "game" && getRoomPlayersCount(room) === 0) {
      deleteRoom(room.id);
      sendError(client.socket, "Комната закрыта");
      return;
    }

    const isSeatedKnownPlayer =
      findSeatIndexByPlayerId(room, client.playerId) !== null;
    const isKnownPlayer =
      isSeatedKnownPlayer ||
      (room.status === "lobby" && room.hostPlayerId === client.playerId);

    if (room.status !== "lobby" && !isKnownPlayer) {
      sendError(client.socket, "Игра уже идет");
      return;
    }

    if (!isKnownPlayer && getRoomPlayersCount(room) >= room.seats.length) {
      sendError(client.socket, "Комната заполнена");
      broadcastRoomList();
      return;
    }

    if (
      !isKnownPlayer &&
      room.password !==
        normalizePassword(payload.password, config.maxPasswordLength)
    ) {
      sendError(client.socket, "Неверный пароль");
      return;
    }

    client.roomId = room.id;
    client.seatIndex = findSeatIndexByPlayerId(room, client.playerId);
    clearEmptyRoomTimer(room.id);

    send(client.socket, "room:update", {
      room: getPublicRoom(room, client.playerId),
    });
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

    const player = wasSeated
      ? room.seats[findSeatIndexByPlayerId(room, client.playerId)]?.player
      : null;

    if (room.status === "game" && wasSeated && player?.isAlive) {
      leaveGame(room, client.playerId);
      maybeScheduleEmptyRoomCleanup(room.id);
      client.roomId = null;
      client.seatIndex = null;

      send(client.socket, "room:left", { rooms: getPublicRooms() });

      if (rooms.has(roomId)) {
        broadcastRoom(roomId);
        broadcastRoomList();
      }

      return;
    }

    if (room.status === "game" && wasSeated && !player?.isAlive) {
      player.leftGame = true;
      player.connected = false;
      clearDisconnectTimer(client.playerId);
      updateConnectedClientsSeat(room.id, client.playerId, null);
      maybeScheduleEmptyRoomCleanup(room.id);
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

    if (
      findSeatIndexByPlayerId(room, client.playerId) === null &&
      client.playerId !== room.hostPlayerId
    ) {
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
    const name = normalizeName(payload.name, config.maxPlayerNameLength);
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

    seat.player = createPlayer(client.playerId, name);
    client.seatIndex = seatIndex;

    clearEmptyRoomTimer(room.id);
    broadcastRoom(room.id);
    broadcastRoomList();
  }

  function createPlayer(playerId, name) {
    return {
      playerId,
      name,
      health: config.defaultHealth,
      maxHealth: config.defaultHealth,
      attackRange: config.defaultAttackRange,
      bulletSkinIndex: getRandomBulletSkinIndex(),
      bulletSkinKey: "default",
      hatSkinKey: null,
      roleId: null,
      isRoleRevealed: false,
      isAlive: true,
      connected: true,
      leftGame: false,
      hand: [],
      weapon: null,
    };
  }

  function seatWaitingPlayers(room) {
    const waitingPlayerIds = getJoinedPlayerIds(room).filter(
      (playerId) => findSeatIndexByPlayerId(room, playerId) === null,
    );
    const freeSeatIndexes = shuffle(
      room.seats.filter((seat) => !seat.player).map((seat) => seat.index),
    );

    waitingPlayerIds.forEach((playerId, index) => {
      const seatIndex = freeSeatIndexes[index];

      if (seatIndex === undefined) return;

      const client = getConnectedClientInRoom(room.id, playerId);

      room.seats[seatIndex].player = createPlayer(
        playerId,
        `Игрок ${seatIndex + 1}`,
      );

      if (client) {
        client.seatIndex = seatIndex;
      }
    });
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

    seatWaitingPlayers(room);

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

    if (payload.action === "drawPhase") {
      drawPhase(client, room);
      return;
    }

    if (payload.action === "discardCard") {
      discardCardFromHand(client, room, payload);
      return;
    }

    if (payload.action === "activateWeaponProperty") {
      activateWeaponProperty(client, room);
      return;
    }

    playCardAction(client, room, payload);
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

    const actor = room.seats.find(
      (seat) => seat.player?.playerId === client.playerId,
    )?.player;

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

    if (room.game.turnEffectAllowances) {
      room.game.turnEffectAllowances[playerId] = {};
    }
    startTurn(room, nextPlayerId);
    return true;
  }

  function markTurnActionTaken(room) {
    room.game.turnActionTaken = true;
  }

  function drawPhase(client, room) {
    if (room.game.turnDrawTaken) {
      sendError(client.socket, "Фаза набора уже была");
      return;
    }

    if (room.game.turnActionTaken) {
      sendError(client.socket, "Фаза набора уже пропущена");
      return;
    }

    drawCards(room, client.playerId, 2);
    room.game.turnDrawTaken = true;
    broadcastRoom(room.id);
  }

  function discardCardFromHand(client, room, payload = {}) {
    const actor = room.seats.find(
      (seat) => seat.player?.playerId === client.playerId,
    )?.player;
    const cardIndex =
      actor?.hand.findIndex(
        (card) => card.instanceId === payload.cardInstanceId,
      ) ?? -1;

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
    markTurnActionTaken(room);
    addGameEvent(room, {
      type: "discard",
      actorName: actor.name,
      actorRoleId: actor.roleId,
      cardTitle: getCardEventTitle(discardedCard),
      cardColor: getCardEventColor(discardedCard),
    });

    if (actor.hand.length <= actor.health) {
      completeTurn(room, client.playerId);
    }

    broadcastRoom(room.id);
  }

  function playCardAction(client, room, payload = {}) {
    const actor = room.seats.find(
      (seat) => seat.player?.playerId === client.playerId,
    )?.player;
    const cardIndex =
      actor?.hand.findIndex(
        (card) => card.instanceId === payload.cardInstanceId,
      ) ?? -1;

    if (!actor || cardIndex === -1) {
      sendError(client.socket, "Карты нет на руке");
      return;
    }

    const card = actor.hand[cardIndex];
    const configForCard = cardConfig[card.cardId];
    const usesEffectAllowance =
      configForCard?.effectLimitKey &&
      hasTurnEffectBeenPlayed(
        room,
        client.playerId,
        configForCard.effectLimitKey,
      ) &&
      hasTurnEffectAllowance(
        room,
        client.playerId,
        configForCard.effectLimitKey,
      );

    if (!configForCard || configForCard.action !== payload.action) {
      sendError(client.socket, "Некорректная карта");
      return;
    }

    if (
      configForCard.effectLimitKey &&
      hasTurnEffectBeenPlayed(
        room,
        client.playerId,
        configForCard.effectLimitKey,
      ) &&
      !hasTurnEffectAllowance(
        room,
        client.playerId,
        configForCard.effectLimitKey,
      )
    ) {
      sendError(client.socket, "Эту карту уже играли в этот ход");
      return;
    }

    if (payload.action === "bang") {
      const result = applyBangAction(client, room, payload);

      if (!result) return;

      if (usesEffectAllowance) {
        addWeaponPropertyUseEvent(room, actor, configForCard.effectLimitKey);
      }

      addGameEvent(room, {
        type: "card",
        actorName: actor.name,
        actorRoleId: actor.roleId,
        cardTitle: getCardEventTitle(card),
        cardColor: configForCard.eventColor,
        targetName: result.targetPlayer.name,
        targetRoleId: result.targetPlayer.roleId,
      });
      addGameEvent(room, {
        type: "healthLoss",
        playerName: result.targetPlayer.name,
        playerRoleId: result.targetPlayer.roleId,
        amount: result.healthLoss,
      });
      markTurnActionTaken(room);
      revealDeadPlayer(room, result.targetPlayer, actor);
      checkVictory(room);
    }

    if (payload.action === "equipWeapon") {
      equipWeapon(room, actor, card, configForCard);
      actor.hand.splice(cardIndex, 1);
      markTurnActionTaken(room);
      addGameEvent(room, {
        type: "equip",
        actorName: actor.name,
        actorRoleId: actor.roleId,
        cardTitle: getCardEventTitle(card),
        cardColor: configForCard.eventColor,
      });
      broadcastRoom(room.id);
      return;
    }

    if (configForCard.effectLimitKey) {
      if (usesEffectAllowance) {
        consumeTurnEffectAllowance(
          room,
          client.playerId,
          configForCard.effectLimitKey,
        );
      } else {
        markTurnEffectPlayed(
          room,
          client.playerId,
          configForCard.effectLimitKey,
        );
      }
    }

    if (configForCard.disposable) {
      const [discardedCard] = actor.hand.splice(cardIndex, 1);
      room.game.discard.push(discardedCard);
    }

    broadcastRoom(room.id);
  }

  function equipWeapon(room, actor, card, configForCard) {
    if (actor.weapon) {
      clearWeaponPropertyAllowances(room, actor);
      room.game.discard.push(actor.weapon);
    }

    actor.weapon = card;
    actor.attackRange = configForCard.weaponRange || config.defaultAttackRange;
  }

  function clearWeaponPropertyAllowances(room, actor) {
    const weaponConfig = actor.weapon ? cardConfig[actor.weapon.cardId] : null;
    const effectLimitKey = weaponConfig?.propertyEffectLimitKey;

    if (!effectLimitKey) return;

    clearTurnEffectAllowance(room, actor.playerId, effectLimitKey);
  }

  function addWeaponPropertyUseEvent(room, actor, effectLimitKey) {
    const weaponConfig = actor.weapon ? cardConfig[actor.weapon.cardId] : null;

    if (
      !weaponConfig ||
      weaponConfig.propertyEffectLimitKey !== effectLimitKey
    ) {
      return;
    }

    addGameEvent(room, {
      type: "propertyUse",
      actorName: actor.name,
      actorRoleId: actor.roleId,
      cardTitle: getCardEventTitle(actor.weapon),
      cardColor: weaponConfig.eventColor,
    });
  }

  function activateWeaponProperty(client, room) {
    const actor = room.seats.find(
      (seat) => seat.player?.playerId === client.playerId,
    )?.player;
    const weaponConfig = actor?.weapon ? cardConfig[actor.weapon.cardId] : null;

    if (!actor || !weaponConfig?.propertyAction) {
      sendError(client.socket, "У оружия нет активного свойства");
      return;
    }

    if (weaponConfig.propertyAction !== "unlockEffectLimit") {
      sendError(client.socket, "Это свойство пока не поддерживается");
      return;
    }

    if (
      hasTurnEffectAllowance(
        room,
        actor.playerId,
        weaponConfig.propertyEffectLimitKey,
      )
    ) {
      clearTurnEffectAllowance(
        room,
        actor.playerId,
        weaponConfig.propertyEffectLimitKey,
      );
      broadcastRoom(room.id);
      return;
    }

    addTurnEffectAllowance(
      room,
      actor.playerId,
      weaponConfig.propertyEffectLimitKey,
      weaponConfig.propertyCharges || 1,
    );
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

    const distance = getPlayerDistance(room, client.playerId, targetPlayerId);
    const actor = room.seats.find(
      (seat) => seat.player?.playerId === client.playerId,
    )?.player;
    const attackRange = actor?.attackRange ?? config.defaultAttackRange;

    if (!distance || distance > attackRange) {
      sendError(client.socket, "Цель слишком далеко");
      return false;
    }

    const healthLoss = 1;

    targetPlayer.health = Math.max(0, targetPlayer.health - healthLoss);
    return { targetPlayer, healthLoss };
  }

  function leaveGame(room, playerId) {
    const seatIndex = findSeatIndexByPlayerId(room, playerId);

    if (seatIndex === null) return;

    const player = room.seats[seatIndex].player;

    if (!player.isAlive) {
      player.leftGame = true;
      player.connected = false;
      clearDisconnectTimer(playerId);
      updateConnectedClientsSeat(room.id, playerId, null);
      return;
    }

    player.leftGame = true;
    player.connected = false;
    player.health = 0;
    player.isAlive = false;
    player.isRoleRevealed = true;

    discardPlayerCards(room, player);

    clearDisconnectTimer(playerId);
    updateConnectedClientsSeat(room.id, playerId, null);
    addDeathEvent(room, player);
    checkVictory(room);

    if (
      room.status === "game" &&
      !room.game.winner &&
      room.game.turnPlayerId === playerId
    ) {
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

      if (room.status === "game") {
        const player = room.seats[seatIndex]?.player;

        if (player?.isAlive) {
          addGameEvent(
            room,
            `Игрок ${player.name} не вернулся в игру за 5 минут.`,
          );
        }

        leaveGame(room, playerId);
        maybeScheduleEmptyRoomCleanup(room.id);
      } else {
        leaveSeat(room.id, playerId);
      }

      broadcastRoom(room.id);
      broadcastRoomList();
    }, config.playerDisconnectGraceMs);

    disconnectTimers.set(playerId, timer);
    broadcastRoom(room.id);
  }

  function deleteRoom(roomId, options = {}) {
    const room = rooms.get(roomId);

    if (!room) return;

    const { broadcastRoomList: shouldBroadcastRoomList = true } = options;

    clearGameExpiration(room);
    clearFinishedRoomCleanup(room);
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

    if (shouldBroadcastRoomList) {
      broadcastRoomList();
    }
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
      playersCount: getRoomPlayersCount(room),
      game: getPublicGame(room),
      seats: room.seats.map((seat) => ({
        index: seat.index,
        player: seat.player
          ? getPublicPlayer(room, seat.player, viewerPlayerId)
          : null,
      })),
    };
  }

  function getPublicGame(room) {
    return {
      turnPlayerId: room.game.turnPlayerId,
      turnDrawTaken: room.game.turnDrawTaken,
      turnActionTaken: room.game.turnActionTaken,
      winner: room.game.winner,
      winnerText: room.game.winnerText,
      winnerDetails: room.game.winnerDetails,
      events: room.game.events,
      deckCount: room.game.deck.length,
      discardCount: room.game.discard.length,
    };
  }

  function getPublicPlayer(room, player, viewerPlayerId) {
    const role = player.roleId ? roleConfig[player.roleId] : null;
    const canSeeRole = Boolean(
      role &&
      (player.playerId === viewerPlayerId ||
        role.isPublic ||
        player.isRoleRevealed),
    );

    return {
      playerId: player.playerId,
      name: player.name,
      health: player.health,
      maxHealth: player.maxHealth,
      attackRange: player.attackRange,
      activeEffectAllowances:
        room.game?.turnEffectAllowances?.[player.playerId] || {},
      weapon: player.weapon
        ? getPublicCard(room, player, player.weapon, {
            includePlayState: false,
          })
        : null,
      bulletSkinIndex: player.bulletSkinIndex,
      bulletSkinKey: player.bulletSkinKey,
      hatSkinKey: player.hatSkinKey,
      connected: player.connected,
      leftGame: player.leftGame,
      isAlive: player.isAlive,
      isRoleRevealed: player.isRoleRevealed,
      handCount: player.hand?.length || 0,
      hand:
        player.playerId === viewerPlayerId ? getPublicHand(room, player) : [],
      role: canSeeRole
        ? {
            id: role.id,
            label: role.label,
            team: role.team,
          }
        : null,
    };
  }

  function getPublicHand(room, player) {
    return (player.hand || []).map((card) =>
      getPublicCard(room, player, card, { includePlayState: true }),
    );
  }

  function getPublicCard(room, player, card, options = {}) {
    const { includePlayState = false } = options;
    const configForCard = cardConfig[card.cardId];
    const publicCard = {
      ...card,
      title: configForCard.title,
      image: configForCard.image,
      playMode: configForCard.playMode,
      action: configForCard.action,
      selectionView: configForCard.selectionView,
      needsTarget: configForCard.needsTarget,
      usesWeaponRange: configForCard.usesWeaponRange,
      disposable: configForCard.disposable,
      effectLimitKey: configForCard.effectLimitKey,
      propertyAction: configForCard.propertyAction,
      propertyEffectLimitKey: configForCard.propertyEffectLimitKey,
      propertyCharges: configForCard.propertyCharges,
      propertyLabel: configForCard.propertyLabel,
      weaponRange: configForCard.weaponRange,
      suit: card.suit,
      rank: card.rank,
    };

    if (!includePlayState) {
      return publicCard;
    }

    return {
      ...publicCard,
      isPlayable: isCardPlayable(room, player, configForCard),
      isBlockedByTurnRule: isCardBlockedByTurnRule(room, player, configForCard),
    };
  }

  function isCardPlayable(room, player, configForCard) {
    if (room.status !== "game") return false;
    if (!player.isAlive || room.game.turnPlayerId !== player.playerId)
      return false;
    if (!configForCard.effectLimitKey) return true;

    return (
      !hasTurnEffectBeenPlayed(
        room,
        player.playerId,
        configForCard.effectLimitKey,
      ) ||
      hasTurnEffectAllowance(
        room,
        player.playerId,
        configForCard.effectLimitKey,
      )
    );
  }

  function isCardBlockedByTurnRule(room, player, configForCard) {
    if (room.status !== "game") return false;
    if (!player.isAlive || room.game.turnPlayerId !== player.playerId)
      return false;
    if (!configForCard.effectLimitKey) return false;

    return (
      hasTurnEffectBeenPlayed(
        room,
        player.playerId,
        configForCard.effectLimitKey,
      ) &&
      !hasTurnEffectAllowance(
        room,
        player.playerId,
        configForCard.effectLimitKey,
      )
    );
  }

  function hasTurnEffectBeenPlayed(room, playerId, effectLimitKey) {
    return Boolean(room.game.turnPlayedEffects?.[playerId]?.[effectLimitKey]);
  }

  function markTurnEffectPlayed(room, playerId, effectLimitKey) {
    room.game.turnPlayedEffects ||= {};
    room.game.turnPlayedEffects[playerId] = {
      ...room.game.turnPlayedEffects[playerId],
      [effectLimitKey]: true,
    };
  }

  function hasTurnEffectAllowance(room, playerId, effectLimitKey) {
    return (
      (room.game.turnEffectAllowances?.[playerId]?.[effectLimitKey] || 0) > 0
    );
  }

  function addTurnEffectAllowance(room, playerId, effectLimitKey, count) {
    room.game.turnEffectAllowances ||= {};
    room.game.turnEffectAllowances[playerId] = {
      ...room.game.turnEffectAllowances[playerId],
      [effectLimitKey]:
        (room.game.turnEffectAllowances[playerId]?.[effectLimitKey] || 0) +
        count,
    };
  }

  function consumeTurnEffectAllowance(room, playerId, effectLimitKey) {
    const nextCount = Math.max(
      0,
      (room.game.turnEffectAllowances?.[playerId]?.[effectLimitKey] || 0) - 1,
    );

    setTurnEffectAllowance(room, playerId, effectLimitKey, nextCount);
  }

  function clearTurnEffectAllowance(room, playerId, effectLimitKey) {
    setTurnEffectAllowance(room, playerId, effectLimitKey, 0);
  }

  function setTurnEffectAllowance(room, playerId, effectLimitKey, count) {
    room.game.turnEffectAllowances ||= {};
    room.game.turnEffectAllowances[playerId] = {
      ...room.game.turnEffectAllowances[playerId],
      [effectLimitKey]: count,
    };
  }

  function getPublicRooms() {
    return Array.from(rooms.values()).flatMap((room) => {
      const playersCount = getRoomPlayersCount(room);

      if (playersCount === 0) {
        deleteRoom(room.id, { broadcastRoomList: false });
        return [];
      }

      return [
        {
          id: room.id,
          name: room.name,
          status: room.status,
          playersCount,
          maxPlayers: room.seats.length,
        },
      ];
    });
  }

  function getRoomPlayersCount(room) {
    return getJoinedPlayerIds(room).length;
  }

  function getJoinedPlayerIds(room) {
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

    return [...playerIds];
  }

  function getSeatedPlayersCount(room) {
    return room.seats.filter((seat) => seat.player).length;
  }

  function findRoomByPlayerId(playerId) {
    return (
      Array.from(rooms.values()).find(
        (room) => findSeatIndexByPlayerId(room, playerId) !== null,
      ) || null
    );
  }

  function findHostedRoomByPlayerId(playerId) {
    return (
      Array.from(rooms.values()).find(
        (room) => room.status === "lobby" && room.hostPlayerId === playerId,
      ) || null
    );
  }

  function findSeatIndexByPlayerId(room, playerId) {
    const seat = room.seats.find(
      (candidate) =>
        candidate.player?.playerId === playerId && !candidate.player.leftGame,
    );

    return seat ? seat.index : null;
  }

  function getPlayerDistance(room, fromPlayerId, toPlayerId) {
    const aliveSeatIndexes = room.seats
      .filter((seat) => seat.player?.isAlive && !seat.player.leftGame)
      .map((seat) => seat.index)
      .sort((first, second) => first - second);
    const fromSeatIndex = findSeatIndexByPlayerId(room, fromPlayerId);
    const toSeatIndex = findSeatIndexByPlayerId(room, toPlayerId);
    const fromPosition = aliveSeatIndexes.indexOf(fromSeatIndex);
    const toPosition = aliveSeatIndexes.indexOf(toSeatIndex);

    if (
      fromPosition === -1 ||
      toPosition === -1 ||
      fromPosition === toPosition
    ) {
      return 0;
    }

    const directDistance = Math.abs(fromPosition - toPosition);

    return Math.min(directDistance, aliveSeatIndexes.length - directDistance);
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
      turnEffectAllowances: {},
      turnDrawTaken: false,
      turnActionTaken: false,
      winnerDetails: null,
    };
  }

  function assignRoles(room) {
    const players = room.seats
      .filter((seat) => seat.player)
      .map((seat) => seat.player);
    const roles = shuffle(getRolesForPlayerCount(players.length));
    const hatSkinKeys = shuffle(
      Array.from({ length: config.hatSkinCount }, (_, index) =>
        String(index + 1),
      ),
    );

    players.forEach((player, index) => {
      player.roleId = roles[index];
      player.isRoleRevealed = player.roleId === "sheriff";
      player.isAlive = true;
      player.leftGame = false;
      player.connected = true;
      player.health = config.defaultHealth;
      player.maxHealth = config.defaultHealth;
      player.attackRange = config.defaultAttackRange;
      player.hand = [];
      player.weapon = null;

      if (player.roleId === "sheriff") {
        player.maxHealth += 1;
        player.health += 1;
        player.bulletSkinKey = "sheriff";
        player.hatSkinKey = "sheriff";
        room.game.turnPlayerId = player.playerId;
      } else {
        player.bulletSkinKey = "default";
        player.hatSkinKey = hatSkinKeys.pop() || "1";
      }
    });

    room.game.winner = null;
    room.game.winnerText = "";
    room.game.winnerDetails = null;
    room.game.events = [];
    room.game.deck = shuffle(createDeck());
    room.game.discard = [];
    room.game.turnPlayedEffects = {};
    room.game.turnEffectAllowances = {};
    dealInitialHands(room);
    addGameEvent(
      room,
      "Игроки получили свои роли случайным образом. Каждому игроку раздали случайные карты согласно их запасу здоровья. Шериф ходит первым.",
    );
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
    room.game.turnEffectAllowances[playerId] = {};
    room.game.turnDrawTaken = false;
    room.game.turnActionTaken = false;

    const player = room.seats.find(
      (seat) => seat.player?.playerId === playerId,
    )?.player;

    if (player) {
      addGameEvent(room, {
        type: "turn",
        text: `Ход ${player.name}`,
        playerName: player.name,
        playerRoleId: player.roleId,
      });
    }
  }

  function drawCards(room, playerId, count) {
    const player = room.seats.find(
      (seat) => seat.player?.playerId === playerId,
    )?.player;
    const drawnCards = [];

    if (!player) return;

    for (let index = 0; index < count; index += 1) {
      refillDeckIfNeeded(room);

      const card = room.game.deck.shift();

      if (!card) return;

      drawnCards.push(card);
    }

    player.hand = [...drawnCards, ...player.hand];
  }

  function refillDeckIfNeeded(room) {
    if (room.game.deck.length >= 7 || room.game.discard.length === 0) return;

    room.game.deck = [...room.game.deck, ...shuffle(room.game.discard)];
    room.game.discard = [];
    addGameEvent(room, "Сброс перемешан и ушел под колоду.");
  }

  function getCardEventTitle(card) {
    const configForCard = cardConfig[card.cardId];

    return configForCard?.eventTitle || configForCard?.title || "неизвестно";
  }

  function getCardEventColor(card) {
    return cardConfig[card.cardId]?.eventColor || "#c94a35";
  }

  function revealDeadPlayer(room, player, killer = null) {
    if (player.health > 0 || !player.isAlive) return;

    player.isAlive = false;
    player.isRoleRevealed = true;

    discardPlayerCards(room, player);
    addDeathEvent(room, player);

    if (player.roleId === "outlaw" && killer?.isAlive) {
      drawCards(room, killer.playerId, 3);
      addGameEvent(room, {
        type: "outlawBounty",
        outlawName: player.name,
        outlawRoleId: player.roleId,
        actorName: killer.name,
        actorRoleId: killer.roleId,
        cardsCount: 3,
      });
    }
  }

  function discardPlayerCards(room, player) {
    if (player.hand.length > 0) {
      room.game.discard.push(...player.hand);
      player.hand = [];
    }

    if (player.weapon) {
      clearWeaponPropertyAllowances(room, player);
      room.game.discard.push(player.weapon);
      player.weapon = null;
    }
  }

  function addDeathEvent(room, player) {
    if (player.roleId === "sheriff") {
      return;
    }

    const role = roleConfig[player.roleId];

    addGameEvent(room, {
      type: "death",
      playerName: player.name,
      playerRoleId: player.roleId,
      roleLabel: role?.label || "неизвестно",
    });
  }

  function checkVictory(room) {
    const alivePlayers = getAlivePlayers(room);
    const sheriff =
      room.seats.find((seat) => seat.player?.roleId === "sheriff")?.player ||
      null;

    if (room.game.winner || !sheriff) return;

    if (!sheriff.isAlive) {
      const aliveOutlaws = alivePlayers.filter(
        (player) => player.roleId === "outlaw",
      );
      const isRenegadeSolo =
        alivePlayers.length === 1 && alivePlayers[0].roleId === "renegade";
      const sheriffDeathWinner = isRenegadeSolo ? "renegade" : "outlaws";

      finishGame(
        room,
        sheriffDeathWinner,
        isRenegadeSolo
          ? getRenegadeVictoryText(alivePlayers)
          : `Шериф убит: победили бандит(ы)${
              aliveOutlaws.length > 0 ? ` ${formatNames(aliveOutlaws)}` : ""
            }`,
        isRenegadeSolo
          ? {
              type: "renegade",
              renegade: getPlayerSummary(alivePlayers[0]),
            }
          : {
              type: "sheriffKilledOutlaws",
              outlaws: aliveOutlaws.map(getPlayerSummary),
            },
      );
      return;
    }

    if (alivePlayers.length === 1 && alivePlayers[0].roleId === "renegade") {
      finishGame(room, "renegade", getRenegadeVictoryText(alivePlayers), {
        type: "renegade",
        renegade: getPlayerSummary(alivePlayers[0]),
      });
      return;
    }

    const hasEnemyOfSheriff = alivePlayers.some(
      (player) => player.roleId === "outlaw" || player.roleId === "renegade",
    );

    if (!hasEnemyOfSheriff) {
      finishGame(room, "law", getLawVictoryText(alivePlayers), {
        type: "law",
        sheriff: getPlayerSummary(
          alivePlayers.find((player) => player.roleId === "sheriff"),
        ),
        deputies: alivePlayers
          .filter((player) => player.roleId === "deputy")
          .map(getPlayerSummary),
      });
    }
  }

  function finishGame(room, winner, winnerText, winnerDetails = null) {
    room.status = "finished";
    room.game.winner = winner;
    room.game.winnerText = winnerText;
    room.game.winnerDetails = winnerDetails;
    room.seats.forEach((seat) => {
      if (seat.player) {
        seat.player.isRoleRevealed = true;
      }
    });
    addGameEvent(room, "Игра окончена");
    scheduleFinishedRoomCleanup(room);
  }

  function getRenegadeVictoryText(alivePlayers) {
    const renegade = alivePlayers.find(
      (player) => player.roleId === "renegade",
    );

    return renegade
      ? `Победил Ренегат ${renegade.name}, он уничтожил всех и остался один`
      : "Победил Ренегат, он уничтожил всех и остался один";
  }

  function getLawVictoryText(alivePlayers) {
    const sheriff = alivePlayers.find((player) => player.roleId === "sheriff");
    const deputies = alivePlayers.filter(
      (player) => player.roleId === "deputy",
    );
    const deputyText =
      deputies.length > 0 ? ` и живые помощники ${formatNames(deputies)}` : "";
    const verbText = deputies.length > 0 ? "победили" : "победил";

    return `Шериф ${sheriff?.name || ""}${deputyText} ${verbText}: все бандиты и ренегат(ы) мертвы`;
  }

  function formatNames(players) {
    return players.map((player) => player.name).join(", ");
  }

  function getPlayerSummary(player) {
    if (!player) return null;

    return {
      name: player.name,
      roleId: player.roleId,
    };
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

  function addGameEvent(room, event) {
    const normalizedEvent =
      typeof event === "string" ? { type: "text", text: event } : event;

    room.game.events = [
      ...room.game.events,
      {
        id: randomUUID(),
        createdAt: Date.now(),
        ...normalizedEvent,
      },
    ].slice(-10);
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

  function scheduleFinishedRoomCleanup(room) {
    clearFinishedRoomCleanup(room);

    room.finishedRoomTimer = setTimeout(() => {
      deleteRoom(room.id);
    }, config.finishedRoomGraceMs);
  }

  function clearFinishedRoomCleanup(room) {
    if (!room.finishedRoomTimer) return;

    clearTimeout(room.finishedRoomTimer);
    room.finishedRoomTimer = null;
  }

  function maybeScheduleEmptyRoomCleanup(roomId) {
    const room = rooms.get(roomId);

    if (!room) return;
    if (getRoomPlayersCount(room) > 0) return;

    clearEmptyRoomTimer(roomId);

    if (config.emptyRoomGraceMs === 0) {
      deleteRoom(roomId);
      return;
    }

    const timer = setTimeout(() => {
      emptyRoomTimers.delete(roomId);

      const currentRoom = rooms.get(roomId);

      if (!currentRoom) return;
      if (getRoomPlayersCount(currentRoom) === 0) {
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

  function getConnectedClientInRoom(roomId, playerId) {
    return (
      Array.from(clients.values()).find(
        (client) => client.roomId === roomId && client.playerId === playerId,
      ) || null
    );
  }

  function hasConnectedClient(playerId) {
    return Array.from(clients.values()).some(
      (client) => client.playerId === playerId,
    );
  }

  function hasConnectedClientInRoom(roomId) {
    return Array.from(clients.values()).some(
      (client) => client.roomId === roomId,
    );
  }

  function broadcastRoom(roomId) {
    const room = roomId ? rooms.get(roomId) : null;

    if (!room) return;

    clients.forEach((client) => {
      if (client.roomId === roomId) {
        send(client.socket, "room:update", {
          room: getPublicRoom(room, client.playerId),
        });
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
    const attempts = (roomCreateAttempts.get(ip) || []).filter(
      (timestamp) => now - timestamp < config.roomCreateWindowMs,
    );

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

  console.log(
    `Bang WebSocket server is running on ws://localhost:${config.port}`,
  );
}
