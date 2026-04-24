<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import { resolveAssetUrl } from "../utils/assets.js";

const donationUrl = "https://pay.cloudtips.ru/p/656a5ae1";
const coinImages = [
  "/images/coins/1.webp",
  "/images/coins/2.webp",
  "/images/coins/3.webp",
  "/images/coins/4.webp",
].map(resolveAssetUrl);
const coinIndex = ref(0);
const isFlipping = ref(false);

let cycleTimer = null;
let imageSwapTimer = null;
let flipEndTimer = null;

onMounted(() => {
  preloadCoins();
  cycleTimer = window.setInterval(triggerFlip, 30000);
});

onUnmounted(() => {
  window.clearInterval(cycleTimer);
  window.clearTimeout(imageSwapTimer);
  window.clearTimeout(flipEndTimer);
});

function preloadCoins() {
  coinImages.forEach((src) => {
    const image = new Image();
    image.src = src;
  });
}

function triggerFlip() {
  if (isFlipping.value) return;

  isFlipping.value = true;

  imageSwapTimer = window.setTimeout(() => {
    coinIndex.value = (coinIndex.value + 1) % coinImages.length;
  }, 420);

  flipEndTimer = window.setTimeout(() => {
    isFlipping.value = false;
  }, 900);
}
</script>

<template>
  <a
    class="coin-button"
    :class="{ 'coin-button_flipping': isFlipping }"
    :href="donationUrl"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Поддержать проект"
  >
    <img class="coin-button__image" :src="coinImages[coinIndex]" alt="" />
  </a>
</template>

<style scoped>
.coin-button {
  position: relative;
  display: block;
  flex: 0 0 auto;
  width: 42px;
  height: 100%;
  overflow: hidden;
  border-radius: 50%;
  perspective: 160px;
  -webkit-tap-highlight-color: rgba(94, 84, 70, 0.3);
  animation: coin-float 30s ease-in-out infinite;
}

.coin-button::after {
  content: "";
  position: absolute;
  inset: -35% 55% -35% -55%;
  background: linear-gradient(
    100deg,
    transparent 35%,
    rgba(255, 255, 255, 0.55),
    transparent 65%
  );
  transform: translateX(-70%) rotate(18deg);
  animation: coin-shine 30s ease-in-out infinite;
}

.coin-button__image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform-style: preserve-3d;
}

.coin-button_flipping {
  animation:
    coin-float 30s ease-in-out infinite,
    coin-toss 900ms ease-in-out;
}

.coin-button_flipping .coin-button__image {
  animation: coin-flip 900ms ease-in-out;
}

@keyframes coin-float {
  0%,
  8%,
  100% {
    transform: translateY(0) rotate(-1.4deg);
  }

  18% {
    transform: translateY(-2px) rotate(0.8deg);
  }

  42% {
    transform: translateY(1px) rotate(-0.4deg);
  }

  72% {
    transform: translateY(-1px) rotate(0.5deg);
  }
}

@keyframes coin-shine {
  0%,
  44%,
  100% {
    transform: translateX(-70%) rotate(18deg);
  }

  7%,
  51% {
    transform: translateX(170%) rotate(18deg);
  }

  7.01%,
  51.01% {
    transform: translateX(-70%) rotate(18deg);
  }
}

@keyframes coin-toss {
  0%,
  100% {
    translate: 0 0;
  }

  45% {
    translate: 0 -5px;
  }
}

@keyframes coin-flip {
  0% {
    transform: rotateY(0deg);
  }

  50% {
    transform: rotateY(90deg) scale(0.94);
  }

  100% {
    transform: rotateY(360deg);
  }
}
</style>
