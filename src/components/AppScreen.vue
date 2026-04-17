<template>
  <main class="app-screen">
    <slot />
  </main>
</template>

<style scoped>
.app-screen {
  position: fixed;
  inset: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(100%, 600px);
  height: 100dvh;
  margin-inline: auto;
  overflow: hidden;
  background: var(--page-back);
}

.app-screen > * {
  min-width: 0;
}
</style>
