const suits = ["♣", "♥", "♠", "♦"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const redSuits = new Set(["♥", "♦"]);
const loseFlipDurationMs = 400;
const cardDesigns = [
  { label: "Classic Red", file: "back_images/backcard.png" },
  { label: "Classic Blue", file: "back_images/backcard2.png" },
];

const state = {
  deck: [],
  index: 0,
  gameOver: false,
  isAnimating: false,
  discardTimer: null,
  sessionId: 0,
  muted: false,
  hasStarted: false,
  settingsOpen: false,
  selectedCardBack: cardDesigns[0].file,
};

const el = {
  card: document.getElementById("card"),
  front: document.querySelector(".front"),
  rank: document.getElementById("card-rank"),
  suits: [...document.querySelectorAll("[data-card-suit]")],
  cardText: document.getElementById("card-text"),
  remaining: document.getElementById("remaining"),
  round: document.getElementById("round"),
  result: document.getElementById("result"),
  grid: document.getElementById("guess-grid"),
  restart: document.getElementById("restart"),
  muteToggle: document.getElementById("mute-toggle"),
  settingsToggle: document.getElementById("settings-toggle"),
  settingsOverlay: document.getElementById("settings-overlay"),
  settingsClose: document.getElementById("settings-close"),
  cardDesignSelect: document.getElementById("card-design-select"),
};

const sounds = {
  safe: new Audio("Sounds/safe_guess_sound.mp3"),
  lose: new Audio("Sounds/lose_sound.mp3"),
  win: new Audio("Sounds/Winning_sound.mp3"),
  newGame: new Audio("Sounds/new_game_sound.mp3"),
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

function setupCardDesignOptions() {
  el.cardDesignSelect.innerHTML = "";
  cardDesigns.forEach((design) => {
    const option = document.createElement("option");
    option.value = design.file;
    option.textContent = design.label;
    el.cardDesignSelect.appendChild(option);
  });
  el.cardDesignSelect.value = state.selectedCardBack;
  applyCardBackDesign(state.selectedCardBack);
}

function applyCardBackDesign(cardImagePath) {
  state.selectedCardBack = cardImagePath;
  document.documentElement.style.setProperty("--card-back-image", `url('${cardImagePath}')`);
}

function setSettingsOpen(open) {
  state.settingsOpen = open;
  el.settingsOverlay.hidden = !open;
  document.body.classList.toggle("modal-open", open);
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

function playSound(name) {
  if (state.muted) return;

  const sound = sounds[name];
  if (!sound) return;

  sound.currentTime = 0;
  sound.play().catch(() => {});
}

function updateMuteButton() {
  el.muteToggle.textContent = state.muted ? "🔇 Sound Off" : "🔊 Sound On";
  el.muteToggle.setAttribute("aria-pressed", String(state.muted));
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
  el.card.classList.remove("face-down", "discarding", "lose-flip");
  el.card.classList.add("revealed");
}

function hideCard() {
  el.card.classList.remove("revealed", "shake", "win-glow", "discarding", "lose-flip");
  el.card.classList.add("face-down", "pulse");
  el.rank.textContent = "?";
  el.suits.forEach((suit) => {
    suit.textContent = "♠";
  });
  el.front.classList.remove("red-suit");
  el.cardText.textContent = "Face-down card waiting...";
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

function lose(card, guessed) {
  state.gameOver = true;
  state.isAnimating = true;

  setButtonsEnabled(false);
  setResult("You Lose", "bad");
  el.cardText.textContent = `You guessed ${guessed}. Card was ${card.rank} of ${card.suit}.`;
  spawnParticles("#ff5d70");

  setRevealedCardContent(card);
  el.card.classList.remove("pulse", "discarding", "revealed", "shake", "win-glow");
  el.card.classList.add("face-down", "lose-flip");

  const onFlipEnd = (event) => {
    if (event.animationName !== "loseFlip") return;
    el.card.removeEventListener("animationend", onFlipEnd);
    el.card.classList.remove("lose-flip");
    el.card.classList.add("revealed");
    playSound("lose");
    state.isAnimating = false;
  };

  el.card.addEventListener("animationend", onFlipEnd);

  setTimeout(() => {
    if (!state.isAnimating) return;
    el.card.removeEventListener("animationend", onFlipEnd);
    el.card.classList.remove("lose-flip");
    el.card.classList.add("revealed");
    playSound("lose");
    state.isAnimating = false;
  }, loseFlipDurationMs + 40);
}

function win() {
  state.gameOver = true;
  el.card.classList.remove("pulse", "discarding");
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
  el.cardText.textContent = `Safe! ${guessed} was not the card value.`;
  playSound("safe");
  const animationSessionId = state.sessionId;

  state.discardTimer = setTimeout(() => {
    if (animationSessionId !== state.sessionId) return;

    state.discardTimer = null;
    state.index += 1;
    updateStats();

    if (state.index >= 52) {
      el.card.classList.remove("discarding");
      win();
      return;
    }

    hideCard();
    setResult("Make your guess", "neutral");
    setButtonsEnabled(true);
    state.isAnimating = false;
  }, 560);
}

function handleGuess(guess) {
  if (state.gameOver || state.isAnimating || state.settingsOpen) return;

  const card = state.deck[state.index];

  if (guess === card.rank) {
    lose(card, guess);
    updateStats();
    return;
  }

  runSafeDiscardAnimation(guess);
}

function newGame() {
  clearDiscardTimer();
  state.sessionId += 1;

  if (state.hasStarted) {
    playSound("newGame");
  }
  state.deck = buildDeck();
  state.index = 0;
  state.gameOver = false;
  state.isAnimating = false;
  hideCard();
  setButtonsEnabled(true);
  setResult("Make your guess", "neutral");
  updateStats();
  state.hasStarted = true;
}

makeButtons();
setupCardDesignOptions();
updateMuteButton();

el.muteToggle.addEventListener("click", () => {
  state.muted = !state.muted;
  updateMuteButton();
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

el.cardDesignSelect.addEventListener("change", (event) => {
  applyCardBackDesign(event.target.value);
});

el.restart.addEventListener("click", newGame);
newGame();
