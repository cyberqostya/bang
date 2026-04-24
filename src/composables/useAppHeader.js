import { onBeforeUnmount, ref, unref, watchEffect } from "vue";

function createEmptyHeaderConfig() {
  return {
    centerText: "",
    leftButton: null,
    rightButton: null,
  };
}

export const appHeaderState = ref(createEmptyHeaderConfig());

let activeHeaderOwner = null;

export function useAppHeader(config) {
  const owner = Symbol("app-header");

  watchEffect(() => {
    activeHeaderOwner = owner;
    appHeaderState.value = {
      ...createEmptyHeaderConfig(),
      ...(unref(config) || {}),
    };
  });

  onBeforeUnmount(() => {
    if (activeHeaderOwner !== owner) return;

    activeHeaderOwner = null;
    appHeaderState.value = createEmptyHeaderConfig();
  });
}
