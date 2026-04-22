<script setup>
import { computed, ref } from "vue";
import BulletStack from "./BulletStack.vue";
import CardPreview from "./CardPreview.vue";
import CardStrip from "./CardStrip.vue";
import GameCardButton from "./GameCardButton.vue";
import PlayZone from "./PlayZone.vue";
import PlayerTableZone from "./PlayerTableZone.vue";

const props = defineProps({
  canTakeCards: {
    type: Boolean,
    default: false,
  },
  player: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["take-card"]);
const previewCard = ref(null);
const handBacks = computed(() =>
  Array.from({ length: props.player.handCount || 0 }, (_, index) => index),
);
const isRolePublic = computed(() =>
  Boolean(
    props.player.role &&
      (props.player.role.id === "sheriff" ||
        props.player.isRoleRevealed ||
        props.player.isAlive === false),
  ),
);

function openPreview(card) {
  previewCard.value = card;
}

function closePreview() {
  previewCard.value = null;
}

function takeCard(payload) {
  if (!props.canTakeCards) return;

  emit("take-card", payload);
}
</script>

<template>
  <PlayerTableZone
    :attack-range="player.attackRange || 1"
    :can-take-weapon="Boolean(canTakeCards && player.weapon)"
    :role="player.role"
    :role-can-open="isRolePublic"
    :role-face-up="isRolePublic"
    :weapon="player.weapon || null"
    @take-weapon="
      takeCard({
        source: 'weapon',
        targetCardInstanceId: player.weapon?.instanceId,
      })
    "
  >
    <template #lead>
      <BulletStack :player="player" />
    </template>
  </PlayerTableZone>

  <PlayZone title="Постоянные карты" variant="hand">
    <CardStrip
      variant="permanent"
      :empty="(player.blueCards || []).length === 0"
      :transition="false"
      label="Постоянные карты"
    >
      <GameCardButton
        v-for="card in player.blueCards || []"
        :key="card.instanceId"
        :card="card"
        @activate="
          takeCard({
            source: 'blue',
            targetCardInstanceId: card.instanceId,
          })
        "
        @preview="openPreview"
      />
    </CardStrip>
  </PlayZone>

  <PlayZone title="Рука" variant="hand">
    <CardStrip
      variant="hand"
      :empty="handBacks.length === 0"
      :transition="false"
      label="Рука"
    >
      <button
        v-for="handIndex in handBacks"
        :key="handIndex"
        class="card-back-button"
        type="button"
        :disabled="!canTakeCards"
        @click.stop="takeCard({ source: 'hand', handIndex })"
      >
        <img src="/images/cards/cardback.webp" alt="" />
      </button>
    </CardStrip>
  </PlayZone>

  <CardPreview v-if="previewCard" :card="previewCard" @close="closePreview" />
</template>

<style scoped>
.card-back-button {
  flex: 0 0 var(--card-width);
  width: var(--card-width);
  border-radius: 6px;
  background: transparent;
  box-shadow: 0 8px 18px rgba(94, 84, 70, 0.16);
}

.card-back-button:disabled {
  cursor: default;
}

.card-back-button img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 6px;
}
</style>
