<script setup>
import { useLongPress } from "../composables/useLongPress.js";
import GameCardVisual from "./GameCardVisual.vue";

const props = defineProps({
  card: {
    type: Object,
    required: true,
  },
  ariaLabel: {
    type: String,
    default: "",
  },
  isActive: {
    type: Boolean,
    default: false,
  },
  isAriaDisabled: {
    type: Boolean,
    default: false,
  },
  isAttention: {
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
  isFloating: {
    type: Boolean,
    default: false,
  },
  isSelected: {
    type: Boolean,
    default: false,
  },
  mark: {
    type: String,
    default: "",
    validator: (value) => ["", "cancel", "discard"].includes(value),
  },
});

const emit = defineEmits(["activate", "preview"]);
const { cancelLongPress, shouldSkipClick, startLongPress } = useLongPress(() => {
  emit("preview", props.card);
});

function handleClick() {
  if (shouldSkipClick()) return;

  emit("activate", props.card);
}
</script>

<template>
  <button
    class="game-card-button"
    :class="{
      'game-card-button_active': isActive,
      'game-card-button_attention': isAttention,
      'game-card-button_disabled': isDisabled,
      'game-card-button_discarding': isDiscarding,
      'game-card-button_floating': isFloating,
      'game-card-button_selected': isSelected,
    }"
    type="button"
    :aria-label="ariaLabel || card.title"
    :aria-pressed="isSelected"
    :aria-disabled="isDisabled || isAriaDisabled"
    @click.stop="handleClick"
    @contextmenu.stop.prevent
    @pointercancel="cancelLongPress"
    @pointerdown="startLongPress"
    @pointerleave="cancelLongPress"
    @pointerup="cancelLongPress"
  >
    <GameCardVisual :card="card" />
    <span
      v-if="mark"
      class="game-card-button__mark"
      :class="`game-card-button__mark_${mark}`"
      aria-hidden="true"
    ></span>
  </button>
</template>

<style scoped>
.game-card-button {
  position: relative;
  flex-shrink: 0;
  width: var(--card-width);
  border-radius: 6px;
  background: var(--back);
  box-shadow: 0 8px 18px rgba(94, 84, 70, 0.16);
  transform-origin: center;
  -webkit-touch-callout: none;
  pointer-events: auto;
  user-select: none;
  transition:
    box-shadow 160ms ease,
    transform 160ms ease;
}

.game-card-button_selected {
  border-color: var(--gold);
  box-shadow:
    0 0 0 2px rgba(240, 160, 32, 0.45),
    0 10px 20px rgba(94, 84, 70, 0.2);
}

.game-card-button_active {
  outline: 2px solid rgba(240, 160, 32, 0.92);
  outline-offset: 5px;
  box-shadow:
    0 8px 18px rgba(94, 84, 70, 0.16),
    0 0 18px rgba(240, 160, 32, 0.38);
}

.game-card-button_disabled {
  cursor: default;
  filter: grayscale(1);
  opacity: 0.42;
}

.game-card-button[aria-disabled="true"] {
  cursor: default;
}

.game-card-button_discarding,
.game-card-button_attention {
  animation: game-card-shake 520ms ease-in-out infinite;
}

.game-card-button_attention {
  box-shadow:
    0 0 0 2px rgba(240, 160, 32, 0.55),
    0 10px 20px rgba(94, 84, 70, 0.2);
}

.game-card-button_floating {
  box-shadow: 0 12px 26px rgba(29, 29, 29, 0.28);
  animation: game-card-float 1800ms ease-in-out infinite;
}

.game-card-button.game-card-move,
.game-card-button.game-card-enter-active {
  z-index: 30;
  transition:
    opacity 360ms ease,
    transform 360ms ease;
}

.game-card-button.game-card-enter-from {
  opacity: 0;
  transform: translateY(-96px) rotate(10deg) scale(0.86);
}

.game-card-button.game-card-enter-to,
.game-card-button.game-card-leave-from {
  opacity: 1;
  transform: translateY(0) rotate(0deg) scale(1);
}

.game-card-button.game-card-leave-active {
  z-index: 30;
  width: var(--leaving-card-width);
  max-width: var(--leaving-card-width);
  flex-basis: var(--leaving-card-width);
  overflow: hidden;
  transition:
    flex-basis 260ms ease 420ms,
    width 260ms ease 420ms,
    max-width 260ms ease 420ms;
  animation: game-card-fly-away 420ms ease forwards;
}

.game-card-button.game-card-leave-to {
  width: 0;
  max-width: 0;
  flex-basis: 0;
}

.game-card-button__mark {
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
}

.game-card-button__mark::before,
.game-card-button__mark::after {
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

.game-card-button__mark::after {
  transform: translate(-50%, -50%) rotate(-45deg);
}

@keyframes game-card-shake {
  0%,
  100% {
    transform: rotate(-1deg);
  }

  50% {
    transform: rotate(1.5deg);
  }
}

@keyframes game-card-float {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }

  50% {
    transform: translateY(-5px) scale(1.04);
  }
}

@keyframes game-card-fly-away {
  0% {
    opacity: 1;
    transform: translateY(0) rotate(0deg) scale(1);
  }

  100% {
    opacity: 0;
    transform: translateY(-96px) rotate(-16deg) scale(0.76);
  }
}

</style>
