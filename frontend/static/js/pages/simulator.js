// ── RP / Ranking Simulator ─────────────────────────────────────
// FTC 2025-2026 DECODE RP rules:
//   Win  = 3 RP   |  Tie = 1 RP  |  Loss = 0 RP
//   + Movement RP (1) — LEAVE + BASE points ≥ threshold
//   + Goal RP     (1) — ARTIFACTS through SQUARE ≥ threshold
//   + Pattern RP  (1) — PATTERN points ≥ threshold
//   Total per match: 0–6 RP
//   Ranking = total RP / matchesCounted

async function simulator() {
  if (!appSettings.active_event_code) { noEventPage(); return; }
  loadingPage();

  const [rankData, schedData, oprData] = await Promise.all([
    API.getRankings().catch(()=>null),
    API.getSchedule('qual').catch(()=>null),
    API.getOprs().catch(()=>null),
  ]);

  const rankings = rankData?.rankings || rankData?.Rankings || [];
  const schedule = schedData?.schedule || [];
  const oprList  = oprData?.oprList || [];

  if (!rankings.length) {
    renderPage('<div class="empty-state"><div class="empty-icon">▲</div><div>No rankings yet.<br><span style="font-size:.75rem">Appears after first matches are scored.</span></div></div>');
    return;
  }

  const ourRank = rankings.find(r=>r.teamNumber==TEAM_NUMBER);
  if (!ourRank) {
    renderPage(`<div class="empty-state"><div class="empty-icon">▲</div><div>Team ${TEAM_NUMBER} not in rankings.</div></div>`);
    return;
  }

  // OPR + rank lookups
  const oprMap = {};
  oprList.forEach(o => { oprMap[o.teamNumber] = o; });
  const rankMap = {};
  rankings.forEach(r => { rankMap[r.teamNumber] = r; });

  const ourMatches = schedule.filter(m=>m.teams?.some(t=>t.teamNumber==TEAM_NUMBER));
  const played     = ourMatches.filter(m=>m.scoreRedFinal!==null);
  const remaining  = ourMatches.filter(m=>m.scoreRedFinal===null);

  // Current RP state from rankings
  const counted      = ourRank.matchesCounted || ourRank.matchesPlayed || played.length || 0;
  const currentRPavg = ourRank.sortOrder1 || 0;
  const currentRPtot = currentRPavg * counted;

  // Played match RP (Win=3, Tie=1, Loss=0 for DECODE — bonus unknown, but total accounted in rankings)
  const playedRPMap = {};
  played.forEach(m => {
    const ourA  = m.teams.find(t=>t.teamNumber==TEAM_NUMBER)?.station?.startsWith('Red')?'Red':'Blue';
    const won   = ourA==='Red'?m.redWins:m.blueWins;
    const isTie = m.redWins===false && m.blueWins===false;
    playedRPMap[m.matchNumber] = won ? 3 : isTie ? 1 : 0; // base RP only (bonus tracked via rankings total)
  });

  // ── OPR prediction ──
  function predictMatch(m) {
    const redTeams  = (m.teams||[]).filter(t=>t.station?.startsWith('Red'));
    const blueTeams = (m.teams||[]).filter(t=>t.station?.startsWith('Blue'));
    const ourA = m.teams.find(t=>t.teamNumber==TEAM_NUMBER)?.station?.startsWith('Red')?'Red':'Blue';

    const redOPR  = redTeams.reduce((s,t)=>s+(oprMap[t.teamNumber]?.opr||0), 0);
    const blueOPR = blueTeams.reduce((s,t)=>s+(oprMap[t.teamNumber]?.opr||0), 0);
    const ourOPR  = ourA==='Red' ? redOPR : blueOPR;
    const oppOPR  = ourA==='Red' ? blueOPR : redOPR;
    const diff    = ourOPR - oppOPR;

    const totalOPR = Math.max(ourOPR + oppOPR, 1);
    const rawConf  = Math.min(Math.abs(diff) / (totalOPR * 0.4), 1);
    const confidence = Math.round(rawConf * 100);

    // Predict result
    let winRP = 0;
    if (diff > 5) winRP = 3;      // likely win
    else if (diff > -5) winRP = diff >= 0 ? 3 : 1; // toss-up, lean toward our side
    else winRP = 0;                // likely loss

    // Estimate bonus RP from alliance strength
    // Higher OPR = more likely to hit movement/goal/pattern thresholds
    let bonusRP = 0;
    if (ourOPR >= 120) bonusRP = 3;       // strong alliance, likely all 3 bonuses
    else if (ourOPR >= 80) bonusRP = 2;   // solid, likely 2 bonuses
    else if (ourOPR >= 50) bonusRP = 1;   // decent, maybe 1 bonus
    else bonusRP = 0;

    const predictedRP = Math.min(6, winRP + bonusRP);
    const prediction = diff > 5 ? 'W' : diff > -5 ? 'T' : 'L';

    return { prediction, predictedRP, confidence, ourOPR, oppOPR, diff, ourA };
  }

  // Sim state: RP per unplayed match
  const sim = {};
  remaining.forEach(m => { sim[m.matchNumber] = { rp: 3 }; }); // default: win with no bonus

  let activeTab = 'sim-schedule';

  // ── Projection calculator ──
  function calcProjection() {
    let addedRP = 0;
    remaining.forEach(m => { addedRP += sim[m.matchNumber].rp; });

    const projTotalRP = currentRPtot + addedRP;
    const projCounted = counted + remaining.length;
    const projRPavg   = projCounted > 0 ? projTotalRP / projCounted : 0;

    const projWins   = ourRank.wins + remaining.filter(m=>sim[m.matchNumber].rp>=3).length;
    const projLosses = ourRank.losses + remaining.filter(m=>sim[m.matchNumber].rp===0).length;
    const projTies   = (ourRank.ties||0) + remaining.filter(m=>sim[m.matchNumber].rp>=1 && sim[m.matchNumber].rp<3).length;

    const projRank = rankings.filter(r => r.teamNumber!=TEAM_NUMBER && (r.sortOrder1||0) >= projRPavg).length + 1;
    const total    = rankings.length;

    const sortedRPs = rankings.filter(r=>r.teamNumber!=TEAM_NUMBER).map(r=>r.sortOrder1||0).sort((a,b)=>b-a);
    const advSlots  = Math.max(1, Math.ceil(total * 0.5));
    const cutoffRP  = sortedRPs[advSlots-2] || 0;
    const neededAdditionalRP = Math.max(0, (cutoffRP * projCounted - projTotalRP));

    return {
      projWins, projLosses, projTies,
      projTotalRP, projCounted, projRPavg,
      projRank, total, advSlots, cutoffRP, neededAdditionalRP,
      advances: projRank <= advSlots,
    };
  }

  // ── Auto-predict all ──
  function simulateAll() {
    if (!oprList.length) {
      // No OPR data — default all to 3 (win, no bonus)
      remaining.forEach(m => { sim[m.matchNumber].rp = 3; });
      showToast('No OPR data — defaulted to wins');
    } else {
      remaining.forEach(m => {
        sim[m.matchNumber].rp = predictMatch(m).predictedRP;
      });
      showToast('All matches auto-predicted');
    }
    renderActiveTab();
  }

  // ── Auto-predict single match ──
  function autoScoreMatch(matchNum) {
    const m = remaining.find(x=>x.matchNumber===matchNum);
    if (!m) return;
    if (!oprList.length) {
      sim[matchNum].rp = 3;
      showToast('No OPR data — defaulted to win');
    } else {
      const pred = predictMatch(m);
      sim[matchNum].rp = pred.predictedRP;
    }
    renderActiveTab();
  }

  // ══════════════════════════════════════════════════════════════
  // SUB-TAB: Simulate (schedule-style)
  // ══════════════════════════════════════════════════════════════
  function renderScheduleTab() {
    // Team label helper — same style as schedule page
    function teamLabel(t, alliance) {
      const isOurs = t.teamNumber == TEAM_NUMBER;
      return `<span class="team-chip ${alliance}${isOurs?' our':''}" style="${isOurs?'font-weight:800;border-width:2px':''}">${isOurs?`<strong>${t.teamNumber}</strong>`:t.teamNumber}</span>`;
    }

    const matchRows = ourMatches.map(m => {
      const isOurs  = true;
      const isPlayed = m.scoreRedFinal !== null;
      const red  = (m.teams||[]).filter(t=>t.station?.startsWith('Red'));
      const blue = (m.teams||[]).filter(t=>t.station?.startsWith('Blue'));
      const ourA = m.teams.find(t=>t.teamNumber==TEAM_NUMBER)?.station?.startsWith('Red')?'Red':'Blue';
      const fieldNum = m.series != null ? `Field ${m.series + 1}` : '';

      if (isPlayed) {
        // ── Played match: show result like schedule page ──
        const won    = ourA==='Red'?m.redWins:m.blueWins;
        const isTie  = m.redWins===false && m.blueWins===false;
        const winBadge = `<span style="font-size:.68rem;font-weight:800;color:${won?'var(--green)':isTie?'var(--yellow)':'var(--red)'}"> ${won?'W':isTie?'T':'L'}</span>`;

        return `
          <div class="match-row our-match" style="opacity:.6;cursor:default">
            <div class="match-num">Q${m.matchNumber}${winBadge}</div>
            <div class="match-alliances" style="flex:1">
              <div class="alliance-teams">${red.map(t=>teamLabel(t,'red')).join('')}</div>
              <div class="alliance-teams">${blue.map(t=>teamLabel(t,'blue')).join('')}</div>
            </div>
            <div class="match-score">
              <div class="red-score" style="${m.redWins?'font-weight:800;font-size:1rem':''}">${m.scoreRedFinal}</div>
              <div class="blue-score" style="${m.blueWins?'font-weight:800;font-size:1rem':''}">${m.scoreBlueFinal}</div>
            </div>
          </div>`;
      } else {
        // ── Unplayed match: RP slider + auto button ──
        const rp = sim[m.matchNumber].rp;
        const rpColor = rp>=4?'var(--accent)':rp>=3?'var(--green)':rp>=1?'var(--yellow)':'var(--red)';
        const rpLabel = rp===0?'Loss':rp===1?'Tie':rp===2?'Tie+1':rp===3?'Win':`Win +${rp-3}`;

        return `
          <div class="match-row our-match" style="cursor:default">
            <div class="match-num">Q${m.matchNumber}</div>
            <div class="match-alliances" style="flex:1">
              <div class="alliance-teams">${red.map(t=>teamLabel(t,'red')).join('')}</div>
              <div class="alliance-teams">${blue.map(t=>teamLabel(t,'blue')).join('')}</div>
              <div class="match-sub-stats">
                ${fieldNum?`<span>${fieldNum}</span>`:''}
                <span>${formatTime(m.startTime)}</span>
              </div>
            </div>
            <div class="sim-ctrl-col">
              <div class="sim-rp-row">
                <button class="sim-rp-btn sim-rp-minus" data-match="${m.matchNumber}">-</button>
                <div class="sim-rp-num" style="color:${rpColor}">${rp}</div>
                <button class="sim-rp-btn sim-rp-plus" data-match="${m.matchNumber}">+</button>
                <button class="sim-auto-btn" data-match="${m.matchNumber}" title="Auto score with OPR">Auto</button>
              </div>
              <div class="sim-rp-label" style="color:${rpColor}">${rpLabel}</div>
            </div>
          </div>`;
      }
    }).join('');

    document.getElementById('sim-tab-content').innerHTML = `
      <div class="sim-top-bar">
        <button class="btn btn-sm btn-primary" id="sim-all-btn">Simulate All</button>
        <button class="btn btn-sm btn-secondary" id="sim-reset-btn">Reset</button>
      </div>
      <div class="sim-rp-rules">
        DECODE RP: Win=3 · Tie=1 · Loss=0 · +1 Movement · +1 Goal · +1 Pattern
      </div>
      ${ourMatches.length ? matchRows : '<div class="empty-state" style="padding:1.5rem"><div>No matches found.</div></div>'}
    `;

    // Bind buttons
    document.querySelectorAll('.sim-rp-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const mn = parseInt(btn.dataset.match);
        sim[mn].rp = Math.max(0, sim[mn].rp - 1);
        renderScheduleTab();
      });
    });
    document.querySelectorAll('.sim-rp-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const mn = parseInt(btn.dataset.match);
        sim[mn].rp = Math.min(6, sim[mn].rp + 1);
        renderScheduleTab();
      });
    });
    document.querySelectorAll('.sim-auto-btn').forEach(btn => {
      btn.addEventListener('click', () => autoScoreMatch(parseInt(btn.dataset.match)));
    });
    document.getElementById('sim-all-btn')?.addEventListener('click', simulateAll);
    document.getElementById('sim-reset-btn')?.addEventListener('click', () => {
      remaining.forEach(m => { sim[m.matchNumber].rp = 3; });
      renderActiveTab();
      showToast('Reset to defaults');
    });
  }

  // ══════════════════════════════════════════════════════════════
  // SUB-TAB: Rankings (projected)
  // ══════════════════════════════════════════════════════════════
  function renderRankingsTab() {
    const p = calcProjection();
    const advColor = p.advances ? 'var(--green)' : 'var(--red)';

    // Build projected rankings table for all teams
    // We adjust our team's RP; other teams stay at current sortOrder1
    const projectedTeams = rankings.map(r => {
      if (r.teamNumber == TEAM_NUMBER) {
        return { ...r, projRPavg: p.projRPavg, projWins: p.projWins, projLosses: p.projLosses, projTies: p.projTies };
      }
      return { ...r, projRPavg: r.sortOrder1||0, projWins: r.wins, projLosses: r.losses, projTies: r.ties||0 };
    }).sort((a,b) => (b.projRPavg - a.projRPavg) || ((b.sortOrder2||0)-(a.sortOrder2||0)));

    const advSlots = p.advSlots;

    const tableRows = projectedTeams.map((r, i) => {
      const rank = i + 1;
      const isUs = r.teamNumber == TEAM_NUMBER;
      const advancing = rank <= advSlots;
      const isCutoff = rank === advSlots;
      return `
        ${isCutoff ? `<tr><td colspan="5" class="sim-cutoff-cell">&#9473; ADVANCEMENT CUTOFF (Top ${advSlots}) &#9473;</td></tr>` : ''}
        <tr class="${isUs?'our-row':''}${advancing?'':' sim-rank-out'}">
          <td style="color:${advancing?'var(--green)':'var(--text3)'}">${rank}</td>
          <td>${isUs?`<strong>${r.teamNumber}</strong>`:r.teamNumber}</td>
          <td>${r.projRPavg.toFixed(4)}</td>
          <td>${r.projWins}-${r.projLosses}${r.projTies?'-'+r.projTies:''}</td>
          <td style="color:${advancing?'var(--green)':'var(--red)'}">
            ${advancing?'&#10003;':'&#10007;'}
          </td>
        </tr>`;
    }).join('');

    // What-if scenarios
    const scenarios = [0,1,2,3,4,5,6].map(rpPerMatch => {
      const totalIfAll = currentRPtot + (rpPerMatch * remaining.length);
      const countIfAll = counted + remaining.length;
      const avgIfAll = countIfAll > 0 ? totalIfAll / countIfAll : 0;
      const rankIfAll = rankings.filter(r => r.teamNumber!=TEAM_NUMBER && (r.sortOrder1||0) >= avgIfAll).length + 1;
      return { rpPerMatch, avgIfAll, rankIfAll, advances: rankIfAll <= advSlots };
    });

    document.getElementById('sim-tab-content').innerHTML = `
      <div class="projection-banner">
        <div class="projection-rank">#${p.projRank}</div>
        <div class="projection-label">Projected Rank of ${p.total}</div>
        <div style="font-size:.78rem;font-weight:700;color:${advColor};margin-top:.35rem">
          ${p.advances ? `Projected to Advance (Top ${advSlots})` : 'Outside Cutoff'}
        </div>
        <div style="font-size:.68rem;font-family:var(--mono);color:var(--text2);margin-top:.2rem">
          Proj RP: ${p.projRPavg.toFixed(4)} &middot; Cutoff: ${p.cutoffRP.toFixed(4)}
        </div>
        ${!p.advances&&p.neededAdditionalRP>0?`<div style="font-size:.68rem;font-family:var(--mono);color:var(--red);margin-top:.15rem">Need ~${p.neededAdditionalRP.toFixed(1)} more RP across ${remaining.length} remaining</div>`:''}
      </div>

      <div class="stat-grid stat-grid-3" style="margin-bottom:1rem">
        <div class="stat-box"><div class="stat-value" style="font-size:1.1rem">${p.projRPavg.toFixed(3)}</div><div class="stat-label">Proj RP Avg</div></div>
        <div class="stat-box"><div class="stat-value" style="font-size:1rem">${p.projWins}-${p.projLosses}${p.projTies?'-'+p.projTies:''}</div><div class="stat-label">Proj W-L-T</div></div>
        <div class="stat-box"><div class="stat-value" style="font-size:1.1rem">${remaining.length}</div><div class="stat-label">Remaining</div></div>
      </div>

      <div class="card card-accent2" style="margin-bottom:1rem">
        <div class="card-header"><span class="card-title">Current Standing</span></div>
        <div class="stat-grid stat-grid-3">
          <div class="stat-box"><div class="stat-value" style="font-size:1.1rem">#${ourRank.rank}</div><div class="stat-label">Rank</div></div>
          <div class="stat-box"><div class="stat-value" style="font-size:.95rem">${(ourRank.sortOrder1||0).toFixed(4)}</div><div class="stat-label">RP Avg</div></div>
          <div class="stat-box"><div class="stat-value" style="font-size:.95rem">${ourRank.wins}-${ourRank.losses}${ourRank.ties?'-'+ourRank.ties:''}</div><div class="stat-label">W-L-T</div></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:1rem">
        <div class="card-header"><span class="card-title">What-If Scenarios</span></div>
        <div style="font-size:.62rem;font-family:var(--mono);color:var(--text3);margin-bottom:.4rem">If you average X RP across all remaining matches</div>
        <table class="rank-table" style="margin-bottom:0">
          <thead><tr><th style="text-align:left">RP/Match</th><th>RP Avg</th><th>Rank</th><th>Advance</th></tr></thead>
          <tbody>
            ${scenarios.map(s => `
              <tr style="${!s.advances?'opacity:.45':''}">
                <td style="text-align:left;font-weight:700;color:var(--text)">${s.rpPerMatch}</td>
                <td>${s.avgIfAll.toFixed(4)}</td>
                <td>#${s.rankIfAll}</td>
                <td style="color:${s.advances?'var(--green)':'var(--red)'}">${s.advances?'Yes':'No'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">Projected Rankings</span></div>
        <div style="font-size:.62rem;font-family:var(--mono);color:var(--text3);margin-bottom:.4rem">Your RP adjusted; other teams at current RP</div>
        <div style="max-height:400px;overflow-y:auto">
          <table class="rank-table" style="margin-bottom:0">
            <thead><tr><th style="text-align:left">#</th><th style="text-align:left">Team</th><th>RP Avg</th><th>W-L-T</th><th></th></tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════
  // SUB-TAB: Analysis (OPR matchup details)
  // ══════════════════════════════════════════════════════════════
  function renderAnalysisTab() {
    const hasOPR = oprList.length > 0;

    if (!hasOPR) {
      document.getElementById('sim-tab-content').innerHTML = `
        <div class="empty-state"><div class="empty-icon">&#9650;</div><div>No OPR data available yet.<br><span style="font-size:.75rem">OPR appears after enough matches are played.</span></div></div>`;
      return;
    }

    const ourOPR = oprMap[TEAM_NUMBER]?.opr || 0;
    const sortedOPR = [...oprList].sort((a,b)=>(b.opr||0)-(a.opr||0));
    const ourOPRrank = sortedOPR.findIndex(o=>o.teamNumber==TEAM_NUMBER) + 1;

    let predW = 0, predL = 0, predT = 0, totalConf = 0;
    const analyses = remaining.map(m => {
      const pred = predictMatch(m);
      const ourA = m.teams.find(t=>t.teamNumber==TEAM_NUMBER)?.station?.startsWith('Red')?'Red':'Blue';
      const allies = m.teams.filter(t=>t.teamNumber!=TEAM_NUMBER&&t.station?.startsWith(ourA));
      const opps   = m.teams.filter(t=>!t.station?.startsWith(ourA));
      if (pred.prediction==='W') predW++;
      else if (pred.prediction==='L') predL++;
      else predT++;
      totalConf += pred.confidence;
      return { m, pred, allies, opps, ourA };
    });
    const avgConf = remaining.length > 0 ? Math.round(totalConf / remaining.length) : 0;

    const rows = analyses.map(({ m, pred, allies, opps, ourA }) => {
      const predColor = pred.prediction==='W'?'var(--green)':pred.prediction==='T'?'var(--yellow)':'var(--red)';
      const confBar = Math.max(5, Math.min(95, 50 + (pred.diff / Math.max(pred.ourOPR+pred.oppOPR,1)) * 100));

      return `
        <div class="sim-analysis-card">
          <div class="sim-analysis-top">
            <span class="sim-analysis-match">Q${m.matchNumber}</span>
            <span style="color:${predColor};font-weight:800;font-size:.85rem">${pred.prediction}</span>
            <span style="font-size:.68rem;color:var(--text2)">${pred.confidence}% conf</span>
            <span class="sim-analysis-predicted-rp">${pred.predictedRP} RP</span>
          </div>
          <div class="sim-analysis-matchup">
            <div class="sim-analysis-alliance" style="border-color:${ourA==='Red'?'rgba(255,71,87,.3)':'rgba(71,200,255,.25)'}">
              <div style="font-size:.55rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${ourA==='Red'?'#ff8a94':'var(--accent2)'};font-family:var(--mono)">Us</div>
              <div style="font-size:1rem;font-weight:800;font-family:var(--mono)">${pred.ourOPR.toFixed(1)}</div>
              <div style="font-size:.55rem;color:var(--text3);font-family:var(--mono)">${allies.map(t=>`${t.teamNumber}:${(oprMap[t.teamNumber]?.opr||0).toFixed(0)}`).join(' ')} Us:${ourOPR.toFixed(0)}</div>
            </div>
            <div style="font-size:.6rem;color:var(--text3);font-weight:700;align-self:center">vs</div>
            <div class="sim-analysis-alliance" style="border-color:${ourA==='Red'?'rgba(71,200,255,.25)':'rgba(255,71,87,.3)'}">
              <div style="font-size:.55rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${ourA==='Red'?'var(--accent2)':'#ff8a94'};font-family:var(--mono)">Opp</div>
              <div style="font-size:1rem;font-weight:800;font-family:var(--mono)">${pred.oppOPR.toFixed(1)}</div>
              <div style="font-size:.55rem;color:var(--text3);font-family:var(--mono)">${opps.map(t=>`${t.teamNumber}:${(oprMap[t.teamNumber]?.opr||0).toFixed(0)}`).join(' ')}</div>
            </div>
          </div>
          <div class="sim-opr-bar"><div class="sim-opr-bar-fill" style="width:${confBar}%;background:${predColor}"></div></div>
        </div>`;
    }).join('');

    document.getElementById('sim-tab-content').innerHTML = `
      <div class="stat-grid" style="margin-bottom:.75rem">
        <div class="stat-box"><div class="stat-value" style="font-size:1.3rem">${ourOPR.toFixed(1)}</div><div class="stat-label">Our OPR</div></div>
        <div class="stat-box"><div class="stat-value" style="font-size:1.3rem">#${ourOPRrank||'?'}</div><div class="stat-label">OPR Rank</div></div>
      </div>

      <div class="stat-grid stat-grid-3" style="margin-bottom:.75rem">
        <div class="stat-box"><div class="stat-value" style="font-size:1.1rem;color:var(--green)">${predW}</div><div class="stat-label">Pred Wins</div></div>
        <div class="stat-box"><div class="stat-value" style="font-size:1.1rem;color:var(--red)">${predL}</div><div class="stat-label">Pred Losses</div></div>
        <div class="stat-box"><div class="stat-value" style="font-size:1.1rem;color:${avgConf>=60?'var(--green)':'var(--yellow)'}">${avgConf}%</div><div class="stat-label">Avg Conf</div></div>
      </div>

      <div class="sim-top-bar" style="margin-bottom:.75rem">
        <button class="btn btn-sm btn-primary" id="sim-apply-opr">Apply All to Simulate Tab</button>
      </div>

      <div class="section-label">Match Breakdowns</div>
      ${remaining.length ? rows : '<div style="text-align:center;color:var(--text2);font-size:.85rem;padding:1.5rem;font-family:var(--mono)">All matches played!</div>'}
    `;

    document.getElementById('sim-apply-opr')?.addEventListener('click', () => {
      simulateAll();
      activeTab = 'sim-schedule';
      document.querySelectorAll('.sim-tab').forEach(t=>t.classList.remove('active'));
      document.querySelector('[data-simtab="sim-schedule"]')?.classList.add('active');
      renderActiveTab();
    });
  }

  // ══════════════════════════════════════════════════════════════
  // Tab switching
  // ══════════════════════════════════════════════════════════════
  function renderActiveTab() {
    if (activeTab === 'sim-schedule') renderScheduleTab();
    else if (activeTab === 'sim-rankings') renderRankingsTab();
    else if (activeTab === 'sim-analysis') renderAnalysisTab();
  }

  renderPage(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.25rem">
      <div class="page-title" style="margin-bottom:0">RP <span>Simulator</span></div>
      <button class="icon-btn" onclick="simulator()" title="Reload">&#8635;</button>
    </div>
    <div class="tabs" style="margin-bottom:.75rem">
      <button class="tab sim-tab active" data-simtab="sim-schedule">Simulate</button>
      <button class="tab sim-tab" data-simtab="sim-rankings">Rankings</button>
      <button class="tab sim-tab" data-simtab="sim-analysis">Analysis</button>
    </div>
    <div id="sim-tab-content"></div>
  `);

  document.querySelectorAll('.sim-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.simtab;
      document.querySelectorAll('.sim-tab').forEach(t=>t.classList.remove('active'));
      btn.classList.add('active');
      renderActiveTab();
    });
  });

  renderActiveTab();
}
