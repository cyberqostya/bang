<script setup>
import { onMounted } from "vue";
import GameScreen from "./screens/GameScreen.vue";
import RoomsScreen from "./screens/RoomsScreen.vue";
import SeatsScreen from "./screens/SeatsScreen.vue";
import { useRoomStore } from "./stores/roomStore.js";

const roomStore = useRoomStore();

onMounted(() => {
  roomStore.connect();
});
</script>

<template>
  <RoomsScreen v-if="roomStore.screen === 'rooms'" />
  <SeatsScreen v-else-if="roomStore.screen === 'seats'" />
  <GameScreen v-else />
</template>
