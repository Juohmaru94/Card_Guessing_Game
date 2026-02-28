const suits = ["♣", "♥", "♠", "♦"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const state = {
  deck: [],
  index: 0,
  gameOver: false,
};

const el = {
  card: document.getElementById("card"),
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

function revealCard(card) {
  el.rank.textContent = card.rank;
  el.suit.textContent = card.suit;
  el.card.classList.remove("face-down");
  el.card.classList.add("revealed");
}

function hideCard() {
  el.card.classList.remove("revealed", "shake", "win-glow");
  el.card.classList.add("face-down", "pulse");
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
}

function win() {
  state.gameOver = true;
  el.card.classList.remove("pulse");
  el.card.classList.add("win-glow");
  setButtonsEnabled(false);
  setResult("You Win!", "good");
  el.cardText.textContent = "Incredible! You survived all 52 cards.";
  spawnParticles("#35d07f");
}

function handleGuess(guess) {
  if (state.gameOver) return;

  const card = state.deck[state.index];
  revealCard(card);
  el.card.classList.remove("pulse");

  if (guess === card.rank) {
    lose(card, guess);
    updateStats();
    return;
  }

  state.index += 1;
  setResult("Safe guess", "good");
  el.cardText.textContent = `Nice! ${guess} did not match ${card.rank} of ${card.suit}.`;
  updateStats();

  if (state.index >= 52) {
    win();
    return;
  }

  setTimeout(() => {
    if (!state.gameOver) {
      hideCard();
      setResult("Make your guess", "neutral");
    }
  }, 700);
}

function newGame() {
  state.deck = buildDeck();
  state.index = 0;
  state.gameOver = false;
  hideCard();
  setButtonsEnabled(true);
  setResult("Make your guess", "neutral");
  updateStats();
}

makeButtons();
el.restart.addEventListener("click", newGame);
newGame();
