<script setup>
defineProps({
  card: {
    type: Object,
    required: true,
  },
});
</script>

<template>
  <span class="game-card-visual">
    <img class="game-card-visual__image" :src="card.image" :alt="card.title" />
    <span v-if="card.rank && card.suit" class="game-card-visual__corner">
      <span class="game-card-visual__rank" :style="{ color: card.suit.color }">
        {{ card.rank.label }}
      </span>
      <img
        class="game-card-visual__suit"
        :src="card.suit.image"
        :alt="card.suit.label"
      />
    </span>
  </span>
</template>

<style scoped>
.game-card-visual {
  position: relative;
  display: block;
  width: 100%;
  border-radius: 6px;
}

.game-card-visual__image {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 6px;
  object-fit: contain;
}

.game-card-visual__corner {
  position: absolute;
  left: 6%;
  bottom: 3%;
  display: flex;
  justify-items: center;
  min-width: 16%;
  pointer-events: none;
}

.game-card-visual__rank {
  font-size: calc(var(--card-width) * 0.15);
  font-weight: 700;
  line-height: 1;
  text-shadow: 0 1px 0 rgba(243, 241, 219, 0.42);
}

.game-card-visual__suit {
  width: calc(var(--card-width) * 0.12);
  height: auto;
  object-fit: contain;
}
</style>
