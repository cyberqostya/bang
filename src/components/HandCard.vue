<script setup>
import GameCardButton from "./GameCardButton.vue";

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
  canSelect: {
    type: Boolean,
    default: true,
  },
  isDiscarding: {
    type: Boolean,
    default: false,
  },
  isAttention: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["preview", "select"]);
</script>

<template>
  <GameCardButton
    class="hand-card"
    :card="card"
    :is-attention="isAttention"
    :is-aria-disabled="!canSelect"
    :is-disabled="isDisabled"
    :is-discarding="isDiscarding"
    :is-selected="isSelected"
    :mark="isDiscarding ? 'discard' : ''"
    @activate="emit('select', card.instanceId)"
    @preview="emit('preview', card)"
  />
</template>
