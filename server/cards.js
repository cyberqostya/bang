import { cardConfig } from "../shared/cardConfig.js";

export { cardConfig };

export const suitConfig = {
  clubs: {
    id: "clubs",
    shortId: "c",
    label: "Трефы",
    image: "/images/suits/clubs.webp",
    color: "#1d1d1d",
  },
  diamonds: {
    id: "diamonds",
    shortId: "d",
    label: "Бубны",
    image: "/images/suits/diamonds.webp",
    color: "#e02826",
  },
  hearts: {
    id: "hearts",
    shortId: "h",
    label: "Червы",
    image: "/images/suits/hearts.webp",
    color: "#e02826",
  },
  spades: {
    id: "spades",
    shortId: "s",
    label: "Пики",
    image: "/images/suits/spades.webp",
    color: "#1d1d1d",
  },
};

const suitByShortId = Object.fromEntries(
  Object.values(suitConfig).map((suit) => [suit.shortId, suit]),
);

const rankConfig = {
  A: {
    id: "ace",
    label: "A",
  },
  J: {
    id: "jack",
    label: "J",
  },
  Q: {
    id: "queen",
    label: "Q",
  },
  K: {
    id: "king",
    label: "K",
  },
};

const bangCards = [
  "Ad",
  "10d",
  "Qd",
  "5c",
  "2c",
  "Qh",
  "9c",
  "Kd",
  "6d",
  "4c",
  "As",
  "9d",
  "7c",
  "8d",
  "Jd",
  "2d",
  "7d",
  "6c",
  "Ah",
  "8c",
  "Kh",
  "3d",
  "4d",
  "5d",
  "3c",
];

const missedCards = [
  "2s",
  "Kc",
  "8s",
  "7s",
  "Jc",
  "3s",
  "10c",
  "6s",
  "4s",
  "5s",
  "Qc",
  "Ac",
];

const beerCards = ["8h", "Jh", "6h", "10h", "9h", "7h"];
const gatlingCards = ["10h"];
const indiansCards = ["Ad", "Kd"];
const duelCards = ["Js", "8c", "Qd"];
const panicCards = ["8d", "Qh", "Ah", "Jh"];
const catbalouCards = ["Jd", "9d", "10d", "Kh"];
const saloonCards = ["5h"];
const stagecoachCards = ["9s", "9s"];
const wellsFargoCards = ["3h"];
const generalStoreCards = ["Qs", "9c"];

const weaponCards = [
  ["remington", "Kc"],
  ["carbine", "Ac"],
  ["winchester", "8s"],
  ["scofield", "Ks"],
  ["scofield", "Qc"],
  ["scofield", "Jc"],
  ["volcanic", "10c"],
  ["volcanic", "10s"],
];

const blueCards = [
  ["scope", "As"],
  ["mustang", "8h"],
  ["mustang", "9h"],
  ["barrel", "Ks"],
  ["barrel", "Qs"],
  ["jail", "4h"],
  ["jail", "Js"],
  ["jail", "10s"],
  ["dynamite", "2h"],
];

export function createDeck() {
  return [
    ...bangCards.map((cardCode, index) =>
      createDeckCard("bang", cardCode, index),
    ),
    ...missedCards.map((cardCode, index) =>
      createDeckCard("missed", cardCode, index),
    ),
    ...beerCards.map((cardCode, index) =>
      createDeckCard("beer", cardCode, index),
    ),
    ...gatlingCards.map((cardCode, index) =>
      createDeckCard("gatling", cardCode, index),
    ),
    ...indiansCards.map((cardCode, index) =>
      createDeckCard("indians", cardCode, index),
    ),
    ...duelCards.map((cardCode, index) =>
      createDeckCard("duel", cardCode, index),
    ),
    ...panicCards.map((cardCode, index) =>
      createDeckCard("panic", cardCode, index),
    ),
    ...catbalouCards.map((cardCode, index) =>
      createDeckCard("catbalou", cardCode, index),
    ),
    ...saloonCards.map((cardCode, index) =>
      createDeckCard("saloon", cardCode, index),
    ),
    ...stagecoachCards.map((cardCode, index) =>
      createDeckCard("stagecoach", cardCode, index),
    ),
    ...wellsFargoCards.map((cardCode, index) =>
      createDeckCard("wellsfargo", cardCode, index),
    ),
    ...generalStoreCards.map((cardCode, index) =>
      createDeckCard("generalstore", cardCode, index),
    ),
    ...weaponCards.map(([cardId, cardCode], index) =>
      createDeckCard(cardId, cardCode, index),
    ),
    ...blueCards.map(([cardId, cardCode], index) =>
      createDeckCard(cardId, cardCode, index),
    ),
  ];
}

function createDeckCard(cardId, cardCode, index) {
  const [, rankCode, suitShortId] = cardCode.match(/^(.+)([cdhs])$/) || [];
  const suit = suitByShortId[suitShortId];
  const rank = rankConfig[rankCode] || {
    id: rankCode,
    label: rankCode,
  };

  return {
    instanceId: `${cardId}-${cardCode.toLowerCase()}-${index + 1}`,
    cardId,
    cardCode,
    rank,
    suit,
  };
}
