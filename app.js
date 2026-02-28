const suits = ["♣", "♥", "♠", "♦"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const redSuits = new Set(["♥", "♦"]);

const state = {
  deck: [],
  index: 0,
  gameOver: false,
  isAnimating: false,
};

const el = {
  card: document.getElementById("card"),
  front: document.querySelector(".front"),
  rank: document.getElementById("card-rank"),
  suit: document.getElementById("card-suit"),
  cardText: document.getElementById("card-text"),
  remaining: document.getElementById("remaining"),
  round: document.getElementById("round"),
  result: document.getElementById("result"),
  grid: document.getElementById("guess-grid"),
  restart: document.getElementById("restart"),
};

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

function setResult(message, type = "neutral") {
  el.result.textContent = message;
  el.result.className = `value ${type}`;
}

function setButtonsEnabled(enabled) {
  [...el.grid.querySelectorAll("button")].forEach((btn) => {
    btn.disabled = !enabled;
  });
}

function updateFrontColor(suit) {
  const isRedSuit = redSuits.has(suit);
  el.front.classList.toggle("red-suit", isRedSuit);
}

function revealCard(card) {
  el.rank.textContent = card.rank;
  el.suit.textContent = card.suit;
  updateFrontColor(card.suit);
  el.card.classList.remove("face-down", "discarding");
  el.card.classList.add("revealed");
}

function hideCard() {
  el.card.classList.remove("revealed", "shake", "win-glow", "discarding");
  el.card.classList.add("face-down", "pulse");
  el.rank.textContent = "?";
  el.suit.textContent = "♠";
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
  revealCard(card);
  el.card.classList.remove("pulse");
  el.card.classList.add("shake");
  setButtonsEnabled(false);
  setResult("You Lose", "bad");
  el.cardText.textContent = `You guessed ${guessed}. Card was ${card.rank} of ${card.suit}.`;
  spawnParticles("#ff5d70");
  state.isAnimating = false;
}

function win() {
  state.gameOver = true;
  el.card.classList.remove("pulse");
  el.card.classList.add("win-glow");
  setButtonsEnabled(false);
  setResult("You Win!", "good");
  el.cardText.textContent = "Incredible! You survived all 52 cards.";
  spawnParticles("#35d07f");
  state.isAnimating = false;
}

function runSafeDiscardAnimation(guessed) {
  state.isAnimating = true;
  setButtonsEnabled(false);
  setResult("Safe guess", "good");
  el.card.classList.remove("pulse", "revealed", "shake", "win-glow");
  el.card.classList.add("face-down", "discarding");
  el.cardText.textContent = `Safe! ${guessed} was not the card value.`;

  setTimeout(() => {
    state.index += 1;
    updateStats();

    if (state.index >= 52) {
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
  if (state.gameOver || state.isAnimating) return;

  const card = state.deck[state.index];

  if (guess === card.rank) {
    lose(card, guess);
    updateStats();
    return;
  }

  runSafeDiscardAnimation(guess);
}

function newGame() {
  state.deck = buildDeck();
  state.index = 0;
  state.gameOver = false;
  state.isAnimating = false;
  hideCard();
  setButtonsEnabled(true);
  setResult("Make your guess", "neutral");
  updateStats();
}

makeButtons();
el.restart.addEventListener("click", newGame);
newGame();
