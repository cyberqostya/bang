import { computed } from "vue";

const REACTION_WINDOW_MS = 5 * 1000;

export function useReactionNotice(roomStore, reactionNow) {
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
    () => pendingReaction.value?.cardTitle || "БЭНГ",
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
    if (!pendingReaction.value?.expiresAt) return 0;

    return Math.max(
      0,
      Math.ceil((pendingReaction.value.expiresAt - reactionNow.value) / 1000),
    );
  });
  const reactionTimeLeftRatio = computed(() => {
    if (!pendingReaction.value?.expiresAt) return 0;

    return Math.max(
      0,
      Math.min(
        1,
        (pendingReaction.value.expiresAt - reactionNow.value) /
          REACTION_WINDOW_MS,
      ),
    );
  });
  const reactionProgressStyle = computed(() => ({
    backgroundColor: reactionNoticeColor.value,
    transform: `scaleX(${reactionTimeLeftRatio.value})`,
  }));
  const barrelCheckFailure = computed(
    () => pendingReaction.value?.barrelChecks?.[roomStore.playerId] || null,
  );

  return {
    barrelCheckFailure,
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
