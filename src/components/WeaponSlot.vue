<script setup>
import { computed } from "vue";
import { useRoomStore } from "../stores/roomStore.js";

const roomStore = useRoomStore();
const attackRange = computed(() => roomStore.ownPlayer?.attackRange || 1);
</script>

<template>
  <div class="weapon-slot" aria-label="Оружие">
    <img class="weapon-slot__weapon" src="/images/colt.webp" alt="" />
    <span class="weapon-slot__range" aria-hidden="true">
      <span>{{ attackRange }}</span>
    </span>
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
