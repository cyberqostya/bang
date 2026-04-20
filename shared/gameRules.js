export function getAliveSeatIndexes(seats) {
  return seats
    .filter((seat) => seat.player?.isAlive && !seat.player.leftGame)
    .map((seat) => seat.index)
    .sort((first, second) => first - second);
}

export function findActiveSeatByPlayerId(seats, playerId) {
  return (
    seats.find(
      (seat) =>
        seat.player?.playerId === playerId && !seat.player.leftGame,
    ) || null
  );
}

export function hasBlueCardInPlay(player, cardId) {
  return Boolean(
    (player?.blueCards || []).some((card) => card.cardId === cardId),
  );
}

export function isDynamiteInPlay(players) {
  return players.some((player) => hasBlueCardInPlay(player, "dynamite"));
}

export function getPlayerDistance(seats, fromPlayerId, toPlayerId, options = {}) {
  const { getCardConfig = () => null } = options;
  const aliveSeatIndexes = getAliveSeatIndexes(seats);
  const fromSeat = findActiveSeatByPlayerId(seats, fromPlayerId);
  const toSeat = findActiveSeatByPlayerId(seats, toPlayerId);
  const fromPosition = aliveSeatIndexes.indexOf(fromSeat?.index);
  const toPosition = aliveSeatIndexes.indexOf(toSeat?.index);

  if (
    fromPosition === -1 ||
    toPosition === -1 ||
    fromPosition === toPosition
  ) {
    return 0;
  }

  const directDistance = Math.abs(fromPosition - toPosition);
  const baseDistance = Math.min(
    directDistance,
    aliveSeatIndexes.length - directDistance,
  );
  const distanceModifier =
    getDistanceModifierFromSelf(fromSeat.player, getCardConfig) +
    getDistanceModifierToSelf(toSeat.player, getCardConfig);

  return Math.max(1, baseDistance + distanceModifier);
}

export function getDistanceModifierFromSelf(player, getCardConfig = () => null) {
  return getBlueCardsValue(player, "distanceModifierFromSelf", getCardConfig);
}

export function getDistanceModifierToSelf(player, getCardConfig = () => null) {
  return getBlueCardsValue(player, "distanceModifierToSelf", getCardConfig);
}

export function getRangeStatusValue(player, getCardConfig = () => null) {
  return (
    (player?.attackRange || 1) +
    getBlueCardsValue(player, "rangeStatusBonus", getCardConfig)
  );
}

export function getCardStatusStep(index) {
  const distanceFromHealth = Math.floor(index / 2) + 1;

  return index % 2 === 0 ? -distanceFromHealth : distanceFromHealth + 1;
}

function getBlueCardsValue(player, propertyName, getCardConfig) {
  return (player?.blueCards || []).reduce((total, card) => {
    const config = getCardConfig(card) || {};

    return total + (card[propertyName] || config[propertyName] || 0);
  }, 0);
}
