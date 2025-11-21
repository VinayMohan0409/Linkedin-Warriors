// scripts/submit.js

const ADMIN_CODE = '123';  // pick anything and share with your friends

let players = [];
let games = [];
let ocrText = '';
let unlocked = false;

// DOM
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

const rank1Select = document.getElementById('rank1');
const rank2Select = document.getElementById('rank2');
const rank3Select = document.getElementById('rank3');

const saveBtn = document.getElementById('save-btn');
const saveStatus = document.getElementById('save-status');

function setStatus(el, type, msg) {
  el.className = 'status ' + type;
  el.textContent = msg;
}

function populateSelectOptions(select, list) {
  select.innerHTML = '<option value="">-- Select player --</option>';
  for (const p of list) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  }
}

function getUploaderName() {
  const uploaderId = uploaderPlayerSelect.value;
  if (!uploaderId) return null;
  const p = players.find(pl => String(pl.id) === String(uploaderId));
  return p ? p.name : null;
}

// Simple Levenshtein distance (how many edits to turn a -> b)
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
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return dp[m][n];
}

// Decide if two words are "close enough" to be considered the same
function isCloseMatch(word, target) {
  const a = word.toLowerCase();
  const b = target.toLowerCase();
  const maxLen = Math.max(a.length, b.length);

  const dist = levenshtein(a, b);

  // allow 1 error for short names, 2 for longer ones
  if (maxLen <= 4) return dist <= 1;
  return dist <= 2;
}


function autoDetectTopThreeFromOCR() {
  if (!ocrText || players.length === 0) return;

  // Replace "You" with the uploader's name if selected
  const uploaderName = getUploaderName();
  let textForMatching = ocrText;
  if (uploaderName) {
    textForMatching = textForMatching.replace(/\b[Yy]ou\b/g, uploaderName);
  }

  const lines = textForMatching.toLowerCase().split('\n');
  const matches = [];

  // For each player, look through lines and find the best fuzzy match
  for (const p of players) {
    const firstName = p.name.split(' ')[0].toLowerCase();
    let bestLineIndex = -1;
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const words = line.split(/[^a-zA-Z]+/).filter(Boolean); // letters only words
      for (const w of words) {
        // exact first-name hit OR close fuzzy match
        if (w === firstName || isCloseMatch(w, firstName)) {
          bestLineIndex = i;
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (found && bestLineIndex !== -1) {
      matches.push({ player: p, index: bestLineIndex });
    }
  }

  // Earlier line in the text = higher on the leaderboard
  matches.sort((a, b) => a.index - b.index);

  // Fill dropdowns
  populateSelectOptions(rank1Select, players);
  populateSelectOptions(rank2Select, players);
  populateSelectOptions(rank3Select, players);

  if (matches[0]) rank1Select.value = matches[0].player.id;
  if (matches[1]) rank2Select.value = matches[1].player.id;
  if (matches[2]) rank3Select.value = matches[2].player.id;
}


// admin unlock
unlockBtn.addEventListener('click', () => {
  const code = adminCodeInput.value.trim();
  if (code === ADMIN_CODE) {
    unlocked = true;
    submitCard.style.display = 'block';
    setStatus(adminStatus, 'ok', 'Unlocked! You can now submit results.');
    initData();
  } else {
    setStatus(adminStatus, 'error', 'Incorrect admin code.');
  }
});

uploaderPlayerSelect.addEventListener('change', () => {
  if (ocrText) {
    autoDetectTopThreeFromOCR();  // re-guess top 3 using new "You" mapping
  }
});


async function initData() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    dateInput.value = today;

    const { data: gamesData, error: gamesError } = await supabaseClient
      .from('games')
      .select('*')
      .order('display_name');

    if (gamesError) {
      console.error(gamesError);
      setStatus(adminStatus, 'error', 'Failed to load games.');
      return;
    }
    games = gamesData || [];
    gameSelect.innerHTML = '';
    for (const g of games) {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.display_name;
      gameSelect.appendChild(opt);
    }

    const { data: playersData, error: playersError } = await supabaseClient
      .from('players')
      .select('*')
      .order('name');

    if (playersError) {
      console.error(playersError);
      setStatus(adminStatus, 'error', 'Failed to load players.');
      return;
    }
    players = playersData || [];

    populateSelectOptions(uploaderPlayerSelect, players);
    populateSelectOptions(rank1Select, players);
    populateSelectOptions(rank2Select, players);
    populateSelectOptions(rank3Select, players);

    screenshotInput.addEventListener('change', () => {
      ocrBtn.disabled = !(screenshotInput.files && screenshotInput.files[0]);
    });

    setStatus(adminStatus, 'ok', 'Data loaded. Choose game, date, and upload screenshot.');
  } catch (err) {
    console.error(err);
    setStatus(adminStatus, 'error', 'Unexpected error while loading data.');
  }
}

// OCR
ocrBtn.addEventListener('click', async () => {
  const file = screenshotInput.files?.[0];
  if (!file) {
    setStatus(ocrStatus, 'error', 'Please choose a screenshot first.');
    return;
  }

  setStatus(ocrStatus, 'info', 'Running OCR... this may take a few seconds.');
  ocrBtn.disabled = true;
  ocrOutput.textContent = '';

  try {
    const imageUrl = URL.createObjectURL(file);

    const { data } = await Tesseract.recognize(imageUrl, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          setStatus(ocrStatus, 'info', `OCR progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    });

    ocrText = data.text || '';
    ocrOutput.textContent = ocrText || '[No text detected]';

    setStatus(ocrStatus, 'ok', 'OCR complete. Guessed top 3 based on text.');
    autoDetectTopThreeFromOCR();
    saveBtn.disabled = true; // will re-enable after manually checking? or:
    saveBtn.disabled = false;
  } catch (err) {
    console.error(err);
    setStatus(ocrStatus, 'error', 'OCR failed. Try again or check the screenshot.');
  } finally {
    ocrBtn.disabled = false;
  }
});

// save results
saveBtn.addEventListener('click', async () => {
  if (!unlocked) {
    setStatus(saveStatus, 'error', 'You must unlock with the admin code first.');
    return;
  }

  const gameId = gameSelect.value;
  const resultDate = dateInput.value;
  const submittedBy = submittedByInput.value.trim() || null;

  if (!gameId || !resultDate) {
    setStatus(saveStatus, 'error', 'Please select a game and date.');
    return;
  }

  const rank1Id = rank1Select.value || null;
  const rank2Id = rank2Select.value || null;
  const rank3Id = rank3Select.value || null;

  if (!rank1Id && !rank2Id && !rank3Id) {
    setStatus(saveStatus, 'error', 'Select at least one placement.');
    return;
  }

  saveBtn.disabled = true;
  setStatus(saveStatus, 'info', 'Saving results...');

  try {
    const { data: existing, error: existingError } = await supabaseClient
      .from('result_sets')
      .select('*')
      .eq('game_id', gameId)
      .eq('result_date', resultDate)
      .maybeSingle();

    if (existingError && existingError.code !== 'PGRST116') {
      console.error(existingError);
      setStatus(saveStatus, 'error', 'Error checking existing results.');
      saveBtn.disabled = false;
      return;
    }

    let resultSetId;

    if (existing) {
      resultSetId = existing.id;
      const { error: delError } = await supabaseClient
        .from('placements')
        .delete()
        .eq('result_set_id', resultSetId);
      if (delError) {
        console.error(delError);
        setStatus(saveStatus, 'error', 'Error clearing old placements.');
        saveBtn.disabled = false;
        return;
      }
    } else {
      const { data: inserted, error: insertError } = await supabaseClient
        .from('result_sets')
        .insert({
          game_id: gameId,
          result_date: resultDate,
          submitted_by: submittedBy
        })
        .select()
        .single();

      if (insertError) {
        console.error(insertError);
        setStatus(saveStatus, 'error', 'Error creating result record.');
        saveBtn.disabled = false;
        return;
      }
      resultSetId = inserted.id;
    }

    const placementsToInsert = [];
    if (rank1Id) placementsToInsert.push({ result_set_id: resultSetId, player_id: Number(rank1Id), rank: 1, points: 3 });
    if (rank2Id) placementsToInsert.push({ result_set_id: resultSetId, player_id: Number(rank2Id), rank: 2, points: 2 });
    if (rank3Id) placementsToInsert.push({ result_set_id: resultSetId, player_id: Number(rank3Id), rank: 3, points: 1 });

    if (placementsToInsert.length > 0) {
      const { error: placeError } = await supabaseClient
        .from('placements')
        .insert(placementsToInsert);

      if (placeError) {
        console.error(placeError);
        setStatus(saveStatus, 'error', 'Error saving placements.');
        saveBtn.disabled = false;
        return;
      }
    }

    setStatus(saveStatus, 'ok', 'Results saved successfully!');
  } catch (err) {
    console.error(err);
    setStatus(saveStatus, 'error', 'Unexpected error saving results.');
  } finally {
    saveBtn.disabled = false;
  }
});
