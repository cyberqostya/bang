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
      <button class="app-header__coin" type="button" aria-label="Монета">
        <img src="/images/coin.webp" alt="" />
      </button>
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

.app-header__coin {
  position: relative;
  flex: 0 0 auto;
  width: 42px;
  height: 100%;
  overflow: hidden;
  border-radius: 50%;
  animation: coin-float 12s ease-in-out infinite;
}

.app-header__coin::after {
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
  animation: coin-shine 12s ease-in-out infinite;
}

.app-header__coin img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

@keyframes coin-float {
  0%,
  16%,
  100% {
    transform: translateY(0) rotate(-2deg);
  }

  8% {
    transform: translateY(-4px) rotate(2deg);
  }

  45% {
    transform: translateY(-1px) rotate(-0.6deg);
  }

  72% {
    transform: translateY(1px) rotate(0.6deg);
  }
}

@keyframes coin-shine {
  0% {
    transform: translateX(-70%) rotate(18deg);
  }

  16% {
    transform: translateX(170%) rotate(18deg);
  }

  16.01%,
  100% {
    transform: translateX(-70%) rotate(18deg);
  }
}
</style>
