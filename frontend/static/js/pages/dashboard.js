async function dashboard() {
  if (!appSettings.active_event_code) { noEventPage(); return; }
  loadingPage();

  const season = appSettings.active_season || 2025;
  const [rankData, schedData, matchRpData] = await Promise.all([
    API.getRankings().catch(()=>null),
    API.getSchedule('qual').catch(()=>null),
    API.ftcscoutEventMatchRP(appSettings.active_event_code, season).catch(()=>null),
  ]);

  // Per-match RP map from FTCScout GraphQL
  const dashScoresMap = {};
  (matchRpData?.matches || []).forEach(ms => {
    if (ms.tournamentLevel && ms.tournamentLevel !== 'Quals' && ms.tournamentLevel !== 'qual') return;
    dashScoresMap[ms.matchNum] = { red: ms.red, blue: ms.blue };
  });

  const rankings = rankData?.rankings || rankData?.Rankings || [];
  const schedule = schedData?.schedule || [];
  window._rankings = rankings; // cache for other pages
  window._schedule = schedule;
  rankings.forEach(r => { window._teamNames = window._teamNames||{}; window._teamNames[r.teamNumber]=r.teamName||''; });

  const ourRank    = rankings.find(r=>r.teamNumber==TEAM_NUMBER);
  const ourMatches = schedule.filter(m=>m.teams?.some(t=>t.teamNumber==TEAM_NUMBER));
  const nextMatch  = ourMatches.find(m=>m.scoreRedFinal===null&&m.scoreBlueFinal===null);
  const played     = ourMatches.filter(m=>m.scoreRedFinal!==null);

  const ourA    = m => m.teams.find(t=>t.teamNumber==TEAM_NUMBER)?.station?.startsWith('Red')?'Red':'Blue';
  const ourS    = m => ourA(m)==='Red'?m.scoreRedFinal :m.scoreBlueFinal;
  const oppS    = m => ourA(m)==='Red'?m.scoreBlueFinal:m.scoreRedFinal;
  const weWon   = m => ourA(m)==='Red'?m.redWins:m.blueWins;
  const ourAuto = m => ourA(m)==='Red'?(m.scoreRedAuto||0):(m.scoreBlueAuto||0);

  const totalW   = played.filter(m=>weWon(m)).length;
  const avgScore = played.length?Math.round(played.reduce((a,m)=>a+ourS(m),0)/played.length):null;
  const avgAuto  = played.length?Math.round(played.reduce((a,m)=>a+ourAuto(m),0)/played.length):null;
  const highScore= played.length?Math.max(...played.map(m=>ourS(m))):null;

  // ── Next match card ─────────────────────────────────────────
  let cdHtml = '';
  if (nextMatch) {
    const red  = nextMatch.teams.filter(t=>t.station?.startsWith('Red'));
    const blue = nextMatch.teams.filter(t=>t.station?.startsWith('Blue'));

    // "Playing against" info - who are the opponents?
    const ourAlliance = ourA(nextMatch);
    const allies  = nextMatch.teams.filter(t=>t.teamNumber!=TEAM_NUMBER&&t.station?.startsWith(ourAlliance));
    const opps    = nextMatch.teams.filter(t=>!t.station?.startsWith(ourAlliance));

    cdHtml = `
      <div class="card card-accent">
        <div class="card-header">
          <span class="card-title">Next — Q${nextMatch.matchNumber}</span>
          <span class="match-time">${formatTime(nextMatch.startTime)}</span>
        </div>
        <div class="countdown-block">
          <div class="countdown-time" id="cd-time">--</div>
          <div class="countdown-label">until match start</div>
        </div>
        <div style="display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap;margin:.25rem 0">
          ${red.map(t=>teamChipNamed(t,'red')).join('')}
          <span style="color:var(--text3);font-size:.8rem;align-self:center">vs</span>
          ${blue.map(t=>teamChipNamed(t,'blue')).join('')}
        </div>
        <div style="margin-top:.6rem;padding:.5rem .6rem;background:var(--bg3);border-radius:var(--rs);font-size:.75rem">
          <div style="color:var(--text3);font-family:var(--mono);font-size:.62rem;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.25rem">${ourAlliance} Alliance — With You</div>
          ${allies.map(t=>{
            const r=rankings.find(x=>x.teamNumber==t.teamNumber);
            return `<div style="display:flex;align-items:center;gap:.5rem;padding:.2rem 0">
              <span class="team-chip ${ourAlliance.toLowerCase()} our clickable-chip" data-team="${t.teamNumber}">${t.teamNumber}</span>
              <span style="font-weight:600">${t.teamName||''}</span>
              ${r?`<span style="font-family:var(--mono);font-size:.68rem;color:var(--text2);margin-left:auto">#${r.rank} · ${r.wins}W</span>`:''}
            </div>`;
          }).join('')}
          <div style="color:var(--text3);font-family:var(--mono);font-size:.62rem;text-transform:uppercase;letter-spacing:.08em;margin:0.4rem 0 .25rem">Opponents</div>
          ${opps.map(t=>{
            const r=rankings.find(x=>x.teamNumber==t.teamNumber);
            const oAlliance=t.station?.startsWith('Red')?'red':'blue';
            return `<div style="display:flex;align-items:center;gap:.5rem;padding:.2rem 0">
              <span class="team-chip ${oAlliance} clickable-chip" data-team="${t.teamNumber}">${t.teamNumber}</span>
              <span style="font-weight:600">${t.teamName||''}</span>
              ${r?`<span style="font-family:var(--mono);font-size:.68rem;color:var(--text2);margin-left:auto">#${r.rank} · ${r.wins}W</span>`:''}
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  // ── Most recent match banner ────────────────────────────────
  let lastMatchHtml = '';
  if (played.length) {
    const last = played[played.length - 1]; // most recently played match
    const won  = weWon(last);
    const isTie = last.redWins===false && last.blueWins===false;
    const oS   = ourS(last);
    const opS  = oppS(last);
    const oAuto= ourAuto(last);
    const oppAuto = ourA(last)==='Red'?(last.scoreBlueAuto||0):(last.scoreRedAuto||0);
    const resultLabel = won ? 'WIN' : isTie ? 'TIE' : 'LOSS';
    const resultColor = won ? 'var(--green)' : isTie ? 'var(--yellow)' : 'var(--red)';
    const alliance    = ourA(last);
    const allies  = last.teams.filter(t=>t.teamNumber!=TEAM_NUMBER&&t.station?.startsWith(alliance));
    const opps    = last.teams.filter(t=>!t.station?.startsWith(alliance));
    const red  = last.teams.filter(t=>t.station?.startsWith('Red'));
    const blue = last.teams.filter(t=>t.station?.startsWith('Blue'));

    lastMatchHtml = `
      <div class="card" style="margin-bottom:.75rem;border-left:3px solid ${resultColor}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem">
          <span style="font-size:.62rem;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Last Match — Q${last.matchNumber}</span>
          <span style="font-family:var(--mono);font-size:.95rem;font-weight:800;color:${resultColor}">${resultLabel}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:center;gap:.5rem;margin-bottom:.45rem">
          <div style="font-family:var(--mono);font-size:2rem;font-weight:800;color:${resultColor};line-height:1">${oS}</div>
          <div style="font-family:var(--mono);font-size:1rem;color:var(--text3)">–</div>
          <div style="font-family:var(--mono);font-size:2rem;font-weight:800;color:var(--text2);line-height:1">${opS}</div>
        </div>
        <div style="display:flex;gap:.4rem;justify-content:center;flex-wrap:wrap;margin-bottom:.35rem">
          ${red.map(t=>teamChipNamed(t,'red')).join('')}
          <span style="color:var(--text3);align-self:center;font-size:.75rem">vs</span>
          ${blue.map(t=>teamChipNamed(t,'blue')).join('')}
        </div>
        <div class="match-sub-stats" style="justify-content:center;margin-top:.2rem">
          ${pairChip('Auto', last.scoreRedAuto??0, last.scoreBlueAuto??0)}
          ${(last.scoreRedFoul||last.scoreBlueFoul)?pairChip('Foul', last.scoreRedFoul||0, last.scoreBlueFoul||0):''}
          ${(() => {
            const sc = dashScoresMap[last.matchNumber];
            if (!sc) return '';
            const tie = last.redWins===false && last.blueWins===false;
            const rRP = computeMatchRP(sc.red, last.redWins, tie);
            const bRP = computeMatchRP(sc.blue, last.blueWins, tie);
            return rpPairChip(rRP, bRP, sc.red, sc.blue);
          })()}
          <span style="background:transparent;border:1px solid var(--border);color:${alliance==='Red'?'#ff8a94':'#47c8ff'};font-weight:700">${alliance}</span>
        </div>
      </div>`;
  }


  const statsHtml = ourRank ? `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Team ${TEAM_NUMBER} · ${ourRank.teamName||'Limited Liability'}</span>
        <span style="font-size:.8rem;font-family:var(--mono);color:var(--accent);font-weight:700">#${ourRank.rank} of ${rankings.length}</span>
      </div>
      <div class="stat-grid stat-grid-3">
        <div class="stat-box"><div class="stat-value">#${ourRank.rank}</div><div class="stat-label">Rank</div></div>
        <div class="stat-box"><div class="stat-value" style="font-size:1.2rem">${totalW}-${played.length-totalW}</div><div class="stat-label">W-L</div></div>
        <div class="stat-box"><div class="stat-value">${ourRank.sortOrder1?.toFixed(3)??'--'}</div><div class="stat-label">RP Avg</div></div>
      </div>
      <div class="stat-grid stat-grid-3" style="margin-top:.6rem">
        <div class="stat-box"><div class="stat-value" style="font-size:1.1rem">${avgScore??'--'}</div><div class="stat-label">Avg Score</div></div>
        <div class="stat-box"><div class="stat-value" style="font-size:1.1rem">${avgAuto??'--'}</div><div class="stat-label">Avg Auto</div></div>
        <div class="stat-box"><div class="stat-value" style="font-size:1.1rem">${highScore??'--'}</div><div class="stat-label">High Score</div></div>
      </div>
      <div style="margin-top:.75rem;display:flex;gap:.4rem;flex-wrap:wrap">
        ${[['RP Avg',ourRank.sortOrder1?.toFixed(4)],['SO2',ourRank.sortOrder2?.toFixed(2)],['Counted',ourRank.matchesCounted+'/'+ourRank.matchesPlayed],['DQ',ourRank.dq||0]].map(([l,v])=>`
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:.3rem .6rem;text-align:center">
          <div style="font-family:var(--mono);font-size:.82rem;font-weight:700;color:var(--accent2)">${v??'--'}</div>
          <div style="font-size:.58rem;color:var(--text3);text-transform:uppercase;letter-spacing:.06em">${l}</div>
        </div>`).join('')}
      </div>
    </div>` : `<div class="card"><div class="empty-state" style="padding:1rem 0"><div>Rankings not yet available.</div></div></div>`;

  // ── Recent matches ──────────────────────────────────────────
  let recentHtml = '';
  if (played.length) {
    const rows = played.slice(-5).reverse().map(m=>{
      const red  = m.teams.filter(t=>t.station?.startsWith('Red'));
      const blue = m.teams.filter(t=>t.station?.startsWith('Blue'));
      const won  = weWon(m);
      const oS=ourS(m), opS=oppS(m), oAuto=ourAuto(m);
      const oppAuto = ourA(m)==='Red'?(m.scoreBlueAuto||0):(m.scoreRedAuto||0);
      return `
        <div class="match-detail-row our-match" onclick="openMatchDetail(${m.matchNumber})" style="cursor:pointer">
          <div style="display:flex;align-items:center;gap:.6rem">
            <div class="match-num">Q${m.matchNumber}</div>
            <div class="match-alliances" style="flex:1">
              <div class="alliance-teams">${red.map(t=>teamChipNamed(t,'red')).join('')}</div>
              <div class="alliance-teams">${blue.map(t=>teamChipNamed(t,'blue')).join('')}</div>
            </div>
            <div style="text-align:right">
              <div style="font-family:var(--mono);font-size:.88rem;font-weight:800;color:${won?'var(--green)':'var(--red)'}">${won?'WIN':'LOSS'}</div>
              <div style="font-family:var(--mono);font-size:.75rem;color:var(--text2)">${oS}–${opS}</div>
            </div>
          </div>
          <div class="match-sub-stats">
            ${pairChip('Auto', m.scoreRedAuto??0, m.scoreBlueAuto??0)}
            ${(m.scoreRedFoul||m.scoreBlueFoul)?pairChip('Foul', m.scoreRedFoul||0, m.scoreBlueFoul||0):''}
            ${(() => {
              const sc = dashScoresMap[m.matchNumber];
              if (!sc) return '';
              const tie = m.redWins===false && m.blueWins===false;
              const rRP = computeMatchRP(sc.red, m.redWins, tie);
              const bRP = computeMatchRP(sc.blue, m.blueWins, tie);
              return rpPairChip(rRP, bRP, sc.red, sc.blue);
            })()}
            <span style="background:transparent;border:1px solid var(--border);color:${ourA(m)==='Red'?'#ff8a94':'#47c8ff'};font-weight:700">${m.teams.find(t=>t.teamNumber==TEAM_NUMBER)?.station||''}</span>
          </div>
        </div>`;
    }).join('');
    recentHtml = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">Our Matches (${played.length} played)</span>
          <button class="btn btn-sm btn-secondary" onclick="navigateTo('schedule')">All →</button>
        </div>
        ${rows}
      </div>`;
  }

  // ── Top teams ────────────────────────────────────────────────
  let leaderHtml = '';
  if (rankings.length) {
    leaderHtml = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">Top Teams</span>
          <button class="btn btn-sm btn-secondary" onclick="navigateTo('rankings')">Full →</button>
        </div>
        ${rankings.slice(0,5).map(r=>`
          <div class="match-row ${r.teamNumber==TEAM_NUMBER?'our-match':''}" onclick="openTeamModal(${r.teamNumber})" style="cursor:pointer">
            <div class="match-num">#${r.rank}</div>
            <div style="flex:1">
              <div style="font-weight:700;font-size:.85rem">${r.teamNumber} <span style="color:var(--text2);font-weight:400;font-size:.76rem">${r.teamName||''}</span></div>
              <div style="font-size:.67rem;font-family:var(--mono);color:var(--text2)">${r.wins}W-${r.losses}L · RP ${r.sortOrder1?.toFixed(3)}</div>
            </div>
          </div>`).join('')}
      </div>`;
  }

  renderPage(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.25rem">
      <div class="page-title" style="margin-bottom:0">LL<span>DASH</span></div>
      <button class="icon-btn" onclick="dashboard()" title="Reload">↻</button>
    </div>
    <div style="font-size:.73rem;font-family:var(--mono);color:var(--text2);margin-bottom:.75rem">${appSettings.active_event_name||'No Event'}</div>
    ${lastMatchHtml}
    ${cdHtml}
    ${statsHtml}
    ${recentHtml}
    ${leaderHtml}
  `);

  bindTeamClicks(rankings);

  if (nextMatch?.startTime) {
    const tick=()=>{
      const el=document.getElementById('cd-time'); if(!el) return;
      const diff=new Date(nextMatch.startTime)-Date.now();
      if (diff<=0){el.textContent='NOW';return;}
      const h=Math.floor(diff/3600000),m=Math.floor((diff%3600000)/60000),s=Math.floor((diff%60000)/1000);
      el.textContent=h>0?`${h}h ${m}m ${s}s`:`${m}m ${s}s`;
      setTimeout(tick,1000);
    };
    tick();
  }
}

// helper needed by dashboard
function oppScore(m) {
  const a = m.teams?.find(t=>t.teamNumber==TEAM_NUMBER)?.station?.startsWith('Red')?'Red':'Blue';
  return a==='Red'?m.scoreBlueFinal:m.scoreRedFinal;
}
