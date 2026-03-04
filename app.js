const suits = ["\u2663", "\u2665", "\u2660", "\u2666"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const redSuits = new Set(["\u2665", "\u2666"]);
const loseFlipDurationMs = 400;
const loseFlipSoundDelayMs = 440;
const finalFlipDistancePx = 300;
const finalFlipMaxDeg = 180;
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
  modeSectionOpen: false,
  cardDesignSectionOpen: false,
  volumeSectionOpen: false,
  selectedMode: "classic",
  sfxEnabled: true,
  musicEnabled: true,
  sfxVolume: 1,
  musicVolume: 1,
  lastOutcome: null,
  selectedCardBack: cardDesigns[0].file,
  finalRevealActive: false,
  finalRevealCompleted: false,
  finalRevealResolved: false,
  finalRevealOutcome: null,
  finalRevealGuess: null,
  finalRevealCard: null,
  finalRevealAngle: 0,
  finalRevealPointerId: null,
  finalRevealStartX: 0,
  finalRevealStartY: 0,
  finalRevealStartAngle: 0,
  finalRevealAxis: "x",
  finalRevealDirection: 1,
  finalRevealRaf: null,
  finalRevealPendingAngle: 0,
  finalRevealSoundPlayed: false,
  finalRevealReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
};

const el = {
  card: document.getElementById("card"),
  front: document.querySelector(".front"),
  rank: document.getElementById("card-rank"),
  suits: [...document.querySelectorAll("[data-card-suit]")],
  cardText: document.getElementById("card-text"),
  shuffleLayer: document.getElementById("shuffle-layer"),
  remaining: document.getElementById("remaining"),
  round: document.getElementById("round"),
  result: document.getElementById("result"),
  grid: document.getElementById("guess-grid"),
  restart: document.getElementById("restart"),
  sfxToggle: document.getElementById("sfx-toggle"),
  musicToggle: document.getElementById("music-toggle"),
  settingsToggle: document.getElementById("settings-toggle"),
  settingsOverlay: document.getElementById("settings-overlay"),
  settingsClose: document.getElementById("settings-close"),
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
  finalRevealOverlay: document.getElementById("final-reveal-overlay"),
};

const sounds = {
  safe: new Audio("Sounds/safe_guess_sound.mp3"),
  lose: new Audio("Sounds/lose_sound.mp3"),
  win: new Audio("Sounds/Winning_sound.mp3"),
  newGame: new Audio("Sounds/new_game_sound.mp3"),
  finalLoss: new Audio("Sounds/final_card_loss.mp3"),
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

function setSectionOpen(sectionName, open) {
  const section = sectionConfig[sectionName];
  if (!section) return;

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
  setSectionOpen("mode", false);
  setSectionOpen("cardDesign", false);
  setSectionOpen("volume", false);
}

function setSettingsOpen(open) {
  if (open) {
    state.settingsOpen = true;
    state.settingsClosing = false;
    el.settingsOverlay.hidden = false;
    el.settingsOverlay.classList.remove("is-closing");
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
}

function setResult(message, type = "neutral") {
  el.result.textContent = message;
  el.result.className = `value ${type}`;
}

function setButtonsEnabled(enabled) {
  const shouldDisable = !enabled || state.finalRevealActive;
  [...el.grid.querySelectorAll("button")].forEach((btn) => {
    btn.disabled = shouldDisable;
  });
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(value) {
  return 1 - (1 - value) ** 3;
}

function setFinalRevealAngle(angle) {
  const clamped = Math.max(0, Math.min(finalFlipMaxDeg, angle));
  state.finalRevealAngle = clamped;
  el.card.style.setProperty("--final-flip-angle", `${clamped}deg`);
}

function flushFinalRevealAngle() {
  state.finalRevealRaf = null;
  setFinalRevealAngle(state.finalRevealPendingAngle);
}

function queueFinalRevealAngle(angle) {
  state.finalRevealPendingAngle = angle;
  if (state.finalRevealRaf !== null) return;
  state.finalRevealRaf = requestAnimationFrame(flushFinalRevealAngle);
}

function cancelFinalRevealRaf() {
  if (state.finalRevealRaf !== null) {
    cancelAnimationFrame(state.finalRevealRaf);
    state.finalRevealRaf = null;
  }
}

function animateFinalRevealTo(targetAngle, durationMs, onComplete) {
  const startAngle = state.finalRevealAngle;
  const delta = targetAngle - startAngle;
  const startTime = performance.now();

  function frame(now) {
    const progress = clamp01((now - startTime) / durationMs);
    const eased = easeOutCubic(progress);
    setFinalRevealAngle(startAngle + delta * eased);

    if (progress < 1) {
      requestAnimationFrame(frame);
      return;
    }

    if (onComplete) onComplete();
  }

  requestAnimationFrame(frame);
}

function cleanupShockwaves() {
  document.querySelectorAll(".shockwave-ring").forEach((ring) => ring.remove());
}

function runFinalRevealVictoryEffects() {
  cleanupShockwaves();

  const cardRect = el.card.getBoundingClientRect();
  const centerX = cardRect.left + cardRect.width / 2;
  const centerY = cardRect.top + cardRect.height / 2;

  ["ring-1", "ring-2"].forEach((ringName, index) => {
    const ring = document.createElement("div");
    ring.className = `shockwave-ring ${ringName}`;
    ring.style.left = `${centerX}px`;
    ring.style.top = `${centerY}px`;
    ring.style.animationDelay = `${index * 140}ms`;
    document.body.appendChild(ring);
    ring.addEventListener("animationend", () => ring.remove(), { once: true });
  });

  el.card.classList.add("final-reveal-victory");

  const clearEffects = () => {
    el.card.classList.remove("final-reveal-victory");
    cleanupShockwaves();
  };

  sounds.win.addEventListener("ended", clearEffects, { once: true });
  setTimeout(clearEffects, 2300);
}

function playFinalRevealOutcomeSound() {
  if (state.finalRevealSoundPlayed) return;
  state.finalRevealSoundPlayed = true;

  if (state.finalRevealOutcome === "win") {
    playSound("win");
    runFinalRevealVictoryEffects();
    return;
  }

  if (!state.sfxEnabled || state.sfxVolume <= 0) return;

  sounds.finalLoss.currentTime = 0;
  sounds.finalLoss.play().catch(() => {
    playSound("lose");
  });
}

function resolveFinalRevealOutcome() {
  if (state.finalRevealResolved) return;

  state.finalRevealResolved = true;
  state.finalRevealCompleted = true;
  state.finalRevealActive = false;
  state.isAnimating = false;
  state.gameOver = true;
  state.index = 52;

  el.finalRevealOverlay.classList.remove("active");
  el.finalRevealOverlay.setAttribute("aria-hidden", "true");

  if (state.finalRevealOutcome === "win") {
    state.lastOutcome = "win";
    setResult("You Win!", "good");
    el.cardText.textContent = "Incredible! You survived all 52 cards.";
  } else {
    state.lastOutcome = "lose";
    setResult("You Lose", "bad");
    el.cardText.textContent = `You guessed ${state.finalRevealGuess}. Card was ${state.finalRevealCard.rank} of ${state.finalRevealCard.suit}.`;
  }

  updateStats();
  playFinalRevealOutcomeSound();
}

function completeFinalReveal() {
  if (state.finalRevealCompleted) return;

  state.finalRevealCompleted = true;
  el.card.classList.add("final-reveal-locked");
  el.card.classList.remove("is-dragging");
  resolveFinalRevealOutcome();
}

function handleFinalRevealPointerMove(event) {
  if (!state.finalRevealActive || state.finalRevealCompleted) return;
  if (event.pointerId !== state.finalRevealPointerId) return;

  const deltaRaw = state.finalRevealAxis === "x"
    ? event.clientX - state.finalRevealStartX
    : event.clientY - state.finalRevealStartY;
  const directionalDelta = deltaRaw * state.finalRevealDirection;
  const rotationDelta = (directionalDelta / finalFlipDistancePx) * finalFlipMaxDeg;
  queueFinalRevealAngle(state.finalRevealStartAngle + rotationDelta);
}

function finishFinalRevealPointer() {
  if (state.finalRevealPointerId !== null) {
    try {
      el.card.releasePointerCapture(state.finalRevealPointerId);
    } catch (_) {}
  }

  state.finalRevealPointerId = null;
  el.card.classList.remove("is-dragging");

  if (!state.finalRevealActive || state.finalRevealCompleted) return;

  cancelFinalRevealRaf();
  setFinalRevealAngle(state.finalRevealPendingAngle);

  const shouldComplete = state.finalRevealAngle >= finalFlipMaxDeg * 0.55;
  if (shouldComplete) {
    animateFinalRevealTo(finalFlipMaxDeg, 250, completeFinalReveal);
  } else {
    animateFinalRevealTo(0, 200);
  }
}

function handleFinalRevealPointerDown(event) {
  if (!state.finalRevealActive || state.finalRevealCompleted || state.finalRevealReducedMotion) return;

  event.preventDefault();
  const cardRect = el.card.getBoundingClientRect();
  const centerX = cardRect.left + cardRect.width / 2;
  const centerY = cardRect.top + cardRect.height / 2;
  const xOffset = event.clientX - centerX;
  const yOffset = event.clientY - centerY;

  state.finalRevealAxis = Math.abs(xOffset) >= Math.abs(yOffset) ? "x" : "y";
  if (state.finalRevealAxis === "x") {
    state.finalRevealDirection = xOffset >= 0 ? -1 : 1;
  } else {
    state.finalRevealDirection = yOffset >= 0 ? -1 : 1;
  }

  state.finalRevealPointerId = event.pointerId;
  state.finalRevealStartX = event.clientX;
  state.finalRevealStartY = event.clientY;
  state.finalRevealStartAngle = state.finalRevealAngle;

  el.card.classList.add("is-dragging");
  el.card.setPointerCapture(event.pointerId);
}

function triggerReducedMotionFinalReveal() {
  if (!state.finalRevealActive || state.finalRevealCompleted) return;
  el.card.classList.add("final-reveal-locked");
  animateFinalRevealTo(finalFlipMaxDeg, 180, completeFinalReveal);
}

function resetFinalRevealState() {
  cancelFinalRevealRaf();
  el.card.removeEventListener("click", triggerReducedMotionFinalReveal);

  state.finalRevealActive = false;
  state.finalRevealCompleted = false;
  state.finalRevealResolved = false;
  state.finalRevealOutcome = null;
  state.finalRevealGuess = null;
  state.finalRevealCard = null;
  state.finalRevealPointerId = null;
  state.finalRevealStartAngle = 0;
  state.finalRevealPendingAngle = 0;
  state.finalRevealAngle = 0;
  state.finalRevealSoundPlayed = false;

  el.finalRevealOverlay.classList.remove("active");
  el.finalRevealOverlay.setAttribute("aria-hidden", "true");
  el.card.classList.remove("final-reveal-active", "final-reveal-locked", "is-dragging", "final-reveal-victory");
  el.card.style.removeProperty("--final-flip-angle");
  cleanupShockwaves();
}

function startFinalReveal(card, guess) {
  if (state.finalRevealActive || state.finalRevealCompleted || state.finalRevealResolved) return;

  state.isAnimating = true;
  state.finalRevealActive = true;
  state.finalRevealCompleted = false;
  state.finalRevealResolved = false;
  state.finalRevealGuess = guess;
  state.finalRevealCard = card;
  state.finalRevealOutcome = guess === card.rank ? "lose" : "win";

  setRevealedCardContent(card);
  setButtonsEnabled(false);
  setResult("Final card: reveal it", "neutral");
  el.cardText.textContent = "Drag the card to reveal the final card.";

  el.finalRevealOverlay.classList.add("active");
  el.finalRevealOverlay.setAttribute("aria-hidden", "false");

  el.card.classList.remove("pulse", "revealed", "discarding", "lose-flip", "show-next-card", "show-front-face", "win-glow", "shake");
  el.card.classList.add("face-down", "final-reveal-active");
  setFinalRevealAngle(0);

  if (state.finalRevealReducedMotion) {
    el.cardText.textContent = "Tap the card to reveal the final card.";
    el.card.removeEventListener("click", triggerReducedMotionFinalReveal);
    el.card.addEventListener("click", triggerReducedMotionFinalReveal, { once: true });
  }
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
  const musicPercent = Math.round(state.musicVolume * 100);
  const sfxPercent = Math.round(state.sfxVolume * 100);

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
  el.card.classList.remove("revealed", "shake", "win-glow", "discarding", "lose-flip", "show-next-card", "show-front-face", "final-reveal-active", "final-reveal-locked", "is-dragging", "final-reveal-victory");
  el.card.classList.add("face-down", "pulse");
  el.card.style.removeProperty("--final-flip-angle");
  el.rank.textContent = "?";
  el.suits.forEach((suit) => {
    suit.textContent = "\u2660";
  });
  el.front.classList.remove("red-suit");
  el.cardText.textContent = "Face down card waiting";
}

function updateStats() {
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

function lose(card, guessed) {
  clearLoseTimer();

  state.gameOver = true;
  state.isAnimating = true;
  state.lastOutcome = "lose";

  setButtonsEnabled(false);
  setResult("You Lose", "bad");
  el.cardText.textContent = `You guessed ${guessed}. Card was ${card.rank} of ${card.suit}.`;
  spawnParticles("#ff5d70");

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

function win() {
  state.gameOver = true;
  state.lastOutcome = "win";
  el.card.classList.remove("pulse", "discarding", "show-next-card", "show-front-face");
  el.card.classList.add("win-glow");
  setButtonsEnabled(false);
  setResult("You Win!", "good");
  el.cardText.textContent = "Incredible! You survived all 52 cards.";
  spawnParticles("#35d07f");
  playSound("win");
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
    updateStats();

    if (state.index >= 52) {
      el.card.classList.remove("discarding", "show-next-card");
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

  if (state.index === 51) {
    startFinalReveal(card, guess);
    return;
  }

  if (guess === card.rank) {
    lose(card, guess);
    updateStats();
    return;
  }

  runSafeDiscardAnimation(guess);
}

function newGame() {
  clearDiscardTimer();
  clearLoseTimer();
  resetFinalRevealState();
  sounds.finalLoss.pause();
  sounds.finalLoss.currentTime = 0;
  state.sessionId += 1;

  if (state.hasStarted) {
    playSound("newGame");
  }
  state.deck = buildDeck();
  state.index = 0;
  state.gameOver = false;
  state.isAnimating = false;

  if (state.lastOutcome === "lose") {
    el.card.classList.add("instant-reset");
  }

  hideCard();
  requestAnimationFrame(() => {
    el.card.classList.remove("instant-reset");
  });
  setButtonsEnabled(true);
  setResult("Make your guess", "neutral");
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

el.card.addEventListener("pointerdown", handleFinalRevealPointerDown);
window.addEventListener("pointermove", handleFinalRevealPointerMove);
window.addEventListener("pointerup", finishFinalRevealPointer);
window.addEventListener("pointercancel", finishFinalRevealPointer);

const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
if (reducedMotionQuery.addEventListener) {
  reducedMotionQuery.addEventListener("change", (event) => {
    state.finalRevealReducedMotion = event.matches;
  });
} else {
  reducedMotionQuery.addListener((event) => {
    state.finalRevealReducedMotion = event.matches;
  });
}

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
  state.musicVolume = Number(event.target.value) / 100;
  updateVolumeUI();
  updateMusicPlayback();
});

el.sfxVolume.addEventListener("input", (event) => {
  state.sfxVolume = Number(event.target.value) / 100;
  applySfxVolume();
  updateVolumeUI();
});

el.settingsToggle.addEventListener("click", () => {
  setSettingsOpen(true);
});

el.settingsClose.addEventListener("click", () => {
  setSettingsOpen(false);
});

el.settingsOverlay.addEventListener("click", (event) => {
  if (event.target === el.settingsOverlay) {
    setSettingsOpen(false);
  }
});

el.settingsOverlay.addEventListener("animationend", (event) => {
  if (event.target === el.settingsOverlay && event.animationName === "settingsFadeOut") {
    finishSettingsCloseAnimation();
  }
});

el.restart.addEventListener("click", async () => {
  if (state.isAnimating || state.settingsOpen) return;

  clearDiscardTimer();
  clearLoseTimer();
  state.sessionId += 1;
  state.isAnimating = true;
  setButtonsEnabled(false);
  el.cardText.textContent = "Shuffling";

  await playNewGameShuffleAnimation();
  newGame();
});

const unlockMusic = () => {
  updateMusicPlayback();
  document.removeEventListener("pointerdown", unlockMusic);
  document.removeEventListener("keydown", unlockMusic);
};

document.addEventListener("pointerdown", unlockMusic, { once: true });
document.addEventListener("keydown", unlockMusic, { once: true });

function initializePreGameState() {
  hideCard();
  el.cardText.textContent = "Click New Game to shuffle";
  updateStats();
  setButtonsEnabled(false);
  setResult("", "neutral");
  state.hasStarted = false;
}

initializePreGameState();
