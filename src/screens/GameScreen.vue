<script setup>
import PlayZone from "../components/PlayZone.vue";
import BottomPanel from "../components/BottomPanel.vue";
import BulletStack from "../components/BulletStack.vue";
import PlayerList from "../components/PlayerList.vue";
import RoleCardButton from "../components/RoleCardButton.vue";
import { useRoomStore } from "../stores/roomStore.js";

const roomStore = useRoomStore();
</script>

<template>
  <main class="app" @click="roomStore.cancelSelectedCard">
    <div class="game-top">
      <p v-if="roomStore.room.game?.winnerText" class="game-result">
        {{ roomStore.room.game.winnerText }}
      </p>
      <PlayerList />
    </div>
    <PlayZone title="Стол" variant="table">
      <BulletStack />
      <RoleCardButton />
    </PlayZone>
    <BottomPanel />
  </main>
</template>

<style scoped>
.game-top {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.game-result {
  margin: 0;
  border: 1px dashed var(--line);
  border-radius: 6px;
  padding: 8px;
  background: var(--gold);
  color: var(--ink);
  font-size: 18px;
  line-height: 1;
}
</style>
