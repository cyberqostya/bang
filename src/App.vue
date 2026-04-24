<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import AppHeader from "./components/AppHeader.vue";
import AppScreen from "./components/AppScreen.vue";
import CardsScreen from "./screens/CardsScreen.vue";
import GameScreen from "./screens/GameScreen.vue";
import RoomsScreen from "./screens/RoomsScreen.vue";
import SeatsScreen from "./screens/SeatsScreen.vue";
import { appHeaderState } from "./composables/useAppHeader.js";
import { useRoomStore } from "./stores/roomStore.js";
import { getCurrentRoute, navigateTo } from "./utils/navigation.js";

const roomStore = useRoomStore();
const route = ref(getCurrentRoute());
const isCardsRoute = computed(() => route.value.path === "/cards");
const selectedCatalogCardId = computed(
  () => route.value.query.get("card") || "",
);
const isOwnReactionTarget = computed(() => {
  const pendingReaction = roomStore.room.game?.pendingReaction;

  return Boolean(
    pendingReaction?.targetPlayerId === roomStore.playerId ||
      pendingReaction?.targetPlayerIds?.includes(roomStore.playerId),
  );
});
const isOwnCheckChoicePicker = computed(
  () => roomStore.room.game?.pendingCheckChoice?.playerId === roomStore.playerId,
);
const shouldReturnFromCardsToGame = computed(
  () =>
    isCardsRoute.value &&
    roomStore.screen === "game" &&
    (roomStore.isMyTurn ||
      roomStore.isDiscardingCards ||
      roomStore.room.game?.generalStore ||
      isOwnCheckChoicePicker.value ||
      roomStore.hasOwnTurnCheck ||
      isOwnReactionTarget.value),
);

onMounted(() => {
  window.addEventListener("app:navigate", syncRoute);
  window.addEventListener("popstate", syncRoute);

  roomStore.connect();
});

onBeforeUnmount(() => {
  window.removeEventListener("app:navigate", syncRoute);
  window.removeEventListener("popstate", syncRoute);
});

function syncRoute() {
  route.value = getCurrentRoute();
}

watch(shouldReturnFromCardsToGame, (shouldReturn) => {
  if (!shouldReturn) return;

  navigateTo("/", { replace: true });
});
</script>

<template>
  <div class="app-shell">
    <AppScreen>
      <AppHeader
        :center-text="appHeaderState.centerText"
        :left-button="appHeaderState.leftButton"
        :right-button="appHeaderState.rightButton"
      />
      <CardsScreen
        v-if="isCardsRoute"
        :selected-card-id="selectedCatalogCardId"
      />
      <RoomsScreen v-else-if="roomStore.screen === 'rooms'" />
      <SeatsScreen v-else-if="roomStore.screen === 'seats'" />
      <GameScreen v-else />
    </AppScreen>
  </div>
</template>

<style scoped>
.app-shell {
  position: fixed;
  inset: 0;
  width: min(100%, 600px);
  height: 100dvh;
  margin-inline: auto;
  overflow: hidden;
  background: var(--page-back);
}
</style>
