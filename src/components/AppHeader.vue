<script setup>
import CoinButton from "./CoinButton.vue";
</script>

<template>
  <header class="app-header">
    <div class="app-header__side">
      <slot name="left" />
    </div>
    <div class="app-header__center">
      <slot name="center" />
    </div>
    <div class="app-header__side app-header__side_right">
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
</style>
