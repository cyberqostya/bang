<script setup>
import { computed } from "vue";
import { useRoomStore } from "../stores/roomStore.js";

const roomStore = useRoomStore();

const seats = computed(() =>
  roomStore.room.seats
    .filter((seat) => seat.player)
    .map((seat) => ({
      ...seat,
      isOwn: seat.player?.playerId === roomStore.playerId,
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

  return `сейчас ходит ${rolePrefix}${turnPlayer.value.name}`;
});

function getHatImage(player) {
  return `/images/hats/${player.hatSkinKey || "1"}.webp`;
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
          'game-seat_targetable': seat.isTargetable,
          'game-seat_dead': seat.player && !seat.player.isAlive,
        },
      ]"
      type="button"
      :disabled="!seat.isTargetable"
      @click.stop="roomStore.useSelectedCard(seat.player.playerId)"
    >
      <img
        class="game-seat__hat"
        :class="{ 'game-seat__hat_13': seat.player.hatSkinKey === '13' }"
        :src="getHatImage(seat.player)"
        alt=""
      />
      <span class="game-seat__name">{{ seat.player.name }}</span>
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
  font-size: 28px;
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

.game-seat_own {
  outline: 0;
}

.game-seat_targetable {
  animation: target-seat-pulse 920ms ease-in-out infinite;
}

.game-seat_dead {
  opacity: 0.32;
}

.game-seat__hat {
  display: block;
  width: 64px;
  height: auto;
  margin-bottom: -6px;
  pointer-events: none;
  position: relative;
}

.game-seat__hat_13 {
  margin-bottom: -18px;
}

.game-seat__name {
  overflow: hidden;
  max-width: 12ch;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.game-seat_own .game-seat__name {
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.game-seat_1 {
  top: 1%;
  left: 50%;
  transform: translateX(-50%);
}

.game-seat_2 {
  top: 19%;
  right: 8%;
}

.game-seat_3 {
  top: 50%;
  right: 0;
  transform: translateY(-50%);
}

.game-seat_4 {
  right: 8%;
  bottom: 19%;
}

.game-seat_5 {
  bottom: 2%;
  left: 50%;
  transform: translateX(-50%);
}

.game-seat_6 {
  bottom: 19%;
  left: 8%;
}

.game-seat_7 {
  top: 50%;
  left: 0;
  transform: translateY(-50%);
}

.game-seat_8 {
  top: 19%;
  left: 8%;
}

.game-seat_5 .game-seat__hat,
.game-seat_6 .game-seat__hat,
.game-seat_7 .game-seat__hat,
.game-seat_8 .game-seat__hat {
  transform: scaleX(-1);
}

@keyframes target-seat-pulse {
  0%,
  100% {
    filter: brightness(1);
  }

  50% {
    filter: brightness(1.14) drop-shadow(0 0 10px rgba(201, 74, 53, 0.34));
  }
}
</style>
