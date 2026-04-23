<script setup>
const props = defineProps({
  cardId: {
    type: String,
    default: "",
  },
  title: {
    type: String,
    default: "",
  },
  color: {
    type: String,
    default: "",
  },
  tone: {
    type: String,
    default: "default",
  },
});

const emit = defineEmits(["open-card"]);
const colorStyle =
  props.tone === "light" || !props.color
    ? null
    : {
        color: props.color,
      };

function openCard() {
  if (!props.cardId) return;

  emit("open-card", props.cardId);
}
</script>

<template>
  <button
    v-if="cardId"
    class="event-card-link"
    type="button"
    :style="colorStyle"
    @click.stop="openCard"
  >
    [{{ title }}]
  </button>
  <span
    v-else
    class="event-card-link event-card-link_static"
    :style="colorStyle"
  >
    {{ title }}
  </span>
</template>

<style scoped>
.event-card-link {
  display: inline;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 700;
  line-height: inherit;
  text-align: inherit;
  /* text-decoration: underline;
  text-decoration-style: dashed;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px; */
}

.event-card-link_static {
  font-weight: 500;
  text-decoration: none;
}
</style>
