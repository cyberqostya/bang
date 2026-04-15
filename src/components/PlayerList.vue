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
      role: player.role,
      isAlive: player.isAlive,
      bulletImage: getBulletImage(player),
      isTargetable: Boolean(roomStore.selectedCard && player.isAlive),
    })),
);

function getBulletImage(player) {
  if (player.bulletSkinKey === "sheriff") {
    return healthConfig.sheriffBulletImage;
  }

  return healthConfig.bulletImages[player.bulletSkinIndex] || healthConfig.bulletImages[0];
}
</script>

<template>
  <section class="players" aria-label="Игроки">
    <button
      v-for="player in players"
      :key="player.id"
      class="player-card"
      :class="{
        'player-card_targetable': player.isTargetable,
        'player-card_dead': !player.isAlive,
      }"
      type="button"
      :disabled="!player.isTargetable"
      @click.stop="roomStore.useSelectedCard(player.id)"
    >
      <span class="player-card__name">
        {{ player.name }}
        <img
          v-if="player.role?.id === 'sheriff'"
          class="player-card__role-icon"
          src="/images/roles/sheriffs-star.webp"
          alt="Шериф"
        />
      </span>
      <span class="player-card__health">
        <img
          v-for="point in player.health"
          :key="point"
          :src="player.bulletImage"
          alt=""
        />
      </span>
    </button>
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
  justify-items: stretch;
  gap: 8px;
  min-height: 38px;
  border: 1px dashed var(--line);
  border-radius: 6px;
  padding: 5px 5px 5px 8px;
  background: var(--back-soft);
  text-align: left;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.player-card:disabled {
  cursor: default;
}

.player-card_targetable {
  border-color: rgba(240, 160, 32, 0.8);
  background: rgba(240, 160, 32, 0.18);
  box-shadow: 0 0 0 2px rgba(240, 160, 32, 0.22);
}

.player-card_targetable:active {
  transform: translateY(1px);
}

.player-card_dead {
  opacity: 0.48;
}

.player-card__name {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font-size: 18px;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-card__role-icon {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  object-fit: contain;
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
