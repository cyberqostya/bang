<script setup>
import { computed, nextTick, ref, watch } from "vue";
import AppHeader from "../components/AppHeader.vue";
import AppScreen from "../components/AppScreen.vue";
import PlayZone from "../components/PlayZone.vue";
import BottomPanel from "../components/BottomPanel.vue";
import BulletStack from "../components/BulletStack.vue";
import GameEventMessage from "../components/GameEventMessage.vue";
import GamePlayersTable from "../components/GamePlayersTable.vue";
import GameCardVisual from "../components/GameCardVisual.vue";
import RoleCardButton from "../components/RoleCardButton.vue";
import { useRoomStore } from "../stores/roomStore.js";
import { formatCardsCount } from "../utils/wordForms.js";

const roomStore = useRoomStore();
const viewMode = ref("cards");
const eventFeedElement = ref(null);
const isApplyingCardOnPlayers = ref(false);
const isEndTurnDialogOpen = ref(false);
const isLeaveGameDialogOpen = ref(false);
const isTurnNoticeOpen = ref(false);
const endTurnDialogMode = ref("confirm");
const finishDelayLeft = ref(0);
const turnPlayerName = computed(
  () =>
    roomStore.players.find(
      (player) => player.playerId === roomStore.room.game?.turnPlayerId,
    )?.name || "",
);
const gameEvents = computed(() => roomStore.room.game?.events || []);
const cardsToDiscardCount = computed(() =>
  Math.max(0, roomStore.ownHand.length - (roomStore.ownPlayer?.health || 0)),
);
const discardCardsMessage = computed(
  () => `Сбрось ${formatCardsCount(cardsToDiscardCount.value)}`,
);
const currentTurnPlayerId = computed(
  () => roomStore.room.game?.turnPlayerId || "",
);
const canFinishGameRoom = computed(
  () => Boolean(roomStore.room.game?.winnerText) && finishDelayLeft.value === 0,
);

let finishDelayTimer = null;

watch(
  () => roomStore.room.game?.winnerText,
  (winnerText) => {
    window.clearInterval(finishDelayTimer);

    if (!winnerText) {
      finishDelayLeft.value = 0;
      return;
    }

    finishDelayLeft.value = 10;
    finishDelayTimer = window.setInterval(() => {
      finishDelayLeft.value = Math.max(0, finishDelayLeft.value - 1);

      if (finishDelayLeft.value === 0) {
        window.clearInterval(finishDelayTimer);
        finishDelayTimer = null;
      }
    }, 1000);
  },
);

watch(
  () => gameEvents.value.map((event) => event.id).join(","),
  () => scrollEventsToBottom(),
);

watch(viewMode, (mode) => {
  if (mode === "players") {
    scrollEventsToBottom();
  }
});

watch(
  () => roomStore.selectedCard?.instanceId || "",
  () => {
    const selectedCard = roomStore.selectedCard;

    if (selectedCard?.selectionView === "players") {
      isApplyingCardOnPlayers.value = true;
      viewMode.value = "players";
      return;
    }

    if (!selectedCard && isApplyingCardOnPlayers.value) {
      isApplyingCardOnPlayers.value = false;
      viewMode.value = "cards";
    }
  },
);

watch(
  currentTurnPlayerId,
  (turnPlayerId) => {
    if (
      roomStore.room.status !== "game" ||
      roomStore.room.game?.winner ||
      turnPlayerId !== roomStore.playerId
    ) {
      return;
    }

    viewMode.value = "cards";
    roomStore.cancelSelectedCard();
    isTurnNoticeOpen.value = true;
  },
  { immediate: true },
);

function toggleViewMode() {
  viewMode.value = viewMode.value === "cards" ? "players" : "cards";
}

async function scrollEventsToBottom() {
  await nextTick();

  if (eventFeedElement.value) {
    eventFeedElement.value.scrollTop = eventFeedElement.value.scrollHeight;
  }
}

function openLeaveGameDialog() {
  isLeaveGameDialogOpen.value = true;
}

function closeLeaveGameDialog() {
  isLeaveGameDialogOpen.value = false;
}

function closeTurnNotice() {
  isTurnNoticeOpen.value = false;
}

function confirmLeaveGame() {
  roomStore.leaveRoom();
  closeLeaveGameDialog();
}

function openEndTurnDialog() {
  if (!roomStore.isMyTurn || roomStore.room.status !== "game") return;

  endTurnDialogMode.value = "confirm";
  isEndTurnDialogOpen.value = true;
}

function closeEndTurnDialog() {
  isEndTurnDialogOpen.value = false;
  endTurnDialogMode.value = "confirm";
}

function confirmEndTurn() {
  if (roomStore.mustDiscardCards) {
    endTurnDialogMode.value = "discard";
    return;
  }

  roomStore.endTurn();
  closeEndTurnDialog();
}

function confirmDiscardCards() {
  roomStore.startDiscardingCards();
  closeEndTurnDialog();
}

function submitEndTurnDialog() {
  if (endTurnDialogMode.value === "discard") {
    confirmDiscardCards();
    return;
  }

  confirmEndTurn();
}

function formatMessageTime(timestamp) {
  if (!timestamp) return "";

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}
</script>

<template>
  <AppScreen class="game-screen">
    <AppHeader>
      <template #left>
        <button
          class="leave-game-button"
          type="button"
          @click.stop="openLeaveGameDialog"
        >
          Выход
        </button>
      </template>
      <template #right>
        <button
          class="header-switch"
          type="button"
          @click.stop="toggleViewMode"
        >
          {{ viewMode === "cards" ? "К игрокам" : "К картам" }}
        </button>
      </template>
    </AppHeader>

    <section v-if="viewMode === 'players'" class="players-view">
      <PlayZone title="События" variant="events">
        <div
          ref="eventFeedElement"
          class="event-feed"
          aria-label="События игры"
        >
          <p
            v-for="event in gameEvents"
            :key="event.id"
            class="event-feed__message"
            :class="{ 'event-feed__message_turn': event.type === 'turn' }"
          >
            <span class="event-feed__text">
              <GameEventMessage :event="event" />
            </span>
            <time v-if="event.createdAt" class="event-feed__time">
              {{ formatMessageTime(event.createdAt) }}
            </time>
          </p>
        </div>
      </PlayZone>
      <GamePlayersTable />
      <button
        v-if="roomStore.selectedCard?.selectionView === 'players'"
        class="selected-action-card"
        type="button"
        :aria-label="`Отменить ${roomStore.selectedCard.title}`"
        @click.stop="roomStore.cancelSelectedCard"
      >
        <GameCardVisual :card="roomStore.selectedCard" />
        <span class="selected-action-card__cancel"></span>
      </button>
    </section>

    <section v-else class="cards-view">
      <PlayZone title="Стол" variant="table">
        <div class="table-main">
          <BulletStack />
          <RoleCardButton />
        </div>
        <div v-if="roomStore.room.status === 'game'" class="turn-row">
          <button
            class="end-turn-button"
            :class="{ 'end-turn-button_active': roomStore.isMyTurn }"
            type="button"
            :disabled="!roomStore.isMyTurn"
            @click.stop="openEndTurnDialog"
          >
            {{
              roomStore.isMyTurn
                ? "Завершить ход"
                : `Ход игрока: ${turnPlayerName}`
            }}
          </button>
        </div>
      </PlayZone>

      <BottomPanel />
    </section>

    <div
      v-if="isEndTurnDialogOpen"
      class="turn-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Завершить ход"
      @click.stop
    >
      <form class="turn-dialog__form" @submit.prevent="submitEndTurnDialog">
        <p>
          {{
            endTurnDialogMode === "discard"
              ? discardCardsMessage
              : "Точно завершить ход?"
          }}
        </p>
        <div class="turn-dialog__actions">
          <button
            v-if="endTurnDialogMode === 'confirm'"
            class="turn-dialog__cancel"
            type="button"
            @click="closeEndTurnDialog"
          >
            Нет
          </button>
          <button
            class="turn-dialog__submit"
            :class="{
              'turn-dialog__submit_wide': endTurnDialogMode === 'discard',
            }"
            type="submit"
          >
            {{ endTurnDialogMode === "discard" ? "За дело" : "Да" }}
          </button>
        </div>
      </form>
    </div>

    <div
      v-if="isTurnNoticeOpen"
      class="turn-notice-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Твоя очередь ходить"
      @click.stop
    >
      <form class="turn-notice-dialog__form" @submit.prevent="closeTurnNotice">
        <p>Твоя очередь ходить, {{ roomStore.ownPlayer?.name }}</p>
        <button class="turn-notice-dialog__submit" type="submit">
          За дело
        </button>
      </form>
    </div>

    <div
      v-if="isLeaveGameDialogOpen"
      class="leave-game-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Покинуть игру"
      @click.stop
    >
      <form class="leave-game-dialog__form" @submit.prevent="confirmLeaveGame">
        <p>
          Вы действительно хотите покинуть игру? Ваш персонаж мгновенно умрёт.
        </p>
        <div class="leave-game-dialog__actions">
          <button
            class="leave-game-dialog__cancel"
            type="button"
            @click="closeLeaveGameDialog"
          >
            Нет
          </button>
          <button class="leave-game-dialog__submit" type="submit">Да</button>
        </div>
      </form>
    </div>

    <div
      v-if="roomStore.room.game?.winnerText"
      class="result-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Итоги игры"
      @click.stop
    >
      <div class="result-dialog__panel">
        <p>{{ roomStore.room.game.winnerText }}</p>
        <button
          type="button"
          :disabled="!canFinishGameRoom"
          @click="roomStore.finishGameRoom"
        >
          {{
            canFinishGameRoom
              ? "Завершить игру"
              : `Завершить игру через ${finishDelayLeft}`
          }}
        </button>
      </div>
    </div>
  </AppScreen>
</template>

<style scoped>
.header-switch {
  height: 100%;
  border: 0;
  border-radius: 6px;
  padding: 0 10px;
  background: rgba(94, 84, 70, 0.16);
  color: var(--muted);
  font-size: 20px;
  font-weight: 600;
}

.leave-game-button {
  height: 100%;
  border: 0;
  border-radius: 6px;
  padding: 0 10px;
  background: rgba(94, 84, 70, 0.16);
  color: var(--muted);
  font-size: 20px;
  font-weight: 600;
}

.cards-view {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
}

.players-view {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 5px;
  min-width: 0;
  min-height: 0;
  padding: 0 0 5px;
}

.selected-action-card {
  position: fixed;
  right: 15px;
  top: 65px;
  z-index: 15;
  width: var(--card-width);
  border-radius: 6px;
  background: transparent;
  box-shadow: 0 12px 26px rgba(29, 29, 29, 0.28);
  animation: selected-action-float 1800ms ease-in-out infinite;
}

.selected-action-card :deep(.game-card-visual__image) {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 6px;
}

.selected-action-card__cancel {
  position: absolute;
  right: -5px;
  top: -5px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--ink);
  box-shadow: 0 12px 26px rgba(29, 29, 29, 0.28);
}

.selected-action-card__cancel::before,
.selected-action-card__cancel::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 10px;
  height: 2px;
  border-radius: 999px;
  background: var(--back-soft);
  transform: translate(-50%, -50%) rotate(45deg);
}

.selected-action-card__cancel::after {
  transform: translate(-50%, -50%) rotate(-45deg);
}

@keyframes selected-action-float {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }

  50% {
    transform: translateY(-5px) scale(1.04);
  }
}

.event-feed {
  display: grid;
  align-content: start;
  height: 100%;
  min-width: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(94, 84, 70, 0.5) rgba(94, 84, 70, 0.12);
}

.event-feed__message {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: baseline;
  margin: 0;
  min-width: 0;
  color: var(--muted);
  font-size: 16px;
  line-height: 1;
  padding-top: 5px;
}

.event-feed__message_turn {
  grid-template-columns: minmax(0, 1fr) minmax(auto, 70%) minmax(0, 1fr);
  margin-top: 5px;
  text-align: center;
}

.event-feed__message_turn .event-feed__text {
  grid-column: 2;
}

.event-feed__message_turn .event-feed__time {
  grid-column: 3;
  justify-self: end;
}

.event-feed__text {
  min-width: 0;
}

.event-feed__time {
  color: var(--muted);
  white-space: nowrap;
  font-size: 12px;
}

.table-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.turn-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
}

.end-turn-button {
  min-height: 42px;
  border-radius: 6px;
  padding: 0 10px;
  background: rgba(94, 84, 70, 0.16);
  color: var(--ink);
  font-size: 30px;
  font-weight: 600;
  opacity: 0.72;
}

.end-turn-button:disabled {
  cursor: default;
  font-size: 20px;
  font-weight: 400;
}

.end-turn-button_active {
  background: var(--red);
  color: var(--back);
  opacity: 1;
  box-shadow:
    0 0 0 2px rgba(153, 57, 40, 0.16),
    0 0 18px rgba(153, 57, 40, 0.34);
  animation: end-turn-pulse 1150ms ease-in-out infinite;
}

.turn-dialog,
.turn-notice-dialog,
.leave-game-dialog,
.result-dialog {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 5px;
  background: rgba(29, 29, 29, 0.18);
}

.result-dialog {
  z-index: 40;
}

.turn-dialog__form,
.turn-notice-dialog__form,
.leave-game-dialog__form,
.result-dialog__panel {
  display: grid;
  gap: 10px;
  width: min(100%, 320px);
  border: 1px dashed var(--line);
  border-radius: 6px;
  padding: 12px;
  background: var(--back-soft);
}

.turn-dialog__form p,
.turn-notice-dialog__form p,
.leave-game-dialog__form p,
.result-dialog__panel p {
  margin: 0;
  color: var(--ink);
  font-size: 24px;
  line-height: 1;
  text-align: center;
}

.turn-dialog__actions,
.leave-game-dialog__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.turn-dialog__actions button,
.turn-notice-dialog__submit,
.leave-game-dialog__actions button,
.result-dialog__panel button {
  min-height: 44px;
  border-radius: 6px;
  font-size: 20px;
  font-weight: 600;
}

.result-dialog__panel button:disabled {
  cursor: default;
  opacity: 0.52;
}

.turn-dialog__cancel,
.leave-game-dialog__cancel {
  background: rgba(94, 84, 70, 0.16);
  color: var(--muted);
}

.turn-dialog__submit,
.turn-notice-dialog__submit,
.leave-game-dialog__submit,
.result-dialog__panel button {
  background: var(--gold);
  color: var(--ink);
}

.turn-dialog__submit_wide {
  grid-column: 1 / -1;
}

@keyframes end-turn-pulse {
  0%,
  100% {
    filter: brightness(0.94);
    box-shadow:
      0 0 0 2px rgba(153, 57, 40, 0.14),
      0 0 14px rgba(153, 57, 40, 0.28);
  }

  50% {
    filter: brightness(1.12);
    box-shadow:
      0 0 0 3px rgba(240, 160, 32, 0.3),
      0 0 24px rgba(153, 57, 40, 0.54);
  }
}
</style>
