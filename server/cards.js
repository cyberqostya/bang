export const cardConfig = {
  bang: {
    id: "bang",
    title: "BANG",
    image: "/images/cards/bang.webp",
    eventColor: "#c94a35",
    action: "bang",
    selectionView: "players",
    needsTarget: true,
    disposable: true,
    effectLimitKey: "bang",
  },
};

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

export function createDeck() {
  return bangCards.map((cardCode, index) => createDeckCard(cardCode, index));
}

function createDeckCard(cardCode, index) {
  const [, rankCode, suitShortId] = cardCode.match(/^(.+)([cdhs])$/) || [];
  const suit = suitByShortId[suitShortId];
  const rank = rankConfig[rankCode] || {
    id: rankCode,
    label: rankCode,
  };

  return {
    instanceId: `bang-${cardCode.toLowerCase()}-${index + 1}`,
    cardId: "bang",
    cardCode,
    rank,
    suit,
  };
}
