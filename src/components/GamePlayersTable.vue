<script setup>
import { computed } from "vue";
import { useRoomStore } from "../stores/roomStore.js";

const roomStore = useRoomStore();

const seats = computed(() =>
  roomStore.room.seats.map((seat) => ({
    ...seat,
    isOwn: seat.player?.playerId === roomStore.playerId,
    isTargetable: Boolean(
      roomStore.selectedCard?.needsTarget &&
        roomStore.selectedCard?.isPlayable &&
        seat.player &&
        seat.player.playerId !== roomStore.playerId &&
        seat.player.isAlive,
    ),
  })),
);
</script>

<template>
  <section class="game-players-table" aria-label="Игроки за столом">
    <div class="game-players-table__oval">
      <span>Игровой стол</span>
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
      <span v-if="seat.player">{{ seat.player.name }}</span>
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
  place-items: center;
  width: 72px;
  height: 72px;
  border: 1px dashed var(--line);
  border-radius: 50%;
  background: var(--back-soft);
  color: var(--muted);
  font-size: 24px;
  line-height: 1;
  text-align: center;
}

.game-seat:disabled {
  cursor: default;
  opacity: 1;
}

.game-seat_taken {
  width: auto;
  height: auto;
  min-width: 8ch;
  min-height: 1.5em;
  border: 0;
  border-radius: 6px;
  padding-inline: 5px;
  background: var(--gold);
  color: var(--ink);
}

.game-seat_own {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}

.game-seat_targetable {
  box-shadow:
    0 0 0 2px rgba(240, 160, 32, 0.36),
    0 0 18px rgba(201, 74, 53, 0.24);
  animation: target-seat-pulse 920ms ease-in-out infinite;
}

.game-seat_dead {
  opacity: 0.42;
}

.game-seat span {
  overflow: hidden;
  max-width: 12ch;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
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

@keyframes target-seat-pulse {
  0%,
  100% {
    filter: brightness(1);
  }

  50% {
    filter: brightness(1.12);
  }
}
</style>
