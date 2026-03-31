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

  const [rankData, schedData] = await Promise.all([
    API.getRankings().catch(()=>null),
    API.getSchedule('qual').catch(()=>null),
  ]);

  const rankings = rankData?.rankings || rankData?.Rankings || [];
  const schedule = schedData?.schedule || [];

  if (!rankings.length) {
    renderPage('<div class="empty-state"><div class="empty-icon">▲</div><div>No rankings yet.<br><span style="font-size:.75rem">Appears after first matches are scored.</span></div></div>');
    return;
  }

  const ourRank = rankings.find(r=>r.teamNumber==TEAM_NUMBER);
  if (!ourRank) {
    renderPage(`<div class="empty-state"><div class="empty-icon">▲</div><div>Team ${TEAM_NUMBER} not in rankings.</div></div>`);
    return;
  }

  const ourMatches = schedule.filter(m=>m.teams?.some(t=>t.teamNumber==TEAM_NUMBER));
  const played     = ourMatches.filter(m=>m.scoreRedFinal!==null);
  const remaining  = ourMatches.filter(m=>m.scoreRedFinal===null);

  // Current real RP total = avg × counted
  const counted      = ourRank.matchesCounted || ourRank.matchesPlayed || played.length || 0;
  const currentRPavg = ourRank.sortOrder1 || 0;
  const currentRPtot = currentRPavg * counted;

  // Estimate actual RP earned from each played match (Win=2, Tie=1, Loss=0)
  const playedRPMap = {};
  played.forEach(m => {
    const ourA  = m.teams.find(t=>t.teamNumber==TEAM_NUMBER)?.station?.startsWith('Red')?'Red':'Blue';
    const won   = ourA==='Red'?m.redWins:m.blueWins;
    const isTie = m.redWins===false && m.blueWins===false;
    playedRPMap[m.matchNumber] = won ? 2 : isTie ? 1 : 0;
  });

  // Sim state: { rp: 0–6 } per unplayed match. Default 2 (expected win).
  const sim = {};
  remaining.forEach(m => { sim[m.matchNumber] = { rp: 2 }; });

  function calcProjection() {
    let addedRP = 0;
    remaining.forEach(m => { addedRP += sim[m.matchNumber].rp; });

    const projTotalRP = currentRPtot + addedRP;
    const projCounted = counted + remaining.length;
    const projRPavg   = projCounted > 0 ? projTotalRP / projCounted : 0;

    const projRpWins   = remaining.filter(m=>sim[m.matchNumber].rp>=2).length;
    const projRpLosses = remaining.filter(m=>sim[m.matchNumber].rp===0).length;
    const projRpTies   = remaining.filter(m=>sim[m.matchNumber].rp===1).length;

    // How many teams beat us with projected RP?
    const projRank = rankings.filter(r => r.teamNumber!=TEAM_NUMBER && (r.sortOrder1||0) >= projRPavg).length + 1;
    const total    = rankings.length;

    const sortedRPs = rankings.filter(r=>r.teamNumber!=TEAM_NUMBER).map(r=>r.sortOrder1||0).sort((a,b)=>b-a);
    const advSlots  = Math.max(1, Math.ceil(total * 0.5));
    const cutoffRP  = sortedRPs[advSlots-2] || 0;
    const neededAdditionalRP = Math.max(0, (cutoffRP * projCounted - projTotalRP));

    return {
      projWins:ourRank.wins+projRpWins, projLosses:ourRank.losses+projRpLosses, projTies:ourRank.ties+projRpTies,
      projTotalRP, projCounted, projRPavg,
      projRank, total, advSlots, cutoffRP, neededAdditionalRP,
      advances: projRank <= advSlots,
    };
  }

  function renderSim() {
    const p = calcProjection();
    const advColor = p.advances ? 'var(--green)' : 'var(--red)';
    const advText  = p.advances
      ? `✓ Projected to Advance (Top ${p.advSlots})`
      : `✗ Outside Cutoff — Need More RP`;

    // ── Full schedule: played rows first, then unplayed ──
    const allMatchRows = ourMatches.map(m => {
      const ourA  = m.teams.find(t=>t.teamNumber==TEAM_NUMBER)?.station?.startsWith('Red')?'Red':'Blue';
      const allies= m.teams.filter(t=>t.teamNumber!=TEAM_NUMBER&&t.station?.startsWith(ourA));
      const opps  = m.teams.filter(t=>!t.station?.startsWith(ourA));
      const isPlayed = m.scoreRedFinal !== null;

      if (isPlayed) {
        // Played match row — show actual result
        const ourScore  = ourA==='Red'?m.scoreRedFinal:m.scoreBlueFinal;
        const oppScore  = ourA==='Red'?m.scoreBlueFinal:m.scoreRedFinal;
        const won       = ourA==='Red'?m.redWins:m.blueWins;
        const isTie     = m.redWins===false && m.blueWins===false;
        const actualRP  = playedRPMap[m.matchNumber] ?? (won?2:isTie?1:0);
        const resultLbl = won ? 'W' : isTie ? 'T' : 'L';
        const resultClr = won ? 'var(--green)' : isTie ? 'var(--yellow)' : 'var(--red)';
        return `
          <div class="sim-match-row" style="opacity:.75">
            <div style="display:flex;align-items:center;gap:.5rem">
              <span style="font-family:var(--mono);font-weight:700;font-size:.82rem;min-width:32px">Q${m.matchNumber}</span>
              <div style="flex:1;font-size:.68rem;font-family:var(--mono);color:var(--text2)">
                ${ourA} · w/ ${allies.map(t=>t.teamNumber).join(', ')||'?'} vs ${opps.map(t=>t.teamNumber).join(', ')||'?'}
              </div>
              <div style="text-align:right">
                <div style="font-family:var(--mono);font-size:.8rem;font-weight:700;color:${resultClr}">${resultLbl} ${ourScore}–${oppScore}</div>
                <div style="font-family:var(--mono);font-size:.65rem;color:var(--text2)">+${actualRP} RP</div>
              </div>
            </div>
          </div>`;
      } else {
        // Unplayed match — RP stepper
        const s   = sim[m.matchNumber];
        const rp  = s.rp;
        const rpColor = rp>=4?'var(--accent)':rp>=2?'var(--green)':rp===1?'var(--yellow)':'var(--red)';
        const rpLabel = rp===0?'Loss':rp===1?'Tie':rp===2?'Win':rp<=4?`Win +${rp-2} bonus`:`Win +${rp-2} bonus`;
        return `
          <div class="sim-match-row">
            <div style="display:flex;align-items:center;gap:.5rem">
              <span style="font-family:var(--mono);font-weight:700;font-size:.82rem;min-width:32px">Q${m.matchNumber}</span>
              <div style="flex:1">
                <div style="font-size:.68rem;font-family:var(--mono);color:var(--text2)">
                  ${ourA} · w/ ${allies.map(t=>t.teamNumber).join(', ')||'?'} vs ${opps.map(t=>t.teamNumber).join(', ')||'?'}
                </div>
                <div style="font-size:.63rem;color:var(--text3);font-family:var(--mono)">${formatTime(m.startTime)}</div>
              </div>
              <div class="rp-stepper" data-match="${m.matchNumber}">
                <button class="rp-step-btn" data-dir="-1" data-match="${m.matchNumber}">−</button>
                <div class="rp-step-val">
                  <div style="font-family:var(--mono);font-size:1.1rem;font-weight:800;color:${rpColor};line-height:1">${rp}</div>
                  <div style="font-size:.55rem;color:var(--text3);white-space:nowrap">RP</div>
                </div>
                <button class="rp-step-btn" data-dir="1" data-match="${m.matchNumber}">+</button>
              </div>
            </div>
            <div style="font-size:.65rem;font-family:var(--mono);color:${rpColor};margin-top:.25rem;text-align:right">${rpLabel}</div>
          </div>`;
      }
    }).join('');

    // Advancement bubble
    const sortedRanks = [...rankings].sort((a,b)=>(b.sortOrder1||0)-(a.sortOrder1||0));
    const bubbleStart = Math.max(0, p.advSlots - 3);
    const bubbleEnd   = Math.min(rankings.length, p.advSlots + 2);
    const bubbleTeams = sortedRanks.slice(bubbleStart, bubbleEnd);

    const bubbleRows = bubbleTeams.map((r,i)=>{
      const displayRank = bubbleStart+i+1;
      const isUs = r.teamNumber==TEAM_NUMBER;
      const advancing = displayRank <= p.advSlots;
      const isCutoff  = displayRank === p.advSlots;
      return `
        ${isCutoff?`<div style="border-top:2px dashed var(--red);font-size:.6rem;font-family:var(--mono);color:var(--red);text-align:center;padding:.15rem 0;margin:.1rem 0">— CUTOFF LINE —</div>`:''}
        <div class="match-row ${isUs?'our-match':''}" style="cursor:default;${advancing?'':'opacity:.5'}">
          <div class="match-num" style="color:${advancing?'var(--green)':'var(--red)'}">#${displayRank}</div>
          <div style="flex:1">
            <div style="font-weight:${isUs?800:600};font-size:.82rem">${isUs?`<strong>${r.teamNumber}</strong>`:r.teamNumber} <span style="color:var(--text2);font-weight:400;font-size:.74rem">${r.teamName||''}</span></div>
          </div>
          <div style="font-family:var(--mono);font-size:.72rem;color:var(--text2)">${(r.sortOrder1||0).toFixed(4)}</div>
        </div>`;
    }).join('');

    document.getElementById('sim-content').innerHTML = `
      <!-- Projection banner -->
      <div class="projection-banner">
        <div class="projection-rank">#${p.projRank}</div>
        <div class="projection-label">Projected Rank of ${p.total} teams</div>
        <div style="font-size:.73rem;font-weight:700;color:${advColor};margin-top:.4rem">${advText}</div>
        <div style="font-size:.68rem;font-family:var(--mono);color:var(--text2);margin-top:.2rem">
          Proj RP avg: ${p.projRPavg.toFixed(4)} · Cutoff: ${p.cutoffRP.toFixed(4)}
        </div>
        ${!p.advances&&p.neededAdditionalRP>0?`<div style="font-size:.68rem;font-family:var(--mono);color:var(--red);margin-top:.2rem">Need ~${p.neededAdditionalRP.toFixed(1)} more RP to advance</div>`:''}
      </div>

      <!-- Stats row -->
      <div class="stat-grid stat-grid-3" style="margin-bottom:1rem">
        <div class="stat-box"><div class="stat-value" style="font-size:1rem">${p.projRPavg.toFixed(4)}</div><div class="stat-label">Proj RP Avg</div></div>
        <div class="stat-box"><div class="stat-value" style="font-size:.95rem">${p.projWins}-${p.projLosses}${p.projTies?'-'+p.projTies:''}</div><div class="stat-label">Proj W-L-T</div></div>
        <div class="stat-box"><div class="stat-value" style="font-size:1rem">${remaining.length}</div><div class="stat-label">Remaining</div></div>
      </div>

      <!-- Current standing -->
      <div class="card card-accent2" style="margin-bottom:1rem">
        <div class="card-header"><span class="card-title">Current Standing</span></div>
        <div class="stat-grid stat-grid-3">
          <div class="stat-box"><div class="stat-value" style="font-size:1.1rem">#${ourRank.rank}</div><div class="stat-label">Rank Now</div></div>
          <div class="stat-box"><div class="stat-value" style="font-size:1rem">${(ourRank.sortOrder1||0).toFixed(4)}</div><div class="stat-label">RP Avg Now</div></div>
          <div class="stat-box"><div class="stat-value" style="font-size:.95rem">${ourRank.wins}-${ourRank.losses}</div><div class="stat-label">W-L Now</div></div>
        </div>
      </div>

      <!-- Full schedule -->
      <div class="section-label" style="margin-bottom:.4rem">
        Match Schedule — tap +/− to set projected RP (0–6) for unplayed matches
      </div>
      <div style="font-size:.6rem;font-family:var(--mono);color:var(--text3);margin-bottom:.6rem">
        FTC 2025: Win=2 RP · Tie=1 RP · Loss=0 RP · +1–4 bonus RP from game achievements
      </div>
      ${ourMatches.length ? `<div id="sim-matches">${allMatchRows}</div>`
        : `<div class="card"><div style="text-align:center;color:var(--text2);font-size:.85rem;padding:1rem">No matches found.</div></div>`}

      <!-- Advancement bubble -->
      <div class="card" style="margin-top:1rem">
        <div class="card-header"><span class="card-title">Advancement Bubble</span></div>
        <div style="font-size:.65rem;font-family:var(--mono);color:var(--text3);margin-bottom:.4rem">Top ${p.advSlots} of ${p.total} advance · Cutoff RP: ${p.cutoffRP.toFixed(4)}</div>
        ${bubbleRows}
      </div>
    `;

    // Bind RP stepper buttons
    document.querySelectorAll('.rp-step-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const matchNum = parseInt(btn.dataset.match);
        const dir = parseInt(btn.dataset.dir);
        sim[matchNum].rp = Math.max(0, Math.min(6, sim[matchNum].rp + dir));
        renderSim();
      });
    });
  }

  renderPage(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.25rem">
      <div class="page-title" style="margin-bottom:0">RP <span>Simulator</span></div>
      <button class="icon-btn" onclick="simulator()" title="Reload">↻</button>
    </div>
    <div id="sim-content"></div>`);
  renderSim();
}
