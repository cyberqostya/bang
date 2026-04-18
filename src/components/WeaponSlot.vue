<script setup>
import { computed, ref } from "vue";
import CardPreview from "./CardPreview.vue";
import GameCardVisual from "./GameCardVisual.vue";
import { useRoomStore } from "../stores/roomStore.js";

const roomStore = useRoomStore();
const weapon = computed(() => roomStore.ownPlayer?.weapon || null);
const attackRange = computed(() => roomStore.ownPlayer?.attackRange || 1);
const isPreviewOpen = ref(false);
const canPreviewWeapon = computed(
  () => Boolean(weapon.value) && !roomStore.isMyTurn,
);
const canActivateWeaponProperty = computed(
  () => Boolean(weapon.value?.propertyAction) && roomStore.isMyTurn,
);
const isWeaponPropertyActive = computed(() => {
  const effectLimitKey = weapon.value?.propertyEffectLimitKey;

  if (!effectLimitKey) return false;

  return Boolean(roomStore.ownPlayer?.activeEffectAllowances?.[effectLimitKey]);
});

function handleWeaponTap() {
  if (canActivateWeaponProperty.value) {
    roomStore.activateWeaponProperty();
    return;
  }

  if (!canPreviewWeapon.value) return;

  isPreviewOpen.value = true;
}

function closePreview() {
  isPreviewOpen.value = false;
}
</script>

<template>
  <div
    class="weapon-slot"
    :class="{
      'weapon-slot_filled': weapon,
      'weapon-slot_previewable': canPreviewWeapon,
      'weapon-slot_property-ready': canActivateWeaponProperty,
      'weapon-slot_property-active': isWeaponPropertyActive,
    }"
    aria-label="Оружие"
  >
    <button
      v-if="weapon"
      class="weapon-slot__card"
      type="button"
      :aria-label="weapon.title"
      :disabled="!canPreviewWeapon && !canActivateWeaponProperty"
      @click.stop="handleWeaponTap"
    >
      <GameCardVisual :card="weapon" />
    </button>
    <img v-else class="weapon-slot__weapon" src="/images/colt.webp" alt="" />
    <span v-if="!weapon" class="weapon-slot__range" aria-hidden="true">
      <span>{{ attackRange }}</span>
    </span>
    <CardPreview v-if="isPreviewOpen && weapon" :card="weapon" @close="closePreview" />
  </div>
</template>

<style scoped>
.weapon-slot {
  position: relative;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  place-items: center;
  flex: 0 0 var(--card-width);
  width: var(--card-width);
  aspect-ratio: 0.625;
  border: 1px dashed #5e5446;
  border-radius: 6px;
  padding: 8px 6px 6px;
  background: rgba(243, 241, 219, 0.4);
  overflow: hidden;
}

.weapon-slot_filled {
  display: block;
  border: 0;
  padding: 0;
  background: transparent;
  box-shadow: 0 8px 18px rgba(94, 84, 70, 0.14);
}

.weapon-slot__card {
  display: block;
  width: 100%;
  border-radius: 6px;
  background: transparent;
}

.weapon-slot__card:disabled {
  cursor: default;
}

.weapon-slot_previewable .weapon-slot__card {
  cursor: zoom-in;
}

.weapon-slot_property-ready .weapon-slot__card {
  cursor: pointer;
}

.weapon-slot_property-active {
  outline: 2px solid rgba(240, 160, 32, 0.92);
  outline-offset: 5px;
  box-shadow:
    0 8px 18px rgba(94, 84, 70, 0.14),
    0 0 18px rgba(240, 160, 32, 0.38);
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
