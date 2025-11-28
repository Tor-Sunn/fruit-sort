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
let bombsToSpawn = 0; // bombs queued to drop with next refill
// Hint attention timing
let lastMergeAt = performance.now();
let hintAttnTimer = null;
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
  let chosenSrc = null;
  let pool = [];
  const MAX_POOL = 6;
  let ready = false;
  let lastPlayAt = 0;
  let rateLimitMs = 30; // prevent rapid stacking of identical sound

  function initSource(i) {
    if (i >= srcCandidates.length) {
      console.warn('[SFX] No playable source found for', name, srcCandidates);
      return;
    }
    const src = srcCandidates[i];
    const a = new Audio(src);
    a.preload = 'auto';
    a.addEventListener(
      'error',
      () => {
        if (!ready) {
          if (window.fmAudioDebug) console.warn('[SFX] load error', name, src);
          initSource(i + 1);
        }
      },
      { once: true }
    );
    a.addEventListener(
      'canplaythrough',
      () => {
        if (!ready) {
          chosenSrc = src;
          ready = true;
          pool.push(a);
          if (window.fmAudioDebug) console.log('[SFX] Ready', name, 'src', chosenSrc);
          // Pre-build remaining pool clones
          for (let k = pool.length; k < Math.min(3, MAX_POOL); k++) {
            const clone = new Audio(chosenSrc);
            clone.preload = 'auto';
            clone.load();
            pool.push(clone);
          }
        }
      },
      { once: true }
    );
    a.load();
  }
  initSource(0);

  function getChannel() {
    // find an idle channel (paused or ended)
    for (const ch of pool) {
      if (ch.paused || ch.ended) return ch;
      // Safari sometimes leaves currentTime near duration but not ended; treat >95% as free
      if (ch.currentTime > 0 && ch.duration && ch.currentTime / ch.duration > 0.95) return ch;
    }
    if (pool.length < MAX_POOL && chosenSrc) {
      const extra = new Audio(chosenSrc);
      extra.preload = 'auto';
      extra.load();
      pool.push(extra);
      return extra;
    }
    return null;
  }

  function play(overVolume) {
    if (!SFX_ENABLED || !ready || !chosenSrc) return;
    if (SFX_MUTE && SFX_MUTE[name]) return;
    const now = performance.now();
    if (now - lastPlayAt < rateLimitMs) return; // rate limit
    lastPlayAt = now;
    const ch = getChannel();
    if (!ch) return;
    let vol = typeof overVolume === 'number' ? overVolume : volume;
    if (SFX_VOL && typeof SFX_VOL[name] === 'number') vol = SFX_VOL[name];
    vol = Math.max(0, Math.min(1, vol));
    vol = Math.max(0, Math.min(1, vol * (typeof SFX_MASTER === 'number' ? SFX_MASTER : 1)));
    try {
      ch.pause();
      ch.currentTime = 0;
      ch.volume = vol;
      const p = ch.play();
      if (p && p.catch) p.catch(() => {});
    } catch (err) {
      if (window.fmAudioDebug) console.warn('[SFX] play failed', name, err);
    }
  }

  function prime() {
    if (!ready || !chosenSrc) return;
    // Trigger a silent play to force decode; then immediately pause.
    const ch = getChannel();
    if (!ch) return;
    try {
      ch.volume = 0;
      ch.currentTime = 0;
      const p = ch.play();
      if (p && p.then) {
        p.then(() => {
          try {
            ch.pause();
            ch.currentTime = 0;
          } catch {}
        }).catch(() => {});
      }
    } catch {}
  }

  return { play, prime };
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
// Prime all sounds (low-latency decode) after unlock/toggle ON
function fmPrimeSounds() {
  if (!SFX) return;
  Object.values(SFX).forEach((s) => {
    try {
      s.prime && s.prime();
    } catch {}
  });
  if (window.fmAudioDebug) console.log('[SFX] Prime pass complete');
}
window.fmPrimeSounds = fmPrimeSounds;
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

// Prefer WAV by default (widely supported; you have wav/ogg assets)
try {
  window.fmSetSfxExt && window.fmSetSfxExt('wav');
} catch (_) {}

// On iOS and some mobile browsers, audio playback requires a user gesture.
// Unlock audio on the first interaction so SFX can play subsequently.
let FM_AUDIO_UNLOCKED = false;
function fmUnlockAudioPlaybackOnce() {
  if (FM_AUDIO_UNLOCKED) return;
  FM_AUDIO_UNLOCKED = true;
  try {
    // Play a single silent audio clip to satisfy mobile gesture requirements
    // 1-second silent WAV data URI (iOS-friendly)
    const silentDataUri =
      'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAAAAAD///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const a = new Audio(silentDataUri);
    a.volume = 0;
    a.play()
      .then(() => {
        try {
          a.pause();
          a.currentTime = 0;
        } catch (_) {}
      })
      .catch(() => {});
    console.log('[SFX] Audio unlocked via first gesture (silent)');
  } catch (err) {
    console.warn('[SFX] Unlock attempt failed', err);
  }
}
// Expose for manual triggering if desired
window.fmUnlockAudio = fmUnlockAudioPlaybackOnce;
// Attach once-only listeners for common gesture events
window.addEventListener('pointerdown', fmUnlockAudioPlaybackOnce, { once: true, passive: true });
window.addEventListener('touchstart', fmUnlockAudioPlaybackOnce, { once: true, passive: true });
window.addEventListener('click', fmUnlockAudioPlaybackOnce, { once: true, passive: true });
// WebAudio fallback beep to verify audio path even if asset playback is blocked
function fmPlayBeep(durationMs = 140, freq = 880) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    const ctx = new Ctx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = 0.06; // quiet
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    osc.start(now);
    osc.stop(now + durationMs / 1000);
    return true;
  } catch {
    return false;
  }
}
// --- DOM ---

const boardEl = document.getElementById('fm-board');
const scoreEl = document.getElementById('fm-score');
const movesEl = document.getElementById('fm-moves');
const newBtn = document.getElementById('fm-new');
const hintBtn = document.getElementById('fm-hint');
const soundToggleBtn = document.getElementById('fm-sound-toggle');
// Sound preference persistence
let fmSoundOn = true;
function updateSoundToggleUI() {
  if (!soundToggleBtn) return;
  const on = SFX_MASTER > 0.0001;
  soundToggleBtn.textContent = on ? 'Sound: On' : 'Sound: Off';
  soundToggleBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
}
function loadSoundPref() {
  try {
    const raw = localStorage.getItem('fmSoundOn');
    if (raw === null) {
      fmSoundOn = true; // default ON
    } else {
      fmSoundOn = raw === '1';
    }
  } catch (_) {
    fmSoundOn = true;
  }
  SFX_MASTER = fmSoundOn ? 1 : 0;
  updateSoundToggleUI();
}
function saveSoundPref() {
  try {
    localStorage.setItem('fmSoundOn', fmSoundOn ? '1' : '0');
  } catch (_) {}
}
loadSoundPref();
// Provide a test sound trigger to verify playback
window.fmTestSound = function fmTestSound() {
  try {
    fmUnlockAudioPlaybackOnce();
    if (SFX && SFX.click) {
      SFX.click.play(0.35);
      console.log('[SFX] Test click played');
    } else {
      const a = new Audio(buildAudioSrc('click')[0]);
      a.volume = 0.35;
      a.play().catch(() => {});
    }
  } catch (e) {
    console.warn('[SFX] Test sound failed', e);
  }
};
const targetEl = document.getElementById('fm-target');
const chartEl = document.getElementById('fm-merge-chart');
const targetBigEl = document.getElementById('fm-target-big');
// Game over overlay references
const gameOverEl = document.getElementById('fm-gameover');
const finalScoreEl = document.getElementById('fm-final-score');
const highScoreForm = document.getElementById('fm-highscore-form');
const playerNameInput = document.getElementById('fm-player-name');
const highScoresEl = document.getElementById('fm-highscores');
const restartBtn = document.getElementById('fm-restart-btn');
// Daily / Global controls
const dailyBtn = document.getElementById('fm-daily');
const globalBtn = document.getElementById('fm-global');
const dailyDateInput = document.getElementById('fm-daily-date');
const modeEl = document.getElementById('fm-mode');

// Target / bonus system (progressive: starts low, increases gradually)
let targetLevel = null;
let targetFloor = 1; // lower bound for target level window (pear and up)
let targetCeil = 4; // upper bound for target level window
function pickNewTarget() {
  const min = Math.max(0, Math.min(targetFloor, FRUITS.length - 1));
  const max = Math.max(min, Math.min(targetCeil, FRUITS.length - 1));
  targetLevel = randInt(min, max);
}

function updateModeLabel() {
  if (!modeEl) return;
  if (dailyMode) {
    const d = dailyDateStr || new Date().toISOString().slice(0, 10);
    modeEl.textContent = `Daily ${d}`;
  } else {
    modeEl.textContent = 'Global';
  }
  // Toggle active button styles
  if (dailyBtn) {
    dailyBtn.classList.toggle('is-active', !!dailyMode);
    dailyBtn.setAttribute('aria-pressed', dailyMode ? 'true' : 'false');
  }
  if (globalBtn) {
    globalBtn.classList.toggle('is-active', !dailyMode);
    globalBtn.setAttribute('aria-pressed', !dailyMode ? 'true' : 'false');
  }
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
// Derive absolute API URLs based on current site subpath (e.g., /fruit-merge or /fruit-sort)
function computeApiEndpointsFromLocation() {
  try {
    const origin = window.location.origin;
    const parts = window.location.pathname.split('/').filter(Boolean);
    const root = parts.length ? '/' + parts[0] : '';
    const base = origin + root + '/api';
    API_ENDPOINTS = {
      save: base + '/save-fruit-score.php',
      saveDaily: base + '/save-fruit-score-daily.php',
      get: base + '/get-fruit-scores.php',
      getDaily: base + '/get-fruit-daily.php',
    };
  } catch (e) {
    // fall back to relative defaults
  }
}
computeApiEndpointsFromLocation();

// ====================
// RESPONSIVE FIT FOR BOARD (mobile iframed, etc.)
// ====================
function fitBoardSizes() {
  try {
    // Prefer actual container width over viewport to avoid iframe/body padding issues
    const wrapper = document.querySelector('.fm-wrapper');
    const mainEl = document.querySelector('main');
    const board = document.getElementById('fm-board');
    const vw = Math.min(window.innerWidth || 0, document.documentElement.clientWidth || 0) || 0;
    const containerW =
      (board && board.parentElement && board.parentElement.clientWidth) ||
      (mainEl && mainEl.clientWidth) ||
      (wrapper && wrapper.clientWidth) ||
      vw;
    // Allow minimal side margin on very small screens so we don't press edges.
    const horizontalMargin = vw < 420 ? 2 : vw < 480 ? 4 : vw < 600 ? 8 : 28;
    const maxBoardWidth = Math.max(240, Math.min(containerW, vw) - horizontalMargin);
    // Base desktop values
    const DESKTOP_CELL = 87;
    const DESKTOP_GAP = 12;
    const DESKTOP_PAD = 14;
    // If viewport wide enough keep desktop sizing (no upscale beyond defaults)
    if (vw >= 920) {
      document.documentElement.style.setProperty('--cell', DESKTOP_CELL + 'px');
      document.documentElement.style.setProperty('--gap', DESKTOP_GAP + 'px');
      document.documentElement.style.setProperty('--pad', DESKTOP_PAD + 'px');
      return;
    }
    // Choose tighter gaps/padding for narrow screens
    let gap = vw < 420 ? 2 : vw < 480 ? 3 : vw < 600 ? 4 : 8; // raise minimum gap for clarity
    let pad = vw < 420 ? 2 : vw < 480 ? 4 : vw < 600 ? 6 : 10;
    // Compute cell size so 9 cells + 8 gaps + 2*pad fit inside maxBoardWidth
    let cell = Math.floor((maxBoardWidth - 2 * pad - (9 - 1) * gap) / 9);
    // Clamp cell to reasonable range
    const MIN_CELL = 24; // allow tighter fit on very small phones
    cell = Math.max(MIN_CELL, Math.min(DESKTOP_CELL, cell));

    // === Vertical fit pass (ensure all 9 rows visible on short iframes/iPad) ===
    // Estimate available vertical space for the board after header + chart.
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const headerH = (document.querySelector('.fm-header')?.offsetHeight || 0);
    const chartH = (document.getElementById('fm-merge-chart')?.offsetHeight || 0);
    // Safe-area bottom reserve (cannot read env() here; approximate +20px)
    const safeAreaApprox = 20;
    // Extra breathing room below board (buttons / spacing)
    const reserve = 40;
    const availableForBoard = Math.max(160, vh - headerH - chartH - safeAreaApprox - reserve);
    // Current computed board height with chosen sizes
    const boardHeight = 2 * pad + 9 * cell + 8 * gap;
    if (boardHeight > availableForBoard) {
      // Shrink strategy: reduce pad/gap first, then cell proportionally until fits or hits MIN_CELL.
      let pad2 = pad;
      let gap2 = gap;
      let cell2 = cell;
      // Reduce padding and gap to minimums
      pad2 = Math.max(1, Math.min(pad2, Math.floor(pad2 * 0.6)));
      gap2 = Math.max(2, Math.min(gap2, Math.floor(gap2 * 0.75))); // keep at least 2px gap for visual separation
      let newHeight = 2 * pad2 + 9 * cell2 + 8 * gap2;
      if (newHeight > availableForBoard) {
        // Compute proportional scale factor
        const ratio = availableForBoard / newHeight;
        cell2 = Math.max(MIN_CELL, Math.floor(cell2 * ratio * 0.98));
        // Recompute height
        newHeight = 2 * pad2 + 9 * cell2 + 8 * gap2;
        if (newHeight > availableForBoard && cell2 > MIN_CELL) {
          // Final attempt: linear reduction until fits or min cell reached
          while (newHeight > availableForBoard && cell2 > MIN_CELL) {
            cell2 -= 1;
            newHeight = 2 * pad2 + 9 * cell2 + 8 * gap2;
          }
        }
      }
      cell = cell2;
      gap = gap2;
      pad = pad2;
      if (window.fmLayoutDebug) {
        console.log('[LAYOUT] Vertical shrink applied', {
          vh,
          headerH,
          chartH,
          availableForBoard,
          finalCell: cell,
          finalGap: gap,
          finalPad: pad,
        });
      }
    } else if (window.fmLayoutDebug) {
      console.log('[LAYOUT] Width-only sizing OK', { cell, gap, pad, boardHeight, availableForBoard });
    }

    document.documentElement.style.setProperty('--cell', cell + 'px');
    document.documentElement.style.setProperty('--gap', gap + 'px');
    document.documentElement.style.setProperty('--pad', pad + 'px');
  } catch {}
}
window.addEventListener('resize', fitBoardSizes);
window.addEventListener('orientationchange', fitBoardSizes);
window.fmSetApi = function fmSetApi(map) {
  if (!map || typeof map !== 'object') return;
  API_ENDPOINTS = { ...API_ENDPOINTS, ...map };
};
window.fmGetApi = function fmGetApi() {
  return { ...API_ENDPOINTS };
};

// ============
// Top-of-page Leaderboards
// ============
const lbGlobalEl = document.getElementById('fm-lb-global');
const lbDailyEl = document.getElementById('fm-lb-daily');
const lbGlobalMoreBtn = document.getElementById('fm-lb-global-more');
const lbDailyMoreBtn = document.getElementById('fm-lb-daily-more');
let lbGlobalExpanded = false;
let lbDailyExpanded = false;

async function getJson(url) {
  try {
    const r = await fetch(url, { credentials: 'omit' });
    if (!r.ok) throw 0;
    return await r.json();
  } catch {
    return [];
  }
}
async function loadGlobalScores() {
  const api = window.fmGetApi && window.fmGetApi();
  if (!api || !api.get) return [];
  const data = await getJson(api.get);
  return Array.isArray(data) ? data : data.scores || [];
}
async function loadDailyScores(dateStr) {
  const api = window.fmGetApi && window.fmGetApi();
  if (!api || !api.getDaily) return [];
  const ymd = dateStr.replaceAll('-', '');
  const data = await getJson(api.getDaily + '?date=' + encodeURIComponent(ymd));
  return Array.isArray(data) ? data : data.scores || [];
}

async function renderLeaderboardsTop() {
  if (!lbGlobalEl || !lbDailyEl) return;
  const today = new Date().toISOString().slice(0, 10);
  const d = dailyMode ? dailyDateStr || today : today;
  const [g, dd] = await Promise.all([loadGlobalScores(), loadDailyScores(d)]);

  function renderList(el, arr, expanded) {
    el.innerHTML = '';
    const show = expanded ? Math.min(arr.length, 20) : Math.min(arr.length, 1);
    arr.slice(0, show).forEach((it, i) => {
      const li = document.createElement('li');
      li.textContent = `${i + 1}. ${it.name || 'Player'} — ${it.score} pts${
        it.difficulty ? ' (' + it.difficulty + ')' : ''
      }`;
      el.appendChild(li);
    });
  }

  renderList(lbGlobalEl, g, lbGlobalExpanded);
  renderList(lbDailyEl, dd, lbDailyExpanded);
}

lbGlobalMoreBtn &&
  lbGlobalMoreBtn.addEventListener('click', () => {
    lbGlobalExpanded = !lbGlobalExpanded;
    lbGlobalMoreBtn.textContent = lbGlobalExpanded ? 'Show less' : 'Show more';
    renderLeaderboardsTop();
  });
lbDailyMoreBtn &&
  lbDailyMoreBtn.addEventListener('click', () => {
    lbDailyExpanded = !lbDailyExpanded;
    lbDailyMoreBtn.textContent = lbDailyExpanded ? 'Show less' : 'Show more';
    renderLeaderboardsTop();
  });

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
      } else if (cellData.kind === 'bomb') {
        const img = document.createElement('img');
        img.src = 'img/bomb.png';
        img.alt = 'bomb';
        img.className = 'fm-bomb-img';
        const isDrop = fxQueue.some((fx) => fx.text === 'drop' && fx.row === r && fx.col === c);
        if (isDrop) img.classList.add('fm-drop-in');
        cell.appendChild(img);
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
  if (typeof targetBigEl !== 'undefined' && targetBigEl) {
    if (typeof targetLevel === 'number') {
      const lvl = Math.min(targetLevel, FRUITS.length - 1);
      const sprite = FRUITS[lvl] || FRUITS[FRUITS.length - 1];
      const name = fruitDisplayName(lvl);
      targetBigEl.innerHTML = `<span class="fm-target-big-label">Target</span><img src="img/${sprite}.png" alt="target fruit" class="fm-target-img fm-target-img--big"> <strong>${name}</strong> <span class=\"fm-target-level\">(L${lvl})</span>`;
    } else {
      targetBigEl.textContent = '';
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
  // Update hint attention each render
  updateHintAttention();
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
        let cell;
        if (bombsToSpawn > 0) {
          cell = { kind: 'bomb', newSpawn: true };
          bombsToSpawn--;
        } else {
          cell = createRandomCell();
        }
        // Merk kun nye frukter som "newSpawn" slik at kun de faller i gravity
        if (cell && (cell.kind === 'fruit' || cell.kind === 'bomb')) {
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
        if (
          cur &&
          cur.newSpawn &&
          (cur.kind === 'fruit' || cur.kind === 'bomb') &&
          below === null
        ) {
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
      if (cell && (cell.kind === 'fruit' || cell.kind === 'bomb') && cell.newSpawn) {
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

// Spawn bombs into random empty cells
function spawnBombs(count) {
  let placed = 0;
  let guard = 0;
  while (placed < count && guard < 500) {
    guard++;
    const r = randInt(0, ROWS - 1);
    const c = randInt(0, COLS - 1);
    if (grid[r][c] === null) {
      grid[r][c] = { kind: 'bomb' };
      placed++;
    }
  }
}

// Remove jars and clear 3x3 cells centered at row,col
function explodeAt(row, col) {
  const ids = new Set();
  for (let r = row - 1; r <= row + 1; r++) {
    for (let c = col - 1; c <= col + 1; c++) {
      if (!inBounds(r, c)) continue;
      for (const jar of jars) {
        if (jar.col === c && r >= jar.startRow && r < jar.startRow + jar.height) ids.add(jar.id);
      }
    }
  }
  for (const id of ids) {
    const idx = jars.findIndex((j) => j.id === id);
    if (idx !== -1) unlockJarByIndex(idx);
  }
  for (let r = row - 1; r <= row + 1; r++) {
    for (let c = col - 1; c <= col + 1; c++) {
      if (!inBounds(r, c)) continue;
      grid[r][c] = null;
    }
  }
  queueFx(row, col, 'explosion', true);
  if (SFX.glass_unlock) SFX.glass_unlock.play();
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
      if (!cell || cell.kind !== 'fruit' || cell.lockedBy) continue; // skip locked fruits

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
          if (other.kind === 'fruit' && other.level === cell.level && !other.lockedBy) {
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
    const dstr = dailyMode ? dailyDateStr || today : today;
    Promise.all([
      api.get
        ? fetch(api.get)
            .then((r) => r.json())
            .catch(() => [])
        : Promise.resolve([]),
      api.getDaily
        ? fetch(api.getDaily + '?date=' + dstr.replaceAll('-', ''))
            .then((r) => r.json())
            .catch(() => [])
        : Promise.resolve([]),
    ])
      .then(([global, daily]) => {
        const gHead = document.createElement('h3');
        gHead.textContent = 'Global High Scores';
        frag.appendChild(gHead);
        const gOl = document.createElement('ol');
        (Array.isArray(global) ? global : global.scores || []).slice(0, 20).forEach((it, i) => {
          const li = document.createElement('li');
          li.textContent = `${i + 1}. ${it.name || 'Player'} — ${it.score} pts${
            it.moves ? `, ${it.moves} moves` : ''
          }`;
          gOl.appendChild(li);
        });
        frag.appendChild(gOl);

        const dHead = document.createElement('h3');
        dHead.textContent = `Daily ${dstr}`;
        frag.appendChild(dHead);
        const dOl = document.createElement('ol');
        (Array.isArray(daily) ? daily : daily.scores || []).slice(0, 20).forEach((it, i) => {
          const li = document.createElement('li');
          li.textContent = `${i + 1}. ${it.name || 'Player'} — ${it.score} pts${
            it.moves ? `, ${it.moves} moves` : ''
          }`;
          dOl.appendChild(li);
        });
        frag.appendChild(dOl);

        highScoresEl.innerHTML = '';
        highScoresEl.appendChild(frag);
      })
      .catch(() => {
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
  stopHintAttentionTimer();
}
function hideGameOver() {
  if (gameOverEl) gameOverEl.classList.add('fm-hidden');
}
if (highScoreForm) {
  let highScoreSubmitted = false;
  highScoreForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (highScoreSubmitted) return; // prevent duplicates
    const name = (playerNameInput && playerNameInput.value.trim()) || 'Player';
    const entry = { name, score, moves, time: Date.now() };
    const list = loadHighScores();
    list.push(entry);
    saveHighScores(list);
    highScoreSubmitted = true;
    // Disable form inputs to give clear feedback
    if (playerNameInput) playerNameInput.disabled = true;
    const submitBtn = highScoreForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Score saved';
    }
    // Optional remote submit
    const api = window.fmGetApi && window.fmGetApi();
    if (api && (api.save || api.saveDaily)) {
      const yyyymmdd = (
        dailyMode
          ? dailyDateStr || new Date().toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10)
      ).replaceAll('-', '');
      const tasks = [];
      if (api.save)
        tasks.push(
          fetch(api.save, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ name, score: String(score), diff: 'normal' }),
          })
        );
      if (api.saveDaily)
        tasks.push(
          fetch(api.saveDaily, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              name,
              score: String(score),
              diff: 'normal',
              date: yyyymmdd,
            }),
          })
        );
      Promise.allSettled(tasks).finally(() => renderHighScores());
    } else {
      renderHighScores();
    }
    if (SFX.score_pop) SFX.score_pop.play(0.5);
    // Close overlay after first successful submission
    setTimeout(() => {
      hideGameOver();
    }, 300);
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
  // reset hint attention timer
  lastMergeAt = performance.now();
  updateHintAttention();

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

  // Bomb trigger: detonate any bombs adjacent to source or destination
  let exploded = false;
  const toCheck = [
    [srcRow, srcCol],
    [destRow, destCol],
  ];
  const seen = new Set();
  for (const [cr, cc] of toCheck) {
    for (let rr = cr - 1; rr <= cr + 1; rr++) {
      for (let cc2 = cc - 1; cc2 <= cc + 1; cc2++) {
        if (!inBounds(rr, cc2)) continue;
        const key = rr + ':' + cc2;
        if (seen.has(key)) continue;
        seen.add(key);
        const cell = grid[rr][cc2];
        if (cell && cell.kind === 'bomb') {
          // clear the bomb itself before explosion to avoid re-trigger
          grid[rr][cc2] = null;
          explodeAt(rr, cc2);
          exploded = true;
        }
      }
    }
  }

  if (exploded) {
    // Show explosion immediately
    renderGrid();
    // Let fruits settle without spawning new ones yet
    setTimeout(() => {
      applyGravity();
      // Only trigger a refill if no merges remain (next refill cycle), not immediately
      if (!hasAnyMergeMove()) {
        refillFromTop();
        applyGravity();
        refillCounter += 1; // track drop cycles only when we actually refill
        if (refillCounter % 3 === 2) spawnJars(1);
        if (refillCounter % 3 === 0) {
          bombsToSpawn += 1;
          refillFromTop();
          applyGravity();
        }
      }
      if (checkGameOver()) {
        gameOver = true;
        renderGrid();
        if (SFX.game_over) SFX.game_over.play();
        showGameOver();
        return;
      }
      renderGrid();
    }, 180);
    return;
  }

  // When no merges remain, let fruits fall and then refill so it's clear
  if (!hasAnyMergeMove()) {
    applyGravity();
    refillFromTop();
    setTimeout(() => {
      applyGravity();
      refillCounter += 1; // track drop cycles
      // Jars on 2nd drop, bombs on 3rd drop (cycling)
      if (refillCounter % 3 === 2) spawnJars(1);
      if (refillCounter % 3 === 0) {
        bombsToSpawn += 1;
        refillFromTop();
        applyGravity();
      }
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

if (soundToggleBtn) {
  soundToggleBtn.addEventListener('click', () => {
    const turningOn = SFX_MASTER <= 0.0001;
    fmSoundOn = turningOn ? true : false;
    SFX_MASTER = fmSoundOn ? 1 : 0;
    saveSoundPref();
    updateSoundToggleUI();
    if (turningOn) {
      fmUnlockAudioPlaybackOnce();
      fmPrimeSounds();
      // Play a click to confirm; fallback to beep if asset not ready
      let ok = false;
      try {
        if (SFX && SFX.click) {
          SFX.click.play(0.45);
          ok = true;
        }
      } catch {}
      if (!ok) fmPlayBeep(140, 750);
    }
  });
}
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
    // Suppress attention until some time passes again
    lastMergeAt = performance.now();
    updateHintAttention();
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
    updateModeLabel();
  });
}
if (globalBtn) {
  globalBtn.addEventListener('click', () => {
    dailyMode = false;
    dailyDateStr = null;
    rng = Math.random;
    startNewGame();
    updateModeLabel();
  });
}
// Auto-start daily on date change or Enter in date field
if (dailyDateInput) {
  dailyDateInput.addEventListener('change', () => {
    const today = new Date().toISOString().slice(0, 10);
    const d = dailyDateInput.value || today;
    if (d > today) return; // ignore future
    startDailyGameFor(d);
    updateModeLabel();
  });
  dailyDateInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const today = new Date().toISOString().slice(0, 10);
      const d = dailyDateInput.value || today;
      if (d > today) return;
      startDailyGameFor(d);
      updateModeLabel();
    }
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
  lastMergeAt = performance.now();
  startHintAttentionTimer();
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
  updateModeLabel();
  renderLeaderboardsTop();
  // Post-render ensure full board visible (second pass shrink if needed)
  setTimeout(() => {
    try {
      const board = document.getElementById('fm-board');
      if (!board) return;
      const rect = board.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;
      const overflow = rect.bottom - vh + 4; // margin
      if (overflow > 0) {
        let cell = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell'));
        let gap = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--gap'));
        let pad = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--pad'));
        let attempts = 0;
        while (overflow > 0 && cell2 > 18 && attempts < 40) {
          cell -= 1;
          if (attempts % 4 === 0 && gap > 2) gap -= 1; // never below 2
          if (attempts % 6 === 0 && pad > 1) pad -= 1;
          attempts++;
          document.documentElement.style.setProperty('--cell', cell + 'px');
          document.documentElement.style.setProperty('--gap', gap + 'px');
          document.documentElement.style.setProperty('--pad', pad + 'px');
          const r2 = board.getBoundingClientRect();
          const overflow2 = r2.bottom - vh + 4;
          if (overflow2 <= 0) break;
        }
        if (window.fmLayoutDebug) {
          console.log('[LAYOUT] Post-pass shrink attempts', attempts, 'final cell', cell);
        }
      }
    } catch {}
  }, 60);
}

// start første spillet
fitBoardSizes();
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

// ====================
// Bomb logic (3x3 clear + remove jars)
// ====================
function detonateBomb(row, col) {
  // collect jar ids intersecting the 3x3 area
  const ids = new Set();
  for (let r = row - 1; r <= row + 1; r++) {
    for (let c = col - 1; c <= col + 1; c++) {
      if (!inBounds(r, c)) continue;
      for (const jar of jars) {
        if (jar.col === c && r >= jar.startRow && r < jar.startRow + jar.height) {
          ids.add(jar.id);
        }
      }
    }
  }
  // remove jars first
  for (const id of ids) {
    const idx = jars.findIndex((j) => j.id === id);
    if (idx !== -1) unlockJarByIndex(idx);
  }
  // clear cells
  for (let r = row - 1; r <= row + 1; r++) {
    for (let c = col - 1; c <= col + 1; c++) {
      if (!inBounds(r, c)) continue;
      grid[r][c] = null;
    }
  }
  // FX/SFX
  queueFx(row, col, 'explosion', true);
  if (SFX.glass_unlock) SFX.glass_unlock.play();
  // Show explosion now
  renderGrid();
  // settle board without immediate refill
  setTimeout(() => {
    applyGravity();
    if (!hasAnyMergeMove()) {
      refillFromTop();
      applyGravity();
      refillCounter += 1;
      if (refillCounter % 3 === 2) spawnJars(1);
      if (refillCounter % 3 === 0) {
        bombsToSpawn += 1;
        refillFromTop();
        applyGravity();
      }
    }
    if (checkGameOver()) {
      gameOver = true;
      renderGrid();
      if (SFX.game_over) SFX.game_over.play();
      showGameOver();
      return;
    }
    renderGrid();
  }, 180);
}

// ====================
// Hint attention helpers
// ====================
function updateHintAttention() {
  if (!hintBtn) return;
  const now = performance.now();
  const idleMs = now - lastMergeAt;
  // start pulsing after 20s idle if a merge exists and game is active
  const shouldPulse = !gameOver && idleMs > 20000 && hasAnyMergeMove();
  hintBtn.classList.toggle('fm-attn', shouldPulse);
}
function startHintAttentionTimer() {
  if (hintAttnTimer) clearInterval(hintAttnTimer);
  hintAttnTimer = setInterval(updateHintAttention, 1000);
}
function stopHintAttentionTimer() {
  if (hintAttnTimer) {
    clearInterval(hintAttnTimer);
    hintAttnTimer = null;
  }
  if (hintBtn) hintBtn.classList.remove('fm-attn');
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
      if (!cell || cell.kind !== 'fruit' || cell.lockedBy) continue; // cannot use locked fruits
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
          if (other.kind === 'fruit' && other.level === cell.level && !other.lockedBy) {
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
    if (fx.text === 'explosion') {
      // Cover 3x3 area centered at fx.row,fx.col (clamped to board)
      const r0 = Math.max(0, fx.row - 1);
      const c0 = Math.max(0, fx.col - 1);
      const r1 = Math.min(ROWS - 1, fx.row + 1);
      const c1 = Math.min(COLS - 1, fx.col + 1);
      const topLeft = boardEl.querySelector(`.fm-cell[data-row="${r0}"][data-col="${c0}"]`);
      const bottomRight = boardEl.querySelector(`.fm-cell[data-row="${r1}"][data-col="${c1}"]`);
      if (!topLeft || !bottomRight) continue;
      const topRect = topLeft.getBoundingClientRect();
      const bottomRect = bottomRight.getBoundingClientRect();
      const boardRect = boardEl.getBoundingClientRect();
      const left = topRect.left - boardRect.left;
      const top = topRect.top - boardRect.top;
      const width = bottomRect.right - topRect.left;
      const height = bottomRect.bottom - topRect.top;
      const img = document.createElement('img');
      img.className = 'fm-explosion';
      img.style.left = `${left}px`;
      img.style.top = `${top}px`;
      img.style.width = `${width}px`;
      img.style.height = `${height}px`;
      const frames = [
        'img/sprite/eksplsjon_01.gif',
        'img/sprite/eksplsjon_02.gif',
        'img/sprite/eksplsjon_03.gif',
        'img/sprite/eksplsjon_04.gif',
        'img/sprite/eksplsjon_05.gif',
        'img/sprite/eksplsjon_06.png',
        'img/sprite/eksplsjon_07.gif',
        'img/sprite/eksplsjon_08.gif',
        'img/sprite/eksplsjon_09.gif',
      ];
      let i = 0;
      const step = () => {
        if (i >= frames.length) {
          img.remove();
          return;
        }
        img.src = frames[i++];
        setTimeout(step, 60);
      };
      boardEl.appendChild(img);
      step();
      continue;
    }
    // fallback: bonus/label popup
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
