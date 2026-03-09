const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { buildDeck, nowIso, randomId, toUsernameKey, validateUsername } = require("./utils");

function openDatabase(config) {
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  const db = new DatabaseSync(config.databasePath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      auth_provider TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      username_key TEXT NOT NULL DEFAULT '',
      username_set_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS users_username_key_unique
      ON users(username_key)
      WHERE username_key <> '';

    CREATE TABLE IF NOT EXISTS auth_identities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_subject TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS auth_identities_provider_subject_unique
      ON auth_identities(provider, provider_subject);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      user_agent TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      nonce TEXT NOT NULL,
      code_verifier TEXT NOT NULL,
      return_to TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mode TEXT NOT NULL,
      deck_json TEXT NOT NULL,
      current_index INTEGER NOT NULL DEFAULT 0,
      streak_safe_count INTEGER NOT NULL DEFAULT 0,
      deck_cycle INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS leaderboard_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mode TEXT NOT NULL,
      score_value INTEGER NOT NULL,
      username_snapshot TEXT NOT NULL,
      game_session_id TEXT REFERENCES game_sessions(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );
  `);

  const statements = {
    insertUser: db.prepare(`
      INSERT INTO users (id, auth_provider, username, username_key, username_set_at, created_at, updated_at, last_seen_at)
      VALUES (?, ?, '', '', NULL, ?, ?, ?)
    `),
    getUserById: db.prepare(`SELECT * FROM users WHERE id = ?`),
    getUserBySessionId: db.prepare(`
      SELECT users.*
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.id = ? AND sessions.expires_at > ?
      LIMIT 1
    `),
    deleteSession: db.prepare(`DELETE FROM sessions WHERE id = ?`),
    deleteAllSessionsForUser: db.prepare(`DELETE FROM sessions WHERE user_id = ?`),
    insertSession: db.prepare(`
      INSERT INTO sessions (id, user_id, created_at, updated_at, expires_at, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    touchSession: db.prepare(`
      UPDATE sessions
      SET updated_at = ?, expires_at = ?
      WHERE id = ?
    `),
    touchUser: db.prepare(`
      UPDATE users
      SET last_seen_at = ?, updated_at = ?
      WHERE id = ?
    `),
    findIdentity: db.prepare(`
      SELECT users.*
      FROM auth_identities
      JOIN users ON users.id = auth_identities.user_id
      WHERE auth_identities.provider = ? AND auth_identities.provider_subject = ?
      LIMIT 1
    `),
    insertIdentity: db.prepare(`
      INSERT INTO auth_identities (id, user_id, provider, provider_subject, email, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    updateIdentityEmail: db.prepare(`
      UPDATE auth_identities
      SET email = ?, updated_at = ?
      WHERE provider = ? AND provider_subject = ?
    `),
    usernameOwner: db.prepare(`
      SELECT id FROM users WHERE username_key = ? LIMIT 1
    `),
    updateUsername: db.prepare(`
      UPDATE users
      SET username = ?, username_key = ?, username_set_at = ?, updated_at = ?, last_seen_at = ?
      WHERE id = ?
    `),
    insertOauthState: db.prepare(`
      INSERT INTO oauth_states (state, provider, nonce, code_verifier, return_to, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    getOauthState: db.prepare(`
      SELECT * FROM oauth_states WHERE state = ? AND provider = ? AND expires_at > ? LIMIT 1
    `),
    deleteOauthState: db.prepare(`DELETE FROM oauth_states WHERE state = ?`),
    cleanupOauthStates: db.prepare(`DELETE FROM oauth_states WHERE expires_at <= ?`),
    cleanupExpiredSessions: db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`),
    getGameById: db.prepare(`
      SELECT * FROM game_sessions
      WHERE id = ? AND user_id = ? AND status = 'active'
      LIMIT 1
    `),
    cancelActiveGames: db.prepare(`
      UPDATE game_sessions
      SET status = 'cancelled', updated_at = ?, completed_at = ?
      WHERE user_id = ? AND status = 'active'
    `),
    insertGame: db.prepare(`
      INSERT INTO game_sessions (id, user_id, mode, deck_json, current_index, streak_safe_count, deck_cycle, status, created_at, updated_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL)
    `),
    updateGameProgress: db.prepare(`
      UPDATE game_sessions
      SET deck_json = ?, current_index = ?, streak_safe_count = ?, deck_cycle = ?, updated_at = ?
      WHERE id = ?
    `),
    completeGame: db.prepare(`
      UPDATE game_sessions
      SET deck_json = ?, current_index = ?, streak_safe_count = ?, deck_cycle = ?, status = ?, updated_at = ?, completed_at = ?
      WHERE id = ?
    `),
    insertLeaderboardEntry: db.prepare(`
      INSERT INTO leaderboard_entries (id, user_id, mode, score_value, username_snapshot, game_session_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
  };

  function cleanup() {
    const now = nowIso();
    statements.cleanupOauthStates.run(now);
    statements.cleanupExpiredSessions.run(now);
  }

  function createUser(authProvider) {
    const timestamp = nowIso();
    const userId = randomId("player");
    statements.insertUser.run(userId, authProvider, timestamp, timestamp, timestamp);
    return statements.getUserById.get(userId);
  }

  function getUserFromSession(sessionId) {
    if (!sessionId) return null;
    cleanup();
    const user = statements.getUserBySessionId.get(sessionId, nowIso());
    return user || null;
  }

  function createSession(userId, { userAgent = "", expiresAt }) {
    const timestamp = nowIso();
    const sessionId = randomId("session");
    statements.deleteAllSessionsForUser.run(userId);
    statements.insertSession.run(sessionId, userId, timestamp, timestamp, expiresAt, userAgent);
    return sessionId;
  }

  function deleteSession(sessionId) {
    if (!sessionId) return;
    statements.deleteSession.run(sessionId);
  }

  function touchUserAndSession(userId, sessionId, expiresAt) {
    const timestamp = nowIso();
    statements.touchUser.run(timestamp, timestamp, userId);
    if (sessionId) {
      statements.touchSession.run(timestamp, expiresAt, sessionId);
    }
    return statements.getUserById.get(userId);
  }

  function createGuestUser() {
    return createUser("guest");
  }

  function getOrCreateProviderUser(provider, subject, email = "") {
    const existing = statements.findIdentity.get(provider, subject);
    if (existing) {
      statements.updateIdentityEmail.run(email, nowIso(), provider, subject);
      return existing;
    }

    const user = createUser(provider);
    const timestamp = nowIso();
    statements.insertIdentity.run(
      randomId("identity"),
      user.id,
      provider,
      subject,
      email,
      timestamp,
      timestamp,
    );
    return statements.getUserById.get(user.id);
  }

  function checkUsernameAvailability(username, currentUserId = null) {
    const validation = validateUsername(username);
    if (!validation.valid) {
      return {
        available: false,
        error: validation.error,
        normalized: validation.normalized,
      };
    }

    const owner = statements.usernameOwner.get(toUsernameKey(validation.normalized));
    return {
      available: !owner || owner.id === currentUserId,
      error: owner && owner.id !== currentUserId ? "That username is already taken." : "",
      normalized: validation.normalized,
    };
  }

  function setUsername(userId, username) {
    const availability = checkUsernameAvailability(username, userId);
    if (!availability.available) {
      throw new Error(availability.error || "That username is already taken.");
    }

    const timestamp = nowIso();
    statements.updateUsername.run(
      availability.normalized,
      toUsernameKey(availability.normalized),
      timestamp,
      timestamp,
      timestamp,
      userId,
    );
    return statements.getUserById.get(userId);
  }

  function saveOauthState(record) {
    const timestamp = nowIso();
    statements.insertOauthState.run(
      record.state,
      record.provider,
      record.nonce,
      record.codeVerifier,
      record.returnTo,
      timestamp,
      record.expiresAt,
    );
  }

  function consumeOauthState(provider, state) {
    cleanup();
    const record = statements.getOauthState.get(state, provider, nowIso());
    if (!record) return null;
    statements.deleteOauthState.run(state);
    return record;
  }

  function createGame(userId, mode) {
    if (!["classic", "streak"].includes(mode)) {
      throw new Error("Unsupported game mode.");
    }

    const timestamp = nowIso();
    statements.cancelActiveGames.run(timestamp, timestamp, userId);

    const gameId = randomId("game");
    const deck = buildDeck();
    statements.insertGame.run(
      gameId,
      userId,
      mode,
      JSON.stringify(deck),
      0,
      0,
      1,
      timestamp,
      timestamp,
    );

    return {
      id: gameId,
      user_id: userId,
      mode,
      deck_json: JSON.stringify(deck),
      current_index: 0,
      streak_safe_count: 0,
      deck_cycle: 1,
      status: "active",
    };
  }

  function getActiveGame(userId, gameId) {
    const game = statements.getGameById.get(gameId, userId);
    return game || null;
  }

  function addLeaderboardEntry(userId, mode, scoreValue, usernameSnapshot, gameSessionId) {
    statements.insertLeaderboardEntry.run(
      randomId("entry"),
      userId,
      mode,
      scoreValue,
      usernameSnapshot,
      gameSessionId,
      nowIso(),
    );
  }

  function resolveGameGuess(user, gameId, guess) {
    const game = getActiveGame(user.id, gameId);
    if (!game) {
      throw new Error("No active game was found.");
    }

    const deck = JSON.parse(game.deck_json);
    const card = deck[game.current_index];
    if (!card) {
      throw new Error("The current game is in an invalid state.");
    }

    const guessedRank = String(guess ?? "").trim().toUpperCase();
    if (!guessedRank) {
      throw new Error("A guess is required.");
    }

    const isMatch = guessedRank === card.rank;
    const timestamp = nowIso();
    const currentIndex = Number(game.current_index);
    const streakSafeCount = Number(game.streak_safe_count);
    const finalClassicCard = game.mode === "classic" && currentIndex === 51;

    if (isMatch) {
      const completedAt = nowIso();
      statements.completeGame.run(
        JSON.stringify(deck),
        currentIndex,
        streakSafeCount,
        Number(game.deck_cycle),
        "lost",
        timestamp,
        completedAt,
        game.id,
      );

      if (game.mode === "streak" && streakSafeCount > 0 && user.username) {
        addLeaderboardEntry(user.id, "streak", streakSafeCount, user.username, game.id);
      }

      return {
        status: "loss",
        finalReveal: finalClassicCard,
        card,
        nextIndex: currentIndex,
        streakSafeCount,
        deckReset: false,
      };
    }

    if (finalClassicCard) {
      const nextIndex = currentIndex + 1;
      const completedAt = nowIso();
      statements.completeGame.run(
        JSON.stringify(deck),
        nextIndex,
        streakSafeCount,
        Number(game.deck_cycle),
        "won",
        timestamp,
        completedAt,
        game.id,
      );

      if (user.username) {
        addLeaderboardEntry(user.id, "classic", 1, user.username, game.id);
      }

      return {
        status: "win",
        finalReveal: true,
        card,
        nextIndex,
        streakSafeCount,
        deckReset: false,
      };
    }

    if (game.mode === "classic") {
      const nextIndex = currentIndex + 1;
      statements.updateGameProgress.run(
        JSON.stringify(deck),
        nextIndex,
        streakSafeCount,
        Number(game.deck_cycle),
        timestamp,
        game.id,
      );

      return {
        status: "safe",
        finalReveal: false,
        card,
        nextIndex,
        streakSafeCount,
        deckReset: false,
      };
    }

    let nextDeck = deck;
    let nextIndex = currentIndex + 1;
    const nextStreak = streakSafeCount + 1;
    let deckCycle = Number(game.deck_cycle);
    let deckReset = false;

    if (nextIndex >= 52) {
      nextDeck = buildDeck();
      nextIndex = 0;
      deckCycle += 1;
      deckReset = true;
    }

    statements.updateGameProgress.run(
      JSON.stringify(nextDeck),
      nextIndex,
      nextStreak,
      deckCycle,
      timestamp,
      game.id,
    );

    return {
      status: "safe",
      finalReveal: false,
      card,
      nextIndex,
      streakSafeCount: nextStreak,
      deckReset,
    };
  }

  function fetchLeaderboards(limit, offset) {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 30));
    const safeOffset = Math.max(0, Number(offset) || 0);

    const classic = db.prepare(`
      SELECT
        users.id AS playerId,
        users.username AS username,
        COUNT(*) AS classicWins,
        MAX(leaderboard_entries.created_at) AS updatedAt
      FROM leaderboard_entries
      JOIN users ON users.id = leaderboard_entries.user_id
      WHERE leaderboard_entries.mode = 'classic' AND users.username <> ''
      GROUP BY users.id, users.username
      ORDER BY classicWins DESC, updatedAt DESC, username ASC
      LIMIT ? OFFSET ?
    `).all(safeLimit, safeOffset);

    const classicTotal = db.prepare(`
      SELECT COUNT(*) AS total
      FROM (
        SELECT users.id
        FROM leaderboard_entries
        JOIN users ON users.id = leaderboard_entries.user_id
        WHERE leaderboard_entries.mode = 'classic' AND users.username <> ''
        GROUP BY users.id
      )
    `).get().total;

    const streak = db.prepare(`
      SELECT
        users.id AS playerId,
        users.username AS username,
        MAX(leaderboard_entries.score_value) AS bestStreak,
        MAX(leaderboard_entries.created_at) AS updatedAt
      FROM leaderboard_entries
      JOIN users ON users.id = leaderboard_entries.user_id
      WHERE leaderboard_entries.mode = 'streak' AND users.username <> ''
      GROUP BY users.id, users.username
      ORDER BY bestStreak DESC, updatedAt DESC, username ASC
      LIMIT ? OFFSET ?
    `).all(safeLimit, safeOffset);

    const streakTotal = db.prepare(`
      SELECT COUNT(*) AS total
      FROM (
        SELECT users.id
        FROM leaderboard_entries
        JOIN users ON users.id = leaderboard_entries.user_id
        WHERE leaderboard_entries.mode = 'streak' AND users.username <> ''
        GROUP BY users.id
      )
    `).get().total;

    return {
      classic: {
        items: classic.map((row) => ({ ...row, classicWins: Number(row.classicWins) })),
        limit: safeLimit,
        offset: safeOffset,
        totalPlayers: Number(classicTotal),
        hasMore: safeOffset + classic.length < Number(classicTotal),
        nextOffset: safeOffset + classic.length < Number(classicTotal) ? safeOffset + classic.length : null,
      },
      streak: {
        items: streak.map((row) => ({ ...row, bestStreak: Number(row.bestStreak) })),
        limit: safeLimit,
        offset: safeOffset,
        totalPlayers: Number(streakTotal),
        hasMore: safeOffset + streak.length < Number(streakTotal),
        nextOffset: safeOffset + streak.length < Number(streakTotal) ? safeOffset + streak.length : null,
      },
    };
  }

  return {
    createGame,
    createGuestUser,
    createSession,
    deleteSession,
    consumeOauthState,
    checkUsernameAvailability,
    fetchLeaderboards,
    getOrCreateProviderUser,
    getUserFromSession,
    resolveGameGuess,
    saveOauthState,
    setUsername,
    touchUserAndSession,
  };
}

module.exports = { openDatabase };
