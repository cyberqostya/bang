<script setup>
import PlayZone from "../components/PlayZone.vue";
import BottomPanel from "../components/BottomPanel.vue";
import BulletStack from "../components/BulletStack.vue";
import PlayerList from "../components/PlayerList.vue";
</script>

<template>
  <main class="app">
    <PlayerList />
    <PlayZone title="Стол">
      <BulletStack />
    </PlayZone>
    <BottomPanel />
  </main>
</template>
