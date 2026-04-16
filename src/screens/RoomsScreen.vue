<script setup>
import { nextTick, ref } from "vue";
import { useRoomStore } from "../stores/roomStore.js";

const roomStore = useRoomStore();
const createNameInput = ref(null);
const joinPasswordInput = ref(null);
const isCreateDialogOpen = ref(false);
const isJoinDialogOpen = ref(false);
const roomName = ref("");
const roomPassword = ref("");
const joinRoomId = ref("");
const joinPassword = ref("");

async function openCreateDialog() {
  roomName.value = "";
  roomPassword.value = "";
  isCreateDialogOpen.value = true;

  await nextTick();
  createNameInput.value?.focus();
}

function closeCreateDialog() {
  isCreateDialogOpen.value = false;
  roomName.value = "";
  roomPassword.value = "";
}

function submitCreateRoom() {
  const name = roomName.value.trim();
  const password = roomPassword.value.trim();

  if (!name || !password) return;

  roomStore.createRoom(name, password);
  closeCreateDialog();
}

async function openJoinDialog(room) {
  if (roomStore.room.id === room.id) {
    roomStore.openOwnRoom();
    return;
  }

  joinRoomId.value = room.id;
  joinPassword.value = "";
  isJoinDialogOpen.value = true;

  await nextTick();
  joinPasswordInput.value?.focus();
}

function closeJoinDialog() {
  isJoinDialogOpen.value = false;
  joinRoomId.value = "";
  joinPassword.value = "";
}

function submitJoinRoom() {
  const password = joinPassword.value.trim();

  if (!joinRoomId.value || !password) return;

  roomStore.joinRoom(joinRoomId.value, password);
  closeJoinDialog();
}
</script>

<template>
  <main class="rooms-screen">
    <p class="connection-status">
      {{
        roomStore.isConnected
          ? "Сервер подключен"
          : `Подключение к ${roomStore.wsUrl}`
      }}
    </p>
    <button
      v-if="!roomStore.isConnected"
      class="reconnect-button"
      type="button"
      :disabled="!roomStore.canUseConnectionAction"
      @click="roomStore.reconnect"
    >
      <span>{{ roomStore.connectionActionLabel }}</span>
    </button>

    <button
      class="create-room-button"
      type="button"
      :disabled="!roomStore.isConnected"
      @click="openCreateDialog"
    >
      <span>Создать комнату</span>
    </button>

    <section class="rooms-list" aria-label="Комнаты">
      <button
        v-for="room in roomStore.rooms"
        :key="room.id"
        class="room-card"
        type="button"
        :disabled="!roomStore.isConnected"
        @click="openJoinDialog(room)"
      >
        <span>{{ room.name }}</span>
        <small>
          {{ room.status === "game" ? "Игра идет" : `Игроков: ${room.playersCount}` }}
        </small>
      </button>

      <p v-if="roomStore.rooms.length === 0" class="empty-rooms">
        Комнат пока нет
      </p>
    </section>

    <p v-if="roomStore.error" class="screen-error">{{ roomStore.error }}</p>

    <div
      v-if="isCreateDialogOpen"
      class="room-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Создать комнату"
    >
      <form class="room-dialog__form" @submit.prevent="submitCreateRoom">
        <input
          ref="createNameInput"
          v-model="roomName"
          class="room-dialog__input"
          type="text"
          inputmode="text"
          autocomplete="off"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          maxlength="15"
          placeholder="Комната"
        />
        <input
          v-model="roomPassword"
          class="room-dialog__input"
          type="password"
          autocomplete="new-password"
          maxlength="40"
          placeholder="Пароль"
        />
        <div class="room-dialog__actions">
          <button
            class="room-dialog__cancel"
            type="button"
            @click="closeCreateDialog"
          >
            <span>Отмена</span>
          </button>
          <button
            class="room-dialog__submit"
            type="submit"
            :disabled="!roomName.trim() || !roomPassword.trim()"
          >
            <span>Создать</span>
          </button>
        </div>
      </form>
    </div>

    <div
      v-if="isJoinDialogOpen"
      class="room-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Войти в комнату"
    >
      <form class="room-dialog__form" @submit.prevent="submitJoinRoom">
        <input
          ref="joinPasswordInput"
          v-model="joinPassword"
          class="room-dialog__input"
          type="password"
          autocomplete="current-password"
          maxlength="40"
          placeholder="Пароль"
        />
        <div class="room-dialog__actions">
          <button
            class="room-dialog__cancel"
            type="button"
            @click="closeJoinDialog"
          >
            <span>Отмена</span>
          </button>
          <button
            class="room-dialog__submit"
            type="submit"
            :disabled="!joinPassword.trim()"
          >
            <span>Войти</span>
          </button>
        </div>
      </form>
    </div>
  </main>
</template>

<style scoped>
.rooms-screen {
  position: fixed;
  inset: 0;
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  align-content: start;
  gap: 10px;
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

.create-room-button,
.reconnect-button {
  min-height: 54px;
  border: 1px dashed var(--line);
  border-radius: 6px;
  background: var(--gold);
  color: var(--ink);
  font-size: 24px;
}

.create-room-button:disabled {
  opacity: 0.55;
}

.reconnect-button {
  background: rgba(94, 84, 70, 0.16);
  color: var(--muted);
}

.reconnect-button:disabled {
  opacity: 0.55;
}

.rooms-list {
  display: grid;
  align-content: start;
  gap: 8px;
  min-height: 0;
  overflow: hidden;
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

.empty-rooms,
.screen-error {
  margin: 0;
  font-size: 16px;
}

.empty-rooms {
  color: var(--muted);
}

.screen-error {
  color: var(--red);
}

.room-dialog {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  padding: 5px;
  background: rgba(29, 29, 29, 0.18);
}

.room-dialog__form {
  display: grid;
  gap: 10px;
  width: min(100%, 360px);
  border: 1px dashed var(--line);
  border-radius: 6px;
  padding: 12px;
  background: var(--back-soft);
}

.room-dialog__input {
  width: 100%;
  min-height: 48px;
  border: 1px dashed var(--line);
  border-radius: 6px;
  padding: 0 10px;
  background: var(--back);
  color: var(--ink);
  font-size: 24px;
  line-height: normal;
  outline: none;
}

.room-dialog__input:focus {
  border-color: rgba(94, 84, 70, 0.5);
}

.room-dialog__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.room-dialog__actions button {
  min-height: 44px;
  border: none;
  border-radius: 6px;
  font-size: 20px;
}

.room-dialog__cancel {
  background: rgba(94, 84, 70, 0.16);
  color: var(--muted);
}

.room-dialog__submit {
  background: var(--gold);
  color: var(--ink);
}

.room-dialog__actions button:disabled {
  opacity: 0.5;
}
</style>
