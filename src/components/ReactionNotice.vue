<script setup>
import GameEventMessage from "./GameEventMessage.vue";

defineProps({
  mode: {
    type: String,
    default: "reaction",
  },
  pendingReaction: {
    type: Object,
    default: null,
  },
  isReactionTarget: {
    type: Boolean,
    default: false,
  },
  reactionActorPrompt: {
    type: String,
    default: "",
  },
  reactionCountdown: {
    type: Number,
    default: 0,
  },
  reactionNoticeCardTitle: {
    type: String,
    default: "БЭНГ",
  },
  reactionNoticeColor: {
    type: String,
    default: "#c94a35",
  },
  reactionProgressStyle: {
    type: Object,
    default: () => ({}),
  },
  barrelCheckFailure: {
    type: Object,
    default: null,
  },
  turnCheckNotice: {
    type: Object,
    default: null,
  },
});
</script>

<template>
  <section
    v-if="mode === 'check'"
    class="reaction-notice reaction-notice_check"
    aria-live="assertive"
  >
    <div class="reaction-notice__copy">
      <p class="reaction-notice__subtext reaction-notice__check-text">
        <GameEventMessage :event="turnCheckNotice" tone="light" />
      </p>
    </div>
  </section>

  <section v-else class="reaction-notice" aria-live="assertive">
    <span
      class="reaction-notice__progress"
      :style="reactionProgressStyle"
    ></span>
    <div class="reaction-notice__copy">
      <p class="reaction-notice__text">
        <template v-if="isReactionTarget">
          <span>Вы стали целью </span>
          <span
            class="reaction-notice__card"
            :style="{ color: reactionNoticeColor }"
          >
            [{{ reactionNoticeCardTitle }}]
          </span>
        </template>
        <template v-else>
          <span>{{ reactionActorPrompt }} </span>
          <span
            class="reaction-notice__card"
            :style="{ color: reactionNoticeColor }"
          >
            [{{ reactionNoticeCardTitle }}]
          </span>
        </template>
      </p>
      <template v-if="isReactionTarget">
        <p class="reaction-notice__subtext">До потери здоровья осталось -></p>
      </template>
      <p
        v-if="isReactionTarget && barrelCheckFailure"
        class="reaction-notice__subtext reaction-notice__check-text"
      >
        <span>проверка {{ barrelCheckFailure.checkCardTitle }}</span>
        <span> -- {{ barrelCheckFailure.resultTitle }}</span>
        <span> -- вытянул карту </span>
        <span class="reaction-notice__check-card">
          <span>"</span>
          <span :style="{ color: barrelCheckFailure.drawnCard?.suit?.color }">
            {{ barrelCheckFailure.drawnCard?.title }}
          </span>
          <span>-</span>
          <span
            class="reaction-notice__check-rank"
            :style="{ color: barrelCheckFailure.drawnCard?.suit?.color }"
          >
            {{ barrelCheckFailure.drawnCard?.rank?.label }}
          </span>
          <img
            class="reaction-notice__check-suit"
            :src="barrelCheckFailure.drawnCard?.suit?.image"
            :alt="barrelCheckFailure.drawnCard?.suit?.label"
          />
          <span>"</span>
        </span>
        <span v-if="barrelCheckFailure.consequenceText">
          -- {{ barrelCheckFailure.consequenceText }}
        </span>
      </p>
    </div>
    <span class="reaction-notice__count">
      {{ reactionCountdown }}
    </span>
  </section>
</template>

<style scoped>
.reaction-notice {
  position: fixed;
  z-index: 50;
  left: max(14px, env(safe-area-inset-left));
  right: max(14px, env(safe-area-inset-right));
  top: max(14px, env(safe-area-inset-top));
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  overflow: hidden;
  border-radius: 8px;
  padding: 14px;
  background: var(--ink);
  box-shadow:
    0 16px 32px rgba(29, 29, 29, 0.26),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
  color: #fff;
  align-items: flex-start;
}

.reaction-notice_check {
  grid-template-columns: minmax(0, 1fr);
}

.reaction-notice_check :deep(.game-event-message__check-drawn) {
  border-radius: 6px;
  padding: 5px;
  background: rgba(255, 255, 255, 0.94);
  text-shadow: none;
}

.reaction-notice__progress {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 5px;
  transform-origin: left center;
  transition: transform 220ms linear;
  will-change: transform;
}

.reaction-notice__copy {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 6px;
}

.reaction-notice__text {
  margin: 0;
  color: #fff;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.1;
  text-wrap: balance;
  text-shadow: 0 3px 12px rgba(0, 0, 0, 0.34);
}

.reaction-notice__card {
  font-weight: 800;
  white-space: nowrap;
}

.reaction-notice__subtext {
  margin: 0;
  color: rgba(255, 255, 255, 0.86);
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
  text-wrap: balance;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.24);
}

.reaction-notice__check-text {
  color: #fff;
  line-height: 1.3;
}

.reaction-notice__check-card {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  vertical-align: baseline;
  border-radius: 6px;
  padding: 1px 5px;
  background: rgba(255, 255, 255, 0.94);
  text-shadow: none;
}

.reaction-notice__check-rank {
  font-weight: 800;
}

.reaction-notice__check-suit {
  width: auto;
  height: 0.9em;
  object-fit: contain;
}

.reaction-notice__count {
  min-width: 1.2ch;
  color: #fff;
  font-size: 48px;
  font-weight: 800;
  line-height: 1;
  text-align: right;
  text-shadow: 0 3px 12px rgba(0, 0, 0, 0.34);
}

.reaction-notice-enter-active {
  animation: reaction-notice-drop 260ms cubic-bezier(0.2, 0.85, 0.26, 1.1) both;
}

.reaction-notice-leave-active {
  animation: reaction-notice-drop 180ms ease-in reverse both;
}

@keyframes reaction-notice-drop {
  from {
    opacity: 0;
    transform: translateY(-110%);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
