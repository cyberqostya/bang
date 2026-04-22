export function createPublicStateSerializer(dependencies) {
  const {
    roleConfig,
    cardConfig,
    getRoomPlayersCount,
    getPlayerStatuses,
    isCardPlayable,
    isCardBlockedByTurnRule,
    isReactionCardPlayable,
  } = dependencies;

  function getPublicRoom(room, viewerPlayerId) {
    return {
      id: room.id,
      name: room.name,
      status: room.status,
      hostPlayerId: room.hostPlayerId,
      playersCount: getRoomPlayersCount(room),
      game: getPublicGame(room),
      seats: room.seats.map((seat) => ({
        index: seat.index,
        player: seat.player
          ? getPublicPlayer(room, seat.player, viewerPlayerId)
          : null,
      })),
    };
  }

  function getPublicGame(room) {
    return {
      turnPlayerId: room.game.turnPlayerId,
      turnDrawTaken: room.game.turnDrawTaken,
      turnActionTaken: room.game.turnActionTaken,
      pendingReaction: getPublicPendingReaction(room),
      generalStore: getPublicGeneralStore(room),
      turnCheck: room.game.turnCheck,
      winner: room.game.winner,
      winnerText: room.game.winnerText,
      winnerDetails: room.game.winnerDetails,
      events: room.game.events,
      deckCount: room.game.deck.length,
      discardCount: room.game.discard.length,
    };
  }

  function getPublicPendingReaction(room) {
    const pendingReaction = room.game.pendingReaction;

    if (!pendingReaction) return null;

    return {
      ...pendingReaction,
      remainingMs: Math.max(0, pendingReaction.expiresAt - Date.now()),
    };
  }

  function getPublicGeneralStore(room) {
    const generalStore = room.game.generalStore;

    if (!generalStore) return null;

    return {
      ...generalStore,
      cards: generalStore.cards.map((card) =>
        getPublicCard(room, null, card, { includePlayState: false }),
      ),
    };
  }

  function getPublicPlayer(room, player, viewerPlayerId) {
    const role = player.roleId ? roleConfig[player.roleId] : null;
    const canSeeRole = Boolean(
      role &&
        (player.playerId === viewerPlayerId ||
          role.isPublic ||
          player.isRoleRevealed),
    );

    return {
      playerId: player.playerId,
      name: player.name,
      health: player.health,
      maxHealth: player.maxHealth,
      attackRange: player.attackRange,
      activeEffectAllowances:
        room.game?.turnEffectAllowances?.[player.playerId] || {},
      weapon: player.weapon
        ? getPublicCard(room, player, player.weapon, {
            includePlayState: false,
          })
        : null,
      blueCards: (player.blueCards || []).map((card) =>
        getPublicCard(room, player, card, { includePlayState: false }),
      ),
      statuses: getPlayerStatuses(player),
      bulletSkinIndex: player.bulletSkinIndex,
      bulletSkinKey: player.bulletSkinKey,
      hatSkinKey: player.hatSkinKey,
      connected: player.connected,
      leftGame: player.leftGame,
      isAlive: player.isAlive,
      isRoleRevealed: player.isRoleRevealed,
      handCount: player.hand?.length || 0,
      hand:
        player.playerId === viewerPlayerId ? getPublicHand(room, player) : [],
      role: canSeeRole
        ? {
            id: role.id,
            label: role.label,
            team: role.team,
          }
        : null,
    };
  }

  function getPublicHand(room, player) {
    return (player.hand || []).map((card) =>
      getPublicCard(room, player, card, { includePlayState: true }),
    );
  }

  function getPublicCard(room, player, card, options = {}) {
    const { includePlayState = false } = options;
    const configForCard = cardConfig[card.cardId];
    const isReactionPlayable =
      includePlayState && isReactionCardPlayable(room, player, configForCard);
    const publicCard = {
      ...card,
      title: configForCard.title,
      image: configForCard.image,
      playMode: configForCard.playMode,
      action: configForCard.action,
      selectionView: configForCard.selectionView,
      needsTarget: isReactionPlayable ? false : configForCard.needsTarget,
      usesWeaponRange: configForCard.usesWeaponRange,
      panicDistance: configForCard.panicDistance,
      targetTableCardMode: configForCard.targetTableCardMode,
      disposable: configForCard.disposable,
      effectLimitKey: configForCard.effectLimitKey,
      propertyAction: configForCard.propertyAction,
      propertyEffectLimitKey: configForCard.propertyEffectLimitKey,
      propertyCharges: configForCard.propertyCharges,
      propertyLabel: configForCard.propertyLabel,
      weaponRange: configForCard.weaponRange,
      statusImage: configForCard.statusImage,
      rangeStatusBonus: configForCard.rangeStatusBonus,
      distanceModifierFromSelf: configForCard.distanceModifierFromSelf,
      distanceModifierToSelf: configForCard.distanceModifierToSelf,
      suit: card.suit,
      rank: card.rank,
    };

    if (!includePlayState) {
      return publicCard;
    }

    return {
      ...publicCard,
      isPlayable:
        isReactionPlayable || isCardPlayable(room, player, configForCard),
      isBlockedByTurnRule: isCardBlockedByTurnRule(room, player, configForCard),
    };
  }

  return {
    getPublicCard,
    getPublicRoom,
  };
}
