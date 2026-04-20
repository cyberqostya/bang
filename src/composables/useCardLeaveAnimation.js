export function useCardLeaveAnimation() {
  function freezeLeavingCard(element) {
    const cardRect = element.getBoundingClientRect();

    element.style.setProperty("--leaving-card-width", `${cardRect.width}px`);
    element.style.height = `${cardRect.height}px`;
    element.style.flexGrow = "0";
    element.style.flexShrink = "0";
    element.style.zIndex = "20";
    element.style.pointerEvents = "none";
  }

  return {
    freezeLeavingCard,
  };
}
