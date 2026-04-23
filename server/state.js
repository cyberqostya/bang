export function createRoomState(options) {
  const { id, name, password, hostPlayerId, seatCount, createdAt } = options;

  return {
    id,
    name,
    password,
    status: "lobby",
    hostPlayerId,
    seats: createEmptySeats(seatCount),
    game: createEmptyGameState(),
    createdAt,
    startedAt: null,
    gameExpirationTimer: null,
    finishedRoomTimer: null,
    pendingReactionTimer: null,
    generalStoreTimer: null,
    checkChoiceTimer: null,
  };
}

export function createPlayerState(options) {
  const { playerId, name, health, attackRange, bulletSkinIndex } = options;

  return {
    playerId,
    name,
    health,
    maxHealth: health,
    roleId: null,
    characterId: null,
    isRoleRevealed: false,
    isAlive: true,
    connected: true,
    attackRange,
    bulletSkinIndex,
    bulletSkinKey: "default",
    hatSkinKey: null,
    leftGame: false,
    hand: [],
    weapon: null,
    blueCards: [],
  };
}

export function createEmptySeats(seatCount) {
  return Array.from({ length: seatCount }, (_, index) => ({
    index,
    player: null,
  }));
}

export function createEmptyGameState() {
  return {
    turnPlayerId: null,
    winner: null,
    winnerText: "",
    events: [],
    deck: [],
    discard: [],
    pendingReaction: null,
    generalStore: null,
    pendingCheckChoice: null,
    pendingCharacterPayment: null,
    pendingTurnDiscard: null,
    activeCharacterAbilities: {},
    turnPlayedEffects: {},
    turnEffectAllowances: {},
    turnDrawTaken: false,
    turnActionTaken: false,
    turnCheck: null,
    winnerDetails: null,
  };
}
