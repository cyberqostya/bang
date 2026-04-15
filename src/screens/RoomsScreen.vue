<script setup>
import { useRoomStore } from "../stores/roomStore.js";

const roomStore = useRoomStore();
</script>

<template>
  <main class="rooms-screen">
    <p class="connection-status">
      {{ roomStore.isConnected ? "Сервер подключен" : `Подключение к ${roomStore.wsUrl}` }}
    </p>

    <button
      v-for="room in roomStore.rooms"
      :key="room.id"
      class="room-card"
      type="button"
      :disabled="!roomStore.isConnected"
      @click="roomStore.openRoom(room.id)"
    >
      <span>{{ room.name }}</span>
      <small>{{ room.status === "game" ? "Игра идет" : "Ожидание игроков" }}</small>
    </button>

    <p v-if="roomStore.error" class="screen-error">{{ roomStore.error }}</p>
  </main>
</template>

<style scoped>
.rooms-screen {
  position: fixed;
  inset: 0;
  display: grid;
  align-content: start;
  gap: 14px;
  width: min(100%, 600px);
  height: 100dvh;
  margin-inline: auto;
  padding: 5px;
  background: var(--back);
}

.connection-status {
  margin: 0;
  color: var(--muted);
  font-size: 15px;
  line-height: 1;
}

.room-card {
  display: grid;
  justify-items: start;
  gap: 4px;
  width: 100%;
  min-height: 68px;
  border: 1px dashed var(--line);
  border-radius: 6px;
  padding: 12px;
  background: var(--back-soft);
}

.room-card:disabled {
  opacity: 0.55;
}

.room-card span {
  color: var(--ink);
  font-size: 26px;
  line-height: 1;
}

.room-card small {
  color: var(--muted);
  font-size: 16px;
  line-height: 1;
}

.screen-error {
  margin: 0;
  color: var(--red);
  font-size: 16px;
}
</style>
