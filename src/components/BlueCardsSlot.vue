<script setup>
import { computed, ref } from "vue";
import { useCardLeaveAnimation } from "../composables/useCardLeaveAnimation.js";
import { useRoomStore } from "../stores/roomStore.js";
import CardPreview from "./CardPreview.vue";
import CardStrip from "./CardStrip.vue";
import HandCard from "./HandCard.vue";
import PlayZone from "./PlayZone.vue";

const roomStore = useRoomStore();
const previewCard = ref(null);
const pendingReaction = computed(
  () => roomStore.room.game?.pendingReaction || null,
);
const turnCheck = computed(() => roomStore.room.game?.turnCheck || null);
const isReactionTarget = computed(
  () =>
    pendingReaction.value?.targetPlayerId === roomStore.playerId ||
    pendingReaction.value?.targetPlayerIds?.includes(roomStore.playerId),
);
const canCheckBarrel = computed(
  () =>
    isReactionTarget.value &&
    ["bang", "gatling"].includes(pendingReaction.value?.sourceAction) &&
    !pendingReaction.value?.barrelChecks?.[roomStore.playerId],
);
const canCheckTurnCard = computed(
  () =>
    turnCheck.value?.playerId === roomStore.playerId &&
    roomStore.room.game?.turnPlayerId === roomStore.playerId,
);
const { freezeLeavingCard } = useCardLeaveAnimation();

function handleCardTap(card) {
  if (roomStore.isDiscardingCards) return;

  if (
    canCheckTurnCard.value &&
    card.instanceId === turnCheck.value?.cardInstanceId
  ) {
    roomStore.checkTurnBlueCard(card.instanceId);
    return;
  }

  if (card.cardId === "barrel" && canCheckBarrel.value) {
    roomStore.checkBarrel();
  }
}

function openPreview(card) {
  previewCard.value = card;
}

function closePreview() {
  previewCard.value = null;
}
</script>

<template>
  <PlayZone title="Постоянные карты" variant="hand">
    <CardStrip
      variant="permanent"
      :empty="(roomStore.ownPlayer?.blueCards || []).length === 0"
      :items-key="
        (roomStore.ownPlayer?.blueCards || [])
          .map((card) => card.instanceId)
          .join(':')
      "
      :duration="{ enter: 360, leave: 680 }"
      @before-leave="freezeLeavingCard"
      label="Постоянные карты"
    >
      <HandCard
        v-for="card in roomStore.ownPlayer?.blueCards || []"
        :key="card.instanceId"
        :card="card"
        :is-attention="card.instanceId === turnCheck?.cardInstanceId"
        @preview="openPreview"
        @select="handleCardTap(card)"
      />
    </CardStrip>
    <CardPreview v-if="previewCard" :card="previewCard" @close="closePreview" />
  </PlayZone>
</template>
