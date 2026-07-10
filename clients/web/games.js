/**
 * MatrixMess Web – Mini-Spiele-Modul (games.js)
 *
 * Spiele direkt im Chat, synchronisiert über normale Matrix-Raum-Events
 * (m.room.message mit Zusatzfeld "io.matrixmess.game"). Beide Seiten
 * spielen in ihren Clients, Züge sind gewöhnliche Raum-Events – dadurch
 * funktioniert auch die Historie (Replay beim Timeline-Render).
 * Vanilla-JS als natives ES-Modul (ES2020+), keine Frameworks.
 *
 * SICHERHEIT:
 *  - DOM wird ausschließlich per document.createElement + textContent/append
 *    aufgebaut (KEIN innerHTML/outerHTML/insertAdjacentHTML).
 *
 * PROTOKOLL (io.matrixmess.game v1):
 *  - Spielstart:
 *      { msgtype:'m.text', body:'🎮 Tic-Tac-Toe – spiel mit! (MatrixMess)',
 *        'io.matrixmess.game': { v:1, kind:'tictactoe', action:'start' } }
 *  - Zug:
 *      { msgtype:'m.text', body:'🎮 Zug: B2',
 *        'io.matrixmess.game': { v:1, kind:'tictactoe', action:'move',
 *                                ref:'<eventId des Start-Events>', cell:0-8 } }
 *    (body = lesbarer Fallback für fremde Clients; Zellen: Spalten A–C,
 *     Zeilen 1–3, Zelle 0 = A1 oben links, Zelle 8 = C3 unten rechts.)
 *
 * SPIELREGELN (deterministisch aus der Event-Historie berechnet):
 *  - Spieler X = Absender des Start-Events, X beginnt.
 *  - Spieler O = erster ANDERER Absender eines gültigen Zugs (tritt durch
 *    seinen ersten Zug bei).
 *  - Abwechselnde Züge, nur auf leere Zellen; ungültige, doppelte oder
 *    fremde Züge werden ignoriert.
 *  - Sieg bei 3er-Reihe (Zeile/Spalte/Diagonale), sonst Unentschieden,
 *    wenn alle 9 Zellen belegt sind.
 *
 * ======================= EXPORT-API =======================
 *
 * initGames({ sendGameEvent(roomId, content) -> Promise<eventId|null>,
 *             getMyUserId() })
 *   Einmalige Initialisierung mit den App-Abhängigkeiten.
 *
 * startGame(roomId, kind) -> Promise<eventId|null>
 *   Sendet das Start-Event in den Raum (kind vorerst nur 'tictactoe').
 *
 * sendMove(roomId, startEventId, cell) -> Promise<eventId|null>
 *   Komfort-Helfer: sendet ein Zug-Event (für den onMove-Callback).
 *
 * collectGameState(events) -> Map<startEventId, gameState>
 *   Pure Funktion: nimmt die chronologische Event-Liste eines Raums
 *   (Objekte mit { eventId, sender, content }), findet Start-Events und
 *   zugehörige Züge (ref) und berechnet den Spielzustand deterministisch.
 *   Idempotent – kann bei jedem Timeline-Render neu aufgerufen werden.
 *   gameState: { startEventId, kind, players:{X,O|null}, board[9],
 *                turn:'X'|'O', status:'open'|'won'|'draw',
 *                winner:'X'|'O'|null, winLine:[i,i,i]|null, moveCount }
 *
 * renderGameCard(gameState, { onMove(cell), myUserId }) -> HTMLElement
 *   Baut die Spiel-Karte (Titel, 3×3-Grid aus 44-px-Buttons, Statuszeile,
 *   Gewinnlinie hervorgehoben). Buttons sind nur klickbar, wenn das Spiel
 *   offen ist UND (ich Teilnehmer und am Zug bin ODER noch kein zweiter
 *   Spieler existiert, ich nicht der Starter bin und O am Zug wäre).
 *
 * GAME_KINDS -> [{ id:'tictactoe', label:'Tic-Tac-Toe' }]
 *
 * rollDice() -> { text }   z. B. '🎲 Würfel: 4'
 * flipCoin() -> { text }   z. B. '🪙 Münzwurf: Kopf'
 */

export const GAME_KINDS = [
  { id: 'tictactoe', label: 'Tic-Tac-Toe' },
];

const GAME_FIELD = 'io.matrixmess.game';
const GAME_VERSION = 1;

/** Alle acht möglichen Gewinnlinien (Indizes im 3×3-Brett). */
const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Zeilen
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Spalten
  [0, 4, 8], [2, 4, 6],            // Diagonalen
];

/** App-Abhängigkeiten, gesetzt durch initGames(). */
const deps = {
  sendGameEvent: null,
  getMyUserId: null,
};

/* ======================= Initialisierung & Senden ======================= */

/**
 * Initialisiert das Modul mit den App-Abhängigkeiten.
 * @param {{ sendGameEvent: (roomId: string, content: object) => Promise<string|null>,
 *           getMyUserId: () => string }} options
 */
export function initGames({ sendGameEvent, getMyUserId } = {}) {
  if (typeof sendGameEvent !== 'function' || typeof getMyUserId !== 'function') {
    throw new Error('initGames: sendGameEvent und getMyUserId werden benötigt');
  }
  deps.sendGameEvent = sendGameEvent;
  deps.getMyUserId = getMyUserId;
}

function ensureInit() {
  if (!deps.sendGameEvent) {
    throw new Error('games.js: initGames(...) wurde noch nicht aufgerufen');
  }
}

/**
 * Startet ein neues Spiel im Raum (sendet das Start-Event).
 * @param {string} roomId
 * @param {string} kind – vorerst nur 'tictactoe'
 * @returns {Promise<string|null>} eventId des Start-Events oder null
 */
export function startGame(roomId, kind = 'tictactoe') {
  ensureInit();
  if (kind !== 'tictactoe') {
    return Promise.reject(new Error('Unbekannte Spielart: ' + String(kind)));
  }
  const content = {
    msgtype: 'm.text',
    body: '🎮 Tic-Tac-Toe – spiel mit! (MatrixMess)',
    [GAME_FIELD]: { v: GAME_VERSION, kind: 'tictactoe', action: 'start' },
  };
  return deps.sendGameEvent(roomId, content);
}

/**
 * Sendet einen Zug (Komfort-Helfer für den onMove-Callback der Karte).
 * @param {string} roomId
 * @param {string} startEventId – eventId des Start-Events (ref)
 * @param {number} cell – Zellenindex 0–8
 * @returns {Promise<string|null>}
 */
export function sendMove(roomId, startEventId, cell) {
  ensureInit();
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) {
    return Promise.reject(new Error('Ungültige Zelle: ' + String(cell)));
  }
  const content = {
    msgtype: 'm.text',
    body: '🎮 Zug: ' + cellName(cell),
    [GAME_FIELD]: {
      v: GAME_VERSION,
      kind: 'tictactoe',
      action: 'move',
      ref: startEventId,
      cell,
    },
  };
  return deps.sendGameEvent(roomId, content);
}

/** Menschlicher Name einer Zelle: Spalte A–C + Zeile 1–3 (0 -> 'A1'). */
function cellName(cell) {
  return 'ABC'.charAt(cell % 3) + String(Math.floor(cell / 3) + 1);
}

/* ======================= Zustandsberechnung (pure) ======================= */

/**
 * Berechnet den Zustand aller Spiele eines Raums aus der chronologischen
 * Event-Liste. Pure/deterministische Funktion ohne Seiteneffekte.
 * @param {Array<{eventId?: string, sender?: string, content?: object}>} events
 * @returns {Map<string, object>} Map<startEventId, gameState>
 */
export function collectGameState(events) {
  const games = new Map();
  if (!Array.isArray(events)) return games;

  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    const content = ev.content;
    if (!content || typeof content !== 'object') continue;
    const data = content[GAME_FIELD];
    if (!data || typeof data !== 'object') continue;
    if (data.v !== GAME_VERSION || data.kind !== 'tictactoe') continue;

    if (data.action === 'start') {
      if (typeof ev.eventId !== 'string' || ev.eventId === '') continue;
      if (typeof ev.sender !== 'string' || ev.sender === '') continue;
      if (games.has(ev.eventId)) continue; // doppelte eventIds ignorieren
      games.set(ev.eventId, {
        startEventId: ev.eventId,
        kind: 'tictactoe',
        players: { X: ev.sender, O: null },
        board: [null, null, null, null, null, null, null, null, null],
        turn: 'X',
        status: 'open', // 'open' | 'won' | 'draw'
        winner: null,
        winLine: null,
        moveCount: 0,
      });
    } else if (data.action === 'move') {
      const state = typeof data.ref === 'string' ? games.get(data.ref) : undefined;
      if (!state) continue;
      applyMove(state, ev.sender, data.cell);
    }
  }
  return games;
}

/**
 * Wendet einen Zug auf einen Spielzustand an; ungültige Züge werden
 * stillschweigend ignoriert (Historie kann Müll enthalten).
 */
function applyMove(state, sender, cell) {
  if (state.status !== 'open') return;
  if (typeof sender !== 'string' || sender === '') return;
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) return;
  if (state.board[cell] !== null) return; // Zelle bereits belegt

  const symbol = state.turn;
  if (symbol === 'X') {
    if (sender !== state.players.X) return; // X-Zug nur vom Starter
  } else if (state.players.O === null) {
    if (sender === state.players.X) return; // Starter kann nicht O werden
    state.players.O = sender;               // Beitritt durch ersten Zug
  } else if (sender !== state.players.O) {
    return; // Dritte dürfen nicht mitspielen
  }

  state.board[cell] = symbol;
  state.moveCount += 1;

  const winLine = findWinLine(state.board);
  if (winLine) {
    state.status = 'won';
    state.winner = symbol;
    state.winLine = winLine;
  } else if (state.moveCount >= 9) {
    state.status = 'draw';
  } else {
    state.turn = symbol === 'X' ? 'O' : 'X';
  }
}

/** Liefert die erste komplette 3er-Reihe oder null. */
function findWinLine(board) {
  for (const line of WIN_LINES) {
    const a = board[line[0]];
    if (a !== null && a === board[line[1]] && a === board[line[2]]) {
      return line.slice();
    }
  }
  return null;
}

/* ======================= Rendering ======================= */

/**
 * Baut die Spiel-Karte für einen Spielzustand.
 * @param {object} gameState – Eintrag aus collectGameState()
 * @param {{ onMove?: (cell: number) => void, myUserId?: string }} options
 * @returns {HTMLElement}
 */
export function renderGameCard(gameState, { onMove, myUserId } = {}) {
  const state = gameState;
  const me = typeof myUserId === 'string' && myUserId !== ''
    ? myUserId
    : (deps.getMyUserId ? deps.getMyUserId() : '');

  const isX = me !== '' && me === state.players.X;
  const isO = state.players.O !== null && me === state.players.O;
  const isParticipant = isX || isO;
  const open = state.status === 'open';
  const myTurn = open && ((state.turn === 'X' && isX) || (state.turn === 'O' && isO));
  // Beitritt: noch kein zweiter Spieler, ich bin nicht der Starter und
  // O wäre am Zug (X hat also bereits eröffnet).
  const canJoin = open && state.players.O === null && !isX && state.turn === 'O';
  const canClick = open && (myTurn || canJoin);

  const card = document.createElement('div');
  card.className = 'mm-game-card';
  card.dataset.gameId = state.startEventId;

  // Titel
  const title = document.createElement('div');
  title.className = 'mm-game-title';
  const icon = document.createElement('span');
  icon.className = 'mm-game-title-icon';
  icon.textContent = '🎮';
  icon.setAttribute('aria-hidden', 'true');
  const titleText = document.createElement('span');
  titleText.textContent = 'Tic-Tac-Toe';
  title.append(icon, titleText);
  card.append(title);

  // 3×3-Spielfeld
  const grid = document.createElement('div');
  grid.className = 'mm-game-grid';
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'Tic-Tac-Toe-Spielfeld');

  for (let i = 0; i < 9; i++) {
    const value = state.board[i];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mm-game-cell';
    btn.dataset.cell = String(i);
    btn.setAttribute('aria-label', 'Feld ' + cellName(i) + (
      value === 'X' ? ', belegt von X' : value === 'O' ? ', belegt von O' : ', frei'
    ));

    if (value === 'X') {
      btn.textContent = '✕';
      btn.classList.add('mm-game-x');
    } else if (value === 'O') {
      btn.textContent = '○';
      btn.classList.add('mm-game-o');
    }

    if (state.winLine && state.winLine.indexOf(i) !== -1) {
      btn.classList.add('mm-game-win');
    }

    const clickable = canClick && value === null;
    btn.disabled = !clickable;
    if (clickable && typeof onMove === 'function') {
      btn.addEventListener('click', () => onMove(i));
    }
    grid.append(btn);
  }
  card.append(grid);

  // Statuszeile
  const status = document.createElement('div');
  status.className = 'mm-game-status';
  const { text, active } = statusInfo(state, { isX, isO, isParticipant, myTurn, canJoin });
  status.textContent = text;
  if (active) status.classList.add('mm-game-status-active');
  card.append(status);

  return card;
}

/** Deutscher Statustext je nach Spielzustand und eigener Rolle. */
function statusInfo(state, { isX, isO, isParticipant, myTurn, canJoin }) {
  const symEmoji = (sym) => (sym === 'X' ? '❌' : '⭕');

  if (state.status === 'won') {
    const iWon = (state.winner === 'X' && isX) || (state.winner === 'O' && isO);
    if (iWon) return { text: symEmoji(state.winner) + ' Du hast gewonnen!', active: true };
    if (isParticipant) return { text: symEmoji(state.winner) + ' Du hast verloren.', active: false };
    return { text: symEmoji(state.winner) + ' ' + state.winner + ' hat gewonnen.', active: false };
  }
  if (state.status === 'draw') {
    return { text: 'Unentschieden', active: false };
  }
  // Spiel offen
  if (state.players.O === null) {
    if (myTurn) return { text: 'Du bist am Zug', active: true };
    if (canJoin) return { text: 'Mach einen Zug und tritt bei!', active: true };
    return { text: 'Warte auf Mitspieler – erster Zug eines anderen tritt bei', active: false };
  }
  if (myTurn) return { text: 'Du bist am Zug', active: true };
  if (isParticipant) return { text: 'Warte auf Gegner…', active: false };
  return { text: symEmoji(state.turn) + ' ' + state.turn + ' ist am Zug', active: false };
}

/* ======================= Mini-Helfer (Slash-Commands) ======================= */

/**
 * Würfelt eine Zahl von 1 bis 6.
 * @returns {{ text: string }} z. B. { text: '🎲 Würfel: 4' }
 */
export function rollDice() {
  const n = 1 + Math.floor(Math.random() * 6);
  return { text: '🎲 Würfel: ' + n };
}

/**
 * Wirft eine Münze.
 * @returns {{ text: string }} z. B. { text: '🪙 Münzwurf: Kopf' }
 */
export function flipCoin() {
  const side = Math.random() < 0.5 ? 'Kopf' : 'Zahl';
  return { text: '🪙 Münzwurf: ' + side };
}
