// scripts/leaderboard.js

const modeSelect = document.getElementById('mode-select');
const leaderboardBody = document.getElementById('leaderboard-body');
const statusText = document.getElementById('status-text');
const modeDescription = document.getElementById('mode-description');

const funHighlights = document.getElementById('fun-highlights');

const gameFilter = document.getElementById('game-filter');
const perGameBody = document.getElementById('pergame-body');
const perGameStatus = document.getElementById('pergame-status');

let players = [];
let games = [];
let placements = []; // enriched with game_id, category, date

let slidesData = [];
let currentSlideIndex = 0;
let sliderIntervalId = null;

function setStatus(msg) {
  statusText.textContent = msg;
}

function setPerGameStatus(msg) {
  perGameStatus.textContent = msg;
}

function setModeDescriptionText(mode) {
  if (mode === 'overall') {
    modeDescription.textContent = 'Total points across all 6 games.';
  } else if (mode === 'analytical') {
    modeDescription.textContent = 'Points from analytical games only (Zip, Sudoku, Tango, Queens).';
  } else if (mode === 'language') {
    modeDescription.textContent = 'Points from language games only (Cross Climb, Pinpoint).';
  } else if (mode === 'daily') {
    modeDescription.textContent = 'Points scored today only.';
  }
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// Helper to compute days between two date strings (YYYY-MM-DD)
function daysBetween(dateStr) {
  if (!dateStr) return Infinity;
  const d1 = new Date(dateStr);
  const d2 = new Date();
  const diffMs = d2.getTime() - d1.getTime();
  return diffMs / (1000 * 60 * 60 * 24);
}

// Load everything from Supabase
async function loadData() {
  try {
    setStatus('Loading leaderboard data...');

    // 1) Players
    const { data: playersData, error: playersError } = await supabaseClient
      .from('players')
      .select('*')
      .order('name');

    if (playersError) {
      console.error(playersError);
      setStatus('Error loading players.');
      return;
    }
    players = playersData || [];

    // 2) Games
    const { data: gamesData, error: gamesError } = await supabaseClient
      .from('games')
      .select('*')
      .order('display_name');

    if (gamesError) {
      console.error(gamesError);
      setStatus('Error loading games.');
      return;
    }
    games = gamesData || [];
    const gameById = {};
    games.forEach(g => { gameById[g.id] = g; });

    // 3) Result sets (to know which game + date each placement belongs to)
    const { data: resultSetsData, error: rsError } = await supabaseClient
      .from('result_sets')
      .select('id, game_id, result_date');

    if (rsError) {
      console.error(rsError);
      setStatus('Error loading result sets.');
      return;
    }
    const resultSetById = {};
    (resultSetsData || []).forEach(rs => { resultSetById[rs.id] = rs; });

    // 4) Placements (who scored points)
    const { data: placementsData, error: placementsError } = await supabaseClient
      .from('placements')
      .select('player_id, points, result_set_id');

    if (placementsError) {
      console.error(placementsError);
      setStatus('Error loading placements.');
      return;
    }

    // Enrich placements with game_id + category + date
    placements = (placementsData || []).map(p => {
      const rs = resultSetById[p.result_set_id];
      const gameId = rs ? rs.game_id : null;
      const game = gameById[gameId];
      return {
        player_id: p.player_id,
        points: p.points,
        game_id: gameId,
        category: game ? game.category : null,
        date: rs ? rs.result_date : null
      };
    });

    // Initialize per-game dropdown
    initPerGameDropdown();

    setStatus('');
    renderLeaderboard();
    renderPerGameLeaderboard();
    renderFunHighlights();
  } catch (err) {
    console.error(err);
    setStatus('Unexpected error loading leaderboard.');
  }
}

// Compute totals based on mode
function computePointsByMode(mode) {
  const totals = {};
  players.forEach(p => { totals[p.id] = 0; });

  const today = todayDateString();

  placements.forEach(p => {
    if (mode === 'analytical' && p.category !== 'analytical') return;
    if (mode === 'language' && p.category !== 'language') return;
    if (mode === 'daily' && p.date !== today) return;

    totals[p.player_id] += p.points;
  });

  const rows = players.map(p => ({
    id: p.id,
    name: p.name,
    points: totals[p.id] || 0
  }));

  rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  return rows;
}

// Render main leaderboard table
function renderLeaderboard() {
  const mode = modeSelect.value;
  setModeDescriptionText(mode);

  const rows = computePointsByMode(mode);

  leaderboardBody.innerHTML = '';

  rows.forEach((row, index) => {
    const tr = document.createElement('tr');

    const rankTd = document.createElement('td');
    rankTd.className = 'rank';
    rankTd.textContent = index + 1;
    tr.appendChild(rankTd);

    const nameTd = document.createElement('td');
    nameTd.textContent = row.name;
    tr.appendChild(nameTd);

    const pointsTd = document.createElement('td');
    pointsTd.className = 'points';
    pointsTd.textContent = row.points;
    tr.appendChild(pointsTd);

    leaderboardBody.appendChild(tr);
  });

  if (rows.length === 0) {
    setStatus('No results yet for this view.');
  } else {
    setStatus('');
  }
}

// Init per-game dropdown
function initPerGameDropdown() {
  gameFilter.innerHTML = '';
  games.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.display_name;
    gameFilter.appendChild(opt);
  });

  // Default to first game if available
  if (games.length > 0) {
    gameFilter.value = games[0].id;
  }
}

// Render per-game leaderboard
function renderPerGameLeaderboard() {
  const selectedGameId = gameFilter.value;
  if (!selectedGameId) {
    perGameBody.innerHTML = '';
    setPerGameStatus('Select a game to see its leaderboard.');
    return;
  }

  const totals = {};
  players.forEach(p => { totals[p.id] = 0; });

  placements.forEach(p => {
    if (p.game_id === selectedGameId) {
      totals[p.player_id] += p.points;
    }
  });

  // Only show players with > 0 points for this game
  const rows = players
    .map(p => ({
      id: p.id,
      name: p.name,
      points: totals[p.id] || 0
    }))
    .filter(r => r.points > 0);

  perGameBody.innerHTML = '';

  rows.forEach((row, index) => {
    const tr = document.createElement('tr');

    const rankTd = document.createElement('td');
    rankTd.className = 'rank';
    rankTd.textContent = index + 1;
    tr.appendChild(rankTd);

    const nameTd = document.createElement('td');
    nameTd.textContent = row.name;
    tr.appendChild(nameTd);

    const pointsTd = document.createElement('td');
    pointsTd.className = 'points';
    pointsTd.textContent = row.points;
    tr.appendChild(pointsTd);

    perGameBody.appendChild(tr);
  });

  if (rows.length === 0) {
    setPerGameStatus('No points recorded yet for this game.');
  } else {
    setPerGameStatus('');
  }
}

// Build and start the fun "slide show"
function renderFunHighlights() {
  const today = todayDateString();

  // Overall monarch
  const overallRows = computePointsByMode('overall');
  const overallLeader = overallRows.find(r => r.points > 0) || null;

  // Player of the day (today mode)
  const todayRows = computePointsByMode('daily');
  const playerOfTheDay = todayRows.find(r => r.points > 0) || null;

  // Fire streak: most points in last 7 days
  const pointsLast7Days = {};
  players.forEach(p => { pointsLast7Days[p.id] = 0; });
  placements.forEach(p => {
    if (daysBetween(p.date) <= 7) {
      pointsLast7Days[p.player_id] += p.points;
    }
  });
  let firePlayer = null;
  let firePoints = 0;
  players.forEach(p => {
    const pts = pointsLast7Days[p.id] || 0;
    if (pts > firePoints) {
      firePoints = pts;
      firePlayer = p;
    }
  });
  if (firePoints === 0) {
    firePlayer = null;
  }

  // Stinker: lowest overall points among players who have *some* points
  const playersWithOverall = overallRows.filter(r => r.points > 0);
  let stinker = null;
  if (playersWithOverall.length > 1) {
    stinker = playersWithOverall[playersWithOverall.length - 1];
  }

  // Build slides data
  slidesData = [];

  if (overallLeader) {
    slidesData.push({
      title: 'LinkedIn Monarch 👑',
      text: `${overallLeader.name} is ruling the league with ${overallLeader.points} total points.`
    });
  }

  if (playerOfTheDay) {
    slidesData.push({
      title: 'Player of the Day 🔥',
      text: `${playerOfTheDay.name} dropped ${playerOfTheDay.points} point(s) today (${today}).`
    });
  }

  if (firePlayer) {
    slidesData.push({
      title: 'On Fire Streak 🔥🔥',
      text: `${firePlayer.name} has ${firePoints} point(s) in the last 7 days. Keep the streak alive.`
    });
  }

  if (stinker) {
    slidesData.push({
      title: 'Having a Stinker 😬',
      text: `${stinker.name} is currently at the bottom with ${stinker.points} total points. Time for a comeback.`
    });
  }

  if (slidesData.length === 0) {
    funHighlights.innerHTML = `
      <div class="slider-title">No highlights yet</div>
      <div class="slider-text">Play some games and submit results to unlock the banter.</div>
    `;
    return;
  }

  currentSlideIndex = 0;
  showCurrentSlide();

  if (sliderIntervalId) {
    clearInterval(sliderIntervalId);
  }
  sliderIntervalId = setInterval(() => {
    currentSlideIndex = (currentSlideIndex + 1) % slidesData.length;
    showCurrentSlide();
  }, 5000); // change slide every 5 seconds
}

function showCurrentSlide() {
  if (!slidesData.length) return;
  const slide = slidesData[currentSlideIndex];
  funHighlights.innerHTML = `
    <div class="slider-title">${slide.title}</div>
    <div class="slider-text">${slide.text}</div>
  `;
}

// Event handlers
modeSelect.addEventListener('change', () => {
  renderLeaderboard();
});

gameFilter.addEventListener('change', () => {
  renderPerGameLeaderboard();
});

// Initial load
setModeDescriptionText(modeSelect.value);
loadData();
