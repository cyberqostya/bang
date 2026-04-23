export function createPublicStateSerializer(dependencies) {
  const {
    roleConfig,
    characterConfig,
    cardConfig,
    getRoomPlayersCount,
    getPlayerStatuses,
    getEffectiveCardConfig,
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
      game: getPublicGame(room, viewerPlayerId),
      seats: room.seats.map((seat) => ({
        index: seat.index,
        player: seat.player
          ? getPublicPlayer(room, seat.player, viewerPlayerId)
          : null,
      })),
    };
  }

  function getPublicGame(room, viewerPlayerId) {
    return {
      turnPlayerId: room.game.turnPlayerId,
      turnDrawTaken: room.game.turnDrawTaken,
      turnActionTaken: room.game.turnActionTaken,
      pendingReaction: getPublicPendingReaction(room),
      generalStore: getPublicGeneralStore(room),
      pendingCheckChoice: getPublicPendingCheckChoice(room, viewerPlayerId),
      pendingCharacterPayment: getPublicPendingCharacterPayment(room),
      pendingTurnDiscard: getPublicPendingTurnDiscard(room, viewerPlayerId),
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

    const { reactionProgress = {}, ...publicReaction } = pendingReaction;

    return {
      ...publicReaction,
      reactionProgress: Object.fromEntries(
        Object.entries(reactionProgress).map(([playerId, progress]) => [
          playerId,
          {
            action: progress.action,
            count: progress.count || 0,
          },
        ]),
      ),
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

  function getPublicPendingCheckChoice(room, viewerPlayerId) {
    const pendingCheckChoice = room.game.pendingCheckChoice;

    if (!pendingCheckChoice) return null;
    if (pendingCheckChoice.playerId !== viewerPlayerId) return null;

    return {
      ...pendingCheckChoice,
      cards: pendingCheckChoice.cards.map((card) =>
        getPublicCard(room, null, card, { includePlayState: false }),
      ),
      remainingMs: Math.max(0, pendingCheckChoice.expiresAt - Date.now()),
    };
  }

  function getPublicPendingCharacterPayment(room) {
    const payment = room.game.pendingCharacterPayment;

    if (!payment) return null;

    return {
      id: payment.id,
      playerId: payment.playerId,
      characterId: payment.characterId,
      characterTitle: payment.characterTitle,
      effect: payment.effect,
      selectedCount: payment.cards?.length || 0,
      requiredCount: payment.requiredCount || 0,
    };
  }

  function getPublicPendingTurnDiscard(room, viewerPlayerId) {
    const pendingTurnDiscard = room.game.pendingTurnDiscard;

    if (!pendingTurnDiscard || pendingTurnDiscard.playerId !== viewerPlayerId) {
      return null;
    }

    return {
      id: pendingTurnDiscard.id,
      playerId: pendingTurnDiscard.playerId,
      selectedCount: pendingTurnDiscard.cards?.length || 0,
    };
  }

  function getPublicPlayer(room, player, viewerPlayerId) {
    const role = player.roleId ? roleConfig[player.roleId] : null;
    const character = player.characterId
      ? characterConfig[player.characterId]
      : null;
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
      activeCharacterAbility:
        room.game?.activeCharacterAbilities?.[player.playerId] || null,
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
      character: character
        ? {
            id: character.id,
            title: character.title,
            image: character.image,
            health: character.health,
            ability: character.ability,
            distanceModifierFromSelf: character.distanceModifierFromSelf,
            distanceModifierToSelf: character.distanceModifierToSelf,
            rangeStatusBonus: character.rangeStatusBonus,
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
    const playConfigForCard =
      includePlayState && player
        ? getEffectiveCardConfig(room, player, card, configForCard)
        : configForCard;
    const isReactionPlayable =
      includePlayState &&
      isReactionCardPlayable(room, player, playConfigForCard);
    const publicCard = {
      ...card,
      title: configForCard.title,
      image: configForCard.image,
      playMode: playConfigForCard.playMode,
      action: playConfigForCard.action,
      selectionView: playConfigForCard.selectionView,
      needsTarget: isReactionPlayable ? false : playConfigForCard.needsTarget,
      usesWeaponRange: playConfigForCard.usesWeaponRange,
      panicDistance: playConfigForCard.panicDistance,
      targetTableCardMode: playConfigForCard.targetTableCardMode,
      disposable: playConfigForCard.disposable,
      effectLimitKey: playConfigForCard.effectLimitKey,
      propertyAction: playConfigForCard.propertyAction,
      propertyEffectLimitKey: playConfigForCard.propertyEffectLimitKey,
      propertyCharges: playConfigForCard.propertyCharges,
      propertyLabel: playConfigForCard.propertyLabel,
      weaponRange: playConfigForCard.weaponRange,
      statusImage: playConfigForCard.statusImage,
      check: playConfigForCard.check,
      rangeStatusBonus: playConfigForCard.rangeStatusBonus,
      distanceModifierFromSelf: playConfigForCard.distanceModifierFromSelf,
      distanceModifierToSelf: playConfigForCard.distanceModifierToSelf,
      suit: card.suit,
      rank: card.rank,
    };

    if (!includePlayState) {
      return publicCard;
    }

    return {
      ...publicCard,
      isPlayable:
        isReactionPlayable || isCardPlayable(room, player, playConfigForCard),
      isBlockedByTurnRule: isCardBlockedByTurnRule(
        room,
        player,
        playConfigForCard,
      ),
    };
  }

  return {
    getPublicCard,
    getPublicRoom,
  };
}
