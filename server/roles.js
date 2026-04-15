export const roleConfig = {
  sheriff: {
    id: "sheriff",
    label: "Шериф",
    team: "law",
    isPublic: true,
  },
  renegade: {
    id: "renegade",
    label: "Ренегат",
    team: "renegade",
    isPublic: false,
  },
  outlaw: {
    id: "outlaw",
    label: "Бандит",
    team: "outlaw",
    isPublic: false,
  },
  deputy: {
    id: "deputy",
    label: "Помощник",
    team: "law",
    isPublic: false,
  },
};

const roleDeck = [
  "sheriff",
  "renegade",
  "outlaw",
  "outlaw",
  "deputy",
  "outlaw",
  "deputy",
  "renegade",
  "outlaw",
  "deputy",
];

export function getRolesForPlayerCount(playerCount) {
  return roleDeck.slice(0, playerCount);
}
