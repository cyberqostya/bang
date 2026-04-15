import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { healthConfig } from "../config/healthConfig.js";

export const useHealthStore = defineStore("health", () => {
  const maxHealth = healthConfig.maxHealth;
  const health = ref(maxHealth);

  const bullets = computed(() => (
    Array.from({ length: maxHealth }, (_, index) => ({
      id: index,
      isLoaded: index < health.value,
    }))
  ));

  function damage() {
    health.value = Math.max(0, health.value - 1);
  }

  function heal() {
    health.value = Math.min(maxHealth, health.value + 1);
  }

  return {
    bullets,
    health,
    maxHealth,
    damage,
    heal,
  };
});
