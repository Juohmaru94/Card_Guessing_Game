const crypto = require("node:crypto");

function nowIso() {
  return new Date().toISOString();
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function randomId(prefix = "") {
  const value = crypto.randomUUID();
  return prefix ? `${prefix}_${value}` : value;
}

function sha256Base64Url(value) {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

function normalizeUsername(username) {
  return String(username ?? "").trim().replace(/\s+/g, " ");
}

function toUsernameKey(username) {
  return normalizeUsername(username).toLocaleLowerCase();
}

function validateUsername(username) {
  const normalized = normalizeUsername(username);
  const pattern = /^[A-Za-z0-9 _-]+$/;

  if (normalized.length < 3) {
    return { valid: false, error: "Username must be at least 3 characters.", normalized };
  }

  if (normalized.length > 20) {
    return { valid: false, error: "Username must be 20 characters or fewer.", normalized };
  }

  if (!pattern.test(normalized)) {
    return { valid: false, error: "Use letters, numbers, spaces, hyphens, or underscores only.", normalized };
  }

  return { valid: true, error: "", normalized };
}

function buildPublicIdentity(user) {
  if (!user?.id) return null;

  return {
    playerId: user.id,
    username: user.username || "",
    usernameSetAt: user.username_set_at || null,
    lastSeenAt: user.last_seen_at || null,
    authProvider: user.auth_provider,
    authProviderLabel: user.auth_provider === "guest"
      ? "Guest"
      : user.auth_provider === "google"
        ? "Google"
        : user.auth_provider === "apple"
          ? "Apple"
          : "Account",
    isGuest: user.auth_provider === "guest",
  };
}

const suits = ["♣", "♥", "♠", "♦"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function shuffle(array) {
  const copy = [...array];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

function buildDeck() {
  const deck = [];
  suits.forEach((suit) => {
    ranks.forEach((rank) => {
      deck.push({ rank, suit });
    });
  });
  return shuffle(deck);
}

function isSafeReturnTo(returnTo, appOrigin) {
  if (!returnTo) return false;
  try {
    const target = new URL(returnTo, appOrigin);
    const origin = new URL(appOrigin);
    return target.origin === origin.origin;
  } catch {
    return false;
  }
}

function resolveReturnTo(returnTo, appOrigin) {
  if (!isSafeReturnTo(returnTo, appOrigin)) {
    return `${appOrigin}/`;
  }

  return new URL(returnTo, appOrigin).toString();
}

module.exports = {
  addDays,
  addMinutes,
  buildDeck,
  buildPublicIdentity,
  nowIso,
  randomId,
  resolveReturnTo,
  sha256Base64Url,
  toUsernameKey,
  validateUsername,
};
