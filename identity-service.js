(function identityServiceBootstrap(global) {
  const STORAGE_KEY = "the-trial.player-identity.v1";
  const INACTIVITY_WINDOW_MS = 2 * 60 * 60 * 1000;
  const USERNAME_PATTERN = /^[A-Za-z0-9 _-]+$/;

  function readIdentity(storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      if (!parsed.playerId || !parsed.username) return null;

      return parsed;
    } catch {
      return null;
    }
  }

  function writeIdentity(storage, identity) {
    storage.setItem(STORAGE_KEY, JSON.stringify(identity));
    return identity;
  }

  function generatePlayerId() {
    if (global.crypto?.randomUUID) {
      return global.crypto.randomUUID();
    }

    return `player-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function normalizeUsername(username) {
    return username.trim().replace(/\s+/g, " ");
  }

  function validateUsername(username) {
    const normalized = normalizeUsername(username ?? "");

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

  function createIdentityService(storage = global.localStorage) {
    return {
      getStoredIdentity() {
        return readIdentity(storage);
      },

      validateUsername,

      createIdentity(username) {
        const validation = validateUsername(username);
        if (!validation.valid) {
          throw new Error(validation.error);
        }

        const timestamp = new Date().toISOString();
        return writeIdentity(storage, {
          playerId: generatePlayerId(),
          username: validation.normalized,
          usernameSetAt: timestamp,
          lastSeenAt: timestamp,
        });
      },

      updateUsername(identity, username) {
        const validation = validateUsername(username);
        if (!validation.valid) {
          throw new Error(validation.error);
        }

        const timestamp = new Date().toISOString();
        return writeIdentity(storage, {
          ...identity,
          username: validation.normalized,
          usernameSetAt: timestamp,
          lastSeenAt: timestamp,
        });
      },

      touchLastSeen(identity) {
        const updatedIdentity = {
          ...identity,
          lastSeenAt: new Date().toISOString(),
        };

        return writeIdentity(storage, updatedIdentity);
      },

      shouldPromptForReturn(identity) {
        if (!identity?.lastSeenAt) return false;

        const lastSeenMs = Date.parse(identity.lastSeenAt);
        if (Number.isNaN(lastSeenMs)) return false;

        return Date.now() - lastSeenMs >= INACTIVITY_WINDOW_MS;
      },
    };
  }

  global.TheTrialIdentity = {
    createService: createIdentityService,
  };
})(window);
