<script setup>
import { nextTick, ref } from "vue";
import { useRoomStore } from "../stores/roomStore.js";

const roomStore = useRoomStore();
const nameInput = ref(null);
const selectedSeatIndex = ref(null);
const playerName = ref("");
const isNameDialogOpen = ref(false);

function handleSeatClick(seat) {
  if (isOwnSeat(seat)) {
    roomStore.leaveSeat();
    return;
  }

  if (seat.player) return;

  openNameDialog(seat.index);
}

function isOwnSeat(seat) {
  return seat.player?.playerId === roomStore.playerId;
}

async function openNameDialog(seatIndex) {
  selectedSeatIndex.value = seatIndex;
  playerName.value = "";
  isNameDialogOpen.value = true;

  await nextTick();
  nameInput.value?.focus();
}

function closeNameDialog() {
  isNameDialogOpen.value = false;
  selectedSeatIndex.value = null;
  playerName.value = "";
}

function submitName() {
  const name = playerName.value.trim();

  if (!name || selectedSeatIndex.value === null) return;

  roomStore.takeSeat(selectedSeatIndex.value, name);
  closeNameDialog();
}
</script>

<template>
  <main class="seats-screen">
    <section class="seat-table" aria-label="Выбор места">
      <div class="seat-table__oval">
        <span>Рассаживайтесь,<br />игроки</span>
      </div>

      <button
        v-for="seat in roomStore.room.seats"
        :key="seat.index"
        class="seat"
        :class="[
          `seat_${seat.index + 1}`,
          {
            seat_taken: seat.player,
            seat_own: isOwnSeat(seat),
          },
        ]"
        type="button"
        :disabled="Boolean(seat.player) && !isOwnSeat(seat)"
        @click="handleSeatClick(seat)"
      >
        <span v-if="seat.player">{{ seat.player.name }}</span>
      </button>
    </section>

    <button
      v-if="roomStore.isHost"
      class="start-button"
      type="button"
      :disabled="!roomStore.canStartGame"
      @click="roomStore.startGame"
    >
      Начать игру
    </button>

    <p v-if="roomStore.error" class="screen-error">{{ roomStore.error }}</p>

    <div
      v-if="isNameDialogOpen"
      class="name-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Введите имя"
    >
      <form class="name-dialog__form" @submit.prevent="submitName">
        <input
          ref="nameInput"
          v-model="playerName"
          class="name-dialog__input"
          type="text"
          inputmode="text"
          autocomplete="off"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          maxlength="15"
          placeholder="Имя"
        />
        <div class="name-dialog__actions">
          <button
            class="name-dialog__cancel"
            type="button"
            @click="closeNameDialog"
          >
            <span>Отмена</span>
          </button>
          <button
            class="name-dialog__submit"
            type="submit"
            :disabled="!playerName.trim()"
          >
            <span>Сесть</span>
          </button>
        </div>
      </form>
    </div>
  </main>
</template>

<style scoped>
.seats-screen {
  position: fixed;
  inset: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto auto;
  gap: 14px;
  width: min(100%, 600px);
  height: 100dvh;
  margin-inline: auto;
  padding: 5px;
  background: var(--back);
}

.seat-table {
  position: relative;
  min-height: 0;
}

.seat-table__oval {
  position: absolute;
  inset: 7% 10%;
  display: grid;
  place-items: center;
  border: 2px solid rgba(94, 84, 70, 0.3);
  border-radius: 50%;
  background: linear-gradient(
    180deg,
    rgba(243, 241, 219, 0.94),
    rgba(235, 229, 208, 0.88)
  );
  box-shadow:
    inset 0 10px 26px rgba(94, 84, 70, 0.12),
    0 12px 24px rgba(94, 84, 70, 0.12);
}

.seat-table__oval span {
  color: rgba(94, 84, 70, 0.34);
  font-size: 28px;
  line-height: 1;
  text-align: center;
}

.seat {
  position: absolute;
  --plus-color: rgb(202, 189, 169);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border: 1px dashed var(--line);
  border-radius: 50%;
  background: var(--back-soft);
  color: var(--ink);
  font-size: 24px;
  line-height: 1;
  padding: 0;
  text-align: center;
}

.seat::before,
.seat::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  display: none;
  width: 14px;
  height: 2px;
  border-radius: 999px;
  background: var(--plus-color);
  transform: translate(-50%, -50%);
}

.seat::after {
  transform: translate(-50%, -50%) rotate(90deg);
}

.seat:not(.seat_taken)::before,
.seat:not(.seat_taken)::after {
  display: block;
}

.seat span {
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.seat:disabled {
  opacity: 1;
}

.seat_taken {
  border-radius: 6px;
  background: var(--gold);
  height: auto;
  width: auto;
  min-width: 8ch;
  min-height: 1.5em;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  text-align: center;
  padding-inline: 5px;
  border: none;
}

.seat_taken span {
  width: 100%;
  height: 100%;
  color: var(--ink);
  font-size: 24px;
  line-height: 1;
  text-align: center;
}

.seat_own {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}

.seat_1 {
  top: 1%;
  left: 50%;
  transform: translateX(-50%);
}

.seat_2 {
  top: 19%;
  right: 8%;
}

.seat_3 {
  top: 50%;
  right: 0%;
  transform: translateY(-50%);
}

.seat_4 {
  right: 8%;
  bottom: 19%;
}

.seat_5 {
  bottom: 2%;
  left: 50%;
  transform: translateX(-50%);
}

.seat_6 {
  bottom: 19%;
  left: 8%;
}

.seat_7 {
  top: 50%;
  left: 0%;
  transform: translateY(-50%);
}

.seat_8 {
  top: 19%;
  left: 8%;
}

.start-button {
  min-height: 54px;
  border: 1px dashed var(--line);
  border-radius: 6px;
  background: var(--gold);
  color: var(--ink);
  font-size: 24px;
}

.start-button:disabled {
  opacity: 0.52;
}

.screen-error {
  margin: 0;
  color: var(--red);
  font-size: 16px;
}

.name-dialog {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  padding: 5px;
  background: rgba(29, 29, 29, 0.18);
}

.name-dialog__form {
  display: grid;
  gap: 10px;
  width: min(100%, 360px);
  border: 1px dashed var(--line);
  border-radius: 6px;
  padding: 12px;
  background: var(--back-soft);
}

.name-dialog__input {
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

.name-dialog__input:focus {
  border-color: rgba(94, 84, 70, 0.5);
}

.name-dialog__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.name-dialog__actions button {
  min-height: 44px;
  border: none;
  border-radius: 6px;
  font-size: 20px;
}

.name-dialog__cancel {
  background: rgba(94, 84, 70, 0.16);
  color: var(--muted);
}

.name-dialog__submit {
  background: var(--gold);
  color: var(--ink);
}

.name-dialog__actions button:disabled {
  opacity: 0.5;
}
</style>
