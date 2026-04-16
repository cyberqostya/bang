<script setup>
import { computed } from "vue";
import HandCard from "./HandCard.vue";
import PlayZone from "./PlayZone.vue";
import { useRoomStore } from "../stores/roomStore.js";

const roomStore = useRoomStore();
const handCards = computed(() => roomStore.ownHand);

function freezeLeavingCard(element) {
  element.style.left = `${element.offsetLeft}px`;
  element.style.top = `${element.offsetTop}px`;
  element.style.width = `${element.offsetWidth}px`;
}
</script>

<template>
  <PlayZone title="Рука" variant="hand">
    <TransitionGroup
      class="hand-strip"
      name="hand-card"
      tag="div"
      @before-leave="freezeLeavingCard"
      @click.stop
    >
      <HandCard
        v-for="card in handCards"
        :key="card.instanceId"
        :card="card"
        :is-selected="roomStore.selectedCardId === card.instanceId"
        :is-disabled="!card.isPlayable && !roomStore.isDiscardingCards"
        :is-discarding="roomStore.isDiscardingCards"
        @select="roomStore.selectCard"
      />
    </TransitionGroup>
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
  min-height: calc(var(--card-width) * var(--ratio) + 25px);
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  padding: 15px 10px 10px;
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
.hand-card-enter-active,
.hand-card-leave-active {
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
  position: absolute;
  z-index: 20;
  animation: hand-card-fly-away 420ms ease forwards;
  pointer-events: none;
}

.hand-card-leave-to {
  opacity: 0;
  transform: translateY(-220px) rotate(-16deg) scale(0.76);
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
