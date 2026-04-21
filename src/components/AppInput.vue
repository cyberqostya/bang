<script setup>
import { ref } from "vue";

const model = defineModel({
  type: String,
  default: "",
});
const inputElement = ref(null);

defineProps({
  size: {
    type: String,
    default: "modal",
    validator: (value) => ["modal", "search"].includes(value),
  },
});

function focus() {
  inputElement.value?.focus();
}

defineExpose({
  focus,
});
</script>

<template>
  <input
    ref="inputElement"
    v-model="model"
    class="app-input"
    :class="`app-input_size-${size}`"
  />
</template>

<style scoped>
.app-input {
  width: 100%;
  min-width: 0;
  min-height: 42px;
  border: 1px dashed var(--line);
  border-radius: 6px;
  padding: 0 10px;
  background: var(--back);
  color: var(--ink);
  font: inherit;
  font-size: 18px;
  line-height: normal;
  outline: none;
}

.app-input:focus {
  border-color: rgba(94, 84, 70, 0.5);
}

.app-input::placeholder {
  color: var(--muted);
}
</style>
