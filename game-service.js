(function gameServiceBootstrap(global) {
  function buildUrl(path) {
    const base = global.TheTrialConfig?.apiBaseUrl || "/api/v1";
    return new URL(path, `${global.location.origin}${base.endsWith("/") ? base : `${base}/`}`);
  }

  async function request(path, options = {}) {
    const response = await fetch(buildUrl(path), {
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
      async startGame(mode) {
        return request("games", {
          method: "POST",
          body: JSON.stringify({ mode }),
        });
      },

      async submitGuess(gameId, guess) {
        return request(`games/${encodeURIComponent(gameId)}/guess`, {
          method: "POST",
          body: JSON.stringify({ guess }),
        });
      },
    };
  }

  global.TheTrialGame = {
    createService,
  };
})(window);
