<script setup>
import GameCardVisual from "./GameCardVisual.vue";

defineProps({
  card: {
    type: Object,
    required: true,
  },
  hasDetails: {
    type: Boolean,
    default: false,
  },
});

defineEmits(["close"]);
</script>

<template>
  <div class="card-preview-overlay" @click.stop="$emit('close')">
    <div class="card-preview-surface card-preview">
      <button
        class="card-preview__card"
        type="button"
        :aria-label="card.title"
        @click.stop="$emit('close')"
      >
        <GameCardVisual :card="card" />
      </button>
      <div v-if="hasDetails" class="card-preview__details" @click.stop>
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.card-preview {
  display: grid;
  gap: 10px;
}

.card-preview__card {
  --card-width: var(--card-preview-width);
  width: var(--card-preview-width);
}

.card-preview__details {
  display: grid;
  padding: 5px 10px;
  border-radius: 10px;
  background: rgba(243, 241, 219, 0.96);
  box-shadow: 0 10px 24px rgba(29, 29, 29, 0.16);
  color: var(--ink);
  font-size: 16px;
}
</style>
