<script setup>
defineProps({
  title: {
    type: String,
    required: true,
  },
  variant: {
    type: String,
    default: "",
  },
});
</script>

<template>
  <section
    class="play-zone"
    :class="variant && `play-zone_${variant}`"
    :aria-label="title"
  >
    <span class="play-zone__title">{{ title }}</span>
    <div class="play-zone__content">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.play-zone {
  position: relative;
  width: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--back-soft);
}

.play-zone__title {
  position: absolute;
  top: 0;
  left: 50%;
  z-index: 1;
  display: block;
  transform: translate(-50%, -50%);
  padding: 0 10px;
  background: var(--back-soft);
  border: 1px dashed var(--line);
  border-radius: 6px;
  color: var(--muted);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.05em;
  line-height: 1;
  white-space: nowrap;
}

.play-zone__content {
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  padding: 5px;
}

.play-zone_hand .play-zone__content {
  display: flex;
  align-items: center;
  overflow: hidden;
  padding: 0;
  border-top: 1px dashed var(--line);
}

.play-zone_table .play-zone__content {
  display: grid;
  overflow: visible;
  border-top: 1px dashed var(--line);
}

.play-zone_events {
  height: 100px;
}

.play-zone_events .play-zone__content {
  overflow: hidden;
  border-bottom: 1px dashed var(--line);
  padding-top: 5px;
}
</style>
