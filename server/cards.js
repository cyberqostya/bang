export const cardConfig = {
  bang: {
    id: "bang",
    title: "BANG",
    eventTitle: "БЭНГ",
    image: "/images/cards/bang.webp",
    playMode: "instant",
    eventColor: "#c94a35",
    action: "bang",
    targetPrompt: "Вы стали целью БЭНГ",
    actorPendingPrompt: "Ожидание реакции жертвы",
    selectionView: "players",
    needsTarget: true,
    usesWeaponRange: true,
    disposable: true,
    effectLimitKey: "bang",
  },
  missed: {
    id: "missed",
    title: "Missed",
    eventTitle: "МИМО",
    image: "/images/cards/missed.webp",
    playMode: "reaction",
    eventColor: "#42AAFF",
    action: "missed",
    reactionTo: ["bang"],
    needsTarget: false,
    disposable: true,
  },
  remington: {
    id: "remington",
    title: "Remington",
    eventTitle: "Ремингтон",
    image: "/images/cards/remington.webp",
    playMode: "permanent",
    eventColor: "#975f2a",
    action: "equipWeapon",
    needsTarget: false,
    disposable: false,
    weaponRange: 3,
  },
  carbine: {
    id: "carbine",
    title: "Carbine",
    eventTitle: "Карабин",
    image: "/images/cards/carbine.webp",
    playMode: "permanent",
    eventColor: "#975f2a",
    action: "equipWeapon",
    needsTarget: false,
    disposable: false,
    weaponRange: 4,
  },
  winchester: {
    id: "winchester",
    title: "Winchester",
    eventTitle: "Винчестер",
    image: "/images/cards/winchester.webp",
    playMode: "permanent",
    eventColor: "#975f2a",
    action: "equipWeapon",
    needsTarget: false,
    disposable: false,
    weaponRange: 5,
  },
  scofield: {
    id: "scofield",
    title: "Scofield",
    eventTitle: "Скофилд",
    image: "/images/cards/scofield.webp",
    playMode: "permanent",
    eventColor: "#975f2a",
    action: "equipWeapon",
    needsTarget: false,
    disposable: false,
    weaponRange: 2,
  },
  volcanic: {
    id: "volcanic",
    title: "Volcanic",
    eventTitle: "Волканик",
    image: "/images/cards/volcanic.webp",
    playMode: "permanent",
    eventColor: "#975f2a",
    action: "equipWeapon",
    propertyAction: "unlockEffectLimit",
    propertyEffectLimitKey: "bang",
    propertyCharges: 1,
    propertyLabel: "Можно сыграть еще один БЭНГ",
    needsTarget: false,
    disposable: false,
    weaponRange: 1,
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

export function createDeck() {
  return [
    ...bangCards.map((cardCode, index) =>
      createDeckCard("bang", cardCode, index),
    ),
    ...missedCards.map((cardCode, index) =>
      createDeckCard("missed", cardCode, index),
    ),
    ...weaponCards.map(([cardId, cardCode], index) =>
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
