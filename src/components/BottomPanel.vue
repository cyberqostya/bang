<script setup>
import { computed, ref } from "vue";
import { useCardLeaveAnimation } from "../composables/useCardLeaveAnimation.js";
import CardPreview from "./CardPreview.vue";
import HandCard from "./HandCard.vue";
import PlayZone from "./PlayZone.vue";
import { useRoomStore } from "../stores/roomStore.js";

const roomStore = useRoomStore();
const handCards = computed(() => roomStore.ownHand);
const previewCard = ref(null);
const { freezeLeavingCard } = useCardLeaveAnimation();

function handleCardTap(card) {
  if (roomStore.isDiscardingCards || card.isPlayable) {
    roomStore.selectCard(card.instanceId);
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
  <PlayZone title="Рука" variant="hand">
    <TransitionGroup
      class="hand-strip"
      name="game-card"
      tag="div"
      :duration="{ enter: 360, leave: 680 }"
      @before-leave="freezeLeavingCard"
      @click.stop
    >
      <HandCard
        v-for="card in handCards"
        :key="card.instanceId"
        :card="card"
        :is-selected="roomStore.selectedCardId === card.instanceId"
        :is-disabled="
          card.isBlockedByTurnRule &&
          card.cardId !== 'bang' &&
          !roomStore.isDiscardingCards
        "
        :can-select="card.isPlayable || roomStore.isDiscardingCards"
        :is-discarding="roomStore.isDiscardingCards"
        @preview="openPreview"
        @select="handleCardTap(card)"
      />
      <span
        v-if="handCards.length === 0"
        key="empty-hand-spacer"
        class="hand-strip__empty-card"
        aria-hidden="true"
      ></span>
    </TransitionGroup>

    <CardPreview v-if="previewCard" :card="previewCard" @close="closePreview" />
  </PlayZone>
</template>

<style scoped>
.hand-strip {
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
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
  scrollbar-color: rgba(94, 84, 70, 0.5) rgba(94, 84, 70, 0.12);
  -webkit-overflow-scrolling: touch;
  margin-top: calc(-1 * var(--card-animation-headroom));
  padding: calc(var(--card-animation-headroom) + 15px) 5px 5px;
  pointer-events: none;
}

.hand-strip > * {
  pointer-events: auto;
}

.hand-strip::-webkit-scrollbar {
  height: 7px;
}

.hand-strip::-webkit-scrollbar-track {
  border-radius: 999px;
  background: rgba(94, 84, 70, 0.12);
}

.hand-strip::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(94, 84, 70, 0.48);
}

.hand-strip__empty-card {
  flex: 0 0 var(--card-width);
  width: var(--card-width);
  aspect-ratio: 0.625;
  pointer-events: none;
  visibility: hidden;
}
</style>
