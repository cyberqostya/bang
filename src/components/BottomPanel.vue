<script setup>
import { computed, ref } from "vue";
import HandCard from "./HandCard.vue";
import PlayZone from "./PlayZone.vue";
import { useRoomStore } from "../stores/roomStore.js";

const roomStore = useRoomStore();
const handCards = computed(() => roomStore.ownHand);
const previewCard = ref(null);

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
  if (roomStore.isDiscardingCards || card.isPlayable) {
    roomStore.selectCard(card.instanceId);
    return;
  }

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
      name="hand-card"
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
        :is-disabled="card.isBlockedByTurnRule && !roomStore.isDiscardingCards"
        :can-select="card.isPlayable || roomStore.isDiscardingCards"
        :is-discarding="roomStore.isDiscardingCards"
        @select="handleCardTap(card)"
      />
    </TransitionGroup>

    <div v-if="previewCard" class="hand-preview" @click.stop="closePreview">
      <button
        class="hand-preview__card"
        type="button"
        :aria-label="previewCard.title"
        @click.stop="closePreview"
      >
        <img :src="previewCard.image" :alt="previewCard.title" />
      </button>
    </div>
  </PlayZone>
</template>

<style scoped>
.hand-strip {
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

.hand-preview {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  background: rgba(29, 29, 29, 0.28);
}

.hand-preview__card {
  width: min(72vw, 260px);
  border-radius: 6px;
  background: transparent;
  animation: hand-preview-in 220ms ease forwards;
}

.hand-preview__card img {
  width: 100%;
  height: auto;
  border-radius: 6px;
  box-shadow: 0 18px 36px rgba(29, 29, 29, 0.28);
}

@keyframes hand-preview-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.72);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
