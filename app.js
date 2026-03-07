const suits = ["\u2663", "\u2665", "\u2660", "\u2666"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const redSuits = new Set(["\u2665", "\u2666"]);
const loseFlipDurationMs = 400;
const loseFlipSoundDelayMs = 440;
const finalRevealDimDurationMs = 800;
const finalRevealScaleDurationMs = 600;
const finalRevealFlipDurationMs = 1500;
const finalRevealSlamDurationMs = 300;
const cardDesigns = [
  { label: "Slime", file: "back_images/backcard.png" },
  { label: "Blood Daggers", file: "back_images/backcard2.png" },
];

const state = {
  deck: [],
  index: 0,
  gameOver: false,
  isAnimating: false,
  discardTimer: null,
  loseTimer: null,
  sessionId: 0,
  hasStarted: false,
  settingsOpen: false,
  settingsClosing: false,
  settingsCloseResolver: null,
  modeSectionOpen: false,
  cardDesignSectionOpen: false,
  volumeSectionOpen: false,
  activeMode: "classic",
  selectedMode: "classic",
  sfxEnabled: true,
  musicEnabled: true,
  sfxVolume: 1,
  musicVolume: 1,
  pendingSfxVolume: 1,
  pendingMusicVolume: 1,
  lastOutcome: null,
  appliedCardBack: cardDesigns[0].file,
  selectedCardBack: cardDesigns[0].file,
  finalRevealActive: false,
  finalRevealSessionId: 0,
  finalPulseInterval: null,
  streakSafeCount: 0,
};

const el = {
  card: document.getElementById("card"),
  front: document.querySelector(".front"),
  rank: document.getElementById("card-rank"),
  suits: [...document.querySelectorAll("[data-card-suit]")],
  cardText: document.getElementById("card-text"),
  shuffleLayer: document.getElementById("shuffle-layer"),
  remaining: document.getElementById("remaining"),
  remainingLabel: document.getElementById("remaining-label"),
  round: document.getElementById("round"),
  progressLabel: document.getElementById("progress-label"),
  result: document.getElementById("result"),
  grid: document.getElementById("guess-grid"),
  restart: document.getElementById("restart"),
  sfxToggle: document.getElementById("sfx-toggle"),
  musicToggle: document.getElementById("music-toggle"),
  settingsToggle: document.getElementById("settings-toggle"),
  settingsOverlay: document.getElementById("settings-overlay"),
  finalRevealOverlay: document.getElementById("final-reveal-overlay"),
  heroCard: document.getElementById("hero-card"),
  heroCardRank: document.getElementById("hero-card-rank"),
  heroSuits: [...document.querySelectorAll("[data-hero-suit]")],
  modeTitle: document.getElementById("mode-title"),
  modeSubtitle: document.getElementById("mode-subtitle"),
  settingsClose: document.getElementById("settings-close"),
  settingsConfirm: document.getElementById("settings-confirm"),
  modeToggle: document.getElementById("mode-toggle"),
  modePanel: document.getElementById("mode-panel"),
  modeOptions: document.getElementById("mode-options"),
  cardDesignToggle: document.getElementById("card-design-toggle"),
  cardDesignPanel: document.getElementById("card-design-panel"),
  cardDesignOptions: document.getElementById("card-design-options"),
  volumeToggle: document.getElementById("volume-toggle"),
  volumePanel: document.getElementById("volume-panel"),
  musicVolume: document.getElementById("music-volume"),
  musicVolumeValue: document.getElementById("music-volume-value"),
  sfxVolume: document.getElementById("sfx-volume"),
  sfxVolumeValue: document.getElementById("sfx-volume-value"),
};

const sounds = {
  safe: new Audio("Sounds/safe_guess_sound.mp3"),
  lose: new Audio("Sounds/lose_sound.mp3"),
  win: new Audio("Sounds/Winning_sound.mp3"),
  finalLoss: new Audio("Sounds/final_card_loss.mp3"),
  newGame: new Audio("Sounds/new_game_sound.mp3"),
};

const musicTrack = new Audio("Music/Ruby.mp3");
musicTrack.loop = true;
musicTrack.preload = "auto";

const sectionConfig = {
  mode: { stateKey: "modeSectionOpen", toggle: el.modeToggle, panel: el.modePanel },
  cardDesign: { stateKey: "cardDesignSectionOpen", toggle: el.cardDesignToggle, panel: el.cardDesignPanel },
  volume: { stateKey: "volumeSectionOpen", toggle: el.volumeToggle, panel: el.volumePanel },
};

Object.values(sounds).forEach((sound) => {
  sound.preload = "auto";
});

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function buildDeck() {
  const cards = [];
  suits.forEach((suit) => {
    ranks.forEach((rank) => cards.push({ rank, suit }));
  });
  return shuffle(cards);
}

function makeButtons() {
  el.grid.innerHTML = "";
  ranks.forEach((rank) => {
    const btn = document.createElement("button");
    btn.className = "guess-btn";
    btn.textContent = rank;
    btn.type = "button";
    btn.addEventListener("click", () => handleGuess(rank));
    el.grid.appendChild(btn);
  });
}

function setMode(mode) {
  state.selectedMode = mode;
  [...el.modeOptions.querySelectorAll(".mode-option")].forEach((option) => {
    const isSelected = option.dataset.mode === mode;
    option.classList.toggle("selected", isSelected);
    option.setAttribute("aria-checked", String(isSelected));
  });
}

function setupModeOptions() {
  [...el.modeOptions.querySelectorAll(".mode-option")].forEach((option) => {
    option.addEventListener("click", () => setMode(option.dataset.mode));
  });
  setMode(state.selectedMode);
}

function setupCardDesignOptions() {
  el.cardDesignOptions.innerHTML = "";
  cardDesigns.forEach((design) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "card-design-option";
    option.dataset.file = design.file;
    option.setAttribute("role", "radio");
    option.setAttribute("aria-checked", "false");
    option.innerHTML = `
      <span class="card-design-preview" style="background-image: url('${design.file}')"></span>
      <span class="card-design-name">${design.label}</span>
    `;
    option.addEventListener("click", () => applyCardBackDesign(design.file));
    el.cardDesignOptions.appendChild(option);
  });
  applyCardBackDesign(state.selectedCardBack);
}

function applyCardBackDesign(cardImagePath) {
  state.selectedCardBack = cardImagePath;
  document.documentElement.style.setProperty("--card-back-image", `url('${cardImagePath}')`);

  [...el.cardDesignOptions.querySelectorAll(".card-design-option")].forEach((option) => {
    const isSelected = option.dataset.file === cardImagePath;
    option.classList.toggle("selected", isSelected);
    option.setAttribute("aria-checked", String(isSelected));
  });
}

function setPendingVolume(type, value, options = {}) {
  const { preview = true } = options;
  const normalizedValue = clamp01(value);

  if (type === "music") {
    state.pendingMusicVolume = normalizedValue;
    if (preview) {
      state.musicVolume = normalizedValue;
      updateMusicPlayback();
    }
  } else if (type === "sfx") {
    state.pendingSfxVolume = normalizedValue;
    if (preview) {
      state.sfxVolume = normalizedValue;
      applySfxVolume();
    }
  }

  updateVolumeUI();
}

function syncSettingsDraftFromApplied() {
  setMode(state.activeMode);
  applyCardBackDesign(state.appliedCardBack);
  setPendingVolume("music", state.musicVolume, { preview: true });
  setPendingVolume("sfx", state.sfxVolume, { preview: true });
}

function discardSettingsChanges() {
  syncSettingsDraftFromApplied();
}

function updateModeUI() {
  const isStreakMode = state.activeMode === "streak";
  el.modeTitle.textContent = isStreakMode ? "Streak Mode" : "Classic Mode";
  el.modeSubtitle.textContent = isStreakMode
    ? "Survive as many cards as possible by never guessing the exact card value."
    : "Survive all 52 cards by never guessing the exact card value.";

  el.remainingLabel.textContent = isStreakMode ? "" : "Cards Remaining";
  el.progressLabel.textContent = isStreakMode ? "Streak" : "Round";
}

async function applyConfirmedSettings() {
  const previousMode = state.activeMode;
  const modeChanged = state.selectedMode !== previousMode;

  state.activeMode = state.selectedMode;
  state.appliedCardBack = state.selectedCardBack;
  state.musicVolume = state.pendingMusicVolume;
  state.sfxVolume = state.pendingSfxVolume;

  updateMusicPlayback();
  applySfxVolume();
  updateVolumeUI();
  updateModeUI();

  if (modeChanged) {
    await startNewGameSequence({ resetStreak: true });
    return;
  }

  updateStats();
}

function setSectionOpen(sectionName, open, options = {}) {
  const section = sectionConfig[sectionName];
  const { closeOthers = true } = options;
  if (!section) return;

  if (open && closeOthers) {
    Object.keys(sectionConfig).forEach((name) => {
      if (name !== sectionName) {
        setSectionOpen(name, false, { closeOthers: false });
      }
    });
  }

  state[section.stateKey] = open;
  section.toggle.setAttribute("aria-expanded", String(open));
  section.toggle.classList.toggle("is-open", open);

  if (open) {
    section.panel.hidden = false;
    const targetHeight = section.panel.scrollHeight;
    section.panel.style.maxHeight = `${targetHeight}px`;
    section.panel.style.opacity = "1";
    return;
  }

  if (section.panel.style.maxHeight === "none") {
    section.panel.style.maxHeight = `${section.panel.scrollHeight}px`;
  }

  requestAnimationFrame(() => {
    section.panel.style.maxHeight = "0px";
    section.panel.style.opacity = "0";
  });
}

function closeAllSettingsSections() {
  setSectionOpen("mode", false, { closeOthers: false });
  setSectionOpen("cardDesign", false, { closeOthers: false });
  setSectionOpen("volume", false, { closeOthers: false });
}

function setSettingsOpen(open) {
  if (open) {
    state.settingsOpen = true;
    state.settingsClosing = false;
    el.settingsOverlay.hidden = false;
    el.settingsOverlay.classList.remove("is-closing");
    syncSettingsDraftFromApplied();
    closeAllSettingsSections();
  } else if (state.settingsOpen) {
    state.settingsClosing = true;
    el.settingsOverlay.classList.add("is-closing");
  }

  document.body.classList.toggle("modal-open", open);
}

function finishSettingsCloseAnimation() {
  if (!state.settingsClosing) return;
  state.settingsClosing = false;
  state.settingsOpen = false;
  el.settingsOverlay.classList.remove("is-closing");
  el.settingsOverlay.hidden = true;

  if (typeof state.settingsCloseResolver === "function") {
    state.settingsCloseResolver();
    state.settingsCloseResolver = null;
  }
}

function closeSettingsModal(options = {}) {
  const { discard = false } = options;

  if (!state.settingsOpen) return Promise.resolve();
  if (discard) {
    discardSettingsChanges();
  }

  if (state.settingsClosing) {
    return Promise.resolve();
  }

  setSettingsOpen(false);
  return new Promise((resolve) => {
    state.settingsCloseResolver = resolve;
  });
}

function setResult(message, type = "neutral") {
  el.result.textContent = message;
  el.result.className = `value ${type}`;
}

function setButtonsEnabled(enabled) {
  [...el.grid.querySelectorAll("button")].forEach((btn) => {
    btn.disabled = !enabled;
  });
}

function setGameInputsDisabled(disabled) {
  const controls = [
    el.restart,
    el.sfxToggle,
    el.musicToggle,
    el.settingsToggle,
    el.settingsClose,
    el.settingsConfirm,
    el.modeToggle,
    el.cardDesignToggle,
    el.volumeToggle,
    el.musicVolume,
    el.sfxVolume,
    ...el.modeOptions.querySelectorAll("button"),
    ...el.cardDesignOptions.querySelectorAll("button"),
  ];

  controls.forEach((control) => {
    if (!control) return;
    control.disabled = disabled;
  });
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function setHeroCardContent(card) {
  el.heroCardRank.textContent = card.rank;
  el.heroSuits.forEach((suitNode) => {
    suitNode.textContent = card.suit;
  });

  const isRedSuit = redSuits.has(card.suit);
  el.heroCard.querySelector(".front").classList.toggle("red-suit", isRedSuit);
}

function showFinalRevealOverlay() {
  el.finalRevealOverlay.classList.add("active");
  el.finalRevealOverlay.setAttribute("aria-hidden", "false");
}

function hideFinalRevealOverlay() {
  clearFinalRevealPulses();
  el.finalRevealOverlay.classList.remove("active", "settled", "dimmed");
  el.finalRevealOverlay.setAttribute("aria-hidden", "true");
  el.heroCard.classList.remove("final-flip", "revealed", "win-pulse", "loss-pulse", "scale-up", "slam-back");
  el.heroCard.classList.add("face-down");
  el.heroCard.removeAttribute("data-outcome");
  el.card.classList.remove("final-reveal-hidden");
  el.heroCard.querySelectorAll(".hero-ring").forEach((ring) => ring.remove());
}

function playOutcomeSound(outcome) {
  if (outcome === "win") {
    playSound("win");
    return;
  }

  const finalLossSound = sounds.finalLoss;
  if (!state.sfxEnabled || state.sfxVolume <= 0) return;

  finalLossSound.currentTime = 0;
  finalLossSound.play().catch(() => {
    playSound("lose");
  });
}

function clearFinalRevealPulses() {
  if (state.finalPulseInterval !== null) {
    clearInterval(state.finalPulseInterval);
    state.finalPulseInterval = null;
  }
}

function spawnFinalRevealRing(outcome) {
  const ring = document.createElement("div");
  ring.className = `hero-ring ${outcome === "win" ? "hero-ring-win" : "hero-ring-loss"}`;
  ring.addEventListener("animationend", () => ring.remove(), { once: true });
  el.heroCard.appendChild(ring);
}

function runFinalRevealPulses(outcome) {
  clearFinalRevealPulses();
  el.heroCard.classList.remove("win-pulse", "loss-pulse");
  el.heroCard.classList.add(outcome === "win" ? "win-pulse" : "loss-pulse");
  el.heroCard.dataset.outcome = outcome;

  spawnFinalRevealRing(outcome);
  setTimeout(() => {
    if (state.finalPulseInterval === null) return;
    spawnFinalRevealRing(outcome);
  }, 300);

  state.finalPulseInterval = setInterval(() => {
    spawnFinalRevealRing(outcome);
  }, 700);
}

async function startFinalRevealSequence({ outcome, cardData, guessed }) {
  if (state.finalRevealActive) return;

  const revealSessionId = state.sessionId;
  state.finalRevealActive = true;
  state.finalRevealSessionId = revealSessionId;
  state.isAnimating = true;
  setButtonsEnabled(false);
  setGameInputsDisabled(true);

  setHeroCardContent(cardData);
  el.heroCard.classList.remove("revealed", "final-flip", "win-pulse", "loss-pulse", "scale-up", "slam-back");
  el.heroCard.classList.add("face-down");
  el.card.classList.add("final-reveal-hidden");
  el.cardText.textContent = "";

  try {
    showFinalRevealOverlay();
    // Step 1: Dim background to 75% black over 1200ms.
    void el.finalRevealOverlay.offsetWidth;
    el.finalRevealOverlay.classList.add("dimmed");
    await wait(finalRevealDimDurationMs);

    if (revealSessionId !== state.sessionId) return;

    // Step 2: Scale hero card up over 600ms.
    el.heroCard.classList.add("scale-up");
    await wait(finalRevealScaleDurationMs);

    if (revealSessionId !== state.sessionId) return;

    // Step 3: Flip card over 1500ms.
    el.heroCard.classList.add("final-flip");
    // Force style flush so the browser always animates face-down -> revealed.
    void el.heroCard.offsetWidth;
    el.heroCard.classList.remove("face-down");
    el.heroCard.classList.add("revealed");

    await wait(finalRevealFlipDurationMs + 20);

    if (revealSessionId !== state.sessionId) return;

    // Step 4: Slam card back, undim background, then start pulses.
    el.heroCard.classList.remove("scale-up");
    el.heroCard.classList.add("slam-back");
    el.finalRevealOverlay.classList.remove("dimmed");
    await wait(finalRevealSlamDurationMs);

    if (revealSessionId !== state.sessionId) return;

    el.heroCard.classList.remove("slam-back");

    if (revealSessionId !== state.sessionId) return;

    if (outcome === "win") {
      state.index += 1;
      updateStats();
      win({ skipParticles: true, skipSound: true });
      playOutcomeSound("win");
      runFinalRevealPulses("win");
    } else {
      lose(cardData, guessed, { skipEffects: true, finalReveal: true });
      playOutcomeSound("loss");
      runFinalRevealPulses("loss");
    }
  } finally {
    if (revealSessionId === state.sessionId) {
      setGameInputsDisabled(false);
      state.finalRevealActive = false;
      state.isAnimating = false;
    }
  }
}


function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(value) {
  return 1 - (1 - value) ** 3;
}

function playNewGameShuffleAnimation() {
  const cardCount = 12 + Math.floor(Math.random() * 5);
  const cards = [];
  const fanState = [];
  const layerRect = el.shuffleLayer.getBoundingClientRect();
  const deckRect = el.card.getBoundingClientRect();
  const centerX = deckRect.left - layerRect.left + deckRect.width / 2;
  const centerY = deckRect.top - layerRect.top + deckRect.height / 2;

  el.card.classList.add("shuffle-hidden");
  el.shuffleLayer.innerHTML = "";

  for (let i = 0; i < cardCount; i += 1) {
    const card = document.createElement("div");
    card.className = "shuffle-card";
    card.style.left = `${centerX - deckRect.width / 2}px`;
    card.style.top = `${centerY - deckRect.height / 2}px`;
    card.style.zIndex = String(i + 1);
    el.shuffleLayer.appendChild(card);

    const centeredIndex = i - (cardCount - 1) / 2;
    fanState.push({
      x: centeredIndex * (6 + Math.random() * 2),
      y: Math.abs(centeredIndex) * 0.7,
      rotation: -6 + Math.random() * 12,
    });

    cards.push(card);
  }

  const fanDurationMs = 260;
  const riffleDurationMs = 420;
  const collapseDurationMs = 320;
  const totalDurationMs = fanDurationMs + riffleDurationMs + collapseDurationMs;
  const riffleStart = fanDurationMs;
  const collapseStart = fanDurationMs + riffleDurationMs;

  return new Promise((resolve) => {
    const startTime = performance.now();

    function frame(now) {
      const elapsed = now - startTime;

      cards.forEach((card, i) => {
        const fan = fanState[i];
        const halfDirection = i < Math.ceil(cardCount / 2) ? -1 : 1;
        let x = 0;
        let y = 0;
        let rotation = 0;
        let scale = 1;

        if (elapsed <= fanDurationMs) {
          const progress = easeOutCubic(clamp01(elapsed / fanDurationMs));
          x = fan.x * progress;
          y = fan.y * progress;
          rotation = fan.rotation * progress;
        } else if (elapsed <= collapseStart) {
          const localElapsed = elapsed - riffleStart;
          const progress = easeOutCubic(clamp01(localElapsed / riffleDurationMs));
          const riffleWave = Math.sin(localElapsed / 34 + i * 0.85);
          const separation = (1 - progress) * 24 * halfDirection;
          x = fan.x * 0.35 + separation + riffleWave * 4;
          y = fan.y + Math.abs(riffleWave) * 5;
          rotation = fan.rotation * 0.35 + halfDirection * (1 - progress) * 8 + riffleWave * 2;
        } else {
          const localElapsed = elapsed - collapseStart;
          const progress = easeOutCubic(clamp01(localElapsed / collapseDurationMs));
          const startX = fan.x * 0.35;
          const startY = fan.y + 4;
          x = startX * (1 - progress);
          y = startY * (1 - progress);
          rotation = fan.rotation * 0.3 * (1 - progress);
          scale = 1 + Math.sin(progress * Math.PI) * 0.05;
        }

        card.style.transform = `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${scale})`;
      });

      if (elapsed < totalDurationMs) {
        requestAnimationFrame(frame);
        return;
      }

      el.shuffleLayer.innerHTML = "";
      el.card.classList.remove("shuffle-hidden");
      resolve();
    }

    requestAnimationFrame(frame);
  });
}

function applySfxVolume() {
  Object.values(sounds).forEach((sound) => {
    sound.volume = state.sfxVolume;
  });
}

function updateMusicPlayback() {
  musicTrack.volume = state.musicVolume;

  if (!state.musicEnabled) {
    musicTrack.pause();
    return;
  }

  musicTrack.play().catch(() => {});
}

function playSound(name) {
  if (!state.sfxEnabled || state.sfxVolume <= 0) return;

  const sound = sounds[name];
  if (!sound) return;

  sound.currentTime = 0;
  sound.play().catch(() => {});
}

function updateSfxToggleButton() {
  el.sfxToggle.textContent = state.sfxEnabled ? "Sound FX: On" : "Sound FX: Off";
  el.sfxToggle.setAttribute("aria-pressed", String(state.sfxEnabled));
}

function updateMusicToggleButton() {
  el.musicToggle.textContent = state.musicEnabled ? "Music: On" : "Music: Off";
  el.musicToggle.setAttribute("aria-pressed", String(state.musicEnabled));
}

function updateVolumeUI() {
  const musicPercent = Math.round(state.pendingMusicVolume * 100);
  const sfxPercent = Math.round(state.pendingSfxVolume * 100);

  el.musicVolume.value = String(musicPercent);
  el.musicVolumeValue.textContent = `${musicPercent}%`;

  el.sfxVolume.value = String(sfxPercent);
  el.sfxVolumeValue.textContent = `${sfxPercent}%`;
}

function updateFrontColor(suit) {
  const isRedSuit = redSuits.has(suit);
  el.front.classList.toggle("red-suit", isRedSuit);
}

function setRevealedCardContent(card) {
  el.rank.textContent = card.rank;
  el.suits.forEach((suit) => {
    suit.textContent = card.suit;
  });
  updateFrontColor(card.suit);
}

function revealCard(card) {
  setRevealedCardContent(card);
  el.card.classList.remove("face-down", "discarding", "lose-flip", "show-next-card", "show-front-face");
  el.card.classList.add("revealed");
}

function hideCard() {
  el.card.classList.remove("revealed", "shake", "win-glow", "discarding", "lose-flip", "show-next-card", "show-front-face");
  el.card.classList.add("face-down", "pulse");
  el.rank.textContent = "?";
  el.suits.forEach((suit) => {
    suit.textContent = "\u2660";
  });
  el.front.classList.remove("red-suit");
  el.cardText.textContent = "Face down card waiting";
}

function updateStats() {
  if (state.activeMode === "streak") {
    el.remaining.textContent = "";
    el.round.textContent = String(state.streakSafeCount);
    return;
  }

  const remaining = Math.max(52 - state.index, 0);
  el.remaining.textContent = String(remaining);
  el.round.textContent = `${Math.min(state.index + 1, 52)} / 52`;
}

function spawnParticles(color) {
  const count = 42;
  for (let i = 0; i < count; i += 1) {
    const p = document.createElement("div");
    p.className = "particle";
    p.style.left = `${window.innerWidth / 2}px`;
    p.style.top = `${window.innerHeight / 2}px`;
    p.style.background = color;
    p.style.setProperty("--tx", `${(Math.random() - 0.5) * 460}px`);
    p.style.setProperty("--ty", `${(Math.random() - 0.5) * 460}px`);
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 920);
  }
}

function clearLoseTimer() {
  if (state.loseTimer !== null) {
    clearTimeout(state.loseTimer);
    state.loseTimer = null;
  }
}

function lose(card, guessed, options = {}) {
  const { skipEffects = false, finalReveal = false } = options;

  clearLoseTimer();

  state.gameOver = true;
  state.isAnimating = true;
  state.lastOutcome = "lose";

  setButtonsEnabled(false);
  setResult("You Lose", "bad");
  el.cardText.textContent = `You guessed ${guessed}. Card was ${card.rank} of ${card.suit}.`;

  if (!skipEffects) {
    spawnParticles("#ff5d70");
  }

  if (finalReveal) {
    setRevealedCardContent(card);
    el.card.classList.remove("pulse", "discarding", "revealed", "shake", "win-glow", "show-next-card", "show-front-face", "lose-flip");
    el.card.classList.add("face-down");
    state.isAnimating = false;
    return;
  }

  setRevealedCardContent(card);
  el.card.classList.remove("pulse", "discarding", "revealed", "shake", "win-glow", "show-next-card", "show-front-face");
  el.card.classList.add("face-down", "lose-flip");

  const loseSessionId = state.sessionId;
  state.loseTimer = setTimeout(() => {
    if (loseSessionId !== state.sessionId) return;

    state.loseTimer = null;
    el.card.classList.remove("lose-flip", "face-down");
    el.card.classList.add("show-front-face");
    playSound("lose");
    state.isAnimating = false;
  }, loseFlipSoundDelayMs);
}


function win(options = {}) {
  const { skipParticles = false, skipSound = false } = options;

  state.gameOver = true;
  state.lastOutcome = "win";
  el.card.classList.remove("pulse", "discarding", "show-next-card", "show-front-face");
  el.card.classList.add("win-glow");
  setButtonsEnabled(false);
  setResult("You Win!", "good");
  

  if (!skipParticles) {
    spawnParticles("#35d07f");
  }

  if (!skipSound) {
    playSound("win");
  }

  state.isAnimating = false;
}


function clearDiscardTimer() {
  if (state.discardTimer !== null) {
    clearTimeout(state.discardTimer);
    state.discardTimer = null;
  }
}

function runSafeDiscardAnimation(guessed) {
  clearDiscardTimer();
  state.isAnimating = true;
  setButtonsEnabled(false);
  setResult("Safe guess", "good");
  el.card.classList.remove("pulse", "revealed", "shake", "win-glow", "lose-flip");
  el.card.classList.add("face-down", "discarding");

  if (state.index < 51) {
    el.card.classList.add("show-next-card");
  } else {
    el.card.classList.remove("show-next-card");
  }
  el.cardText.textContent = `Safe! ${guessed} was not the card value.`;
  playSound("safe");
  const animationSessionId = state.sessionId;

  state.discardTimer = setTimeout(() => {
    if (animationSessionId !== state.sessionId) return;

    state.discardTimer = null;
    state.index += 1;
    if (state.activeMode === "streak") {
      state.streakSafeCount += 1;
    }
    updateStats();

    if (state.index >= 52) {
      el.card.classList.remove("discarding", "show-next-card");
      if (state.activeMode === "streak") {
        startNextStreakDeck();
        return;
      }
      win();
      return;
    }

    el.card.classList.remove("show-next-card");
    hideCard();
    setResult("Make your guess", "neutral");
    setButtonsEnabled(true);
    state.isAnimating = false;
  }, 560);
}

function handleGuess(guess) {
  if (state.gameOver || state.isAnimating || state.settingsOpen || state.finalRevealActive) return;

  const card = state.deck[state.index];

  if (state.activeMode === "classic" && state.index === 51) {
    const outcome = guess === card.rank ? "loss" : "win";
    startFinalRevealSequence({ outcome, cardData: card, guessed: guess });
    return;
  }

  if (guess === card.rank) {
    lose(card, guess);
    updateStats();
    return;
  }

  runSafeDiscardAnimation(guess);
}

function startNextStreakDeck() {
  state.deck = buildDeck();
  state.index = 0;
  state.gameOver = false;
  state.isAnimating = false;
  hideCard();
  updateStats();
  setButtonsEnabled(true);
  setResult("Make your guess", "neutral");
  el.cardText.textContent = "Streak continues. New deck shuffled.";
  playSound("newGame");
}

async function startNewGameSequence(options = {}) {
  const { resetStreak = true } = options;

  clearDiscardTimer();
  clearLoseTimer();
  hideFinalRevealOverlay();
  state.sessionId += 1;
  state.isAnimating = true;
  setButtonsEnabled(false);
  el.cardText.textContent = "Shuffling";

  await playNewGameShuffleAnimation();
  newGame({ resetStreak });
}

function newGame(options = {}) {
  const { resetStreak = true } = options;

  clearDiscardTimer();
  clearLoseTimer();
  state.sessionId += 1;

  if (state.hasStarted) {
    playSound("newGame");
  }
  state.deck = buildDeck();
  state.index = 0;
  state.gameOver = false;
  state.isAnimating = false;
  state.finalRevealActive = false;
  if (resetStreak) {
    state.streakSafeCount = 0;
  }

  hideFinalRevealOverlay();

  if (state.lastOutcome === "lose") {
    el.card.classList.add("instant-reset");
  }

  hideCard();
  requestAnimationFrame(() => {
    el.card.classList.remove("instant-reset");
  });
  setButtonsEnabled(true);
  setResult("Make your guess", "neutral");
  updateModeUI();
  updateStats();
  state.lastOutcome = null;
  state.hasStarted = true;
}

function setupSectionToggle(sectionName) {
  const section = sectionConfig[sectionName];

  section.toggle.addEventListener("click", () => {
    setSectionOpen(sectionName, !state[section.stateKey]);
  });

  section.panel.addEventListener("transitionend", (event) => {
    if (event.propertyName !== "max-height") return;

    if (state[section.stateKey]) {
      section.panel.style.maxHeight = "none";
      return;
    }

    section.panel.hidden = true;
  });
}

makeButtons();
setupModeOptions();
setupCardDesignOptions();
applySfxVolume();
updateVolumeUI();
updateSfxToggleButton();
updateMusicToggleButton();
updateMusicPlayback();
setSettingsOpen(false);
closeAllSettingsSections();
setupSectionToggle("mode");
setupSectionToggle("cardDesign");
setupSectionToggle("volume");

el.sfxToggle.addEventListener("click", () => {
  state.sfxEnabled = !state.sfxEnabled;
  updateSfxToggleButton();
});

el.musicToggle.addEventListener("click", () => {
  state.musicEnabled = !state.musicEnabled;
  updateMusicToggleButton();
  updateMusicPlayback();
});

el.musicVolume.addEventListener("input", (event) => {
  setPendingVolume("music", Number(event.target.value) / 100, { preview: true });
});

el.sfxVolume.addEventListener("input", (event) => {
  setPendingVolume("sfx", Number(event.target.value) / 100, { preview: true });
});

el.settingsToggle.addEventListener("click", () => {
  setSettingsOpen(true);
});

el.settingsClose.addEventListener("click", () => {
  closeSettingsModal({ discard: true });
});

el.settingsConfirm.addEventListener("click", async () => {
  await closeSettingsModal();
  await applyConfirmedSettings();
});

el.settingsOverlay.addEventListener("click", (event) => {
  if (event.target === el.settingsOverlay) {
    closeSettingsModal({ discard: true });
  }
});

el.settingsOverlay.addEventListener("animationend", (event) => {
  if (event.target === el.settingsOverlay && event.animationName === "settingsFadeOut") {
    finishSettingsCloseAnimation();
  }
});

el.restart.addEventListener("click", async () => {
  if (state.isAnimating || state.settingsOpen) return;
  await startNewGameSequence();
});

const unlockMusic = () => {
  updateMusicPlayback();
  document.removeEventListener("pointerdown", unlockMusic);
  document.removeEventListener("keydown", unlockMusic);
};

document.addEventListener("pointerdown", unlockMusic, { once: true });
document.addEventListener("keydown", unlockMusic, { once: true });

function initializePreGameState() {
  updateModeUI();
  hideCard();
  el.cardText.textContent = "Click New Game to shuffle";
  updateStats();
  setButtonsEnabled(false);
  setResult("", "neutral");
  state.hasStarted = false;
}

initializePreGameState();
