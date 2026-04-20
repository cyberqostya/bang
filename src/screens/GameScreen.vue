<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import AppHeader from "../components/AppHeader.vue";
import AppScreen from "../components/AppScreen.vue";
import PlayZone from "../components/PlayZone.vue";
import BottomPanel from "../components/BottomPanel.vue";
import BlueCardsSlot from "../components/BlueCardsSlot.vue";
import BulletStack from "../components/BulletStack.vue";
import CardPreview from "../components/CardPreview.vue";
import CharacterSlot from "../components/CharacterSlot.vue";
import GameEventMessage from "../components/GameEventMessage.vue";
import GamePlayersTable from "../components/GamePlayersTable.vue";
import GameCardVisual from "../components/GameCardVisual.vue";
import RoleCardButton from "../components/RoleCardButton.vue";
import WeaponSlot from "../components/WeaponSlot.vue";
import { useRoomStore } from "../stores/roomStore.js";

const roomStore = useRoomStore();
const viewMode = ref("cards");
const eventFeedElement = ref(null);
const eventPreviewCard = ref(null);
const isApplyingCardOnPlayers = ref(false);
const isLeaveGameDialogOpen = ref(false);
const isTurnNoticeOpen = ref(false);
const turnCheckNotice = ref(null);
const isDeathNoticeAccepted = ref(false);
const activePhaseIndex = ref(0);
const wasDiscardingCards = ref(false);
const wasReactionParticipant = ref(false);
const lastShownTurnCheckEventId = ref("");
const reactionNow = ref(Date.now());
const finishDelayLeft = ref(0);
let reactionCountdownTimer = null;
let turnCheckNoticeTimer = null;
const REACTION_WINDOW_MS = 5 * 1000;
const gameEvents = computed(() => roomStore.room.game?.events || []);
const pendingReaction = computed(
  () => roomStore.room.game?.pendingReaction || null,
);
const isReactionTarget = computed(
  () =>
    pendingReaction.value?.targetPlayerId === roomStore.playerId ||
    pendingReaction.value?.targetPlayerIds?.includes(roomStore.playerId),
);
const isReactionActor = computed(
  () => pendingReaction.value?.actorPlayerId === roomStore.playerId,
);
const shouldShowReactionOverlay = computed(
  () => isReactionTarget.value || isReactionActor.value,
);
const shouldShowTurnCheckNotice = computed(
  () => Boolean(turnCheckNotice.value) && !shouldShowReactionOverlay.value,
);
const reactionNoticeCardTitle = computed(
  () => pendingReaction.value?.cardTitle || "БЭНГ",
);
const reactionNoticeColor = computed(
  () => pendingReaction.value?.cardColor || "#c94a35",
);
const reactionActorPrompt = computed(
  () =>
    `Ожидание реакции ${
      (pendingReaction.value?.targetPlayerIds?.length || 0) > 1
        ? "жертв"
        : "жертвы"
    } на`,
);
const reactionCountdown = computed(() => {
  if (!pendingReaction.value?.expiresAt) return 0;

  return Math.max(
    0,
    Math.ceil((pendingReaction.value.expiresAt - reactionNow.value) / 1000),
  );
});
const reactionTimeLeftRatio = computed(() => {
  if (!pendingReaction.value?.expiresAt) return 0;

  return Math.max(
    0,
    Math.min(
      1,
      (pendingReaction.value.expiresAt - reactionNow.value) /
        REACTION_WINDOW_MS,
    ),
  );
});
const reactionProgressStyle = computed(() => ({
  backgroundColor: reactionNoticeColor.value,
  transform: `scaleX(${reactionTimeLeftRatio.value})`,
}));
const barrelCheckFailure = computed(
  () => pendingReaction.value?.barrelChecks?.[roomStore.playerId] || null,
);
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
const resultDialogText = computed(() =>
  isOwnPlayerWinner.value ? "Вы победили!" : roomStore.room.game?.winnerText,
);
const resultDialogSegments = computed(() => {
  if (isOwnPlayerWinner.value) {
    return [{ text: "Вы победили!", strong: false }];
  }

  const details = roomStore.room.game?.winnerDetails;

  if (!details) {
    return [{ text: roomStore.room.game?.winnerText || "", strong: false }];
  }

  if (details.type === "renegade") {
    return [
      { text: "Победил Ренегат ", strong: false },
      { text: details.renegade?.name || "", strong: true },
      { text: ", он уничтожил всех и остался один", strong: false },
    ];
  }

  if (details.type === "sheriffKilledOutlaws") {
    const outlaws = details.outlaws || [];

    return [
      {
        text: `Шериф убит: победили бандит(ы)${outlaws.length > 0 ? " " : ""}`,
        strong: false,
      },
      ...joinNameSegments(outlaws),
    ];
  }

  if (details.type === "law") {
    const deputies = details.deputies || [];

    return [
      { text: "Шериф ", strong: false },
      { text: details.sheriff?.name || "", strong: true },
      ...getDeputyVictorySegments(deputies),
      {
        text: ` ${deputies.length > 0 ? "победили" : "победил"}: все бандиты и ренегат(ы) мертвы`,
        strong: false,
      },
    ];
  }

  return [{ text: resultDialogText.value || "", strong: false }];
});
const isOwnPlayerWinner = computed(() => {
  const winner = roomStore.room.game?.winner;
  const roleId = roomStore.ownPlayer?.role?.id;
  const team = roomStore.ownPlayer?.role?.team;

  if (!winner || !roleId) return false;
  if (winner === "outlaws") return roleId === "outlaw";
  if (winner === "renegade") return roleId === "renegade";
  if (winner === "law") return team === "law";

  return winner === team;
});

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
      closeEventPreview();
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
      closeEventPreview();
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
    closeEventPreview();
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

function openEventPreview(card) {
  if (isReactionTarget.value) return;

  eventPreviewCard.value = card;
}

function closeEventPreview() {
  eventPreviewCard.value = null;
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
  lastShownTurnCheckEventId.value = latestTurnCheckEvent.id;
  window.clearTimeout(turnCheckNoticeTimer);
  turnCheckNoticeTimer = window.setTimeout(clearTurnCheckNotice, 5000);
}

function clearTurnCheckNotice() {
  window.clearTimeout(turnCheckNoticeTimer);
  turnCheckNoticeTimer = null;
  turnCheckNotice.value = null;
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

function joinNameSegments(players) {
  return players.flatMap((player, index) => [
    { text: index > 0 ? ", " : "", strong: false },
    { text: player.name, strong: true },
  ]);
}

function getDeputyVictorySegments(deputies) {
  if (deputies.length === 0) return [];

  return [
    { text: " и живые помощники ", strong: false },
    ...joinNameSegments(deputies),
  ];
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
          :disabled="isHeaderSwitchDisabled"
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
              <GameEventMessage
                :event="event"
                @preview-card="openEventPreview"
              />
            </span>
            <time v-if="event.createdAt" class="event-feed__time">
              {{ formatMessageTime(event.createdAt) }}
            </time>
          </p>
        </div>
      </PlayZone>
      <GamePlayersTable @show-cards="showCardsView" />
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
          <button
            class="turn-phase-button turn-phase-button_draw"
            type="button"
            :disabled="!canUseDrawPhase || activePhaseIndex > 0"
            @click.stop="handleDrawPhase"
          >
            Набор
          </button>
          <button
            class="turn-phase-button"
            type="button"
            :disabled="isPlayPhaseDisabled"
            @click.stop="handlePlayPhase"
          >
            Розыгрыш
          </button>
          <button
            class="turn-phase-button"
            type="button"
            :disabled="
              !roomStore.isMyTurn ||
              roomStore.isDiscardingCards ||
              isOwnTurnCheck
            "
            @click.stop="handleDiscardPhase"
          >
            Сброс
          </button>
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
        <button class="death-notice-dialog__submit" type="submit">
          Принять смерть
        </button>
      </form>
    </div>

    <Transition name="reaction-notice">
      <section
        v-if="shouldShowReactionOverlay"
        class="reaction-notice"
        aria-live="assertive"
      >
        <span
          class="reaction-notice__progress"
          :style="reactionProgressStyle"
        ></span>
        <div class="reaction-notice__copy">
          <p class="reaction-notice__text">
            <template v-if="isReactionTarget">
              <span>Вы стали целью </span>
              <span
                class="reaction-notice__card"
                :style="{ color: reactionNoticeColor }"
              >
                [{{ reactionNoticeCardTitle }}]
              </span>
              <span>.</span>
            </template>
            <template v-else>
              <span>{{ reactionActorPrompt }} </span>
              <span
                class="reaction-notice__card"
                :style="{ color: reactionNoticeColor }"
              >
                [{{ reactionNoticeCardTitle }}]
              </span>
            </template>
          </p>
          <template v-if="isReactionTarget">
            <p class="reaction-notice__subtext">
              До потери здоровья осталось ->
            </p>
          </template>
          <p
            v-if="isReactionTarget && barrelCheckFailure"
            class="reaction-notice__subtext reaction-notice__check-text"
          >
            <span>Проверка {{ barrelCheckFailure.checkCardTitle }}</span>
            <span> -- {{ barrelCheckFailure.resultTitle }}</span>
            <span> -- вытянул карту </span>
            <span class="reaction-notice__check-card">
              <span>"</span>
              <span
                :style="{ color: barrelCheckFailure.drawnCard?.suit?.color }"
              >
                {{ barrelCheckFailure.drawnCard?.title }}
              </span>
              <span>-</span>
              <span
                class="reaction-notice__check-rank"
                :style="{ color: barrelCheckFailure.drawnCard?.suit?.color }"
              >
                {{ barrelCheckFailure.drawnCard?.rank?.label }}
              </span>
              <img
                class="reaction-notice__check-suit"
                :src="barrelCheckFailure.drawnCard?.suit?.image"
                :alt="barrelCheckFailure.drawnCard?.suit?.label"
              />
              <span>"</span>
            </span>
            <span v-if="barrelCheckFailure.consequenceText">
              -- {{ barrelCheckFailure.consequenceText }}
            </span>
          </p>
        </div>
        <span class="reaction-notice__count">
          {{ reactionCountdown }}
        </span>
      </section>
    </Transition>

    <Transition name="reaction-notice">
      <section
        v-if="shouldShowTurnCheckNotice"
        class="reaction-notice reaction-notice_check"
        aria-live="assertive"
      >
        <div class="reaction-notice__copy">
          <p class="reaction-notice__subtext reaction-notice__check-text">
            <GameEventMessage :event="turnCheckNotice" />
          </p>
        </div>
      </section>
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
    <CardPreview
      v-if="eventPreviewCard"
      :card="eventPreviewCard"
      @close="closeEventPreview"
    />
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

.header-switch:disabled {
  cursor: default;
  opacity: 0.42;
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
  grid-template-rows: minmax(0, 1fr) auto auto;
  min-width: 0;
  min-height: 0;
  padding-bottom: 5px;
}

.cards-view_with-phases {
  grid-template-rows: auto minmax(24px, 1fr) auto auto auto;
}

.players-view {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
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
}

.turn-phases-zone_active {
  outline: 2px solid rgba(240, 160, 32, 0.75);
  outline-offset: -2px;
  box-shadow:
    inset 0 0 0 1px rgba(243, 241, 219, 0.7),
    0 0 18px rgba(240, 160, 32, 0.22);
}

.turn-phases-zone_active :deep(.play-zone__content) {
  background: rgba(240, 160, 32, 0.08);
}

.turn-phase-button {
  min-height: 42px;
  border-radius: 6px;
  padding: 0 10px;
  background: rgba(94, 84, 70, 0.16);
  color: var(--ink);
  font-size: 19px;
  font-weight: 600;
}

.turn-phase-button:not(:disabled) {
  background: var(--gold);
  color: var(--ink);
}

.turn-phase-button:disabled {
  cursor: default;
  opacity: 0.48;
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

.turn-notice-dialog__submit,
.leave-game-dialog__actions button,
.death-notice-dialog__submit,
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

.leave-game-dialog__cancel {
  background: rgba(94, 84, 70, 0.16);
  color: var(--muted);
}

.turn-notice-dialog__submit,
.leave-game-dialog__submit,
.death-notice-dialog__submit,
.result-dialog__panel button {
  background: var(--gold);
  color: var(--ink);
}

.reaction-notice {
  pointer-events: none;
  position: fixed;
  left: 8px;
  right: 8px;
  top: 8px;
  z-index: 35;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 14px;
  min-height: 76px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 18px;
  padding: 18px 18px 14px;
  background:
    linear-gradient(135deg, rgba(37, 32, 27, 0.92), rgba(16, 15, 14, 0.86)),
    rgba(29, 29, 29, 0.88);
  box-shadow:
    0 16px 32px rgba(29, 29, 29, 0.26),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
  color: #fff;
}

.reaction-notice_check {
  grid-template-columns: minmax(0, 1fr);
}

.reaction-notice_check :deep(.game-event-message),
.reaction-notice_check :deep(.game-event-message__player),
.reaction-notice_check :deep(.game-event-message__separator),
.reaction-notice_check :deep(.game-event-message__check-source),
.reaction-notice_check :deep(.game-event-message__damage) {
  color: #fff !important;
}

.reaction-notice_check :deep(.game-event-message__check-drawn) {
  border-radius: 6px;
  padding: 1px 5px;
  background: rgba(255, 255, 255, 0.94);
  text-shadow: none;
}

.reaction-notice__progress {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 5px;
  transform-origin: left center;
  transition: transform 180ms linear;
}

.reaction-notice__copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.reaction-notice__text {
  margin: 0;
  color: rgba(255, 255, 255, 0.94);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.16;
  text-wrap: balance;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.24);
}

.reaction-notice__card {
  font-weight: 800;
  white-space: nowrap;
}

.reaction-notice__subtext {
  margin: 0;
  color: rgba(255, 255, 255, 0.86);
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
  text-wrap: balance;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.24);
}

.reaction-notice__check-text {
  color: #fff;
  line-height: 1.3;
}

.reaction-notice__check-card {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  vertical-align: baseline;
  border-radius: 6px;
  padding: 1px 5px;
  background: rgba(255, 255, 255, 0.94);
  text-shadow: none;
}

.reaction-notice__check-rank {
  font-weight: 800;
}

.reaction-notice__check-suit {
  width: auto;
  height: 0.9em;
  object-fit: contain;
}

.reaction-notice__count {
  min-width: 54px;
  color: #fff;
  font-size: 48px;
  font-weight: 800;
  line-height: 1;
  text-align: right;
  text-shadow: 0 3px 12px rgba(0, 0, 0, 0.34);
}

.reaction-notice-enter-active {
  animation: reaction-notice-drop 260ms cubic-bezier(0.2, 0.85, 0.26, 1.1) both;
}

.reaction-notice-leave-active {
  animation: reaction-notice-drop 180ms ease-in reverse both;
}

@keyframes reaction-notice-drop {
  from {
    opacity: 0;
    transform: translateY(-110%);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
