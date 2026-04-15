<script setup>
import { computed } from "vue";
import { healthConfig } from "../config/healthConfig.js";
import { useRoomStore } from "../stores/roomStore.js";

const roomStore = useRoomStore();

const players = computed(() =>
  roomStore.players
    .filter((player) => player.playerId !== roomStore.playerId)
    .map((player) => ({
      id: player.playerId,
      name: player.name,
      health: player.health,
      bulletImage: getBulletImage(player.bulletSkinIndex),
    })),
);

function getBulletImage(index) {
  return healthConfig.bulletImages[index] || healthConfig.bulletImages[0];
}
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
  padding: 5px 5px 5px 8px;
  background: var(--back-soft);
}

.player-card__name {
  display: flex;
  align-items: center;
  height: 100%;
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
  width: 16px;
  height: auto;
  margin-left: -11px;
  object-fit: contain;
}

.player-card__health img:first-child {
  margin-left: 0;
}
</style>
