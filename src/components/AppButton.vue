<script setup>
const props = defineProps({
  variant: {
    type: String,
    default: "primary",
    validator: (value) => ["primary", "muted", "phase"].includes(value),
  },
  size: {
    type: String,
    default: "modal",
    validator: (value) => ["header", "phase", "modal"].includes(value),
  },
  type: {
    type: String,
    default: "button",
  },
});
</script>

<template>
  <button
    class="app-button"
    :class="[
      `app-button_variant-${props.variant}`,
      `app-button_size-${props.size}`,
    ]"
    :type="props.type"
  >
    <slot />
  </button>
</template>

<style scoped>
.app-button {
  border: 0;
  border-radius: 6px;
  min-height: 42px;
  padding: 0 10px;
  font-size: 18px;
  font-weight: 600;
}

.app-button_variant-primary {
  background: var(--gold);
  color: var(--ink);
}

.app-button_variant-muted {
  background: rgba(94, 84, 70, 0.16);
  color: var(--muted);
}

.app-button_variant-phase {
  background: rgba(94, 84, 70, 0.16);
  color: var(--ink);
}

.app-button_variant-phase:not(:disabled) {
  background: var(--gold);
}

.app-button_size-header {
  height: 100%;
}

.app-button_size-phase {
}

.app-button_size-modal {
}

.app-button:disabled {
  cursor: default;
  opacity: 0.52;
}
</style>
