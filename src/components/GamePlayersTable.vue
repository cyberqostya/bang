<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useGameTable } from "../composables/useGameTable.js";
import { useRoomStore } from "../stores/roomStore.js";
import { resolveAssetUrl } from "../utils/assets.js";

const roomStore = useRoomStore();
const emit = defineEmits(["showCards", "inspectPlayer"]);
const tableElement = ref(null);
const statusElementsBySeatIndex = new Map();
const turnLightAngle = ref(0);
const {
  seats,
  turnSeatIndex,
  turnPlayerLabel,
  getBulletImage,
  getHatImage,
  getRangeStatusValue,
  handleSeatClick,
  isSheriff,
} = useGameTable(roomStore, emit);
const turnLightStyle = computed(() => {
  if (turnSeatIndex.value === null) return {};

  return {
    "--turn-light-angle": `${turnLightAngle.value}deg`,
  };
});

function setStatusElement(seatIndex, element) {
  if (element) {
    statusElementsBySeatIndex.set(seatIndex, element);
  } else {
    statusElementsBySeatIndex.delete(seatIndex);
  }

  updateTurnLightAngle();
}

async function updateTurnLightAngle() {
  await nextTick();

  if (turnSeatIndex.value === null || !tableElement.value) return;

  const statusElement = statusElementsBySeatIndex.get(turnSeatIndex.value);

  if (!statusElement) return;

  const tableRect = tableElement.value.getBoundingClientRect();
  const statusRect = statusElement.getBoundingClientRect();
  const tableCenterX = tableRect.left + tableRect.width / 2;
  const tableCenterY = tableRect.top + tableRect.height / 2;
  const statusCenterX = statusRect.left + statusRect.width / 2;
  const statusCenterY = statusRect.top + statusRect.height / 2;
  const deltaX = statusCenterX - tableCenterX;
  const deltaY = statusCenterY - tableCenterY;

  turnLightAngle.value = Math.atan2(deltaX, -deltaY) * (180 / Math.PI);
}

watch(turnSeatIndex, () => updateTurnLightAngle());
watch(seats, () => updateTurnLightAngle(), { flush: "post" });

onMounted(() => {
  updateTurnLightAngle();
  window.addEventListener("resize", updateTurnLightAngle);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateTurnLightAngle);
});
</script>

<template>
  <section
    ref="tableElement"
    class="game-players-table"
    aria-label="Игроки за столом"
  >
    <span
      v-if="turnSeatIndex !== null"
      class="game-players-table__turn-light"
      :style="turnLightStyle"
      aria-hidden="true"
    ></span>
    <div class="game-players-table__oval">
      <span class="game-players-table__label">{{ turnPlayerLabel }}</span>
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
      :disabled="!seat.player"
      @click.stop="handleSeatClick(seat)"
    >
      <span
        :ref="(element) => setStatusElement(seat.index, element)"
        class="game-seat__statuses"
        aria-hidden="true"
      >
        <span v-if="seat.player.health > 0" class="game-seat__health">
          <img
            v-for="point in seat.player.health"
            :key="point"
            :src="getBulletImage(seat.player)"
            alt=""
          />
        </span>
        <span class="game-seat__range" :style="seat.rangeStatusStyle">
          <span>{{ getRangeStatusValue(seat.player) }}</span>
        </span>
        <span
          v-for="status in seat.cardStatuses"
          :key="status.cardId"
          class="game-seat__card-status"
          :class="`game-seat__card-status_${status.cardId}`"
          :style="status.style"
          :title="status.title"
        >
          <img :src="resolveAssetUrl(status.image)" :alt="status.title" />
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
          <span class="game-seat__name">{{ seat.player.name }}</span>
          <span v-if="isSheriff(seat.player)" class="game-seat__role">
            Шериф
          </span>
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
  overflow: hidden;
}

.game-players-table__oval {
  position: absolute;
  inset: 7% 10%;
  display: grid;
  place-items: center;
  overflow: hidden;
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

.game-players-table__turn-light {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: conic-gradient(
    from calc(var(--turn-light-angle) - 36deg) at 50% 50%,
    transparent 0deg,
    rgba(240, 160, 32, 0.06) 10deg,
    rgba(240, 160, 32, 0.25) 23deg,
    rgba(240, 160, 32, 0.25) 45deg,
    rgba(240, 160, 32, 0.06) 62deg,
    transparent 76deg 360deg
  );
}

.game-players-table__label {
  position: relative;
  z-index: 1;
  color: rgba(94, 84, 70, 0.34);
  font-size: 18px;
  line-height: 1;
  text-align: center;
  width: 50%;
}

.game-seat {
  position: absolute;
  display: grid;
  justify-items: center;
  gap: 1px;
  width: 80px;
  z-index: 2;
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
  z-index: 2;
  display: grid;
  justify-items: center;
  gap: 1px;
}

.game-seat__statuses {
  --status-radius: 59px;
  --status-diagonal: calc(var(--status-radius) * 0.707);
  --status-ring-color: rgba(94, 84, 70, 0.34);
  --status-ring-width: 1px;
  position: absolute;
  left: 50%;
  top: 42%;
  z-index: 1;
  width: calc(var(--status-radius) * 2);
  height: calc(var(--status-radius) * 2);
  border-radius: 50%;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.game-seat__statuses::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  border: var(--status-ring-width) dashed var(--status-ring-color);
  border-radius: inherit;
  pointer-events: none;
}

.game-seat_own .game-seat__statuses {
  --status-ring-color: var(--ink);
  --status-ring-width: 2px;
}

.game-seat_turn .game-seat__statuses {
  --status-ring-color: var(--gold);
  --status-ring-width: 2px;
}

.game-seat_turn .game-seat__statuses::before {
  animation: status-ring-spin 14s linear infinite;
}

.game-seat__health {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translate(-50%, -50%);
}

.game-seat__health img {
  width: auto;
  height: 20px;
  object-fit: contain;
}

.game-seat__health img + img {
  margin-left: -4px;
}

.game-seat__range {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 1px solid #5e5446;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.game-seat__range::before,
.game-seat__range::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  border-radius: 999px;
  background: #b4ab9d;
  transform: translate(-50%, -50%);
}

.game-seat__range::before {
  width: 130%;
  height: 1px;
}

.game-seat__range::after {
  width: 1px;
  height: 130%;
}

.game-seat__range span {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  color: var(--ink);
  font-size: 16px;
  font-weight: 600;
  line-height: 0;
}

.game-seat__card-status {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  transform: translate(-50%, -50%)
    translate(
      calc(var(--card-status-x, 0) * var(--status-radius)),
      calc(var(--card-status-y, -1) * var(--status-radius))
    );
}

.game-seat__card-status img {
  display: block;
  width: 100%;
  object-fit: contain;
}

.game-seat__card-status_dynamite {
  width: 30px;
  height: 30px;
}

.game-seat__reticle {
  position: absolute;
  left: 50%;
  top: 42%;
  z-index: 3;
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
  z-index: 1;
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
  font-size: 16px;
  font-weight: 500;
}

.game-seat__role {
  font-size: 14px;
  font-weight: 400;
  margin-bottom: -4px;
  font-style: italic;
}

.game-seat_1 {
  top: 1%;
  left: 50%;
  transform: translateX(-50%);
}

.game-seat_1 .game-seat__statuses {
  transform: translate(-50%, -50%);
}

.game-seat_1 .game-seat__health {
  transform: translate(-50%, -50%) translate(0, var(--status-radius));
}

.game-seat_1 .game-seat__range {
  transform: translate(-50%, -50%)
    translate(calc(var(--status-diagonal) * -1), var(--status-diagonal));
}

.game-seat_2 {
  top: 19%;
  right: 8%;
}

.game-seat_2 .game-seat__statuses {
  transform: translate(-50%, -50%);
}

.game-seat_2 .game-seat__health {
  transform: translate(-50%, -50%)
    translate(calc(var(--status-diagonal) * -1), var(--status-diagonal));
}

.game-seat_2 .game-seat__range {
  transform: translate(-50%, -50%) translate(calc(var(--status-radius) * -1), 0);
}

.game-seat_3 {
  top: 50%;
  right: 0;
  transform: translateY(-50%);
}

.game-seat_3 .game-seat__statuses {
  transform: translate(-50%, -50%);
}

.game-seat_3 .game-seat__health {
  transform: translate(-50%, -50%) translate(calc(var(--status-radius) * -1), 0);
}

.game-seat_3 .game-seat__range {
  transform: translate(-50%, -50%)
    translate(
      calc(var(--status-diagonal) * -1),
      calc(var(--status-diagonal) * -1)
    );
}

.game-seat_4 {
  right: 8%;
  bottom: 19%;
}

.game-seat_4 .game-seat__statuses {
  transform: translate(-50%, -50%);
}

.game-seat_4 .game-seat__health {
  transform: translate(-50%, -50%)
    translate(
      calc(var(--status-diagonal) * -1),
      calc(var(--status-diagonal) * -1)
    );
}

.game-seat_4 .game-seat__range {
  transform: translate(-50%, -50%) translate(0, calc(var(--status-radius) * -1));
}

.game-seat_5 {
  bottom: 2%;
  left: 50%;
  transform: translateX(-50%);
}

.game-seat_5 .game-seat__statuses {
  transform: translate(-50%, -50%);
}

.game-seat_5 .game-seat__health {
  transform: translate(-50%, -50%) translate(0, calc(var(--status-radius) * -1));
}

.game-seat_5 .game-seat__range {
  transform: translate(-50%, -50%)
    translate(var(--status-diagonal), calc(var(--status-diagonal) * -1));
}

.game-seat_6 {
  bottom: 19%;
  left: 8%;
}

.game-seat_6 .game-seat__statuses {
  transform: translate(-50%, -50%);
}

.game-seat_6 .game-seat__health {
  transform: translate(-50%, -50%)
    translate(var(--status-diagonal), calc(var(--status-diagonal) * -1));
}

.game-seat_6 .game-seat__range {
  transform: translate(-50%, -50%) translate(var(--status-radius), 0);
}

.game-seat_7 {
  top: 50%;
  left: 0;
  transform: translateY(-50%);
}

.game-seat_7 .game-seat__statuses {
  transform: translate(-50%, -50%);
}

.game-seat_7 .game-seat__health {
  transform: translate(-50%, -50%) translate(var(--status-radius), 0);
}

.game-seat_7 .game-seat__range {
  transform: translate(-50%, -50%)
    translate(var(--status-diagonal), var(--status-diagonal));
}

.game-seat_8 {
  top: 19%;
  left: 8%;
}

.game-seat_8 .game-seat__statuses {
  transform: translate(-50%, -50%);
}

.game-seat_8 .game-seat__health {
  transform: translate(-50%, -50%)
    translate(var(--status-diagonal), var(--status-diagonal));
}

.game-seat_8 .game-seat__range {
  transform: translate(-50%, -50%) translate(0, var(--status-radius));
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

@keyframes status-ring-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
