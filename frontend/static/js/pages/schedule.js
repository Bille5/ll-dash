async function schedule() {
  if (!appSettings.active_event_code) { noEventPage(); return; }
  loadingPage();

  const season = appSettings.active_season || 2025;
  const [schedData, rankData, oprResult] = await Promise.all([
    API.getSchedule('qual').catch(()=>null),
    API.getRankings().catch(()=>null),
    API.ftcscoutEventOprs(appSettings.active_event_code, season).catch(()=>null),
  ]);

  const matches  = schedData?.schedule || [];
  const rankings = rankData?.rankings || rankData?.Rankings || [];
  const rankMap  = Object.fromEntries(rankings.map(r=>[r.teamNumber,r]));
  rankings.forEach(r=>{window._teamNames=window._teamNames||{};window._teamNames[r.teamNumber]=r.teamName||'';});

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

  if (!matches.length) {
    renderPage('<div class="empty-state"><div class="empty-icon">◷</div><div>No schedule yet.</div></div>');
    return;
  }

  // Store for match detail modal
  window._scheduleData = matches;
  window._schedRankMap = rankMap;

  renderPage(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.25rem">
      <div class="page-title" style="margin-bottom:0">Schedule</div>
      <button class="icon-btn" onclick="schedule()" title="Reload">↻</button>
    </div>
    <div class="tabs" style="margin-bottom:.5rem">
      <button class="tab active" id="tab-all">All</button>
      <button class="tab" id="tab-ours">Ours</button>
      <button class="tab" id="tab-upcoming">Upcoming</button>
    </div>
    <div id="sched-list"></div>`);

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
    return { winner, confidence, redOPR, blueOPR };
  }

  function teamLabel(t, alliance) {
    const isOurs = t.teamNumber == TEAM_NUMBER;
    const name = window._teamNames?.[t.teamNumber] || '';
    const shortName = name.length > 12 ? name.slice(0,11) + '…' : name;
    const chip = `<span class="team-chip ${alliance}${isOurs?' our clickable-chip':' clickable-chip'}" data-team="${t.teamNumber}"
      style="${isOurs?'font-weight:800;border-width:2px':''}">
      ${isOurs?`<strong>${t.teamNumber}</strong>`:t.teamNumber}${shortName ? `<span style="font-size:.58rem;opacity:.7;margin-left:2px">${shortName}</span>` : ''}
    </span>`;
    return chip;
  }

  function renderMatches(list) {
    if (!list.length) {
      document.getElementById('sched-list').innerHTML='<div class="empty-state" style="padding:2rem 0"><div>No matches.</div></div>';
      return;
    }
    document.getElementById('sched-list').innerHTML = list.map(m => {
      const isOurs = m.teams?.some(t=>t.teamNumber==TEAM_NUMBER);
      const played = m.scoreRedFinal !== null;
      const red    = (m.teams||[]).filter(t=>t.station?.startsWith('Red'));
      const blue   = (m.teams||[]).filter(t=>t.station?.startsWith('Blue'));

      const fieldNum = m.series != null ? `Field ${m.series + 1}` : '';

      let scoreHtml, winBadge='';
      if (played) {
        if (isOurs) {
          const ourA = m.teams.find(t=>t.teamNumber==TEAM_NUMBER)?.station?.startsWith('Red')?'Red':'Blue';
          const won  = ourA==='Red'?m.redWins:m.blueWins;
          winBadge   = `<span style="font-size:.68rem;font-weight:800;color:${won?'var(--green)':'var(--red)'}"> ${won?'W':'L'}</span>`;
        }
        scoreHtml=`
          <div class="match-score">
            <div class="red-score" style="${m.redWins?'font-weight:800;font-size:1rem':''}">${m.scoreRedFinal}</div>
            <div class="blue-score" style="${m.blueWins?'font-weight:800;font-size:1rem':''}">${m.scoreBlueFinal}</div>
          </div>`;
      } else {
        scoreHtml=`<div class="match-time">${formatTime(m.startTime)}</div>`;
      }

      // OPR prediction for all matches
      let predLine = '';
      if (Object.keys(oprMap).length) {
        const pred = predictMatch(m);
        const predColor = pred.winner === 'Red' ? '#ff8a94' : pred.winner === 'Blue' ? 'var(--accent2)' : 'var(--yellow)';
        predLine = `<span style="color:${predColor};font-weight:700">${pred.winner === 'Tie' ? 'Toss-up' : pred.winner + ' favored'}</span>
          <span>${pred.confidence}%</span>
          <span style="font-size:.6rem">OPR <span style="color:#ff8a94">${pred.redOPR.toFixed(0)}</span> v <span style="color:var(--accent2)">${pred.blueOPR.toFixed(0)}</span></span>`;
      }

      const subStats = played
        ? `<div class="match-sub-stats">
            <span>Auto R:${m.scoreRedAuto??'?'} B:${m.scoreBlueAuto??'?'}</span>
            ${(m.scoreRedFoul||m.scoreBlueFoul)?`<span>Fouls R:${m.scoreRedFoul} B:${m.scoreBlueFoul}</span>`:''}
            ${fieldNum?`<span>${fieldNum}</span>`:''}
           </div>
           ${predLine ? `<div class="match-sub-stats">${predLine}</div>` : ''}`
        : `<div class="match-sub-stats">
            ${fieldNum?`<span>${fieldNum}</span>`:''}
            ${predLine}
           </div>`;

      return `
        <div class="match-row ${isOurs?'our-match':''}" onclick="openMatchDetail(${m.matchNumber})" style="cursor:pointer">
          <div class="match-num">Q${m.matchNumber}${winBadge}</div>
          <div class="match-alliances" style="flex:1">
            <div class="alliance-teams">${red.map(t=>teamLabel(t,'red')).join('')}</div>
            <div class="alliance-teams">${blue.map(t=>teamLabel(t,'blue')).join('')}</div>
            ${subStats}
          </div>
          ${scoreHtml}
        </div>`;
    }).join('');
    bindTeamClicks(rankings);
  }

  let currentFilter = 'all';
  function getFilteredList() {
    if (currentFilter === 'ours') return matches.filter(m=>m.teams?.some(t=>t.teamNumber==TEAM_NUMBER));
    if (currentFilter === 'upcoming') return matches.filter(m=>m.scoreRedFinal===null);
    return matches;
  }

  renderMatches(matches);

  document.getElementById('tab-all').addEventListener('click', ()=>{ currentFilter='all'; setActiveTab('tab-all'); renderMatches(getFilteredList()); });
  document.getElementById('tab-ours').addEventListener('click', ()=>{ currentFilter='ours'; setActiveTab('tab-ours'); renderMatches(getFilteredList()); });
  document.getElementById('tab-upcoming').addEventListener('click', ()=>{ currentFilter='upcoming'; setActiveTab('tab-upcoming'); renderMatches(getFilteredList()); });

}

function openMatchDetail(matchNumber) {
  const m = window._scheduleData?.find(x=>x.matchNumber===matchNumber);
  if (!m) return;
  const rankMap = window._schedRankMap || {};
  const red   = (m.teams||[]).filter(t=>t.station?.startsWith('Red'));
  const blue  = (m.teams||[]).filter(t=>t.station?.startsWith('Blue'));
  const played= m.scoreRedFinal !== null;
  const fieldNum = m.series != null ? `Field ${m.series + 1}` : '';

  const teamDetailRow = (t, alliance) => {
    const r   = rankMap[t.teamNumber];
    const ours= t.teamNumber == TEAM_NUMBER;
    return `
      <div style="display:flex;align-items:center;gap:.6rem;padding:.5rem 0;border-bottom:1px solid var(--border);cursor:pointer"
           onclick="openTeamModal(${t.teamNumber})">
        <span class="team-chip ${alliance}${ours?' our':''}" style="${ours?'font-weight:800;border-width:2px':''}">
          ${ours?`<strong>${t.teamNumber}</strong>`:t.teamNumber}
        </span>
        <div style="flex:1">
          <div style="font-size:.85rem;font-weight:${ours?800:600}">${t.teamName||window._teamNames?.[t.teamNumber]||t.teamNumber}</div>
          <div style="font-size:.67rem;font-family:var(--mono);color:var(--text2)">
            ${t.station||''}${t.surrogate?' · surrogate':''}${t.dq?' · DQ':''}
          </div>
        </div>
        ${r?`<div style="text-align:right;font-family:var(--mono);font-size:.72rem;color:var(--text2)">#${r.rank}<br>${r.wins}W-${r.losses}L<br>RP ${r.sortOrder1?.toFixed(3)}</div>`:''}
      </div>`;
  };

  const modal = document.createElement('div');
  modal.className='modal';
  modal.innerHTML=`
    <div class="modal-backdrop" id="md-back"></div>
    <div class="modal-sheet">
      <div class="modal-header">
        <div>
          <span class="modal-title">Q${m.matchNumber}</span>
          ${fieldNum?`<span style="font-size:.72rem;font-family:var(--mono);color:var(--text2);margin-left:.5rem">${fieldNum}</span>`:''}
        </div>
        <button class="modal-close" id="md-close">✕</button>
      </div>
      <div class="modal-body">
        ${played ? `
        <div class="stat-grid" style="margin-bottom:1rem">
          <div class="stat-box" style="border-color:rgba(255,71,87,.3)">
            <div style="font-size:.65rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#ff8a94;font-family:var(--mono);margin-bottom:.3rem">Red Alliance</div>
            <div class="stat-value" style="color:#ff8a94;font-size:2.2rem">${m.scoreRedFinal}</div>
            <div style="font-size:.72rem;font-family:var(--mono);color:var(--text2);margin-top:.3rem">
              Auto: ${m.scoreRedAuto??'?'} · Foul: ${m.scoreRedFoul??0}
            </div>
            ${m.redWins?'<div style="font-size:.75rem;color:var(--green);font-weight:800;margin-top:.25rem">✓ WINNER</div>':''}
          </div>
          <div class="stat-box" style="border-color:rgba(71,200,255,.3)">
            <div style="font-size:.65rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent2);font-family:var(--mono);margin-bottom:.3rem">Blue Alliance</div>
            <div class="stat-value" style="color:var(--accent2);font-size:2.2rem">${m.scoreBlueFinal}</div>
            <div style="font-size:.72rem;font-family:var(--mono);color:var(--text2);margin-top:.3rem">
              Auto: ${m.scoreBlueAuto??'?'} · Foul: ${m.scoreBlueFoul??0}
            </div>
            ${m.blueWins?'<div style="font-size:.75rem;color:var(--green);font-weight:800;margin-top:.25rem">✓ WINNER</div>':''}
          </div>
        </div>` : `
        <div class="card" style="text-align:center;margin-bottom:1rem">
          <div style="font-size:.85rem;color:var(--text2);font-family:var(--mono)">Scheduled: ${formatTime(m.startTime)}</div>
          ${fieldNum?`<div style="font-size:.75rem;color:var(--accent2);margin-top:.25rem">${fieldNum}</div>`:''}
          <div style="font-size:.7rem;color:var(--text3);margin-top:.3rem">Match not yet played</div>
        </div>`}

        <div style="margin-bottom:.75rem">
          <div class="section-label" style="color:#ff8a94;margin-bottom:.25rem">Red Alliance</div>
          ${red.map(t=>teamDetailRow(t,'red')).join('')}
        </div>
        <div>
          <div class="section-label" style="color:var(--accent2);margin-bottom:.25rem">Blue Alliance</div>
          ${blue.map(t=>teamDetailRow(t,'blue')).join('')}
        </div>

        ${m.actualStartTime?`<div style="margin-top:.75rem;font-size:.68rem;font-family:var(--mono);color:var(--text3)">
          Started: ${new Date(m.actualStartTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
          ${m.postResultTime?` · Posted: ${new Date(m.postResultTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`:''}
        </div>`:''}
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById('md-back').addEventListener('click', ()=>modal.remove());
  document.getElementById('md-close').addEventListener('click', ()=>modal.remove());
}
