<script setup>
import GameCardVisual from "./GameCardVisual.vue";

defineProps({
  card: {
    type: Object,
    required: true,
  },
});

defineEmits(["close"]);
</script>

<template>
  <div class="card-preview" @click.stop="$emit('close')">
    <button
      class="card-preview__card"
      type="button"
      :aria-label="card.title"
      @click.stop="$emit('close')"
    >
      <GameCardVisual :card="card" />
    </button>
  </div>
</template>

<style scoped>
.card-preview {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  background: rgba(29, 29, 29, 0.28);
}

.card-preview__card {
  --card-width: min(72vw, 260px);

  width: min(72vw, 260px);
  border-radius: 6px;
  background: transparent;
  animation: card-preview-in 220ms ease forwards;
}

@keyframes card-preview-in {
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
