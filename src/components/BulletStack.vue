<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { healthConfig } from "../config/healthConfig.js";
import { useRoomStore } from "../stores/roomStore.js";

const roomStore = useRoomStore();
const bulletsElement = ref(null);
const bulletWidth = ref(0);
const containerWidth = ref(0);
let resizeObserver = null;

const fallbackPlayer = {
  health: healthConfig.maxHealth,
  maxHealth: healthConfig.maxHealth,
  bulletSkinIndex: 0,
};

const ownPlayer = computed(() => roomStore.ownPlayer || fallbackPlayer);
const bulletImage = computed(() =>
  getBulletImage(ownPlayer.value.bulletSkinIndex),
);
const bullets = computed(() =>
  Array.from({ length: ownPlayer.value.maxHealth }, (_, index) => ({
    id: index,
    isLoaded: index < ownPlayer.value.health,
  })),
);
const bulletOverlap = computed(() => {
  const count = bullets.value.length;

  if (count <= 1 || !bulletWidth.value || !containerWidth.value) {
    return "0px";
  }

  const naturalWidth = bulletWidth.value * count;

  if (naturalWidth <= containerWidth.value) {
    return "0px";
  }

  return `${(containerWidth.value - naturalWidth) / (count - 1)}px`;
});
const bulletsStyle = computed(() => ({
  "--bullet-overlap": bulletOverlap.value,
}));

onMounted(() => {
  resizeObserver = new ResizeObserver(updateBulletMetrics);

  if (bulletsElement.value) {
    resizeObserver.observe(bulletsElement.value);
  }

  updateBulletMetrics();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});

watch(
  () => bullets.value.length,
  () => {
    updateBulletMetrics();
  },
);

function getBulletImage(index) {
  if (ownPlayer.value.bulletSkinKey === "sheriff") {
    return healthConfig.sheriffBulletImage;
  }

  return healthConfig.bulletImages[index] || healthConfig.bulletImages[0];
}

async function updateBulletMetrics() {
  await nextTick();

  const element = bulletsElement.value;
  const bullet = element?.querySelector(".bullet");

  if (!element || !bullet) return;

  containerWidth.value = element.clientWidth;
  bulletWidth.value = bullet.getBoundingClientRect().width;
}
</script>

<template>
  <div
    ref="bulletsElement"
    class="bullets"
    :style="bulletsStyle"
    aria-label="Патроны"
  >
    <div
      v-for="bullet in bullets"
      :key="bullet.id"
      class="bullet"
      :class="{
        bullet_empty: !bullet.isLoaded,
        bullet_loaded: bullet.isLoaded,
      }"
      :aria-label="bullet.isLoaded ? 'Патрон заряжен' : 'Патрон потерян'"
    >
      <img :src="bulletImage" alt="" @load="updateBulletMetrics" />
    </div>
  </div>
</template>

<style scoped>
.bullets {
  position: relative;
  display: flex;
  min-width: 0;
  overflow: visible;
}

.bullet {
  width: max-content;
  height: var(--bullet-height);
  background: transparent;
}

.bullet + .bullet {
  margin-left: var(--bullet-overlap);
}

.bullet img {
  width: auto;
  height: 100%;
  object-fit: contain;
  transition:
    opacity 160ms ease,
    transform 160ms ease,
    filter 160ms ease;
}

.bullet_empty img {
  opacity: 0.14;
  filter: grayscale(1);
}
</style>
