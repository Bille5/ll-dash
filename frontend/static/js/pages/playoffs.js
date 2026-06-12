// ── Playoffs / bracket page ───────────────────────────────────
// Groups playoff matches into rounds by parsing the FTC `description`
// field ("Semifinal 1 Match 2", "Finals Match 1", "Playoff 3", …) so it
// works regardless of the bracket format an event uses.

function groupPlayoffRounds(matches) {
  const rounds = [];           // [{label, matches:[...]}] in matchNumber order
  const byLabel = {};
  [...matches].sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0)).forEach(m => {
    const desc = m.description || `Match ${m.matchNumber}`;
    // Strip a trailing "Match N" to get the round label; "Finals Match 2" → "Finals"
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

  // ── Bracket rounds ──
  const rounds = groupPlayoffRounds(matches);
  const roundsHtml = rounds.length ? rounds.map(round => `
    <div class="section-label" style="margin-top:.9rem">${escHtml(round.label)}</div>
    ${round.matches.map(m => playoffMatchRow(m, aMap)).join('')}
  `).join('') : `
    <div class="empty-state"><div class="empty-icon">⬡</div><div>No playoff matches yet.</div>
    <div style="margin-top:.5rem;font-size:.75rem">The bracket appears once alliance selection is done.</div></div>`;

  renderPage(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.25rem">
      <div class="page-title" style="margin-bottom:0">Playoffs</div>
      <button class="icon-btn" onclick="playoffs()" title="Reload">↻</button>
    </div>
    <div style="font-size:.73rem;font-family:var(--mono);color:var(--text2);margin-bottom:.75rem">${escHtml(appSettings.active_event_name || '')}</div>
    ${allianceHtml}
    ${roundsHtml}
  `);
  bindTeamClicks(rankings);
}

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
