import { randomInt, randomUUID } from "node:crypto";
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
import { characterConfig, getCharacterIds } from "../shared/characterConfig.js";
import { createLogger } from "./logger.js";
import { shuffle } from "./random.js";
import { createPublicStateSerializer } from "./serializers.js";
import { createPlayerState, createRoomState } from "./state.js";
import {
  findActiveSeatByPlayerId,
  getPlayerDistance as getSharedPlayerDistance,
  hasBlueCardInPlay,
  isDynamiteInPlay as isSharedDynamiteInPlay,
} from "../shared/gameRules.js";

const DECK_REFILL_THRESHOLD = 13;
const DISCARD_VISIBLE_CARDS_COUNT = 5;
const MAX_GAME_EVENTS = 10;

export function startGameServer() {
  const logger = createLogger("server");
  const rooms = new Map();
  const clients = new Map();
  const disconnectTimers = new Map();
  const emptyRoomTimers = new Map();
  const roomCreateAttempts = new Map();
  const pendingRoomBroadcasts = new Set();
  let isBroadcastFlushScheduled = false;
  let shouldBroadcastRoomList = false;
  const wss = new WebSocketServer({ port: config.port });
  const publicState = createPublicStateSerializer({
    roleConfig,
    characterConfig,
    cardConfig,
    getRoomPlayersCount,
    getPlayerStatuses,
    getEffectiveCardConfig,
    isCardPlayable,
    isCardBlockedByTurnRule,
    isReactionCardPlayable,
  });
  const cardActionHandlers = {
    bang: playBangCard,
    gatling: playGatlingCard,
    indians: playIndiansCard,
    duel: playDuelCard,
    panic: playTargetTableCard,
    catbalou: playTargetTableCard,
    beer: playBeerCard,
    saloon: playSaloonCard,
    generalstore: playGeneralStoreCard,
    drawCards: playDrawCardsCard,
    equipWeapon: playEquipWeaponCard,
    playBlueCard: playBlueCardFromHand,
    playBlueCardOnTarget: playBlueCardOnTargetFromHand,
  };

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

    const room = createRoomState({
      id: randomUUID(),
      name,
      password,
      hostPlayerId: client.playerId,
      createdAt: Date.now(),
      seatCount: config.seatCount,
    });

    rooms.set(room.id, room);
    client.roomId = room.id;
    client.seatIndex = null;

    send(client.socket, "room:update", {
      room: getPublicRoom(room, client.playerId),
    });
    broadcastRoom(room.id);
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
    return createPlayerState({
      playerId,
      name,
      health: config.defaultHealth,
      attackRange: config.defaultAttackRange,
      bulletSkinIndex: getRandomBulletSkinIndex(),
    });
  }

  function isAutoSeatPlayerName(name = "") {
    return /^Игрок \d+$/.test(String(name || "").trim());
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

    if (getRoomPlayersCount(room) < 2) {
      sendError(client.socket, "Нужно минимум два игрока в комнате");
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

    if (payload.action === "cancelCharacterPayment") {
      cancelCharacterPayment(client, room);
      return;
    }

    if (payload.action === "selectCharacterPaymentCard") {
      selectCharacterPaymentCard(client, room, payload);
      return;
    }

    if (payload.action === "cancelTurnDiscard") {
      cancelTurnDiscard(client, room);
      return;
    }

    if (room.game.pendingCharacterPayment) {
      sendError(client.socket, "Ждем оплату свойства персонажа");
      return;
    }

    if (
      room.game.pendingTurnDiscard &&
      room.game.pendingTurnDiscard.playerId !== client.playerId
    ) {
      sendError(client.socket, "Ждем сброс карт");
      return;
    }

    if (
      room.game.pendingTurnDiscard &&
      room.game.pendingTurnDiscard.playerId === client.playerId &&
      payload.action !== "discardCard"
    ) {
      sendError(client.socket, "Сначала завершите или отмените сброс");
      return;
    }

    if (room.game.pendingCheckChoice) {
      if (payload.action === "chooseCheckCard") {
        chooseCheckCard(client, room, payload);
        return;
      }

      sendError(client.socket, "Сначала выберите карту проверки");
      return;
    }

    if (payload.action === "activateCharacterAbility") {
      activateCharacterAbility(client, room);
      return;
    }

    if (room.game.pendingReaction) {
      if (payload.action === "checkBarrel") {
        checkBarrelReaction(client, room);
        return;
      }

      if (["missed", "beer", "bang"].includes(payload.action)) {
        playReactionAction(client, room, payload);
        return;
      }

      sendError(client.socket, "Ждем реакцию");
      return;
    }

    if (room.game.generalStore) {
      if (payload.action === "chooseGeneralStoreCard") {
        chooseGeneralStoreCard(client, room, payload);
        return;
      }

      sendError(client.socket, "Сначала выберите карту из магазина");
      return;
    }

    if (payload.action === "checkTurnBlueCard") {
      checkTurnBlueCard(client, room, payload);
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
      drawPhase(client, room, payload);
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

    if (hasRequiredTurnCheck(room, client.playerId)) {
      sendError(client.socket, "Сначала проверьте карту на столе");
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
    flushHandChangedPlayers(room);
    room.game.pendingTurnDiscard = null;

    const nextPlayerId = getNextTurnPlayerId(room, playerId);

    if (!nextPlayerId) {
      return false;
    }

    if (room.game.turnEffectAllowances) {
      room.game.turnEffectAllowances[playerId] = {};
    }
    clearActiveCharacterAbility(room, playerId);
    startTurn(room, nextPlayerId);
    return true;
  }

  function markTurnActionTaken(room) {
    room.game.turnActionTaken = true;
  }

  function drawPhase(client, room, payload = {}) {
    if (hasRequiredTurnCheck(room, client.playerId)) {
      sendError(client.socket, "Сначала проверьте карту на столе");
      return;
    }

    if (room.game.turnDrawTaken) {
      sendError(client.socket, "Фаза набора уже была");
      return;
    }

    if (room.game.turnActionTaken) {
      sendError(client.socket, "Фаза набора уже пропущена");
      return;
    }

    const actor = room.seats.find(
      (seat) => seat.player?.playerId === client.playerId,
    )?.player;

    if (!actor) {
      sendError(client.socket, "Игрок не найден");
      return;
    }

    if (
      hasActiveCharacterAbilityEffect(room, actor.playerId, "drawDiscardTop")
    ) {
      drawCardsWithDiscardTop(room, actor);
      clearActiveCharacterAbility(room, actor.playerId);
    } else if (
      hasActiveCharacterAbilityEffect(
        room,
        actor.playerId,
        "drawFromOpponentHandOnDrawPhase",
      )
    ) {
      if (
        !drawCardsWithOpponentHand(
          client,
          room,
          actor,
          payload.targetPlayerId,
        )
      ) {
        broadcastRoom(room.id);
        return;
      }

      clearActiveCharacterAbility(room, actor.playerId);
    } else if (
      hasActiveCharacterAbilityEffect(
        room,
        actor.playerId,
        "revealSecondDrawSuitBonus",
      )
    ) {
      drawCardsWithSecondCardSuitBonus(room, actor);
      clearActiveCharacterAbility(room, actor.playerId);
    } else if (
      hasActiveCharacterAbilityEffect(room, actor.playerId, "chooseDeckTopCards")
    ) {
      if (!startDeckTopChoice(room, actor)) {
        broadcastRoom(room.id);
        return;
      }
    } else {
      drawCards(room, client.playerId, 2);
    }

    room.game.turnDrawTaken = true;
    broadcastRoom(room.id);
  }

  function discardCardFromHand(client, room, payload = {}) {
    if (hasRequiredTurnCheck(room, client.playerId)) {
      sendError(client.socket, "Сначала проверьте карту на столе");
      return;
    }

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

    const discardedCard = takeCardFromHand(room, actor, cardIndex, {
      allowEmptyHandAbilities: false,
    });
    const pendingDiscard =
      room.game.pendingTurnDiscard || createTurnDiscard(actor);

    pendingDiscard.cards.push({
      card: discardedCard,
      index: cardIndex,
    });
    room.game.pendingTurnDiscard = pendingDiscard;
    markTurnActionTaken(room);

    if (actor.hand.length <= actor.health) {
      resolveTurnDiscard(room, actor, pendingDiscard);
      completeTurn(room, client.playerId);
    }

    broadcastRoom(room.id);
  }

  function createTurnDiscard(player) {
    return {
      id: randomUUID(),
      playerId: player.playerId,
      cards: [],
    };
  }

  function resolveTurnDiscard(room, actor, pendingDiscard) {
    if (!pendingDiscard?.cards?.length) return;

    const cards = pendingDiscard.cards.map((entry) => entry.card);

    room.game.discard.push(...cards);
    room.game.pendingTurnDiscard = null;
    addDiscardEvent(room, actor, cards);
  }

  function cancelTurnDiscard(client, room) {
    const pendingDiscard = room.game.pendingTurnDiscard;

    if (!pendingDiscard) {
      broadcastRoom(room.id);
      return;
    }

    if (pendingDiscard.playerId !== client.playerId) {
      sendError(client.socket, "Нельзя отменить чужой сброс");
      return;
    }

    const actor = room.seats.find(
      (seat) => seat.player?.playerId === client.playerId,
    )?.player;

    if (actor) {
      [...pendingDiscard.cards].reverse().forEach((entry) => {
        actor.hand.splice(
          Math.min(entry.index, actor.hand.length),
          0,
          entry.card,
        );
      });
      afterPlayerHandChanged(room, actor, {
        allowEmptyHandAbilities: false,
      });
    } else {
      room.game.discard.push(
        ...pendingDiscard.cards.map((entry) => entry.card),
      );
    }

    room.game.pendingTurnDiscard = null;
    broadcastRoom(room.id);
  }

  function playCardAction(client, room, payload = {}) {
    if (hasRequiredTurnCheck(room, client.playerId)) {
      sendError(client.socket, "Сначала проверьте карту на столе");
      return;
    }

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
    const baseConfigForCard = cardConfig[card.cardId];
    const characterConversion = getActiveCharacterConversion(
      room,
      actor,
      card,
      baseConfigForCard,
    );
    const configForCard =
      characterConversion?.targetConfig || baseConfigForCard;
    const usesCharacterEffectAllowance =
      configForCard?.effectLimitKey &&
      hasTurnEffectBeenPlayed(
        room,
        client.playerId,
        configForCard.effectLimitKey,
      ) &&
      hasCharacterEffectLimitAllowance(room, actor, configForCard.effectLimitKey);
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
      ) &&
      !usesCharacterEffectAllowance;

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
      ) &&
      !hasCharacterEffectLimitAllowance(room, actor, configForCard.effectLimitKey)
    ) {
      sendError(client.socket, "Эту карту уже играли в этот ход");
      return;
    }

    const actionResult = cardActionHandlers[payload.action]?.({
      client,
      room,
      payload,
      actor,
      card,
      cardIndex,
      configForCard,
      characterConversion,
      usesEffectAllowance,
      usesCharacterEffectAllowance,
    });

    if (!actionResult) return;
    if (actionResult.completed) return;

    completePlayedCard(client, room, actor, cardIndex, configForCard, {
      characterConversion,
      usesEffectAllowance,
      usesCharacterEffectAllowance,
    });
  }

  function completePlayedCard(
    client,
    room,
    actor,
    cardIndex,
    configForCard,
    options = {},
  ) {
    const {
      characterConversion = null,
      usesEffectAllowance = false,
      usesCharacterEffectAllowance = false,
    } = options;
    const isPersistentBangUnlock =
      configForCard.effectLimitKey === cardConfig.bang.effectLimitKey &&
      (usesEffectAllowance || usesCharacterEffectAllowance);

    if (configForCard.effectLimitKey) {
      if (usesEffectAllowance) {
        if (!isPersistentBangUnlock) {
          consumeTurnEffectAllowance(
            room,
            client.playerId,
            configForCard.effectLimitKey,
          );
        }
      } else if (usesCharacterEffectAllowance) {
        if (!isPersistentBangUnlock) {
          clearActiveCharacterAbility(room, actor.playerId);
        }
      } else {
        markTurnEffectPlayed(
          room,
          client.playerId,
          configForCard.effectLimitKey,
        );
      }
    }

    if (configForCard.disposable) {
      const discardedCard = takeCardFromHand(room, actor, cardIndex);
      discardPlayedCards(room, actor, discardedCard);
    }

    if (characterConversion) {
      clearActiveCharacterAbility(room, actor.playerId);
    }

    broadcastRoom(room.id);
  }

  function playBangCard(context) {
    const {
      client,
      room,
      payload,
      actor,
      card,
      configForCard,
      characterConversion,
      usesEffectAllowance,
      usesCharacterEffectAllowance,
    } = context;
    const result = applyBangAction(client, room, payload);

    if (!result) return false;

    if (usesEffectAllowance) {
      addWeaponPropertyUseEvent(room, actor, configForCard.effectLimitKey);
    }

    if (usesCharacterEffectAllowance) {
      addCharacterAbilityUseEvent(room, actor, {
        effect: "unlockBangLimit",
      });
    }

    if (characterConversion) {
      addCharacterPropertyUseEvent(room, actor, characterConversion);
    }

    const reactionModifier = getReactionModifier(room, actor, "bang");

    if (reactionModifier) {
      addCharacterAbilityUseEvent(room, actor, {
        effect: reactionModifier.effect,
      });
    }

    addGameEvent(room, {
      type: "card",
      actorName: actor.name,
      actorRoleId: actor.roleId,
      cardId: configForCard.id,
      cardTitle: getConfigEventTitle(configForCard),
      cardColor: configForCard.eventColor,
      previewCard: getReactionEventPreviewCard(
        room,
        actor,
        card,
        configForCard,
      ),
      targetName: result.targetPlayer.name,
      targetRoleId: result.targetPlayer.roleId,
    });
    markTurnActionTaken(room);
    startPendingReaction(room, {
      sourceAction: "bang",
      actorPlayerId: actor.playerId,
      actorName: actor.name,
      targetPlayerId: result.targetPlayer.playerId,
      targetName: result.targetPlayer.name,
      healthLoss: result.healthLoss,
      cardTitle: getConfigEventTitle(configForCard),
      cardColor: configForCard.eventColor,
      reactionModifier,
    });

    return {};
  }

  function playGatlingCard(context) {
    return playMultiTargetAttackCard(context, "gatling");
  }

  function playIndiansCard(context) {
    return playMultiTargetAttackCard(context, "indians");
  }

  function playDuelCard(context) {
    const { client, room, payload, actor, card, configForCard } = context;
    const result = applyDirectTargetAction(client, room, payload);

    if (!result) return false;

    addGameEvent(room, {
      type: "card",
      actorName: actor.name,
      actorRoleId: actor.roleId,
      cardId: card.cardId,
      cardTitle: getCardEventTitle(card),
      cardColor: configForCard.eventColor,
      targetName: result.targetPlayer.name,
      targetRoleId: result.targetPlayer.roleId,
    });
    markTurnActionTaken(room);
    startPendingReaction(room, {
      sourceAction: "duel",
      actorPlayerId: actor.playerId,
      actorName: actor.name,
      targetPlayerId: result.targetPlayer.playerId,
      targetName: result.targetPlayer.name,
      healthLoss: result.healthLoss,
      cardTitle: getCardEventTitle(card),
      cardColor: configForCard.eventColor,
    });

    return {};
  }

  function playTargetTableCard(context) {
    const { client, room, payload, actor, card, cardIndex, configForCard } =
      context;
    const result = takeTargetTableCard(
      client,
      room,
      actor,
      configForCard,
      payload,
    );

    if (!result) return false;

    const playedCard = takeCardFromHand(room, actor, cardIndex);
    const mode = configForCard.targetTableCardMode || "take";

    discardPlayedCards(room, actor, playedCard);

    if (mode === "take") {
      addCardsToHand(room, actor, result.targetCard);
    } else {
      room.game.discard.push(result.targetCard);
    }

    markTurnActionTaken(room);
    addGameEvent(room, {
      type: "targetTableCard",
      actorName: actor.name,
      actorRoleId: actor.roleId,
      cardId: card.cardId,
      cardTitle: getCardEventTitle(card),
      cardColor: configForCard.eventColor,
      targetName: result.targetPlayer.name,
      targetRoleId: result.targetPlayer.roleId,
      affectedSource: payload.source || "blue",
      affectedCardId: result.targetCard.cardId,
      affectedCardTitle: getCardEventTitle(result.targetCard),
      affectedCardColor: getCardEventColor(result.targetCard),
    });
    broadcastRoom(room.id);

    return { completed: true };
  }

  function playMultiTargetAttackCard(context, sourceAction) {
    const { client, room, actor, card, configForCard } = context;
    const result = applyGatlingAction(client, room);

    if (!result) return false;

    const reactionModifier = getReactionModifier(room, actor, sourceAction);

    if (reactionModifier) {
      addCharacterAbilityUseEvent(room, actor, {
        effect: reactionModifier.effect,
      });
    }

    addCardOnlyEvent(room, actor, card, configForCard);
    markTurnActionTaken(room);
    startPendingReaction(room, {
      sourceAction,
      actorPlayerId: actor.playerId,
      actorName: actor.name,
      targetPlayerIds: result.targetPlayers.map((player) => player.playerId),
      healthLoss: result.healthLoss,
      targetPlayers: result.targetPlayers.map((player) => ({
        playerId: player.playerId,
        name: player.name,
        roleId: player.roleId,
      })),
      cardTitle: getCardEventTitle(card),
      cardColor: configForCard.eventColor,
      reactionModifier,
    });

    return {};
  }

  function playBeerCard(context) {
    const { client, room, actor, card, configForCard } = context;
    const healed = applyBeerAction(client, room, actor, configForCard);

    if (!healed) return false;

    markTurnActionTaken(room);
    addBeerEvent(room, actor, card, configForCard);
    return {};
  }

  function playSaloonCard(context) {
    const { client, room, actor, card, configForCard } = context;
    const healedPlayers = applySaloonAction(client, room, configForCard);

    if (!healedPlayers) return false;

    markTurnActionTaken(room);
    addCardOnlyEvent(room, actor, card, configForCard);
    addGroupHealEvent(room, healedPlayers, configForCard);
    return {};
  }

  function playDrawCardsCard(context) {
    const { room, actor, card, cardIndex, configForCard } = context;
    const discardedCard = takeCardFromHand(room, actor, cardIndex);

    drawCards(room, actor.playerId, configForCard.drawCount || 1);
    discardPlayedCards(room, actor, discardedCard);
    markTurnActionTaken(room);
    addCardDrawEvent(room, actor, card, configForCard);
    broadcastRoom(room.id);
    return { completed: true };
  }

  function playGeneralStoreCard(context) {
    const { client, room, actor, card, cardIndex, configForCard } = context;
    const alivePlayers = getAlivePlayersInTurnOrder(room, actor.playerId);

    if (alivePlayers.length === 0) {
      sendError(client.socket, "Некому выбирать карты");
      return false;
    }

    const storeCards = drawCardsFromDeck(room, alivePlayers.length);

    if (storeCards.length === 0) {
      sendError(client.socket, "В колоде нет карт");
      return false;
    }

    const discardedCard = takeCardFromHand(room, actor, cardIndex);

    discardPlayedCards(room, actor, discardedCard);
    markTurnActionTaken(room);
    addCardOnlyEvent(room, actor, card, configForCard);
    startGeneralStore(room, alivePlayers, storeCards);
    broadcastRoom(room.id);

    return { completed: true };
  }

  function playEquipWeaponCard(context) {
    const { room, actor, card, cardIndex, configForCard } = context;

    const replacedWeapon = equipWeapon(room, actor, card, configForCard);
    takeCardFromHand(room, actor, cardIndex);
    markTurnActionTaken(room);
    addGameEvent(room, {
      type: "equip",
      actorName: actor.name,
      actorRoleId: actor.roleId,
      cardId: card.cardId,
      cardTitle: getCardEventTitle(card),
      cardColor: configForCard.eventColor,
    });
    if (replacedWeapon) {
      addDiscardEvent(room, actor, replacedWeapon);
    }
    broadcastRoom(room.id);
    return { completed: true };
  }

  function playBlueCardFromHand(context) {
    const { client, room, actor, card, cardIndex, configForCard } = context;

    if (hasBlueCardInPlay(actor, card.cardId)) {
      sendError(client.socket, "Такая карта уже на столе");
      return false;
    }

    playBlueCard(actor, card);
    takeCardFromHand(room, actor, cardIndex);
    markTurnActionTaken(room);
    addCardOnlyEvent(room, actor, card, configForCard);
    broadcastRoom(room.id);
    return { completed: true };
  }

  function playBlueCardOnTargetFromHand(context) {
    const { client, room, payload, actor, card, cardIndex, configForCard } =
      context;
    const result = playBlueCardOnTarget(
      client,
      room,
      actor,
      card,
      configForCard,
      payload,
    );

    if (!result) return false;

    takeCardFromHand(room, actor, cardIndex);
    markTurnActionTaken(room);
    addGameEvent(room, {
      type: "card",
      actorName: actor.name,
      actorRoleId: actor.roleId,
      cardId: card.cardId,
      cardTitle: getCardEventTitle(card),
      cardColor: configForCard.eventColor,
      targetName: result.targetPlayer.name,
      targetRoleId: result.targetPlayer.roleId,
    });
    broadcastRoom(room.id);
    return { completed: true };
  }

  function applyBeerAction(client, room, actor, configForCard) {
    if (actor.health >= actor.maxHealth) {
      sendError(client.socket, "Здоровье уже полное");
      return false;
    }

    healPlayer(actor, configForCard.healAmount || 1);
    return true;
  }

  function healPlayer(player, amount = 1) {
    player.health = Math.min(player.maxHealth, player.health + amount);
  }

  function canHealPlayer(player) {
    return player.isAlive && player.health < player.maxHealth;
  }

  function applySaloonAction(client, room, configForCard) {
    const playersToHeal = getAlivePlayers(room).filter(canHealPlayer);

    if (playersToHeal.length === 0) {
      sendError(client.socket, "Некого лечить");
      return false;
    }

    playersToHeal.forEach((player) => {
      healPlayer(player, configForCard.healAmount || 1);
    });

    return playersToHeal;
  }

  function addBeerEvent(room, actor, card, configForCard) {
    addGameEvent(room, {
      type: "heal",
      actorName: actor.name,
      actorRoleId: actor.roleId,
      cardId: card.cardId,
      cardTitle: getCardEventTitle(card),
      cardColor: configForCard.eventColor,
      amount: configForCard.healAmount || 1,
    });
  }

  function addDiscardEvent(room, actor, cards, options = {}) {
    const discardCards = Array.isArray(cards) ? cards : [cards];
    const eventCards = (options.eventCards || discardCards)
      .filter(Boolean)
      .map((card) => ({
        cardId: card.cardId,
        cardTitle: card.cardTitle || getCardEventTitle(card),
        cardColor: card.cardColor || getCardEventColor(card),
      }));

    if (eventCards.length === 0) return;

    const lastEvent = room.game.events[room.game.events.length - 1] || null;

    if (
      lastEvent?.type === "discard" &&
      lastEvent.actorPlayerId === actor.playerId
    ) {
      const previousCards = Array.isArray(lastEvent.cards)
        ? lastEvent.cards
        : [
            {
              cardId: lastEvent.cardId,
              cardTitle: lastEvent.cardTitle,
              cardColor: lastEvent.cardColor,
            },
          ].filter((card) => card.cardId || card.cardTitle);
      const mergedCards = [...previousCards, ...eventCards];

      lastEvent.cards = mergedCards;
      lastEvent.cardId = mergedCards[0].cardId;
      lastEvent.cardTitle = mergedCards[0].cardTitle;
      lastEvent.cardColor = mergedCards[0].cardColor;
      return;
    }

    addGameEvent(room, {
      type: "discard",
      actorPlayerId: actor.playerId,
      actorName: actor.name,
      actorRoleId: actor.roleId,
      cardId: eventCards[0].cardId,
      cardTitle: eventCards[0].cardTitle,
      cardColor: eventCards[0].cardColor,
      cards: eventCards,
    });
  }

  function addCharacterHealEvent(room, actor, amount = 1) {
    addGameEvent(room, {
      type: "heal",
      actorName: actor.name,
      actorRoleId: actor.roleId,
      cardColor: cardConfig.beer.eventColor,
      amount,
    });
  }

  function addLifeSavingBeerEvent(room, actor, card, configForCard) {
    addGameEvent(room, {
      type: "lifeSavingBeer",
      actorName: actor.name,
      actorRoleId: actor.roleId,
      cardId: card.cardId,
      cardTitle: "СПАСИТЕЛЬНОЕ ПИВО",
      cardColor: configForCard.eventColor,
    });
  }

  function addCardOnlyEvent(room, actor, card, configForCard) {
    addGameEvent(room, {
      type: "cardOnly",
      actorName: actor.name,
      actorRoleId: actor.roleId,
      cardId: card.cardId,
      cardTitle: getCardEventTitle(card),
      cardColor: configForCard.eventColor,
      previewCard: getReactionEventPreviewCard(
        room,
        actor,
        card,
        configForCard,
      ),
    });
  }

  function getReactionEventPreviewCard(room, actor, card, configForCard) {
    if (!["gatling", "indians"].includes(configForCard?.action)) return null;

    return getPublicCard(room, actor, card, { includePlayState: false });
  }

  function addGroupHealEvent(room, players, configForCard) {
    addGameEvent(room, {
      type: "groupHeal",
      players: players.map((player) => ({
        playerId: player.playerId,
        name: player.name,
        roleId: player.roleId,
      })),
      cardColor: configForCard.eventColor,
      amount: configForCard.healAmount || 1,
    });
  }

  function addCardDrawEvent(room, actor, card, configForCard) {
    addGameEvent(room, {
      type: "cardDraw",
      actorName: actor.name,
      actorRoleId: actor.roleId,
      cardId: card.cardId,
      cardTitle: getCardEventTitle(card),
      cardColor: configForCard.eventColor,
      cardsCount: configForCard.drawCount || 1,
    });
  }

  function equipWeapon(room, actor, card, configForCard) {
    let replacedWeapon = null;

    if (actor.weapon) {
      replacedWeapon = actor.weapon;
      clearWeaponPropertyAllowances(room, actor);
      room.game.discard.push(actor.weapon);
    }

    actor.weapon = card;
    actor.attackRange = configForCard.weaponRange || config.defaultAttackRange;

    return replacedWeapon;
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
      cardId: actor.weapon.cardId,
      cardTitle: getCardEventTitle(actor.weapon),
      cardColor: weaponConfig.eventColor,
    });
  }

  function activateWeaponProperty(client, room) {
    if (hasRequiredTurnCheck(room, client.playerId)) {
      sendError(client.socket, "Сначала проверьте карту на столе");
      return;
    }

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

    if (hasActiveCharacterAbilityEffect(room, actor.playerId, "unlockBangLimit")) {
      clearActiveCharacterAbility(room, actor.playerId);
    }

    addTurnEffectAllowance(
      room,
      actor.playerId,
      weaponConfig.propertyEffectLimitKey,
      weaponConfig.propertyCharges || 1,
    );
    broadcastRoom(room.id);
  }

  function activateCharacterAbility(client, room) {
    const actor = room.seats.find(
      (seat) => seat.player?.playerId === client.playerId,
    )?.player;
    const character = actor?.characterId
      ? characterConfig[actor.characterId]
      : null;

    if (!actor || !character?.ability) {
      sendError(client.socket, "У персонажа нет активного свойства");
      return;
    }

    if (character.ability.trigger !== "activate") {
      sendError(client.socket, "Это свойство не активируется вручную");
      return;
    }

    if (
      ![
        "convertBangMissed",
        "drawDiscardTop",
        "chooseCheckCard",
        "revealSecondDrawSuitBonus",
        "discardCardsToHeal",
        "characterBarrelCheck",
        "drawFromOpponentHandOnDrawPhase",
        "unlockBangLimit",
        "chooseDeckTopCards",
      ].includes(character.ability.effect)
    ) {
      sendError(client.socket, "Это свойство пока не поддерживается");
      return;
    }

    if (character.ability.effect === "characterBarrelCheck") {
      if (!canActivateCharacterAbility(room, actor, character.ability.effect)) {
        sendError(client.socket, "Сейчас нельзя активировать это свойство");
        return;
      }

      checkCharacterBarrelReaction(client, room);
      return;
    }

    if (hasActiveCharacterAbility(room, actor.playerId)) {
      clearActiveCharacterAbility(room, actor.playerId);
      broadcastRoom(room.id);
      return;
    }

    if (!canActivateCharacterAbility(room, actor, character.ability.effect)) {
      sendError(client.socket, "Сейчас нельзя активировать это свойство");
      return;
    }

    if (character.ability.effect === "unlockBangLimit") {
      clearTurnEffectAllowance(
        room,
        actor.playerId,
        cardConfig.bang.effectLimitKey,
      );
    }

    setActiveCharacterAbility(room, actor.playerId, {
      characterId: character.id,
      effect: character.ability.effect,
    });
    broadcastRoom(room.id);
  }

  function canActivateCharacterAbility(room, player, effect) {
    if (effect === "convertBangMissed") {
      return canActivateBangMissedConversion(room, player);
    }

    if (effect === "drawDiscardTop") {
      return canActivateDrawDiscardTop(room, player);
    }

    if (effect === "revealSecondDrawSuitBonus") {
      return canActivateDrawPhaseAbility(room, player);
    }

    if (effect === "drawFromOpponentHandOnDrawPhase") {
      return canActivateDrawFromOpponentHand(room, player);
    }

    if (effect === "characterBarrelCheck") {
      return canCheckCharacterBarrelForPendingReaction(room, player);
    }

    if (effect === "unlockBangLimit") {
      return canActivateBangLimitUnlock(room, player);
    }

    if (effect === "chooseDeckTopCards") {
      return canActivateDrawPhaseAbility(room, player);
    }

    if (effect === "discardCardsToHeal") {
      return canActivateDiscardCardsToHeal(room, player);
    }

    if (effect === "chooseCheckCard") {
      return canActivateCheckCardChoice(room, player);
    }

    return false;
  }

  function getEffectiveCardConfig(room, player, card, configForCard) {
    return (
      getActiveCharacterConversion(room, player, card, configForCard)
        ?.targetConfig || configForCard
    );
  }

  function getActiveCharacterConversion(room, player, card, configForCard) {
    const activeAbility =
      room.game.activeCharacterAbilities?.[player?.playerId] || null;

    if (
      !activeAbility ||
      activeAbility.characterId !== player?.characterId ||
      activeAbility.effect !== "convertBangMissed"
    ) {
      return null;
    }

    if (card.cardId === "bang" && canUseBangAsMissed(room, player)) {
      return createCharacterConversion(
        player,
        configForCard,
        cardConfig.missed,
      );
    }

    if (
      card.cardId === "missed" &&
      (canUseMissedAsBangReaction(room, player) ||
        canUseMissedAsBang(room, player))
    ) {
      return createCharacterConversion(player, configForCard, cardConfig.bang);
    }

    return null;
  }

  function createCharacterConversion(player, sourceConfig, targetConfig) {
    return {
      characterId: player.characterId,
      characterTitle: characterConfig[player.characterId]?.title,
      sourceConfig,
      targetConfig,
    };
  }

  function canActivateBangMissedConversion(room, player) {
    if (room.game.pendingReaction) {
      return (
        (canUseBangAsMissed(room, player) &&
          player.hand.some((card) => card.cardId === "bang")) ||
        (canUseMissedAsBangReaction(room, player) &&
          player.hand.some((card) => card.cardId === "missed"))
      );
    }

    return (
      canActivateMissedAsBang(room, player) &&
      player.hand.some((card) => card.cardId === "missed")
    );
  }

  function canUseBangAsMissed(room, player) {
    const pendingReaction = room.game.pendingReaction;

    return Boolean(
      pendingReaction &&
      player?.isAlive &&
      isPendingReactionTarget(pendingReaction, player.playerId) &&
      isReactionAllowed(pendingReaction, player, cardConfig.missed),
    );
  }

  function canUseMissedAsBangReaction(room, player) {
    const pendingReaction = room.game.pendingReaction;

    return Boolean(
      pendingReaction &&
      player?.isAlive &&
      isPendingReactionTarget(pendingReaction, player.playerId) &&
      isReactionAllowed(pendingReaction, player, cardConfig.bang),
    );
  }

  function canUseMissedAsBang(room, player) {
    const bangLimitKey = cardConfig.bang.effectLimitKey;

    return Boolean(
      canActivateMissedAsBang(room, player) &&
      (!hasTurnEffectBeenPlayed(room, player.playerId, bangLimitKey) ||
        hasTurnEffectAllowance(room, player.playerId, bangLimitKey)),
    );
  }

  function canActivateMissedAsBang(room, player) {
    return Boolean(
      !room.game.pendingReaction &&
      !room.game.generalStore &&
      !room.game.pendingCheckChoice &&
      player?.isAlive &&
      room.game.turnPlayerId === player.playerId &&
      !hasRequiredTurnCheck(room, player.playerId),
    );
  }

  function canActivateDrawDiscardTop(room, player) {
    return Boolean(
      canActivateDrawPhaseAbility(room, player) && getTopDiscardCard(room),
    );
  }

  function canActivateDrawFromOpponentHand(room, player) {
    return Boolean(
      canActivateDrawPhaseAbility(room, player) &&
      getAlivePlayers(room).some(
        (targetPlayer) => targetPlayer.playerId !== player?.playerId,
      ),
    );
  }

  function canActivateBangLimitUnlock(room, player) {
    return canActivateMissedAsBang(room, player);
  }

  function canActivateDrawPhaseAbility(room, player) {
    return Boolean(
      !room.game.pendingReaction &&
      !room.game.generalStore &&
      !room.game.pendingCheckChoice &&
      player?.isAlive &&
      room.game.turnPlayerId === player.playerId &&
      !hasRequiredTurnCheck(room, player.playerId) &&
      !room.game.turnDrawTaken &&
      !room.game.turnActionTaken,
    );
  }

  function canActivateCheckCardChoice(room, player) {
    return Boolean(
      player?.isAlive &&
      !room.game.generalStore &&
      !room.game.pendingCheckChoice &&
      (canCheckTurnBlueCardNow(room, player) ||
        canCheckBarrelForPendingReaction(room, player)),
    );
  }

  function canCheckCharacterBarrelForPendingReaction(room, player) {
    const pendingReaction = room.game.pendingReaction;
    const ability = characterConfig[player?.characterId]?.ability;

    return Boolean(
      pendingReaction &&
      player?.isAlive &&
      ability?.effect === "characterBarrelCheck" &&
      isPendingReactionTarget(pendingReaction, player.playerId) &&
      isBarrelAllowedForReaction(pendingReaction) &&
      !pendingReaction.characterBarrelCheckUsage?.[player.playerId],
    );
  }

  function canActivateDiscardCardsToHeal(room, player) {
    const character = characterConfig[player?.characterId];
    const requiredCards = character?.ability?.requiredCards || 2;

    return Boolean(
      player?.isAlive &&
      !room.game.generalStore &&
      !room.game.pendingCheckChoice &&
      !room.game.pendingCharacterPayment &&
      player.health < player.maxHealth &&
      getPlayerPaymentCardsCount(player) >= requiredCards,
    );
  }

  function getPlayerPaymentCardsCount(player) {
    return (
      (player?.hand?.length || 0) +
      (player?.blueCards?.length || 0) +
      (player?.weapon ? 1 : 0)
    );
  }

  function getReactionModifier(room, actor, sourceAction) {
    const character = actor?.characterId
      ? characterConfig[actor.characterId]
      : null;
    const ability = character?.ability;

    if (
      ability?.trigger !== "passive" ||
      ability?.effect !== "requiresExtraMissed" ||
      !ability.sourceActions?.includes(sourceAction)
    ) {
      return null;
    }

    return {
      characterId: character.id,
      characterTitle: character.title,
      effect: ability.effect,
      reactionAction: ability.reactionAction || "missed",
      requiredCount: ability.requiredCount || 2,
    };
  }

  function hasActiveCharacterAbility(room, playerId) {
    return Boolean(room.game.activeCharacterAbilities?.[playerId]);
  }

  function hasActiveCharacterAbilityEffect(room, playerId, effect) {
    return room.game.activeCharacterAbilities?.[playerId]?.effect === effect;
  }

  function setActiveCharacterAbility(room, playerId, ability) {
    room.game.activeCharacterAbilities ||= {};
    room.game.activeCharacterAbilities[playerId] = ability;
  }

  function clearActiveCharacterAbility(room, playerId) {
    if (!room.game.activeCharacterAbilities) return;

    delete room.game.activeCharacterAbilities[playerId];
  }

  function addCharacterPropertyUseEvent(room, actor, conversion) {
    addGameEvent(room, {
      type: "characterPropertyUse",
      actorName: actor.name,
      actorRoleId: actor.roleId,
      characterId: actor.characterId,
      characterTitle: conversion.characterTitle,
      sourceCardId: conversion.sourceConfig.id,
      sourceCardTitle: getConfigEventTitle(conversion.sourceConfig),
      sourceCardColor: conversion.sourceConfig.eventColor,
      targetCardId: conversion.targetConfig.id,
      targetCardTitle: getConfigEventTitle(conversion.targetConfig),
      targetCardColor: conversion.targetConfig.eventColor,
    });
  }

  function addCharacterAbilityUseEvent(room, actor, options = {}) {
    addGameEvent(room, {
      type: "characterAbilityUse",
      actorName: actor.name,
      actorRoleId: actor.roleId,
      characterId: actor.characterId,
      characterTitle: characterConfig[actor.characterId]?.title,
      ...options,
    });
  }

  function discardPlayedCards(room, actor, cards) {
    const playedCards = Array.isArray(cards)
      ? cards.filter(Boolean)
      : [cards].filter(Boolean);

    playedCards.forEach((card) => {
      room.game.discard.push(card);
      tryTriggerPlayedCardReturnCharacterAbility(room, actor, card);
    });
  }

  function tryTriggerPlayedCardReturnCharacterAbility(room, player, card) {
    const ability = characterConfig[player?.characterId]?.ability;

    if (
      !player?.isAlive ||
      !card ||
      ability?.trigger !== "passive" ||
      ability.effect !== "returnPlayedCardToHand"
    ) {
      return false;
    }

    const chancePercent = Math.max(
      0,
      Math.min(100, Number(ability.chancePercent ?? 33) || 0),
    );

    if (chancePercent <= 0) {
      return false;
    }

    if (chancePercent < 100 && randomInt(100) >= chancePercent) {
      return false;
    }

    const discardIndex = room.game.discard.lastIndexOf(card);

    if (discardIndex === -1) {
      return false;
    }

    room.game.discard.splice(discardIndex, 1);
    addCardsToHand(room, player, card);
    addCharacterAbilityUseEvent(room, player, {
      effect: "returnPlayedCardToHand",
    });
    return true;
  }

  function transferRandomHandCard(room, fromPlayer, toPlayer, options = {}) {
    if (!fromPlayer || !toPlayer || fromPlayer.playerId === toPlayer.playerId) {
      return null;
    }

    if (!fromPlayer.hand?.length) {
      return null;
    }

    const cardIndex = randomInt(fromPlayer.hand.length);
    const card = takeCardFromHand(room, fromPlayer, cardIndex, {
      allowEmptyHandAbilities: options.allowEmptyHandAbilities !== false,
    });

    if (!card) {
      return null;
    }

    addCardsToHand(room, toPlayer, card, {
      allowEmptyHandAbilities: options.allowEmptyHandAbilities !== false,
    });

    return card;
  }

  function drawCardsWithOpponentHand(client, room, actor, targetPlayerId) {
    const normalizedTargetPlayerId = normalizePlayerId(targetPlayerId);

    if (!normalizedTargetPlayerId || normalizedTargetPlayerId === actor.playerId) {
      sendError(client.socket, "Выберите другого игрока");
      return false;
    }

    const targetPlayer = room.seats.find(
      (seat) => seat.player?.playerId === normalizedTargetPlayerId,
    )?.player;

    if (!targetPlayer?.isAlive) {
      sendError(client.socket, "Игрок не найден");
      return false;
    }

    const stolenCard = transferRandomHandCard(room, targetPlayer, actor);

    if (stolenCard) {
      addGameEvent(room, {
        type: "characterAbility",
        effect: "drawFromOpponentHandOnDrawPhase",
        actorName: actor.name,
        actorRoleId: actor.roleId,
        characterId: actor.characterId,
        characterTitle: characterConfig[actor.characterId]?.title,
        targetName: targetPlayer.name,
        targetRoleId: targetPlayer.roleId,
      });
      drawCards(room, actor.playerId, 1);
      return true;
    }

    drawCards(room, actor.playerId, 2);
    return true;
  }

  function tryTriggerOnHealthLossCharacterAbility(
    room,
    player,
    damageSourcePlayerId = null,
    options = {},
  ) {
    const ability = characterConfig[player?.characterId]?.ability;

    if (
      !player?.isAlive ||
      ability?.trigger !== "passive"
    ) {
      return false;
    }

    if (ability.effect === "takeRandomHandCardOnHealthLoss") {
      if (!damageSourcePlayerId) {
        return false;
      }

      const damageSourcePlayer = room.seats.find(
        (seat) => seat.player?.playerId === damageSourcePlayerId,
      )?.player;

      if (!damageSourcePlayer?.isAlive || !damageSourcePlayer.hand?.length) {
        return false;
      }

      const stolenCard = transferRandomHandCard(
        room,
        damageSourcePlayer,
        player,
      );

      if (!stolenCard) {
        return false;
      }

      addGameEvent(room, {
        type: "characterAbility",
        effect: "takeRandomHandCardOnHealthLoss",
        actorName: player.name,
        actorRoleId: player.roleId,
        characterId: player.characterId,
        characterTitle: characterConfig[player.characterId]?.title,
        targetName: damageSourcePlayer.name,
        targetRoleId: damageSourcePlayer.roleId,
      });

      return true;
    }

    if (ability.effect === "drawDeckOnHealthLoss") {
      let activated = false;

      for (let index = 0; index < options.amount; index += 1) {
        const drawnCards = drawCards(room, player.playerId, 1);

        if (drawnCards.length === 0) {
          break;
        }

        addCharacterAbilityUseEvent(room, player, {
          effect: "drawDeckOnHealthLoss",
        });
        activated = true;
      }

      return activated;
    }

    return false;
  }

  function takeCardFromHand(room, player, cardIndex, options = {}) {
    if (
      !player ||
      !Number.isInteger(cardIndex) ||
      cardIndex < 0 ||
      cardIndex >= player.hand.length
    ) {
      return null;
    }

    const [card] = player.hand.splice(cardIndex, 1);

    afterPlayerHandChanged(room, player, {
      allowEmptyHandAbilities: options.allowEmptyHandAbilities !== false,
    });
    return card || null;
  }

  function addCardsToHand(room, player, cards, options = {}) {
    const nextCards = Array.isArray(cards)
      ? cards.filter(Boolean)
      : [cards].filter(Boolean);

    if (!player || nextCards.length === 0) return [];

    if (options.position === "end") {
      player.hand.push(...nextCards);
    } else {
      player.hand.unshift(...nextCards);
    }

    afterPlayerHandChanged(room, player, {
      allowEmptyHandAbilities: options.allowEmptyHandAbilities !== false,
    });
    return nextCards;
  }

  function clearPlayerHand(room, player) {
    if (!player?.hand.length) return [];

    const cards = [...player.hand];

    player.hand = [];
    afterPlayerHandChanged(room, player);
    return cards;
  }

  function selectCharacterPaymentCard(client, room, payload = {}) {
    const actor = room.seats.find(
      (seat) => seat.player?.playerId === client.playerId,
    )?.player;
    const activeAbility =
      room.game.activeCharacterAbilities?.[client.playerId] || null;
    const payment = room.game.pendingCharacterPayment || null;

    if (!actor?.isAlive) {
      sendError(client.socket, "Игрок не найден");
      return;
    }

    if (payment && payment.playerId !== client.playerId) {
      sendError(client.socket, "Сейчас свойство оплачивает другой игрок");
      return;
    }

    if (
      !payment &&
      (activeAbility?.characterId !== actor.characterId ||
        activeAbility?.effect !== "discardCardsToHeal")
    ) {
      sendError(client.socket, "Сначала активируйте свойство персонажа");
      return;
    }

    if (!payment && !canActivateDiscardCardsToHeal(room, actor)) {
      clearActiveCharacterAbility(room, actor.playerId);
      sendError(client.socket, "Сейчас нельзя оплатить это свойство");
      broadcastRoom(room.id);
      return;
    }

    const paymentCard = takeCharacterPaymentCard(room, actor, payload);

    if (!paymentCard) {
      sendError(client.socket, "Эту карту нельзя выбрать");
      return;
    }

    const nextPayment =
      payment ||
      createCharacterPayment(room, actor, characterConfig[actor.characterId]);

    nextPayment.cards.push(paymentCard);
    room.game.pendingCharacterPayment = nextPayment;

    if (nextPayment.cards.length < nextPayment.requiredCount) {
      broadcastRoom(room.id);
      return;
    }

    resolveCharacterPayment(room, actor, nextPayment);
    broadcastRoom(room.id);
  }

  function cancelCharacterPayment(client, room) {
    const payment = room.game.pendingCharacterPayment;

    if (!payment) {
      const actor = room.seats.find(
        (seat) => seat.player?.playerId === client.playerId,
      )?.player;

      if (actor) {
        clearActiveCharacterAbility(room, actor.playerId);
        broadcastRoom(room.id);
      }
      return;
    }

    if (payment.playerId !== client.playerId) {
      sendError(client.socket, "Нельзя отменить чужое свойство");
      return;
    }

    restoreCharacterPayment(room, payment);
    room.game.pendingCharacterPayment = null;
    clearActiveCharacterAbility(room, payment.playerId);
    broadcastRoom(room.id);
  }

  function createCharacterPayment(room, player, character) {
    clearActiveCharacterAbility(room, player.playerId);

    return {
      id: randomUUID(),
      playerId: player.playerId,
      characterId: character.id,
      characterTitle: character.title,
      effect: character.ability.effect,
      requiredCount: character.ability.requiredCards || 2,
      healAmount: character.ability.healAmount || 1,
      cards: [],
    };
  }

  function takeCharacterPaymentCard(room, player, payload) {
    if (payload.source === "weapon") {
      if (!player.weapon) return null;

      const card = player.weapon;
      clearWeaponPropertyAllowances(room, player);
      player.weapon = null;
      player.attackRange = config.defaultAttackRange;
      return {
        card,
        source: "weapon",
        index: 0,
      };
    }

    if (payload.source === "blue") {
      const cardIndex =
        player.blueCards?.findIndex(
          (card) => card.instanceId === payload.cardInstanceId,
        ) ?? -1;

      if (cardIndex === -1) return null;

      const [card] = player.blueCards.splice(cardIndex, 1);

      if (room.game.turnCheck?.playerId === player.playerId) {
        setNextTurnCheck(room, player);
      }

      return {
        card,
        source: "blue",
        index: cardIndex,
      };
    }

    const cardIndex = player.hand.findIndex(
      (card) => card.instanceId === payload.cardInstanceId,
    );

    if (cardIndex === -1) return null;

    return {
      card: takeCardFromHand(room, player, cardIndex, {
        allowEmptyHandAbilities: false,
      }),
      source: "hand",
      index: cardIndex,
    };
  }

  function restoreCharacterPayment(room, payment) {
    const player = room.seats.find(
      (seat) => seat.player?.playerId === payment.playerId,
    )?.player;

    if (!player) {
      room.game.discard.push(...payment.cards.map((entry) => entry.card));
      return;
    }

    [...payment.cards].reverse().forEach((entry) => {
      if (entry.source === "weapon") {
        if (player.weapon) {
          room.game.discard.push(entry.card);
          return;
        }

        player.weapon = entry.card;
        player.attackRange = cardConfig[entry.card.cardId]?.weaponRange || 1;
        return;
      }

      if (entry.source === "blue") {
        player.blueCards ||= [];
        player.blueCards.splice(
          Math.min(entry.index, player.blueCards.length),
          0,
          entry.card,
        );
        if (room.game.turnPlayerId === player.playerId) {
          setNextTurnCheck(room, player);
        }
        return;
      }

      player.hand.splice(
        Math.min(entry.index, player.hand.length),
        0,
        entry.card,
      );
      afterPlayerHandChanged(room, player, {
        allowEmptyHandAbilities: false,
      });
    });
  }

  function resolveCharacterPayment(room, actor, payment) {
    room.game.pendingCharacterPayment = null;
    const discardedCards = payment.cards.map((entry) => entry.card);

    room.game.discard.push(...discardedCards);
    addCharacterAbilityUseEvent(room, actor, {
      effect: payment.effect,
    });
    addDiscardEvent(room, actor, discardedCards);
    healPlayer(actor, payment.healAmount);
    addCharacterHealEvent(room, actor, payment.healAmount);
  }

  function afterPlayerHandChanged(room, player, options = {}) {
    const { allowEmptyHandAbilities = true } = options;

    if (!allowEmptyHandAbilities) return;

    room.game.handChangedPlayerIds ||= new Set();
    room.game.handChangedPlayerIds.add(player.playerId);
  }

  function flushHandChangedPlayers(room) {
    if (!room.game?.handChangedPlayerIds?.size) return;

    const playerIds = [...room.game.handChangedPlayerIds];

    room.game.handChangedPlayerIds.clear();

    playerIds.forEach((playerId) => {
      const player = room.seats.find(
        (seat) => seat.player?.playerId === playerId,
      )?.player;

      if (player) {
        tryTriggerEmptyHandCharacterAbility(room, player);
      }
    });
  }

  function tryTriggerEmptyHandCharacterAbility(room, player) {
    const ability = characterConfig[player?.characterId]?.ability;

    if (
      !player?.isAlive ||
      player.hand.length > 0 ||
      ability?.trigger !== "passive" ||
      ability?.effect !== "emptyHandDrawDeck"
    ) {
      return false;
    }

    const drawnCards = drawCards(room, player.playerId, 1);

    if (drawnCards.length === 0) return false;

    addCharacterAbilityUseEvent(room, player, {
      effect: "emptyHandDrawDeck",
    });
    return true;
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

    return { targetPlayer, healthLoss };
  }

  function applyDirectTargetAction(client, room, payload = {}) {
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

    return { targetPlayer, healthLoss: 1 };
  }

  function takeTargetTableCard(
    client,
    room,
    actor,
    configForCard,
    payload = {},
  ) {
    const targetPlayerId = normalizePlayerId(payload.targetPlayerId);

    if (!targetPlayerId || targetPlayerId === actor.playerId) {
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

    if (configForCard.panicDistance) {
      const distance = getPlayerDistance(room, actor.playerId, targetPlayerId);

      if (!distance || distance > configForCard.panicDistance) {
        sendError(client.socket, "Цель слишком далеко");
        return false;
      }
    }

    const targetCard = takeTargetCard(room, targetPlayer, payload);

    if (!targetCard) {
      sendError(client.socket, "Карту нельзя выбрать");
      return false;
    }

    return { targetPlayer, targetCard };
  }

  function takeTargetCard(room, targetPlayer, payload = {}) {
    if (payload.source === "weapon") {
      const weapon = targetPlayer.weapon || null;

      clearWeaponPropertyAllowances(room, targetPlayer);
      targetPlayer.weapon = null;
      targetPlayer.attackRange = config.defaultAttackRange;
      return weapon;
    }

    if (payload.source === "blue") {
      const cardIndex =
        targetPlayer.blueCards?.findIndex(
          (card) => card.instanceId === payload.targetCardInstanceId,
        ) ?? -1;

      if (cardIndex === -1) return null;

      const [card] = targetPlayer.blueCards.splice(cardIndex, 1);

      return card;
    }

    if (payload.source === "hand") {
      if (!targetPlayer.hand?.length) {
        return null;
      }

      const cardIndex = randomInt(targetPlayer.hand.length);
      const card = takeCardFromHand(room, targetPlayer, cardIndex);

      return card;
    }

    return null;
  }

  function applyGatlingAction(client, room) {
    const targetPlayers = getAlivePlayers(room).filter(
      (player) => player.playerId !== client.playerId,
    );

    if (targetPlayers.length === 0) {
      sendError(client.socket, "Некого атаковать");
      return false;
    }

    return { targetPlayers, healthLoss: 1 };
  }

  function startPendingReaction(room, reaction) {
    clearPendingReaction(room);
    const targetPlayerIds =
      reaction.targetPlayerIds ||
      (reaction.targetPlayerId ? [reaction.targetPlayerId] : []);

    room.game.pendingReaction = {
      id: randomUUID(),
      ...reaction,
      targetPlayerIds,
      targetPlayerId: reaction.targetPlayerId || targetPlayerIds[0] || null,
      healthLoss: reaction.healthLoss || 1,
      barrelChecks: {},
      barrelCheckUsage: {},
      characterBarrelCheckUsage: {},
      reactionProgress: {},
      expiresAt: Date.now() + config.reactionWindowMs,
    };
    room.pendingReactionTimer = setTimeout(() => {
      resolvePendingReactionTimeout(room);
    }, config.reactionWindowMs);
  }

  function resolvePendingReactionTimeout(room) {
    const pendingReaction = room.game.pendingReaction;

    if (!pendingReaction) return;

    returnPartialReactionCards(room, pendingReaction);

    const targetPlayers = getPendingReactionTargetIds(pendingReaction)
      .map(
        (targetPlayerId) =>
          room.seats.find((seat) => seat.player?.playerId === targetPlayerId)
            ?.player,
      )
      .filter(Boolean);
    const actor = room.seats.find(
      (seat) => seat.player?.playerId === pendingReaction.actorPlayerId,
    )?.player;

    clearPendingReaction(room);

    const defeatedPlayers = [];

    targetPlayers
      .filter((targetPlayer) => targetPlayer.isAlive)
      .forEach((targetPlayer) => {
        applyHealthLoss(room, targetPlayer, pendingReaction.healthLoss, {
          sourcePlayerId: pendingReaction.actorPlayerId || null,
          sourceAction: pendingReaction.sourceAction || "",
          silent: pendingReaction.sourceAction === "dynamite",
          reasonText:
            pendingReaction.sourceAction === "duel" ? "проиграл дуэль" : "",
        });
        if (revealDeadPlayer(room, targetPlayer)) {
          defeatedPlayers.push(targetPlayer);
        }
      });

    if (!checkVictory(room)) {
      defeatedPlayers.forEach((targetPlayer) => {
        applyDeathRewards(room, targetPlayer, actor);
      });
    }

    const turnPlayer = room.seats.find(
      (seat) => seat.player?.playerId === room.game.turnPlayerId,
    )?.player;

    if (turnPlayer && !turnPlayer.isAlive && !room.game.winner) {
      completeTurn(room, turnPlayer.playerId);
    }

    broadcastRoom(room.id);
  }

  function applyHealthLoss(room, player, amount = 1, options = {}) {
    player.health = Math.max(0, player.health - amount);

    if (!options.silent) {
      addGameEvent(room, {
        type: "healthLoss",
        playerName: player.name,
        playerRoleId: player.roleId,
        reasonText: options.reasonText || "",
        amount,
      });
    }

    tryTriggerOnHealthLossCharacterAbility(
      room,
      player,
      options.sourcePlayerId || null,
      {
        amount,
        sourceAction: options.sourceAction || "",
      },
    );
  }

  function clearPendingReaction(room) {
    const pendingReaction = room.game?.pendingReaction;

    if (pendingReaction) {
      getPendingReactionTargetIds(pendingReaction).forEach((playerId) => {
        clearActiveCharacterAbility(room, playerId);
      });
    }

    clearPendingReactionTimer(room);

    if (room.game) {
      room.game.pendingReaction = null;
    }
  }

  function clearPendingReactionTimer(room) {
    if (!room.pendingReactionTimer) return;

    clearTimeout(room.pendingReactionTimer);
    room.pendingReactionTimer = null;
  }

  function restartPendingReactionTimer(room) {
    clearPendingReactionTimer(room);

    if (!room.game.pendingReaction) return;

    room.game.pendingReaction = {
      ...room.game.pendingReaction,
      expiresAt: Date.now() + config.reactionWindowMs,
    };
    room.pendingReactionTimer = setTimeout(() => {
      resolvePendingReactionTimeout(room);
    }, config.reactionWindowMs);
  }

  function getPendingReactionTargetIds(pendingReaction) {
    return pendingReaction.targetPlayerIds?.length
      ? pendingReaction.targetPlayerIds
      : [pendingReaction.targetPlayerId].filter(Boolean);
  }

  function isPendingReactionTarget(pendingReaction, playerId) {
    return getPendingReactionTargetIds(pendingReaction).includes(playerId);
  }

  function getRequiredReactionCount(pendingReaction, action) {
    const modifier = pendingReaction?.reactionModifier;

    if (modifier?.reactionAction !== action) return 1;

    return Math.max(1, modifier.requiredCount || 1);
  }

  function getReactionProgress(pendingReaction, playerId, action) {
    const progress = pendingReaction?.reactionProgress?.[playerId];

    if (!progress || progress.action !== action) return 0;

    return progress.count || 0;
  }

  function addPartialReactionCard(room, pendingReaction, player, action, card) {
    const previousProgress =
      pendingReaction.reactionProgress?.[player.playerId];
    const previousCards =
      previousProgress?.action === action ? previousProgress.cards || [] : [];

    room.game.pendingReaction = {
      ...pendingReaction,
      reactionProgress: {
        ...(pendingReaction.reactionProgress || {}),
        [player.playerId]: {
          action,
          count: previousCards.length + 1,
          cards: [...previousCards, card],
        },
      },
    };
  }

  function commitPartialReactionCards(room, pendingReaction, playerId) {
    const progress = pendingReaction.reactionProgress?.[playerId];

    if (!progress?.cards?.length) return;
    const player = room.seats.find(
      (seat) => seat.player?.playerId === playerId,
    )?.player;

    discardPlayedCards(room, player, progress.cards);
  }

  function returnPartialReactionCards(room, pendingReaction) {
    Object.entries(pendingReaction.reactionProgress || {}).forEach(
      ([playerId, progress]) => {
        if (!progress?.cards?.length) return;

        const player = room.seats.find(
          (seat) => seat.player?.playerId === playerId,
        )?.player;

        if (player?.isAlive) {
          addCardsToHand(room, player, progress.cards, {
            allowEmptyHandAbilities: false,
          });
        } else {
          room.game.discard.push(...progress.cards);
        }
      },
    );
  }

  function completePendingReactionTarget(room, playerId) {
    const pendingReaction = room.game.pendingReaction;

    if (!pendingReaction) return;

    commitPartialReactionCards(room, pendingReaction, playerId);

    const nextTargetPlayerIds = getPendingReactionTargetIds(
      pendingReaction,
    ).filter((targetPlayerId) => targetPlayerId !== playerId);

    if (nextTargetPlayerIds.length === 0) {
      clearPendingReaction(room);
      return;
    }

    room.game.pendingReaction = {
      ...pendingReaction,
      targetPlayerIds: nextTargetPlayerIds,
      targetPlayerId: nextTargetPlayerIds[0],
      barrelChecks: Object.fromEntries(
        Object.entries(pendingReaction.barrelChecks || {}).filter(
          ([targetPlayerId]) => nextTargetPlayerIds.includes(targetPlayerId),
        ),
      ),
      barrelCheckUsage: Object.fromEntries(
        Object.entries(pendingReaction.barrelCheckUsage || {}).filter(
          ([targetPlayerId]) => nextTargetPlayerIds.includes(targetPlayerId),
        ),
      ),
      characterBarrelCheckUsage: Object.fromEntries(
        Object.entries(pendingReaction.characterBarrelCheckUsage || {}).filter(
          ([targetPlayerId]) => nextTargetPlayerIds.includes(targetPlayerId),
        ),
      ),
      reactionProgress: Object.fromEntries(
        Object.entries(pendingReaction.reactionProgress || {}).filter(
          ([targetPlayerId]) => nextTargetPlayerIds.includes(targetPlayerId),
        ),
      ),
      targetPlayers: pendingReaction.targetPlayers?.filter((targetPlayer) =>
        nextTargetPlayerIds.includes(targetPlayer.playerId),
      ),
    };
  }

  function checkBarrelReaction(client, room) {
    const pendingReaction = room.game.pendingReaction;

    if (
      !pendingReaction ||
      !isPendingReactionTarget(pendingReaction, client.playerId)
    ) {
      sendError(client.socket, "Сейчас нельзя проверить бочку");
      return;
    }

    if (!isBarrelAllowedForReaction(pendingReaction)) {
      sendError(client.socket, "Бочка не спасает от этой карты");
      return;
    }

    const targetPlayer = room.seats.find(
      (seat) => seat.player?.playerId === client.playerId,
    )?.player;

    if (!hasBlueCardInPlay(targetPlayer, "barrel")) {
      sendError(client.socket, "Бочки нет на столе");
      return;
    }

    if (pendingReaction.barrelCheckUsage?.[client.playerId]) {
      sendError(client.socket, "Бочку уже проверяли");
      return;
    }

    if (
      startCheckChoiceIfAvailable(room, targetPlayer, {
        type: "barrelReaction",
        pendingReactionId: pendingReaction.id,
      })
    ) {
      broadcastRoom(room.id);
      return;
    }

    const drawnCard = drawCheckCard(room);

    if (!drawnCard) {
      sendError(client.socket, "Колода пуста");
      return;
    }

    resolveBarrelReactionCheck(room, targetPlayer, drawnCard);
    broadcastRoom(room.id);
  }

  function checkCharacterBarrelReaction(client, room) {
    const pendingReaction = room.game.pendingReaction;

    if (
      !pendingReaction ||
      !isPendingReactionTarget(pendingReaction, client.playerId)
    ) {
      sendError(client.socket, "Сейчас нельзя применить это свойство");
      return;
    }

    if (!isBarrelAllowedForReaction(pendingReaction)) {
      sendError(client.socket, "Это свойство не спасает от этой карты");
      return;
    }

    const targetPlayer = room.seats.find(
      (seat) => seat.player?.playerId === client.playerId,
    )?.player;
    const character = characterConfig[targetPlayer?.characterId];

    if (!targetPlayer || character?.ability?.effect !== "characterBarrelCheck") {
      sendError(client.socket, "У персонажа нет такого свойства");
      return;
    }

    if (pendingReaction.characterBarrelCheckUsage?.[client.playerId]) {
      sendError(client.socket, "Свойство уже использовано");
      return;
    }

    const drawnCard = drawCheckCard(room);

    if (!drawnCard) {
      sendError(client.socket, "Колода пуста");
      return;
    }

    resolveBarrelReactionCheck(room, targetPlayer, drawnCard, {
      checkSource: "character",
      characterTitle: character.title,
    });
    broadcastRoom(room.id);
  }

  function resolveBarrelReactionCheck(
    room,
    targetPlayer,
    drawnCard,
    options = {},
  ) {
    const pendingReaction = room.game.pendingReaction;
    const {
      discardDrawn = true,
      checkSource = "barrel",
      characterTitle = "",
    } = options;

    if (!pendingReaction || !targetPlayer || !drawnCard) return false;

    const isSuccess = drawnCard.suit?.id === "hearts";
    const nextBarrelChecks = [
      ...normalizeBarrelCheckResults(
        pendingReaction.barrelChecks?.[targetPlayer.playerId],
      ),
      getBarrelCheckResult(drawnCard, isSuccess, {
        characterTitle,
      }),
    ];

    if (discardDrawn) {
      room.game.discard.push(drawnCard);
    }

    if (isSuccess) {
      addBarrelCheckEvent(room, targetPlayer, drawnCard, true, {
        characterTitle,
      });
      const action = "missed";
      const nextProgress =
        getReactionProgress(pendingReaction, targetPlayer.playerId, action) + 1;

      if (nextProgress >= getRequiredReactionCount(pendingReaction, action)) {
        completePendingReactionTarget(room, targetPlayer.playerId);
      } else {
        room.game.pendingReaction = {
          ...pendingReaction,
          reactionProgress: {
            ...(pendingReaction.reactionProgress || {}),
            [targetPlayer.playerId]: {
              action,
              count: nextProgress,
              cards:
                pendingReaction.reactionProgress?.[targetPlayer.playerId]
                  ?.cards || [],
            },
          },
          barrelChecks: {
            ...(pendingReaction.barrelChecks || {}),
            [targetPlayer.playerId]: nextBarrelChecks,
          },
          barrelCheckUsage: {
            ...(pendingReaction.barrelCheckUsage || {}),
            ...(checkSource === "barrel"
              ? { [targetPlayer.playerId]: true }
              : {}),
          },
          characterBarrelCheckUsage: {
            ...(pendingReaction.characterBarrelCheckUsage || {}),
            ...(checkSource === "character"
              ? { [targetPlayer.playerId]: true }
              : {}),
          },
        };
      }
      return true;
    }

    room.game.pendingReaction = {
      ...pendingReaction,
      barrelChecks: {
        ...(pendingReaction.barrelChecks || {}),
        [targetPlayer.playerId]: nextBarrelChecks,
      },
      barrelCheckUsage: {
        ...(pendingReaction.barrelCheckUsage || {}),
        ...(checkSource === "barrel" ? { [targetPlayer.playerId]: true } : {}),
      },
      characterBarrelCheckUsage: {
        ...(pendingReaction.characterBarrelCheckUsage || {}),
        ...(checkSource === "character"
          ? { [targetPlayer.playerId]: true }
          : {}),
      },
    };
    addBarrelCheckEvent(room, targetPlayer, drawnCard, false, {
      characterTitle,
    });
    return true;
  }

  function checkTurnBlueCard(client, room, payload = {}) {
    if (room.game.turnPlayerId !== client.playerId) {
      sendError(client.socket, "Сейчас не ваш ход");
      return;
    }

    const actor = room.seats.find(
      (seat) => seat.player?.playerId === client.playerId,
    )?.player;
    const turnCheck = room.game.turnCheck;

    if (!actor || !turnCheck || turnCheck.playerId !== client.playerId) {
      sendError(client.socket, "Сейчас нечего проверять");
      return;
    }

    if (turnCheck.cardInstanceId !== payload.cardInstanceId) {
      sendError(client.socket, "Сначала проверьте активную карту");
      return;
    }

    const card = actor.blueCards?.find(
      (candidate) => candidate.instanceId === payload.cardInstanceId,
    );

    if (!card) {
      sendError(client.socket, "Карты нет на столе");
      return;
    }

    if (!isTurnCheckCard(card)) {
      sendError(client.socket, "Эту карту нельзя проверить");
      return;
    }

    if (
      startCheckChoiceIfAvailable(room, actor, {
        type: "turnBlueCard",
        cardInstanceId: card.instanceId,
      })
    ) {
      broadcastRoom(room.id);
      return;
    }

    resolveTurnBlueCardCheck(room, actor, card);
    broadcastRoom(room.id);
  }

  function canCheckTurnBlueCardNow(room, player) {
    const turnCheck = room.game.turnCheck;

    if (
      !turnCheck ||
      room.game.turnPlayerId !== player?.playerId ||
      turnCheck.playerId !== player.playerId
    ) {
      return false;
    }

    const card = player.blueCards?.find(
      (candidate) => candidate.instanceId === turnCheck.cardInstanceId,
    );

    return isTurnCheckCard(card);
  }

  function canCheckBarrelForPendingReaction(room, player) {
    const pendingReaction = room.game.pendingReaction;

    return Boolean(
      pendingReaction &&
      isPendingReactionTarget(pendingReaction, player?.playerId) &&
      isBarrelAllowedForReaction(pendingReaction) &&
      hasBlueCardInPlay(player, "barrel") &&
      !pendingReaction.barrelCheckUsage?.[player.playerId],
    );
  }

  function isTurnCheckCard(card) {
    return getCardCheckConfig(card)?.timing === "turn";
  }

  function resolveTurnBlueCardCheck(
    room,
    actor,
    card,
    drawnCard = drawCheckCard(room),
    options = {},
  ) {
    const checkConfig = getCardCheckConfig(card);

    if (checkConfig?.type === "jail") {
      checkJailTurnCard(room, actor, card, drawnCard, options);
      return true;
    }

    if (checkConfig?.type === "dynamite") {
      checkDynamiteTurnCard(room, actor, card, drawnCard, options);
      return true;
    }

    return false;
  }

  function getCardCheckConfig(card) {
    return cardConfig[card?.cardId]?.check || null;
  }

  function checkJailTurnCard(
    room,
    actor,
    card,
    drawnCard = drawCheckCard(room),
    options = {},
  ) {
    const { discardDrawn = true } = options;

    if (!drawnCard) return;

    const isSuccess = drawnCard.suit?.id === "hearts";

    if (discardDrawn) {
      room.game.discard.push(drawnCard);
    }
    discardBlueCard(room, actor, card.instanceId);
    addTurnCheckEvent(room, actor, {
      checkCard: card,
      isSuccess,
      consequenceText: isSuccess ? "вышел из тюрьмы" : "пропуск хода",
      drawnCard,
    });
    addDiscardEvent(room, actor, options.discardAfterCheckCards || []);

    if (!isSuccess) {
      room.game.turnCheck = null;
      completeTurn(room, actor.playerId);
      return;
    }

    setNextTurnCheck(room, actor);
  }

  function checkDynamiteTurnCard(
    room,
    actor,
    card,
    drawnCard = drawCheckCard(room),
    options = {},
  ) {
    const { discardDrawn = true } = options;

    if (!drawnCard) return;

    const isExplosion = isDynamiteExplosionCard(drawnCard);

    if (discardDrawn) {
      room.game.discard.push(drawnCard);
    }
    discardBlueCard(room, actor, card.instanceId, { toDiscard: isExplosion });

    if (!isExplosion) {
      passDynamiteToNextPlayer(room, actor, card);
      addTurnCheckEvent(room, actor, {
        checkCard: card,
        isSuccess: true,
        consequenceText: "передал динамит дальше",
        drawnCard,
      });
      addDiscardEvent(room, actor, options.discardAfterCheckCards || []);
      setNextTurnCheck(room, actor);
      return;
    }

    const owner = getDynamiteOwner(room, card);

    addTurnCheckEvent(room, actor, {
      checkCard: card,
      isSuccess: false,
      consequenceText: "БАБААААХ",
      drawnCard,
      damageAmount: 3,
      damageColor: cardConfig.bang.eventColor,
    });
    addDiscardEvent(room, actor, options.discardAfterCheckCards || []);
    room.game.turnCheck = null;

    if (actor.health === 3) {
      startPendingReaction(room, {
        sourceAction: "dynamite",
        actorPlayerId: owner?.playerId || actor.playerId,
        actorName: owner?.name || actor.name,
        targetPlayerId: actor.playerId,
        targetName: actor.name,
        healthLoss: 3,
        cardTitle: cardConfig.dynamite.eventTitle,
        cardColor: cardConfig.bang.eventColor,
      });
      return;
    }

    applyHealthLoss(room, actor, 3, {
      sourcePlayerId: owner?.playerId || actor.playerId,
      sourceAction: "dynamite",
      silent: true,
    });
    const wasRevealed = revealDeadPlayer(room, actor);

    if (wasRevealed && !checkVictory(room)) {
      applyDeathRewards(room, actor, owner);
    }

    if (!actor.isAlive && !room.game.winner) {
      completeTurn(room, actor.playerId);
      return;
    }

    setNextTurnCheck(room, actor);
  }

  function playReactionAction(client, room, payload = {}) {
    const pendingReaction = room.game.pendingReaction;

    if (
      !pendingReaction ||
      !isPendingReactionTarget(pendingReaction, client.playerId)
    ) {
      sendError(client.socket, "Сейчас нельзя сыграть реакцию");
      return;
    }

    const targetPlayer = room.seats.find(
      (seat) => seat.player?.playerId === client.playerId,
    )?.player;
    const cardIndex =
      targetPlayer?.hand.findIndex(
        (card) => card.instanceId === payload.cardInstanceId,
      ) ?? -1;

    if (!targetPlayer || cardIndex === -1) {
      sendError(client.socket, "Карты нет на руке");
      return;
    }

    const card = targetPlayer.hand[cardIndex];
    const baseConfigForCard = cardConfig[card.cardId];
    const characterConversion = getActiveCharacterConversion(
      room,
      targetPlayer,
      card,
      baseConfigForCard,
    );
    const configForCard =
      characterConversion?.targetConfig || baseConfigForCard;

    if (
      !configForCard ||
      configForCard.action !== payload.action ||
      !isReactionAllowed(pendingReaction, targetPlayer, configForCard)
    ) {
      sendError(client.socket, "Некорректная реакция");
      return;
    }

    const reactionAction = configForCard.action;
    const requiredReactionCount = getRequiredReactionCount(
      pendingReaction,
      reactionAction,
    );
    const nextReactionProgress =
      getReactionProgress(
        pendingReaction,
        targetPlayer.playerId,
        reactionAction,
      ) + 1;
    const isPartialReaction = nextReactionProgress < requiredReactionCount;
    const discardedCard = takeCardFromHand(room, targetPlayer, cardIndex, {
      allowEmptyHandAbilities: !isPartialReaction,
    });

    if (isPartialReaction) {
      if (characterConversion) {
        addCharacterPropertyUseEvent(room, targetPlayer, characterConversion);
        clearActiveCharacterAbility(room, targetPlayer.playerId);
      }

      addPartialReactionCard(
        room,
        pendingReaction,
        targetPlayer,
        reactionAction,
        discardedCard,
      );
      broadcastRoom(room.id);
      return;
    }

    if (payload.action === "beer") {
      healPlayer(targetPlayer, configForCard.healAmount || 1);
      addLifeSavingBeerEvent(room, targetPlayer, card, configForCard);
      discardPlayedCards(room, targetPlayer, discardedCard);
      targetPlayer.health = Math.max(
        0,
        targetPlayer.health - pendingReaction.healthLoss,
      );
    } else if (
      payload.action === "bang" &&
      ["duel", "indians"].includes(pendingReaction.sourceAction)
    ) {
      if (characterConversion) {
        addCharacterPropertyUseEvent(room, targetPlayer, characterConversion);
      }

      addDiscardEvent(room, targetPlayer, null, {
        eventCards: [
          {
            cardId: configForCard.id,
            cardTitle: getConfigEventTitle(configForCard),
            cardColor: configForCard.eventColor,
          },
        ],
      });
      discardPlayedCards(room, targetPlayer, discardedCard);

      if (characterConversion) {
        clearActiveCharacterAbility(room, targetPlayer.playerId);
      }

      if (pendingReaction.sourceAction === "duel") {
        continueDuelReaction(room, pendingReaction, targetPlayer);
        broadcastRoom(room.id);
        return;
      }
    } else {
      if (characterConversion) {
        addCharacterPropertyUseEvent(room, targetPlayer, characterConversion);
      }

      addGameEvent(room, {
        type: "reaction",
        actorName: targetPlayer.name,
        actorRoleId: targetPlayer.roleId,
        cardId: configForCard.id,
        cardTitle: getConfigEventTitle(configForCard),
        cardColor: configForCard.eventColor,
      });
      discardPlayedCards(room, targetPlayer, discardedCard);
    }

    if (characterConversion) {
      clearActiveCharacterAbility(room, targetPlayer.playerId);
    }

    completePendingReactionTarget(room, client.playerId);

    if (
      pendingReaction.sourceAction === "dynamite" &&
      room.game.turnPlayerId === targetPlayer.playerId &&
      targetPlayer.isAlive
    ) {
      setNextTurnCheck(room, targetPlayer);
    }

    broadcastRoom(room.id);
  }

  function continueDuelReaction(room, pendingReaction, actor) {
    const targetPlayer = room.seats.find(
      (seat) => seat.player?.playerId === pendingReaction.actorPlayerId,
    )?.player;

    if (!targetPlayer?.isAlive) {
      clearPendingReaction(room);
      return;
    }

    startPendingReaction(room, {
      sourceAction: "duel",
      actorPlayerId: actor.playerId,
      actorName: actor.name,
      targetPlayerId: targetPlayer.playerId,
      targetName: targetPlayer.name,
      healthLoss: pendingReaction.healthLoss || 1,
      cardTitle: pendingReaction.cardTitle,
      cardColor: pendingReaction.cardColor,
    });
  }

  function isBarrelAllowedForReaction(pendingReaction) {
    return ["bang", "gatling"].includes(pendingReaction?.sourceAction);
  }

  function leaveGame(room, playerId) {
    const seatIndex = findSeatIndexByPlayerId(room, playerId);

    if (seatIndex === null) return;

    const player = room.seats[seatIndex].player;

    if (
      room.game.pendingReaction &&
      room.game.pendingReaction.actorPlayerId === playerId
    ) {
      clearPendingReaction(room);
    } else if (
      room.game.pendingReaction &&
      isPendingReactionTarget(room.game.pendingReaction, playerId)
    ) {
      completePendingReactionTarget(room, playerId);
    }

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
    clearPendingReaction(room);
    finishGeneralStore(room);
    clearPendingCheckChoice(room);
    room.game.pendingCharacterPayment = null;
    room.game.pendingTurnDiscard = null;

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
    return publicState.getPublicRoom(room, viewerPlayerId);
  }

  function getPublicRoomSummary(room) {
    return publicState.getPublicRoomSummary(room);
  }

  function getPublicCard(room, player, card, options = {}) {
    return publicState.getPublicCard(room, player, card, options);
  }

  function isCardPlayable(room, player, configForCard) {
    if (room.status !== "game") return false;
    if (room.game.generalStore) return false;
    if (room.game.pendingCheckChoice) return false;
    if (room.game.pendingCharacterPayment) return false;
    if (isReactionCardPlayable(room, player, configForCard)) return true;
    if (room.game.pendingReaction) return false;
    if (configForCard.playMode === "reaction") {
      return false;
    }
    if (!player.isAlive || room.game.turnPlayerId !== player.playerId)
      return false;
    if (configForCard.action === "beer" && player.health >= player.maxHealth) {
      return false;
    }
    if (
      configForCard.action === "saloon" &&
      !getAlivePlayers(room).some(canHealPlayer)
    ) {
      return false;
    }
    if (
      configForCard.action === "playBlueCard" &&
      hasBlueCardInPlay(player, configForCard.id)
    ) {
      return false;
    }
    if (
      configForCard.action === "playBlueCardOnTarget" &&
      !hasEligibleBlueCardTarget(room, player, configForCard.id)
    ) {
      return false;
    }
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
      ) ||
      hasCharacterEffectLimitAllowance(room, player, configForCard.effectLimitKey)
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
      ) &&
      !hasCharacterEffectLimitAllowance(room, player, configForCard.effectLimitKey)
    );
  }

  function hasCharacterEffectLimitAllowance(room, player, effectLimitKey) {
    if (effectLimitKey !== cardConfig.bang.effectLimitKey) {
      return false;
    }

    return hasActiveCharacterAbilityEffect(
      room,
      player?.playerId,
      "unlockBangLimit",
    );
  }

  function isReactionCardPlayable(room, player, configForCard) {
    const pendingReaction = room.game.pendingReaction;

    return Boolean(
      pendingReaction &&
      player.isAlive &&
      isPendingReactionTarget(pendingReaction, player.playerId) &&
      isReactionAllowed(pendingReaction, player, configForCard),
    );
  }

  function isReactionAllowed(pendingReaction, player, configForCard) {
    if (!configForCard.reactionTo?.includes(pendingReaction.sourceAction)) {
      return false;
    }

    if (configForCard.reactionOnLethalHealthLoss) {
      const healAmount = configForCard.healAmount || 1;

      return (
        player.health <= pendingReaction.healthLoss &&
        player.health + healAmount > pendingReaction.healthLoss
      );
    }

    return true;
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

      return [getPublicRoomSummary(room)];
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
    const seat = findActiveSeatByPlayerId(room.seats, playerId);

    return seat ? seat.index : null;
  }

  function getPlayerDistance(room, fromPlayerId, toPlayerId) {
    return getSharedPlayerDistance(room.seats, fromPlayerId, toPlayerId, {
      getCardConfig: (card) => cardConfig[card.cardId],
      getCharacterConfig: (player) => characterConfig[player.characterId],
    });
  }

  function assignRoles(room) {
    const players = room.seats
      .filter((seat) => seat.player)
      .map((seat) => seat.player);
    const roles = shuffle(getRolesForPlayerCount(players.length));
    const characters = shuffle(getCharacterIds());
    const hatSkinKeys = shuffle(
      Array.from({ length: config.hatSkinCount }, (_, index) =>
        String(index + 1),
      ),
    );

    players.forEach((player, index) => {
      player.roleId = roles[index];
      player.characterId = characters[index] || null;
      if (player.characterId && isAutoSeatPlayerName(player.name)) {
        player.name = characterConfig[player.characterId]?.title || player.name;
      }
      player.isRoleRevealed = player.roleId === "sheriff";
      player.isAlive = true;
      player.leftGame = false;
      player.connected = true;
      player.health = getPlayerBaseHealth(player);
      player.maxHealth = player.health;
      player.attackRange = config.defaultAttackRange;
      player.hand = [];
      player.weapon = null;
      player.blueCards = [];

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
    clearPendingReaction(room);
    finishGeneralStore(room);
    clearPendingCheckChoice(room);
    room.game.pendingCharacterPayment = null;
    room.game.pendingTurnDiscard = null;
    room.game.activeCharacterAbilities = {};
    room.game.turnPlayedEffects = {};
    room.game.turnEffectAllowances = {};
    room.game.turnCheck = null;
    dealInitialHands(room);
    addGameEvent(
      room,
      "Раздача ролей завершена. Раздача карт согласно запасу здоровья игроков завершена.",
    );
  }

  function getPlayerBaseHealth(player) {
    return characterConfig[player.characterId]?.health || config.defaultHealth;
  }

  function playBlueCard(actor, card) {
    actor.blueCards ||= [];
    actor.blueCards.unshift(card);
  }

  function playBlueCardOnTarget(
    client,
    room,
    actor,
    card,
    configForCard,
    payload = {},
  ) {
    const targetPlayerId = normalizePlayerId(payload.targetPlayerId);

    if (!targetPlayerId || targetPlayerId === actor.playerId) {
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

    if (card.cardId === "jail" && targetPlayer.roleId === "sheriff") {
      sendError(client.socket, "Шерифа нельзя посадить в тюрьму");
      return false;
    }

    if (hasBlueCardInPlay(targetPlayer, card.cardId)) {
      sendError(client.socket, "Такая карта уже на столе");
      return false;
    }

    if (card.cardId === "dynamite" && isDynamiteInPlay(room)) {
      sendError(client.socket, "Динамит уже в игре");
      return false;
    }

    targetPlayer.blueCards ||= [];
    targetPlayer.blueCards.unshift({
      ...card,
      ownerPlayerId: actor.playerId,
    });

    return { targetPlayer };
  }

  function discardBlueCard(room, player, cardInstanceId, options = {}) {
    const { toDiscard = true } = options;
    const cardIndex =
      player?.blueCards?.findIndex(
        (card) => card.instanceId === cardInstanceId,
      ) ?? -1;

    if (cardIndex === -1) return null;

    const [card] = player.blueCards.splice(cardIndex, 1);

    if (toDiscard) {
      room.game.discard.push(card);
    }

    return card;
  }

  function isDynamiteExplosionCard(card) {
    const rankValue = Number(card.rank?.label);

    return card.suit?.id === "spades" && rankValue >= 2 && rankValue <= 9;
  }

  function passDynamiteToNextPlayer(room, fromPlayer, card) {
    const nextPlayerId = getNextTurnPlayerId(room, fromPlayer.playerId);
    const nextPlayer = room.seats.find(
      (seat) => seat.player?.playerId === nextPlayerId,
    )?.player;

    if (!nextPlayer) return;

    nextPlayer.blueCards ||= [];
    nextPlayer.blueCards.unshift(card);
  }

  function getDynamiteOwner(room, card) {
    if (!card.ownerPlayerId) return null;

    return (
      room.seats.find((seat) => seat.player?.playerId === card.ownerPlayerId)
        ?.player || null
    );
  }

  function isDynamiteInPlay(room) {
    return isSharedDynamiteInPlay(
      room.seats.map((seat) => seat.player).filter(Boolean),
    );
  }

  function hasEligibleBlueCardTarget(room, actor, cardId) {
    if (cardId === "dynamite" && isDynamiteInPlay(room)) return false;

    return getAlivePlayers(room).some((player) => {
      if (player.playerId === actor.playerId) return false;
      if (hasBlueCardInPlay(player, cardId)) return false;
      if (cardId === "jail" && player.roleId === "sheriff") return false;

      return true;
    });
  }

  function getPlayerStatuses(player) {
    return (player.blueCards || []).flatMap((card) => {
      const configForCard = cardConfig[card.cardId];

      if (!configForCard?.statusImage) return [];

      return [
        {
          cardId: card.cardId,
          title: configForCard.eventTitle || configForCard.title,
          image: configForCard.statusImage,
        },
      ];
    });
  }

  function dealInitialHands(room) {
    room.seats.forEach((seat) => {
      if (seat.player) {
        drawCards(room, seat.player.playerId, seat.player.health);
      }
    });
  }

  function setNextTurnCheck(room, player) {
    const checkCard = getRequiredTurnCheckCard(player);

    room.game.turnCheck = checkCard
      ? {
          playerId: player.playerId,
          cardInstanceId: checkCard.instanceId,
          cardId: checkCard.cardId,
          cardTitle: getCardEventTitle(checkCard),
        }
      : null;
  }

  function getRequiredTurnCheckCard(player) {
    if (!player?.isAlive) return null;

    return (
      (player.blueCards || []).find((card) => card.cardId === "dynamite") ||
      (player.blueCards || []).find((card) => card.cardId === "jail") ||
      null
    );
  }

  function hasRequiredTurnCheck(room, playerId) {
    return room.game.turnCheck?.playerId === playerId;
  }

  function startTurn(room, playerId) {
    if (!playerId) return;

    room.game.turnPlayerId = playerId;
    room.game.turnPlayedEffects[playerId] = {};
    room.game.turnEffectAllowances[playerId] = {};
    clearActiveCharacterAbility(room, playerId);
    room.game.turnDrawTaken = false;
    room.game.turnActionTaken = false;

    const player = room.seats.find(
      (seat) => seat.player?.playerId === playerId,
    )?.player;

    setNextTurnCheck(room, player);

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

    if (!player) return [];

    for (let index = 0; index < count; index += 1) {
      refillDeckIfNeeded(room);

      const card = room.game.deck.shift();

      if (!card) return drawnCards;

      drawnCards.push(card);
    }

    addCardsToHand(room, player, drawnCards, {
      allowEmptyHandAbilities: false,
    });

    return drawnCards;
  }

  function drawCardsWithDiscardTop(room, player) {
    const discardCard = takeTopDiscardCard(room);

    if (!discardCard) {
      drawCards(room, player.playerId, 2);
      return;
    }

    addCardsToHand(room, player, discardCard, {
      allowEmptyHandAbilities: false,
    });
    drawCards(room, player.playerId, 1);
    addCharacterAbilityUseEvent(room, player, {
      effect: "drawDiscardTop",
      cardId: discardCard.cardId,
      cardTitle: getCardEventTitle(discardCard),
      cardColor: getCardEventColor(discardCard),
    });
  }

  function drawCardsWithSecondCardSuitBonus(room, player) {
    const character = characterConfig[player.characterId];
    const ability = character?.ability || {};
    const drawnCards = drawCards(room, player.playerId, 2);
    const revealedCard = drawnCards[1];

    if (!revealedCard) return;

    const isSuccess = (ability.successSuits || []).includes(
      revealedCard.suit?.id,
    );

    if (isSuccess) {
      drawCards(room, player.playerId, ability.bonusDrawCount || 1);
    }

    addCharacterAbilityUseEvent(room, player, {
      effect: ability.effect,
    });
    addTurnCheckEvent(room, player, {
      checkCardTitle: "ЧервыБуби",
      checkCardColor: "#c94a35",
      isSuccess,
      consequenceText: isSuccess ? "взял доп. карту" : "",
      drawnCard: revealedCard,
    });
  }

  function drawCardsFromDeck(room, count) {
    const drawnCards = [];

    for (let index = 0; index < count; index += 1) {
      refillDeckIfNeeded(room);

      const card = room.game.deck.shift();

      if (!card) break;

      drawnCards.push(card);
    }

    return drawnCards;
  }

  function startGeneralStore(room, players, cards) {
    room.game.generalStore = {
      id: randomUUID(),
      cards,
      pickerIndex: 0,
      pickOrder: players.map((player) => ({
        playerId: player.playerId,
        name: player.name,
        roleId: player.roleId,
      })),
      expiresAt: Date.now() + config.generalStorePickWindowMs,
    };
    advanceGeneralStore(room);
  }

  function chooseGeneralStoreCard(client, room, payload = {}) {
    const generalStore = room.game.generalStore;
    const currentPicker = getCurrentGeneralStorePicker(generalStore);

    if (!generalStore || !currentPicker) {
      sendError(client.socket, "Магазин уже закрыт");
      return;
    }

    if (currentPicker.playerId !== client.playerId) {
      sendError(client.socket, "Сейчас выбирает другой игрок");
      return;
    }

    const cardIndex = generalStore.cards.findIndex(
      (card) => card.instanceId === payload.cardInstanceId,
    );

    if (cardIndex === -1) {
      sendError(client.socket, "Такой карты нет в магазине");
      return;
    }

    giveGeneralStoreCard(room, cardIndex);
    advanceGeneralStore(room);
    broadcastRoom(room.id);
  }

  function scheduleGeneralStorePick(room) {
    clearGeneralStoreTimer(room);

    if (!room.game.generalStore) return;

    room.generalStoreTimer = setTimeout(() => {
      autoChooseGeneralStoreCard(room);
    }, config.generalStorePickWindowMs);
  }

  function autoChooseGeneralStoreCard(room) {
    const generalStore = room.game.generalStore;

    if (!generalStore?.cards?.length) {
      finishGeneralStore(room);
      broadcastRoom(room.id);
      return;
    }

    const cardIndex = randomInt(generalStore.cards.length);

    giveGeneralStoreCard(room, cardIndex);
    advanceGeneralStore(room);
    broadcastRoom(room.id);
  }

  function giveGeneralStoreCard(room, cardIndex) {
    const generalStore = room.game.generalStore;
    const currentPicker = getCurrentGeneralStorePicker(generalStore);

    if (!generalStore || !currentPicker) return false;

    const player = room.seats.find(
      (seat) => seat.player?.playerId === currentPicker.playerId,
    )?.player;
    const [card] = generalStore.cards.splice(cardIndex, 1);

    if (card && player?.isAlive) {
      addCardsToHand(room, player, card, {
        allowEmptyHandAbilities: false,
      });
      addGameEvent(room, {
        type: "generalStorePick",
        actorName: player.name,
        actorRoleId: player.roleId,
        cardTitle: getCardEventTitle(card),
      });
    } else if (card) {
      room.game.discard.push(card);
    }

    generalStore.pickerIndex += 1;
    return true;
  }

  function advanceGeneralStore(room) {
    const generalStore = room.game.generalStore;

    if (!generalStore) return;

    if (
      generalStore.pickerIndex >= generalStore.pickOrder.length ||
      generalStore.cards.length === 0
    ) {
      finishGeneralStore(room);
      return;
    }

    if (generalStore.cards.length === 1) {
      giveGeneralStoreCard(room, 0);
      finishGeneralStore(room);
      return;
    }

    generalStore.expiresAt = Date.now() + config.generalStorePickWindowMs;
    scheduleGeneralStorePick(room);
  }

  function getCurrentGeneralStorePicker(generalStore) {
    return generalStore?.pickOrder?.[generalStore.pickerIndex] || null;
  }

  function finishGeneralStore(room) {
    clearGeneralStoreTimer(room);

    if (room.game.generalStore?.cards?.length) {
      room.game.discard.push(...room.game.generalStore.cards);
    }

    room.game.generalStore = null;
  }

  function clearGeneralStoreTimer(room) {
    if (!room.generalStoreTimer) return;

    clearTimeout(room.generalStoreTimer);
    room.generalStoreTimer = null;
  }

  function startCheckChoiceIfAvailable(room, player, context) {
    const activeAbility = room.game.activeCharacterAbilities?.[player.playerId];
    const character = characterConfig[player.characterId];

    if (
      !activeAbility ||
      activeAbility.characterId !== player.characterId ||
      activeAbility.effect !== "chooseCheckCard" ||
      character?.ability?.effect !== "chooseCheckCard"
    ) {
      return false;
    }

    const cardsCount = Math.max(2, character.ability.cardsCount || 2);
    const cards = drawCardsFromDeck(room, cardsCount);

    if (cards.length === 0) {
      return false;
    }

    clearActiveCharacterAbility(room, player.playerId);

    if (context.type === "barrelReaction") {
      clearPendingReactionTimer(room);
    }

    room.game.pendingCheckChoice = {
      id: randomUUID(),
      playerId: player.playerId,
      playerName: player.name,
      playerRoleId: player.roleId,
      characterId: player.characterId,
      characterTitle: character.title,
      effect: "chooseCheckCard",
      cards,
      context,
      expiresAt: Date.now() + config.checkChoiceWindowMs,
    };
    scheduleCheckChoice(room);

    return true;
  }

  function startDeckTopChoice(room, player) {
    const activeAbility = room.game.activeCharacterAbilities?.[player.playerId];
    const character = characterConfig[player.characterId];

    if (
      !activeAbility ||
      activeAbility.characterId !== player.characterId ||
      activeAbility.effect !== "chooseDeckTopCards" ||
      character?.ability?.effect !== "chooseDeckTopCards"
    ) {
      return false;
    }

    const cardsCount = Math.max(3, character.ability.cardsCount || 3);
    const cards = drawCardsFromDeck(room, cardsCount);

    if (cards.length === 0) {
      return false;
    }

    clearActiveCharacterAbility(room, player.playerId);

    room.game.pendingCheckChoice = {
      id: randomUUID(),
      playerId: player.playerId,
      playerName: player.name,
      playerRoleId: player.roleId,
      characterId: player.characterId,
      characterTitle: character.title,
      effect: "chooseDeckTopCards",
      cards,
      chooseCount: Math.min(
        Math.max(1, character.ability.chooseCount || 2),
        Math.max(1, cards.length - 1),
      ),
      selectedCardInstanceIds: [],
      context: {
        type: "drawPhaseChoice",
      },
      expiresAt: Date.now() + config.checkChoiceWindowMs,
    };
    scheduleCheckChoice(room);

    return true;
  }

  function chooseCheckCard(client, room, payload = {}) {
    const pendingCheckChoice = room.game.pendingCheckChoice;

    if (!pendingCheckChoice) {
      sendError(client.socket, "Проверка уже завершена");
      return;
    }

    if (pendingCheckChoice.playerId !== client.playerId) {
      sendError(client.socket, "Сейчас выбирает другой игрок");
      return;
    }

    const cardIndex = pendingCheckChoice.cards.findIndex(
      (card) => card.instanceId === payload.cardInstanceId,
    );

    if (cardIndex === -1) {
      sendError(client.socket, "Такой карты нет в проверке");
      return;
    }

    if (pendingCheckChoice.effect === "chooseDeckTopCards") {
      togglePendingDeckTopChoice(room, pendingCheckChoice.cards[cardIndex]);
      broadcastRoom(room.id);
      return;
    }

    resolvePendingCheckChoice(room, cardIndex);
    broadcastRoom(room.id);
  }

  function togglePendingDeckTopChoice(room, card) {
    const pendingCheckChoice = room.game.pendingCheckChoice;

    if (!pendingCheckChoice || pendingCheckChoice.effect !== "chooseDeckTopCards") {
      return false;
    }

    const selectedCardInstanceIds = new Set(
      pendingCheckChoice.selectedCardInstanceIds || [],
    );

    if (selectedCardInstanceIds.has(card.instanceId)) {
      selectedCardInstanceIds.delete(card.instanceId);
    } else {
      selectedCardInstanceIds.add(card.instanceId);
    }

    const selectedIds = [...selectedCardInstanceIds];

    room.game.pendingCheckChoice = {
      ...pendingCheckChoice,
      selectedCardInstanceIds: selectedIds,
    };

    if (selectedIds.length >= (pendingCheckChoice.chooseCount || 2)) {
      resolvePendingDeckTopChoice(room, selectedIds);
    }

    return true;
  }

  function scheduleCheckChoice(room) {
    clearCheckChoiceTimer(room);

    if (!room.game.pendingCheckChoice) return;

    room.checkChoiceTimer = setTimeout(() => {
      autoChooseCheckCard(room);
    }, config.checkChoiceWindowMs);
  }

  function autoChooseCheckCard(room) {
    const pendingCheckChoice = room.game.pendingCheckChoice;

    if (!pendingCheckChoice?.cards?.length) {
      clearPendingCheckChoice(room);
      broadcastRoom(room.id);
      return;
    }

    if (pendingCheckChoice.effect === "chooseDeckTopCards") {
      const chooseCount = Math.min(
        pendingCheckChoice.chooseCount || 2,
        pendingCheckChoice.cards.length,
      );
      const selectedIds = shuffle([...pendingCheckChoice.cards])
        .slice(0, chooseCount)
        .map((card) => card.instanceId);

      resolvePendingDeckTopChoice(room, selectedIds);
      broadcastRoom(room.id);
      return;
    }

    resolvePendingCheckChoice(room, randomInt(pendingCheckChoice.cards.length));
    broadcastRoom(room.id);
  }

  function resolvePendingDeckTopChoice(room, selectedCardInstanceIds) {
    const pendingCheckChoice = room.game.pendingCheckChoice;

    if (!pendingCheckChoice || pendingCheckChoice.effect !== "chooseDeckTopCards") {
      return false;
    }

    const actor = room.seats.find(
      (seat) => seat.player?.playerId === pendingCheckChoice.playerId,
    )?.player;
    const selectedIds = new Set(selectedCardInstanceIds || []);
    const chooseCount = Math.min(
      pendingCheckChoice.chooseCount || 2,
      pendingCheckChoice.cards.length,
    );
    const chosenCards = pendingCheckChoice.cards.filter((card) =>
      selectedIds.has(card.instanceId),
    );
    const normalizedChosenCards = chosenCards.slice(0, chooseCount);
    const remainingCards = pendingCheckChoice.cards.filter(
      (card) => !selectedIds.has(card.instanceId),
    );

    clearPendingCheckChoice(room);

    room.game.deck.unshift(...[...remainingCards].reverse());

    if (!actor?.isAlive || normalizedChosenCards.length === 0) {
      return false;
    }

    addCardsToHand(room, actor, normalizedChosenCards, {
      allowEmptyHandAbilities: false,
    });
    addCharacterAbilityUseEvent(room, actor, {
      effect: "chooseDeckTopCards",
    });
    return true;
  }

  function resolvePendingCheckChoice(room, cardIndex) {
    const pendingCheckChoice = room.game.pendingCheckChoice;

    if (!pendingCheckChoice) return false;

    const chosenCard = pendingCheckChoice.cards[cardIndex];
    const unchosenCards = pendingCheckChoice.cards.filter(
      (_, index) => index !== cardIndex,
    );
    const actor = room.seats.find(
      (seat) => seat.player?.playerId === pendingCheckChoice.playerId,
    )?.player;
    const context = pendingCheckChoice.context || {};
    const choiceCards = pendingCheckChoice.cards;

    clearPendingCheckChoice(room);
    room.game.discard.push(...choiceCards);

    if (actor?.isAlive) {
      addCharacterAbilityUseEvent(room, actor, {
        effect: pendingCheckChoice.effect,
      });
    }

    if (!chosenCard || !actor?.isAlive) {
      restartPendingReactionTimer(room);
      return false;
    }

    if (context.type === "barrelReaction") {
      if (room.game.pendingReaction?.id === context.pendingReactionId) {
        resolveBarrelReactionCheck(room, actor, chosenCard, {
          discardDrawn: false,
        });
      }
      addDiscardEvent(room, actor, unchosenCards);
      restartPendingReactionTimer(room);
      return true;
    }

    if (context.type === "turnBlueCard") {
      const card = actor.blueCards?.find(
        (candidate) => candidate.instanceId === context.cardInstanceId,
      );

      if (card && isTurnCheckCard(card)) {
        resolveTurnBlueCardCheck(room, actor, card, chosenCard, {
          discardDrawn: false,
          discardAfterCheckCards: unchosenCards,
        });
      }
      return true;
    }

    return false;
  }

  function clearPendingCheckChoice(room) {
    clearCheckChoiceTimer(room);

    if (room.game) {
      room.game.pendingCheckChoice = null;
    }
  }

  function clearCheckChoiceTimer(room) {
    if (!room.checkChoiceTimer) return;

    clearTimeout(room.checkChoiceTimer);
    room.checkChoiceTimer = null;
  }

  function drawCheckCard(room) {
    refillDeckIfNeeded(room);

    return room.game.deck.shift() || null;
  }

  function refillDeckIfNeeded(room) {
    if (room.game.deck.length > DECK_REFILL_THRESHOLD) return;
    if (room.game.discard.length <= DISCARD_VISIBLE_CARDS_COUNT) return;

    const cardsToKeep = room.game.discard.slice(-DISCARD_VISIBLE_CARDS_COUNT);
    const cardsToRecycle = room.game.discard.slice(
      0,
      -DISCARD_VISIBLE_CARDS_COUNT,
    );

    if (cardsToRecycle.length === 0) return;

    room.game.deck = [...room.game.deck, ...shuffle(cardsToRecycle)];
    room.game.discard = cardsToKeep;
    addGameEvent(
      room,
      "Старый сброс перемешан и ушел под низ колоды. Верх сброса остался на столе.",
    );
  }

  function getTopDiscardCard(room) {
    return room.game.discard[room.game.discard.length - 1] || null;
  }

  function takeTopDiscardCard(room) {
    return room.game.discard.pop() || null;
  }

  function getCardEventTitle(card) {
    const configForCard = cardConfig[card.cardId];

    return getConfigEventTitle(configForCard);
  }

  function getConfigEventTitle(configForCard) {
    return configForCard?.eventTitle || configForCard?.title || "неизвестно";
  }

  function getCardEventColor(card) {
    return cardConfig[card.cardId]?.eventColor || "#c94a35";
  }

  function getPublicCheckCard(card) {
    return {
      cardId: card.cardId,
      title: getCardEventTitle(card),
      rank: card.rank,
      suit: card.suit,
    };
  }

  function addBarrelCheckEvent(room, actor, drawnCard, isSuccess, options = {}) {
    const checkResult = getBarrelCheckResult(drawnCard, isSuccess, options);

    addGameEvent(room, {
      type: "barrelCheck",
      actorPlayerId: actor.playerId,
      actorName: actor.name,
      actorRoleId: actor.roleId,
      ...checkResult,
    });
  }

  function getBarrelCheckResult(drawnCard, isSuccess, options = {}) {
    return {
      checkCardId: "barrel",
      checkCardTitle: cardConfig.barrel.eventTitle,
      checkCardColor: cardConfig.barrel.eventColor,
      characterTitle: options.characterTitle || "",
      resultTitle: isSuccess ? "УСПЕХ" : "ПРОВАЛ",
      consequenceText: isSuccess
        ? options.characterTitle
          ? "свойство спасло"
          : "бочка спасла"
        : "есть пробитие",
      drawnCard: getPublicCheckCard(drawnCard),
      isSuccess,
    };
  }

  function normalizeBarrelCheckResults(results) {
    if (!results) return [];

    return Array.isArray(results) ? results.filter(Boolean) : [results];
  }

  function addTurnCheckEvent(room, actor, options) {
    const checkCard = options.checkCard;

    addGameEvent(room, {
      type: "turnCheck",
      actorPlayerId: actor.playerId,
      actorName: actor.name,
      actorRoleId: actor.roleId,
      checkCardId: options.checkCardId || checkCard?.cardId,
      checkCardTitle: options.checkCardTitle || getCardEventTitle(checkCard),
      checkCardColor:
        options.checkCardColor || cardConfig[checkCard?.cardId]?.eventColor,
      resultTitle: options.isSuccess ? "УСПЕХ" : "ПРОВАЛ",
      consequenceText: options.consequenceText,
      drawnCard: getPublicCheckCard(options.drawnCard),
      damageAmount: options.damageAmount || 0,
      damageColor: options.damageColor || cardConfig.bang.eventColor,
    });
  }

  function revealDeadPlayer(room, player) {
    if (player.health > 0 || !player.isAlive) return false;

    player.isAlive = false;
    player.isRoleRevealed = true;

    handleDeadPlayerCards(room, player);
    addDeathEvent(room, player);
    return true;
  }

  function applyDeathRewards(room, player, killer = null) {
    if (player.health > 0 || player.isAlive) return;

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

  function handleDeadPlayerCards(room, player) {
    if (room.game.pendingCharacterPayment?.playerId === player.playerId) {
      room.game.discard.push(
        ...room.game.pendingCharacterPayment.cards.map((entry) => entry.card),
      );
      room.game.pendingCharacterPayment = null;
    }

    if (room.game.pendingTurnDiscard?.playerId === player.playerId) {
      room.game.discard.push(
        ...room.game.pendingTurnDiscard.cards.map((entry) => entry.card),
      );
      room.game.pendingTurnDiscard = null;
    }

    const cards = collectPlayerCards(room, player);
    const receiver = getDeadPlayerCardsReceiver(room, player);

    if (receiver && cards.length > 0) {
      addCardsToHand(room, receiver, cards, {
        allowEmptyHandAbilities: false,
      });
      addGameEvent(room, {
        type: "characterAbility",
        actorName: receiver.name,
        actorRoleId: receiver.roleId,
        characterId: receiver.characterId,
        characterTitle: characterConfig[receiver.characterId]?.title,
        targetName: player.name,
        targetRoleId: player.roleId,
        cardsCount: cards.length,
      });
      return;
    }

    room.game.discard.push(...cards);
  }

  function collectPlayerCards(room, player) {
    const cards = [];

    cards.push(...clearPlayerHand(room, player));

    if (player.weapon) {
      clearWeaponPropertyAllowances(room, player);
      cards.push(player.weapon);
      player.weapon = null;
    }

    if (player.blueCards?.length > 0) {
      cards.push(...player.blueCards);
      player.blueCards = [];
    }

    if (room.game.turnCheck?.playerId === player.playerId) {
      room.game.turnCheck = null;
    }

    clearActiveCharacterAbility(room, player.playerId);
    player.attackRange = config.defaultAttackRange;

    return cards;
  }

  function discardPlayerCards(room, player) {
    room.game.discard.push(...collectPlayerCards(room, player));
  }

  function getDeadPlayerCardsReceiver(room, deadPlayer) {
    return (
      getAlivePlayers(room).find((player) => {
        if (player.playerId === deadPlayer.playerId) return false;

        const ability = characterConfig[player.characterId]?.ability;

        return (
          ability?.trigger === "playerDeath" &&
          ability?.effect === "takeDeadPlayerCards"
        );
      }) || null
    );
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

    if (room.game.winner || !sheriff) return Boolean(room.game.winner);

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
      return true;
    }

    if (alivePlayers.length === 1 && alivePlayers[0].roleId === "renegade") {
      finishGame(room, "renegade", getRenegadeVictoryText(alivePlayers), {
        type: "renegade",
        renegade: getPlayerSummary(alivePlayers[0]),
      });
      return true;
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
      return true;
    }

    return false;
  }

  function finishGame(room, winner, winnerText, winnerDetails = null) {
    clearPendingReaction(room);
    finishGeneralStore(room);
    clearPendingCheckChoice(room);
    room.game.pendingCharacterPayment = null;
    room.game.pendingTurnDiscard = null;
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

  function getAlivePlayersInTurnOrder(room, startPlayerId) {
    const startSeatIndex = findSeatIndexByPlayerId(room, startPlayerId);

    if (startSeatIndex === null) return [];

    return Array.from({ length: room.seats.length }, (_, offset) => {
      const seatIndex = (startSeatIndex + offset) % room.seats.length;

      return room.seats[seatIndex].player;
    }).filter((player) => player?.isAlive);
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
    ].slice(-MAX_GAME_EVENTS);
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

  function broadcastRoom(roomId) {
    if (!roomId) return;

    pendingRoomBroadcasts.add(roomId);
    scheduleBroadcastFlush();
  }

  function broadcastRoomList() {
    shouldBroadcastRoomList = true;
    scheduleBroadcastFlush();
  }

  function scheduleBroadcastFlush() {
    if (isBroadcastFlushScheduled) return;

    isBroadcastFlushScheduled = true;
    queueMicrotask(flushBroadcasts);
  }

  function flushBroadcasts() {
    isBroadcastFlushScheduled = false;
    const roomIds = [...pendingRoomBroadcasts];

    pendingRoomBroadcasts.clear();

    roomIds.forEach((roomId) => {
      const room = roomId ? rooms.get(roomId) : null;

      if (!room) return;

      if (room.status === "game" || room.status === "finished") {
        flushHandChangedPlayers(room);
      }

      clients.forEach((client) => {
        if (client.roomId === roomId) {
          send(client.socket, "room:update", {
            room: getPublicRoom(room, client.playerId),
          });
        }
      });
    });

    if (!shouldBroadcastRoomList) {
      return;
    }

    shouldBroadcastRoomList = false;
    const payload = { rooms: getPublicRooms() };

    clients.forEach((client) => {
      if (client.roomId) return;

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
    return randomInt(config.bulletSkinCount);
  }

  logger.info(
    `Bang WebSocket server is running on ws://localhost:${config.port}`,
  );
}
