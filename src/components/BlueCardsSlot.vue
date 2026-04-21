<script setup>
import { computed, ref } from "vue";
import { useCardLeaveAnimation } from "../composables/useCardLeaveAnimation.js";
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
const { freezeLeavingCard } = useCardLeaveAnimation();

function handleCardTap(card) {
  if (roomStore.isDiscardingCards) return;

  if (
    canCheckTurnCard.value &&
    card.instanceId === turnCheck.value?.cardInstanceId
  ) {
    roomStore.checkTurnBlueCard(card.instanceId);
    return;
  }

  if (card.cardId === "barrel" && canCheckBarrel.value) {
    roomStore.checkBarrel();
  }
}

function openPreview(card) {
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
      :class="{
        'permanent-card-strip_empty':
          (roomStore.ownPlayer?.blueCards || []).length === 0,
      }"
      name="game-card"
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
        @preview="openPreview"
        @select="handleCardTap(card)"
      />
    </TransitionGroup>
    <CardPreview v-if="previewCard" :card="previewCard" @close="closePreview" />
  </PlayZone>
</template>

<style scoped>
.permanent-card-strip {
  --card-animation-headroom: 96px;

  position: relative;
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  margin-top: calc(-1 * var(--card-animation-headroom));
  padding: calc(var(--card-animation-headroom) + 15px) 5px 15px;
  scrollbar-width: thin;
  scrollbar-color: rgba(94, 84, 70, 0.5) rgba(94, 84, 70, 0.12);
  -webkit-overflow-scrolling: touch;
  pointer-events: none;
}

.permanent-card-strip > * {
  pointer-events: auto;
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

.permanent-card-strip_empty::before {
  content: "";
  flex: 0 0 var(--card-width);
  width: var(--card-width);
  aspect-ratio: 0.625;
  pointer-events: none;
  visibility: hidden;
}

</style>
