export const cardConfig = {
  bang: {
    id: "bang",
    title: "BANG",
    image: "/images/cards/bang.png",
    eventColor: "#c94a35",
    action: "bang",
    selectionView: "players",
    needsTarget: true,
    disposable: true,
    effectLimitKey: "bang",
    suit: {
      id: "hearts",
      label: "Черви",
    },
    rank: {
      id: "ace",
      label: "Туз",
    },
    targetMessage: "Игрок {actor} применил карту Bang на вас",
  },
};

export function createTestDeck() {
  return Array.from({ length: 80 }, (_, index) => ({
    instanceId: `bang-${index + 1}`,
    cardId: "bang",
    deckNumber: index + 1,
  }));
}
