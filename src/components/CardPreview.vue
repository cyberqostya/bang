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
  <div class="card-preview-overlay" @click.stop="$emit('close')">
    <button
      class="card-preview-surface card-preview__card"
      type="button"
      :aria-label="card.title"
      @click.stop="$emit('close')"
    >
      <GameCardVisual :card="card" />
    </button>
  </div>
</template>

<style scoped>
.card-preview__card {
  --card-width: var(--card-preview-width);
}
</style>
