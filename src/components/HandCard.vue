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
  isDisabled: {
    type: Boolean,
    default: false,
  },
  isDiscarding: {
    type: Boolean,
    default: false,
  },
});

defineEmits(["select"]);
</script>

<template>
  <button
    class="hand-card"
    :class="{
      'hand-card_selected': isSelected,
      'hand-card_disabled': isDisabled,
      'hand-card_discarding': isDiscarding,
    }"
    type="button"
    :aria-pressed="isSelected"
    :disabled="isDisabled"
    @click.stop="$emit('select', card.instanceId)"
  >
    <img :src="card.image" :alt="card.title" />
    <span class="hand-card__number">{{ card.deckNumber }}</span>
    <span v-if="isDiscarding" class="hand-card__discard-mark"></span>
  </button>
</template>

<style scoped>
.hand-card {
  position: relative;
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
  display: block;
  width: 100%;
  height: auto;
  border-radius: 5px;
  object-fit: contain;
}

.hand-card__number {
  position: absolute;
  right: 5px;
  top: 5px;
  display: grid;
  place-items: center;
  min-width: 24px;
  min-height: 24px;
  border-radius: 999px;
  background: rgba(29, 29, 29, 0.68);
  color: var(--back);
  font-size: 16px;
  line-height: 1;
}

.hand-card_selected {
  border-color: var(--gold);
  box-shadow:
    0 0 0 2px rgba(240, 160, 32, 0.45),
    0 10px 20px rgba(94, 84, 70, 0.2);
  animation: selected-card-shake 720ms ease-in-out infinite;
}

.hand-card_disabled {
  cursor: default;
  filter: grayscale(1);
  opacity: 0.42;
}

.hand-card_discarding {
  animation: discard-card-shake 520ms ease-in-out infinite;
}

.hand-card_discarding.hand-card-leave-active {
  animation: hand-card-fly-away 420ms ease forwards;
}

.hand-card_discarding .hand-card__number {
  display: none;
}

.hand-card__discard-mark {
  position: absolute;
  right: -5px;
  top: -5px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--ink);
  box-shadow: 0 2px 6px rgba(29, 29, 29, 0.22);
  color: var(--back);
  font-size: 22px;
  line-height: 1;
}
.hand-card__discard-mark::before,
.hand-card__discard-mark::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 10px;
  height: 2px;
  border-radius: 999px;
  background: var(--back-soft);
  transform: translate(-50%, -50%) rotate(45deg);
}

.hand-card__discard-mark::after {
  transform: translate(-50%, -50%) rotate(-45deg);
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

@keyframes discard-card-shake {
  0%,
  100% {
    transform: rotate(-1deg);
  }

  50% {
    transform: rotate(1.5deg);
  }
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
