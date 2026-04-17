<template>
  <div class="character-slot" aria-label="Персонаж">
    <img src="/images/chars.webp" alt="" />
  </div>
</template>

<style scoped>
.character-slot {
  display: grid;
  place-items: center;
  flex: 0 0 var(--card-width);
  width: var(--card-width);
  aspect-ratio: 0.625;
  border: 1px dashed #5e5446;
  border-radius: 6px;
  padding: 7px;
  background: rgba(243, 241, 219, 0.4);
  overflow: hidden;
}

.character-slot img {
  width: 92%;
  height: auto;
  opacity: 0.88;
  object-fit: contain;
}
</style>
