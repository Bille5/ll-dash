// ── Playoffs / bracket page ───────────────────────────────────
// Renders the official FTC double-elimination bracket (upper + lower
// bracket with advancement, per Game Manual section 13.7) for 2/4/6/8
// alliance events. Slots are resolved from actual match results by
// matching alliance pairs, so tie replays are handled and the bracket
// fills in as the tournament progresses. Events that don't fit the
// double-elim structure (e.g. legacy Semifinal/Finals format) fall back
// to a grouped match list.

function groupPlayoffRounds(matches) {
  const rounds = [];           // [{label, matches:[...]}] in matchNumber order
  const byLabel = {};
  [...matches].sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0)).forEach(m => {
    const desc = m.description || `Match ${m.matchNumber}`;
    let label = desc.replace(/\s*Match\s*\d+\s*$/i, '').trim();
    if (!label || /^\d+$/.test(label)) label = 'Playoffs';
    if (!byLabel[label]) {
      byLabel[label] = {label, matches: []};
      rounds.push(byLabel[label]);
    }
    byLabel[label].matches.push(m);
  });
  return rounds;
}

// teamNumber → alliance number map from /alliances
function allianceMap(alliances) {
  const map = {};
  (alliances || []).forEach(a => {
    [a.captain, a.round1, a.round2, a.round3, a.backup].forEach(t => {
      if (t != null && t > 0) map[t] = a.number;
    });
  });
  return map;
}

// ── Official FTC double-elim templates (Game Manual Tables 13-3..13-6) ──
// refs: {seed:n} = Alliance n, {w:k} = winner of Mk, {l:k} = loser of Mk
// w/l: where the winner/loser goes ('Mk', 'F' = finals, or a placement)
const DE_TEMPLATES = {
  2: {
    slots: [],
    finals: {red: {seed: 1}, blue: {seed: 2}, redLosses: 0, blueLosses: 0},
  },
  4: {
    slots: [
      {m: 1, bracket: 'upper', round: 0, red: {seed: 1}, blue: {seed: 4}, w: 'M4', l: 'M3'},
      {m: 2, bracket: 'upper', round: 0, red: {seed: 2}, blue: {seed: 3}, w: 'M4', l: 'M3'},
      {m: 3, bracket: 'lower', round: 0, red: {l: 1},    blue: {l: 2},    w: 'M5', l: '4th'},
      {m: 4, bracket: 'upper', round: 1, red: {w: 1},    blue: {w: 2},    w: 'F',  l: 'M5'},
      {m: 5, bracket: 'lower', round: 1, red: {l: 4},    blue: {w: 3},    w: 'F',  l: '3rd'},
    ],
    finals: {red: {w: 4}, blue: {w: 5}, redLosses: 0, blueLosses: 1},
  },
  6: {
    slots: [
      {m: 1,  bracket: 'upper', round: 0, red: {seed: 4}, blue: {seed: 5}, w: 'M3',  l: 'M6'},
      {m: 2,  bracket: 'upper', round: 0, red: {seed: 3}, blue: {seed: 6}, w: 'M4',  l: 'M5'},
      {m: 3,  bracket: 'upper', round: 1, red: {seed: 1}, blue: {w: 1},    w: 'M7',  l: 'M5'},
      {m: 4,  bracket: 'upper', round: 1, red: {seed: 2}, blue: {w: 2},    w: 'M7',  l: 'M6'},
      {m: 5,  bracket: 'lower', round: 0, red: {l: 3},    blue: {l: 2},    w: 'M8',  l: '5th'},
      {m: 6,  bracket: 'lower', round: 0, red: {l: 4},    blue: {l: 1},    w: 'M8',  l: '5th'},
      {m: 7,  bracket: 'upper', round: 2, red: {w: 3},    blue: {w: 4},    w: 'F',   l: 'M9'},
      {m: 8,  bracket: 'lower', round: 1, red: {w: 6},    blue: {w: 5},    w: 'M9',  l: '4th'},
      {m: 9,  bracket: 'lower', round: 2, red: {l: 7},    blue: {w: 8},    w: 'F',   l: '3rd'},
    ],
    finals: {red: {w: 7}, blue: {w: 9}, redLosses: 0, blueLosses: 1},
  },
  8: {
    slots: [
      {m: 1,  bracket: 'upper', round: 0, red: {seed: 1}, blue: {seed: 8}, w: 'M7',  l: 'M5'},
      {m: 2,  bracket: 'upper', round: 0, red: {seed: 4}, blue: {seed: 5}, w: 'M7',  l: 'M5'},
      {m: 3,  bracket: 'upper', round: 0, red: {seed: 2}, blue: {seed: 7}, w: 'M8',  l: 'M6'},
      {m: 4,  bracket: 'upper', round: 0, red: {seed: 3}, blue: {seed: 6}, w: 'M8',  l: 'M6'},
      {m: 5,  bracket: 'lower', round: 0, red: {l: 1},    blue: {l: 2},    w: 'M10', l: '7th'},
      {m: 6,  bracket: 'lower', round: 0, red: {l: 3},    blue: {l: 4},    w: 'M9',  l: '7th'},
      {m: 7,  bracket: 'upper', round: 1, red: {w: 1},    blue: {w: 2},    w: 'M11', l: 'M9'},
      {m: 8,  bracket: 'upper', round: 1, red: {w: 3},    blue: {w: 4},    w: 'M11', l: 'M10'},
      {m: 9,  bracket: 'lower', round: 1, red: {l: 7},    blue: {w: 6},    w: 'M12', l: '5th'},
      {m: 10, bracket: 'lower', round: 1, red: {l: 8},    blue: {w: 5},    w: 'M12', l: '5th'},
      {m: 11, bracket: 'upper', round: 2, red: {w: 7},    blue: {w: 8},    w: 'F',   l: 'M13'},
      {m: 12, bracket: 'lower', round: 2, red: {w: 10},   blue: {w: 9},    w: 'M13', l: '4th'},
      {m: 13, bracket: 'lower', round: 3, red: {l: 11},   blue: {w: 12},   w: 'F',   l: '3rd'},
    ],
    finals: {red: {w: 11}, blue: {w: 13}, redLosses: 0, blueLosses: 1},
  },
};

// Alliance number for one side of a match (majority vote of its teams)
function _sideAlliance(teams, station, aMap) {
  const counts = {};
  teams.filter(t => t.station?.startsWith(station)).forEach(t => {
    const a = aMap[t.teamNumber];
    if (a != null) counts[a] = (counts[a] || 0) + 1;
  });
  let best = null;
  Object.entries(counts).forEach(([a, n]) => { if (best == null || n > counts[best]) best = a; });
  return best != null ? parseInt(best) : null;
}

// Resolve the bracket: assign API matches to template slots by alliance
// pair, following winners/losers through the bracket. Returns null if the
// matches don't fit the double-elim structure.
function resolveBracket(alliances, apiMatches) {
  const template = DE_TEMPLATES[alliances.length];
  if (!template) return null;
  if (apiMatches.some(m => /semifinal/i.test(m.description || ''))) return null;  // legacy format

  const aMap = allianceMap(alliances);
  const pool = [...apiMatches]
    .sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0))
    .map(m => ({
      m,
      redA:  _sideAlliance(m.teams || [], 'Red', aMap),
      blueA: _sideAlliance(m.teams || [], 'Blue', aMap),
      used: false,
    }));

  const slots = {};
  const resolveRef = ref => {
    if (!ref) return null;
    if (ref.seed) return ref.seed;
    if (ref.w) return slots['M' + ref.w]?.winnerA ?? null;
    if (ref.l) return slots['M' + ref.l]?.loserA ?? null;
    return null;
  };
  const refLabel = ref => ref.seed ? `Alliance ${ref.seed}` : ref.w ? `Winner M${ref.w}` : `Loser M${ref.l}`;

  // Consume matches between two alliances until one is decided (handles tie replays)
  function consumePair(aA, aB) {
    const games = [];
    let winnerA = null;
    for (const r of pool) {
      if (r.used || r.redA == null || r.blueA == null) continue;
      const same = (r.redA === aA && r.blueA === aB) || (r.redA === aB && r.blueA === aA);
      if (!same) continue;
      r.used = true;
      games.push(r);
      const played = r.m.scoreRedFinal !== null && r.m.scoreRedFinal !== undefined;
      if (!played) break;                       // scheduled, not yet played
      if (r.m.redWins || r.m.blueWins) {        // decided (ties keep consuming replays)
        winnerA = r.m.redWins ? r.redA : r.blueA;
        break;
      }
    }
    return {games, winnerA};
  }

  for (const t of template.slots) {
    const redA = resolveRef(t.red), blueA = resolveRef(t.blue);
    const slot = {t, redA, blueA, redLabel: refLabel(t.red), blueLabel: refLabel(t.blue),
                  games: [], match: null, winnerA: null, loserA: null};
    if (redA != null && blueA != null) {
      const {games, winnerA} = consumePair(redA, blueA);
      slot.games = games;
      slot.match = games.length ? games[games.length - 1] : null;
      if (winnerA != null) {
        slot.winnerA = winnerA;
        slot.loserA  = winnerA === redA ? blueA : redA;
      }
    }
    slots['M' + t.m] = slot;
  }

  // Finals: red = upper-bracket finalist (needs lowest losses), series until
  // one alliance reaches 2 total losses. Tie matches don't count.
  const f = template.finals;
  const fRedA = resolveRef(f.red), fBlueA = resolveRef(f.blue);
  const finals = {redA: fRedA, blueA: fBlueA,
                  redLabel: refLabel(f.red), blueLabel: refLabel(f.blue),
                  games: [], championA: null};
  if (fRedA != null && fBlueA != null) {
    let losses = {[fRedA]: f.redLosses, [fBlueA]: f.blueLosses};
    for (const r of pool) {
      if (r.used || r.redA == null || r.blueA == null) continue;
      const same = (r.redA === fRedA && r.blueA === fBlueA) || (r.redA === fBlueA && r.blueA === fRedA);
      if (!same) continue;
      r.used = true;
      finals.games.push(r);
      const played = r.m.scoreRedFinal !== null && r.m.scoreRedFinal !== undefined;
      if (!played) break;
      if (r.m.redWins || r.m.blueWins) {
        const loserA = r.m.redWins ? r.blueA : r.redA;
        losses[loserA]++;
        if (losses[loserA] >= 2) { finals.championA = loserA === fRedA ? fBlueA : fRedA; break; }
      }
    }
  }

  // Played matches the template couldn't place → not really double-elim
  if (pool.some(r => !r.used && r.m.scoreRedFinal !== null && r.m.scoreRedFinal !== undefined)) return null;

  return {template, slots, finals};
}

// ── Bracket HTML (shared by Playoffs page and Big Screen) ─────
function _allianceTeams(alliances, num) {
  const a = (alliances || []).find(x => x.number === num);
  if (!a) return '';
  return [a.captain, a.round1, a.round2, a.round3].filter(t => t != null && t > 0).join(' · ');
}

function _bkSide(color, allianceNum, label, score, isWinner, decided, alliances) {
  const known = allianceNum != null;
  const ours = known && (alliances || []).some(a =>
    a.number === allianceNum && [a.captain, a.round1, a.round2, a.round3].some(t => t == TEAM_NUMBER));
  return `
    <div class="bk-side ${color} ${isWinner ? 'bk-win' : decided ? 'bk-lose' : ''} ${ours ? 'bk-ours' : ''}">
      ${known ? `<span class="bk-a">A${allianceNum}</span><span class="bk-teams">${_allianceTeams(alliances, allianceNum)}</span>`
              : `<span class="bk-tbd">${escHtml(label || 'TBD')}</span>`}
      <span class="bk-score">${score ?? ''}</span>
    </div>`;
}

function _destLabel(d) { return d === 'F' ? 'Finals' : d; }

function _bkMatchCard(slot, alliances) {
  const m = slot.match?.m;
  const played  = m && m.scoreRedFinal !== null && m.scoreRedFinal !== undefined;
  const decided = slot.winnerA != null;
  // map slot sides to the actual match's red/blue for scores
  let redScore = null, blueScore = null, redIsMatchRed = true;
  if (m && played) {
    redIsMatchRed = slot.match.redA === slot.redA;
    redScore  = redIsMatchRed ? m.scoreRedFinal : m.scoreBlueFinal;
    blueScore = redIsMatchRed ? m.scoreBlueFinal : m.scoreRedFinal;
  }
  const time = m && !played ? formatTime(m.startTime) : '';
  const replay = slot.games.length > 1 ? ` <span class="bk-replay">tie → replayed</span>` : '';
  return `
    <div class="bk-match ${decided ? 'bk-decided' : ''}">
      <div class="bk-match-head">
        <span>M${slot.t.m}</span>${replay}
        <span class="bk-dest">W→${_destLabel(slot.t.w)} · L→${_destLabel(slot.t.l)}</span>
        ${time ? `<span class="bk-time">${time}</span>` : ''}
      </div>
      ${_bkSide('red',  slot.redA,  slot.redLabel,  redScore,  decided && slot.winnerA === slot.redA,  decided, alliances)}
      ${_bkSide('blue', slot.blueA, slot.blueLabel, blueScore, decided && slot.winnerA === slot.blueA, decided, alliances)}
    </div>`;
}

function _bkFinalsCard(finals, alliances) {
  const gameRows = finals.games.map((r, i) => {
    const m = r.m;
    const played = m.scoreRedFinal !== null && m.scoreRedFinal !== undefined;
    const tie = played && !m.redWins && !m.blueWins;
    // orient scores to finals.redA on the left
    const left  = r.redA === finals.redA ? m.scoreRedFinal : m.scoreBlueFinal;
    const right = r.redA === finals.redA ? m.scoreBlueFinal : m.scoreRedFinal;
    const leftWins = played && ((m.redWins && r.redA === finals.redA) || (m.blueWins && r.blueA === finals.redA));
    return `
      <div class="bk-final-game">
        <span class="bk-final-label">Match ${i + 1}${tie ? ' · tie' : ''}</span>
        ${played
          ? `<span class="bk-final-score"><b class="${leftWins ? 'bk-fw' : ''}">${left}</b> – <b class="${!leftWins && !tie ? 'bk-fw' : ''}">${right}</b></span>`
          : `<span class="bk-time">${formatTime(m.startTime)}</span>`}
      </div>`;
  }).join('');
  const champ = finals.championA != null ? `
    <div class="bk-champion">🏆 Alliance ${finals.championA} — ${_allianceTeams(alliances, finals.championA)}</div>` : '';
  return `
    <div class="bk-match bk-finals">
      <div class="bk-match-head"><span>FINALS</span><span class="bk-dest">lower-bracket alliance must win twice</span></div>
      ${_bkSide('red',  finals.redA,  finals.redLabel,  null, finals.championA != null && finals.championA === finals.redA,  finals.championA != null, alliances)}
      ${_bkSide('blue', finals.blueA, finals.blueLabel, null, finals.championA != null && finals.championA === finals.blueA, finals.championA != null, alliances)}
      ${gameRows ? `<div class="bk-final-games">${gameRows}</div>` : ''}
      ${champ}
    </div>`;
}

// Group a bracket section's slots into columns by round; consecutive slots
// in a column that feed the same next match get an elbow connector.
function _bkSection(title, slotList, alliances, extraCol) {
  const rounds = {};
  slotList.forEach(s => { (rounds[s.t.round] = rounds[s.t.round] || []).push(s); });
  const cols = Object.keys(rounds).sort((a, b) => a - b).map(r => {
    const items = rounds[r];
    const groups = [];
    items.forEach(s => {
      const last = groups[groups.length - 1];
      if (last && last.dest === s.t.w && last.slots.length === 1) last.slots.push(s);
      else groups.push({dest: s.t.w, slots: [s]});
    });
    return `<div class="bk-col">${groups.map(g => `
      <div class="${g.slots.length > 1 ? 'bk-pair' : 'bk-single'}">
        ${g.slots.map(s => _bkMatchCard(s, alliances)).join('')}
      </div>`).join('')}</div>`;
  }).join('');
  return `
    <div class="bk-section">
      <div class="bk-section-title">${title}</div>
      <div class="bk-grid">${cols}${extraCol ? `<div class="bk-col bk-finals-col">${extraCol}</div>` : ''}</div>
    </div>`;
}

// Full bracket HTML, or null when the data doesn't fit a known bracket.
function buildBracketHtml(playoffMatches, alliances) {
  if (!alliances || !alliances.length) return null;
  const resolved = resolveBracket(alliances, playoffMatches || []);
  if (!resolved) return null;
  const all = Object.values(resolved.slots);
  const upper = all.filter(s => s.t.bracket === 'upper');
  const lower = all.filter(s => s.t.bracket === 'lower');
  const finalsCard = _bkFinalsCard(resolved.finals, alliances);
  if (!upper.length) {  // 2-alliance event: finals only
    return `<div class="bk-root">${_bkSection('Finals', [], alliances, finalsCard)}</div>`;
  }
  return `
    <div class="bk-root">
      ${_bkSection('Upper Bracket', upper, alliances, finalsCard)}
      ${_bkSection('Lower Bracket', lower, alliances)}
    </div>`;
}

// ── Page ──────────────────────────────────────────────────────
async function playoffs() {
  if (!appSettings.active_event_code) { noEventPage(); return; }
  loadingPage();

  const [schedData, allianceData, rankData] = await Promise.all([
    API.getPlayoffSchedule().catch(() => null),
    API.getAlliances().catch(() => null),
    API.getRankings().catch(() => null),
  ]);
  if (currentPage !== 'playoffs') return;  // stale fetch — user navigated away

  const matches   = schedData?.schedule || [];
  const alliances = allianceData?.alliances || allianceData?.Alliances || [];
  const rankings  = rankData?.rankings || rankData?.Rankings || [];
  rankings.forEach(r => { window._teamNames = window._teamNames || {}; window._teamNames[r.teamNumber] = r.teamName || ''; });
  const aMap = allianceMap(alliances);

  // ── Alliance lineups ──
  let allianceHtml = '';
  if (alliances.length) {
    allianceHtml = `
      <div class="card">
        <div class="card-header"><span class="card-title">Alliances</span></div>
        <div class="po-alliance-grid">
          ${alliances.map(a => {
            const members = [a.captain, a.round1, a.round2, a.round3, a.backup].filter(t => t != null && t > 0);
            const ours = members.some(t => t == TEAM_NUMBER);
            return `
              <div class="po-alliance ${ours ? 'po-ours' : ''}">
                <div class="po-alliance-num">A${a.number}</div>
                <div class="po-alliance-members">
                  ${members.map((t, i) => `
                    <div class="po-member ${t == TEAM_NUMBER ? 'our' : ''}" onclick="openTeamModal(${t})">
                      <span class="po-member-num">${t}</span>
                      <span class="po-member-name">${escHtml(window._teamNames?.[t] || '')}</span>
                      <span class="po-member-role">${i === 0 ? 'Captain' : 'Pick ' + i}</span>
                    </div>`).join('')}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  // ── Bracket (preferred) or grouped list fallback ──
  const bracketHtml = buildBracketHtml(matches, alliances);
  let bodyHtml;
  if (bracketHtml) {
    bodyHtml = bracketHtml;
  } else if (matches.length) {
    const rounds = groupPlayoffRounds(matches);
    bodyHtml = rounds.map(round => `
      <div class="section-label" style="margin-top:.9rem">${escHtml(round.label)}</div>
      ${round.matches.map(m => playoffMatchRow(m, aMap)).join('')}
    `).join('');
  } else {
    bodyHtml = `
      <div class="empty-state"><div class="empty-icon">⬡</div><div>No playoff matches yet.</div>
      <div style="margin-top:.5rem;font-size:.75rem">The bracket appears once alliance selection is done.</div></div>`;
  }

  renderPage(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.25rem">
      <div class="page-title" style="margin-bottom:0">Playoffs</div>
      <button class="icon-btn" onclick="playoffs()" title="Reload">↻</button>
    </div>
    <div style="font-size:.73rem;font-family:var(--mono);color:var(--text2);margin-bottom:.75rem">${escHtml(appSettings.active_event_name || '')} · double elimination</div>
    ${allianceHtml}
    ${bodyHtml}
  `);
  bindTeamClicks(rankings);
}

// Grouped-list fallback row (non-double-elim formats)
function playoffMatchRow(m, aMap) {
  const red    = (m.teams || []).filter(t => t.station?.startsWith('Red'));
  const blue   = (m.teams || []).filter(t => t.station?.startsWith('Blue'));
  const played = m.scoreRedFinal !== null && m.scoreRedFinal !== undefined;
  const isOurs = m.teams?.some(t => t.teamNumber == TEAM_NUMBER);
  const isTie  = played && !m.redWins && !m.blueWins;
  const aBadge = list => {
    const n = list.map(t => aMap[t.teamNumber]).find(v => v != null);
    return n != null ? `<span class="po-abadge">A${n}</span>` : '';
  };
  const score = played
    ? `<div class="match-score">
         <div class="red-score" style="${m.redWins ? 'font-weight:800;font-size:1rem' : ''}">${m.scoreRedFinal}</div>
         <div class="blue-score" style="${m.blueWins ? 'font-weight:800;font-size:1rem' : ''}">${m.scoreBlueFinal}</div>
       </div>`
    : `<div class="match-time">${formatTime(m.startTime)}</div>`;
  const winTag = played
    ? `<span class="po-win-tag" style="color:${isTie ? 'var(--yellow)' : m.redWins ? '#ff8a94' : 'var(--accent2)'}">${isTie ? 'TIE' : (m.redWins ? 'RED' : 'BLUE') + ' WINS'}</span>`
    : '';
  return `
    <div class="match-row ${isOurs ? 'our-match' : ''}" style="align-items:flex-start">
      <div style="min-width:54px">
        <div class="match-num" style="white-space:nowrap">${escHtml(m.description || 'M' + m.matchNumber)}</div>
        ${winTag}
      </div>
      <div class="match-alliances" style="flex:1">
        <div class="alliance-teams">${aBadge(red)}${red.map(t => teamChipNamed(t, 'red')).join('')}</div>
        <div class="alliance-teams">${aBadge(blue)}${blue.map(t => teamChipNamed(t, 'blue')).join('')}</div>
      </div>
      ${score}
    </div>`;
}
