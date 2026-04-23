<script setup>
import { ref } from "vue";
import CardPreview from "./CardPreview.vue";
import GameCardButton from "./GameCardButton.vue";

defineProps({
  ariaLabel: {
    type: String,
    default: "Выбор карты",
  },
  cards: {
    type: Array,
    default: () => [],
  },
  isCurrentPicker: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["choose"]);
const previewCard = ref(null);

function openPreview(card) {
  previewCard.value = card;
}

function closePreview() {
  previewCard.value = null;
}
</script>

<template>
  <div
    class="card-choice-dialog"
    role="dialog"
    aria-modal="true"
    :aria-label="ariaLabel"
    @click.stop
  >
    <div class="card-choice-dialog__cards">
      <GameCardButton
        v-for="card in cards"
        :key="card.instanceId"
        :card="card"
        :is-aria-disabled="!isCurrentPicker"
        @activate="isCurrentPicker && emit('choose', card.instanceId)"
        @preview="openPreview"
      />
    </div>
    <CardPreview v-if="previewCard" :card="previewCard" @close="closePreview" />
  </div>
</template>

<style scoped>
.card-choice-dialog {
  position: fixed;
  inset: 0;
  z-index: 45;
  display: grid;
  place-items: center;
  padding: 96px 18px 18px;
  background: rgba(29, 29, 29, 0.62);
}

.card-choice-dialog__cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, var(--card-width));
  gap: 8px;
  width: min(100%, 760px);
  min-width: 0;
  justify-content: center;
  align-content: center;
  border-radius: 8px;
  padding: 14px;
}
</style>
