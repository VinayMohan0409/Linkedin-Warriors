// scripts/submit.js

const ADMIN_CODE = '123'; // set your shared admin code

let players = [];
let games = [];
let ocrText = '';
let unlocked = false;

// DOM references
const adminCodeInput = document.getElementById('admin-code');
const unlockBtn = document.getElementById('unlock-btn');
const adminStatus = document.getElementById('admin-status');
const submitCard = document.getElementById('submit-card');

const gameSelect = document.getElementById('game-select');
const dateInput = document.getElementById('date-input');
const uploaderPlayerSelect = document.getElementById('uploader-player');
const submittedByInput = document.getElementById('submitted-by');

const screenshotInput = document.getElementById('screenshot-input');
const ocrBtn = document.getElementById('ocr-btn');
const ocrStatus = document.getElementById('ocr-status');
const ocrOutput = document.getElementById('ocr-output');

const flawlessList = document.getElementById('flawless-list');

const saveBtn = document.getElementById('save-btn');
const saveStatus = document.getElementById('save-status');

// NEW rank lists
const rank1List = document.getElementById('rank1-list');
const rank2List = document.getElementById('rank2-list');
const rank3List = document.getElementById('rank3-list');

function setStatus(el, type, msg) {
  el.className = 'status ' + type;
  el.textContent = msg;
}

/* ---------------------------------------------
   OCR post-processing helpers
--------------------------------------------- */

function getUploaderName() {
  const uploaderId = uploaderPlayerSelect.value;
  if (!uploaderId) return null;
  const p = players.find(pl => String(pl.id) === String(uploaderId));
  return p ? p.name : null;
}

// Basic Levenshtein (fuzzy match)
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function isCloseMatch(word, target) {
  const a = word.toLowerCase();
  const b = target.toLowerCase();
  const maxLen = Math.max(a.length, b.length);
  const dist = levenshtein(a, b);
  if (maxLen <= 4) return dist <= 1;
  return dist <= 2;
}

// Auto-detect ranking order from OCR (fills nothing now, just a helper)
function autoDetectTopThreeFromOCR() {
  if (!ocrText || players.length === 0) return;

  let textForMatching = ocrText;
  const uploaderName = getUploaderName();
  if (uploaderName) {
    textForMatching = textForMatching.replace(/\b[Yy]ou\b/g, uploaderName);
  }

  const lines = textForMatching.toLowerCase().split('\n');
  const matches = [];

  for (const p of players) {
    const firstName = p.name.split(' ')[0].toLowerCase();
    let bestLineIndex = -1;
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      const words = lines[i].split(/[^a-zA-Z]+/).filter(Boolean);
      for (const w of words) {
        if (w === firstName || isCloseMatch(w, firstName)) {
          bestLineIndex = i;
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (found) matches.push({ player: p, index: bestLineIndex });
  }

  matches.sort((a, b) => a.index - b.index);

  // Auto-fill top 3 by checking boxes
  uncheckAllRankLists();

  if (matches[0]) checkPlayerInRank(matches[0].player.id, 1);
  if (matches[1]) checkPlayerInRank(matches[1].player.id, 2);
  if (matches[2]) checkPlayerInRank(matches[2].player.id, 3);
}

/* ---------------------------------------------
   Rendering checkbox lists
--------------------------------------------- */

function uncheckAllRankLists() {
  document.querySelectorAll('.rank-list input[type="checkbox"]').forEach(cb => cb.checked = false);
}

function checkPlayerInRank(playerId, rank) {
  const container = rank === 1 ? rank1List :
                    rank === 2 ? rank2List :
                                 rank3List;

  const box = container.querySelector(`input[data-pid="${playerId}"]`);
  if (box) box.checked = true;
}

function renderRankCheckboxes() {
  const rankConfigs = [
    { container: rank1List, rank: 1, points: 3 },
    { container: rank2List, rank: 2, points: 2 },
    { container: rank3List, rank: 3, points: 1 }
  ];

  for (const cfg of rankConfigs) {
    cfg.container.innerHTML = '';
    players.forEach(p => {
      const row = document.createElement('div');
      row.className = 'rank-item';

      const name = document.createElement('span');
      name.textContent = p.name;

      const box = document.createElement('input');
      box.type = 'checkbox';
      box.dataset.pid = p.id;
      box.dataset.rank = cfg.rank;
      box.dataset.points = cfg.points;

      row.appendChild(name);
      row.appendChild(box);
      cfg.container.appendChild(row);
    });
  }
}

function renderFlawlessCheckboxes() {
  flawlessList.innerHTML = '';

  players.forEach(p => {
    const row = document.createElement('div');
    row.className = 'flawless-item';

    const name = document.createElement('span');
    name.textContent = p.name;

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.pid = p.id;

    row.appendChild(name);
    row.appendChild(box);
    flawlessList.appendChild(row);
  });
}

/* ---------------------------------------------
   Admin unlock
--------------------------------------------- */

unlockBtn.addEventListener('click', () => {
  const code = adminCodeInput.value.trim();
  if (code === ADMIN_CODE) {
    unlocked = true;
    submitCard.style.display = 'block';
    setStatus(adminStatus, 'ok', 'Unlocked!');
    initData();
  } else {
    setStatus(adminStatus, 'error', 'Incorrect admin code.');
  }
});

uploaderPlayerSelect.addEventListener('change', () => {
  if (ocrText) autoDetectTopThreeFromOCR();
});

/* ---------------------------------------------
   Load games + players
--------------------------------------------- */

async function initData() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    dateInput.value = today;

    // games
    const { data: gamesData } = await supabaseClient
      .from('games')
      .select('*')
      .order('display_name');

    games = gamesData || [];
    gameSelect.innerHTML = '';
    games.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.display_name;
      gameSelect.appendChild(opt);
    });

    // players
    const { data: playersData } = await supabaseClient
      .from('players')
      .select('*')
      .order('name');

    players = playersData || [];

    // render checkbox lists
    renderRankCheckboxes();
    renderFlawlessCheckboxes();

    // enable OCR button
    screenshotInput.addEventListener('change', () => {
      ocrBtn.disabled = !(screenshotInput.files && screenshotInput.files[0]);
    });

    setStatus(adminStatus, 'ok', 'Ready.');
  } catch (err) {
    console.error(err);
    setStatus(adminStatus, 'error', 'Failed to load data.');
  }
}

/* ---------------------------------------------
   OCR
--------------------------------------------- */

ocrBtn.addEventListener('click', async () => {
  const file = screenshotInput.files?.[0];
  if (!file) {
    setStatus(ocrStatus, 'error', 'Upload an image first.');
    return;
  }

  setStatus(ocrStatus, 'info', 'OCR running...');
  ocrBtn.disabled = true;
  ocrOutput.textContent = '';

  try {
    const url = URL.createObjectURL(file);

    const { data } = await Tesseract.recognize(url, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          setStatus(ocrStatus, 'info', `OCR: ${Math.round(m.progress * 100)}%`);
        }
      }
    });

    ocrText = data.text || '';
    ocrOutput.textContent = ocrText;

    setStatus(ocrStatus, 'ok', 'OCR complete.');
    autoDetectTopThreeFromOCR();
  } catch (err) {
    console.error(err);
    setStatus(ocrStatus, 'error', 'OCR failed.');
  } finally {
    ocrBtn.disabled = false;
  }
});

/* ---------------------------------------------
   Save Results
--------------------------------------------- */

saveBtn.addEventListener('click', async () => {
  if (!unlocked) {
    setStatus(saveStatus, 'error', 'Unlock first.');
    return;
  }

  const gameId = gameSelect.value;
  const resultDate = dateInput.value;
  const submittedBy = submittedByInput.value.trim() || null;

  if (!gameId || !resultDate) {
    setStatus(saveStatus, 'error', 'Pick game + date.');
    return;
  }

  saveBtn.disabled = true;
  setStatus(saveStatus, 'info', 'Saving...');

  try {
    // check existing
    const { data: existing } = await supabaseClient
      .from('result_sets')
      .select('*')
      .eq('game_id', gameId)
      .eq('result_date', resultDate)
      .maybeSingle();

    let resultSetId;

    if (existing) {
      resultSetId = existing.id;
      await supabaseClient.from('placements').delete().eq('result_set_id', resultSetId);
    } else {
      const { data: inserted } = await supabaseClient
        .from('result_sets')
        .insert({ game_id: gameId, result_date: resultDate, submitted_by: submittedBy })
        .select()
        .single();

      resultSetId = inserted.id;
    }

    // collect placements
    const placementsToInsert = [];

    function collectRank(container, rank, points) {
      const boxes = container.querySelectorAll('input[type="checkbox"]:checked');
      boxes.forEach(b => {
        placementsToInsert.push({
          result_set_id: resultSetId,
          player_id: Number(b.dataset.pid),
          rank,
          points
        });
      });
    }

    collectRank(rank1List, 1, 3);
    collectRank(rank2List, 2, 2);
    collectRank(rank3List, 3, 1);

    if (placementsToInsert.length === 0) {
      setStatus(saveStatus, 'error', 'Select at least one placement.');
      saveBtn.disabled = false;
      return;
    }

    // flawless bonus
    const flawlessBoxes = flawlessList.querySelectorAll('input[type="checkbox"]:checked');
    flawlessBoxes.forEach(b => {
      const pid = Number(b.dataset.pid);
      const existing = placementsToInsert.find(p => p.player_id === pid);

      if (existing) {
        existing.points += 1;
      } else {
        placementsToInsert.push({
          result_set_id: resultSetId,
          player_id: pid,
          rank: null,
          points: 1
        });
      }
    });

    // save
    if (placementsToInsert.length > 0) {
      await supabaseClient.from('placements').insert(placementsToInsert);
    }

    setStatus(saveStatus, 'ok', 'Saved!');
  } catch (err) {
    console.error(err);
    setStatus(saveStatus, 'error', 'Save failed.');
  } finally {
    saveBtn.disabled = false;
  }
});
