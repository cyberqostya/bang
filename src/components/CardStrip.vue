<script setup>
import { nextTick, ref, watch } from "vue";

const props = defineProps({
  duration: {
    type: Object,
    default: () => ({ enter: 360, leave: 680 }),
  },
  empty: {
    type: Boolean,
    default: false,
  },
  label: {
    type: String,
    default: "",
  },
  itemsKey: {
    type: String,
    default: "",
  },
  transition: {
    type: Boolean,
    default: true,
  },
  variant: {
    type: String,
    default: "hand",
  },
});

const emit = defineEmits(["before-leave"]);
const isOwnMoveActive = ref(false);

watch(
  () => props.itemsKey,
  async (itemsKey, previousItemsKey) => {
    if (!itemsKey || itemsKey === previousItemsKey) return;

    isOwnMoveActive.value = true;
    await nextTick();
    isOwnMoveActive.value = false;
  },
);
</script>

<template>
  <TransitionGroup
    v-if="transition"
    class="card-strip"
    :class="[`card-strip_${variant}`, { 'card-strip_empty': empty }]"
    name="game-card"
    :move-class="
      !itemsKey || isOwnMoveActive ? 'game-card-move' : 'card-strip_move-disabled'
    "
    tag="div"
    :duration="duration"
    :aria-label="label || null"
    @before-leave="emit('before-leave', $event)"
    @click.stop
  >
    <slot />
  </TransitionGroup>

  <div
    v-else
    class="card-strip"
    :class="[`card-strip_${variant}`, { 'card-strip_empty': empty }]"
    :aria-label="label || null"
    @click.stop
  >
    <slot />
  </div>
</template>

<style scoped>
.card-strip {
  position: relative;
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: visible;
  overscroll-behavior-x: contain;
  padding: 15px 5px 5px;
  scrollbar-width: thin;
  scrollbar-color: rgba(94, 84, 70, 0.5) rgba(94, 84, 70, 0.12);
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x;
}

.card-strip_permanent {
  padding-bottom: 15px;
}

.card-strip::-webkit-scrollbar {
  height: 7px;
}

.card-strip::-webkit-scrollbar-track {
  border-radius: 999px;
  background: rgba(94, 84, 70, 0.12);
}

.card-strip::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(94, 84, 70, 0.48);
}

.card-strip_empty::before {
  content: "";
  flex: 0 0 var(--card-width);
  width: var(--card-width);
  aspect-ratio: 0.625;
  pointer-events: none;
  visibility: hidden;
}
</style>
