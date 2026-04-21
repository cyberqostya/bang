<script setup>
import EventCardLink from "./EventCardLink.vue";

defineProps({
  cardId: {
    type: String,
    default: "",
  },
  color: {
    type: String,
    default: "",
  },
  interactive: {
    type: Boolean,
    default: true,
  },
  title: {
    type: String,
    default: "",
  },
  tone: {
    type: String,
    default: "default",
  },
});

const emit = defineEmits(["open-card"]);
</script>

<template>
  <EventCardLink
    v-if="interactive"
    :card-id="cardId"
    :title="title"
    :color="color"
    :tone="tone"
    @open-card="emit('open-card', $event)"
  />
  <span v-else class="game-event-card-title" :style="color ? { color } : null">
    [{{ title }}]
  </span>
</template>

<style scoped>
.game-event-card-title {
  font-weight: 700;
  white-space: nowrap;
}
</style>
