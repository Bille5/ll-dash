// ── RP / Ranking Simulator ─────────────────────────────────────
// FTC 2025 (INTO THE DEEP) RP rules:
//   Win  = 2 RP
//   Tie  = 1 RP
//   Loss = 0 RP
//   + bonus RP from game achievements (Autonomous bonus, high hang, etc.)
//   Total per match: 0–6 RP
//   sortOrder1 = total RP / matchesCounted (the ranking metric)

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

  // Build OPR map
  const oprMap = {};
  oprList.forEach(o => { oprMap[o.teamNumber] = o; });

  // Rank map for quick lookups
  const rankMap = {};
  rankings.forEach(r => { rankMap[r.teamNumber] = r; });

  const ourMatches  = schedule.filter(m=>m.teams?.some(t=>t.teamNumber==TEAM_NUMBER));
  const played      = ourMatches.filter(m=>m.scoreRedFinal!==null);
  const remaining   = ourMatches.filter(m=>m.scoreRedFinal===null);

  // Current real RP total
  const counted      = ourRank.matchesCounted || ourRank.matchesPlayed || played.length || 0;
  const currentRPavg = ourRank.sortOrder1 || 0;
  const currentRPtot = currentRPavg * counted;

  // Played match RP lookup
  const playedRPMap = {};
  played.forEach(m => {
    const ourA  = m.teams.find(t=>t.teamNumber==TEAM_NUMBER)?.station?.startsWith('Red')?'Red':'Blue';
    const won   = ourA==='Red'?m.redWins:m.blueWins;
    const isTie = m.redWins===false && m.blueWins===false;
    playedRPMap[m.matchNumber] = won ? 2 : isTie ? 1 : 0;
  });

  // ── OPR-based prediction engine ──
  function predictMatch(m) {
    const redTeams  = (m.teams||[]).filter(t=>t.station?.startsWith('Red'));
    const blueTeams = (m.teams||[]).filter(t=>t.station?.startsWith('Blue'));
    const ourA = m.teams.find(t=>t.teamNumber==TEAM_NUMBER)?.station?.startsWith('Red')?'Red':'Blue';

    const redOPR  = redTeams.reduce((s,t)=>(s + (oprMap[t.teamNumber]?.opr||0)), 0);
    const blueOPR = blueTeams.reduce((s,t)=>(s + (oprMap[t.teamNumber]?.opr||0)), 0);

    const ourOPR  = ourA==='Red' ? redOPR : blueOPR;
    const oppOPR  = ourA==='Red' ? blueOPR : redOPR;
    const diff    = ourOPR - oppOPR;

    // Confidence: based on how large the OPR gap is relative to total
    const totalOPR = Math.max(ourOPR + oppOPR, 1);
    const rawConf  = Math.min(Math.abs(diff) / (totalOPR * 0.4), 1);
    const confidence = Math.round(rawConf * 100);

    // Predict RP: win(2) + estimated bonus RP based on our alliance OPR strength
    let predictedRP;
    if (diff > 5) {
      // Likely win — estimate bonus RP from alliance strength
      const bonusEstimate = Math.min(4, Math.round(ourOPR / 60));
      predictedRP = 2 + bonusEstimate;
    } else if (diff > -5) {
      // Toss-up
      predictedRP = diff >= 0 ? 2 : 1;
    } else {
      // Likely loss
      predictedRP = 0;
    }
    predictedRP = Math.max(0, Math.min(6, predictedRP));

    const prediction = diff > 5 ? 'W' : diff > -5 ? 'T' : 'L';
    return { prediction, predictedRP, confidence, ourOPR, oppOPR, diff, ourA, redOPR, blueOPR };
  }

  // Sim state: rp per match (0–6)
  const sim = {};
  remaining.forEach(m => { sim[m.matchNumber] = { rp: 2 }; });

  // Track active sub-tab
  let activeTab = 'sim-schedule';

  // ── Projection calculator ──
  function calcProjection() {
    let addedRP = 0;
    remaining.forEach(m => { addedRP += sim[m.matchNumber].rp; });

    const projTotalRP = currentRPtot + addedRP;
    const projCounted = counted + remaining.length;
    const projRPavg   = projCounted > 0 ? projTotalRP / projCounted : 0;

    const projWins   = ourRank.wins + remaining.filter(m=>sim[m.matchNumber].rp>=2).length;
    const projLosses = ourRank.losses + remaining.filter(m=>sim[m.matchNumber].rp===0).length;
    const projTies   = (ourRank.ties||0) + remaining.filter(m=>sim[m.matchNumber].rp===1).length;

    // Projected rank: how many teams have higher RP avg
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

  // ── Alliance info helper ──
  function allianceInfo(m) {
    const ourA = m.teams.find(t=>t.teamNumber==TEAM_NUMBER)?.station?.startsWith('Red')?'Red':'Blue';
    const allies = m.teams.filter(t=>t.teamNumber!=TEAM_NUMBER&&t.station?.startsWith(ourA));
    const opps   = m.teams.filter(t=>!t.station?.startsWith(ourA));
    return { ourA, allies, opps };
  }

  // ── Auto-predict all remaining using OPR ──
  function autoPredict() {
    remaining.forEach(m => {
      const pred = predictMatch(m);
      sim[m.matchNumber].rp = pred.predictedRP;
    });
    renderActiveTab();
  }

  // ── Reset all to default (2 RP) ──
  function resetAll() {
    remaining.forEach(m => { sim[m.matchNumber].rp = 2; });
    renderActiveTab();
  }

  // ══════════════════════════════════════════════════════════════
  // SUB-TAB: Schedule (main sim view)
  // ══════════════════════════════════════════════════════════════
  function renderScheduleTab() {
    const p = calcProjection();

    // Quick projection summary at top
    const advColor = p.advances ? 'var(--green)' : 'var(--red)';
    const advIcon  = p.advances ? '&#10003;' : '&#10007;';

    const matchRows = ourMatches.map(m => {
      const isPlayed = m.scoreRedFinal !== null;
      const { ourA, allies, opps } = allianceInfo(m);

      if (isPlayed) {
        const ourScore = ourA==='Red'?m.scoreRedFinal:m.scoreBlueFinal;
        const oppScore = ourA==='Red'?m.scoreBlueFinal:m.scoreRedFinal;
        const won      = ourA==='Red'?m.redWins:m.blueWins;
        const isTie    = m.redWins===false && m.blueWins===false;
        const actualRP = playedRPMap[m.matchNumber] ?? (won?2:isTie?1:0);
        const resultLbl = won ? 'W' : isTie ? 'T' : 'L';
        const resultClr = won ? 'var(--green)' : isTie ? 'var(--yellow)' : 'var(--red)';
        return `
          <div class="sim-sched-row sim-played">
            <div class="sim-sched-num">Q${m.matchNumber}</div>
            <div class="sim-sched-teams">
              <span class="sim-team-tag ${ourA.toLowerCase()}">${allies.map(t=>t.teamNumber).join(' ')}</span>
              <span class="sim-vs">vs</span>
              <span class="sim-team-tag ${ourA==='Red'?'blue':'red'}">${opps.map(t=>t.teamNumber).join(' ')}</span>
            </div>
            <div class="sim-sched-result">
              <span class="sim-result-badge" style="color:${resultClr}">${resultLbl} ${ourScore}-${oppScore}</span>
              <span class="sim-rp-earned">+${actualRP} RP</span>
            </div>
          </div>`;
      } else {
        const rp = sim[m.matchNumber].rp;
        const rpColor = rp>=4?'var(--accent)':rp>=2?'var(--green)':rp===1?'var(--yellow)':'var(--red)';
        return `
          <div class="sim-sched-row">
            <div class="sim-sched-num">Q${m.matchNumber}</div>
            <div class="sim-sched-teams">
              <span class="sim-team-tag ${ourA.toLowerCase()}">${allies.map(t=>t.teamNumber).join(' ')}</span>
              <span class="sim-vs">vs</span>
              <span class="sim-team-tag ${ourA==='Red'?'blue':'red'}">${opps.map(t=>t.teamNumber).join(' ')}</span>
            </div>
            <div class="sim-sched-rp-ctrl">
              <button class="sim-rp-minus" data-match="${m.matchNumber}">-</button>
              <div class="sim-rp-display" style="color:${rpColor}">${rp}</div>
              <button class="sim-rp-plus" data-match="${m.matchNumber}">+</button>
            </div>
          </div>`;
      }
    }).join('');

    document.getElementById('sim-tab-content').innerHTML = `
      <div class="sim-proj-strip">
        <div class="sim-proj-item">
          <div class="sim-proj-val" style="color:var(--accent)">#${p.projRank}</div>
          <div class="sim-proj-lbl">Rank</div>
        </div>
        <div class="sim-proj-item">
          <div class="sim-proj-val">${p.projRPavg.toFixed(3)}</div>
          <div class="sim-proj-lbl">RP Avg</div>
        </div>
        <div class="sim-proj-item">
          <div class="sim-proj-val">${p.projWins}-${p.projLosses}${p.projTies?'-'+p.projTies:''}</div>
          <div class="sim-proj-lbl">W-L-T</div>
        </div>
        <div class="sim-proj-item">
          <div class="sim-proj-val" style="color:${advColor}">${advIcon}</div>
          <div class="sim-proj-lbl">${p.advances?'Advance':'Outside'}</div>
        </div>
      </div>

      <div class="sim-actions-bar">
        <button class="btn btn-sm btn-secondary" id="sim-auto-predict">Auto-Predict (OPR)</button>
        <button class="btn btn-sm btn-secondary" id="sim-reset">Reset All</button>
      </div>

      <div class="sim-sched-header">
        <span>Match</span><span>Teams</span><span>RP (0-6)</span>
      </div>
      <div class="sim-sched-list">${matchRows}</div>

      <div class="sim-rp-legend">
        <span>0 = Loss</span><span>1 = Tie</span><span>2 = Win</span><span>3-6 = Win + Bonus RP</span>
      </div>
    `;

    // Bind stepper buttons
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
    document.getElementById('sim-auto-predict')?.addEventListener('click', autoPredict);
    document.getElementById('sim-reset')?.addEventListener('click', resetAll);
  }

  // ══════════════════════════════════════════════════════════════
  // SUB-TAB: Projections
  // ══════════════════════════════════════════════════════════════
  function renderProjectionsTab() {
    const p = calcProjection();
    const advColor = p.advances ? 'var(--green)' : 'var(--red)';
    const advText  = p.advances
      ? `Projected to Advance (Top ${p.advSlots})`
      : `Outside Cutoff`;

    // Build advancement bubble
    const sortedRanks = [...rankings].sort((a,b)=>(b.sortOrder1||0)-(a.sortOrder1||0));
    const bubbleStart = Math.max(0, p.advSlots - 4);
    const bubbleEnd   = Math.min(rankings.length, p.advSlots + 3);
    const bubbleTeams = sortedRanks.slice(bubbleStart, bubbleEnd);

    const bubbleRows = bubbleTeams.map((r,i)=>{
      const displayRank = bubbleStart+i+1;
      const isUs = r.teamNumber==TEAM_NUMBER;
      const advancing = displayRank <= p.advSlots;
      const isCutoff  = displayRank === p.advSlots;
      return `
        ${isCutoff?`<div class="sim-cutoff-line">CUTOFF LINE</div>`:''}
        <div class="sim-bubble-row ${isUs?'sim-bubble-us':''} ${advancing?'':'sim-bubble-out'}">
          <span class="sim-bubble-rank" style="color:${advancing?'var(--green)':'var(--red)'}">#${displayRank}</span>
          <span class="sim-bubble-team">${isUs?`<strong>${r.teamNumber}</strong>`:r.teamNumber}</span>
          <span class="sim-bubble-name">${r.teamName||''}</span>
          <span class="sim-bubble-rp">${(r.sortOrder1||0).toFixed(4)}</span>
        </div>`;
    }).join('');

    // RP needed scenarios
    const scenarios = [0,1,2,3,4,5,6].map(rpPerMatch => {
      const totalIfAll = currentRPtot + (rpPerMatch * remaining.length);
      const countIfAll = counted + remaining.length;
      const avgIfAll = countIfAll > 0 ? totalIfAll / countIfAll : 0;
      const rankIfAll = rankings.filter(r => r.teamNumber!=TEAM_NUMBER && (r.sortOrder1||0) >= avgIfAll).length + 1;
      return { rpPerMatch, avgIfAll, rankIfAll, advances: rankIfAll <= p.advSlots };
    });

    document.getElementById('sim-tab-content').innerHTML = `
      <div class="projection-banner">
        <div class="projection-rank">#${p.projRank}</div>
        <div class="projection-label">Projected Rank of ${p.total} teams</div>
        <div style="font-size:.78rem;font-weight:700;color:${advColor};margin-top:.4rem">${advText}</div>
        <div style="font-size:.7rem;font-family:var(--mono);color:var(--text2);margin-top:.25rem">
          Proj RP Avg: ${p.projRPavg.toFixed(4)} &middot; Cutoff: ${p.cutoffRP.toFixed(4)}
        </div>
        ${!p.advances&&p.neededAdditionalRP>0?`<div style="font-size:.7rem;font-family:var(--mono);color:var(--red);margin-top:.2rem">Need ~${p.neededAdditionalRP.toFixed(1)} more RP across remaining matches</div>`:''}
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
          <div class="stat-box"><div class="stat-value" style="font-size:1rem">${(ourRank.sortOrder1||0).toFixed(4)}</div><div class="stat-label">RP Avg</div></div>
          <div class="stat-box"><div class="stat-value" style="font-size:1rem">${ourRank.wins}-${ourRank.losses}${ourRank.ties?'-'+ourRank.ties:''}</div><div class="stat-label">W-L-T</div></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:1rem">
        <div class="card-header"><span class="card-title">What-If Scenarios</span></div>
        <div style="font-size:.65rem;font-family:var(--mono);color:var(--text3);margin-bottom:.5rem">If you average X RP per remaining match</div>
        <div class="sim-scenario-table">
          <div class="sim-scenario-header">
            <span>Avg RP</span><span>RP Avg</span><span>Rank</span><span></span>
          </div>
          ${scenarios.map(s => `
            <div class="sim-scenario-row ${s.advances?'':'sim-scenario-fail'}">
              <span class="sim-scenario-rp">${s.rpPerMatch}</span>
              <span>${s.avgIfAll.toFixed(4)}</span>
              <span>#${s.rankIfAll}</span>
              <span style="color:${s.advances?'var(--green)':'var(--red)'};font-size:.7rem">${s.advances?'Advance':'Outside'}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">Advancement Bubble</span></div>
        <div style="font-size:.65rem;font-family:var(--mono);color:var(--text3);margin-bottom:.5rem">Top ${p.advSlots} of ${p.total} advance &middot; Cutoff: ${p.cutoffRP.toFixed(4)}</div>
        ${bubbleRows}
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════
  // SUB-TAB: Analysis (OPR matchup breakdown)
  // ══════════════════════════════════════════════════════════════
  function renderAnalysisTab() {
    const hasOPR = oprList.length > 0;

    if (!hasOPR) {
      document.getElementById('sim-tab-content').innerHTML = `
        <div class="empty-state"><div class="empty-icon">&#9650;</div><div>No OPR data available yet.<br><span style="font-size:.75rem">OPR appears after enough matches are played.</span></div></div>`;
      return;
    }

    // Our OPR
    const ourOPR = oprMap[TEAM_NUMBER]?.opr || 0;
    const ourNpOPR = oprMap[TEAM_NUMBER]?.np_opr || ourOPR;

    // Predicted results summary
    let predW = 0, predL = 0, predT = 0, totalConf = 0;
    const matchAnalysis = remaining.map(m => {
      const pred = predictMatch(m);
      const { ourA, allies, opps } = allianceInfo(m);
      if (pred.prediction === 'W') predW++;
      else if (pred.prediction === 'L') predL++;
      else predT++;
      totalConf += pred.confidence;
      return { m, pred, ourA, allies, opps };
    });
    const avgConf = remaining.length > 0 ? Math.round(totalConf / remaining.length) : 0;

    // OPR leaderboard context
    const sortedOPR = [...oprList].sort((a,b)=>(b.opr||0)-(a.opr||0));
    const ourOPRrank = sortedOPR.findIndex(o=>o.teamNumber==TEAM_NUMBER) + 1;

    const analysisRows = matchAnalysis.map(({ m, pred, ourA, allies, opps }) => {
      const predColor = pred.prediction==='W'?'var(--green)':pred.prediction==='T'?'var(--yellow)':'var(--red)';
      const confColor = pred.confidence>=70?'var(--green)':pred.confidence>=40?'var(--yellow)':'var(--red)';
      const confLabel = pred.confidence>=70?'High':pred.confidence>=40?'Med':'Low';

      // Individual team OPRs for detail
      const allyOPRs = allies.map(t => `${t.teamNumber}: ${(oprMap[t.teamNumber]?.opr||0).toFixed(1)}`).join(', ');
      const oppOPRs  = opps.map(t => `${t.teamNumber}: ${(oprMap[t.teamNumber]?.opr||0).toFixed(1)}`).join(', ');

      return `
        <div class="sim-analysis-row">
          <div class="sim-analysis-header">
            <span class="sim-analysis-num">Q${m.matchNumber}</span>
            <span class="sim-analysis-pred" style="color:${predColor}">${pred.prediction}</span>
            <span class="sim-analysis-conf" style="color:${confColor}">${pred.confidence}% ${confLabel}</span>
            <span class="sim-analysis-rp">${pred.predictedRP} RP</span>
          </div>
          <div class="sim-analysis-matchup">
            <div class="sim-analysis-side">
              <div class="sim-analysis-side-label" style="color:${ourA==='Red'?'#ff8a94':'var(--accent2)'}">Our Alliance</div>
              <div class="sim-analysis-opr">${pred.ourOPR.toFixed(1)} OPR</div>
              <div class="sim-analysis-teams">${allyOPRs}${allyOPRs?', ':''}Us: ${ourOPR.toFixed(1)}</div>
            </div>
            <div class="sim-analysis-vs">vs</div>
            <div class="sim-analysis-side">
              <div class="sim-analysis-side-label" style="color:${ourA==='Red'?'var(--accent2)':'#ff8a94'}">Opponents</div>
              <div class="sim-analysis-opr">${pred.oppOPR.toFixed(1)} OPR</div>
              <div class="sim-analysis-teams">${oppOPRs}</div>
            </div>
          </div>
          <div class="sim-analysis-bar-wrap">
            <div class="sim-analysis-bar-fill" style="width:${Math.max(5,Math.min(95, 50 + (pred.diff / Math.max(pred.ourOPR+pred.oppOPR,1)) * 100))}%;background:${predColor}"></div>
          </div>
        </div>`;
    }).join('');

    // Apply OPR predictions button
    document.getElementById('sim-tab-content').innerHTML = `
      <div class="stat-grid" style="margin-bottom:1rem">
        <div class="stat-box">
          <div class="stat-value" style="font-size:1.3rem">${ourOPR.toFixed(1)}</div>
          <div class="stat-label">Our OPR</div>
        </div>
        <div class="stat-box">
          <div class="stat-value" style="font-size:1.3rem">#${ourOPRrank||'?'}</div>
          <div class="stat-label">OPR Rank</div>
        </div>
      </div>

      <div class="stat-grid stat-grid-3" style="margin-bottom:1rem">
        <div class="stat-box"><div class="stat-value" style="font-size:1.1rem;color:var(--green)">${predW}</div><div class="stat-label">Pred Wins</div></div>
        <div class="stat-box"><div class="stat-value" style="font-size:1.1rem;color:var(--red)">${predL}</div><div class="stat-label">Pred Losses</div></div>
        <div class="stat-box"><div class="stat-value" style="font-size:1.1rem;color:${avgConf>=60?'var(--green)':'var(--yellow)'}">${avgConf}%</div><div class="stat-label">Avg Confidence</div></div>
      </div>

      <div class="sim-actions-bar">
        <button class="btn btn-sm btn-primary" id="sim-apply-opr">Apply OPR Predictions to Schedule</button>
      </div>

      <div class="section-label" style="margin-top:1rem">Match-by-Match Breakdown</div>
      ${remaining.length ? matchAnalysis.length ? analysisRows : '' :
        '<div style="text-align:center;color:var(--text2);font-size:.85rem;padding:1.5rem;font-family:var(--mono)">All matches played!</div>'}

      ${remaining.length && !matchAnalysis.length ? '<div style="text-align:center;color:var(--text2);font-size:.85rem;padding:1.5rem">No upcoming matches.</div>':''}
    `;

    document.getElementById('sim-apply-opr')?.addEventListener('click', () => {
      autoPredict();
      // Switch to schedule tab to show results
      activeTab = 'sim-schedule';
      document.querySelectorAll('.sim-tab').forEach(t=>t.classList.remove('active'));
      document.querySelector('[data-simtab="sim-schedule"]')?.classList.add('active');
      renderActiveTab();
      showToast('OPR predictions applied');
    });
  }

  // ══════════════════════════════════════════════════════════════
  // Tab switching
  // ══════════════════════════════════════════════════════════════
  function renderActiveTab() {
    if (activeTab === 'sim-schedule') renderScheduleTab();
    else if (activeTab === 'sim-projections') renderProjectionsTab();
    else if (activeTab === 'sim-analysis') renderAnalysisTab();
  }

  // ── Render shell ──
  renderPage(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.25rem">
      <div class="page-title" style="margin-bottom:0">RP <span>Simulator</span></div>
      <button class="icon-btn" onclick="simulator()" title="Reload">&#8635;</button>
    </div>
    <div class="tabs" style="margin-bottom:.75rem">
      <button class="tab sim-tab active" data-simtab="sim-schedule">Simulate</button>
      <button class="tab sim-tab" data-simtab="sim-projections">Projections</button>
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
