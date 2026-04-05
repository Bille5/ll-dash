// ── Simulation Tab ─────────────────────────────────────────────
// Shows full schedule with RP sliders (1-6) per match.
// Uses OPR from FTCScout to predict wins/losses + confidence.
// Two sub-tabs: Schedule (simulate) and Rankings (projected).

async function simulator() {
  if (!appSettings.active_event_code) { noEventPage(); return; }
  loadingPage();

  const season = appSettings.active_season || 2025;
  const [rankData, schedData, oprResult, matchRpData] = await Promise.all([
    API.getRankings().catch(()=>null),
    API.getSchedule('qual').catch(()=>null),
    API.ftcscoutEventOprs(appSettings.active_event_code, season).catch(()=>null),
    API.ftcscoutEventMatchRP(appSettings.active_event_code, season).catch(()=>null),
  ]);

  const rankings = rankData?.rankings || rankData?.Rankings || [];
  const schedule = schedData?.schedule || [];

  // Build per-match alliance scores map from FTCScout GraphQL (movementRp/goalRp/patternRp)
  const scoresMap = {};
  (matchRpData?.matches || []).forEach(ms => {
    if (ms.tournamentLevel && ms.tournamentLevel !== 'Quals' && ms.tournamentLevel !== 'qual') return;
    scoresMap[ms.matchNum] = { red: ms.red, blue: ms.blue };
  });

  if (!rankings.length) {
    renderPage('<div class="empty-state"><div class="empty-icon">▲</div><div>No rankings yet.<br><span style="font-size:.75rem">Appears after first matches are scored.</span></div></div>');
    return;
  }

  // Build OPR map from FTCScout GraphQL
  const oprMap = {};
  if (oprResult && Array.isArray(oprResult.oprList)) {
    oprResult.oprList.forEach(t => {
      if (t.teamNumber) {
        oprMap[t.teamNumber] = {
          total:   t.opr    || 0,
          auto:    t.autoOpr || 0,
          teleop:  t.dcOpr   || 0,
          endgame: t.egOpr   || 0,
        };
      }
    });
  }

  const rankMap = {};
  rankings.forEach(r => { rankMap[r.teamNumber] = r; });
  rankings.forEach(r => { window._teamNames = window._teamNames || {}; window._teamNames[r.teamNumber] = r.teamName || ''; });

  const unplayed = schedule.filter(m => m.scoreRedFinal === null);

  // Compute actual RP for our team in a played match (movementRp+goalRp+patternRp + win/tie)
  function actualRPFor(m) {
    const ourTeam = m.teams?.find(t => t.teamNumber == TEAM_NUMBER);
    if (!ourTeam) return null;
    const ourA = ourTeam.station?.startsWith('Red') ? 'Red' : 'Blue';
    const won = ourA === 'Red' ? m.redWins : m.blueWins;
    const isTie = !m.redWins && !m.blueWins;
    const sc = scoresMap[m.matchNumber];
    if (sc) {
      const alliance = ourA === 'Red' ? sc.red : sc.blue;
      return computeMatchRP(alliance, won, isTie);
    }
    // Fallback without scores data: 3 win / 0 loss / 1 tie
    return won ? 3 : isTie ? 1 : 0;
  }

  // Sim state: {red, blue} RP per match. Played → pre-filled with actual.
  // Unplayed → null until the user touches it.
  const sim = {};
  schedule.forEach(m => {
    if (m.scoreRedFinal !== null) {
      const sc = scoresMap[m.matchNumber];
      const isTie = m.redWins === false && m.blueWins === false;
      const redRP  = sc ? computeMatchRP(sc.red,  m.redWins,  isTie) : (m.redWins ? 3 : isTie ? 1 : 0);
      const blueRP = sc ? computeMatchRP(sc.blue, m.blueWins, isTie) : (m.blueWins ? 3 : isTie ? 1 : 0);
      sim[m.matchNumber] = { red: redRP, blue: blueRP, played: true };
    } else {
      sim[m.matchNumber] = null;
    }
  });

  // Given a match + its sim entry, return {redWon, blueWon, tied} for W-L-T counting.
  function matchOutcome(m, s) {
    if (s.played) {
      return { redWon: !!m.redWins, blueWon: !!m.blueWins, tied: m.redWins === false && m.blueWins === false };
    }
    // Simulated: compare alliance RP. Tie when equal.
    if (s.red > s.blue)  return { redWon: true,  blueWon: false, tied: false };
    if (s.blue > s.red)  return { redWon: false, blueWon: true,  tied: false };
    return { redWon: false, blueWon: false, tied: true };
  }

  // ── OPR prediction for a match ──
  function predictMatch(m) {
    const redTeams  = (m.teams || []).filter(t => t.station?.startsWith('Red'));
    const blueTeams = (m.teams || []).filter(t => t.station?.startsWith('Blue'));

    const redOPR  = redTeams.reduce((s, t) => s + (oprMap[t.teamNumber]?.total || 0), 0);
    const blueOPR = blueTeams.reduce((s, t) => s + (oprMap[t.teamNumber]?.total || 0), 0);
    const diff    = redOPR - blueOPR;
    const totalOPR = Math.max(redOPR + blueOPR, 1);
    const rawConf  = Math.min(Math.abs(diff) / (totalOPR * 0.4), 1);
    const confidence = Math.round(rawConf * 100);

    const winner = diff > 0 ? 'Red' : diff < 0 ? 'Blue' : 'Tie';
    return { winner, confidence, redOPR, blueOPR, diff };
  }

  // ── Projection calculator ──
  function calcProjection() {
    // Build per-team RP/W/L/T from ALL matches using sim values for our team
    const teamRP = {};
    const teamPlayed = {};
    const teamWins = {};
    const teamLosses = {};
    const teamTies = {};

    rankings.forEach(r => {
      teamRP[r.teamNumber] = 0;
      teamPlayed[r.teamNumber] = 0;
      teamWins[r.teamNumber] = 0;
      teamLosses[r.teamNumber] = 0;
      teamTies[r.teamNumber] = 0;
    });

    schedule.forEach(m => {
      const s = sim[m.matchNumber];
      if (!s) return;  // unplayed and untouched → skip
      const redTeams  = (m.teams || []).filter(t => t.station?.startsWith('Red'));
      const blueTeams = (m.teams || []).filter(t => t.station?.startsWith('Blue'));
      const { redWon, blueWon, tied } = matchOutcome(m, s);

      const apply = (t, allianceRP, won) => {
        if (teamRP[t.teamNumber] == null) return;
        teamPlayed[t.teamNumber]++;
        teamRP[t.teamNumber] += allianceRP;
        if (tied) teamTies[t.teamNumber]++;
        else if (won) teamWins[t.teamNumber]++;
        else teamLosses[t.teamNumber]++;
      };

      redTeams.forEach(t  => apply(t, s.red,  redWon));
      blueTeams.forEach(t => apply(t, s.blue, blueWon));
    });

    // Build projected rankings
    const projected = rankings.map(r => {
      const played = teamPlayed[r.teamNumber] || 1;
      const rpAvg = (teamRP[r.teamNumber] || 0) / played;
      return {
        teamNumber: r.teamNumber,
        teamName: r.teamName || '',
        rpAvg,
        wins: teamWins[r.teamNumber] || 0,
        losses: teamLosses[r.teamNumber] || 0,
        ties: teamTies[r.teamNumber] || 0,
        played,
      };
    }).sort((a, b) => b.rpAvg - a.rpAvg);

    return projected;
  }

  let activeTab = 'sim-schedule';

  // ══════════════════════════════════════════════════════════════
  // SUB-TAB: Schedule (full schedule with RP sliders)
  // ══════════════════════════════════════════════════════════════
  function renderScheduleTab() {
    function teamLabel(t, alliance) {
      const isOurs = t.teamNumber == TEAM_NUMBER;
      return `<span class="team-chip ${alliance}${isOurs ? ' our' : ''}" style="${isOurs ? 'font-weight:800;border-width:2px' : ''}">${isOurs ? `<strong>${t.teamNumber}</strong>` : t.teamNumber}</span>`;
    }

    const matchRows = schedule.map(m => {
      const isOurs  = m.teams?.some(t => t.teamNumber == TEAM_NUMBER);
      const played  = m.scoreRedFinal !== null;
      const red     = (m.teams || []).filter(t => t.station?.startsWith('Red'));
      const blue    = (m.teams || []).filter(t => t.station?.startsWith('Blue'));

      const s = sim[m.matchNumber];
      const unset = s == null;
      const redVal  = unset ? '—' : s.red;
      const blueVal = unset ? '—' : s.blue;

      let winBadge = '';
      let subStats = '';
      if (played) {
        if (isOurs) {
          const ourA = m.teams.find(t => t.teamNumber == TEAM_NUMBER)?.station?.startsWith('Red') ? 'Red' : 'Blue';
          const won  = ourA === 'Red' ? m.redWins : m.blueWins;
          const isTie = m.redWins === false && m.blueWins === false;
          winBadge = `<span style="font-size:.68rem;font-weight:800;color:${won ? 'var(--green)' : isTie ? 'var(--yellow)' : 'var(--red)'}"> ${won ? 'W' : isTie ? 'T' : 'L'}</span>`;
        }
        // Actual bonus-flag chips for reference
        let rpLine = '';
        const sc = scoresMap[m.matchNumber];
        if (sc) {
          const isTie = !m.redWins && !m.blueWins;
          const redRP  = computeMatchRP(sc.red,  m.redWins,  isTie);
          const blueRP = computeMatchRP(sc.blue, m.blueWins, isTie);
          rpLine = rpPairChip(redRP, blueRP, sc.red, sc.blue);
        }
        subStats = `<div class="match-sub-stats">
          ${pairChip('Score', m.scoreRedFinal, m.scoreBlueFinal)}
          ${rpLine}
        </div>`;
      } else {
        const pred = predictMatch(m);
        subStats = `<div class="match-sub-stats">
          ${pairChip('OPR', pred.redOPR.toFixed(0), pred.blueOPR.toFixed(0))}
        </div>`;
      }

      return `
        <div class="match-row ${isOurs ? 'our-match' : ''}" style="cursor:default">
          <div class="match-num">Q${m.matchNumber}${winBadge}</div>
          <div class="match-alliances" style="flex:1">
            <div class="alliance-teams">${red.map(t => teamLabel(t, 'red')).join('')}</div>
            <div class="alliance-teams">${blue.map(t => teamLabel(t, 'blue')).join('')}</div>
            ${subStats}
          </div>
          <div class="sim-ctrl-col">
            <div class="sim-rp-row">
              <button class="sim-rp-btn sim-rp-minus" data-match="${m.matchNumber}" data-side="red">-</button>
              <div class="sim-rp-num" style="color:#ff8a94">${redVal}</div>
              <button class="sim-rp-btn sim-rp-plus" data-match="${m.matchNumber}" data-side="red">+</button>
            </div>
            <div class="sim-rp-row">
              <button class="sim-rp-btn sim-rp-minus" data-match="${m.matchNumber}" data-side="blue">-</button>
              <div class="sim-rp-num" style="color:#47c8ff">${blueVal}</div>
              <button class="sim-rp-btn sim-rp-plus" data-match="${m.matchNumber}" data-side="blue">+</button>
            </div>
          </div>
        </div>`;
    }).join('');

    document.getElementById('sim-tab-content').innerHTML = `
      <div class="sim-top-bar">
        <button class="btn btn-sm btn-primary" id="sim-all-btn">Load Actual RP</button>
        <button class="btn btn-sm btn-secondary" id="sim-reset-btn">Reset</button>
      </div>
      <div class="sim-rp-rules">RP = Movement + Goal + Pattern + 3(Win)/1(Tie) · range 0-6 · [MGP] = RPs earned</div>
      ${schedule.length ? matchRows : '<div class="empty-state" style="padding:1.5rem"><div>No matches found.</div></div>'}
    `;

    // Bind RP buttons — first click on an unset match initializes both sides to 0.
    const ensureSim = mn => {
      if (sim[mn] == null) sim[mn] = { red: 0, blue: 0, played: false };
      return sim[mn];
    };
    document.querySelectorAll('.sim-rp-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const mn = parseInt(btn.dataset.match);
        const side = btn.dataset.side;
        const s = ensureSim(mn);
        s[side] = Math.max(0, s[side] - 1);
        renderScheduleTab();
      });
    });
    document.querySelectorAll('.sim-rp-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const mn = parseInt(btn.dataset.match);
        const side = btn.dataset.side;
        const s = ensureSim(mn);
        s[side] = Math.min(6, s[side] + 1);
        renderScheduleTab();
      });
    });
    document.getElementById('sim-all-btn')?.addEventListener('click', () => {
      schedule.forEach(m => {
        if (m.scoreRedFinal !== null) {
          const sc = scoresMap[m.matchNumber];
          const isTie = m.redWins === false && m.blueWins === false;
          const rR = sc ? computeMatchRP(sc.red,  m.redWins,  isTie) : (m.redWins ? 3 : isTie ? 1 : 0);
          const bR = sc ? computeMatchRP(sc.blue, m.blueWins, isTie) : (m.blueWins ? 3 : isTie ? 1 : 0);
          sim[m.matchNumber] = { red: rR, blue: bR, played: true };
        }
      });
      showToast('Loaded actual RP for played matches');
      renderScheduleTab();
    });
    document.getElementById('sim-reset-btn')?.addEventListener('click', () => {
      schedule.forEach(m => {
        if (m.scoreRedFinal !== null) {
          const sc = scoresMap[m.matchNumber];
          const isTie = m.redWins === false && m.blueWins === false;
          const rR = sc ? computeMatchRP(sc.red,  m.redWins,  isTie) : (m.redWins ? 3 : isTie ? 1 : 0);
          const bR = sc ? computeMatchRP(sc.blue, m.blueWins, isTie) : (m.blueWins ? 3 : isTie ? 1 : 0);
          sim[m.matchNumber] = { red: rR, blue: bR, played: true };
        } else {
          sim[m.matchNumber] = null;
        }
      });
      renderScheduleTab();
      showToast('Unplayed matches cleared');
    });
  }

  // ══════════════════════════════════════════════════════════════
  // SUB-TAB: Rankings (projected in simulated environment)
  // ══════════════════════════════════════════════════════════════
  function renderRankingsTab() {
    const projected = calcProjection();
    const ourProj = projected.find(r => r.teamNumber == TEAM_NUMBER);
    const ourRank = projected.indexOf(ourProj) + 1;

    const tableRows = projected.map((r, i) => {
      const rank = i + 1;
      const isUs = r.teamNumber == TEAM_NUMBER;
      return `
        <tr class="${isUs ? 'our-row' : ''}">
          <td>${rank}</td>
          <td>${isUs ? `<strong>${r.teamNumber}</strong>` : r.teamNumber}
            <div style="font-size:.6rem;color:var(--text2);max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.teamName}</div>
          </td>
          <td>${r.rpAvg.toFixed(3)}</td>
          <td>${r.wins}-${r.losses}${r.ties ? '-' + r.ties : ''}</td>
        </tr>`;
    }).join('');

    document.getElementById('sim-tab-content').innerHTML = `
      <div class="projection-banner">
        <div class="projection-rank">#${ourRank}</div>
        <div class="projection-label">Projected Rank of ${projected.length}</div>
        ${ourProj ? `<div style="font-size:.68rem;font-family:var(--mono);color:var(--text2);margin-top:.2rem">
          Proj RP: ${ourProj.rpAvg.toFixed(4)} &middot; ${ourProj.wins}W-${ourProj.losses}L${ourProj.ties ? '-' + ourProj.ties + 'T' : ''}
        </div>` : ''}
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">Projected Rankings</span></div>
        <div style="font-size:.62rem;font-family:var(--mono);color:var(--text3);margin-bottom:.4rem">Based on sim RP for your team + OPR predictions for others</div>
        <div style="overflow-x:auto">
          <table class="rank-table" style="margin-bottom:0">
            <thead><tr><th style="text-align:left">#</th><th style="text-align:left">Team</th><th>RP Avg</th><th>W-L-T</th></tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════
  // Tab switching
  // ══════════════════════════════════════════════════════════════
  function renderActiveTab() {
    if (activeTab === 'sim-schedule') renderScheduleTab();
    else if (activeTab === 'sim-rankings') renderRankingsTab();
  }

  renderPage(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.25rem">
      <div class="page-title" style="margin-bottom:0">Sim<span>ulator</span></div>
      <button class="icon-btn" onclick="simulator()" title="Reload">&#8635;</button>
    </div>
    <div class="tabs" style="margin-bottom:.75rem">
      <button class="tab sim-tab active" data-simtab="sim-schedule">Schedule</button>
      <button class="tab sim-tab" data-simtab="sim-rankings">Rankings</button>
    </div>
    <div id="sim-tab-content"></div>
  `);

  document.querySelectorAll('.sim-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.simtab;
      document.querySelectorAll('.sim-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      renderActiveTab();
    });
  });

  renderActiveTab();
}
