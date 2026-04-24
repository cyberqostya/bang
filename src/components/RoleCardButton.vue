<script setup>
import { computed, ref } from "vue";
import { roleBackImage, roleConfig } from "../config/roleConfig.js";
import { useRoomStore } from "../stores/roomStore.js";
import { resolveAssetUrl } from "../utils/assets.js";

const props = defineProps({
  canOpen: {
    type: Boolean,
    default: true,
  },
  isFaceUp: {
    type: Boolean,
    default: undefined,
  },
  role: {
    type: Object,
    default: undefined,
  },
});

const roomStore = useRoomStore();
const isOpen = ref(false);
const role = computed(() => {
  const sourceRole =
    props.role === undefined ? roomStore.ownPlayer?.role || null : props.role;

  return roleConfig[sourceRole?.id] || sourceRole || null;
});
const isRoleFaceUp = computed(
  () =>
    props.isFaceUp ??
    Boolean(
      role.value &&
      (role.value.id === "sheriff" ||
        roomStore.ownPlayer?.isRoleRevealed ||
        roomStore.ownPlayer?.isAlive === false),
    ),
);
const roleImage = computed(() =>
  isRoleFaceUp.value && role.value ? role.value.image : roleBackImage,
);

function openRole(canOpen) {
  if (!role.value || !canOpen) return;

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
    :aria-disabled="!canOpen"
    :disabled="!role"
    aria-label="Посмотреть роль"
    @click.stop="openRole(canOpen)"
  >
    <img :src="resolveAssetUrl(roleImage)" alt="" />
  </button>

  <div
    v-if="isOpen"
    class="card-preview-overlay role-card-overlay"
    @click.stop="closeRole"
  >
    <button
      class="card-preview-surface role-card-preview"
      type="button"
      :aria-label="role?.label"
      @click.stop="closeRole"
    >
      <span class="role-card-preview__inner">
        <img
          class="role-card-preview__back"
          :src="resolveAssetUrl(roleBackImage)"
          alt=""
        />
        <img
          class="role-card-preview__front"
          :src="resolveAssetUrl(role?.image)"
          :alt="role?.label"
        />
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

.role-card-button[aria-disabled="true"] {
  cursor: default;
}

.role-card-button img {
  width: 100%;
  height: auto;
  border-radius: 6px;
}

.role-card-preview {
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
