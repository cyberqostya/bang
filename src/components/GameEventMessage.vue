<script setup>
import GameEventCardTitle from "./GameEventCardTitle.vue";

const props = defineProps({
  event: {
    type: Object,
    required: true,
  },
  tone: {
    type: String,
    default: "default",
  },
});
const emit = defineEmits(["open-card"]);

function getPlayerLabel(roleId, name) {
  return roleId === "sheriff" ? `Шериф ${name}` : name;
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

function getColorStyle(color) {
  return props.tone === "light" ? null : { color };
}

function getDrawnCardStyle(event) {
  return { color: event.drawnCard?.suit?.color };
}

function openCard(cardId) {
  emit("open-card", cardId);
}
</script>

<template>
  <span
    class="game-event-message"
    :class="{ 'game-event-message_light': props.tone === 'light' }"
  >
    <template v-if="event.type === 'card'">
      <span class="game-event-message__player">
        {{ getPlayerLabel(event.actorRoleId, event.actorName) }}
      </span>
      <span class="game-event-message__separator"> -- </span>
      <GameEventCardTitle
        :card-id="event.cardId"
        :title="event.cardTitle"
        :color="event.cardColor"
        :interactive="props.tone !== 'light'"
        :tone="props.tone"
        @open-card="openCard"
      />
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
      <span>{{ event.cardTitle }}</span>
    </template>

    <template v-else-if="event.type === 'equip'">
      <span class="game-event-message__player">
        {{ getPlayerLabel(event.actorRoleId, event.actorName) }}
      </span>
      <span class="game-event-message__separator"> -- </span>
      <span>оружие</span>
      <span class="game-event-message__separator"> -- </span>
      <GameEventCardTitle
        :card-id="event.cardId"
        :title="event.cardTitle"
        :color="event.cardColor"
        :interactive="props.tone !== 'light'"
        :tone="props.tone"
        @open-card="openCard"
      />
    </template>

    <template v-else-if="event.type === 'propertyUse'">
      <span class="game-event-message__player">
        {{ getPlayerLabel(event.actorRoleId, event.actorName) }}
      </span>
      <span> активировал свойство </span>
      <GameEventCardTitle
        :card-id="event.cardId"
        :title="event.cardTitle"
        :color="event.cardColor"
        :interactive="props.tone !== 'light'"
        :tone="props.tone"
        @open-card="openCard"
      />
    </template>

    <template v-else-if="event.type === 'reaction'">
      <span class="game-event-message__player">
        {{ getPlayerLabel(event.actorRoleId, event.actorName) }}
      </span>
      <span class="game-event-message__separator"> -- </span>
      <GameEventCardTitle
        :card-id="event.cardId"
        :title="event.cardTitle"
        :color="event.cardColor"
        :interactive="props.tone !== 'light'"
        :tone="props.tone"
        @open-card="openCard"
      />
    </template>

    <template
      v-else-if="event.type === 'barrelCheck' || event.type === 'turnCheck'"
    >
      <span class="game-event-message__player">
        {{ getPlayerLabel(event.actorRoleId, event.actorName) }}
      </span>
      <span class="game-event-message__separator"> -- </span>
      <span>проверка </span>
      <GameEventCardTitle
        :card-id="event.checkCardId"
        :title="getCheckCardTitle(event)"
        :color="getCheckCardColor(event)"
        :interactive="props.tone !== 'light'"
        :tone="props.tone"
        @open-card="openCard"
      />
      <span class="game-event-message__separator"> -- </span>
      <span>{{ getCheckResultTitle(event) }}</span>
      <span class="game-event-message__separator"> -- </span>
      <span>вытянул карту </span>
      <span
        class="game-event-message__check-drawn"
        :style="getDrawnCardStyle(event)"
      >
        <span>{{ event.drawnCard?.title }}</span>
        <span>-</span>
        <span>
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
          :style="getColorStyle(event.damageColor)"
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
      <GameEventCardTitle
        :card-id="event.cardId"
        :title="event.cardTitle"
        :color="event.cardColor"
        :interactive="props.tone !== 'light'"
        :tone="props.tone"
        @open-card="openCard"
      />
    </template>

    <template v-else-if="event.type === 'cardDraw'">
      <span class="game-event-message__player">
        {{ getPlayerLabel(event.actorRoleId, event.actorName) }}
      </span>
      <span class="game-event-message__separator"> -- </span>
      <GameEventCardTitle
        :card-id="event.cardId"
        :title="event.cardTitle"
        :color="event.cardColor"
        :interactive="props.tone !== 'light'"
        :tone="props.tone"
        @open-card="openCard"
      />
      <span class="game-event-message__separator"> -- </span>
      <span>взял {{ event.cardsCount }} карты</span>
    </template>

    <template v-else-if="event.type === 'heal'">
      <span class="game-event-message__player">
        {{ getPlayerLabel(event.actorRoleId, event.actorName) }}
      </span>
      <span class="game-event-message__separator"> -- </span>
      <GameEventCardTitle
        :card-id="event.cardId"
        :title="event.cardTitle"
        :color="event.cardColor"
        :interactive="props.tone !== 'light'"
        :tone="props.tone"
        @open-card="openCard"
      />
      <span class="game-event-message__separator"> -- </span>
      <span
        class="game-event-message__heal"
        :style="getColorStyle(event.cardColor)"
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
        :style="getColorStyle(event.cardColor)"
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

.game-event-message_light,
.game-event-message_light .game-event-message__player,
.game-event-message_light .game-event-message__separator,
.game-event-message_light .game-event-message__check-source,
.game-event-message_light .game-event-message__damage {
  color: #fff;
}

.game-event-message__player {
  font-weight: 600;
}

.game-event-message__card {
  font-weight: 600;
}

.game-event-message__role {
  color: #7500f1;
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
