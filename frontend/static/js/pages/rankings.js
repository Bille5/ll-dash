async function rankings() {
  if (!appSettings.active_event_code) { noEventPage(); return; }
  loadingPage();

  const rankData = await API.getRankings().catch(()=>null);
  const ranks = rankData?.rankings || rankData?.Rankings || [];
  if (!ranks.length) { renderPage('<div class="empty-state"><div class="empty-icon">◬</div><div>No rankings yet.</div></div>'); return; }
  ranks.forEach(r=>{ window._teamNames=window._teamNames||{}; window._teamNames[r.teamNumber]=r.teamName||''; });

  const rows = ranks.map(r=>`
    <tr class="${r.teamNumber==TEAM_NUMBER?'our-row':''}" onclick="openTeamModal(${r.teamNumber})" style="cursor:pointer">
      <td>${r.rank}</td>
      <td>
        <div style="font-weight:700">${r.teamNumber}</div>
        <div style="font-size:.63rem;color:var(--text2);max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.teamName||''}</div>
      </td>
      <td>${r.wins}-${r.losses}${r.ties?'-'+r.ties:''}</td>
      <td>${r.sortOrder1?.toFixed(3)??'--'}</td>
      <td>${r.sortOrder2?.toFixed(1)??'--'}</td>
      <td>${r.matchesCounted??'--'}/${r.matchesPlayed??'--'}</td>
    </tr>`).join('');

  renderPage(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.25rem">
      <div class="page-title" style="margin-bottom:0">Rankings</div>
      <button class="icon-btn" onclick="rankings()" title="Reload">↻</button>
    </div>
    <div style="font-size:.7rem;font-family:var(--mono);color:var(--text2);margin-bottom:.75rem">${appSettings.active_event_name||'Event'} · ${ranks.length} teams · Tap row for details</div>
    <div style="overflow-x:auto">
      <table class="rank-table">
        <thead><tr><th>#</th><th>Team</th><th>W-L</th><th>RP Avg</th><th>Avg Sc</th><th>Counted</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="margin-top:.5rem;font-size:.6rem;font-family:var(--mono);color:var(--text3)">RP Avg = sortOrder1 · Avg Score = sortOrder2 · Tap any team for full profile + FTCScout stats</div>
  `);
}

// ── Full team profile modal (used everywhere) ─────────────────
async function openTeamModal(teamNum) {
  const modal = document.createElement('div');
  modal.className='modal';
  modal.innerHTML=`
    <div class="modal-backdrop" id="tp-back"></div>
    <div class="modal-sheet">
      <div class="modal-header">
        <span class="modal-title">Team ${teamNum}</span>
        <button class="modal-close" id="tp-close">✕</button>
      </div>
      <div class="modal-body" id="tp-body"><div class="loading">Loading</div></div>
    </div>`;
  document.body.appendChild(modal);
  const rm=()=>modal.remove();
  document.getElementById('tp-back').addEventListener('click',rm);
  document.getElementById('tp-close').addEventListener('click',rm);

  // Load in parallel: local data + FTCScout
  const season = appSettings.active_season || 2025;
  const [rankData, schedData, scoutData, flagData, ftcData] = await Promise.all([
    API.getRankings().catch(()=>null),
    API.getSchedule('qual').catch(()=>null),
    API.getScouting(teamNum).catch(()=>[]),
    API.getFlags().catch(()=>({})),
    API.ftcscoutTeam(teamNum, season),
  ]);

  const rankings    = rankData?.rankings||rankData?.Rankings||[];
  const schedule    = schedData?.schedule||[];
  const rank        = rankings.find(r=>r.teamNumber==teamNum);
  const notes       = Array.isArray(scoutData)?scoutData:[];
  const flag        = (flagData[teamNum]||{}).flag||'neutral';
  const teamMatches = schedule.filter(m=>m.teams?.some(t=>t.teamNumber==teamNum));
  const played      = teamMatches.filter(m=>m.scoreRedFinal!==null);

  // Compute stats from schedule
  const wins = played.filter(m=>{
    const a=m.teams.find(t=>t.teamNumber==teamNum)?.station?.startsWith('Red')?'Red':'Blue';
    return a==='Red'?m.redWins:m.blueWins;
  }).length;
  const scores = played.map(m=>{
    const a=m.teams.find(t=>t.teamNumber==teamNum)?.station?.startsWith('Red')?'Red':'Blue';
    return {total:a==='Red'?m.scoreRedFinal:m.scoreBlueFinal, auto:a==='Red'?(m.scoreRedAuto||0):(m.scoreBlueAuto||0)};
  });
  const avgTotal  = scores.length?Math.round(scores.reduce((a,s)=>a+s.total,0)/scores.length):null;
  const avgAuto   = scores.length?Math.round(scores.reduce((a,s)=>a+s.auto,0)/scores.length):null;
  const highScore = scores.length?Math.max(...scores.map(s=>s.total)):null;
  const avg       = f=>notes.length?(notes.reduce((a,n)=>a+(n[f]||0),0)/notes.length).toFixed(1):'--';

  // FTCScout quick stats block
  // API response shape: {season, number, tot:{value,rank}, auto:{value,rank}, dc:{value,rank}, eg:{value,rank}, count}
  let ftcHtml = '';
  if (ftcData && (ftcData.tot || ftcData.totalNp)) {
    const qs = ftcData;
    const totVal  = qs.tot?.value  ?? qs.totalNp?.value;
    const autoVal = qs.auto?.value ?? qs.autonomousNp?.value;
    const dcVal   = qs.dc?.value   ?? qs.teleop?.value   ?? qs.driverControlled?.value;
    const egVal   = qs.eg?.value   ?? qs.endgame?.value;
    const totRank = qs.tot?.rank   ?? qs.totalNp?.rank;
    const autoRank= qs.auto?.rank;
    const dcRank  = qs.dc?.rank;
    const egRank  = qs.eg?.rank;
    const count   = qs.count; // total TEPs used in global stats calculation
    const fmt = v => v!=null ? v.toFixed(2) : '--';
    const fmtRank = r => r!=null ? `#${r}` : '';
    ftcHtml=`
      <div style="margin-bottom:1rem;padding:.75rem;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem">
          <div style="font-size:.62rem;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.08em">FTCScout OPR Stats ${season}–${String(parseInt(season)+1).slice(-2)}</div>
          ${count?`<div style="font-size:.6rem;font-family:var(--mono);color:var(--text3)">${count.toLocaleString()} events</div>`:''}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem">
          ${[
            ['Total npOPR', fmt(totVal),  fmtRank(totRank)],
            ['Auto OPR',    fmt(autoVal), fmtRank(autoRank)],
            ['Teleop OPR',  fmt(dcVal),   fmtRank(dcRank)],
            ['Endgame OPR', fmt(egVal),   fmtRank(egRank)],
          ].map(([l,v,r])=>`
          <div style="background:var(--bg2);border-radius:6px;padding:.35rem .5rem">
            <div style="display:flex;align-items:baseline;gap:.3rem">
              <div style="font-family:var(--mono);font-size:.88rem;font-weight:700;color:var(--accent2)">${v}</div>
              ${r?`<div style="font-family:var(--mono);font-size:.6rem;color:var(--text3)">${r}</div>`:''}
            </div>
            <div style="font-size:.6rem;color:var(--text3);text-transform:uppercase;letter-spacing:.05em">${l}</div>
          </div>`).join('')}
        </div>
        <div style="font-size:.65rem;font-family:var(--mono);color:var(--text2);margin-top:.4rem">
          ${totRank?`World rank #${totRank} by npOPR · `:''}
          <a href="https://ftcscout.org/teams/${teamNum}" target="_blank" style="color:var(--accent2)">FTCScout ↗</a>
        </div>
      </div>`;
  }

  const matchRows = played.slice(-4).reverse().map(m=>{
    const a=m.teams.find(t=>t.teamNumber==teamNum)?.station?.startsWith('Red')?'Red':'Blue';
    const s=a==='Red'?m.scoreRedFinal:m.scoreBlueFinal;
    const won=a==='Red'?m.redWins:m.blueWins;
    return `<div style="display:flex;gap:.5rem;align-items:center;padding:.35rem 0;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:.75rem">
      <span style="color:var(--text3);min-width:30px">Q${m.matchNumber}</span>
      <span style="${a==='Red'?'color:#ff8a94':'color:var(--accent2)'}">${a}</span>
      <span style="flex:1;color:var(--text2)">${s} pts</span>
      <span style="color:${won?'var(--green)':'var(--red)'};font-weight:700">${won?'W':'L'}</span>
    </div>`;
  }).join('');

  const noteHtml = notes.length?notes.map(n=>{
    const sections = parseScoutNotes(n);
    return `
    <div style="border-top:1px solid var(--border);padding:.55rem 0">
      <div style="display:flex;justify-content:space-between;margin-bottom:.3rem">
        <span style="font-size:.7rem;color:var(--text2);font-family:var(--mono)">${n.scout_name}${n.match_number?' · Q'+n.match_number:''}</span>
        ${n.driver_rating?`<span style="color:var(--accent);font-size:.75rem">${'★'.repeat(n.driver_rating)}</span>`:''}
      </div>
      ${n.auto_score!=null||n.teleop_score!=null||n.endgame_score!=null?`
      <div style="display:flex;gap:.3rem;flex-wrap:wrap;margin-bottom:.3rem">
        ${n.auto_score!=null?`<span style="background:var(--bg3);padding:1px 5px;border-radius:3px;font-size:.67rem;font-family:var(--mono);color:var(--text2)">Auto ${n.auto_score}</span>`:''}
        ${n.teleop_score!=null?`<span style="background:var(--bg3);padding:1px 5px;border-radius:3px;font-size:.67rem;font-family:var(--mono);color:var(--text2)">Teleop ${n.teleop_score}</span>`:''}
        ${n.endgame_score!=null?`<span style="background:var(--bg3);padding:1px 5px;border-radius:3px;font-size:.67rem;font-family:var(--mono);color:var(--text2)">End ${n.endgame_score}</span>`:''}
      </div>`:''}
      ${renderNoteSections(n)}
    </div>`}).join('')
    : '<div style="color:var(--text3);font-size:.82rem;padding:.5rem 0">No scouting notes yet.</div>';

  // Load season history from FTCScout (stats) enriched with official FTC event names
  const historyData = await API.ftcscoutTeamEvents(teamNum, season).catch(()=>null);

  // Build season history HTML
  let historyHtml = '';
  if (Array.isArray(historyData) && historyData.length) {
    // Sort by official FTC event start date (enriched by backend)
    const events = [...historyData].sort((a,b)=>new Date(a.eventDate||0)-new Date(b.eventDate||0));
    historyHtml = `
      <div style="margin-bottom:1rem">
        <div class="form-label" style="margin-bottom:.4rem">Season History ${season}–${String(parseInt(season)+1).slice(-2)}</div>
        ${events.map(ep => {
          // eventName/eventDate/eventCity/eventState are enriched by the backend from official FTC API
          const evName  = ep.eventName  || ep.eventCode || '?';
          const evCode  = ep.eventCode  || '';
          const evDate  = ep.eventDate  ? new Date(ep.eventDate).toLocaleDateString([],{month:'short',day:'numeric'}) : '';
          const evLoc   = [ep.eventCity, ep.eventState].filter(Boolean).join(', ');
          const evType  = ep.eventType  || '';
          // Stats are nested under ep.stats (FTCScout TeamEventParticipation schema)
          const stats   = ep.stats || {};
          const rank    = stats.rank;
          const wins    = stats.wins    ?? null;
          const losses  = stats.losses  ?? null;
          const ties    = stats.ties    ?? null;
          const rp      = stats.rp;
          const npOpr   = stats.tot?.value;
          const played  = stats.qualMatchesPlayed;
          const wlt     = wins!=null ? `${wins}W-${losses}L${ties?'-'+ties+'T':''}` : '';
          return `
            <div style="padding:.5rem .6rem;margin-bottom:.35rem;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs)">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem">
                <div style="flex:1">
                  <div style="font-size:.82rem;font-weight:600">${evName}</div>
                  <div style="font-size:.67rem;font-family:var(--mono);color:var(--text2);margin-top:1px">
                    ${evDate}${evLoc?' · '+evLoc:''}${evCode?' · '+evCode:''}${evType?' · '+evType:''}
                  </div>
                </div>
                ${rank!=null?`<div style="text-align:right;font-family:var(--mono);font-size:.72rem;color:var(--accent)">#${rank}</div>`:''}
              </div>
              <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.3rem">
                ${wlt?`<span style="background:var(--bg2);padding:1px 5px;border-radius:3px;font-size:.68rem;font-family:var(--mono);color:var(--text2)">${wlt}</span>`:''}
                ${played!=null?`<span style="background:var(--bg2);padding:1px 5px;border-radius:3px;font-size:.68rem;font-family:var(--mono);color:var(--text2)">${played} matches</span>`:''}
                ${rp!=null?`<span style="background:var(--bg2);padding:1px 5px;border-radius:3px;font-size:.68rem;font-family:var(--mono);color:var(--text2)">RP ${rp.toFixed(2)}/match</span>`:''}
                ${npOpr!=null?`<span style="background:var(--bg2);padding:1px 5px;border-radius:3px;font-size:.68rem;font-family:var(--mono);color:var(--accent2)">npOPR ${npOpr.toFixed(1)}</span>`:''}
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  document.getElementById('tp-body').innerHTML=`
    <div style="margin-bottom:.75rem">
      <div style="font-size:1.1rem;font-weight:700">${rank?.teamName||window._teamNames?.[teamNum]||'Team '+teamNum}</div>
      <div style="font-size:.73rem;font-family:var(--mono);color:var(--text2)">#${teamNum} · <a href="https://ftcscout.org/teams/${teamNum}" target="_blank" style="color:var(--accent2)">FTCScout ↗</a></div>
    </div>

    <div class="stat-grid stat-grid-3" style="margin-bottom:${scores.length?'.6rem':'1rem'}">
      <div class="stat-box"><div class="stat-value" style="font-size:1rem">#${rank?.rank??'--'}</div><div class="stat-label">Rank</div></div>
      <div class="stat-box"><div class="stat-value" style="font-size:1rem">${wins}-${played.length-wins}</div><div class="stat-label">W-L</div></div>
      <div class="stat-box"><div class="stat-value" style="font-size:1rem">${rank?.sortOrder1?.toFixed(3)??'--'}</div><div class="stat-label">RP Avg</div></div>
    </div>

    ${scores.length?`<div class="stat-grid stat-grid-3" style="margin-bottom:1rem">
      <div class="stat-box"><div class="stat-value" style="font-size:1rem">${avgTotal}</div><div class="stat-label">Avg Score</div></div>
      <div class="stat-box"><div class="stat-value" style="font-size:1rem">${avgAuto}</div><div class="stat-label">Avg Auto</div></div>
      <div class="stat-box"><div class="stat-value" style="font-size:1rem">${highScore}</div><div class="stat-label">High Score</div></div>
    </div>`:''}

    ${ftcHtml}

    <div class="form-label" style="margin-bottom:.4rem">Alliance Flag</div>
    <div class="flag-row" style="margin-bottom:1rem" id="tp-flags">
      <button class="flag-btn target ${flag==='target'?'active':''}" data-flag="target">🎯 Target</button>
      <button class="flag-btn neutral ${flag==='neutral'?'active':''}" data-flag="neutral">— Neutral</button>
      <button class="flag-btn dnp ${flag==='dnp'?'active':''}" data-flag="dnp">🚫 DnP</button>
    </div>

    ${played.length?`<div class="form-label" style="margin-bottom:.25rem">Match Results at This Event</div>${matchRows}<div style="height:.5rem"></div>`:''}

    <div class="form-label" style="margin-bottom:.25rem">Scouting Notes (${notes.length})</div>
    ${notes.length?`<div class="stat-grid" style="margin-bottom:.5rem">
      <div class="stat-box"><div class="stat-value" style="font-size:.9rem">${avg('auto_score')}</div><div class="stat-label">Avg Auto</div></div>
      <div class="stat-box"><div class="stat-value" style="font-size:.9rem">${avg('teleop_score')}</div><div class="stat-label">Avg Teleop</div></div>
    </div>`:''}
    ${noteHtml}
    ${historyHtml}
    <button class="btn btn-secondary btn-block" style="margin-top:1rem" onclick="
      document.querySelectorAll('.modal').forEach(el=>el.remove());
      navigateTo('scouting');
      setTimeout(()=>{
        const inp=document.getElementById('sc-team');
        if(inp){inp.value='${teamNum}';inp.dispatchEvent(new Event('input'));}
      },400);">+ Add Scouting Note for ${teamNum}</button>
  `;

  document.querySelectorAll('#tp-flags .flag-btn').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      await API.setFlag(teamNum,btn.dataset.flag).catch(()=>{});
      document.querySelectorAll('#tp-flags .flag-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      showToast('Flag updated');
    });
  });
}
