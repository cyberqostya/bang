import { computed } from "vue";

export function useGameResult(roomStore) {
  const isOwnPlayerWinner = computed(() => {
    const winner = roomStore.room.game?.winner;
    const roleId = roomStore.ownPlayer?.role?.id;
    const team = roomStore.ownPlayer?.role?.team;

    if (!winner || !roleId) return false;
    if (winner === "outlaws") return roleId === "outlaw";
    if (winner === "renegade") return roleId === "renegade";
    if (winner === "law") return team === "law";

    return winner === team;
  });
  const resultDialogText = computed(() =>
    isOwnPlayerWinner.value ? "Вы победили!" : roomStore.room.game?.winnerText,
  );
  const resultDialogSegments = computed(() => {
    if (isOwnPlayerWinner.value) {
      return [{ text: "Вы победили!", strong: false }];
    }

    const details = roomStore.room.game?.winnerDetails;

    if (!details) {
      return [{ text: roomStore.room.game?.winnerText || "", strong: false }];
    }

    if (details.type === "renegade") {
      return [
        { text: "Победил Ренегат ", strong: false },
        { text: details.renegade?.name || "", strong: true },
        { text: ", он уничтожил всех и остался один", strong: false },
      ];
    }

    if (details.type === "sheriffKilledOutlaws") {
      const outlaws = details.outlaws || [];

      return [
        {
          text: `Шериф убит: победили бандит(ы)${
            outlaws.length > 0 ? " " : ""
          }`,
          strong: false,
        },
        ...joinNameSegments(outlaws),
      ];
    }

    if (details.type === "law") {
      const deputies = details.deputies || [];

      return [
        { text: "Шериф ", strong: false },
        { text: details.sheriff?.name || "", strong: true },
        ...getDeputyVictorySegments(deputies),
        {
          text: ` ${
            deputies.length > 0 ? "победили" : "победил"
          }: все бандиты и ренегат(ы) мертвы`,
          strong: false,
        },
      ];
    }

    return [{ text: resultDialogText.value || "", strong: false }];
  });

  return {
    resultDialogSegments,
  };
}

function joinNameSegments(players) {
  return players.flatMap((player, index) => [
    { text: index > 0 ? ", " : "", strong: false },
    { text: player.name, strong: true },
  ]);
}

function getDeputyVictorySegments(deputies) {
  if (deputies.length === 0) return [];

  return [
    { text: " и живые помощники ", strong: false },
    ...joinNameSegments(deputies),
  ];
}
