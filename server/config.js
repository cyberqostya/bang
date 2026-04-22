import { timingConfig } from "../shared/timingConfig.js";

export const config = {
  port: Number(process.env.PORT || 3001),
  seatCount: 8,
  defaultHealth: 4,
  defaultAttackRange: 1,
  bulletSkinCount: 11,
  hatSkinCount: 13,
  maxRoomNameLength: 15,
  maxPlayerNameLength: 12,
  maxPasswordLength: 4,
  maxActiveRooms: 100,
  maxRoomCreatesPerWindow: 5,
  roomCreateWindowMs: 10 * 60 * 1000,
  playerDisconnectGraceMs: 5 * 60 * 1000,
  emptyRoomGraceMs: 0,
  finishedRoomGraceMs: 60 * 1000,
  generalStorePickWindowMs: timingConfig.generalStorePickWindowMs,
  reactionWindowMs: timingConfig.reactionWindowMs,
  turnCheckNoticeMs: timingConfig.turnCheckNoticeMs,
  gameTtlMs: 2 * 60 * 60 * 1000,
};
