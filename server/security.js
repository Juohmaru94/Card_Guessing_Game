const crypto = require("node:crypto");
const { addDays, addMinutes } = require("./utils");

function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").reduce((cookies, part) => {
    const [name, ...rest] = part.trim().split("=");
    if (!name) return cookies;
    cookies[name] = decodeURIComponent(rest.join("=") || "");
    return cookies;
  }, {});
}

function serializeCookie(name, value, options = {}) {
  const segments = [`${name}=${encodeURIComponent(value)}`];
  segments.push(`Path=${options.path || "/"}`);

  if (options.httpOnly !== false) {
    segments.push("HttpOnly");
  }

  if (options.sameSite) {
    segments.push(`SameSite=${options.sameSite}`);
  }

  if (options.secure) {
    segments.push("Secure");
  }

  if (options.maxAge !== undefined) {
    segments.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }

  if (options.expires instanceof Date) {
    segments.push(`Expires=${options.expires.toUTCString()}`);
  }

  return segments.join("; ");
}

function createSessionCookie(config, sessionId, secureRequest) {
  return serializeCookie(config.sessionCookieName, sessionId, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: secureRequest,
    maxAge: config.sessionTtlDays * 24 * 60 * 60,
  });
}

function clearSessionCookie(config, secureRequest) {
  return serializeCookie(config.sessionCookieName, "", {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: secureRequest,
    expires: new Date(0),
    maxAge: 0,
  });
}

function createOauthStateRecord(config, provider, returnTo) {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const state = crypto.randomBytes(24).toString("base64url");
  const nonce = crypto.randomBytes(24).toString("base64url");
  const expiresAt = addMinutes(new Date(), config.oauthStateTtlMinutes).toISOString();

  return {
    provider,
    state,
    nonce,
    codeVerifier: verifier,
    returnTo,
    expiresAt,
  };
}

function isSecureRequest(request) {
  if (request.socket.encrypted) return true;
  const forwardedProto = request.headers["x-forwarded-proto"];
  return typeof forwardedProto === "string" && forwardedProto.split(",")[0].trim() === "https";
}

function sessionExpiry(config) {
  return addDays(new Date(), config.sessionTtlDays).toISOString();
}

module.exports = {
  clearSessionCookie,
  createOauthStateRecord,
  createSessionCookie,
  isSecureRequest,
  parseCookies,
  sessionExpiry,
};
