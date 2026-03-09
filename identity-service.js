(function identityServiceBootstrap(global) {
  const providerLabels = {
    google: "Google",
    guest: "Guest",
  };

  function buildUrl(path, query = {}) {
    const base = global.TheTrialConfig?.apiBaseUrl || "/api/v1";
    const url = new URL(path, `${global.location.origin}${base.endsWith("/") ? base : `${base}/`}`);
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, String(value));
    });
    return url;
  }

  async function request(path, options = {}) {
    const response = await fetch(buildUrl(path), {
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Request failed.");
    }

    return data;
  }

  function normalizeUsername(username) {
    return String(username ?? "").trim().replace(/\s+/g, " ");
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

  function createIdentityService() {
    return {
      async getStoredIdentity() {
        const payload = await request("auth/session", { method: "GET" });
        return payload.identity ?? null;
      },

      validateUsername,

      async signInWithProvider(provider) {
        if (provider === "guest") {
          const payload = await request("auth/guest", {
            method: "POST",
            body: JSON.stringify({}),
          });
          return payload.identity ?? null;
        }

        if (!providerLabels[provider]) {
          throw new Error("Unsupported sign-in provider.");
        }

        const returnTo = new URL(global.location.href);
        returnTo.searchParams.delete("authStatus");
        returnTo.searchParams.delete("authProvider");
        returnTo.searchParams.delete("authError");

        const response = await fetch(buildUrl(`auth/${provider}/start-url`, { returnTo: returnTo.toString() }), {
          method: "GET",
          credentials: "same-origin",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || "Unable to start sign-in.");
        }

        const redirectUrl = new URL(payload.redirectUrl);
        global.location.assign(redirectUrl.toString());
        return null;
      },

      async signOut() {
        await request("auth/logout", {
          method: "POST",
          body: JSON.stringify({}),
        });
      },

      async isUsernameAvailable(username) {
        const url = buildUrl("profile/username-availability", { username });
        const response = await fetch(url, { credentials: "same-origin" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || "Unable to check username availability.");
        }
        return data;
      },

      async completeProfile(identity, username) {
        if (!identity?.playerId) {
          throw new Error("Sign in before choosing a username.");
        }

        const payload = await request("profile/username", {
          method: "PUT",
          body: JSON.stringify({ username }),
        });
        return payload.identity ?? null;
      },

      async touchLastSeen(identity) {
        if (!identity?.playerId) return null;
        const payload = await request("profile/touch", {
          method: "POST",
          body: JSON.stringify({}),
        });
        return payload.identity ?? null;
      },
    };
  }

  global.TheTrialIdentity = {
    createService: createIdentityService,
  };
})(window);
