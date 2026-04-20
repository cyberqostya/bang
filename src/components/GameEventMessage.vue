<script setup>
defineProps({
  event: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["preview-card"]);

function getPlayerLabel(roleId, name) {
  return roleId === "sheriff" ? `Шериф ${name}` : name;
}

function previewEventCard(card) {
  if (!card) return;

  emit("preview-card", card);
}

function getCheckCardTitle(event) {
  return event.checkCardTitle || event.cardTitle || "";
}

function getCheckCardColor(event) {
  return event.checkCardColor || event.cardColor || "inherit";
}

function getCheckResultTitle(event) {
  if (event.resultTitle) return event.resultTitle;

  return event.isSuccess ? "УСПЕХ" : "ПРОВАЛ";
}
</script>

<template>
  <span class="game-event-message">
    <template v-if="event.type === 'card'">
      <span class="game-event-message__player">
        {{ getPlayerLabel(event.actorRoleId, event.actorName) }}
      </span>
      <span class="game-event-message__separator"> -- </span>
      <button
        v-if="event.previewCard"
        class="game-event-message__card game-event-message__card_preview"
        type="button"
        :style="{ color: event.cardColor }"
        @click.stop="previewEventCard(event.previewCard)"
      >
        {{ event.cardTitle }}
      </button>
      <span
        v-else
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
      <button
        v-if="event.previewCard"
        class="game-event-message__card game-event-message__card_preview"
        type="button"
        :style="{ color: event.cardColor }"
        @click.stop="previewEventCard(event.previewCard)"
      >
        {{ event.cardTitle }}
      </button>
      <span
        v-else
        class="game-event-message__card"
        :style="{ color: event.cardColor }"
      >
        {{ event.cardTitle }}
      </span>
    </template>

    <template v-else-if="event.type === 'equip'">
      <span class="game-event-message__player">
        {{ getPlayerLabel(event.actorRoleId, event.actorName) }}
      </span>
      <span class="game-event-message__separator"> -- </span>
      <span>оружие</span>
      <span class="game-event-message__separator"> -- </span>
      <span
        class="game-event-message__card"
        :style="{ color: event.cardColor }"
      >
        {{ event.cardTitle }}
      </span>
    </template>

    <template v-else-if="event.type === 'propertyUse'">
      <span class="game-event-message__player">
        {{ getPlayerLabel(event.actorRoleId, event.actorName) }}
      </span>
      <span> активировал свойство </span>
      <span
        class="game-event-message__card"
        :style="{ color: event.cardColor }"
      >
        {{ event.cardTitle }}
      </span>
    </template>

    <template v-else-if="event.type === 'reaction'">
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
    </template>

    <template
      v-else-if="event.type === 'barrelCheck' || event.type === 'turnCheck'"
    >
      <span class="game-event-message__player">
        {{ getPlayerLabel(event.actorRoleId, event.actorName) }}
      </span>
      <span class="game-event-message__separator"> -- </span>
      <span>Проверка </span>
      <span
        class="game-event-message__check-source"
        :style="{ color: getCheckCardColor(event) }"
      >
        {{ getCheckCardTitle(event) }}
      </span>
      <span class="game-event-message__separator"> -- </span>
      <span>{{ getCheckResultTitle(event) }}</span>
      <span class="game-event-message__separator"> -- </span>
      <span>вытянул карту </span>
      <span class="game-event-message__check-drawn">
        <span>"</span>
        <span :style="{ color: event.drawnCard?.suit?.color }">
          {{ event.drawnCard?.title }}
        </span>
        <span>-</span>
        <span
          class="game-event-message__check-rank"
          :style="{ color: event.drawnCard?.suit?.color }"
        >
          {{ event.drawnCard?.rank?.label }}
        </span>
        <img
          class="game-event-message__check-suit"
          :src="event.drawnCard?.suit?.image"
          :alt="event.drawnCard?.suit?.label"
        />
      </span>
      <span v-if="event.consequenceText" class="game-event-message__separator">
        --
      </span>
      <span v-if="event.consequenceText">{{ event.consequenceText }}</span>
      <template v-if="event.damageAmount">
        <span class="game-event-message__separator"> -- </span>
        <span
          class="game-event-message__damage"
          :style="{ color: event.damageColor }"
        >
          -{{ event.damageAmount }}HP
        </span>
      </template>
    </template>

    <template v-else-if="event.type === 'cardOnly'">
      <span class="game-event-message__player">
        {{ getPlayerLabel(event.actorRoleId, event.actorName) }}
      </span>
      <span class="game-event-message__separator"> -- </span>
      <button
        v-if="event.previewCard"
        class="game-event-message__card game-event-message__card_preview"
        type="button"
        :style="{ color: event.cardColor }"
        @click.stop="previewEventCard(event.previewCard)"
      >
        {{ event.cardTitle }}
      </button>
      <span
        v-else
        class="game-event-message__card"
        :style="{ color: event.cardColor }"
      >
        {{ event.cardTitle }}
      </span>
    </template>

    <template v-else-if="event.type === 'cardDraw'">
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
      <span>взял {{ event.cardsCount }} карты</span>
    </template>

    <template v-else-if="event.type === 'heal'">
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
      <span
        class="game-event-message__heal"
        :style="{ color: event.cardColor }"
      >
        +{{ event.amount }}HP
      </span>
    </template>

    <template v-else-if="event.type === 'groupHeal'">
      <template v-for="(player, index) in event.players" :key="player.playerId">
        <span v-if="index > 0">, </span>
        <span class="game-event-message__player">
          {{ getPlayerLabel(player.roleId, player.name) }}
        </span>
      </template>
      <span class="game-event-message__separator"> -- </span>
      <span
        class="game-event-message__heal"
        :style="{ color: event.cardColor }"
      >
        +{{ event.amount }}HP
      </span>
    </template>

    <template v-else-if="event.type === 'death'">
      <span class="game-event-message__player">
        {{ getPlayerLabel(event.playerRoleId, event.playerName) }}
      </span>
      <span> умер, его роль была </span>
      <span class="game-event-message__role">{{ event.roleLabel }}</span>
    </template>

    <template v-else-if="event.type === 'healthLoss'">
      <span class="game-event-message__player">
        {{ getPlayerLabel(event.playerRoleId, event.playerName) }}
      </span>
      <span class="game-event-message__separator"> -- </span>
      <span class="game-event-message__damage"> -{{ event.amount }}HP </span>
    </template>

    <template v-else-if="event.type === 'outlawBounty'">
      <span>За убийство бандита, </span>
      <span class="game-event-message__player">
        {{ getPlayerLabel(event.actorRoleId, event.actorName) }}
      </span>
      <span> получает награду: {{ event.cardsCount }} карты</span>
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
  font-weight: 600;
}

.game-event-message__card {
  font-weight: 600;
}

.game-event-message__card_preview {
  border: 0;
  border-radius: 0;
  padding: 0;
  background: transparent;
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: zoom-in;
  display: inline-grid;
}

.game-event-message__role {
  text-decoration: underline;
}

.game-event-message__damage {
  color: var(--red);
  font-weight: 700;
}

.game-event-message__heal {
  font-weight: 700;
}

.game-event-message__check-source {
  font-weight: 600;
}

.game-event-message__check-drawn {
  display: inline-flex;
  align-items: center;
  vertical-align: baseline;
  font-weight: 600;
}

.game-event-message__check-rank {
  font-weight: 700;
}

.game-event-message__check-suit {
  width: auto;
  height: 0.9em;
  object-fit: contain;
}

.game-event-message__separator {
  color: var(--muted);
}
</style>
