// scripts/submit.js

const ADMIN_CODE = '123';

let players = [];
let games = [];
let ocrText = '';
let unlocked = false;

// DOM elements
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

const rank1List = document.getElementById('rank1-list');
const rank2List = document.getElementById('rank2-list');
const rank3List = document.getElementById('rank3-list');

function setStatus(el, type, msg) {
  el.className = 'status ' + type;
  el.textContent = msg;
}

/************************************************************
 *  Utility: Fuzzy detection for OCR guesses
 ************************************************************/
function getUploaderName() {
  const uploaderId = uploaderPlayerSelect.value;
  if (!uploaderId) return null;
  return players.find(p => p.id == uploaderId)?.name || null;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
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
  const a = word.toLowerCase(), b = target.toLowerCase();
  const maxLen = Math.max(a.length, b.length);
  const dist = levenshtein(a, b);
  if (maxLen <= 4) return dist <= 1;
  return dist <= 2;
}

function autoDetectTopThreeFromOCR() {
  if (!ocrText) return;

  let text = ocrText;
  const uploaderName = getUploaderName();
  if (uploaderName) text = text.replace(/\b[Yy]ou\b/g, uploaderName);

  const lines = text.toLowerCase().split("\n");
  const matches = [];

  for (const p of players) {
    const first = p.name.split(" ")[0].toLowerCase();
    let foundAt = -1;

    for (let i = 0; i < lines.length; i++) {
      const words = lines[i].split(/[^a-zA-Z]+/).filter(Boolean);
      if (words.some(w => w === first || isCloseMatch(w, first))) {
        foundAt = i; break;
      }
    }

    if (foundAt !== -1) matches.push({ player: p, index: foundAt });
  }

  matches.sort((a, b) => a.index - b.index);

  // Reset checkboxes
  document.querySelectorAll('.rank-list input[type="checkbox"]').forEach(cb => cb.checked = false);

  if (matches[0]) checkRank(matches[0].player.id, 1);
  if (matches[1]) checkRank(matches[1].player.id, 2);
  if (matches[2]) checkRank(matches[2].player.id, 3);
}

/************************************************************
 *  Rendering checkboxes
 ************************************************************/
function checkRank(id, rank) {
  const container = rank === 1 ? rank1List :
                    rank === 2 ? rank2List :
                                 rank3List;

  const box = container.querySelector(`input[data-id="${id}"]`);
  if (box) box.checked = true;
}

function renderRankLists() {
  const cfgs = [
    { elem: rank1List, rank: 1, points: 3 },
    { elem: rank2List, rank: 2, points: 2 },
    { elem: rank3List, rank: 3, points: 1 },
  ];

  for (const cfg of cfgs) {
    cfg.elem.innerHTML = "";

    players.forEach(p => {
      const row = document.createElement("div");
      row.className = "rank-item";

      const name = document.createElement("span");
      name.textContent = p.name;

      const box = document.createElement("input");
      box.type = "checkbox";
      box.dataset.id = p.id;
      box.dataset.rank = cfg.rank;
      box.dataset.points = cfg.points;

      row.appendChild(name);
      row.appendChild(box);
      cfg.elem.appendChild(row);
    });
  }
}

function renderFlawless() {
  flawlessList.innerHTML = "";

  players.forEach(p => {
    const row = document.createElement("div");
    row.className = "flawless-item";

    const name = document.createElement("span");
    name.textContent = p.name;

    const box = document.createElement("input");
    box.type = "checkbox";
    box.dataset.id = p.id;

    row.appendChild(name);
    row.appendChild(box);
    flawlessList.appendChild(row);
  });
}

/************************************************************
 * Admin Unlock + Load Data
 ************************************************************/
unlockBtn.addEventListener('click', () => {
  if (adminCodeInput.value.trim() === ADMIN_CODE) {
    unlocked = true;
    submitCard.style.display = "block";
    initData();
  } else {
    setStatus(adminStatus, "error", "Wrong admin code");
  }
});

async function initData() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    dateInput.value = today;

    const gamesRes = await supabaseClient.from("games").select("*").order("display_name");
    games = gamesRes.data || [];

    gameSelect.innerHTML = "";
    games.forEach(g => {
      const opt = document.createElement("option");
      opt.value = g.id;
      opt.textContent = g.display_name;
      gameSelect.appendChild(opt);
    });

    const playersRes = await supabaseClient.from("players").select("*").order("name");
    players = playersRes.data || [];

    renderRankLists();
    renderFlawless();

    screenshotInput.addEventListener("change", () => {
      ocrBtn.disabled = !(screenshotInput.files?.length);
    });

    setStatus(adminStatus, "ok", "Ready.");
  } catch (err) {
    console.error(err);
    setStatus(adminStatus, "error", "Failed to load data");
  }
}

/************************************************************
 * OCR
 ************************************************************/
ocrBtn.addEventListener("click", async () => {
  const file = screenshotInput.files?.[0];
  if (!file) return;

  setStatus(ocrStatus, "info", "OCR running...");
  ocrBtn.disabled = true;

  try {
    const url = URL.createObjectURL(file);
    const { data } = await Tesseract.recognize(url, "eng");

    ocrText = data.text || "";
    ocrOutput.textContent = ocrText;

    setStatus(ocrStatus, "ok", "OCR done.");
    autoDetectTopThreeFromOCR();
  } catch (err) {
    console.error(err);
    setStatus(ocrStatus, "error", "OCR failed.");
  }

  ocrBtn.disabled = false;
});

/************************************************************
 * SAVE RESULTS — FULLY FIXED FOR MULTIPLE SELECTS
 ************************************************************/
saveBtn.addEventListener("click", async () => {
  if (!unlocked) return;

  const gameId = gameSelect.value;
  const date = dateInput.value;

  saveBtn.disabled = true;
  setStatus(saveStatus, "info", "Saving...");

  try {
    // Get/create result_set row
    let { data: existing } = await supabaseClient
      .from("result_sets")
      .select("*")
      .eq("game_id", gameId)
      .eq("result_date", date)
      .maybeSingle();

    let resultSetId;

    if (existing) {
      resultSetId = existing.id;
      await supabaseClient.from("placements").delete().eq("result_set_id", resultSetId);
    } else {
      let insertRes = await supabaseClient
        .from("result_sets")
        .insert({ game_id: gameId, result_date: date })
        .select()
        .single();

      resultSetId = insertRes.data.id;
    }

    /******************************
     * BUILD placementsToInsert[]
     ******************************/
    const placementsToInsert = [];

    function collectRankRows(container, rank, points) {
      container.querySelectorAll("input:checked").forEach(cb => {
        placementsToInsert.push({
          result_set_id: resultSetId,
          player_id: Number(cb.dataset.id),
          rank,
          points
        });
      });
    }

    collectRankRows(rank1List, 1, 3);
    collectRankRows(rank2List, 2, 2);
    collectRankRows(rank3List, 3, 1);

    // flawless bonus
    flawlessList.querySelectorAll("input:checked").forEach(cb => {
      const pid = Number(cb.dataset.id);
      const existing = placementsToInsert.find(r => r.player_id === pid);
      if (existing) {
        existing.points += 1;
      } else {
        placementsToInsert.push({
          result_set_id: resultSetId,
          player_id: pid,
          rank: 0,
          points: 1
        });
      }
    });

    /******************************
     * FINAL INSERT
     ******************************/
    if (placementsToInsert.length > 0) {
      await supabaseClient.from("placements").insert(placementsToInsert);
    }

    setStatus(saveStatus, "ok", "Saved!");
  } catch (err) {
    console.error(err);
    setStatus(saveStatus, "error", "Save failed.");
  }

  saveBtn.disabled = false;
});
