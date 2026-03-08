(function identityServiceBootstrap(global) {
  const LEGACY_IDENTITY_KEY = "the-trial.player-identity.v1";
  const SESSION_KEY = "the-trial.auth-session.v2";
  const PLAYERS_KEY = "the-trial.player-profiles.v2";
  const USERNAME_INDEX_KEY = "the-trial.username-index.v2";
  const PROVIDER_LINK_KEY = "the-trial.provider-links.v2";
  const USERNAME_PATTERN = /^[A-Za-z0-9 _-]+$/;

  const providerLabels = {
    google: "Google",
    apple: "Apple",
    guest: "Guest",
  };

  function readJson(storage, key, fallback) {
    try {
      const raw = storage.getItem(key);
      if (!raw) return fallback;

      const parsed = JSON.parse(raw);
      if (parsed === null || typeof parsed !== "object") {
        return fallback;
      }

      return parsed;
    } catch {
      return fallback;
    }
  }

  function writeJson(storage, key, value) {
    storage.setItem(key, JSON.stringify(value));
    return value;
  }

  function normalizeUsername(username) {
    return String(username ?? "").trim().replace(/\s+/g, " ");
  }

  function toUsernameKey(username) {
    return normalizeUsername(username).toLocaleLowerCase();
  }

  function validateUsername(username) {
    const normalized = normalizeUsername(username);

    if (normalized.length < 3) {
      return { valid: false, error: "Username must be at least 3 characters.", normalized };
    }

    if (normalized.length > 20) {
      return { valid: false, error: "Username must be 20 characters or fewer.", normalized };
    }

    if (!USERNAME_PATTERN.test(normalized)) {
      return { valid: false, error: "Use letters, numbers, spaces, hyphens, or underscores only.", normalized };
    }

    return { valid: true, error: "", normalized };
  }

  function generatePlayerId() {
    if (global.crypto?.randomUUID) {
      return global.crypto.randomUUID();
    }

    return `player-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function getProviderAccountKey(provider) {
    return `${provider}:local-device`;
  }

  function getProviderLabel(provider) {
    return providerLabels[provider] ?? "Account";
  }

  function readPlayers(storage) {
    return readJson(storage, PLAYERS_KEY, {});
  }

  function writePlayers(storage, players) {
    return writeJson(storage, PLAYERS_KEY, players);
  }

  function readUsernameIndex(storage) {
    return readJson(storage, USERNAME_INDEX_KEY, {});
  }

  function writeUsernameIndex(storage, usernameIndex) {
    return writeJson(storage, USERNAME_INDEX_KEY, usernameIndex);
  }

  function readProviderLinks(storage) {
    return readJson(storage, PROVIDER_LINK_KEY, {});
  }

  function writeProviderLinks(storage, providerLinks) {
    return writeJson(storage, PROVIDER_LINK_KEY, providerLinks);
  }

  function buildPublicIdentity(record) {
    if (!record?.playerId) return null;

    return {
      playerId: record.playerId,
      username: record.username ?? "",
      usernameSetAt: record.usernameSetAt ?? null,
      lastSeenAt: record.lastSeenAt ?? null,
      authProvider: record.authProvider,
      authProviderLabel: getProviderLabel(record.authProvider),
      isGuest: record.authProvider === "guest",
    };
  }

  function writeSession(storage, playerId) {
    writeJson(storage, SESSION_KEY, { playerId });
  }

  function clearSession(storage) {
    storage.removeItem(SESSION_KEY);
  }

  function getPlayerBySession(storage) {
    const session = readJson(storage, SESSION_KEY, null);
    if (!session?.playerId) return null;

    const players = readPlayers(storage);
    return players[session.playerId] ?? null;
  }

  function savePlayer(storage, player) {
    const players = readPlayers(storage);
    players[player.playerId] = player;
    writePlayers(storage, players);
    return player;
  }

  function migrateLegacyIdentity(storage) {
    const existingSessionPlayer = getPlayerBySession(storage);
    if (existingSessionPlayer) {
      return existingSessionPlayer;
    }

    const legacyIdentity = readJson(storage, LEGACY_IDENTITY_KEY, null);
    if (!legacyIdentity?.playerId || !legacyIdentity?.username) {
      return null;
    }

    const players = readPlayers(storage);
    if (players[legacyIdentity.playerId]) {
      writeSession(storage, legacyIdentity.playerId);
      return players[legacyIdentity.playerId];
    }

    const providerLinks = readProviderLinks(storage);
    const usernameIndex = readUsernameIndex(storage);
    const timestamp = new Date().toISOString();
    const normalizedUsername = normalizeUsername(legacyIdentity.username);
    const usernameKey = toUsernameKey(normalizedUsername);
    const player = {
      playerId: legacyIdentity.playerId,
      authProvider: "guest",
      username: normalizedUsername,
      usernameKey,
      usernameSetAt: legacyIdentity.usernameSetAt ?? timestamp,
      createdAt: legacyIdentity.usernameSetAt ?? timestamp,
      lastSeenAt: legacyIdentity.lastSeenAt ?? timestamp,
    };

    players[player.playerId] = player;
    providerLinks[getProviderAccountKey("guest")] = player.playerId;
    usernameIndex[usernameKey] = player.playerId;

    writePlayers(storage, players);
    writeProviderLinks(storage, providerLinks);
    writeUsernameIndex(storage, usernameIndex);
    writeSession(storage, player.playerId);

    return player;
  }

  function assertProvider(provider) {
    if (!providerLabels[provider]) {
      throw new Error("Unsupported sign-in provider.");
    }
  }

  function getOrCreatePlayerForProvider(storage, provider) {
    assertProvider(provider);

    const providerLinks = readProviderLinks(storage);
    const players = readPlayers(storage);
    const providerAccountKey = getProviderAccountKey(provider);
    const existingPlayerId = providerLinks[providerAccountKey];

    if (existingPlayerId && players[existingPlayerId]) {
      return players[existingPlayerId];
    }

    const timestamp = new Date().toISOString();
    const player = {
      playerId: generatePlayerId(),
      authProvider: provider,
      username: "",
      usernameKey: "",
      usernameSetAt: null,
      createdAt: timestamp,
      lastSeenAt: timestamp,
    };

    players[player.playerId] = player;
    providerLinks[providerAccountKey] = player.playerId;
    writePlayers(storage, players);
    writeProviderLinks(storage, providerLinks);
    return player;
  }

  function isUsernameAvailable(storage, username, currentPlayerId = null) {
    const validation = validateUsername(username);
    if (!validation.valid) {
      return {
        available: false,
        error: validation.error,
        normalized: validation.normalized,
      };
    }

    const usernameIndex = readUsernameIndex(storage);
    const usernameKey = toUsernameKey(validation.normalized);
    const ownerId = usernameIndex[usernameKey];

    return {
      available: !ownerId || ownerId === currentPlayerId,
      error: ownerId && ownerId !== currentPlayerId ? "That username is already taken." : "",
      normalized: validation.normalized,
    };
  }

  function claimUsername(storage, playerId, username) {
    const players = readPlayers(storage);
    const player = players[playerId];

    if (!player) {
      throw new Error("No signed-in player was found.");
    }

    const availability = isUsernameAvailable(storage, username, playerId);
    if (!availability.available) {
      throw new Error(availability.error || "That username is already taken.");
    }

    const usernameIndex = readUsernameIndex(storage);
    if (player.usernameKey) {
      delete usernameIndex[player.usernameKey];
    }

    const timestamp = new Date().toISOString();
    const usernameKey = toUsernameKey(availability.normalized);

    player.username = availability.normalized;
    player.usernameKey = usernameKey;
    player.usernameSetAt = timestamp;
    player.lastSeenAt = timestamp;

    usernameIndex[usernameKey] = playerId;
    players[playerId] = player;

    writeUsernameIndex(storage, usernameIndex);
    writePlayers(storage, players);

    return player;
  }

  function touchLastSeen(storage, playerId) {
    const players = readPlayers(storage);
    const player = players[playerId];
    if (!player) return null;

    player.lastSeenAt = new Date().toISOString();
    players[playerId] = player;
    writePlayers(storage, players);
    return player;
  }

  function createIdentityService(storage = global.localStorage) {
    migrateLegacyIdentity(storage);

    return {
      getStoredIdentity() {
        migrateLegacyIdentity(storage);
        return buildPublicIdentity(getPlayerBySession(storage));
      },

      validateUsername,

      async signInWithProvider(provider) {
        const player = getOrCreatePlayerForProvider(storage, provider);
        player.lastSeenAt = new Date().toISOString();
        savePlayer(storage, player);
        writeSession(storage, player.playerId);
        return buildPublicIdentity(player);
      },

      signOut() {
        clearSession(storage);
      },

      async isUsernameAvailable(username, currentPlayerId = null) {
        return isUsernameAvailable(storage, username, currentPlayerId);
      },

      async completeProfile(identity, username) {
        if (!identity?.playerId) {
          throw new Error("Sign in before choosing a username.");
        }

        const player = claimUsername(storage, identity.playerId, username);
        writeSession(storage, player.playerId);
        return buildPublicIdentity(player);
      },

      touchLastSeen(identity) {
        if (!identity?.playerId) return null;
        return buildPublicIdentity(touchLastSeen(storage, identity.playerId));
      },
    };
  }

  global.TheTrialIdentity = {
    createService: createIdentityService,
  };
})(window);
