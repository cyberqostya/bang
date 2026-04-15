<script setup>
import { computed, ref } from "vue";
import { roleBackImage, roleConfig } from "../config/roleConfig.js";
import { useRoomStore } from "../stores/roomStore.js";

const roomStore = useRoomStore();
const isOpen = ref(false);
const role = computed(() => roleConfig[roomStore.ownPlayer?.role?.id] || null);

function openRole() {
  if (!role.value) return;

  isOpen.value = true;
}

function closeRole() {
  isOpen.value = false;
}
</script>

<template>
  <button
    class="role-card-button"
    type="button"
    :disabled="!role"
    aria-label="Посмотреть роль"
    @click.stop="openRole"
  >
    <img :src="roleBackImage" alt="" />
  </button>

  <div v-if="isOpen" class="role-card-overlay" @click.stop="closeRole">
    <button
      class="role-card-preview"
      type="button"
      :aria-label="role?.label"
      @click.stop="closeRole"
    >
      <span class="role-card-preview__inner">
        <img class="role-card-preview__back" :src="roleBackImage" alt="" />
        <img class="role-card-preview__front" :src="role?.image" :alt="role?.label" />
      </span>
    </button>
  </div>
</template>

<style scoped>
.role-card-button {
  flex: 0 0 var(--card-width);
  width: var(--card-width);
  border-radius: 6px;
  background: transparent;
  box-shadow: 0 8px 18px rgba(94, 84, 70, 0.14);
}

.role-card-button:disabled {
  opacity: 0.42;
}

.role-card-button img {
  width: 100%;
  height: auto;
  border-radius: 6px;
}

.role-card-overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  background: rgba(29, 29, 29, 0.28);
}

.role-card-preview {
  width: min(72vw, 260px);
  border-radius: 6px;
  background: transparent;
  perspective: 900px;
}

.role-card-preview__inner {
  position: relative;
  display: block;
  width: 100%;
  transform-style: preserve-3d;
  animation: role-card-flip 520ms ease forwards;
}

.role-card-preview__back,
.role-card-preview__front {
  width: 100%;
  height: auto;
  border-radius: 6px;
  box-shadow: 0 18px 36px rgba(29, 29, 29, 0.28);
  backface-visibility: hidden;
}

.role-card-preview__front {
  position: absolute;
  inset: 0;
  transform: rotateY(180deg);
}

@keyframes role-card-flip {
  from {
    transform: rotateY(0deg) scale(0.72);
  }

  to {
    transform: rotateY(180deg) scale(1);
  }
}
</style>

