// ── Cross-tab sync via BroadcastChannel ───────────────────────
const _scoutCh = typeof BroadcastChannel!=='undefined' ? new BroadcastChannel('ll-dash-scout') : null;
if (_scoutCh) {
  _scoutCh.onmessage = e => {
    if (e.data==='reload' && currentPage==='scouting') {
      if (document.getElementById('tab-view')?.classList.contains('active')) renderScoutNotes();
    }
  };
}
function _scoutBroadcast() { _scoutCh?.postMessage('reload'); }

window._teamNames = window._teamNames || {};

async function scouting() {
  if (!appSettings.active_event_code) { noEventPage(); return; }
  renderPage(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.25rem">
      <div class="page-title" style="margin-bottom:0">Scout</div>
      <button class="icon-btn" id="scout-reload-btn" title="Reload">↻</button>
    </div>
    <div class="tabs">
      <button class="tab active" id="tab-add">Add Note</button>
      <button class="tab" id="tab-view">View Notes</button>
      <button class="tab" id="tab-search">Find Team</button>
    </div>
    <div id="scout-content"></div>`);
  document.getElementById('tab-add').addEventListener('click',    ()=>{setActiveTab('tab-add');    renderScoutForm();});
  document.getElementById('tab-view').addEventListener('click',   ()=>{setActiveTab('tab-view');   renderScoutNotes();});
  document.getElementById('tab-search').addEventListener('click', ()=>{setActiveTab('tab-search'); renderTeamSearch();});
  document.getElementById('scout-reload-btn').addEventListener('click',()=>{
    const viewTab=document.getElementById('tab-view');
    if (viewTab?.classList.contains('active')) renderScoutNotes();
    else renderScoutForm();
    showToast('Refreshed');
  });
  renderScoutForm();
}

async function _loadRankings() {
  if (window._rankings?.length) return window._rankings;
  const d = await API.getRankings().catch(()=>null);
  window._rankings = d?.rankings||d?.Rankings||[];
  window._rankings.forEach(r=>{window._teamNames[r.teamNumber]=r.teamName||'';});
  return window._rankings;
}

async function renderScoutForm() {
  const [rankings, schedData] = await Promise.all([
    _loadRankings(),
    API.getSchedule('qual').catch(()=>null),
  ]);
  const matches  = (schedData?.schedule||[]).filter(m=>m.scoreRedFinal===null);
  const matchOpts= matches.map(m=>`<option value="${m.matchNumber}">Q${m.matchNumber} — ${formatTime(m.startTime)}</option>`).join('');

  document.getElementById('scout-content').innerHTML=`
    <div class="card">
      <div class="form-group">
        <label class="form-label">Team</label>
        <input class="form-input" id="sc-team" placeholder="Type team number or name…" autocomplete="off"/>
        <div id="sc-team-results"></div>
        <div id="sc-team-preview" style="display:none;margin-top:.4rem;padding:.4rem .75rem;background:var(--bg3);border:1px solid var(--accent);border-radius:var(--rs);font-size:.82rem;font-family:var(--mono);color:var(--accent)"></div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Your Name</label>
          <input class="form-input" id="sc-name" placeholder="Scout name…" value="${localStorage.getItem('scout_name')||''}"/>
        </div>
        <div class="form-group">
          <label class="form-label">Match (optional)</label>
          <select class="form-select" id="sc-match"><option value="">General note</option>${matchOpts}</select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Driver Rating</label>
        <div class="star-rating" id="sc-stars">${[1,2,3,4,5].map(v=>`<span class="star" data-v="${v}">★</span>`).join('')}</div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Auto Score</label><input class="form-input" id="sc-auto" type="number" inputmode="numeric" placeholder="0"/></div>
        <div class="form-group"><label class="form-label">TeleOp Score</label><input class="form-input" id="sc-teleop" type="number" inputmode="numeric" placeholder="0"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Endgame Score</label><input class="form-input" id="sc-endgame" type="number" inputmode="numeric" placeholder="0"/></div>
        <div class="form-group"><label class="form-label">Penalties</label><input class="form-input" id="sc-penalties" type="number" inputmode="numeric" placeholder="0"/></div>
      </div>
      <div class="form-group"><label class="form-label">Auto Description</label><input class="form-input" id="sc-auto-desc" placeholder="What did they score in auto?"/></div>
      <div class="form-group"><label class="form-label">Endgame Description</label><input class="form-input" id="sc-end-desc" placeholder="Level 3 hang? Park? Nothing?"/></div>
      <div class="form-group"><label class="form-label">Strengths</label><input class="form-input" id="sc-strengths" placeholder="Fast auto, consistent hang, good defense…"/></div>
      <div class="form-group"><label class="form-label">Weaknesses</label><input class="form-input" id="sc-weaknesses" placeholder="Slow teleop, fragile intake, no endgame…"/></div>
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="sc-notes" placeholder="Full observations, match strategy tips…"></textarea></div>
      <div class="form-group">
        <label class="form-label">Alliance Flag</label>
        <div class="flag-row" id="sc-flag-row">
          <button class="flag-btn neutral active" data-flag="neutral">— Neutral</button>
          <button class="flag-btn target" data-flag="target">🎯 Target</button>
          <button class="flag-btn dnp" data-flag="dnp">🚫 DnP</button>
        </div>
      </div>
      <button class="btn btn-primary btn-block" id="sc-submit">Save Scouting Note</button>
    </div>`;

  let driverRating=0, selectedFlag='neutral', selectedTeam=null;

  document.querySelectorAll('#sc-stars .star').forEach(star=>{
    star.addEventListener('click',()=>{
      driverRating=parseInt(star.dataset.v);
      document.querySelectorAll('#sc-stars .star').forEach(s=>s.classList.toggle('active',parseInt(s.dataset.v)<=driverRating));
    });
  });
  document.querySelectorAll('#sc-flag-row .flag-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      selectedFlag=btn.dataset.flag;
      document.querySelectorAll('#sc-flag-row .flag-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  const teamInput=document.getElementById('sc-team');
  const teamResults=document.getElementById('sc-team-results');
  const teamPreview=document.getElementById('sc-team-preview');

  teamInput.addEventListener('input',()=>{
    selectedTeam=null; teamPreview.style.display='none';
    const q=teamInput.value.trim().toLowerCase();
    if (!q){teamResults.innerHTML='';return;}
    const hits=rankings.filter(r=>String(r.teamNumber).includes(q)||(r.teamName||'').toLowerCase().includes(q)).slice(0,8);
    teamResults.innerHTML=hits.map(r=>`
      <div class="team-search-result" data-num="${r.teamNumber}" data-name="${(r.teamName||'').replace(/"/g,'&quot;')}">
        <div><span class="t-num">${r.teamNumber}</span> <span class="t-name">${r.teamName||''}</span></div>
        <div style="font-size:.65rem;font-family:var(--mono);color:var(--text3)">#${r.rank} · ${r.wins}W-${r.losses}L</div>
      </div>`).join('');
  });

  teamResults.addEventListener('click',e=>{
    const row=e.target.closest('.team-search-result'); if(!row) return;
    selectedTeam=parseInt(row.dataset.num);
    teamInput.value=row.dataset.num;
    teamResults.innerHTML='';
    teamPreview.innerHTML=`<strong>${row.dataset.num}</strong> — ${row.dataset.name}`;
    teamPreview.style.display='block';
  });

  document.getElementById('sc-submit').addEventListener('click',async()=>{
    const raw=teamInput.value.trim().split(/[\s—\-]/)[0];
    const teamNum=selectedTeam||parseInt(raw);
    if (!teamNum||isNaN(teamNum)){showToast('Enter a team number');return;}
    const scoutName=document.getElementById('sc-name').value.trim()||'Anonymous';
    localStorage.setItem('scout_name',scoutName);

    const strengths=document.getElementById('sc-strengths').value.trim();
    const weaknesses=document.getElementById('sc-weaknesses').value.trim();
    let combined=document.getElementById('sc-notes').value.trim();
    if (strengths) combined=(combined?combined+'\n':'')+'✓ '+strengths;
    if (weaknesses) combined=(combined?combined+'\n':'')+'✗ '+weaknesses;

    try {
      await API.addScouting({
        team_number:teamNum, scout_name:scoutName,
        match_number:document.getElementById('sc-match').value||null,
        auto_score:parseInt(document.getElementById('sc-auto').value)||null,
        teleop_score:parseInt(document.getElementById('sc-teleop').value)||null,
        endgame_score:parseInt(document.getElementById('sc-endgame').value)||null,
        penalties:parseInt(document.getElementById('sc-penalties').value)||0,
        driver_rating:driverRating||null,
        auto_description:document.getElementById('sc-auto-desc').value||null,
        endgame_description:document.getElementById('sc-end-desc').value||null,
        notes:combined||null,
      });
      if (selectedFlag!=='neutral') await API.setFlag(teamNum,selectedFlag).catch(()=>{});
      _scoutBroadcast(); // notify other tabs
      showToast('Note saved! ✓');
      ['sc-auto','sc-teleop','sc-endgame','sc-penalties','sc-auto-desc','sc-end-desc','sc-strengths','sc-weaknesses','sc-notes','sc-team'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
      document.getElementById('sc-match').selectedIndex=0;
      teamResults.innerHTML=''; teamPreview.style.display='none';
      selectedTeam=null; driverRating=0; selectedFlag='neutral';
      document.querySelectorAll('#sc-stars .star').forEach(s=>s.classList.remove('active'));
      document.querySelectorAll('#sc-flag-row .flag-btn').forEach(b=>b.classList.remove('active'));
      document.querySelector('#sc-flag-row [data-flag="neutral"]').classList.add('active');
    } catch(e){showToast('Failed to save');}
  });
}

async function renderScoutNotes() {
  document.getElementById('scout-content').innerHTML='<div class="loading">Loading</div>';
  const [notes, rankings] = await Promise.all([
    API.getScouting().catch(()=>[]),
    _loadRankings(),
  ]);
  if (!notes.length){document.getElementById('scout-content').innerHTML='<div class="empty-state"><div class="empty-icon">◉</div><div>No scouting notes yet.</div></div>';return;}

  // Group by team
  const byTeam={};
  notes.forEach(n=>{if(!byTeam[n.team_number])byTeam[n.team_number]=[];byTeam[n.team_number].push(n);});
  const avg=(arr,f)=>arr.length?(arr.reduce((a,n)=>a+(n[f]||0),0)/arr.length).toFixed(1):'--';

  document.getElementById('scout-content').innerHTML=Object.entries(byTeam).sort((a,b)=>a[0]-b[0]).map(([team,ns])=>{
    const rank=rankings.find(r=>r.teamNumber==team);
    const teamName=rank?.teamName||window._teamNames?.[team]||'';
    return `
      <div class="card">
        <div class="card-header" style="cursor:pointer" onclick="openTeamModal(${team})">
          <div>
            <span class="card-title">${team}</span>
            ${teamName?`<div style="font-size:.75rem;color:var(--text);font-weight:600;margin-top:1px">${teamName}</div>`:''}
          </div>
          <div style="text-align:right">
            ${rank?`<div style="font-size:.7rem;font-family:var(--mono);color:var(--accent)">#${rank.rank}</div>`:''}
            <div style="font-size:.65rem;color:var(--text2);font-family:var(--mono)">${ns.length} note${ns.length>1?'s':''}</div>
          </div>
        </div>
        <div class="stat-grid stat-grid-3" style="margin-bottom:.5rem">
          <div class="stat-box"><div class="stat-value" style="font-size:.95rem">${avg(ns,'auto_score')}</div><div class="stat-label">Auto</div></div>
          <div class="stat-box"><div class="stat-value" style="font-size:.95rem">${avg(ns,'teleop_score')}</div><div class="stat-label">Teleop</div></div>
          <div class="stat-box"><div class="stat-value" style="font-size:.95rem">${avg(ns,'endgame_score')}</div><div class="stat-label">Endgame</div></div>
        </div>
        ${ns.map(n=>`
          <div style="border-top:1px solid var(--border);padding:.55rem 0;display:flex;gap:.5rem">
            <div style="flex:1">
              <div style="font-size:.7rem;font-family:var(--mono);color:var(--text2);margin-bottom:.2rem">
                ${n.scout_name}${n.match_number?' · Q'+n.match_number:''}${n.driver_rating?' · '+'★'.repeat(n.driver_rating):''}
              </div>
              ${n.auto_description?`<div style="font-size:.72rem;color:var(--accent2)">Auto: ${n.auto_description}</div>`:''}
              ${n.endgame_description?`<div style="font-size:.72rem;color:var(--accent2)">End: ${n.endgame_description}</div>`:''}
              <div style="font-size:.82rem;white-space:pre-wrap;margin-top:.15rem">${n.notes||'<span style="color:var(--text3)">—</span>'}</div>
            </div>
            <button class="btn btn-sm" style="color:var(--red);padding:0 .3rem;flex-shrink:0" data-del="${n.id}">✕</button>
          </div>`).join('')}
        <button class="btn btn-secondary btn-sm btn-block" style="margin-top:.5rem" onclick="openTeamModal(${team})">View Full Profile →</button>
      </div>`;
  }).join('');

  document.querySelectorAll('[data-del]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      await API.deleteScouting(btn.dataset.del).catch(()=>{});
      _scoutBroadcast();
      showToast('Deleted');
      renderScoutNotes();
    });
  });
}

async function renderTeamSearch() {
  const rankings = await _loadRankings();
  document.getElementById('scout-content').innerHTML=`
    <div class="card">
      <div class="form-group">
        <label class="form-label">Search by Number or Name</label>
        <input class="form-input" id="ts-input" placeholder="Type team number or name…" autocomplete="off"/>
      </div>
      <div id="ts-results"></div>
    </div>`;
  document.getElementById('ts-input').addEventListener('input',e=>{
    const q=e.target.value.trim().toLowerCase();
    if (!q){document.getElementById('ts-results').innerHTML='';return;}
    const hits=rankings.filter(r=>String(r.teamNumber).includes(q)||(r.teamName||'').toLowerCase().includes(q));
    document.getElementById('ts-results').innerHTML=hits.map(r=>`
      <div class="match-row" onclick="openTeamModal(${r.teamNumber})" style="cursor:pointer">
        <div class="match-num">#${r.rank}</div>
        <div style="flex:1">
          <div style="font-weight:700">${r.teamNumber} <span style="color:var(--text2);font-weight:400;font-size:.78rem">${r.teamName||''}</span></div>
          <div style="font-size:.67rem;font-family:var(--mono);color:var(--text2)">${r.wins}W-${r.losses}L · RP ${r.sortOrder1?.toFixed(3)}</div>
        </div>
        <div style="font-size:.7rem;color:var(--text3)">→</div>
      </div>`).join('')||'<div style="color:var(--text3);font-size:.82rem;padding:.5rem">No results</div>';
  });
}
