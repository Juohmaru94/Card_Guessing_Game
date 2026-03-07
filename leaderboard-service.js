(function leaderboardServiceBootstrap(global) {
  const STORAGE_KEY = "the-trial.leaderboard.v1";

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
      .filter((record) => Number(record[scoreKey]) > 0)
      .sort((left, right) => {
        const scoreDelta = Number(right[scoreKey]) - Number(left[scoreKey]);
        if (scoreDelta !== 0) return scoreDelta;

        const updatedDelta = Date.parse(right.updatedAt ?? 0) - Date.parse(left.updatedAt ?? 0);
        if (updatedDelta !== 0) return updatedDelta;

        return String(left.username).localeCompare(String(right.username));
      });
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
        const records = readRecords(storage);
        const playerRecord = upsertPlayerRecord(records, { playerId, username });
        records[playerId] = playerRecord;
        writeRecords(storage, records);
        return playerRecord;
      },

      async saveBestStreak({ playerId, username, streak }) {
        if (streak <= 0) return null;

        const records = readRecords(storage);
        const playerRecord = upsertPlayerRecord(records, { playerId, username });
        playerRecord.bestStreak = Math.max(playerRecord.bestStreak, streak);
        records[playerId] = playerRecord;
        writeRecords(storage, records);
        return playerRecord;
      },

      async fetchLeaderboards(limit = 10) {
        const records = readRecords(storage);

        return {
          classic: sortDescending(records, "classicWins").slice(0, limit),
          streak: sortDescending(records, "bestStreak").slice(0, limit),
        };
      },
    };
  }

  global.TheTrialLeaderboard = {
    createService,
  };
})(window);
