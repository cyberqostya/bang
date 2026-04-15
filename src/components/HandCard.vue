<script setup>
defineProps({
  card: {
    type: Object,
    required: true,
  },
  isSelected: {
    type: Boolean,
    default: false,
  },
});

defineEmits(["select"]);
</script>

<template>
  <button
    class="hand-card"
    :class="{ 'hand-card_selected': isSelected }"
    type="button"
    :aria-pressed="isSelected"
    @click.stop="$emit('select', card.id)"
  >
    <img :src="card.image" :alt="card.title" />
  </button>
</template>

<style scoped>
.hand-card {
  flex-shrink: 0;
  width: var(--card-width);
  border-radius: 6px;
  background: var(--back);
  box-shadow: 0 8px 18px rgba(94, 84, 70, 0.16);
  transform-origin: center;
  transition:
    box-shadow 160ms ease,
    transform 160ms ease;
}

.hand-card img {
  width: 100%;
  height: auto;
  border-radius: 5px;
  object-fit: contain;
}

.hand-card_selected {
  border-color: var(--gold);
  box-shadow:
    0 0 0 2px rgba(240, 160, 32, 0.45),
    0 10px 20px rgba(94, 84, 70, 0.2);
  animation: selected-card-shake 720ms ease-in-out infinite;
}

@keyframes selected-card-shake {
  0%,
  100% {
    transform: translateY(-4px) rotate(-1deg);
  }

  50% {
    transform: translateY(-4px) rotate(1deg);
  }
}
</style>
