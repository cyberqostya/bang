<script setup>
import { computed } from "vue";
import { healthConfig } from "../config/healthConfig.js";
import { useRoomStore } from "../stores/roomStore.js";

const roomStore = useRoomStore();

const fallbackPlayer = {
  health: healthConfig.maxHealth,
  maxHealth: healthConfig.maxHealth,
  bulletSkinIndex: 0,
};

const ownPlayer = computed(() => roomStore.ownPlayer || fallbackPlayer);
const bulletImage = computed(() => getBulletImage(ownPlayer.value.bulletSkinIndex));
const bullets = computed(() => (
  Array.from({ length: ownPlayer.value.maxHealth }, (_, index) => ({
    id: index,
    isLoaded: index < ownPlayer.value.health,
  }))
));

function getBulletImage(index) {
  return healthConfig.bulletImages[index] || healthConfig.bulletImages[0];
}
</script>

<template>
  <div class="bullets" aria-label="Патроны">
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
      <img :src="bulletImage" alt="" />
    </div>
  </div>
</template>

<style scoped>
.bullets {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  height: var(--bullet-height);
  min-width: 0;
  overflow: hidden;
}

.bullet {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 51px;
  height: var(--bullet-height);
  background: transparent;
}

.bullet img {
  width: auto;
  max-width: 100%;
  height: 100%;
  object-fit: contain;
  transition:
    opacity 160ms ease,
    transform 160ms ease,
    filter 160ms ease;
}

.bullet_empty img {
  opacity: 0.14;
  transform: scale(0.88);
  filter: grayscale(1);
}
</style>
