async function alliance() {
  if (!appSettings.active_event_code) { noEventPage(); return; }
  loadingPage();

  const season = appSettings.active_season || 2025;
  const [rankData, schedData, scoutData, flagData, oprData] = await Promise.all([
    API.getRankings().catch(()=>null),
    API.getSchedule('qual').catch(()=>null),
    API.getScouting().catch(()=>[]),
    API.getFlags().catch(()=>({})),
    API.ftcscoutEventOprs(appSettings.active_event_code, season).catch(()=>null),
  ]);
  if (currentPage !== 'alliance') return;  // stale fetch — user navigated away

  const rankings = rankData?.rankings || rankData?.Rankings || [];
  const schedule = schedData?.schedule || [];
  const notes    = Array.isArray(scoutData) ? scoutData : [];

  // Build FTCScout OPR map
  const ftcOprMap = {};
  if (oprData && Array.isArray(oprData.oprList)) {
    oprData.oprList.forEach(t => {
      if (t.teamNumber) {
        ftcOprMap[t.teamNumber] = {
          total:   t.opr    || 0,
          auto:    t.autoOpr || 0,
          teleop:  t.dcOpr   || 0,
          endgame: t.egOpr   || 0,
        };
      }
    });
  }

  const scoutMap = {};
  notes.forEach(n=>{ if(!scoutMap[n.team_number]) scoutMap[n.team_number]=[]; scoutMap[n.team_number].push(n); });

  const avg = (arr,f) => arr?.length ? arr.reduce((a,n)=>a+(n[f]||0),0)/arr.length : null;

  // Compute per-team stats from schedule
  const schedStats = {};
  schedule.filter(m=>m.scoreRedFinal!==null).forEach(m=>{
    [...(m.teams||[])].forEach(t=>{
      if (!schedStats[t.teamNumber]) schedStats[t.teamNumber]={scores:[],autos:[],wins:0,played:0};
      const a   = t.station?.startsWith('Red')?'Red':'Blue';
      const s   = a==='Red'?m.scoreRedFinal:m.scoreBlueFinal;
      const au  = a==='Red'?(m.scoreRedAuto||0):(m.scoreBlueAuto||0);
      const won = a==='Red'?m.redWins:m.blueWins;
      schedStats[t.teamNumber].scores.push(s);
      schedStats[t.teamNumber].autos.push(au);
      if (won) schedStats[t.teamNumber].wins++;
      schedStats[t.teamNumber].played++;
    });
  });

  const avgStat = (num,arr) => arr?.length ? Math.round(arr.reduce((a,v)=>a+v,0)/arr.length) : null;

  const teams = rankings.map(r => {
    const ns   = scoutMap[r.teamNumber]||[];
    const ss   = schedStats[r.teamNumber]||{scores:[],autos:[],wins:0,played:0};
    const flag = (flagData[r.teamNumber]||{}).flag||'neutral';
    const opr  = ftcOprMap[r.teamNumber] || null;
    return {
      num:r.teamNumber, name:r.teamName||'', rank:r.rank,
      wins:r.wins, losses:r.losses,
      rp:r.sortOrder1, avgSO2:r.sortOrder2,
      avgScore: avgStat(r.teamNumber, ss.scores),
      avgAuto:  avgStat(r.teamNumber, ss.autos),
      highScore: ss.scores.length?Math.max(...ss.scores):null,
      scoutAvgAuto:   avg(ns,'auto_score'),
      scoutAvgTeleop: avg(ns,'teleop_score'),
      scoutAvgEnd:    avg(ns,'endgame_score'),
      notes: ns.length, notesList: ns, flag,
      oprTotal: opr?.total || null,
      oprAuto: opr?.auto || null,
      oprTeleop: opr?.teleop || null,
      oprEndgame: opr?.endgame || null,
    };
  });

  renderPage(`
    <div class="page-title">Alliance</div>
    <div class="tabs">
      <button class="tab active" id="tab-pick">Pick List</button>
      <button class="tab" id="tab-cmp">Compare</button>
    </div>
    <div id="alliance-content"></div>`);

  document.getElementById('tab-pick').addEventListener('click',()=>{ setActiveTab('tab-pick'); renderPickList(teams); });
  document.getElementById('tab-cmp').addEventListener('click', ()=>{ setActiveTab('tab-cmp');  renderCompare(teams); });
  renderPickList(teams);
}

function renderPickList(teams) {
  const cats = flagCats();
  const us   = teams.filter(t=>t.num==TEAM_NUMBER);
  const byCat = {};
  cats.forEach(c=>{ byCat[c.key] = teams.filter(t=>t.flag===c.key && t.num!=TEAM_NUMBER); });
  const unflagged = teams.filter(t=>t.num!=TEAM_NUMBER && !cats.some(c=>c.key===t.flag));

  const teamRow = t => {
    const cat  = flagCat(t.flag);
    const icon = cat ? flagIcon(cat) : '';
    let notePreview = '';
    if (t.notesList && t.notesList.length) {
      const latest = t.notesList[0];
      const s = parseScoutNotes(latest);
      const parts = Object.entries(s)
        .filter(([k,v]) => v != null && v !== '' && !LEGACY_SCOUT_KEYS.includes(k))
        .map(([k,v]) => `${escHtml(scoutFieldLabel(k))}: ${escHtml(String(v))}`);
      if (!parts.length && latest.notes) parts.push(escHtml(latest.notes));
      if (parts.length) {
        const preview = parts.join(' · ');
        notePreview = `<div style="font-size:.64rem;color:var(--text2);margin-top:.2rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">${preview.length>130?preview.slice(0,130)+'…':preview}</div>`;
      }
    }
    return `
      <div class="match-row ${t.num==TEAM_NUMBER?'our-match':''}" onclick="openTeamModal(${t.num})">
        <div class="match-num">#${t.rank}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.85rem">${icon} ${t.num} <span style="color:var(--text2);font-weight:400;font-size:.75rem">${t.name}</span></div>
          <div style="font-size:.67rem;font-family:var(--mono);color:var(--text2)">
            ${t.wins}W · RP ${t.rp?.toFixed(3)||'--'} · Avg ${t.avgScore??'--'} · Auto ${t.avgAuto??'--'}${t.oprTotal!=null?' · OPR '+t.oprTotal.toFixed(1):''}${t.notes?' · '+t.notes+' notes':''}
          </div>
          ${notePreview}
        </div>
        <div style="display:flex;gap:.3rem;flex-direction:column;align-items:flex-end;flex-shrink:0">
          ${cats.map(c=>flagBtnHtml(c, t.flag===c.key, t.num, true)).join('')}
        </div>
      </div>`;
  };

  let html = '';
  if (us.length) html += `<div class="section-label" style="color:var(--accent)">Your Team</div>${us.map(teamRow).join('')}`;
  cats.forEach(c=>{
    const list = byCat[c.key];
    if (list.length) html += `<div class="section-label" style="color:${c.color};margin-top:.75rem">${flagIcon(c)} ${escHtml(c.label)} (${list.length})</div>${list.map(teamRow).join('')}`;
  });
  html += `<div class="section-label" style="margin-top:.75rem">All Teams — tap to view profile</div>${unflagged.map(teamRow).join('')}`;

  document.getElementById('alliance-content').innerHTML = html;

  document.querySelectorAll('.flag-btn[data-flag]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const newFlag = btn.classList.contains('active')?'neutral':btn.dataset.flag;
      await API.setFlag(btn.dataset.team, newFlag).catch(()=>{});
      showToast('Flag updated');
      alliance();
    });
  });
}

function renderCompare(teams) {
  let selected = [];
  document.getElementById('alliance-content').innerHTML = `
    <div class="card">
      <div class="form-label" style="margin-bottom:.5rem">Search and add up to 3 teams to compare</div>
      <div class="form-group" style="margin-bottom:.5rem">
        <input class="form-input" id="cmp-search" placeholder="Type team number or name…" autocomplete="off"/>
        <div id="cmp-search-results"></div>
      </div>
      <div id="cmp-chips" style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.75rem"></div>
      <div id="cmp-grid" style="display:flex;gap:.5rem;overflow-x:auto"></div>
    </div>`;

  const searchEl = document.getElementById('cmp-search');
  const resultsEl = document.getElementById('cmp-search-results');

  searchEl.addEventListener('input', () => {
    const q = searchEl.value.trim().toLowerCase();
    if (!q) { resultsEl.innerHTML = ''; return; }
    const hits = teams
      .filter(t => String(t.num).includes(q) || t.name.toLowerCase().includes(q))
      .slice(0, 8);
    resultsEl.innerHTML = hits.map(t => `
      <div class="team-search-result" data-num="${t.num}">
        <div><span class="t-num">${t.num}</span> <span class="t-name">${t.name}</span></div>
        <div style="font-size:.65rem;font-family:var(--mono);color:var(--text3)">#${t.rank} · ${t.wins}W-${t.losses}L · RP ${t.rp?.toFixed(3)||'--'}</div>
      </div>`).join('') || '<div style="color:var(--text3);font-size:.82rem;padding:.5rem">No results</div>';
  });

  resultsEl.addEventListener('click', e => {
    const row = e.target.closest('.team-search-result'); if (!row) return;
    const num = parseInt(row.dataset.num);
    if (!num || selected.includes(num) || selected.length >= 3) {
      searchEl.value = ''; resultsEl.innerHTML = ''; return;
    }
    selected.push(num);
    searchEl.value = ''; resultsEl.innerHTML = '';
    buildCmpGrid(teams, selected);
  });

  function buildCmpGrid(teams, sel) {
    document.getElementById('cmp-chips').innerHTML = sel.map(n=>`
      <span style="background:var(--bg3);border:1px solid var(--border);border-radius:100px;padding:2px 10px;font-size:.73rem;font-family:var(--mono);cursor:pointer" data-rm="${n}">${n} ✕</span>`).join('');
    document.querySelectorAll('[data-rm]').forEach(c=>{ c.addEventListener('click',()=>{ selected=selected.filter(n=>n!=c.dataset.rm); buildCmpGrid(teams,selected); }); });

    if (!sel.length) { document.getElementById('cmp-grid').innerHTML='<div style="color:var(--text3);font-size:.83rem">Select teams above</div>'; return; }

    // Find best values among selected teams for highlighting
    const selTeams = sel.map(num => teams.find(x => x.num == num)).filter(Boolean);

    function bestVal(metric, higher = true) {
      const vals = selTeams.map(t => t[metric]).filter(v => v != null);
      if (!vals.length) return null;
      return higher ? Math.max(...vals) : Math.min(...vals);
    }

    // Green = best, Blue = not best
    function highlight(val, metric, higher = true) {
      if (val == null || selTeams.length < 2) return 'var(--accent2)';
      const b = bestVal(metric, higher);
      if (b == null) return 'var(--accent2)';
      return val >= b && higher ? 'var(--green)' : val <= b && !higher ? 'var(--green)' : 'var(--accent2)';
    }

    document.getElementById('cmp-grid').innerHTML = sel.map(num=>{
      const t=teams.find(x=>x.num==num); if(!t) return '';
      const f1=v=>v!=null?v.toFixed(1):'--';

      let scoutSummary = '';
      if (t.notesList && t.notesList.length) {
        const latest = t.notesList[0];
        const s = parseScoutNotes(latest);
        const parts = Object.entries(s)
          .filter(([k,v]) => v != null && v !== '' && !LEGACY_SCOUT_KEYS.includes(k))
          .slice(0,3)
          .map(([k,v]) => `${escHtml(scoutFieldLabel(k))}: ${escHtml(String(v))}`);
        if (parts.length) scoutSummary = `<div style="font-size:.58rem;color:var(--text2);margin-top:.3rem;white-space:pre-wrap;text-align:left">${parts.join('\n').slice(0,80)}</div>`;
      }
      return `
        <div class="compare-col" style="min-width:105px;cursor:pointer" onclick="openTeamModal(${t.num})">
          <div class="compare-team-num">${t.num}</div>
          <div class="compare-team-name">#${t.rank} · ${t.name}</div>
          <div class="compare-stat"><div class="compare-stat-val" style="color:${highlight(t.rp,'rp')}">${t.rp?.toFixed(3)||'--'}</div><div class="compare-stat-lbl">RP Avg</div></div>
          <div class="compare-stat"><div class="compare-stat-val" style="color:${highlight(t.avgScore,'avgScore')}">${t.avgScore??'--'}</div><div class="compare-stat-lbl">Avg Score</div></div>
          <div class="compare-stat"><div class="compare-stat-val" style="color:${highlight(t.avgAuto,'avgAuto')}">${t.avgAuto??'--'}</div><div class="compare-stat-lbl">Avg Auto</div></div>
          <div class="compare-stat"><div class="compare-stat-val" style="color:${highlight(t.highScore,'highScore')}">${t.highScore??'--'}</div><div class="compare-stat-lbl">High Score</div></div>
          <div class="compare-stat"><div class="compare-stat-val" style="color:${highlight(t.wins,'wins')}">${t.wins}-${t.losses}</div><div class="compare-stat-lbl">W-L</div></div>
          <div class="compare-stat"><div class="compare-stat-val" style="color:${highlight(t.oprTotal,'oprTotal')}">${t.oprTotal!=null?t.oprTotal.toFixed(1):'--'}</div><div class="compare-stat-lbl">OPR Total</div></div>
          <div class="compare-stat"><div class="compare-stat-val" style="color:${highlight(t.oprAuto,'oprAuto')}">${t.oprAuto!=null?t.oprAuto.toFixed(1):'--'}</div><div class="compare-stat-lbl">OPR Auto</div></div>
          <div class="compare-stat"><div class="compare-stat-val" style="color:${highlight(t.oprTeleop,'oprTeleop')}">${t.oprTeleop!=null?t.oprTeleop.toFixed(1):'--'}</div><div class="compare-stat-lbl">OPR Teleop</div></div>
          <div class="compare-stat"><div class="compare-stat-val" style="color:${highlight(t.oprEndgame,'oprEndgame')}">${t.oprEndgame!=null?t.oprEndgame.toFixed(1):'--'}</div><div class="compare-stat-lbl">OPR Endgame</div></div>
          <div class="compare-stat"><div class="compare-stat-val">${t.notes}</div><div class="compare-stat-lbl">Scout Notes</div></div>
          ${scoutSummary}
          <div class="flag-row" style="margin-top:.75rem;flex-wrap:wrap;justify-content:center">
            ${flagCats().map(c=>flagBtnHtml(c, t.flag===c.key, t.num, true)).join('')}
          </div>
        </div>`;
    }).join('');

    document.querySelectorAll('#cmp-grid .flag-btn').forEach(btn=>{
      btn.addEventListener('click', async e=>{
        e.stopPropagation();
        const nf=btn.classList.contains('active')?'neutral':btn.dataset.flag;
        await API.setFlag(btn.dataset.team,nf).catch(()=>{});
        showToast('Flag updated');
        buildCmpGrid(teams,selected);
      });
    });
  }
}
