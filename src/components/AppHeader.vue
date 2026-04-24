<script setup>
import AppButton from "./AppButton.vue";
import CoinButton from "./CoinButton.vue";

defineProps({
  centerText: {
    type: String,
    default: "",
  },
  leftButton: {
    type: Object,
    default: null,
  },
  rightButton: {
    type: Object,
    default: null,
  },
});
</script>

<template>
  <header class="app-header">
    <div class="app-header__side">
      <AppButton
        v-if="leftButton"
        :variant="leftButton.variant || 'muted'"
        size="header"
        type="button"
        :disabled="Boolean(leftButton.disabled)"
        @click="leftButton.onClick?.()"
      >
        {{ leftButton.label }}
      </AppButton>
      <slot name="left" />
    </div>
    <div class="app-header__center">
      <span v-if="centerText" class="app-header__title">{{ centerText }}</span>
      <slot name="center" />
    </div>
    <div class="app-header__side app-header__side_right">
      <AppButton
        v-if="rightButton"
        :variant="rightButton.variant || 'muted'"
        size="header"
        type="button"
        :disabled="Boolean(rightButton.disabled)"
        @click="rightButton.onClick?.()"
      >
        {{ rightButton.label }}
      </AppButton>
      <slot name="right" />
      <CoinButton />
    </div>
  </header>
</template>

<style scoped>
.app-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 5px;
  width: 100%;
  height: 53px;
  min-width: 0;
  padding: 5px;
  border-bottom: 1px dashed var(--line);
  background: var(--page-back);
}

.app-header__side,
.app-header__center {
  display: flex;
  align-items: center;
  height: 100%;
  min-width: 0;
}

.app-header__center {
  justify-content: center;
}

.app-header__side_right {
  justify-content: flex-end;
  gap: 5px;
}

.app-header__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink);
  font-size: 18px;
  font-weight: 600;
}
</style>
