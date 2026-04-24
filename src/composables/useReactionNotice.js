import { computed } from "vue";
import { timingConfig } from "../../shared/timingConfig.js";

const REACTION_WINDOW_MS = timingConfig.reactionWindowMs;

export function useReactionNotice(roomStore, reactionNow, reactionDeadlineAt) {
  const pendingReaction = computed(
    () => roomStore.room.game?.pendingReaction || null,
  );
  const isReactionTarget = computed(
    () =>
      pendingReaction.value?.targetPlayerId === roomStore.playerId ||
      pendingReaction.value?.targetPlayerIds?.includes(roomStore.playerId),
  );
  const isReactionActor = computed(
    () => pendingReaction.value?.actorPlayerId === roomStore.playerId,
  );
  const shouldShowReactionOverlay = computed(
    () => isReactionTarget.value || isReactionActor.value,
  );
  const reactionNoticeCardTitle = computed(
    () => pendingReaction.value?.cardTitle || "",
  );
  const reactionNoticeColor = computed(
    () => pendingReaction.value?.cardColor || "#c94a35",
  );
  const reactionActorPrompt = computed(
    () =>
      `Ожидание реакции ${
        (pendingReaction.value?.targetPlayerIds?.length || 0) > 1
          ? "жертв"
          : "жертвы"
      } на`,
  );
  const reactionCountdown = computed(() => {
    if (!reactionDeadlineAt.value) return 0;

    const timeLeft = reactionDeadlineAt.value - reactionNow.value;
    const displaySeconds = Math.round(timeLeft / 1000);

    return Math.min(
      Math.ceil(REACTION_WINDOW_MS / 1000),
      Math.max(0, displaySeconds),
    );
  });
  const reactionTimeLeftRatio = computed(() => {
    if (!reactionDeadlineAt.value) return 0;

    return Math.max(
      0,
      Math.min(
        1,
        (reactionDeadlineAt.value - reactionNow.value) / REACTION_WINDOW_MS,
      ),
    );
  });
  const reactionProgressStyle = computed(() => ({
    backgroundColor: reactionNoticeColor.value,
    transform: `scaleX(${reactionTimeLeftRatio.value})`,
  }));
  const barrelCheckFailures = computed(() => {
    const currentChecks = pendingReaction.value?.barrelChecks?.[roomStore.playerId];

    if (!currentChecks) return [];

    return Array.isArray(currentChecks)
      ? currentChecks.filter(Boolean)
      : [currentChecks];
  });
  const barrelCheckFailureEvents = computed(() => {
    if (!barrelCheckFailures.value.length || !roomStore.ownPlayer) return [];

    return barrelCheckFailures.value.map((barrelCheckFailure) => ({
      type: "barrelCheck",
      actorPlayerId: roomStore.ownPlayer.playerId,
      actorName: roomStore.ownPlayer.name,
      actorRoleId: roomStore.ownPlayer.role?.id || "",
      ...barrelCheckFailure,
    }));
  });

  return {
    barrelCheckFailures,
    barrelCheckFailureEvents,
    isReactionActor,
    isReactionTarget,
    pendingReaction,
    reactionActorPrompt,
    reactionCountdown,
    reactionNoticeCardTitle,
    reactionNoticeColor,
    reactionProgressStyle,
    shouldShowReactionOverlay,
  };
}
