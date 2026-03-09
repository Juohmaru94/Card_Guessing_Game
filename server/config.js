const path = require("node:path");

function parseBoolean(value, fallback) {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePrivateKey(value) {
  if (!value) return "";
  return String(value).replace(/\\n/g, "\n").trim();
}

const rootDir = path.resolve(__dirname, "..");
const dataDir = path.resolve(rootDir, "data");

const config = {
  rootDir,
  dataDir,
  port: parseInteger(process.env.PORT, 3000),
  appOrigin: process.env.APP_ORIGIN || "http://localhost:3000",
  databasePath: path.resolve(rootDir, process.env.DATABASE_PATH || "./data/the-trial.sqlite"),
  sessionCookieName: process.env.SESSION_COOKIE_NAME || "the_trial_session",
  sessionTtlDays: parseInteger(process.env.SESSION_TTL_DAYS, 30),
  oauthStateTtlMinutes: parseInteger(process.env.OAUTH_STATE_TTL_MINUTES, 10),
  serveStatic: parseBoolean(process.env.SERVE_STATIC, true),
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI || "",
  },
  apple: {
    clientId: process.env.APPLE_CLIENT_ID || "",
    teamId: process.env.APPLE_TEAM_ID || "",
    keyId: process.env.APPLE_KEY_ID || "",
    privateKey: normalizePrivateKey(process.env.APPLE_PRIVATE_KEY),
    redirectUri: process.env.APPLE_REDIRECT_URI || "",
  },
};

module.exports = { config };
