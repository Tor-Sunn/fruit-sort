// ==========================
// Fruit Merge – game.js
// 9×9 grid, fruit merge + leaves
// ==========================

// --- CONFIG ---

const ROWS = 9;
const COLS = 9;
// If false: game over triggers when no merges remain (top row fullness not required)
const GAME_OVER_REQUIRE_TOP_FULL = false;

// Frukttypene dine (nivåer).
// Bildene må ligge i ./img som vist i skjermbildet ditt.
const FRUITS = [
  'fruit_banana',
  'fruit_pear',
  'fruit_mango',
  'fruit_orange',
  'fruit_apple',
  'fruit_blueberry',
  'fruit_grape',
  'fruit_kiwi',
  'fruit_lemon',
  'fruit_cherry',
  'fruit_pineapple',
  'fruit_plum',
  'fruit_raspberry',
  'fruit_strawberry',
  'fruit_watermelon',
];

// Sannsynlighet for at en ny celle blir blad i stedet for frukt
const LEAF_PROBABILITY = 0.12;
// Jar unlock behavior: if true, only merges adjacent to a jar count.
// If false, any merge that produces the target fruit level progresses the jar.
const JAR_REQUIRE_ADJACENT = false;

// Scoring configuration
const MERGE_POINTS_BASE = 10; // base points
const MERGE_LEVEL_BONUS = 6; // extra scaling per level^2 to reward higher merges
const TARGET_BONUS_BASE = 300; // base bonus for hitting target fruit
const TARGET_BONUS_PER_LEVEL = 200; // additional per fruit level

// --- STATE ---

// grid[r][c] = null | { kind: 'fruit', level: number } | { kind: 'leaf' }
let grid = [];
let score = 0;
let moves = 0;
let selected = null; // { row, col } eller null
let gameOver = false;
let hintPair = null; // { from:{row,col}, to:{row,col} }
let refillCounter = 0; // count refills triggered by no-merge states
let jars = []; // [{id,col,startRow,height,targetLevel}]
let fxQueue = []; // queued UI effects
let dailyMode = false;
let dailyDateStr = null; // YYYY-MM-DD
let rng = Math.random; // RNG used for board generation
// --- SOUND ---
const SFX_ENABLED = true;
let lastDropSoundAt = 0;
let SFX_VERSION = Date.now(); // cache bust; update manually if needed
let SFX_EXT_OVERRIDE = null; // 'ogg' | 'mp3' | 'wav' | null
let SFX_MASTER = 1.0;
let SFX_MUTE = {};
let SFX_VOL = {};
function buildAudioSrc(name) {
  const probe = document.createElement('audio');
  const exts = [];
  // Preferred order
  if (probe.canPlayType && probe.canPlayType('audio/ogg') !== '') exts.push('ogg');
  if (probe.canPlayType && probe.canPlayType('audio/mp3') !== '') exts.push('mp3');
// Daily / Global controls
const dailyBtn = document.getElementById('fm-daily');
const globalBtn = document.getElementById('fm-global');
const dailyDateInput = document.getElementById('fm-daily-date');
  if (probe.canPlayType && probe.canPlayType('audio/wav') !== '') exts.push('wav');
  // Fallback order if none reported as playable
  if (!exts.length) exts.push('ogg', 'mp3', 'wav');
  const chosen =
    SFX_EXT_OVERRIDE && ['ogg', 'mp3', 'wav'].includes(SFX_EXT_OVERRIDE)
      ? [SFX_EXT_OVERRIDE]
      : exts;
  return chosen.map((ext) => `sound/${name}.${ext}?v=${SFX_VERSION}`);
}
function createSfx(name, volume = 0.35) {
  const srcCandidates = buildAudioSrc(name);
  let chosen = null;
  let base = null;
  function pickNext(i) {
    if (i >= srcCandidates.length) {
      console.warn('[SFX] No playable source found for', name, srcCandidates);
      return;
    }
    const src = srcCandidates[i];
    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.addEventListener(
      'error',
      () => {
        console.warn('[SFX] Error loading', name, '->', src, 'trying next');
        pickNext(i + 1);
      },
      { once: true }
    );
    audio.addEventListener(
      'canplaythrough',
      () => {
        if (!chosen) {
          chosen = src;
          base = audio;
          console.log('[SFX] Ready', name, 'using', chosen);
        }
      },
      { once: true }
    );
  }
  pickNext(0);
  return {
    play(overVolume) {
      if (!SFX_ENABLED || !chosen || !base) return;
      if (SFX_MUTE && SFX_MUTE[name]) return;
      try {
        const a = base.cloneNode(true);
        let vol = typeof overVolume === 'number' ? overVolume : volume;
        if (SFX_VOL && typeof SFX_VOL[name] === 'number') vol = SFX_VOL[name];
        vol = Math.max(0, Math.min(1, vol));
        vol = Math.max(0, Math.min(1, vol * (typeof SFX_MASTER === 'number' ? SFX_MASTER : 1)));
        a.volume = vol;
        a.play().catch((err) => {
          console.warn('[SFX] playback promise rejected', name, err);
        });
      } catch (err) {
        console.warn('[SFX] play failed', name, err);
      }
    },
  };
}
function buildSfxRegistry() {
  return {
    merge: createSfx('merge', 0.5),
    upgrade: createSfx('upgrade', 0.4),
    bonus_target: createSfx('bonus_target', 0.55),
    leaf_hit: createSfx('leaf_hit', 0.25),
    leaf_clear: createSfx('leaf_clear', 0.35),
    glass_hit: createSfx('glass_hit', 0.3),
    glass_unlock: createSfx('glass_unlock', 0.55),
    drop: createSfx('drop', 0.28),
    refill: createSfx('refill', 0.32),
    hint: createSfx('hint', 0.3),
    invalid: createSfx('invalid', 0.25),
    new_game: createSfx('new_game', 0.5),
    game_over: createSfx('game_over', 0.5),
    click: createSfx('click', 0.25),
    score_pop: createSfx('score_pop', 0.45),
  };
}
let SFX = buildSfxRegistry();
window.fmReloadSounds = function fmReloadSounds() {
  SFX_VERSION = Date.now();
  SFX = buildSfxRegistry();
  console.log('[SFX] Reloaded with version', SFX_VERSION);
};
window.fmMuteSfx = function fmMuteSfx(name, muted = true) {
  SFX_MUTE[name] = !!muted;
};
window.fmSetSfxVolume = function fmSetSfxVolume(name, vol) {
  const v = Number(vol);
  if (!Number.isFinite(v)) return;
  SFX_VOL[name] = Math.max(0, Math.min(1, v));
};
window.fmSetMasterVolume = function fmSetMasterVolume(vol) {
  const v = Number(vol);
  if (!Number.isFinite(v)) return;
  SFX_MASTER = Math.max(0, Math.min(1, v));
};
window.fmUnmuteAll = function fmUnmuteAll() {
  SFX_MUTE = {};
};
window.fmSetSfxExt = function fmSetSfxExt(ext) {
  if (ext === null || ext === undefined || ext === 'auto') {
    SFX_EXT_OVERRIDE = null;
  } else if (['ogg', 'mp3', 'wav'].includes(ext)) {
    SFX_EXT_OVERRIDE = ext;
  } else {
    console.warn('[SFX] Unknown ext. Use one of: ogg|mp3|wav|auto');
    return;
  }
  SFX_VERSION = Date.now();
  SFX = buildSfxRegistry();
  console.log('[SFX] Forced ext =', SFX_EXT_OVERRIDE || 'auto', 'version', SFX_VERSION);
};
window.fmListSfx = function fmListSfx() {
  const names = Object.keys(SFX);
  console.log('[SFX] Available:', names.join(', '));
  return names;
};
// --- DOM ---

const boardEl = document.getElementById('fm-board');
const movesEl = document.getElementById('fm-moves');
const newBtn = document.getElementById('fm-new');
const hintBtn = document.getElementById('fm-hint');
const targetEl = document.getElementById('fm-target');
const chartEl = document.getElementById('fm-merge-chart');
// Game over overlay references
const gameOverEl = document.getElementById('fm-gameover');
const finalScoreEl = document.getElementById('fm-final-score');
const highScoreForm = document.getElementById('fm-highscore-form');
const playerNameInput = document.getElementById('fm-player-name');
const highScoresEl = document.getElementById('fm-highscores');
const restartBtn = document.getElementById('fm-restart-btn');

// Target / bonus system (progressive: starts low, increases gradually)
let targetLevel = null;
let targetFloor = 1; // lower bound for target level window (pear and up)
let targetCeil = 4; // upper bound for target level window
function pickNewTarget() {
  const min = Math.max(0, Math.min(targetFloor, FRUITS.length - 1));
  const max = Math.max(min, Math.min(targetCeil, FRUITS.length - 1));
  targetLevel = randInt(min, max);
}

// ====================
// REMOTE HIGHSCORES API (configurable)
// ====================
// Default to local relative API paths for Fruit Merge (separate from nm)
const API_BASE_DEFAULT = 'api';
let API_ENDPOINTS = {
  save: API_BASE_DEFAULT + '/save-fruit-score.php',
  saveDaily: API_BASE_DEFAULT + '/save-fruit-score-daily.php',
  get: API_BASE_DEFAULT + '/get-fruit-scores.php',
  getDaily: API_BASE_DEFAULT + '/get-fruit-daily.php',
};
window.fmSetApi = function fmSetApi(map) {
  if (!map || typeof map !== 'object') return;
  API_ENDPOINTS = { ...API_ENDPOINTS, ...map };
};
window.fmGetApi = function fmGetApi() {
  return { ...API_ENDPOINTS };
};

// ====================
// HJELPERE
// ====================

function rand() {
  return rng();
}
function randInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function createRandomFruit() {
  const level = randInt(0, 5); // start kun med de første nivåene for å ikke spamme høye frukter
  return { kind: 'fruit', level };
}

function createRandomCell() {
  if (rand() < LEAF_PROBABILITY) {
    return { kind: 'leaf', hp: randInt(1, 4) };
  }
  return createRandomFruit();
}

function inBounds(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

function fruitDisplayName(level) {
  const key = FRUITS[level] || '';
  const raw = key.replace(/^fruit_/, '');
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '';
}

// ====================
// INITIALISERING
// ====================

function initGrid() {
  grid = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      // Startbrett: tillat også noen blader
      row.push(createRandomCell());
    }
    grid.push(row);
  }
}

// ====================
// RENDERING
// ====================

function renderGrid() {
  boardEl.innerHTML = '';

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cellData = grid[r][c];
      const cell = document.createElement('div');
      cell.className = 'fm-cell';
      cell.dataset.row = r.toString();
      cell.dataset.col = c.toString();

      if (!cellData) {
        cell.classList.add('fm-cell--empty');
      } else if (cellData.kind === 'leaf') {
        const img = document.createElement('img');
        img.src = 'img/leaf.png';
        img.alt = 'leaf';
        img.className = 'fm-leaf-img';
        cell.appendChild(img);
        const hp = document.createElement('span');
        hp.className = 'fm-leaf-hp';
        hp.textContent = String(cellData.hp || 1);
        cell.appendChild(hp);
      } else if (cellData.kind === 'fruit') {
        const sprite = FRUITS[cellData.level] || FRUITS[FRUITS.length - 1];
        const img = document.createElement('img');
        img.src = `img/${sprite}.png`;
        img.alt = sprite;
        img.className = 'fm-fruit-img';
        // If this was a newly dropped cell, animate
        const isDrop = fxQueue.some((fx) => fx.text === 'drop' && fx.row === r && fx.col === c);
        if (isDrop) img.classList.add('fm-drop-in');
        cell.appendChild(img);
      } else if (cellData.kind === 'lock') {
        // Render as locked empty space; no per-cell overlay now (handled by stack overlay)
      }

      if (selected && selected.row === r && selected.col === c) {
        cell.classList.add('fm-cell--selected');
      }

      if (
        hintPair &&
        ((hintPair.from.row === r && hintPair.from.col === c) ||
          (hintPair.to.row === r && hintPair.to.col === c))
      ) {
        cell.classList.add('fm-cell--hint');
      }

      boardEl.appendChild(cell);
    }
  }

  scoreEl.textContent = score.toString();
  movesEl.textContent = moves.toString();

  // Update target display if present
  if (typeof targetEl !== 'undefined' && targetEl) {
    if (typeof targetLevel === 'number') {
      const lvl = Math.min(targetLevel, FRUITS.length - 1);
      const sprite = FRUITS[lvl] || FRUITS[FRUITS.length - 1];
      const name = fruitDisplayName(lvl);
      targetEl.innerHTML = `Target: <img src="img/${sprite}.png" alt="target" class="fm-target-img"> ${name} (L${lvl})`;
    } else {
      targetEl.textContent = '';
    }
  }

  // Build/refresh merge chart (static based on FRUITS)
  renderMergeChart();
  // After cells: render multi-cell jar stacks
  renderJarStacks();
  // Render queued UI effects (bonus popups)
  renderEffects();
  // Remove any drop markers we consumed
  fxQueue = fxQueue.filter((fx) => fx.text !== 'drop');
}

// ====================
// MERGE-LOGIKK
// ====================

function cellsAligned(r1, c1, r2, c2) {
  const dr = r2 - r1;
  const dc = r2 === r1 && c2 === c1 ? 0 : c2 - c1;
  if (dr === 0 && dc === 0) return false;
  // rett linje: horis, vert, diagonal
  if (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc)) {
    return true;
  }
  return false;
}

function pathClear(r1, c1, r2, c2) {
  const dr = Math.sign(r2 - r1);
  const dc = Math.sign(c2 - c1);
  let r = r1 + dr;
  let c = c1 + dc;
  while (!(r === r2 && c === c2)) {
    if (grid[r][c] !== null) {
      return false;
    }
    r += dr;
    c += dc;
  }
  return true;
}

function removeNeighborLeaves(row, col) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (!inBounds(nr, nc)) continue;
      const cell = grid[nr][nc];
      if (cell && cell.kind === 'leaf') {
        // decrement HP, remove only when hp <=0
        cell.hp = typeof cell.hp === 'number' ? cell.hp - 1 : 0;
        if (cell.hp > 0) {
          if (SFX.leaf_hit) SFX.leaf_hit.play();
        }
        if (cell.hp <= 0) {
          grid[nr][nc] = null;
          if (SFX.leaf_clear) SFX.leaf_clear.play();
        }
      }
    }
  }
}

// ====================
// REFILL
// ====================

// Fyll kun tomme celler i toppen av hver kolonne
function refillFromTop() {
  let spawned = false;
  for (let c = 0; c < COLS; c++) {
    // Fyll alle ledige ruter fra toppen og ned til første hindring
    for (let r = 0; r < ROWS; r++) {
      if (grid[r][c] === null) {
        const cell = createRandomCell();
        // Merk kun nye frukter som "newSpawn" slik at kun de faller i gravity
        if (cell && cell.kind === 'fruit') {
          cell.newSpawn = true;
        }
        grid[r][c] = cell;
        fxQueue.push({ row: r, col: c, text: 'drop' });
        spawned = true;
      } else {
        // Første hindring; stopp fylling i denne kolonnen
        break;
      }
    }
  }
  if (spawned && SFX.refill) {
    SFX.refill.play();
  }
}

// Gravity: collapse each column so non-null cells slide down, preserving order
function applyGravity() {
  let moved = false;
  // Bare nye frukter (newSpawn) kan falle; eksisterende holder seg i ro
  for (let pass = 0; pass < ROWS; pass++) {
    let any = false;
    for (let c = 0; c < COLS; c++) {
      for (let r = ROWS - 2; r >= 0; r--) {
        const cur = grid[r][c];
        const below = grid[r + 1][c];
        if (cur && cur.kind === 'fruit' && cur.newSpawn && below === null) {
          grid[r + 1][c] = cur;
          grid[r][c] = null;
          fxQueue.push({ row: r + 1, col: c, text: 'drop' });
          any = true;
          moved = true;
        }
      }
    }
    if (!any) break;
  }
  // Fjern newSpawn-flagget når frukten har landet
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      if (cell && cell.kind === 'fruit' && cell.newSpawn) {
        const below = r + 1 < ROWS ? grid[r + 1][c] : null;
        if (below !== null) {
          delete cell.newSpawn;
        } else if (r === ROWS - 1) {
          delete cell.newSpawn;
        }
      }
    }
  }
  if (moved) {
    const now = performance.now();
    if (SFX.drop && now - lastDropSoundAt > 120) {
      lastDropSoundAt = now;
      SFX.drop.play(0.32);
    }
  }
}

// Build a small visual chart of the upgrade path
function renderMergeChart() {
  if (!chartEl) return;
  // Only rebuild if empty to avoid unnecessary DOM work
  if (chartEl.dataset.built === '1') return;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < FRUITS.length; i++) {
    const item = document.createElement('span');
    item.className = 'fm-chart-item';
    const img = document.createElement('img');
    img.src = `img/${FRUITS[i]}.png`;
    img.alt = fruitDisplayName(i) || FRUITS[i];
    img.className = 'fm-chart-img';
    item.appendChild(img);
    const label = document.createElement('span');
    const name = fruitDisplayName(i);
    label.textContent = name ? name : `L${i}`;
    item.title = `${name || FRUITS[i]} (L${i})`;
    item.appendChild(label);
    frag.appendChild(item);
    if (i < FRUITS.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'fm-chart-arrow';
      arrow.textContent = '→';
      frag.appendChild(arrow);
    }
  }
  chartEl.innerHTML = '';
  chartEl.appendChild(frag);
  chartEl.dataset.built = '1';
}

// ====================
// GAME OVER-DETEKSJON
// ====================

// Finnes det minst ett mulig merge-trekk?
function hasAnyMergeMove() {
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
    [-1, 0],
    [0, -1],
    [-1, -1],
    [-1, 1],
  ];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      if (!cell || cell.kind !== 'fruit') continue;

      for (const [dr, dc] of dirs) {
        let rr = r + dr;
        let cc = c + dc;
        while (inBounds(rr, cc)) {
          const other = grid[rr][cc];
          if (other === null) {
            rr += dr;
            cc += dc;
            continue;
          }
          // første ting vi møter
          if (other.kind === 'fruit' && other.level === cell.level) {
            return true;
          }
          break; // blokkert av feil frukt eller blad
        }
      }
    }
  }
  return false;
}

// Game over detection (flexible)
function checkGameOver() {
  if (hasAnyMergeMove()) return false;
  if (GAME_OVER_REQUIRE_TOP_FULL) {
    for (let c = 0; c < COLS; c++) {
      if (grid[0][c] === null) return false;
    }
  }
  return true;
}

// High score handling
function loadHighScores() {
  try {
    const raw = localStorage.getItem('fmHighScores');
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, 50) : [];
  } catch (_) {
    return [];
  }
}
function saveHighScores(list) {
  try {
    localStorage.setItem('fmHighScores', JSON.stringify(list));
  } catch (_) {}
}
function renderHighScores() {
  if (!highScoresEl) return;
  const list = loadHighScores().sort((a, b) => b.score - a.score || a.moves - b.moves);
  const frag = document.createDocumentFragment();

  // Local scores
  const lh = document.createElement('h3');
  lh.textContent = 'Local High Scores';
  frag.appendChild(lh);
  const lol = document.createElement('ol');
  list.slice(0, 20).forEach((it, i) => {
    const li = document.createElement('li');
    li.textContent = `${i + 1}. ${it.name || 'Player'} — ${it.score} pts, ${it.moves} moves`;
    lol.appendChild(li);
  });
  frag.appendChild(lol);

  // Remote (optional)
  const api = window.fmGetApi && window.fmGetApi();
  const hasRemote = api && (api.get || api.getDaily || api.save || api.saveDaily);
  if (hasRemote) {
    const today = new Date().toISOString().slice(0, 10);
    const dstr = dailyMode ? (dailyDateStr || today) : today;
    Promise.all([
      api.get ? fetch(api.get).then(r=>r.json()).catch(()=>[]) : Promise.resolve([]),
      api.getDaily ? fetch(api.getDaily + '?date=' + dstr.replaceAll('-','')).then(r=>r.json()).catch(()=>[]) : Promise.resolve([])
    ]).then(([global, daily]) => {
      const gHead = document.createElement('h3');
      gHead.textContent = 'Global High Scores';
      frag.appendChild(gHead);
      const gOl = document.createElement('ol');
      (Array.isArray(global)?global:(global.scores||[])).slice(0,20).forEach((it,i)=>{
        const li=document.createElement('li');
        li.textContent = `${i+1}. ${it.name||'Player'} — ${it.score} pts${it.moves?`, ${it.moves} moves`:''}`;
        gOl.appendChild(li);
      });
      frag.appendChild(gOl);

      const dHead = document.createElement('h3');
      dHead.textContent = `Daily ${dstr}`;
      frag.appendChild(dHead);
      const dOl = document.createElement('ol');
      (Array.isArray(daily)?daily:(daily.scores||[])).slice(0,20).forEach((it,i)=>{
        const li=document.createElement('li');
        li.textContent = `${i+1}. ${it.name||'Player'} — ${it.score} pts${it.moves?`, ${it.moves} moves`:''}`;
        dOl.appendChild(li);
      });
      frag.appendChild(dOl);

      highScoresEl.innerHTML = '';
      highScoresEl.appendChild(frag);
    }).catch(()=>{
      highScoresEl.innerHTML = '';
      highScoresEl.appendChild(frag);
    });
  } else {
    highScoresEl.innerHTML = '';
    highScoresEl.appendChild(frag);
  }
}
function showGameOver() {
  if (!gameOverEl) return;
  finalScoreEl.textContent = `Final score: ${score} (Moves: ${moves})`;
  renderHighScores();
  gameOverEl.classList.remove('fm-hidden');
  playerNameInput && playerNameInput.focus();
}
function hideGameOver() {
  if (gameOverEl) gameOverEl.classList.add('fm-hidden');
}
if (highScoreForm) {
  highScoreForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = (playerNameInput && playerNameInput.value.trim()) || 'Player';
    const entry = { name, score, moves, time: Date.now() };
    const list = loadHighScores();
    list.push(entry);
    saveHighScores(list);
    // Optional remote submit
    const api = window.fmGetApi && window.fmGetApi();
    if (api && (api.save || api.saveDaily)) {
      const yyyymmdd = (dailyMode ? (dailyDateStr || new Date().toISOString().slice(0,10)) : new Date().toISOString().slice(0,10)).replaceAll('-','');
      const tasks = [];
      if (api.save) tasks.push(fetch(api.save, {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({name, score:String(score), diff:'normal'})}));
      if (api.saveDaily) tasks.push(fetch(api.saveDaily, {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({name, score:String(score), diff:'normal', date: yyyymmdd})}));
      Promise.allSettled(tasks).finally(()=>renderHighScores());
    } else {
      renderHighScores();
    }
    if (SFX.score_pop) SFX.score_pop.play(0.5);
  });
}
if (restartBtn) {
  restartBtn.addEventListener('click', () => {
    if (SFX.click) SFX.click.play(0.3);
    hideGameOver();
    startNewGame();
  });
}

// ====================
// INTERAKSJON
// ====================

function handleCellClick(row, col) {
  if (gameOver) return;
  // Any board interaction clears an active hint
  hintPair = null;
  const cell = grid[row][col];

  if (!selected) {
    // første valg
    if (!cell || cell.kind !== 'fruit' || cell.lockedBy) {
      if (SFX.invalid) SFX.invalid.play();
      return; // kan ikke velge låste frukter
    }
    selected = { row, col };
    renderGrid();
    return;
  }

  // klikk på samme = avvelg
  if (selected.row === row && selected.col === col) {
    selected = null;
    renderGrid();
    return;
  }

  const from = grid[selected.row][selected.col];
  const to = grid[row][col];

  // kun frukt-til-frukt merge
  if (
    !from ||
    !to ||
    from.kind !== 'fruit' ||
    to.kind !== 'fruit' ||
    from.lockedBy ||
    to.lockedBy
  ) {
    // restart seleksjon på ny celle hvis det er frukt
    if (cell && cell.kind === 'fruit') {
      selected = { row, col };
      renderGrid();
    } else {
      selected = null;
      renderGrid();
    }
    return;
  }

  const r1 = selected.row;
  const c1 = selected.col;
  const r2 = row;
  const c2 = col;

  if (!cellsAligned(r1, c1, r2, c2) || !pathClear(r1, c1, r2, c2)) {
    // ugyldig trekk – flytt markering til ny celle
    if (SFX.invalid) SFX.invalid.play();
    selected = { row, col };
    renderGrid();
    return;
  }

  if (from.level !== to.level) {
    if (SFX.invalid) SFX.invalid.play();
    selected = { row, col };
    renderGrid();
    return;
  }

  // Gyldig merge!
  moves++;

  // Destination is always the cell clicked last (r2,c2). Source becomes empty.
  const destRow = r2;
  const destCol = c2;
  const srcRow = r1;
  const srcCol = c1;

  const baseLevel = from.level; // samme som to.level
  const newLevel = Math.min(baseLevel + 1, FRUITS.length - 1);
  grid[destRow][destCol] = { kind: 'fruit', level: newLevel };
  grid[srcRow][srcCol] = null;

  // play merge sound
  if (SFX && SFX.merge) SFX.merge.play();

  // score – per merge scaled by level
  score += MERGE_POINTS_BASE * (newLevel + 1) + MERGE_LEVEL_BONUS * (newLevel * newLevel);

  // Check target bonus
  if (typeof targetLevel === 'number' && newLevel === targetLevel) {
    const bonus = TARGET_BONUS_BASE + TARGET_BONUS_PER_LEVEL * newLevel;
    score += bonus;
    // Visual FX at merge destination
    queueFx(destRow, destCol, `+${bonus}`, true);
    if (SFX.bonus_target) SFX.bonus_target.play();
    if (SFX.score_pop) setTimeout(() => SFX.score_pop.play(), 40);
    // Progress the target difficulty window upwards gradually
    targetFloor = Math.min(targetFloor + 1, FRUITS.length - 5);
    targetCeil = Math.min(targetCeil + 1, FRUITS.length - 1);
    pickNewTarget();
  }

  // Fjern blader rundt både kilde og destinasjon (decrement hp)
  removeNeighborLeaves(srcRow, srcCol);
  removeNeighborLeaves(destRow, destCol);

  // Nullstill seleksjon før vi manipulerer mer
  selected = null;

  // Progress glass unlock when producing the target fruit
  progressJarsByFruit(newLevel, destRow, destCol);

  // When no merges remain, let fruits fall and then refill so it's clear
  if (!hasAnyMergeMove()) {
    applyGravity();
    refillFromTop();
    setTimeout(() => {
      applyGravity();
      refillCounter += 1;
      if (refillCounter % 3 === 0) spawnJars(1);
      if (checkGameOver()) {
        gameOver = true;
        renderGrid();
        if (SFX.game_over) SFX.game_over.play();
        showGameOver();
        return;
      }
      renderGrid();
    }, 140);
    return;
  }

  // Game over-sjekk
  if (checkGameOver()) {
    gameOver = true;
    renderGrid();
    setTimeout(() => {
      if (SFX.game_over) SFX.game_over.play();
      showGameOver();
    }, 10);
    return;
  }

  renderGrid();
}

// ====================
// SETUP
// ====================

boardEl.addEventListener('click', (e) => {
  const target = e.target.closest('.fm-cell');
  if (!target) return;
  const row = Number(target.dataset.row);
  const col = Number(target.dataset.col);
  if (!Number.isInteger(row) || !Number.isInteger(col)) return;
  handleCellClick(row, col);
});

newBtn.addEventListener('click', () => {
  if (SFX.click) SFX.click.play(0.25);
  if (SFX.new_game) setTimeout(() => SFX.new_game.play(0.45), 40);
  startNewGame();
});

if (hintBtn) {
  hintBtn.addEventListener('click', () => {
    if (gameOver) return;
    const pair = findAnyMergePair();
    if (!pair) {
      alert('No possible merges right now.');
      return;
    }
    // Deduct points only when we actually show a hint
    score = Math.max(0, score - 300);
    hintPair = pair;
    selected = { row: pair.from.row, col: pair.from.col };
    if (SFX.hint) SFX.hint.play();
    renderGrid();
  });
}

// Daily/Global buttons
if (dailyBtn) {
  // Default date to today if empty
  if (dailyDateInput && !dailyDateInput.value) {
    dailyDateInput.value = new Date().toISOString().slice(0, 10);
  }
  dailyBtn.addEventListener('click', () => {
    const today = new Date().toISOString().slice(0, 10);
    const d = dailyDateInput && dailyDateInput.value ? dailyDateInput.value : today;
    if (d > today) {
      alert('That date is in the future.');
      return;
    }
    startDailyGameFor(d);
  });
}
if (globalBtn) {
  globalBtn.addEventListener('click', () => {
    dailyMode = false;
    dailyDateStr = null;
    rng = Math.random;
    startNewGame();
  });
}

function startNewGame() {
  score = 0;
  moves = 0;
  selected = null;
  gameOver = false;
  hintPair = null;
  fxQueue = [];
  refillCounter = 0;
  jars = [];
  nextJarId = 1;
  hideGameOver();
  // Ensure a solvable start (at least one merge available), and start without leaves
  // to reduce early blockers. Retry a few times if necessary.
  let attempts = 0;
  do {
    initGrid();
    attempts++;
    if (attempts > 20) break; // fail-safe
  } while (!hasAnyMergeMove());
  // reset progressive target window
  targetFloor = 1;
  targetCeil = 4;
  if (typeof pickNewTarget === 'function') pickNewTarget();
  else targetLevel = null;
  renderGrid();
}

// start første spillet
startNewGame();

// ====================
// DAILY MODE (seeded RNG by date)
// ====================
function seedFromString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function startDailyGameFor(dateStr) {
  dailyMode = true;
  dailyDateStr = dateStr;
  rng = mulberry32(seedFromString('fruit-merge:' + dateStr));
  startNewGame();
}

// Finn og returner en gyldig merge (første funn)
function findAnyMergePair() {
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
    [-1, 0],
    [0, -1],
    [-1, -1],
    [-1, 1],
  ];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      if (!cell || cell.kind !== 'fruit') continue;
      for (const [dr, dc] of dirs) {
        let rr = r + dr;
        let cc = c + dc;
        while (inBounds(rr, cc)) {
          const other = grid[rr][cc];
          if (other === null) {
            rr += dr;
            cc += dc;
            continue;
          }
          if (other.kind === 'fruit' && other.level === cell.level) {
            return { from: { row: r, col: c }, to: { row: rr, col: cc } };
          }
          break;
        }
      }
    }
  }
  return null;
}

// ====================
// UI EFFECTS
// ====================
function queueFx(row, col, text, big = false) {
  fxQueue.push({ row, col, text, big });
}

// ====================
// JARS & KEY
// ====================
function spawnJars(count) {
  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < 200) {
    attempts++;
    const col = randInt(0, COLS - 1);
    const start = randInt(0, ROWS - 2);
    // need 2 consecutive cells which can be locked (fruit or empty), and not already locked
    let ok = true;
    for (let i = 0; i < 2; i++) {
      const cellCandidate = grid[start + i][col];
      if (cellCandidate && (cellCandidate.kind !== 'fruit' || cellCandidate.lockedBy)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const id = nextJarId++;
    const tLevel = randInt(1, Math.min(FRUITS.length - 3, 6));
    jars.push({ id, col, startRow: start, height: 2, targetLevel: tLevel, hp: 2 });
    for (let i = 0; i < 2; i++) {
      const cell = grid[start + i][col];
      if (cell && cell.kind === 'fruit') {
        cell.lockedBy = id;
      } else {
        grid[start + i][col] = { kind: 'lock', lockedBy: id };
      }
    }
    placed++;
  }
}

function renderJarStacks() {
  // remove previous overlays
  const old = boardEl.querySelectorAll('.fm-jar-stack');
  old.forEach((el) => el.remove());
  for (const jar of jars) {
    const topCell = boardEl.querySelector(
      `.fm-cell[data-row="${jar.startRow}"][data-col="${jar.col}"]`
    );
    const bottomCell = boardEl.querySelector(
      `.fm-cell[data-row="${jar.startRow + jar.height - 1}"][data-col="${jar.col}"]`
    );
    if (!topCell || !bottomCell) continue;
    const stack = document.createElement('div');
    stack.className = 'fm-jar-stack';
    // position
    const topRect = topCell.getBoundingClientRect();
    const bottomRect = bottomCell.getBoundingClientRect();
    const boardRect = boardEl.getBoundingClientRect();
    const padding = 0; // we rely on absolute inside board
    const x = topRect.left - boardRect.left + padding;
    const y = topRect.top - boardRect.top + padding;
    const width = topRect.width;
    const height = bottomRect.bottom - topRect.top;
    stack.style.left = `${x}px`;
    stack.style.top = `${y}px`;
    stack.style.width = `${width}px`;
    stack.style.height = `${height}px`;
    // Use PNG image to render the jar stretched across the segment
    const img = document.createElement('img');
    img.className = 'fm-jar-stack-img';
    img.src = 'img/jar_inner.png';
    img.alt = '';
    stack.appendChild(img);
    // Show required fruit badge and HP for unlocking
    if (typeof jar.targetLevel === 'number') {
      const badge = document.createElement('img');
      badge.className = 'fm-jar-target';
      const sprite = FRUITS[Math.min(jar.targetLevel, FRUITS.length - 1)];
      badge.src = `img/${sprite}.png`;
      badge.alt = 'target fruit';
      stack.appendChild(badge);
    }
    if (typeof jar.hp === 'number') {
      const hp = document.createElement('span');
      hp.className = 'fm-jar-hp';
      hp.textContent = String(jar.hp);
      stack.appendChild(hp);
    }
    boardEl.appendChild(stack);
  }
}

function unlockJarByIndex(index) {
  if (index < 0 || index >= jars.length) return;
  const jar = jars.splice(index, 1)[0];
  for (let i = 0; i < jar.height; i++) {
    const cell = grid[jar.startRow + i][jar.col];
    if (cell) {
      if (cell.kind === 'fruit' && cell.lockedBy === jar.id) {
        delete cell.lockedBy;
      } else if (cell.kind === 'lock' && cell.lockedBy === jar.id) {
        // free locked empty cell
        grid[jar.startRow + i][jar.col] = null;
      }
    }
  }
}

// Progress jars when a target fruit is produced (global or adjacent based on flag)
function progressJarsByFruit(producedLevel, destRow, destCol) {
  for (let j = 0; j < jars.length; j++) {
    const jar = jars[j];
    if (producedLevel !== jar.targetLevel) continue;
    if (JAR_REQUIRE_ADJACENT) {
      let near = false;
      for (let i = 0; i < jar.height; i++) {
        const r = jar.startRow + i;
        const c = jar.col;
        if (Math.abs(r - destRow) <= 1 && Math.abs(c - destCol) <= 1) {
          near = true;
          break;
        }
      }
      if (!near) continue;
    }
    const prev = typeof jar.hp === 'number' ? jar.hp : 2;
    jar.hp = prev - 1;
    if (jar.hp > 0 && SFX.glass_hit) SFX.glass_hit.play();
    if (jar.hp <= 0) {
      unlockJarByIndex(j);
      if (SFX.glass_unlock) SFX.glass_unlock.play();
      j--; // adjust index after removal
    }
  }
}

function renderEffects() {
  if (!fxQueue.length) return;
  const items = fxQueue.slice();
  fxQueue = [];
  for (const fx of items) {
    if (fx.text === 'drop') continue; // internal marker, not a visual effect
    const sel = `.fm-cell[data-row="${fx.row}"][data-col="${fx.col}"]`;
    const cellEl = boardEl.querySelector(sel);
    if (!cellEl) continue;
    cellEl.style.position = 'relative';
    const el = document.createElement('span');
    el.className = 'fm-fx-bonus' + (fx.big ? ' fm-fx-bonus--big' : '');
    el.textContent = fx.text;
    cellEl.appendChild(el);
    if (fx.big && SFX.score_pop) SFX.score_pop.play(0.5);
    setTimeout(() => el.remove(), 1000);
  }
}
