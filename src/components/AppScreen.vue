<template>
  <main class="app-screen">
    <slot />
  </main>
</template>

<style scoped>
.app-screen {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.app-screen > * {
  min-width: 0;
}
</style>
