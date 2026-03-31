// ── AP / RP Simulator ─────────────────────────────────────────
// Real FTC 2025 RP rules:
//   Win  = 2 RP
//   Tie  = 1 RP
//   Loss = 0 RP
//   PLUS bonus RP from game-specific achievements (e.g. auto bonus, hang bonus)
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

  const ourMatches  = schedule.filter(m=>m.teams?.some(t=>t.teamNumber==TEAM_NUMBER));
  const played      = ourMatches.filter(m=>m.scoreRedFinal!==null);
  const remaining   = ourMatches.filter(m=>m.scoreRedFinal===null);

  // Current real RP total = avg × counted
  const counted     = ourRank.matchesCounted || ourRank.matchesPlayed || played.length || 0;
  const currentRPavg= ourRank.sortOrder1 || 0;
  const currentRPtot= currentRPavg * counted;

  // Sim state per remaining match
  // outcome: win/tie/loss
  // bonusRP: extra RP from game-specific achievements (0 by default, user adjustable)
  const sim = {};
  remaining.forEach(m => {
    sim[m.matchNumber] = { outcome: 'win', bonusRP: 0 };
  });

  // Global bonus RP setting (applied to all matches by default)
  let globalBonusRP = 0;

  function calcProjection() {
    let addedRP = 0;
    let addedMatches = 0;
    remaining.forEach(m => {
      const s = sim[m.matchNumber];
      const outcomeRP = s.outcome==='win' ? 2 : s.outcome==='tie' ? 1 : 0;
      addedRP += outcomeRP + (s.bonusRP || 0);
      addedMatches++;
    });

    const projTotalRP  = currentRPtot + addedRP;
    const projCounted  = counted + addedMatches;
    const projRPavg    = projCounted > 0 ? projTotalRP / projCounted : 0;

    const projWins   = ourRank.wins   + remaining.filter(m=>sim[m.matchNumber].outcome==='win').length;
    const projLosses = ourRank.losses + remaining.filter(m=>sim[m.matchNumber].outcome==='loss').length;
    const projTies   = ourRank.ties   + remaining.filter(m=>sim[m.matchNumber].outcome==='tie').length;

    // How many teams beat us?
    const projRank = rankings.filter(r => r.teamNumber!=TEAM_NUMBER && (r.sortOrder1||0) >= projRPavg).length + 1;
    const total    = rankings.length;

    // What RP avg do we need to be in top N?
    const sortedRPs = rankings.filter(r=>r.teamNumber!=TEAM_NUMBER).map(r=>r.sortOrder1||0).sort((a,b)=>b-a);
    const advSlots  = Math.max(1, Math.ceil(total * 0.5));
    const cutoffRP  = sortedRPs[advSlots-2] || 0; // RP of last advancing team (excluding us)
    const neededAdditionalRP = Math.max(0, (cutoffRP * projCounted - projTotalRP));

    return {
      projWins, projLosses, projTies,
      projTotalRP, projCounted, projRPavg,
      projRank, total, advSlots, cutoffRP,
      neededAdditionalRP,
      advances: projRank <= advSlots,
    };
  }

  function renderSim() {
    const p = calcProjection();
    const advColor = p.advances ? 'var(--green)' : 'var(--red)';
    const advText  = p.advances
      ? `✓ Projected to Advance (Top ${p.advSlots})`
      : `✗ Outside Cutoff — Need More RP`;

    // Remaining match rows
    const matchRows = remaining.map(m => {
      const ourA  = m.teams.find(t=>t.teamNumber==TEAM_NUMBER)?.station?.startsWith('Red')?'Red':'Blue';
      const allies= m.teams.filter(t=>t.teamNumber!=TEAM_NUMBER&&t.station?.startsWith(ourA)).map(t=>`${t.teamNumber}`);
      const opps  = m.teams.filter(t=>!t.station?.startsWith(ourA)).map(t=>`${t.teamNumber}`);
      const s     = sim[m.matchNumber];
      const baseRP= s.outcome==='win'?2:s.outcome==='tie'?1:0;
      const totalMatchRP = baseRP + (s.bonusRP||0);
      return `
        <div class="sim-match-row">
          <div class="sim-match-header">
            <div style="flex:1">
              <div style="display:flex;align-items:center;gap:.5rem">
                <span style="font-family:var(--mono);font-weight:700;font-size:.85rem">Q${m.matchNumber}</span>
                <span style="font-size:.7rem;color:var(--text2)">${formatTime(m.startTime)}</span>
                <span style="font-family:var(--mono);font-size:.68rem;color:${totalMatchRP>2?'var(--accent)':totalMatchRP>0?'var(--accent2)':'var(--text3)'}">+${totalMatchRP} RP</span>
              </div>
              <div style="font-size:.67rem;color:var(--text3);font-family:var(--mono)">
                ${ourA} · w/ ${allies.join(', ')||'?'} vs ${opps.join(', ')||'?'}
              </div>
            </div>
            <div class="sim-toggle">
              <button class="sim-btn win  ${s.outcome==='win' ?'active':''}" data-match="${m.matchNumber}" data-o="win" >W+2</button>
              <button class="sim-btn tie  ${s.outcome==='tie' ?'active':''}" data-match="${m.matchNumber}" data-o="tie" >T+1</button>
              <button class="sim-btn loss ${s.outcome==='loss'?'active':''}" data-match="${m.matchNumber}" data-o="loss">L+0</button>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:.5rem;margin-top:.4rem">
            <label style="font-size:.65rem;font-family:var(--mono);color:var(--text3);white-space:nowrap">Bonus RP:</label>
            <input type="number" min="0" max="4" value="${s.bonusRP||0}"
              class="sim-bonus-input" data-match="${m.matchNumber}"
              style="width:50px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--mono);font-size:.8rem;padding:2px 6px;text-align:center"/>
            <span style="font-size:.62rem;color:var(--text3);font-family:var(--mono)">game achievements (hang, auto, etc.)</span>
          </div>
        </div>`;
    }).join('');

    // Played results
    const playedRows = played.slice(-5).reverse().map(m=>{
      const ourA = m.teams.find(t=>t.teamNumber==TEAM_NUMBER)?.station?.startsWith('Red')?'Red':'Blue';
      const ourS = ourA==='Red'?m.scoreRedFinal:m.scoreBlueFinal;
      const oppS = ourA==='Red'?m.scoreBlueFinal:m.scoreRedFinal;
      const won  = ourA==='Red'?m.redWins:m.blueWins;
      // Estimate actual RP earned from this match
      const matchRP = won?2:(m.redWins===false&&m.blueWins===false)?1:0;
      return `
        <div class="match-row" style="cursor:default">
          <div class="match-num">Q${m.matchNumber}</div>
          <div style="flex:1;font-family:var(--mono);font-size:.78rem;color:var(--text2)">${ourA} · ${ourS}–${oppS}</div>
          <div style="font-family:var(--mono);font-size:.75rem;font-weight:700;color:${won?'var(--green)':'var(--red)'}">${won?'W':'L'} +${matchRP}</div>
        </div>`;
    }).join('');

    // Bubble table showing teams around cutoff
    const sortedRanks = [...rankings].sort((a,b)=>(b.sortOrder1||0)-(a.sortOrder1||0));
    const ourProjIdx  = sortedRanks.findIndex(r=>r.teamNumber==TEAM_NUMBER);
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
        <div class="match-row ${isUs?'our-match':''}" style="cursor:default;${advancing?'':'opacity:.6'}">
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
        ${!p.advances&&p.neededAdditionalRP>0?`<div style="font-size:.68rem;font-family:var(--mono);color:var(--red);margin-top:.2rem">Need ~${p.neededAdditionalRP.toFixed(1)} more RP total to advance</div>`:''}
      </div>

      <!-- Stats row -->
      <div class="stat-grid stat-grid-3" style="margin-bottom:1rem">
        <div class="stat-box"><div class="stat-value" style="font-size:1rem">${p.projRPavg.toFixed(4)}</div><div class="stat-label">Proj RP Avg</div></div>
        <div class="stat-box"><div class="stat-value" style="font-size:.95rem">${p.projWins}-${p.projLosses}${p.projTies?'-'+p.projTies:''}</div><div class="stat-label">Proj W-L</div></div>
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

      <!-- Global bonus RP setter -->
      ${remaining.length?`
      <div class="card" style="margin-bottom:1rem">
        <div class="card-header"><span class="card-title">Global Bonus RP</span></div>
        <div style="font-size:.72rem;color:var(--text2);margin-bottom:.5rem">
          Apply bonus RP (from game-specific achievements like hanging, auto bonuses) to all remaining matches at once. You can also set per-match below.
        </div>
        <div style="display:flex;align-items:center;gap:.75rem">
          <label style="font-size:.75rem;font-family:var(--mono);color:var(--text2)">Bonus RP per match:</label>
          <input type="number" min="0" max="4" value="${globalBonusRP}" id="global-bonus-rp"
            style="width:60px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs);color:var(--text);font-family:var(--mono);font-size:.9rem;padding:4px 8px;text-align:center"/>
          <button class="btn btn-sm btn-secondary" id="apply-global-bonus">Apply to All</button>
        </div>
        <div style="margin-top:.5rem;font-size:.68rem;font-family:var(--mono);color:var(--text3)">
          FTC 2025 RP: Win=2, Tie=1, Loss=0 + game bonuses (typically 0–2 per match)
        </div>
      </div>

      <div class="section-label" style="margin-bottom:.5rem">Simulate Remaining Matches</div>
      <div id="sim-matches">${matchRows}</div>`
      :`<div class="card"><div style="text-align:center;color:var(--text2);font-size:.85rem;padding:1rem">
        All matches played. Final rank: #${ourRank.rank}
      </div></div>`}

      <!-- Advancement bubble -->
      <div class="card" style="margin-top:1rem">
        <div class="card-header"><span class="card-title">Advancement Bubble</span></div>
        <div style="font-size:.65rem;font-family:var(--mono);color:var(--text3);margin-bottom:.4rem">Top ${p.advSlots} of ${p.total} advance · Cutoff RP: ${p.cutoffRP.toFixed(4)}</div>
        ${bubbleRows}
      </div>

      ${played.length?`<div class="section-label" style="margin-top:1rem;margin-bottom:.5rem">Recent Results</div>${playedRows}`:''}
    `;

    // Bind outcome buttons
    document.querySelectorAll('.sim-btn[data-o]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        sim[parseInt(btn.dataset.match)].outcome=btn.dataset.o;
        renderSim();
      });
    });

    // Bind per-match bonus RP inputs
    document.querySelectorAll('.sim-bonus-input').forEach(inp=>{
      inp.addEventListener('change',()=>{
        sim[parseInt(inp.dataset.match)].bonusRP=Math.max(0,parseInt(inp.value)||0);
        renderSim();
      });
    });

    // Global bonus RP apply button
    document.getElementById('apply-global-bonus')?.addEventListener('click',()=>{
      globalBonusRP=Math.max(0,parseInt(document.getElementById('global-bonus-rp').value)||0);
      remaining.forEach(m=>{ sim[m.matchNumber].bonusRP=globalBonusRP; });
      renderSim();
    });
  }

  renderPage(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.25rem">
      <div class="page-title" style="margin-bottom:0">AP <span>Simulator</span></div>
      <button class="icon-btn" onclick="simulator()" title="Reload">↻</button>
    </div>
    <div id="sim-content"></div>`);
  renderSim();
}
