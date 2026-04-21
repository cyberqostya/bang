<script setup>
import { computed, ref, watch } from "vue";
import { cardConfig } from "../../shared/cardConfig.js";
import AppButton from "../components/AppButton.vue";
import AppHeader from "../components/AppHeader.vue";
import AppInput from "../components/AppInput.vue";
import AppScreen from "../components/AppScreen.vue";
import CardPreview from "../components/CardPreview.vue";
import GameCardButton from "../components/GameCardButton.vue";
import { navigateBack, navigateTo } from "../utils/navigation.js";

const props = defineProps({
  selectedCardId: {
    type: String,
    default: "",
  },
});

const search = ref("");
const previewCard = ref(null);
const cards = Object.values(cardConfig).map((card) => ({
  ...card,
  cardId: card.id,
  instanceId: `catalog-${card.id}`,
}));
const filteredCards = computed(() => {
  const query = search.value.trim().toLowerCase();

  if (!query) return cards;

  return cards.filter((card) =>
    [card.title, card.eventTitle, card.id]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query)),
  );
});

watch(
  () => props.selectedCardId,
  (cardId) => {
    previewCard.value = cards.find((card) => card.id === cardId) || null;
  },
  { immediate: true },
);

function clearSearch() {
  search.value = "";
}

function openPreview(card) {
  previewCard.value = card;
  navigateTo(`/cards?card=${encodeURIComponent(card.id)}`, { replace: true });
}

function closePreview() {
  previewCard.value = null;
  navigateTo("/cards", { replace: true });
}
</script>

<template>
  <AppScreen class="cards-screen">
    <AppHeader>
      <template #left>
        <AppButton
          variant="muted"
          size="header"
          type="button"
          @click="navigateBack('/')"
        >
          Назад
        </AppButton>
      </template>
    </AppHeader>

    <section class="cards-screen__content" aria-label="База карт">
      <div class="cards-search">
        <AppInput
          v-model="search"
          type="search"
          size="search"
          placeholder="Поиск карты"
          aria-label="Поиск карты"
        />
        <AppButton
          v-if="search"
          class="cards-search__clear"
          variant="muted"
          size="header"
          type="button"
          @click="clearSearch"
        >
          Стереть
        </AppButton>
      </div>

      <div class="cards-grid" aria-label="Все карты">
        <GameCardButton
          v-for="card in filteredCards"
          :key="card.id"
          :card="card"
          @activate="openPreview"
          @preview="openPreview"
        />
      </div>
    </section>

    <CardPreview v-if="previewCard" :card="previewCard" @close="closePreview" />
  </AppScreen>
</template>

<style scoped>
.cards-screen {
  grid-template-rows: auto minmax(0, 1fr);
}

.cards-screen__content {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  padding: 5px;
}

.cards-search {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  min-width: 0;
  padding-bottom: 5px;
}

.cards-search__clear {
  margin-left: 5px;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--card-width), 1fr));
  align-content: start;
  justify-items: center;
  gap: 10px 6px;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  scrollbar-width: thin;
  scrollbar-color: rgba(94, 84, 70, 0.5) rgba(94, 84, 70, 0.12);
}
</style>
