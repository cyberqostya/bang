export const characterConfig = {
  bigzmey: {
    id: "bigzmey",
    title: "Большой Змей",
    image: "/images/chars/bigzmey.webp",
    health: 4,
    ability: {
      trigger: "playerDeath",
      effect: "takeDeadPlayerCards",
    },
  },
  bedovayajane: {
    id: "bedovayajane",
    title: "Бедовая Джейн",
    image: "/images/chars/bedovayajane.webp",
    health: 4,
    ability: {
      trigger: "activate",
      effect: "convertBangMissed",
    },
  },
  tuko: {
    id: "tuko",
    title: "Туко",
    image: "/images/chars/tuko.webp",
    health: 4,
    ability: {
      trigger: "activate",
      effect: "drawDiscardTop",
    },
  },
  hladnarozy: {
    id: "hladnarozy",
    title: "Хладнокровная Рози",
    image: "/images/chars/hladnarozy.webp",
    health: 4,
    distanceModifierFromSelf: -1,
    rangeStatusBonus: 1,
    ability: {
      trigger: "passive",
      effect: "distanceFromSelfMinusOne",
    },
  },
  suzylafaet: {
    id: "suzylafaet",
    title: "Сюзи Лафайет",
    image: "/images/chars/suzylafaet.webp",
    health: 4,
    ability: {
      trigger: "passive",
      effect: "emptyHandDrawDeck",
    },
  },
  django: {
    id: "django",
    title: "Джанго",
    image: "/images/chars/django.webp",
    health: 4,
    ability: {
      trigger: "passive",
      effect: "takeRandomHandCardOnHealthLoss",
    },
  },
  butchkasidy: {
    id: "butchkasidy",
    title: "Бутч Кэссиди",
    image: "/images/chars/butchkasidy.webp",
    health: 4,
    ability: {
      trigger: "passive",
      effect: "drawDeckOnHealthLoss",
    },
  },
  bezimeni: {
    id: "bezimeni",
    title: "Человек-Без-Имени",
    image: "/images/chars/bezimeni.webp",
    health: 4,
    ability: {
      trigger: "activate",
      effect: "characterBarrelCheck",
    },
  },
  jessyjames: {
    id: "jessyjames",
    title: "Джесси Джеймс",
    image: "/images/chars/jessyjames.webp",
    health: 4,
    ability: {
      trigger: "activate",
      effect: "drawFromOpponentHandOnDrawPhase",
    },
  },
  malishbilly: {
    id: "malishbilly",
    title: "Малыш Билли",
    image: "/images/chars/malishbilly.webp",
    health: 4,
    ability: {
      trigger: "activate",
      effect: "unlockBangLimit",
    },
  },
  kitkarson: {
    id: "kitkarson",
    title: "Кит Карсон",
    image: "/images/chars/kitkarson.webp",
    health: 4,
    ability: {
      trigger: "activate",
      effect: "chooseDeckTopCards",
      cardsCount: 3,
      chooseCount: 2,
    },
  },
  neulovimiyjo: {
    id: "neulovimiyjo",
    title: "Неуловимый Джо",
    image: "/images/chars/neulovimiyjo.webp",
    health: 4,
    distanceModifierToSelf: 1,
    ability: {
      trigger: "passive",
      effect: "distanceToSelfPlusOne",
    },
  },
  milashkanya: {
    id: "milashkanya",
    title: "Милашка Ня",
    image: "/images/chars/milashkanya.webp",
    health: 4,
    ability: {
      trigger: "passive",
      effect: "returnPlayedCardToHand",
      chancePercent: 33,
    },
  },
  angeleyes: {
    id: "angeleyes",
    title: "Ангельские Глазки",
    image: "/images/chars/angeleyes.webp",
    health: 4,
    ability: {
      trigger: "passive",
      effect: "requiresExtraMissed",
      sourceActions: ["bang", "gatling"],
      reactionAction: "missed",
      requiredCount: 2,
    },
  },
  schastlivchikluk: {
    id: "schastlivchikluk",
    title: "Счастливчик Люк",
    image: "/images/chars/schastlivchikluk.webp",
    health: 4,
    ability: {
      trigger: "activate",
      effect: "chooseCheckCard",
      cardsCount: 2,
    },
  },
  besheniypes: {
    id: "besheniypes",
    title: "Бешеный Пёс",
    image: "/images/chars/besheniypes.webp",
    health: 4,
    ability: {
      trigger: "activate",
      effect: "revealSecondDrawSuitBonus",
      successSuits: ["hearts", "diamonds"],
      bonusDrawCount: 1,
    },
  },
  tomketchum: {
    id: "tomketchum",
    title: "Том Кетчум",
    image: "/images/chars/tomketchum.webp",
    health: 4,
    ability: {
      trigger: "activate",
      effect: "discardCardsToHeal",
      requiredCards: 2,
      healAmount: 1,
    },
  },
};

export function getCharacterIds() {
  return Object.keys(characterConfig);
}
