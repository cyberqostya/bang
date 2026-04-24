<script setup>
import { computed, ref } from "vue";
import { useRoomStore } from "../stores/roomStore.js";
import { resolveAssetUrl } from "../utils/assets.js";
import CardPreview from "./CardPreview.vue";
import GameCardButton from "./GameCardButton.vue";

const props = defineProps({
  character: {
    type: Object,
    default: undefined,
  },
});

const roomStore = useRoomStore();
const previewCharacter = ref(null);
const character = computed(() =>
  props.character === undefined
    ? roomStore.ownPlayer?.character || null
    : props.character,
);
const isOwnCharacter = computed(() => props.character === undefined);
const isCharacterAbilityActive = computed(
  () =>
    isOwnCharacter.value &&
    roomStore.ownPlayer?.activeCharacterAbility?.characterId ===
      character.value?.id,
);
const canActivateCharacter = computed(
  () =>
    isOwnCharacter.value &&
    character.value?.ability?.trigger === "activate" &&
    roomStore.ownPlayer?.isAlive !== false,
);

function handleActivate() {
  if (!canActivateCharacter.value) return;

  roomStore.activateCharacterAbility();
}

function openPreview(card) {
  previewCharacter.value = card;
}

function closePreview() {
  previewCharacter.value = null;
}
</script>

<template>
  <div v-if="!character" class="character-slot" aria-label="Персонаж">
    <img :src="resolveAssetUrl('/images/chars.webp')" alt="" />
  </div>

  <GameCardButton
    v-else
    class="character-slot__card"
    :card="character"
    :is-aria-disabled="!canActivateCharacter"
    :is-attention="isCharacterAbilityActive"
    @activate="handleActivate"
    @preview="openPreview"
  />

  <CardPreview
    v-if="previewCharacter"
    :card="previewCharacter"
    @close="closePreview"
  />
</template>

<style scoped>
.character-slot {
  display: grid;
  place-items: center;
  flex: 0 0 var(--card-width);
  width: var(--card-width);
  aspect-ratio: 0.625;
  border: 1px dashed #5e5446;
  border-radius: 6px;
  padding: 7px;
  background: rgba(243, 241, 219, 0.4);
  overflow: hidden;
}

.character-slot img {
  width: 92%;
  height: auto;
  opacity: 0.88;
  object-fit: contain;
}

.character-slot__card {
  flex: 0 0 var(--card-width);
}

.character-slot__card[aria-disabled="false"] {
  cursor: pointer;
}
</style>
