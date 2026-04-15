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
  border: 1px dashed var(--line);
  border-radius: 6px;
  background: var(--back-soft);
}

.play-zone__title {
  position: absolute;
  top: 0;
  left: 18px;
  z-index: 1;
  display: block;
  transform: translateY(-50%);
  padding: 0 9px;
  background: var(--back);
  color: var(--muted);
  font-size: 22px;
  line-height: 1;
}

.play-zone__content {
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  padding: 10px;
}

.play-zone_hand {
  min-height: 132px;
}

.play-zone_hand .play-zone__content {
  display: flex;
  align-items: center;
  overflow: hidden;
  padding: 0;
}

.play-zone_table .play-zone__content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  overflow: visible;
}
</style>
