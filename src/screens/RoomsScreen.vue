<script setup>
import { computed, nextTick, ref } from "vue";
import AppButton from "../components/AppButton.vue";
import AppInput from "../components/AppInput.vue";
import { useAppHeader } from "../composables/useAppHeader.js";
import { useRoomStore } from "../stores/roomStore.js";
import { resolveAssetUrl } from "../utils/assets.js";

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

  if (room.status !== "lobby") {
    roomStore.error = "В этой комнате уже идет игра, подключение невозможно";
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

  return `url("${resolveAssetUrl(`/images/rooms/${index}.webp`)}")`;
}

function getStableRoomAssetIndex(value) {
  const hash = String(value)
    .split("")
    .reduce((sum, character) => sum + character.charCodeAt(0), 0);

  return (hash % 12) + 1;
}

function normalizePinInput(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 4);
}

function updateRoomPassword(event) {
  roomPassword.value = normalizePinInput(event.target.value);
}

function updateJoinPassword(event) {
  joinPassword.value = normalizePinInput(event.target.value);
}

function getRoomStatusText(room) {
  const count = `${room.playersCount}/${room.maxPlayers || 8}`;

  return room.status !== "lobby"
    ? `Игра в процессе ${count}`
    : `Идёт набор игроков: ${count}`;
}

useAppHeader(
  computed(() => ({
    leftButton: {
      label: "Создать",
      variant: "primary",
      disabled: !roomStore.isConnected,
      onClick: openCreateDialog,
    },
  })),
);
</script>

<template>
  <div class="rooms-screen">
    <section class="rooms-zone" aria-label="Список комнат">
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
            <small>{{ getRoomStatusText(room) }}</small>
          </span>
          <img
            class="room-card__enter"
            :src="resolveAssetUrl('/images/room-enter.svg')"
            alt=""
          />
        </button>

        <button
          v-if="roomStore.rooms.length === 0"
          class="room-card room-create-card"
          type="button"
          :disabled="!roomStore.isConnected"
          aria-label="Создать комнату"
          @click="openCreateDialog"
        >
          <span class="room-card__text room-create-card__text">
            <span>Новая комната</span>
            <small>Создать место для игры</small>
          </span>
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
        <AppInput
          ref="createNameInput"
          v-model="roomName"
          type="text"
          inputmode="text"
          autocomplete="off"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          maxlength="15"
          placeholder="Комната"
        />
        <AppInput
          v-model="roomPassword"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          autocomplete="off"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          maxlength="4"
          placeholder="Пароль"
          @input="updateRoomPassword"
        />
        <div class="room-dialog__actions">
          <AppButton
            variant="muted"
            size="modal"
            type="button"
            @click="closeCreateDialog"
          >
            <span>Отмена</span>
          </AppButton>
          <AppButton
            variant="primary"
            size="modal"
            type="submit"
            :disabled="!roomName.trim() || !roomPassword.trim()"
          >
            <span>Создать</span>
          </AppButton>
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
        <AppInput
          ref="joinPasswordInput"
          v-model="joinPassword"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          autocomplete="off"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          maxlength="4"
          placeholder="Пароль"
          @input="updateJoinPassword"
        />
        <div class="room-dialog__actions">
          <AppButton
            variant="muted"
            size="modal"
            type="button"
            @click="closeJoinDialog"
          >
            <span>Отмена</span>
          </AppButton>
          <AppButton
            variant="primary"
            size="modal"
            type="submit"
            :disabled="!joinPassword.trim()"
          >
            <span>Войти</span>
          </AppButton>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.rooms-screen {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
}

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
  background:
    linear-gradient(
      90deg,
      rgba(243, 241, 219, 0.94),
      rgba(235, 229, 208, 0.72)
    ),
    repeating-linear-gradient(
      135deg,
      rgba(94, 84, 70, 0.08) 0,
      rgba(94, 84, 70, 0.08) 8px,
      transparent 8px,
      transparent 16px
    );
  box-shadow:
    inset 0 0 0 1px rgba(243, 241, 219, 0.64),
    inset 0 -18px 26px rgba(94, 84, 70, 0.08);
}

.room-create-card::before {
  display: none;
}

.room-create-card::after {
  box-shadow:
    inset 0 0 0 1px rgba(94, 84, 70, 0.12),
    inset 0 0 0 2px rgba(243, 241, 219, 0.42);
}

.room-create-card:not(:disabled):active {
  border-color: rgba(94, 84, 70, 0.5);
  background:
    linear-gradient(90deg, rgba(243, 241, 219, 1), rgba(235, 229, 208, 0.84)),
    repeating-linear-gradient(
      135deg,
      rgba(94, 84, 70, 0.1) 0,
      rgba(94, 84, 70, 0.1) 8px,
      transparent 8px,
      transparent 16px
    );
}

.room-create-card__text span {
  color: rgba(94, 84, 70, 0.74);
  text-shadow: none;
}

.room-create-card__text small {
  color: rgba(94, 84, 70, 0.56);
  text-shadow: none;
}

.room-create-card__plus {
  position: relative;
  flex: 0 0 auto;
  display: block;
  width: 44px;
  height: 44px;
  border: 1px solid rgba(94, 84, 70, 0.26);
  border-radius: 50%;
  background: var(--page-back);
  box-shadow: 0 8px 18px rgba(94, 84, 70, 0.14);
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
  background: var(--ink);
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

.room-dialog__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
</style>
