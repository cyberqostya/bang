<script setup>
import { onMounted } from "vue";
import GameScreen from "./screens/GameScreen.vue";
import NoticePreviewScreen from "./screens/NoticePreviewScreen.vue";
import RoomsScreen from "./screens/RoomsScreen.vue";
import SeatsScreen from "./screens/SeatsScreen.vue";
import { useRoomStore } from "./stores/roomStore.js";

const roomStore = useRoomStore();
const isNoticePreview =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("preview") === "notices";

onMounted(() => {
  if (isNoticePreview) return;

  roomStore.connect();
});
</script>

<template>
  <NoticePreviewScreen v-if="isNoticePreview" />
  <RoomsScreen v-else-if="roomStore.screen === 'rooms'" />
  <SeatsScreen v-else-if="roomStore.screen === 'seats'" />
  <GameScreen v-else />
</template>
