<script setup>
import { computed, ref } from "vue";
import { useCardLeaveAnimation } from "../composables/useCardLeaveAnimation.js";
import CardPreview from "./CardPreview.vue";
import GameCardButton from "./GameCardButton.vue";
import { useRoomStore } from "../stores/roomStore.js";

const props = defineProps({
  attackRange: {
    type: Number,
    default: undefined,
  },
  canActivate: {
    type: Boolean,
    default: undefined,
  },
  isAttention: {
    type: Boolean,
    default: undefined,
  },
  weapon: {
    type: Object,
    default: undefined,
  },
});

const emit = defineEmits(["activate"]);
const roomStore = useRoomStore();
const weapon = computed(() =>
  props.weapon === undefined ? roomStore.ownPlayer?.weapon || null : props.weapon,
);
const attackRange = computed(() =>
  props.attackRange === undefined
    ? roomStore.ownPlayer?.attackRange || 1
    : props.attackRange || 1,
);
const pendingReaction = computed(
  () => roomStore.room.game?.pendingReaction || null,
);
const isReactionActive = computed(() => Boolean(pendingReaction.value));
const isPreviewOpen = ref(false);
const { freezeLeavingCard } = useCardLeaveAnimation();
const canActivateWeaponProperty = computed(
  () =>
    props.canActivate ??
    (Boolean(weapon.value?.propertyAction) &&
      roomStore.isMyTurn &&
      !isReactionActive.value),
);
const isWeaponPropertyActive = computed(() => {
  if (props.isAttention !== undefined) return props.isAttention;

  const effectLimitKey = weapon.value?.propertyEffectLimitKey;

  if (!effectLimitKey) return false;

  return Boolean(roomStore.ownPlayer?.activeEffectAllowances?.[effectLimitKey]);
});

function handleWeaponTap() {
  if (!canActivateWeaponProperty.value) return;

  emit("activate", weapon.value);

  if (props.canActivate === undefined) {
    roomStore.activateWeaponProperty();
  }
}

function openPreview() {
  isPreviewOpen.value = true;
}

function closePreview() {
  isPreviewOpen.value = false;
}

function freezeLeavingWeapon(element) {
  if (element.classList?.contains("game-card-button")) {
    freezeLeavingCard(element);
  }
}
</script>

<template>
  <div
    class="weapon-slot"
    :class="{
      'weapon-slot_property-ready': canActivateWeaponProperty,
    }"
    aria-label="Оружие"
  >
    <Transition
      name="game-card"
      :duration="{ enter: 360, leave: 680 }"
      @before-leave="freezeLeavingWeapon"
    >
      <GameCardButton
        v-if="weapon"
        :key="weapon.instanceId"
        class="weapon-slot__card"
        :card="weapon"
        :is-attention="isWeaponPropertyActive"
        @activate="handleWeaponTap"
        @preview="openPreview"
      />
      <span v-else key="default-weapon" class="weapon-slot__default">
        <img class="weapon-slot__weapon" src="/images/colt.webp" alt="" />
        <span class="weapon-slot__range" aria-hidden="true">
          <span>{{ attackRange }}</span>
        </span>
      </span>
    </Transition>
    <CardPreview
      v-if="isPreviewOpen && weapon"
      :card="weapon"
      @close="closePreview"
    />
  </div>
</template>

<style scoped>
.weapon-slot {
  position: relative;
  display: grid;
  place-items: center;
  flex: 0 0 var(--card-width);
  width: var(--card-width);
  aspect-ratio: 0.625;
  border-radius: 6px;
  padding: 0;
  background: transparent;
}

.weapon-slot__default {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  place-items: center;
  width: 100%;
  height: 100%;
  border: 1px dashed #5e5446;
  border-radius: 6px;
  padding: 8px 6px 6px;
  background: rgba(243, 241, 219, 0.4);
  box-sizing: border-box;
}

.weapon-slot :deep(.game-card-button.game-card-leave-active) {
  position: absolute;
  inset: 0;
}

.weapon-slot :deep(.game-card-button.game-card-enter-active) {
  position: absolute;
  inset: 0;
}

.weapon-slot__default.game-card-enter-active,
.weapon-slot__default.game-card-leave-active {
  transition: opacity 220ms ease;
}

.weapon-slot__default.game-card-enter-from,
.weapon-slot__default.game-card-leave-to {
  opacity: 0;
}

.weapon-slot__default.game-card-enter-to,
.weapon-slot__default.game-card-leave-from {
  opacity: 1;
}

.weapon-slot_property-ready .weapon-slot__card {
  cursor: pointer;
}

.weapon-slot__weapon {
  width: 74%;
  height: auto;
  opacity: 0.88;
  object-fit: contain;
}

.weapon-slot__range {
  position: relative;
  display: grid;
  place-items: center;
  width: 25px;
  height: 25px;
  border: 1px solid #5e5446;
  border-radius: 50%;
}

.weapon-slot__range::before,
.weapon-slot__range::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  border-radius: 999px;
  background: #b4ab9d;
  transform: translate(-50%, -50%);
}

.weapon-slot__range::before {
  width: 130%;
  height: 1px;
}

.weapon-slot__range::after {
  width: 1px;
  height: 130%;
}

.weapon-slot__range span {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  color: var(--muted);
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
}
</style>
