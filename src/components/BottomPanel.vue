<script setup>
import HandCard from "./HandCard.vue";
import PlayZone from "./PlayZone.vue";
import { cardConfig } from "../config/cardConfig.js";
import { useRoomStore } from "../stores/roomStore.js";

const roomStore = useRoomStore();
const previewCards = Array.from({ length: 10 }, (_, index) => ({
  instanceId: `bang-${index}`,
  ...cardConfig.bang,
}));
</script>

<template>
  <PlayZone title="Рука" variant="hand">
    <div class="hand-strip" @click.stop>
      <HandCard
        v-for="card in previewCards"
        :key="card.instanceId"
        :card="card"
        :is-selected="roomStore.selectedCardId === card.id"
        @select="roomStore.selectCard"
      />
    </div>
  </PlayZone>
</template>

<style scoped>
.hand-strip {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
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
</style>
