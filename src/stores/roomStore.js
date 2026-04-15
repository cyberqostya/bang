import { defineStore } from "pinia";
import { computed, ref } from "vue";

const fallbackRoom = {
  id: "main",
  name: "Салун",
  status: "lobby",
  hostClientId: null,
  seats: Array.from({ length: 8 }, (_, index) => ({
    index,
    player: null,
  })),
};

export const useRoomStore = defineStore("room", () => {
  const screen = ref("rooms");
  const clientId = ref("");
  const connectionStatus = ref("idle");
  const error = ref("");
  const room = ref(fallbackRoom);
  const socket = ref(null);

  const rooms = computed(() => [room.value]);
  const players = computed(() => (
    room.value.seats
      .filter((seat) => seat.player)
      .map((seat) => ({
        seatIndex: seat.index,
        ...seat.player,
      }))
  ));
  const isConnected = computed(() => connectionStatus.value === "connected");
  const isHost = computed(() => Boolean(clientId.value) && room.value.hostClientId === clientId.value);
  const isSeated = computed(() => room.value.seats.some((seat) => seat.player?.clientId === clientId.value));
  const canStartGame = computed(() => isHost.value && players.value.length > 1);
  const wsUrl = computed(() => getWebSocketUrl());

  function connect() {
    if (socket.value || connectionStatus.value === "connecting") return;

    connectionStatus.value = "connecting";
    socket.value = new WebSocket(getWebSocketUrl());

    socket.value.addEventListener("open", () => {
      connectionStatus.value = "connected";
      error.value = "";
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

  function openRoom(roomId) {
    if (roomId !== room.value.id) return;

    if (!isConnected.value) {
      error.value = "Нет соединения с сервером";
      return;
    }

    if (room.value.status === "game") {
      if (isSeated.value) {
        screen.value = "game";
        return;
      }

      error.value = "Игра уже идет";
      return;
    }

    screen.value = "seats";
  }

  function takeSeat(seatIndex, name) {
    send("room:take-seat", { seatIndex, name });
  }

  function leaveSeat() {
    send("room:leave-seat");
  }

  function startGame() {
    if (!canStartGame.value) {
      error.value = "Нужно минимум два игрока за столом";
      return;
    }

    send("room:start-game");
  }

  function handleMessage(message) {
    if (message.type === "client:init") {
      clientId.value = message.payload.clientId;
      room.value = message.payload.room;

      if (room.value.status === "game") {
        screen.value = isSeated.value ? "game" : "rooms";

        if (!isSeated.value) {
          error.value = "Игра началась без вас";
        }
      }

      return;
    }

    if (message.type === "room:update") {
      room.value = message.payload.room;

      if (room.value.status === "game") {
        screen.value = isSeated.value ? "game" : "rooms";

        if (!isSeated.value) {
          error.value = "Игра началась без вас";
        }
      }

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

  return {
    clientId,
    canStartGame,
    connectionStatus,
    error,
    isConnected,
    isHost,
    isSeated,
    players,
    room,
    rooms,
    screen,
    wsUrl,
    connect,
    leaveSeat,
    openRoom,
    startGame,
    takeSeat,
  };
});

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
