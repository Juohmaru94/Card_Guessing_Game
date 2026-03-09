const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { URL } = require("node:url");
const { config } = require("./config");
const { openDatabase } = require("./db");
const { createAppleAuthorizationUrl, createGoogleAuthorizationUrl, exchangeAppleCode, exchangeGoogleCode } = require("./oauth");
const { buildPublicIdentity, resolveReturnTo } = require("./utils");
const { clearSessionCookie, createOauthStateRecord, createSessionCookie, isSecureRequest, parseCookies, sessionExpiry } = require("./security");

const db = openDatabase(config);

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

function redirect(response, location, extraHeaders = {}) {
  response.writeHead(302, { Location: location, ...extraHeaders });
  response.end();
}

function notFound(response) {
  sendJson(response, 404, { error: "Not found." });
}

function methodNotAllowed(response) {
  sendJson(response, 405, { error: "Method not allowed." });
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function parseBody(request) {
  const body = await readBody(request);
  const contentType = request.headers["content-type"] || "";
  if (!body) return {};

  if (contentType.includes("application/json")) {
    return JSON.parse(body);
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(body);
    return Object.fromEntries(params.entries());
  }

  return { raw: body };
}

function requireSameOrigin(request) {
  const method = request.method || "GET";
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;
  if (request.url?.includes("/callback")) return true;

  const origin = request.headers.origin;
  if (!origin) return true;

  return origin === config.appOrigin;
}

function getSessionContext(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  const sessionId = cookies[config.sessionCookieName] || "";
  const user = db.getUserFromSession(sessionId);
  return { sessionId, user };
}

function setSession(request, user) {
  const expiresAt = sessionExpiry(config);
  const sessionId = db.createSession(user.id, {
    userAgent: request.headers["user-agent"] || "",
    expiresAt,
  });

  const refreshedUser = db.touchUserAndSession(user.id, sessionId, expiresAt);
  return {
    user: refreshedUser,
    header: createSessionCookie(config, sessionId, isSecureRequest(request)),
  };
}

function clearSession(request, sessionId) {
  db.deleteSession(sessionId);
  return clearSessionCookie(config, isSecureRequest(request));
}

function authErrorRedirect(provider, returnTo, message) {
  const target = new URL(resolveReturnTo(returnTo, config.appOrigin));
  target.searchParams.set("authProvider", provider);
  target.searchParams.set("authError", message);
  return target.toString();
}

function authSuccessRedirect(provider, returnTo) {
  const target = new URL(resolveReturnTo(returnTo, config.appOrigin));
  target.searchParams.delete("authError");
  target.searchParams.set("authProvider", provider);
  target.searchParams.set("authStatus", "success");
  return target.toString();
}

async function handleApi(request, response, url, body) {
  if (!requireSameOrigin(request)) {
    sendJson(response, 403, { error: "Cross-site API requests are not allowed." });
    return;
  }

  const { sessionId, user } = getSessionContext(request);

  if (request.method === "GET" && url.pathname === "/api/v1/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/v1/auth/session") {
    if (!user) {
      sendJson(response, 200, { identity: null });
      return;
    }

    const refreshedUser = db.touchUserAndSession(user.id, sessionId, sessionExpiry(config));
    sendJson(response, 200, { identity: buildPublicIdentity(refreshedUser) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/v1/auth/guest") {
    const guest = db.createGuestUser();
    const session = setSession(request, guest);
    sendJson(response, 200, { identity: buildPublicIdentity(session.user) }, { "Set-Cookie": session.header });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/v1/auth/logout") {
    const header = clearSession(request, sessionId);
    sendJson(response, 200, { ok: true }, { "Set-Cookie": header });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/v1/auth/google/start-url") {
    if (!config.google.clientId || !config.google.clientSecret || !config.google.redirectUri) {
      sendJson(response, 400, { error: "Google sign-in is not configured yet." });
      return;
    }

    const returnTo = resolveReturnTo(url.searchParams.get("returnTo"), config.appOrigin);
    const stateRecord = createOauthStateRecord(config, "google", returnTo);
    db.saveOauthState(stateRecord);
    sendJson(response, 200, { redirectUrl: createGoogleAuthorizationUrl(config, stateRecord) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/v1/auth/apple/start-url") {
    if (!config.apple.clientId || !config.apple.teamId || !config.apple.keyId || !config.apple.privateKey || !config.apple.redirectUri) {
      sendJson(response, 400, { error: "Apple sign-in is not configured yet." });
      return;
    }

    const returnTo = resolveReturnTo(url.searchParams.get("returnTo"), config.appOrigin);
    const stateRecord = createOauthStateRecord(config, "apple", returnTo);
    db.saveOauthState(stateRecord);
    sendJson(response, 200, { redirectUrl: createAppleAuthorizationUrl(config, stateRecord) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/v1/profile/username-availability") {
    if (!user) {
      sendJson(response, 401, { error: "Sign in first." });
      return;
    }

    sendJson(response, 200, db.checkUsernameAvailability(url.searchParams.get("username"), user.id));
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/v1/profile/username") {
    if (!user) {
      sendJson(response, 401, { error: "Sign in first." });
      return;
    }

    try {
      const updatedUser = db.setUsername(user.id, body.username);
      sendJson(response, 200, { identity: buildPublicIdentity(updatedUser) });
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "Unable to save that username." });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/v1/profile/touch") {
    if (!user) {
      sendJson(response, 401, { error: "Sign in first." });
      return;
    }

    const refreshedUser = db.touchUserAndSession(user.id, sessionId, sessionExpiry(config));
    sendJson(response, 200, { identity: buildPublicIdentity(refreshedUser) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/v1/leaderboards") {
    const limit = Number(url.searchParams.get("limit") || 30);
    const offset = Number(url.searchParams.get("offset") || 0);
    sendJson(response, 200, db.fetchLeaderboards(limit, offset));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/v1/games") {
    if (!user || !user.username) {
      sendJson(response, 401, { error: "Choose a username before starting a new game." });
      return;
    }

    try {
      const game = db.createGame(user.id, body.mode);
      sendJson(response, 200, {
        gameId: game.id,
        mode: game.mode,
        nextIndex: Number(game.current_index),
        streakSafeCount: Number(game.streak_safe_count),
        deckReset: false,
      });
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "Unable to start a new game." });
    }
    return;
  }

  const guessMatch = url.pathname.match(/^\/api\/v1\/games\/([^/]+)\/guess$/);
  if (request.method === "POST" && guessMatch) {
    if (!user || !user.username) {
      sendJson(response, 401, { error: "Choose a username before playing." });
      return;
    }

    try {
      const result = db.resolveGameGuess(user, guessMatch[1], body.guess);
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "Unable to process that guess." });
    }
    return;
  }

  notFound(response);
}

async function handleGoogleCallback(request, response, url) {
  const query = request.method === "GET" ? Object.fromEntries(url.searchParams.entries()) : await parseBody(request);
  const stateRecord = db.consumeOauthState("google", query.state);
  const returnTo = stateRecord?.return_to || `${config.appOrigin}/`;

  if (!stateRecord || !query.code) {
    redirect(response, authErrorRedirect("google", returnTo, "google_sign_in_failed"));
    return;
  }

  try {
    const providerUser = await exchangeGoogleCode(config, stateRecord, query.code);
    const user = db.getOrCreateProviderUser("google", providerUser.subject, providerUser.email);
    const session = setSession(request, user);
    redirect(response, authSuccessRedirect("google", returnTo), { "Set-Cookie": session.header });
  } catch {
    redirect(response, authErrorRedirect("google", returnTo, "google_sign_in_failed"));
  }
}

async function handleAppleCallback(request, response, url) {
  const query = request.method === "GET" ? Object.fromEntries(url.searchParams.entries()) : await parseBody(request);
  const stateRecord = db.consumeOauthState("apple", query.state);
  const returnTo = stateRecord?.return_to || `${config.appOrigin}/`;

  if (!stateRecord || !query.code) {
    redirect(response, authErrorRedirect("apple", returnTo, "apple_sign_in_failed"));
    return;
  }

  try {
    const providerUser = await exchangeAppleCode(config, stateRecord, query.code);
    const user = db.getOrCreateProviderUser("apple", providerUser.subject, providerUser.email);
    const session = setSession(request, user);
    redirect(response, authSuccessRedirect("apple", returnTo), { "Set-Cookie": session.header });
  } catch {
    redirect(response, authErrorRedirect("apple", returnTo, "apple_sign_in_failed"));
  }
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
};

function serveStaticFile(response, filePath) {
  if (!fs.existsSync(filePath)) {
    notFound(response);
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, { "Content-Type": contentTypes[extension] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(response);
}

function handleStatic(response, url) {
  if (!config.serveStatic) {
    notFound(response);
    return;
  }

  let pathname = url.pathname;
  if (pathname === "/") pathname = "/index.html";
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(config.rootDir, safePath);

  if (!filePath.startsWith(config.rootDir)) {
    notFound(response);
    return;
  }

  serveStaticFile(response, filePath);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", config.appOrigin);

    if (url.pathname === "/api/v1/auth/google/callback" && ["GET", "POST"].includes(request.method || "")) {
      await handleGoogleCallback(request, response, url);
      return;
    }

    if (url.pathname === "/api/v1/auth/apple/callback" && ["GET", "POST"].includes(request.method || "")) {
      await handleAppleCallback(request, response, url);
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      const body = ["POST", "PUT", "PATCH"].includes(request.method || "") ? await parseBody(request) : {};
      await handleApi(request, response, url, body);
      return;
    }

    if (!["GET", "HEAD"].includes(request.method || "")) {
      methodNotAllowed(response);
      return;
    }

    handleStatic(response, url);
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
});

server.listen(config.port, () => {
  process.stdout.write(`The Trial server listening on ${config.appOrigin}\n`);
});
