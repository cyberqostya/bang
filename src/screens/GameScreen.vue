<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import AppHeader from "../components/AppHeader.vue";
import AppButton from "../components/AppButton.vue";
import AppScreen from "../components/AppScreen.vue";
import PlayZone from "../components/PlayZone.vue";
import BottomPanel from "../components/BottomPanel.vue";
import BlueCardsSlot from "../components/BlueCardsSlot.vue";
import BulletStack from "../components/BulletStack.vue";
import CardPreview from "../components/CardPreview.vue";
import CharacterSlot from "../components/CharacterSlot.vue";
import GameEventMessage from "../components/GameEventMessage.vue";
import GamePlayersTable from "../components/GamePlayersTable.vue";
import GameCardButton from "../components/GameCardButton.vue";
import ReactionNotice from "../components/ReactionNotice.vue";
import RoleCardButton from "../components/RoleCardButton.vue";
import WeaponSlot from "../components/WeaponSlot.vue";
import { useGameResult } from "../composables/useGameResult.js";
import { useReactionNotice } from "../composables/useReactionNotice.js";
import { useRoomStore } from "../stores/roomStore.js";
import { navigateTo } from "../utils/navigation.js";

const roomStore = useRoomStore();
const viewMode = ref("cards");
const eventFeedElement = ref(null);
const selectedActionPreviewCard = ref(null);
const isApplyingCardOnPlayers = ref(false);
const isLeaveGameDialogOpen = ref(false);
const isTurnNoticeOpen = ref(false);
const turnCheckNotice = ref(null);
const turnCheckNoticeStartedAt = ref(0);
const isDeathNoticeAccepted = ref(false);
const activePhaseIndex = ref(0);
const wasDiscardingCards = ref(false);
const wasReactionParticipant = ref(false);
const lastShownTurnCheckEventId = ref("");
const reactionNow = ref(Date.now());
const finishDelayLeft = ref(0);
let reactionCountdownTimer = null;
let turnCheckNoticeTimer = null;
let turnCheckProgressTimer = null;
const gameEvents = computed(() => roomStore.room.game?.events || []);
const { resultDialogSegments } = useGameResult(roomStore);
const {
  barrelCheckFailure,
  isReactionActor,
  isReactionTarget,
  pendingReaction,
  reactionActorPrompt,
  reactionCountdown,
  reactionNoticeCardTitle,
  reactionNoticeColor,
  reactionProgressStyle,
  shouldShowReactionOverlay,
} = useReactionNotice(roomStore, reactionNow);
const shouldShowTurnCheckNotice = computed(
  () => Boolean(turnCheckNotice.value) && !shouldShowReactionOverlay.value,
);
const turnCheckProgressStyle = computed(() => {
  if (!turnCheckNoticeStartedAt.value) {
    return { transform: "scaleX(0)" };
  }

  const ratio = Math.max(
    0,
    Math.min(
      1,
      1 - (reactionNow.value - turnCheckNoticeStartedAt.value) / 5000,
    ),
  );

  return { transform: `scaleX(${ratio})` };
});
const turnNoticePlayerLabel = computed(() => {
  const ownPlayer = roomStore.ownPlayer;

  if (!ownPlayer) return "";

  return ownPlayer.role?.id === "sheriff"
    ? `Шериф ${ownPlayer.name}`
    : ownPlayer.name;
});
const currentTurnPlayerId = computed(
  () => roomStore.room.game?.turnPlayerId || "",
);
const canFinishGameRoom = computed(
  () => Boolean(roomStore.room.game?.winnerText) && finishDelayLeft.value === 0,
);
const canUseDrawPhase = computed(
  () =>
    roomStore.isMyTurn &&
    !isOwnTurnCheck.value &&
    !roomStore.room.game?.turnDrawTaken &&
    !roomStore.room.game?.turnActionTaken,
);
const isPlayPhaseDisabled = computed(
  () =>
    !roomStore.isMyTurn ||
    isOwnTurnCheck.value ||
    roomStore.isDiscardingCards ||
    activePhaseIndex.value > 0 ||
    Boolean(roomStore.room.game?.turnActionTaken),
);
const isOwnTurnCheck = computed(
  () => roomStore.room.game?.turnCheck?.playerId === roomStore.playerId,
);
const isHeaderSwitchDisabled = computed(
  () => viewMode.value === "cards" && roomStore.isDiscardingCards,
);
const shouldShowDeathNotice = computed(
  () =>
    roomStore.room.status === "game" &&
    Boolean(roomStore.ownPlayer) &&
    !roomStore.ownPlayer.isAlive &&
    !isDeathNoticeAccepted.value &&
    !roomStore.room.game?.winnerText,
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
  () => {
    scrollEventsToBottom();
    showOwnTurnCheckNotice();
  },
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
    }
  },
);

watch(
  () => roomStore.room.status,
  (status) => {
    if (status !== "game") return;

    viewMode.value = "players";
    activePhaseIndex.value = 0;
  },
  { immediate: true },
);

watch(
  currentTurnPlayerId,
  (turnPlayerId, previousTurnPlayerId) => {
    if (roomStore.room.status !== "game" || roomStore.room.game?.winner) {
      return;
    }

    if (
      previousTurnPlayerId === roomStore.playerId &&
      turnPlayerId !== roomStore.playerId
    ) {
      viewMode.value = "players";
      roomStore.cancelSelectedCard();
      activePhaseIndex.value = 0;
      return;
    }

    if (turnPlayerId !== roomStore.playerId) return;

    viewMode.value = "cards";
    roomStore.cancelSelectedCard();
    activePhaseIndex.value = 0;
    isTurnNoticeOpen.value = true;
  },
  { immediate: true },
);

watch(
  () => roomStore.isDiscardingCards,
  (isDiscardingCards) => {
    if (wasDiscardingCards.value && !isDiscardingCards) {
      viewMode.value = "players";
    }

    wasDiscardingCards.value = isDiscardingCards;
  },
);

watch(
  () =>
    [
      pendingReaction.value?.id || "",
      ...(pendingReaction.value?.targetPlayerIds || []),
    ].join(":"),
  (reactionKey, previousReactionKey) => {
    window.clearInterval(reactionCountdownTimer);
    reactionCountdownTimer = null;

    if (!reactionKey) {
      if (previousReactionKey && wasReactionParticipant.value) {
        viewMode.value = "players";
      }
      wasReactionParticipant.value = false;
      return;
    }

    reactionNow.value = Date.now();
    const wasParticipant = wasReactionParticipant.value;

    wasReactionParticipant.value =
      isReactionTarget.value || isReactionActor.value;

    if (isReactionTarget.value) {
      viewMode.value = "cards";
      roomStore.cancelSelectedCard();
    } else if (wasParticipant && !isReactionActor.value) {
      viewMode.value = "players";
    }

    reactionCountdownTimer = window.setInterval(() => {
      reactionNow.value = Date.now();
    }, 200);
  },
);

watch(isReactionTarget, (isTarget) => {
  if (isTarget) {
    selectedActionPreviewCard.value = null;
  }
});

watch(
  () => roomStore.ownPlayer?.isAlive,
  (isAlive) => {
    if (isAlive !== false) {
      isDeathNoticeAccepted.value = false;
      return;
    }

    clearTurnCheckNotice();
  },
);

onBeforeUnmount(() => {
  window.clearInterval(reactionCountdownTimer);
  window.clearInterval(turnCheckProgressTimer);
  window.clearTimeout(turnCheckNoticeTimer);
});

function toggleViewMode() {
  if (isHeaderSwitchDisabled.value) return;

  if (viewMode.value === "players" && roomStore.selectedCard) {
    roomStore.cancelSelectedCard();
  }

  viewMode.value = viewMode.value === "cards" ? "players" : "cards";
}

function showCardsView() {
  if (isHeaderSwitchDisabled.value) return;

  if (viewMode.value === "players" && roomStore.selectedCard) {
    roomStore.cancelSelectedCard();
  }

  viewMode.value = "cards";
}

function showOwnTurnCheckNotice() {
  const latestTurnCheckEvent = [...gameEvents.value]
    .reverse()
    .find((event) => event.type === "turnCheck");

  if (
    !latestTurnCheckEvent ||
    latestTurnCheckEvent.id === lastShownTurnCheckEventId.value ||
    latestTurnCheckEvent.actorPlayerId !== roomStore.playerId
  ) {
    return;
  }

  if (
    pendingReaction.value?.sourceAction === "dynamite" &&
    isReactionTarget.value
  ) {
    lastShownTurnCheckEventId.value = latestTurnCheckEvent.id;
    clearTurnCheckNotice();
    return;
  }

  if (roomStore.ownPlayer?.isAlive === false) {
    lastShownTurnCheckEventId.value = latestTurnCheckEvent.id;
    clearTurnCheckNotice();
    return;
  }

  turnCheckNotice.value = latestTurnCheckEvent;
  turnCheckNoticeStartedAt.value = Date.now();
  reactionNow.value = Date.now();
  lastShownTurnCheckEventId.value = latestTurnCheckEvent.id;
  window.clearTimeout(turnCheckNoticeTimer);
  window.clearInterval(turnCheckProgressTimer);
  turnCheckProgressTimer = window.setInterval(() => {
    reactionNow.value = Date.now();
  }, 200);
  turnCheckNoticeTimer = window.setTimeout(clearTurnCheckNotice, 5000);
}

function clearTurnCheckNotice() {
  window.clearInterval(turnCheckProgressTimer);
  window.clearTimeout(turnCheckNoticeTimer);
  turnCheckProgressTimer = null;
  turnCheckNoticeTimer = null;
  turnCheckNotice.value = null;
  turnCheckNoticeStartedAt.value = 0;
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

function acceptDeathNotice() {
  isDeathNoticeAccepted.value = true;
}

function confirmLeaveGame() {
  roomStore.leaveRoom();
  closeLeaveGameDialog();
}

function formatMessageTime(timestamp) {
  if (!timestamp) return "";

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function handleDiscardPhase() {
  if (!roomStore.isMyTurn || isOwnTurnCheck.value) return;

  activePhaseIndex.value = 2;

  if (roomStore.mustDiscardCards) {
    roomStore.startDiscardingCards();
    return;
  }

  roomStore.endTurn();
  viewMode.value = "players";
}

function handlePlayPhase() {
  if (
    !roomStore.isMyTurn ||
    roomStore.isDiscardingCards ||
    isOwnTurnCheck.value
  )
    return;

  activePhaseIndex.value = Math.max(activePhaseIndex.value, 1);
}

function handleDrawPhase() {
  if (!canUseDrawPhase.value) return;

  activePhaseIndex.value = Math.max(activePhaseIndex.value, 0);
  roomStore.drawPhase();
}

function handleSelectedActionClick() {
  roomStore.cancelSelectedCard();
}

function openSelectedActionPreview(card) {
  selectedActionPreviewCard.value = card;
}

function closeSelectedActionPreview() {
  selectedActionPreviewCard.value = null;
}

function openCardKnowledge(cardId) {
  if (!cardId) return;

  navigateTo(`/cards?card=${encodeURIComponent(cardId)}`);
}
</script>

<template>
  <AppScreen class="game-screen">
    <AppHeader>
      <template #left>
        <AppButton
          variant="muted"
          size="header"
          type="button"
          @click.stop="openLeaveGameDialog"
        >
          Выход
        </AppButton>
      </template>
      <template #right>
        <AppButton
          variant="muted"
          size="header"
          type="button"
          :disabled="isHeaderSwitchDisabled"
          @click.stop="toggleViewMode"
        >
          {{ viewMode === "cards" ? "К игрокам" : "К картам" }}
        </AppButton>
      </template>
    </AppHeader>

    <section v-if="viewMode === 'players'" class="players-view">
      <PlayZone title="Журнал событий" variant="events">
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
              <GameEventMessage :event="event" @open-card="openCardKnowledge" />
            </span>
            <time v-if="event.createdAt" class="event-feed__time">
              {{ formatMessageTime(event.createdAt) }}
            </time>
          </p>
        </div>
      </PlayZone>
      <GamePlayersTable @show-cards="showCardsView" />
      <GameCardButton
        v-if="roomStore.selectedCard?.selectionView === 'players'"
        class="selected-action-card"
        :card="roomStore.selectedCard"
        :aria-label="`Отменить ${roomStore.selectedCard.title}`"
        is-floating
        mark="cancel"
        @activate="handleSelectedActionClick"
        @preview="openSelectedActionPreview"
      />
    </section>

    <section
      v-else
      class="cards-view"
      :class="{ 'cards-view_with-phases': roomStore.room.status === 'game' }"
    >
      <PlayZone
        v-if="roomStore.room.status === 'game'"
        title="Фазы хода"
        variant="phases"
        :class="{ 'turn-phases-zone_active': roomStore.isMyTurn }"
      >
        <div class="turn-phases">
          <AppButton
            variant="phase"
            size="phase"
            type="button"
            :disabled="!canUseDrawPhase || activePhaseIndex > 0"
            @click.stop="handleDrawPhase"
          >
            Набор
          </AppButton>
          <AppButton
            variant="phase"
            size="phase"
            type="button"
            :disabled="isPlayPhaseDisabled"
            @click.stop="handlePlayPhase"
          >
            Розыгрыш
          </AppButton>
          <AppButton
            variant="phase"
            size="phase"
            type="button"
            :disabled="
              !roomStore.isMyTurn ||
              roomStore.isDiscardingCards ||
              isOwnTurnCheck
            "
            @click.stop="handleDiscardPhase"
          >
            Сброс
          </AppButton>
        </div>
      </PlayZone>

      <div
        v-if="roomStore.room.status === 'game'"
        class="cards-view__future-space"
        aria-hidden="true"
      ></div>

      <PlayZone title="Планшет игрока" variant="table">
        <div class="table-main">
          <BulletStack />
          <div class="table-cards">
            <CharacterSlot />
            <WeaponSlot />
            <RoleCardButton />
          </div>
        </div>
      </PlayZone>

      <BlueCardsSlot />

      <BottomPanel />
    </section>

    <div
      v-if="isTurnNoticeOpen"
      class="turn-notice-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Твоя очередь ходить"
      @click.stop
    >
      <form class="turn-notice-dialog__form" @submit.prevent="closeTurnNotice">
        <p>Твоя очередь ходить, {{ turnNoticePlayerLabel }}</p>
        <AppButton variant="primary" size="modal" type="submit">
          За дело
        </AppButton>
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
          <AppButton
            variant="muted"
            size="modal"
            type="button"
            @click="closeLeaveGameDialog"
          >
            Нет
          </AppButton>
          <AppButton variant="primary" size="modal" type="submit">Да</AppButton>
        </div>
      </form>
    </div>

    <div
      v-if="shouldShowDeathNotice"
      class="death-notice-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Вы убиты"
      @click.stop
    >
      <form
        class="death-notice-dialog__form"
        @submit.prevent="acceptDeathNotice"
      >
        <p>Вы убиты</p>
        <AppButton variant="primary" size="modal" type="submit">
          Принять смерть
        </AppButton>
      </form>
    </div>

    <Transition name="reaction-notice">
      <ReactionNotice
        v-if="shouldShowReactionOverlay"
        :barrel-check-failure="barrelCheckFailure"
        :is-reaction-target="isReactionTarget"
        :pending-reaction="pendingReaction"
        :reaction-actor-prompt="reactionActorPrompt"
        :reaction-countdown="reactionCountdown"
        :reaction-notice-card-title="reactionNoticeCardTitle"
        :reaction-notice-color="reactionNoticeColor"
        :reaction-progress-style="reactionProgressStyle"
      />
    </Transition>

    <Transition name="reaction-notice">
      <ReactionNotice
        v-if="shouldShowTurnCheckNotice"
        mode="check"
        :check-progress-style="turnCheckProgressStyle"
        :turn-check-notice="turnCheckNotice"
      />
    </Transition>

    <div
      v-if="roomStore.room.game?.winnerText"
      class="result-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Итоги игры"
      @click.stop
    >
      <div class="result-dialog__panel">
        <p>
          <template
            v-for="(segment, index) in resultDialogSegments"
            :key="index"
          >
            <strong v-if="segment.strong">{{ segment.text }}</strong>
            <span v-else>{{ segment.text }}</span>
          </template>
        </p>
        <AppButton
          variant="primary"
          size="modal"
          type="button"
          :disabled="!canFinishGameRoom"
          @click="roomStore.finishGameRoom"
        >
          {{
            canFinishGameRoom
              ? "Завершить игру"
              : `Завершить игру через ${finishDelayLeft}`
          }}
        </AppButton>
      </div>
    </div>
    <CardPreview
      v-if="selectedActionPreviewCard"
      :card="selectedActionPreviewCard"
      @close="closeSelectedActionPreview"
    />
  </AppScreen>
</template>

<style scoped>
.cards-view {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto auto;
}

.cards-view_with-phases {
  grid-template-rows: auto minmax(24px, 1fr) auto auto auto;
}

.players-view {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
}

.selected-action-card {
  position: fixed;
  right: 15px;
  top: 65px;
  z-index: 15;
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

.cards-view__future-space {
  min-width: 0;
  min-height: 24px;
}

.table-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  padding: 15px 5px;
}

.table-cards {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
}

.turn-phases {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
  padding: 5px;
}

.turn-phases-zone_active .play-zone__content {
  overflow: hidden;
  border-bottom: none;
}

.turn-phases-zone_active::before,
.turn-phases-zone_active::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  z-index: 2;
  height: 4px;
  pointer-events: none;
  background-image: repeating-linear-gradient(
    135deg,
    var(--gold) 0,
    var(--gold) 8px,
    var(--back-soft) 8px,
    var(--back-soft) 16px
  );
  background-size: 23px 23px;
  animation: turn-phase-stripes 720ms linear infinite;
}

.turn-phases-zone_active::before {
  top: -2px;
}

.turn-phases-zone_active::after {
  bottom: -2px;
}

@keyframes turn-phase-stripes {
  from {
    background-position-x: 0;
  }

  to {
    background-position-x: 23px;
  }
}

.turn-notice-dialog,
.leave-game-dialog,
.death-notice-dialog,
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

.turn-notice-dialog__form,
.leave-game-dialog__form,
.death-notice-dialog__form,
.result-dialog__panel {
  display: grid;
  gap: 10px;
  width: min(100%, 320px);
  border: 1px dashed var(--line);
  border-radius: 6px;
  padding: 12px;
  background: var(--back-soft);
}

.turn-notice-dialog__form p,
.leave-game-dialog__form p,
.death-notice-dialog__form p,
.result-dialog__panel p {
  margin: 0;
  color: var(--ink);
  font-size: 24px;
  line-height: 1;
  text-align: center;
}

.result-dialog__panel strong {
  font-weight: 700;
}

.leave-game-dialog__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
</style>
