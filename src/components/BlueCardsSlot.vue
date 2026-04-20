<script setup>
import { computed, ref, watch } from "vue";
import { useRoomStore } from "../stores/roomStore.js";
import CardPreview from "./CardPreview.vue";
import HandCard from "./HandCard.vue";
import PlayZone from "./PlayZone.vue";

const roomStore = useRoomStore();
const previewCard = ref(null);
const pendingReaction = computed(
  () => roomStore.room.game?.pendingReaction || null,
);
const turnCheck = computed(() => roomStore.room.game?.turnCheck || null);
const isReactionTarget = computed(
  () =>
    pendingReaction.value?.targetPlayerId === roomStore.playerId ||
    pendingReaction.value?.targetPlayerIds?.includes(roomStore.playerId),
);
const canCheckBarrel = computed(
  () =>
    isReactionTarget.value &&
    ["bang", "gatling"].includes(pendingReaction.value?.sourceAction) &&
    !pendingReaction.value?.barrelChecks?.[roomStore.playerId],
);
const canCheckTurnCard = computed(
  () =>
    turnCheck.value?.playerId === roomStore.playerId &&
    roomStore.room.game?.turnPlayerId === roomStore.playerId,
);

watch(isReactionTarget, (isTarget) => {
  if (isTarget) {
    closePreview();
  }
});

function freezeLeavingCard(element) {
  const cardRect = element.getBoundingClientRect();

  element.style.width = `${cardRect.width}px`;
  element.style.maxWidth = `${cardRect.width}px`;
  element.style.height = `${cardRect.height}px`;
  element.style.flexGrow = "0";
  element.style.flexShrink = "0";
  element.style.flexBasis = `${cardRect.width}px`;
  element.style.zIndex = "20";
  element.style.pointerEvents = "none";
}

function handleCardTap(card) {
  if (
    canCheckTurnCard.value &&
    card.instanceId === turnCheck.value?.cardInstanceId
  ) {
    roomStore.checkTurnBlueCard(card.instanceId);
    return;
  }

  if (card.cardId === "barrel" && canCheckBarrel.value) {
    roomStore.checkBarrel();
    return;
  }

  if (roomStore.isMyTurn || pendingReaction.value) return;

  previewCard.value = card;
}

function closePreview() {
  previewCard.value = null;
}
</script>

<template>
  <PlayZone title="Постоянные карты" variant="hand">
    <TransitionGroup
      class="permanent-card-strip"
      name="hand-card"
      tag="div"
      :duration="{ enter: 360, leave: 680 }"
      aria-label="Постоянные карты"
      @before-leave="freezeLeavingCard"
      @click.stop
    >
      <HandCard
        v-for="card in roomStore.ownPlayer?.blueCards || []"
        :key="card.instanceId"
        :card="card"
        :is-attention="card.instanceId === turnCheck?.cardInstanceId"
        @select="handleCardTap(card)"
      />
      <span
        v-if="(roomStore.ownPlayer?.blueCards || []).length === 0"
        key="empty-permanent-card-spacer"
        class="permanent-card-strip__empty-card"
        aria-hidden="true"
      ></span>
    </TransitionGroup>
    <CardPreview v-if="previewCard" :card="previewCard" @close="closePreview" />
  </PlayZone>
</template>

<style scoped>
.permanent-card-strip {
  position: relative;
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  padding: 5px;
  scrollbar-width: thin;
  scrollbar-color: rgba(94, 84, 70, 0.5) rgba(94, 84, 70, 0.12);
  -webkit-overflow-scrolling: touch;
}

.permanent-card-strip::-webkit-scrollbar {
  height: 7px;
}

.permanent-card-strip::-webkit-scrollbar-track {
  border-radius: 999px;
  background: rgba(94, 84, 70, 0.12);
}

.permanent-card-strip::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(94, 84, 70, 0.48);
}

.permanent-card-strip__empty-card {
  flex: 0 0 var(--card-width);
  width: var(--card-width);
  aspect-ratio: 0.625;
  pointer-events: none;
  visibility: hidden;
}

.hand-card-move,
.hand-card-enter-active {
  transition:
    opacity 360ms ease,
    transform 360ms ease;
}

.hand-card-enter-from {
  opacity: 0;
  transform: translateY(-180px) rotate(10deg) scale(0.86);
}

.hand-card-enter-to,
.hand-card-leave-from {
  opacity: 1;
  transform: translateY(0) rotate(0deg) scale(1);
}

.hand-card-leave-active {
  overflow: hidden;
  transition:
    flex-basis 260ms ease 420ms,
    width 260ms ease 420ms,
    max-width 260ms ease 420ms;
  animation: hand-card-fly-away 420ms ease forwards;
}

.hand-card-leave-to {
  width: 0 !important;
  max-width: 0 !important;
  flex-basis: 0 !important;
}

@keyframes hand-card-fly-away {
  0% {
    opacity: 1;
    transform: translateY(0) rotate(0deg) scale(1);
  }

  100% {
    opacity: 0;
    transform: translateY(-220px) rotate(-16deg) scale(0.76);
  }
}
</style>
