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

@media (width >=600px) {
  .app-screen {
    border-left: 1px dashed var(--line);
    border-right: 1px dashed var(--line);
  }
}
</style>
