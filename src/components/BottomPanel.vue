<script setup>
import { computed, ref } from "vue";
import { useCardLeaveAnimation } from "../composables/useCardLeaveAnimation.js";
import CardPreview from "./CardPreview.vue";
import CardStrip from "./CardStrip.vue";
import HandCard from "./HandCard.vue";
import PlayZone from "./PlayZone.vue";
import { useRoomStore } from "../stores/roomStore.js";

const roomStore = useRoomStore();
const handCards = computed(() => roomStore.ownHand);
const previewCard = ref(null);
const { freezeLeavingCard } = useCardLeaveAnimation();

function handleCardTap(card) {
  if (roomStore.isPayingCharacterAbility) {
    roomStore.selectCard(card.instanceId);
    return;
  }

  if (roomStore.isDiscardingCards || card.isPlayable) {
    roomStore.selectCard(card.instanceId);
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
  <PlayZone title="Рука" variant="hand">
    <CardStrip
      variant="hand"
      :empty="handCards.length === 0"
      :items-key="handCards.map((card) => card.instanceId).join(':')"
      :duration="{ enter: 360, leave: 680 }"
      @before-leave="freezeLeavingCard"
      label="Рука"
    >
      <HandCard
        v-for="card in handCards"
        :key="card.instanceId"
        :card="card"
        :is-selected="roomStore.selectedCardId === card.instanceId"
        :is-disabled="
          card.isBlockedByTurnRule &&
          card.cardId !== 'bang' &&
          !roomStore.isDiscardingCards &&
          !roomStore.isPayingCharacterAbility
        "
        :can-select="
          card.isPlayable ||
          roomStore.isDiscardingCards ||
          roomStore.isPayingCharacterAbility
        "
        :is-discarding="
          roomStore.isDiscardingCards || roomStore.isPayingCharacterAbility
        "
        @preview="openPreview"
        @select="handleCardTap(card)"
      />
    </CardStrip>

    <CardPreview v-if="previewCard" :card="previewCard" @close="closePreview" />
  </PlayZone>
</template>
