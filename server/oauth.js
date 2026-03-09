const crypto = require("node:crypto");
const { sha256Base64Url } = require("./utils");

function decodeJwt(token) {
  const [headerPart, payloadPart, signaturePart] = String(token).split(".");
  if (!headerPart || !payloadPart || !signaturePart) {
    throw new Error("Malformed JWT.");
  }

  const header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8"));
  const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  return { header, payload, signedData: `${headerPart}.${payloadPart}`, signature: Buffer.from(signaturePart, "base64url") };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const message = data.error_description || data.error || `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return data;
}

async function fetchJwks(jwksUri) {
  const json = await fetchJson(jwksUri);
  return Array.isArray(json.keys) ? json.keys : [];
}

function findJwk(keys, header) {
  const matches = keys.filter((key) => {
    if (header.kid && key.kid !== header.kid) return false;
    if (header.alg && key.alg && key.alg !== header.alg) return false;
    return key.kty === "RSA";
  });

  if (!matches.length) {
    throw new Error("No matching signing key was found.");
  }

  return matches[0];
}

async function verifyJwtSignature(token, jwksUri) {
  const decoded = decodeJwt(token);
  if (decoded.header.alg !== "RS256") {
    throw new Error("Unsupported token algorithm.");
  }

  const keys = await fetchJwks(jwksUri);
  const key = findJwk(keys, decoded.header);
  const publicKey = crypto.createPublicKey({ key, format: "jwk" });

  const verified = crypto.verify(
    "RSA-SHA256",
    Buffer.from(decoded.signedData, "utf8"),
    publicKey,
    decoded.signature,
  );

  if (!verified) {
    throw new Error("Invalid token signature.");
  }

  return decoded.payload;
}

function assertTokenTime(payload) {
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now >= Number(payload.exp)) {
    throw new Error("Token has expired.");
  }

  if (payload.nbf && now < Number(payload.nbf)) {
    throw new Error("Token is not active yet.");
  }
}

async function exchangeGoogleCode(config, stateRecord, code) {
  const body = new URLSearchParams({
    code,
    client_id: config.google.clientId,
    client_secret: config.google.clientSecret,
    code_verifier: stateRecord.code_verifier,
    redirect_uri: config.google.redirectUri,
    grant_type: "authorization_code",
  });

  const tokens = await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = await verifyJwtSignature(tokens.id_token, "https://www.googleapis.com/oauth2/v3/certs");
  assertTokenTime(payload);

  const issuers = new Set(["accounts.google.com", "https://accounts.google.com"]);
  if (!issuers.has(payload.iss)) {
    throw new Error("Unexpected Google token issuer.");
  }

  if (payload.aud !== config.google.clientId) {
    throw new Error("Google token audience does not match the configured client.");
  }

  if (!payload.sub) {
    throw new Error("Google token did not include a subject.");
  }

  return {
    subject: payload.sub,
    email: payload.email || "",
  };
}

function createGoogleAuthorizationUrl(config, stateRecord) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.google.clientId);
  url.searchParams.set("redirect_uri", config.google.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", stateRecord.state);
  url.searchParams.set("code_challenge", sha256Base64Url(stateRecord.codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

module.exports = {
  createGoogleAuthorizationUrl,
  exchangeGoogleCode,
};
