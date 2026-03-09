(function leaderboardServiceBootstrap(global) {
  function buildUrl(path, query = {}) {
    const base = global.TheTrialConfig?.apiBaseUrl || "/api/v1";
    const url = new URL(path, `${global.location.origin}${base.endsWith("/") ? base : `${base}/`}`);
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, String(value));
    });
    return url;
  }

  async function createRequest(path, options = {}) {
    const response = await fetch(buildUrl(path, options.query), {
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      method: options.method || "GET",
      body: options.body,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Request failed.");
    }

    return data;
  }

  function createService() {
    return {
      async saveClassicWin() {
        return null;
      },

      async savePlayerProfile() {
        return null;
      },

      async saveBestStreak() {
        return null;
      },

      async fetchLeaderboardPage(mode, options = {}) {
        const leaderboards = await createRequest("leaderboards", {
          query: options,
        });
        return leaderboards[mode];
      },

      async fetchLeaderboards(options = {}) {
        return createRequest("leaderboards", {
          query: options,
        });
      },
    };
  }

  global.TheTrialLeaderboard = {
    createService,
  };
})(window);
