(function leaderboardServiceBootstrap(global) {
  const STORAGE_KEY = "the-trial.leaderboard.v1";

  const modeConfig = {
    classic: { scoreKey: "classicWins" },
    streak: { scoreKey: "bestStreak" },
  };

  function readRecords(storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return {};

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};

      return parsed;
    } catch {
      return {};
    }
  }

  function writeRecords(storage, records) {
    storage.setItem(STORAGE_KEY, JSON.stringify(records));
    return records;
  }

  function upsertPlayerRecord(records, { playerId, username }) {
    const existingRecord = records[playerId] ?? {
      playerId,
      username,
      classicWins: 0,
      bestStreak: 0,
      createdAt: new Date().toISOString(),
    };

    return {
      ...existingRecord,
      playerId,
      username,
      updatedAt: new Date().toISOString(),
    };
  }

  function sortDescending(records, scoreKey) {
    return Object.values(records)
      .filter((record) => record.username && Number(record[scoreKey]) > 0)
      .sort((left, right) => {
        const scoreDelta = Number(right[scoreKey]) - Number(left[scoreKey]);
        if (scoreDelta !== 0) return scoreDelta;

        const updatedDelta = Date.parse(right.updatedAt ?? 0) - Date.parse(left.updatedAt ?? 0);
        if (updatedDelta !== 0) return updatedDelta;

        return String(left.username).localeCompare(String(right.username));
      });
  }

  function normalizePageRequest(options = {}) {
    const limit = Math.max(1, Number(options.limit) || 30);
    const offset = Math.max(0, Number(options.offset) || 0);
    return { limit, offset };
  }

  function buildLeaderboardPage(records, mode, options = {}) {
    const config = modeConfig[mode];
    if (!config) {
      throw new Error("Unsupported leaderboard mode.");
    }

    const { limit, offset } = normalizePageRequest(options);
    const sortedRecords = sortDescending(records, config.scoreKey);
    const items = sortedRecords.slice(offset, offset + limit);
    const nextOffset = offset + items.length;

    return {
      items,
      limit,
      offset,
      totalPlayers: sortedRecords.length,
      hasMore: nextOffset < sortedRecords.length,
      nextOffset: nextOffset < sortedRecords.length ? nextOffset : null,
    };
  }

  function createService(storage = global.localStorage) {
    return {
      async saveClassicWin({ playerId, username }) {
        const records = readRecords(storage);
        const playerRecord = upsertPlayerRecord(records, { playerId, username });
        playerRecord.classicWins += 1;
        records[playerId] = playerRecord;
        writeRecords(storage, records);
        return playerRecord;
      },

      async savePlayerProfile({ playerId, username }) {
        if (!playerId || !username) return null;

        const records = readRecords(storage);
        const playerRecord = upsertPlayerRecord(records, { playerId, username });
        records[playerId] = playerRecord;
        writeRecords(storage, records);
        return playerRecord;
      },

      async saveBestStreak({ playerId, username, streak }) {
        if (!playerId || !username || streak <= 0) return null;

        const records = readRecords(storage);
        const playerRecord = upsertPlayerRecord(records, { playerId, username });
        playerRecord.bestStreak = Math.max(playerRecord.bestStreak, streak);
        records[playerId] = playerRecord;
        writeRecords(storage, records);
        return playerRecord;
      },

      async fetchLeaderboardPage(mode, options = {}) {
        const records = readRecords(storage);
        return buildLeaderboardPage(records, mode, options);
      },

      async fetchLeaderboards(options = {}) {
        const records = readRecords(storage);
        return {
          classic: buildLeaderboardPage(records, "classic", options),
          streak: buildLeaderboardPage(records, "streak", options),
        };
      },
    };
  }

  global.TheTrialLeaderboard = {
    createService,
  };
})(window);
