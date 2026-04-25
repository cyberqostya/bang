<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps({
  text: {
    type: String,
    default: "",
  },
});

const containerElement = ref(null);
const contentElement = ref(null);
const primaryTextElement = ref(null);
const isOverflowing = ref(false);
let resizeObserver = null;

const marqueeStyle = computed(() => {
  const distance = primaryTextElement.value?.scrollWidth || 0;
  const gap = 24;
  const duration = Math.max(6.5, distance / 16);

  return {
    "--marquee-distance": `${distance + gap}px`,
    "--marquee-gap": `${gap}px`,
    "--marquee-duration": `${duration}s`,
  };
});

async function updateOverflowState() {
  await nextTick();

  if (!containerElement.value || !contentElement.value) {
    isOverflowing.value = false;
    return;
  }

  isOverflowing.value =
    contentElement.value.scrollWidth > containerElement.value.clientWidth + 1;
}

watch(
  () => props.text,
  () => updateOverflowState(),
  { immediate: true },
);

onMounted(() => {
  resizeObserver = new ResizeObserver(() => updateOverflowState());

  if (containerElement.value) {
    resizeObserver.observe(containerElement.value);
  }

  if (contentElement.value) {
    resizeObserver.observe(contentElement.value);
  }

  updateOverflowState();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});
</script>

<template>
  <span ref="containerElement" class="overflow-marquee">
    <span
      ref="contentElement"
      class="overflow-marquee__content"
      :class="{ 'overflow-marquee__content_running': isOverflowing }"
      :style="isOverflowing ? marqueeStyle : null"
    >
      <span ref="primaryTextElement">{{ text }}</span>
      <span
        v-if="isOverflowing"
        class="overflow-marquee__gap"
        aria-hidden="true"
      ></span>
      <span v-if="isOverflowing" aria-hidden="true">{{ text }}</span>
    </span>
  </span>
</template>

<style scoped>
.overflow-marquee {
  display: block;
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.overflow-marquee__content {
  display: inline-flex;
  align-items: center;
  min-width: max-content;
  will-change: transform;
}

.overflow-marquee__content_running {
  animation: overflow-marquee-run var(--marquee-duration) linear infinite;
}

.overflow-marquee__gap {
  width: var(--marquee-gap);
  flex: 0 0 auto;
}

@keyframes overflow-marquee-run {
  0%,
  16% {
    transform: translateX(0);
  }

  100% {
    transform: translateX(calc(-1 * var(--marquee-distance)));
  }
}
</style>
