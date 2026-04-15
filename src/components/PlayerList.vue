<script setup>
import { computed } from "vue";
import { healthConfig } from "../config/healthConfig.js";
import { useHealthStore } from "../stores/healthStore.js";

const healthStore = useHealthStore();
const playerCount = 4;
const playerBulletImage = healthConfig.bulletImages[0];

const players = computed(() =>
  Array.from({ length: playerCount }, (_, index) => ({
    id: index + 1,
    name: `player ${index + 1}`,
    health: index === 0 ? healthStore.health : healthStore.maxHealth,
    bulletImage: playerBulletImage,
  })),
);
</script>

<template>
  <section class="players" aria-label="Игроки">
    <article v-for="player in players" :key="player.id" class="player-card">
      <span class="player-card__name">{{ player.name }}</span>
      <span class="player-card__health">
        <img
          v-for="point in player.health"
          :key="point"
          :src="player.bulletImage"
          alt=""
        />
      </span>
    </article>
  </section>
</template>

<style scoped>
.players {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
}

.player-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  border: 1px dashed var(--line);
  border-radius: 6px;
  padding: 6px 8px;
  background: var(--back-soft);
}

.player-card__name {
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font-size: 18px;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-card__health {
  display: inline-flex;
  align-items: center;
  gap: 0;
  color: var(--muted);
  font-size: 18px;
  line-height: 1;
}

.player-card__health img {
  width: 12px;
  height: 19px;
  margin-left: -3px;
  object-fit: contain;
}

.player-card__health img:first-child {
  margin-left: 0;
}
</style>
