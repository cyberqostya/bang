export function parseMessage(rawMessage) {
  try {
    return JSON.parse(rawMessage.toString());
  } catch {
    return null;
  }
}

export function normalizeName(value) {
  return String(value || "").trim().slice(0, 20);
}

export function normalizeRoomName(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

export function normalizePassword(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

export function normalizePlayerId(value) {
  const playerId = String(value || "").trim();

  return /^[a-zA-Z0-9-]{12,80}$/.test(playerId) ? playerId : "";
}

export function getClientIp(request) {
  const forwardedFor = request.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string") {
    return forwardedFor.split(",")[0].trim();
  }

  return request.socket.remoteAddress || "unknown";
}
