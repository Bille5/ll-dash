async function alliance() {
  if (!appSettings.active_event_code) { noEventPage(); return; }
  loadingPage();

  const [rankData, schedData, scoutData, flagData] = await Promise.all([
    API.getRankings().catch(()=>null),
    API.getSchedule('qual').catch(()=>null),
    API.getScouting().catch(()=>[]),
    API.getFlags().catch(()=>({})),
  ]);

  const rankings = rankData?.rankings || rankData?.Rankings || [];
  const schedule = schedData?.schedule || [];
  const notes    = Array.isArray(scoutData) ? scoutData : [];

  const scoutMap = {};
  notes.forEach(n=>{ if(!scoutMap[n.team_number]) scoutMap[n.team_number]=[]; scoutMap[n.team_number].push(n); });

  const avg = (arr,f) => arr?.length ? arr.reduce((a,n)=>a+(n[f]||0),0)/arr.length : null;
  const f1  = v => v!=null ? v.toFixed(1) : '--';

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
      notes: ns.length, flag,
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
  const us      = teams.filter(t=>t.num==TEAM_NUMBER);
  const targets = teams.filter(t=>t.flag==='target'&&t.num!=TEAM_NUMBER);
  const neutral = teams.filter(t=>t.flag==='neutral'&&t.num!=TEAM_NUMBER);
  const dnp     = teams.filter(t=>t.flag==='dnp'   &&t.num!=TEAM_NUMBER);

  const teamRow = t => {
    const icon = t.flag==='target'?'🎯':t.flag==='dnp'?'🚫':'';
    return `
      <div class="match-row ${t.num==TEAM_NUMBER?'our-match':''}" onclick="openTeamModal(${t.num})">
        <div class="match-num">#${t.rank}</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:.85rem">${icon} ${t.num} <span style="color:var(--text2);font-weight:400;font-size:.75rem">${t.name}</span></div>
          <div style="font-size:.67rem;font-family:var(--mono);color:var(--text2)">
            ${t.wins}W · RP ${t.rp?.toFixed(3)||'--'} · Avg ${t.avgScore??'--'} · Auto ${t.avgAuto??'--'}${t.notes?' · '+t.notes+' notes':''}
          </div>
        </div>
        <div style="display:flex;gap:.3rem;flex-direction:column;align-items:flex-end">
          <button class="flag-btn target btn-sm ${t.flag==='target'?'active':''}" data-flag="target" data-team="${t.num}" style="flex:unset;padding:.2rem .4rem" onclick="event.stopPropagation()">🎯</button>
          <button class="flag-btn dnp btn-sm ${t.flag==='dnp'?'active':''}" data-flag="dnp" data-team="${t.num}" style="flex:unset;padding:.2rem .4rem" onclick="event.stopPropagation()">🚫</button>
        </div>
      </div>`;
  };

  let html = '';
  if (us.length)      html += `<div class="section-label" style="color:var(--accent)">Your Team</div>${us.map(teamRow).join('')}`;
  if (targets.length) html += `<div class="section-label" style="color:var(--green);margin-top:.75rem">🎯 Targets (${targets.length})</div>${targets.map(teamRow).join('')}`;
  html += `<div class="section-label" style="margin-top:.75rem">All Teams — tap to view profile</div>${neutral.map(teamRow).join('')}`;
  if (dnp.length)     html += `<div class="section-label" style="color:var(--red);margin-top:.75rem">🚫 Do Not Pick (${dnp.length})</div>${dnp.map(teamRow).join('')}`;

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
  const opts = teams.map(t=>`<option value="${t.num}">${t.num} — ${t.name||''} (#${t.rank})</option>`).join('');
  document.getElementById('alliance-content').innerHTML = `
    <div class="card">
      <div class="form-label">Select up to 3 teams to compare</div>
      <select class="form-select" id="cmp-sel" style="margin-bottom:.75rem">
        <option value="">Add a team…</option>${opts}
      </select>
      <div id="cmp-chips" style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.75rem"></div>
      <div id="cmp-grid" style="display:flex;gap:.5rem;overflow-x:auto"></div>
    </div>`;

  document.getElementById('cmp-sel').addEventListener('change', e => {
    const num=parseInt(e.target.value);
    if (!num||selected.includes(num)||selected.length>=3){e.target.value='';return;}
    selected.push(num); e.target.value='';
    buildCmpGrid(teams, selected);
  });

  function buildCmpGrid(teams, sel) {
    document.getElementById('cmp-chips').innerHTML = sel.map(n=>`
      <span style="background:var(--bg3);border:1px solid var(--border);border-radius:100px;padding:2px 10px;font-size:.73rem;font-family:var(--mono);cursor:pointer" data-rm="${n}">${n} ✕</span>`).join('');
    document.querySelectorAll('[data-rm]').forEach(c=>{ c.addEventListener('click',()=>{ selected=selected.filter(n=>n!=c.dataset.rm); buildCmpGrid(teams,selected); }); });

    if (!sel.length) { document.getElementById('cmp-grid').innerHTML='<div style="color:var(--text3);font-size:.83rem">Select teams above</div>'; return; }

    document.getElementById('cmp-grid').innerHTML = sel.map(num=>{
      const t=teams.find(x=>x.num==num); if(!t) return '';
      const f1=v=>v!=null?v.toFixed(1):'--';
      const best = (metric, all) => {
        const vals = all.filter(x=>x.num!=TEAM_NUMBER).map(x=>x[metric]).filter(v=>v!=null);
        return vals.length ? Math.max(...vals) : null;
      };
      const highlight = (val, metric) => {
        if (val==null) return 'var(--accent2)';
        const b = best(metric, teams.filter(x=>sel.includes(x.num)));
        return val>=b ? 'var(--green)' : 'var(--accent2)';
      };
      return `
        <div class="compare-col" style="min-width:100px;cursor:pointer" onclick="openTeamModal(${t.num})">
          <div class="compare-team-num">${t.num}</div>
          <div class="compare-team-name">#${t.rank} · ${t.name}</div>
          <div class="compare-stat"><div class="compare-stat-val" style="color:${highlight(t.rp,'rp')}">${t.rp?.toFixed(3)||'--'}</div><div class="compare-stat-lbl">RP Avg</div></div>
          <div class="compare-stat"><div class="compare-stat-val" style="color:${highlight(t.avgScore,'avgScore')}">${t.avgScore??'--'}</div><div class="compare-stat-lbl">Avg Score</div></div>
          <div class="compare-stat"><div class="compare-stat-val" style="color:${highlight(t.avgAuto,'avgAuto')}">${t.avgAuto??'--'}</div><div class="compare-stat-lbl">Avg Auto</div></div>
          <div class="compare-stat"><div class="compare-stat-val">${t.highScore??'--'}</div><div class="compare-stat-lbl">High Score</div></div>
          <div class="compare-stat"><div class="compare-stat-val">${t.wins}-${t.losses}</div><div class="compare-stat-lbl">W-L</div></div>
          <div class="compare-stat"><div class="compare-stat-val">${t.notes}</div><div class="compare-stat-lbl">Scout Notes</div></div>
          <div class="flag-row" style="margin-top:.75rem">
            <button class="flag-btn target btn-sm ${t.flag==='target'?'active':''}" data-flag="target" data-team="${t.num}" onclick="event.stopPropagation()">🎯</button>
            <button class="flag-btn dnp btn-sm ${t.flag==='dnp'?'active':''}" data-flag="dnp" data-team="${t.num}" onclick="event.stopPropagation()">🚫</button>
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
