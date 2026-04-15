import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { cardConfig } from "../config/cardConfig.js";

const fallbackRoom = {
  id: "",
  name: "",
  status: "lobby",
  hostPlayerId: null,
  seats: Array.from({ length: 8 }, (_, index) => ({
    index,
    player: null,
  })),
};

export const useRoomStore = defineStore("room", () => {
  const screen = ref("rooms");
  const playerId = ref(getStoredPlayerId());
  const connectionStatus = ref("idle");
  const error = ref("");
  const room = ref(fallbackRoom);
  const rooms = ref([]);
  const selectedCardId = ref("");
  const socket = ref(null);

  const players = computed(() => (
    room.value.seats
      .filter((seat) => seat.player)
      .map((seat) => ({
        seatIndex: seat.index,
        ...seat.player,
      }))
  ));
  const ownPlayer = computed(() => players.value.find((player) => player.playerId === playerId.value) || null);
  const isConnected = computed(() => connectionStatus.value === "connected");
  const hasRoom = computed(() => Boolean(room.value.id));
  const isHost = computed(() => Boolean(playerId.value) && room.value.hostPlayerId === playerId.value);
  const isSeated = computed(() => Boolean(ownPlayer.value));
  const canStartGame = computed(() => isHost.value && isSeated.value && players.value.length > 1);
  const selectedCard = computed(() => cardConfig[selectedCardId.value] || null);
  const wsUrl = computed(() => getWebSocketUrl());

  function connect() {
    if (socket.value || connectionStatus.value === "connecting") return;

    connectionStatus.value = "connecting";
    socket.value = new WebSocket(getWebSocketUrl());

    socket.value.addEventListener("open", () => {
      connectionStatus.value = "connected";
      error.value = "";
      send("client:hello", { playerId: playerId.value });
    });

    socket.value.addEventListener("message", (event) => {
      const message = parseMessage(event.data);

      if (!message) return;

      handleMessage(message);
    });

    socket.value.addEventListener("close", () => {
      connectionStatus.value = "closed";
      socket.value = null;
    });

    socket.value.addEventListener("error", () => {
      connectionStatus.value = "error";
      error.value = "Сервер недоступен";
    });
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

  function selectCard(cardId) {
    selectedCardId.value = selectedCardId.value === cardId ? "" : cardId;
  }

  function cancelSelectedCard() {
    selectedCardId.value = "";
  }

  function useSelectedCard(targetPlayerId) {
    if (!selectedCard.value) return;

    send("game:action", {
      action: selectedCard.value.action,
      cardId: selectedCard.value.id,
      targetPlayerId,
    });
    cancelSelectedCard();
  }

  function startGame() {
    if (!canStartGame.value) {
      error.value = isSeated.value ? "Нужно минимум два игрока за столом" : "Сначала займите место за столом";
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
      syncScreenWithRoom();

      return;
    }

    if (message.type === "room:closed") {
      room.value = fallbackRoom;
      screen.value = "rooms";
      error.value = "Комната закрыта";
      cancelSelectedCard();
      return;
    }

    if (message.type === "room:left") {
      room.value = fallbackRoom;
      rooms.value = message.payload.rooms || rooms.value;
      screen.value = "rooms";
      error.value = "";
      cancelSelectedCard();
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

  return {
    canStartGame,
    connectionStatus,
    error,
    hasRoom,
    isConnected,
    isHost,
    isSeated,
    ownPlayer,
    playerId,
    players,
    room,
    rooms,
    selectedCard,
    selectedCardId,
    screen,
    wsUrl,
    cancelSelectedCard,
    closeRoom,
    connect,
    createRoom,
    joinRoom,
    leaveRoom,
    leaveSeat,
    openOwnRoom,
    selectCard,
    startGame,
    takeSeat,
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

  return `player-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getWebSocketUrl() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  return `${protocol}//${window.location.hostname}:3001`;
}

function parseMessage(data) {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
