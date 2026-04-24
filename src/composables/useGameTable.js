import { computed } from "vue";
import { healthConfig } from "../config/healthConfig.js";
import {
  getCardStatusStep,
  getPlayerDistance,
  getRangeStatusValue,
  hasBlueCardInPlay,
  isDynamiteInPlay,
} from "../../shared/gameRules.js";

const STATUS_ARC_STEP_DEGREES = 30;

export function useGameTable(roomStore, emit) {
  const seats = computed(() =>
    roomStore.room.seats
      .filter((seat) => seat.player && !seat.player.leftGame)
      .map((seat) => ({
        ...seat,
        isOwn: seat.player?.playerId === roomStore.playerId,
        isTurn: seat.player?.playerId === roomStore.room.game?.turnPlayerId,
        isTargetable: Boolean(
          ((roomStore.selectedCard?.needsTarget &&
            roomStore.selectedCard?.isPlayable &&
            isTargetAllowedForSelectedCard(seat)) ||
            isTargetAllowedForDrawPhaseAbility(seat)) &&
            seat.player.playerId !== roomStore.playerId &&
            seat.player.isAlive,
        ),
        rangeStatusStyle: getRangeStatusStyle(seat.index),
        cardStatuses: getCardStatusesForSeat(seat),
      })),
  );
  const turnPlayer = computed(
    () =>
      seats.value.find(
        (seat) => seat.player.playerId === roomStore.room.game?.turnPlayerId,
      )?.player || null,
  );
  const turnSeatIndex = computed(
    () =>
      seats.value.find(
        (seat) => seat.player.playerId === roomStore.room.game?.turnPlayerId,
      )?.index ?? null,
  );
  const turnPlayerLabel = computed(() => {
    if (!turnPlayer.value) return "игровой стол";

    const rolePrefix = turnPlayer.value.role?.id === "sheriff" ? "шериф " : "";

    return `Ходит ${rolePrefix}${turnPlayer.value.name}`;
  });

  function getHatImage(player) {
    return `/images/hats/${player.hatSkinKey || "1"}.webp`;
  }

  function getBulletImage(player) {
    if (player.bulletSkinKey === "sheriff") {
      return healthConfig.sheriffBulletImage;
    }

    return healthConfig.tableBulletImage;
  }

  function isSheriff(player) {
    return player.role?.id === "sheriff";
  }

  function handleSeatClick(seat) {
    if (seat.isOwn) {
      emit("showCards");
      return;
    }

    if (seat.isTargetable) {
      if (roomStore.isSelectingDrawTarget) {
        roomStore.useDrawPhaseTarget(seat.player.playerId);
        emit("showCards");
        return;
      }

      if (roomStore.selectedCard?.targetTableCardMode) {
        emit("inspectPlayer", seat.player.playerId);
        return;
      }

      roomStore.useSelectedCard(seat.player.playerId);
      return;
    }

    if (seat.player) {
      emit("inspectPlayer", seat.player.playerId);
    }
  }

  function isTargetInSelectedCardRange(seat) {
    if (roomStore.selectedCard?.targetTableCardMode) {
      if (!roomStore.selectedCard.panicDistance) return true;

      const distance = getPlayerDistance(
        roomStore.room.seats,
        roomStore.playerId,
        seat.player.playerId,
      );

      return (
        distance > 0 && distance <= roomStore.selectedCard.panicDistance
      );
    }

    if (!roomStore.selectedCard?.usesWeaponRange) return true;

    const distance = getPlayerDistance(
      roomStore.room.seats,
      roomStore.playerId,
      seat.player.playerId,
    );

    return distance > 0 && distance <= (roomStore.ownPlayer?.attackRange || 1);
  }

  function isTargetAllowedForSelectedCard(seat) {
    const selectedCard = roomStore.selectedCard;

    if (!selectedCard) return false;
    if (!isTargetInSelectedCardRange(seat)) return false;

    if (selectedCard.action !== "playBlueCardOnTarget") return true;
    if (hasBlueCardInPlay(seat.player, selectedCard.cardId)) return false;
    if (selectedCard.cardId === "jail" && seat.player.role?.id === "sheriff") {
      return false;
    }
    if (
      selectedCard.cardId === "dynamite" &&
      isDynamiteInPlay(roomStore.players)
    ) {
      return false;
    }

    return true;
  }

  function isTargetAllowedForDrawPhaseAbility(seat) {
    return roomStore.isSelectingDrawTarget && seat.player.isAlive;
  }

  function getCardStatusesForSeat(seat) {
    return (seat.player.statuses || []).map((status, index) => ({
      ...status,
      style: getStatusStyle(seat.index, getCardStatusStep(index)),
    }));
  }

  function getRangeStatusStyle(seatIndex) {
    return getStatusStyle(seatIndex, 1);
  }

  return {
    seats,
    turnSeatIndex,
    turnPlayerLabel,
    getBulletImage,
    getHatImage,
    getRangeStatusValue,
    handleSeatClick,
    isSheriff,
  };
}

function getStatusStyle(seatIndex, step) {
  const angle = getHealthStatusAngle(seatIndex) + step * STATUS_ARC_STEP_DEGREES;
  const radians = (angle * Math.PI) / 180;
  const x = Number(Math.cos(radians).toFixed(3));
  const y = Number(Math.sin(radians).toFixed(3));

  return {
    transform: `translate(-50%, -50%) translate(calc(${x} * var(--status-radius)), calc(${y} * var(--status-radius)))`,
  };
}

function getHealthStatusAngle(seatIndex) {
  return -90 + ((seatIndex + 4) % 8) * 45;
}
