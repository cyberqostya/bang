<script setup>
import ReactionNotice from "../components/ReactionNotice.vue";

const bangReaction = {
  cardTitle: "БЭНГ",
  cardColor: "#c94a35",
};
const bangProgressStyle = {
  backgroundColor: bangReaction.cardColor,
  transform: "scaleX(0.62)",
};
const drawnHeart = {
  title: "БЭНГ",
  suit: {
    id: "hearts",
    label: "черви",
    color: "#c94a35",
    image: "/images/suits/hearts.webp",
  },
  rank: {
    label: "7",
  },
};
const drawnSpade = {
  title: "БЭНГ",
  suit: {
    id: "spades",
    label: "пики",
    color: "#1d1d1d",
    image: "/images/suits/spades.webp",
  },
  rank: {
    label: "2",
  },
};
const jailSuccessNotice = {
  type: "turnCheck",
  actorRoleId: "outlaw",
  actorName: "Билли",
  checkCardTitle: "Тюрьма",
  checkCardColor: "#9c6a30",
  isSuccess: true,
  consequenceText: "вышел из тюрьмы",
  drawnCard: drawnHeart,
};
const dynamiteSuccessNotice = {
  type: "turnCheck",
  actorRoleId: "renegade",
  actorName: "Джанго",
  checkCardTitle: "Динамит",
  checkCardColor: "#c94a35",
  isSuccess: true,
  consequenceText: "передал динамит дальше",
  drawnCard: drawnSpade,
};
</script>

<template>
  <main class="notice-preview-screen">
    <section class="notice-preview-section">
      <h1>Предпросмотр уведомлений</h1>
      <p>
        Правь CSS в
        <code>src/components/ReactionNotice.vue</code>.
      </p>
    </section>

    <section class="notice-preview-frame notice-preview-frame_top">
      <ReactionNotice
        :is-reaction-target="true"
        :pending-reaction="bangReaction"
        :reaction-countdown="3"
        :reaction-notice-card-title="bangReaction.cardTitle"
        :reaction-notice-color="bangReaction.cardColor"
        :reaction-progress-style="bangProgressStyle"
      />
    </section>

    <section class="notice-preview-stack">
      <div class="notice-preview-card">
        <h2>Успешная тюрьма</h2>
        <ReactionNotice
          mode="check"
          :turn-check-notice="jailSuccessNotice"
        />
      </div>

      <div class="notice-preview-card">
        <h2>Успешный динамит</h2>
        <ReactionNotice
          mode="check"
          :turn-check-notice="dynamiteSuccessNotice"
        />
      </div>
    </section>
  </main>
</template>

<style scoped>
.notice-preview-screen {
  min-height: 100vh;
  padding: 24px;
  background:
    linear-gradient(rgba(29, 29, 29, 0.72), rgba(29, 29, 29, 0.72)),
    url("/images/rooms/4.webp") center / cover;
  color: #fff;
}

.notice-preview-section {
  display: grid;
  gap: 8px;
  max-width: 760px;
  margin: 0 auto 24px;
}

.notice-preview-section h1,
.notice-preview-section p {
  margin: 0;
}

.notice-preview-section code {
  border-radius: 6px;
  padding: 2px 5px;
  background: rgba(255, 255, 255, 0.16);
}

.notice-preview-frame {
  position: relative;
  min-height: 130px;
}

.notice-preview-frame :deep(.reaction-notice),
.notice-preview-card :deep(.reaction-notice) {
  position: static;
  pointer-events: auto;
}

.notice-preview-stack {
  display: grid;
  gap: 18px;
  max-width: 920px;
  margin: 0 auto;
}

.notice-preview-card {
  display: grid;
  gap: 10px;
}

.notice-preview-card h2 {
  margin: 0;
  font-size: 18px;
}
</style>
