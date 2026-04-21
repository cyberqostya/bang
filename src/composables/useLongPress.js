import { onBeforeUnmount, ref } from "vue";

export function useLongPress(callback, delay = 520) {
  const wasLongPressed = ref(false);
  let timer = null;

  function clearTimer() {
    window.clearTimeout(timer);
    timer = null;
  }

  function startLongPress(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    wasLongPressed.value = false;
    clearTimer();

    timer = window.setTimeout(() => {
      timer = null;
      wasLongPressed.value = true;
      event.preventDefault();
      callback(event);
    }, delay);
  }

  function cancelLongPress() {
    clearTimer();
  }

  function shouldSkipClick() {
    if (!wasLongPressed.value) return false;

    wasLongPressed.value = false;
    return true;
  }

  onBeforeUnmount(clearTimer);

  return {
    cancelLongPress,
    shouldSkipClick,
    startLongPress,
  };
}
