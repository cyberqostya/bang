import { defineStore } from "pinia";
import { computed, ref } from "vue";

const fallbackRoom = {
  id: "",
  name: "",
  status: "lobby",
  hostPlayerId: null,
  playersCount: 0,
  seats: Array.from({ length: 8 }, (_, index) => ({
    index,
    player: null,
  })),
};
const connectionAttemptSeconds = 5;
const maxAutoConnectionAttempts = 3;
const maxTotalConnectionAttempts = 3;

export const useRoomStore = defineStore("room", () => {
  const screen = ref("rooms");
  const playerId = ref(getStoredPlayerId());
  const connectionStatus = ref("idle");
  const error = ref("");
  const connectionAttempt = ref(0);
  const connectionAttemptSecondsLeft = ref(0);
  const totalConnectionAttempts = ref(0);
  const room = ref(fallbackRoom);
  const rooms = ref([]);
  const isDiscardingCards = ref(false);
  const selectedCardId = ref("");
  const socket = ref(null);
  let connectCountdownTimer = null;
  let connectTimeoutTimer = null;

  const players = computed(() =>
    room.value.seats
      .filter((seat) => seat.player)
      .map((seat) => ({
        seatIndex: seat.index,
        ...seat.player,
      })),
  );
  const ownPlayer = computed(
    () =>
      players.value.find((player) => player.playerId === playerId.value) ||
      null,
  );
  const isConnected = computed(() => connectionStatus.value === "connected");
  const hasRoom = computed(() => Boolean(room.value.id));
  const isHost = computed(
    () => Boolean(playerId.value) && room.value.hostPlayerId === playerId.value,
  );
  const isSeated = computed(() => Boolean(ownPlayer.value));
  const canStartGame = computed(
    () => isHost.value && room.value.playersCount > 1,
  );
  const isMyTurn = computed(
    () => room.value.game?.turnPlayerId === playerId.value,
  );
  const ownHand = computed(() => ownPlayer.value?.hand || []);
  const mustDiscardCards = computed(
    () =>
      room.value.status === "game" &&
      isMyTurn.value &&
      Boolean(ownPlayer.value) &&
      ownHand.value.length > ownPlayer.value.health,
  );
  const hasOwnTurnCheck = computed(
    () => room.value.game?.turnCheck?.playerId === playerId.value,
  );
  const selectedCard = computed(
    () =>
      ownHand.value.find((card) => card.instanceId === selectedCardId.value) ||
      null,
  );
  const wsUrl = computed(() => getWebSocketUrl());
  const connectionActionLabel = computed(() => {
    if (isConnected.value) return "Сервер подключен";

    if (connectionStatus.value === "connecting") {
      if (totalConnectionAttempts.value <= maxAutoConnectionAttempts) {
        return `Подключаемся к серверу ${connectionAttempt.value}/${maxAutoConnectionAttempts} (${connectionAttemptSecondsLeft.value} сек)`;
      }

      return `Подключаемся к серверу (${connectionAttemptSecondsLeft.value} сек)`;
    }

    if (totalConnectionAttempts.value >= maxAutoConnectionAttempts) {
      return "Перезагрузить страницу";
    }

    return "Подключиться";
  });
  const canUseConnectionAction = computed(
    () => !isConnected.value && connectionStatus.value !== "connecting",
  );

  function connect() {
    if (
      socket.value?.readyState === WebSocket.OPEN ||
      connectionStatus.value === "connecting"
    )
      return;
    if (totalConnectionAttempts.value >= maxTotalConnectionAttempts) return;

    totalConnectionAttempts.value += 1;
    connectionAttempt.value = Math.min(
      totalConnectionAttempts.value,
      maxAutoConnectionAttempts,
    );
    connectionAttemptSecondsLeft.value = connectionAttemptSeconds;
    connectionStatus.value = "connecting";

    const nextSocket = new WebSocket(getWebSocketUrl());

    socket.value = nextSocket;
    startConnectionCountdown();
    connectTimeoutTimer = window.setTimeout(() => {
      if (
        socket.value !== nextSocket ||
        nextSocket.readyState === WebSocket.OPEN
      )
        return;

      failConnectionAttempt(nextSocket);
    }, connectionAttemptSeconds * 1000);

    nextSocket.addEventListener("open", () => {
      if (socket.value !== nextSocket) return;

      clearConnectionTimers();
      connectionAttempt.value = 0;
      connectionAttemptSecondsLeft.value = 0;
      totalConnectionAttempts.value = 0;
      connectionStatus.value = "connected";
      error.value = "";
      send("client:hello", { playerId: playerId.value });
    });

    nextSocket.addEventListener("message", (event) => {
      if (socket.value !== nextSocket) return;

      const message = parseMessage(event.data);

      if (!message) return;

      handleMessage(message);
    });

    nextSocket.addEventListener("close", () => {
      if (socket.value !== nextSocket) return;

      failConnectionAttempt(nextSocket);
    });

    nextSocket.addEventListener("error", () => {
      if (socket.value !== nextSocket) return;

      failConnectionAttempt(nextSocket);
    });
  }

  function reconnect() {
    if (connectionStatus.value === "connecting") return;

    if (totalConnectionAttempts.value >= maxTotalConnectionAttempts) {
      window.location.reload();
      return;
    }

    clearConnectionTimers();

    if (socket.value) {
      const currentSocket = socket.value;

      socket.value = null;
      currentSocket.close();
    }

    connectionStatus.value = "idle";
    connect();
  }

  function createRoom(name, password) {
    send("room:create", { name, password });
  }

  function joinRoom(roomId, password) {
    send("room:join", { roomId, password });
  }

  function openOwnRoom() {
    if (!hasRoom.value) return;

    syncScreenWithRoom();
  }

  function takeSeat(seatIndex, name) {
    send("room:take-seat", { seatIndex, name });
  }

  function leaveSeat() {
    send("room:leave-seat");
  }

  function leaveRoom() {
    send("room:leave-room");
  }

  function closeRoom() {
    send("room:close");
  }

  function finishGameRoom() {
    send("game:finish-room");
  }

  function selectCard(cardInstanceId) {
    if (isDiscardingCards.value) {
      discardCard(cardInstanceId);
      return;
    }

    if (hasOwnTurnCheck.value) return;

    const card = ownHand.value.find(
      (candidate) => candidate.instanceId === cardInstanceId,
    );

    if (!card?.isPlayable) return;

    if (!card.needsTarget) {
      send("game:action", {
        action: card.action,
        cardInstanceId: card.instanceId,
      });
      cancelSelectedCard();
      return;
    }

    selectedCardId.value =
      selectedCardId.value === cardInstanceId ? "" : cardInstanceId;
  }

  function cancelSelectedCard() {
    selectedCardId.value = "";
  }

  function useSelectedCard(targetPlayerId) {
    if (!selectedCard.value) return;

    send("game:action", {
      action: selectedCard.value.action,
      cardInstanceId: selectedCard.value.instanceId,
      targetPlayerId,
    });
    cancelSelectedCard();
  }

  function useTargetTableCard(targetPlayerId, targetCard) {
    if (!selectedCard.value?.targetTableCardMode) return;

    send("game:action", {
      action: selectedCard.value.action,
      cardInstanceId: selectedCard.value.instanceId,
      targetPlayerId,
      ...targetCard,
    });
    cancelSelectedCard();
  }

  function endTurn() {
    send("game:action", {
      action: "endTurn",
    });
    cancelSelectedCard();
  }

  function drawPhase() {
    send("game:action", {
      action: "drawPhase",
    });
  }

  function activateWeaponProperty() {
    send("game:action", {
      action: "activateWeaponProperty",
    });
  }

  function checkBarrel() {
    send("game:action", {
      action: "checkBarrel",
    });
  }

  function checkTurnBlueCard(cardInstanceId) {
    if (isDiscardingCards.value) return;

    send("game:action", {
      action: "checkTurnBlueCard",
      cardInstanceId,
    });
  }

  function chooseGeneralStoreCard(cardInstanceId) {
    send("game:action", {
      action: "chooseGeneralStoreCard",
      cardInstanceId,
    });
  }

  function startDiscardingCards() {
    if (!mustDiscardCards.value) return;

    isDiscardingCards.value = true;
    cancelSelectedCard();
  }

  function discardCard(cardInstanceId) {
    if (!isDiscardingCards.value || !mustDiscardCards.value) return;

    send("game:action", {
      action: "discardCard",
      cardInstanceId,
    });
  }

  function startGame() {
    if (!canStartGame.value) {
      error.value = "Нужно минимум два игрока в комнате";
      return;
    }

    send("room:start-game");
  }

  function handleMessage(message) {
    if (message.type === "client:init") {
      playerId.value = message.payload.playerId;
      storePlayerId(playerId.value);
      rooms.value = message.payload.rooms || [];
      room.value = message.payload.room || fallbackRoom;
      syncScreenWithRoom();

      return;
    }

    if (message.type === "rooms:update") {
      rooms.value = message.payload.rooms || [];
      return;
    }

    if (message.type === "room:update") {
      room.value = message.payload.room || fallbackRoom;
      error.value = "";
      syncDiscardMode();
      syncScreenWithRoom();

      return;
    }

    if (message.type === "room:closed") {
      room.value = fallbackRoom;
      screen.value = "rooms";
      error.value = "Комната закрыта";
      cancelSelectedCard();
      isDiscardingCards.value = false;
      return;
    }

    if (message.type === "room:left") {
      room.value = fallbackRoom;
      rooms.value = message.payload.rooms || rooms.value;
      screen.value = "rooms";
      error.value = "";
      cancelSelectedCard();
      isDiscardingCards.value = false;
      return;
    }

    if (message.type === "error") {
      error.value = message.payload.message;
    }
  }

  function send(type, payload = {}) {
    if (socket.value?.readyState !== WebSocket.OPEN) {
      error.value = "Нет соединения с сервером";
      return;
    }

    socket.value.send(JSON.stringify({ type, payload }));
  }

  function syncScreenWithRoom() {
    if (!hasRoom.value) {
      screen.value = "rooms";
      return;
    }

    if (room.value.status === "game" || room.value.status === "finished") {
      screen.value = isSeated.value ? "game" : "rooms";

      if (!isSeated.value) {
        error.value = "Игра началась без вас";
      }

      return;
    }

    screen.value = "seats";
  }

  function syncDiscardMode() {
    if (!isDiscardingCards.value) return;

    if (!mustDiscardCards.value) {
      isDiscardingCards.value = false;
    }
  }

  function startConnectionCountdown() {
    window.clearInterval(connectCountdownTimer);

    connectCountdownTimer = window.setInterval(() => {
      connectionAttemptSecondsLeft.value = Math.max(
        0,
        connectionAttemptSecondsLeft.value - 1,
      );
    }, 1000);
  }

  function failConnectionAttempt(failedSocket) {
    if (socket.value !== failedSocket) return;

    clearConnectionTimers();
    socket.value = null;
    connectionStatus.value = "closed";
    error.value = "Сервер недоступен";

    if (failedSocket.readyState !== WebSocket.CLOSED) {
      failedSocket.close();
    }

    if (totalConnectionAttempts.value < maxAutoConnectionAttempts) {
      connect();
    }
  }

  function clearConnectionTimers() {
    window.clearInterval(connectCountdownTimer);
    window.clearTimeout(connectTimeoutTimer);
    connectCountdownTimer = null;
    connectTimeoutTimer = null;
  }

  return {
    canStartGame,
    canUseConnectionAction,
    connectionActionLabel,
    connectionAttempt,
    connectionAttemptSecondsLeft,
    connectionStatus,
    error,
    hasRoom,
    hasOwnTurnCheck,
    isConnected,
    isHost,
    isDiscardingCards,
    isMyTurn,
    isSeated,
    ownPlayer,
    ownHand,
    mustDiscardCards,
    playerId,
    players,
    room,
    rooms,
    selectedCard,
    selectedCardId,
    screen,
    wsUrl,
    cancelSelectedCard,
    activateWeaponProperty,
    checkBarrel,
    checkTurnBlueCard,
    chooseGeneralStoreCard,
    closeRoom,
    connect,
    createRoom,
    discardCard,
    drawPhase,
    endTurn,
    finishGameRoom,
    joinRoom,
    leaveRoom,
    leaveSeat,
    openOwnRoom,
    reconnect,
    selectCard,
    startGame,
    startDiscardingCards,
    takeSeat,
    useTargetTableCard,
    useSelectedCard,
  };
});

function getStoredPlayerId() {
  const storedPlayerId = window.localStorage.getItem("bangPlayerId");

  if (storedPlayerId) {
    return storedPlayerId;
  }

  const playerId = createPlayerId();

  storePlayerId(playerId);

  return playerId;
}

function storePlayerId(playerId) {
  window.localStorage.setItem("bangPlayerId", playerId);
}

function createPlayerId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  const randomValues = new Uint32Array(2);
  window.crypto.getRandomValues(randomValues);

  return `player-${Date.now()}-${Array.from(randomValues, (value) =>
    value.toString(16).padStart(8, "0"),
  ).join("")}`;
}

function getWebSocketUrl() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  return `${protocol}//${window.location.host}/game-ws`;
}

function parseMessage(data) {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
