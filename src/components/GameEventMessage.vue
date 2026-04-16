<script setup>
defineProps({
  event: {
    type: Object,
    required: true,
  },
});

function getPlayerLabel(roleId, name) {
  return roleId === "sheriff" ? `Шериф ${name}` : name;
}
</script>

<template>
  <span class="game-event-message">
    <template v-if="event.type === 'card'">
      <span class="game-event-message__player">
        {{ getPlayerLabel(event.actorRoleId, event.actorName) }}
      </span>
      <span class="game-event-message__separator"> -- </span>
      <span
        class="game-event-message__card"
        :style="{ color: event.cardColor }"
      >
        {{ event.cardTitle }}
      </span>
      <span class="game-event-message__separator"> -- </span>
      <span class="game-event-message__player">
        {{ getPlayerLabel(event.targetRoleId, event.targetName) }}
      </span>
    </template>

    <template v-else-if="event.type === 'discard'">
      <span class="game-event-message__player">
        {{ getPlayerLabel(event.actorRoleId, event.actorName) }}
      </span>
      <span class="game-event-message__separator"> -- </span>
      <span>сброс</span>
      <span class="game-event-message__separator"> -- </span>
      <span
        class="game-event-message__card"
        :style="{ color: event.cardColor }"
      >
        {{ event.cardTitle }}
      </span>
    </template>

    <template v-else-if="event.type === 'death'">
      <span class="game-event-message__player">
        {{ getPlayerLabel(event.playerRoleId, event.playerName) }}
      </span>
      <span> умер, его роль была </span>
      <span class="game-event-message__role">{{ event.roleLabel }}</span>
    </template>

    <template v-else-if="event.type === 'turn'">
      <span>Ход </span>
      <span class="game-event-message__player">
        {{ getPlayerLabel(event.playerRoleId, event.playerName) }}
      </span>
    </template>

    <template v-else>
      {{ event.text }}
    </template>
  </span>
</template>

<style scoped>
.game-event-message {
  min-width: 0;
}

.game-event-message__player {
  color: var(--ink);
}

.game-event-message__card {
  color: var(--red);
}

.game-event-message__role {
  text-decoration: underline;
}

.game-event-message__separator {
  color: var(--muted);
}
</style>
