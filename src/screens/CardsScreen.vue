<script setup>
import { computed, ref, watch } from "vue";
import { cardConfig } from "../../shared/cardConfig.js";
import { characterConfig } from "../../shared/characterConfig.js";
import { createDeck } from "../../server/cards.js";
import AppButton from "../components/AppButton.vue";
import AppInput from "../components/AppInput.vue";
import CardPreview from "../components/CardPreview.vue";
import GameCardButton from "../components/GameCardButton.vue";
import { useAppHeader } from "../composables/useAppHeader.js";
import { navigateBack, navigateTo } from "../utils/navigation.js";
import { resolveAssetUrl } from "../utils/assets.js";

const props = defineProps({
  selectedCardId: {
    type: String,
    default: "",
  },
});

const search = ref("");
const previewCard = ref(null);
const gameCards = Object.values(cardConfig).map((card) => ({
  ...card,
  cardId: card.id,
  instanceId: `catalog-${card.id}`,
}));
const characterCards = Object.values(characterConfig).map((character) => ({
  ...character,
  cardId: character.id,
  instanceId: `character-${character.id}`,
}));
const deckCardsByCardId = createDeck().reduce((map, deckCard) => {
  const cards = map.get(deckCard.cardId) || [];

  cards.push(deckCard);
  map.set(deckCard.cardId, cards);

  return map;
}, new Map());

const allCatalogCards = computed(() => [...gameCards, ...characterCards]);
const previewDeckCards = computed(() =>
  previewCard.value ? deckCardsByCardId.get(previewCard.value.id) || [] : [],
);
const filteredGameCards = computed(() => {
  const query = search.value.trim().toLowerCase();

  if (!query) return gameCards;

  return gameCards.filter((card) =>
    [card.title, card.eventTitle, card.id]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query)),
  );
});
const filteredCharacterCards = computed(() => {
  const query = search.value.trim().toLowerCase();

  if (!query) return characterCards;

  return characterCards.filter((card) =>
    [card.title, card.id]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query)),
  );
});

watch(
  () => props.selectedCardId,
  (cardId) => {
    previewCard.value =
      allCatalogCards.value.find((card) => card.id === cardId) || null;
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

useAppHeader(
  computed(() => ({
    leftButton: {
      label: "Назад",
      variant: "muted",
      onClick: () => navigateBack("/"),
    },
  })),
);
</script>

<template>
  <div class="cards-screen">
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

      <div class="cards-catalog" aria-label="Все карты">
        <section v-if="filteredGameCards.length" class="cards-section">
          <h2 class="cards-section__title">Игровые</h2>
          <div class="cards-grid" aria-label="Игровые карты">
            <GameCardButton
              v-for="card in filteredGameCards"
              :key="card.id"
              :card="card"
              @activate="openPreview"
              @preview="openPreview"
              style="width: 100%"
            />
          </div>
        </section>

        <section v-if="filteredCharacterCards.length" class="cards-section">
          <h2 class="cards-section__title">Персонажи</h2>
          <div class="cards-grid" aria-label="Карты персонажей">
            <GameCardButton
              v-for="card in filteredCharacterCards"
              :key="card.id"
              :card="card"
              @activate="openPreview"
              @preview="openPreview"
              style="width: 100%"
            />
          </div>
        </section>
      </div>
    </section>

    <CardPreview
      v-if="previewCard"
      :card="previewCard"
      :has-details="previewDeckCards.length > 0"
      @close="closePreview"
    >
      <template v-if="previewDeckCards.length">
        <p class="card-preview-details__line">
          Карт в колоде: {{ previewDeckCards.length }}
        </p>
        <div class="card-preview-details__line">
          <span>Карты:</span>
          <span class="card-preview-details__cards">
            <span
              v-for="deckCard in previewDeckCards"
              :key="deckCard.instanceId"
              class="card-preview-details__chip"
            >
              <span :style="{ color: deckCard.suit.color }">
                {{ deckCard.rank.label }}
              </span>
              <img
                :src="resolveAssetUrl(deckCard.suit.image)"
                :alt="deckCard.suit.label"
              />
              <span
                v-if="deckCard !== previewDeckCards.at(-1)"
                class="card-preview-details__comma"
                aria-hidden="true"
              >
                ,
              </span>
            </span>
          </span>
        </div>
      </template>
    </CardPreview>
  </div>
</template>

<style scoped>
.cards-screen {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  height: 100%;
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
}

.cards-search__clear {
  margin-left: 5px;
}

.cards-catalog {
  display: grid;
  align-content: start;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  scrollbar-width: thin;
  scrollbar-color: rgba(94, 84, 70, 0.5) rgba(94, 84, 70, 0.12);
}

.cards-section {
  display: grid;
  gap: 8px;
  min-width: 0;
  margin-top: 16px;
}

.cards-section__title {
  margin: 0;
  color: var(--muted);
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--card-width), 1fr));
  align-content: start;
  justify-items: center;
  gap: 10px 6px;
  min-width: 0;
}

.card-preview-details__line {
  margin: 0;
  line-height: 1.3;
}

.card-preview-details__cards {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-left: 6px;
}

.card-preview-details__chip {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.card-preview-details__chip img {
  width: 12px;
  height: 12px;
  object-fit: contain;
}

.card-preview-details__comma {
  color: var(--muted);
}
</style>
