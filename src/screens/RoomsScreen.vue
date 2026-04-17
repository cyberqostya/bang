<script setup>
import { nextTick, ref } from "vue";
import AppHeader from "../components/AppHeader.vue";
import AppScreen from "../components/AppScreen.vue";
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

function getRoomBackground(roomId) {
  const index = getStableRoomAssetIndex(roomId);

  return `url(/images/rooms/${index}.webp)`;
}

function getStableRoomAssetIndex(value) {
  const hash = String(value)
    .split("")
    .reduce((sum, character) => sum + character.charCodeAt(0), 0);

  return (hash % 12) + 1;
}
</script>

<template>
  <AppScreen class="rooms-screen">
    <AppHeader>
      <template #left>
        <button
          class="create-room-button"
          type="button"
          :disabled="!roomStore.isConnected"
          @click="openCreateDialog"
        >
          <span>Создать комнату</span>
        </button>
      </template>
    </AppHeader>

    <section class="rooms-zone" aria-label="Список комнат">
      <span class="rooms-zone__title">Список комнат</span>
      <div class="rooms-zone__content">
        <button
          v-for="room in roomStore.rooms"
          :key="room.id"
          class="room-card"
          :style="{ backgroundImage: getRoomBackground(room.id) }"
          type="button"
          :disabled="!roomStore.isConnected"
          @click="openJoinDialog(room)"
        >
          <span class="room-card__text">
            <span>{{ room.name }}</span>
            <small>
              {{
                room.status === "game"
                  ? `Игра идет · ${room.playersCount}/${room.maxPlayers || 8}`
                  : `Игроков: ${room.playersCount}/${room.maxPlayers}`
              }}
            </small>
          </span>
          <img class="room-card__enter" src="/images/room-enter.svg" alt="" />
        </button>

        <button
          v-if="roomStore.rooms.length === 0"
          class="room-create-card"
          type="button"
          :disabled="!roomStore.isConnected"
          aria-label="Создать комнату"
          @click="openCreateDialog"
        >
          <span class="room-create-card__plus" aria-hidden="true"></span>
        </button>
      </div>
    </section>

    <p v-if="roomStore.error" class="screen-error">{{ roomStore.error }}</p>
    <button
      v-if="!roomStore.isConnected"
      class="connection-button"
      type="button"
      :disabled="!roomStore.canUseConnectionAction"
      @click="roomStore.reconnect"
    >
      <span>{{ roomStore.connectionActionLabel }}</span>
    </button>

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
  </AppScreen>
</template>

<style scoped>
.rooms-screen {
  align-content: start;
  gap: 10px;
}

.create-room-button,
.connection-button {
  height: 100%;
  border: 0;
  border-radius: 6px;
  padding: 0 10px;
  background: var(--gold);
  color: var(--ink);
  font-size: 18px;
  font-weight: 600;
}

.create-room-button:disabled {
  opacity: 0.55;
}

.connection-button {
  width: 100%;
  min-height: 54px;
  background: rgba(94, 84, 70, 0.16);
  color: var(--muted);
  font-size: 18px;
}

.connection-button:disabled {
  opacity: 0.55;
}

.rooms-zone {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 5px;
}

.rooms-zone__title {
  display: block;
  margin: 0 0 5px;
  color: var(--muted);
  font-size: 24px;
  line-height: 1;
}

.rooms-zone__content {
  display: grid;
  align-content: start;
  gap: 8px;
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 0;
}

.room-card {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 94px;
  overflow: hidden;
  border-radius: 6px;
  padding: 12px 20px;
  background-color: var(--back-soft);
  background-position: center;
  background-size: cover;
  box-shadow:
    inset 0 0 0 1px rgba(243, 241, 219, 0.24),
    inset 0 -18px 26px rgba(29, 29, 29, 0.18);
  text-align: left;
  transition:
    box-shadow 140ms ease,
    filter 140ms ease,
    transform 140ms ease;
}

.room-card::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      90deg,
      rgba(29, 29, 29, 0.78),
      rgba(29, 29, 29, 0.34) 56%,
      rgba(29, 29, 29, 0.14)
    ),
    linear-gradient(0deg, rgba(29, 29, 29, 0.12), rgba(29, 29, 29, 0.12));
}

.room-card::after {
  content: "";
  position: absolute;
  inset: 5px;
  border-radius: 4px;
  pointer-events: none;
  box-shadow:
    inset 0 0 0 1px rgba(243, 241, 219, 0.22),
    inset 0 0 0 2px rgba(29, 29, 29, 0.18);
}

.room-card:disabled {
  opacity: 0.55;
}

.room-card:not(:disabled):active {
  filter: brightness(1.06);
  transform: translateY(2px);
  box-shadow:
    inset 0 0 0 1px rgba(243, 241, 219, 0.2),
    inset 0 -10px 18px rgba(29, 29, 29, 0.2);
}

.room-card__text {
  position: relative;
  z-index: 1;
  display: grid;
  justify-items: start;
  gap: 4px;
  min-width: 0;
}

.room-card__enter {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  object-fit: contain;
  opacity: 0.9;
  filter: drop-shadow(0 2px 5px rgba(29, 29, 29, 0.36));
}

.room-card__text span {
  color: var(--back-soft);
  font-size: 26px;
  font-weight: 500;
  line-height: 1;
  text-shadow: 0 2px 8px rgba(29, 29, 29, 0.8);
}

.room-card__text small {
  color: rgba(243, 241, 219, 0.78);
  font-size: 16px;
  line-height: 1;
  text-shadow: 0 2px 8px rgba(29, 29, 29, 0.8);
}

.screen-error {
  margin: 0;
  font-size: 16px;
  padding: 5px;
  color: var(--red);
}

.room-create-card {
  display: grid;
  place-items: center;
  width: 100%;
  min-height: 94px;
  border: 1px dashed var(--line);
  border-radius: 6px;
  background: var(--back);
}

.room-create-card:disabled {
  opacity: 0.55;
}

.room-create-card__plus {
  position: relative;
  display: block;
  width: 52px;
  height: 52px;
  border: 1px dashed var(--line);
  border-radius: 50%;
  background: var(--page-back);
}

.room-create-card__plus::before,
.room-create-card__plus::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 20px;
  height: 2px;
  border-radius: 999px;
  background: rgba(94, 84, 70, 0.42);
  transform: translate(-50%, -50%);
}

.room-create-card__plus::after {
  transform: translate(-50%, -50%) rotate(90deg);
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
  font-weight: 600;
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
