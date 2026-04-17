<script setup>
import { computed } from "vue";
import { healthConfig } from "../config/healthConfig.js";
import { useRoomStore } from "../stores/roomStore.js";

const roomStore = useRoomStore();

const seats = computed(() =>
  roomStore.room.seats
    .filter((seat) => seat.player)
    .map((seat) => ({
      ...seat,
      isOwn: seat.player?.playerId === roomStore.playerId,
      isTurn: seat.player?.playerId === roomStore.room.game?.turnPlayerId,
      isTargetable: Boolean(
        roomStore.selectedCard?.needsTarget &&
        roomStore.selectedCard?.isPlayable &&
        seat.player.playerId !== roomStore.playerId &&
        seat.player.isAlive,
      ),
    })),
);
const turnPlayer = computed(
  () =>
    seats.value.find(
      (seat) => seat.player.playerId === roomStore.room.game?.turnPlayerId,
    )?.player || null,
);
const turnPlayerLabel = computed(() => {
  if (!turnPlayer.value) return "игровой стол";

  const rolePrefix = turnPlayer.value.role?.id === "sheriff" ? "шериф " : "";

  return `Ходит ${rolePrefix}${turnPlayer.value.name}`;
});

function getHatImage(player) {
  return `/images/hats/${player.hatSkinKey || "1"}.webp`;
}

function getBulletImage(player) {
  if (player.bulletSkinKey === "sheriff") {
    return healthConfig.sheriffBulletImage;
  }

  return (
    healthConfig.bulletImages[player.bulletSkinIndex] ||
    healthConfig.bulletImages[0]
  );
}

function isSheriff(player) {
  return player.role?.id === "sheriff";
}
</script>

<template>
  <section class="game-players-table" aria-label="Игроки за столом">
    <div class="game-players-table__oval">
      <span>{{ turnPlayerLabel }}</span>
    </div>

    <button
      v-for="seat in seats"
      :key="seat.index"
      class="game-seat"
      :class="[
        `game-seat_${seat.index + 1}`,
        {
          'game-seat_taken': seat.player,
          'game-seat_own': seat.isOwn,
          'game-seat_turn': seat.isTurn,
          'game-seat_targetable': seat.isTargetable,
          'game-seat_dead': seat.player && !seat.player.isAlive,
        },
      ]"
      type="button"
      :disabled="!seat.isTargetable"
      @click.stop="roomStore.useSelectedCard(seat.player.playerId)"
    >
      <span
        v-if="seat.player.health > 0"
        class="game-seat__statuses"
        aria-hidden="true"
      >
        <span class="game-seat__health">
          <img
            v-for="point in seat.player.health"
            :key="point"
            :src="getBulletImage(seat.player)"
            alt=""
          />
        </span>
      </span>
      <span
        v-if="seat.isTargetable"
        class="game-seat__reticle"
        aria-hidden="true"
      ></span>
      <span class="game-seat__player">
        <img
          class="game-seat__hat"
          :class="{ 'game-seat__hat_13': seat.player.hatSkinKey === '13' }"
          :src="getHatImage(seat.player)"
          alt=""
        />
        <span class="game-seat__label">
          <span v-if="isSheriff(seat.player)" class="game-seat__role">
            Шериф
          </span>
          <span class="game-seat__name">{{ seat.player.name }}</span>
          <span v-if="seat.isOwn" class="game-seat__own-marker">Я</span>
        </span>
      </span>
    </button>
  </section>
</template>

<style scoped>
.game-players-table {
  position: relative;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.game-players-table__oval {
  position: absolute;
  inset: 7% 10%;
  display: grid;
  place-items: center;
  border: 2px solid rgba(94, 84, 70, 0.3);
  border-radius: 50%;
  background: linear-gradient(
    180deg,
    rgba(243, 241, 219, 0.94),
    rgba(235, 229, 208, 0.88)
  );
  box-shadow:
    inset 0 10px 26px rgba(94, 84, 70, 0.12),
    0 12px 24px rgba(94, 84, 70, 0.12);
}

.game-players-table__oval span {
  color: rgba(94, 84, 70, 0.34);
  font-size: 18px;
  line-height: 1;
  text-align: center;
}

.game-seat {
  position: absolute;
  display: grid;
  justify-items: center;
  gap: 1px;
  width: 80px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--ink);
  font-size: 24px;
  line-height: 1;
  text-align: center;
}

.game-seat:disabled {
  cursor: default;
}

.game-seat_taken {
  background: transparent;
}

.game-seat_dead {
  opacity: 0.32;
}

.game-seat__player {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 1px;
}

.game-seat_turn .game-seat__player {
  animation: turn-player-float 1500ms ease-in-out infinite;
}

.game-seat__own-marker {
  position: absolute;
  left: -9px;
  bottom: -6px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 20px;
  height: 18px;
  border-radius: 5px;
  background: var(--gold);
  box-shadow:
    0 0 0 1px rgba(29, 29, 29, 0.16),
    0 2px 5px rgba(29, 29, 29, 0.18);
  color: var(--ink);
  font-size: 16px;
  line-height: 1;
  transform: rotate(-7deg);
}

.game-seat__statuses {
  position: absolute;
  display: grid;
  place-items: center;
  pointer-events: none;
}

.game-seat__health {
  display: flex;
  align-items: center;
  justify-content: center;
}

.game-seat__health img {
  width: 14px;
  height: auto;
  object-fit: contain;
  filter: drop-shadow(0 2px 3px rgba(29, 29, 29, 0.22));
}

.game-seat__health img + img {
  margin-left: -9px;
}

.game-seat__reticle {
  position: absolute;
  left: 50%;
  top: 30px;
  z-index: 2;
  width: 54px;
  height: 54px;
  border: 2px solid rgba(201, 74, 53, 0.82);
  border-radius: 50%;
  pointer-events: none;
  transform: translate(-50%, -50%) scale(1.5);
  animation: target-reticle-lock 5s ease-out infinite;
}

.game-seat__reticle::before,
.game-seat__reticle::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  border-radius: 999px;
  background: rgba(201, 74, 53, 0.82);
  transform: translate(-50%, -50%);
}

.game-seat__reticle::before {
  width: 68px;
  height: 1px;
}

.game-seat__reticle::after {
  width: 1px;
  height: 68px;
}

.game-seat__hat {
  display: block;
  width: 64px;
  height: auto;
  margin-bottom: -4px;
  pointer-events: none;
  position: relative;
}

.game-seat__hat_13 {
  margin-bottom: -20px;
}

.game-seat__label {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 1px;
  min-width: 0;
}

.game-seat__role,
.game-seat__name {
  line-height: 1;
  white-space: nowrap;
  font-size: 18px;
  font-weight: 500;
}

.game-seat__role {
  font-size: 14px;
  font-weight: 400;
  margin-bottom: -4px;
}

.game-seat_1 {
  top: 1%;
  left: 50%;
  transform: translateX(-50%);
}

.game-seat_1 .game-seat__statuses {
  left: 50%;
  top: calc(100% + 1px);
  transform: translateX(-50%);
}

.game-seat_2 {
  top: 19%;
  right: 8%;
}

.game-seat_2 .game-seat__statuses {
  left: -5px;
  top: calc(100% - 8px);
  transform: translateX(-50%);
}

.game-seat_3 {
  top: 50%;
  right: 0;
  transform: translateY(-50%);
}

.game-seat_3 .game-seat__statuses {
  right: calc(100% - 8px);
  top: 50%;
  transform: translateY(-50%);
}

.game-seat_4 {
  right: 8%;
  bottom: 19%;
}

.game-seat_4 .game-seat__statuses {
  left: -5px;
  bottom: calc(100% - 8px);
  transform: translateX(-50%);
}

.game-seat_5 {
  bottom: 2%;
  left: 50%;
  transform: translateX(-50%);
}

.game-seat_5 .game-seat__statuses {
  left: 50%;
  bottom: calc(100% + 1px);
  transform: translateX(-50%);
}

.game-seat_6 {
  bottom: 19%;
  left: 8%;
}

.game-seat_6 .game-seat__statuses {
  right: -5px;
  bottom: calc(100% - 8px);
  transform: translateX(50%);
}

.game-seat_7 {
  top: 50%;
  left: 0;
  transform: translateY(-50%);
}

.game-seat_7 .game-seat__statuses {
  left: calc(100% - 8px);
  top: 50%;
  transform: translateY(-50%);
}

.game-seat_8 {
  top: 19%;
  left: 8%;
}

.game-seat_8 .game-seat__statuses {
  right: -5px;
  top: calc(100% - 8px);
  transform: translateX(50%);
}

.game-seat_5 .game-seat__hat,
.game-seat_6 .game-seat__hat,
.game-seat_7 .game-seat__hat,
.game-seat_8 .game-seat__hat {
  transform: scaleX(-1);
}

@keyframes target-reticle-lock {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(2);
  }

  8% {
    opacity: 1;
  }

  16% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.6);
  }

  88% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.2);
  }
}

@keyframes turn-player-float {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-13px);
  }
}
</style>
