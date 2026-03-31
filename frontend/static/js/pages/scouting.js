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

// ── Parse structured scouting notes (JSON v2 or legacy plain text) ──
function parseScoutNotes(n) {
  if (n.notes) {
    try {
      const j = JSON.parse(n.notes);
      if (j && typeof j === 'object' && !Array.isArray(j)) return j;
    } catch(e) {}
  }
  // Legacy format: build from old separate fields
  const result = {};
  if (n.auto_description) result.auto  = n.auto_description;
  if (n.endgame_description) result.park = n.endgame_description;
  if (n.notes) result.other = n.notes;
  return result;
}

// Render one note's text sections as HTML
function renderNoteSections(n) {
  const s = parseScoutNotes(n);
  const rows = [
    s.auto   && `<div class="note-section"><span class="note-section-label">Auto</span>${escHtml(s.auto)}</div>`,
    s.teleop  && `<div class="note-section"><span class="note-section-label">Teleop</span>${escHtml(s.teleop)}</div>`,
    s.park   && `<div class="note-section"><span class="note-section-label">Park</span>${escHtml(s.park)}</div>`,
    s.other  && `<div class="note-section"><span class="note-section-label">Notes</span>${escHtml(s.other)}</div>`,
  ].filter(Boolean);
  return rows.join('') || '<span style="color:var(--text3)">—</span>';
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

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

      <div style="border-top:1px solid var(--border);padding-top:.75rem;margin-bottom:.25rem">
        <div class="form-label" style="margin-bottom:.6rem;color:var(--accent2)">Match Observations</div>

        <div class="form-group">
          <label class="form-label">🤖 Auto Notes</label>
          <textarea class="form-textarea" id="sc-auto-notes" placeholder="What did they do in autonomous? Specimens scored, samples moved, left zone, consistency…"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">🎮 Teleop Notes</label>
          <textarea class="form-textarea" id="sc-teleop-notes" placeholder="Teleop observations — cycle speed, scoring zones, defense, driver skill…"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">🅿️ Park / Endgame Notes</label>
          <textarea class="form-textarea" id="sc-park-notes" placeholder="Did they hang (level 1/2/3)? Park? Nothing? Was it consistent?"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">📋 Other Notes</label>
          <textarea class="form-textarea" id="sc-other-notes" placeholder="Strengths, weaknesses, alliance strategy tips, notable moments…"></textarea>
        </div>
      </div>

      <div style="border-top:1px solid var(--border);padding-top:.75rem;margin-bottom:.25rem">
        <div class="form-label" style="margin-bottom:.6rem;color:var(--text3)">Score Breakdown (optional)</div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Auto Score</label><input class="form-input" id="sc-auto" type="number" inputmode="numeric" placeholder="0"/></div>
          <div class="form-group"><label class="form-label">TeleOp Score</label><input class="form-input" id="sc-teleop" type="number" inputmode="numeric" placeholder="0"/></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Endgame Score</label><input class="form-input" id="sc-endgame" type="number" inputmode="numeric" placeholder="0"/></div>
          <div class="form-group"><label class="form-label">Penalties</label><input class="form-input" id="sc-penalties" type="number" inputmode="numeric" placeholder="0"/></div>
        </div>
      </div>

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

    // Build structured notes JSON from the 4 sections
    const noteData = {};
    const autoNotes  = document.getElementById('sc-auto-notes').value.trim();
    const teleopNotes= document.getElementById('sc-teleop-notes').value.trim();
    const parkNotes  = document.getElementById('sc-park-notes').value.trim();
    const otherNotes = document.getElementById('sc-other-notes').value.trim();
    if (autoNotes)   noteData.auto   = autoNotes;
    if (teleopNotes) noteData.teleop = teleopNotes;
    if (parkNotes)   noteData.park   = parkNotes;
    if (otherNotes)  noteData.other  = otherNotes;

    try {
      await API.addScouting({
        team_number:teamNum, scout_name:scoutName,
        match_number:document.getElementById('sc-match').value||null,
        auto_score:parseInt(document.getElementById('sc-auto').value)||null,
        teleop_score:parseInt(document.getElementById('sc-teleop').value)||null,
        endgame_score:parseInt(document.getElementById('sc-endgame').value)||null,
        penalties:parseInt(document.getElementById('sc-penalties').value)||0,
        driver_rating:driverRating||null,
        notes:Object.keys(noteData).length ? JSON.stringify(noteData) : null,
      });
      if (selectedFlag!=='neutral') await API.setFlag(teamNum,selectedFlag).catch(()=>{});
      _scoutBroadcast();
      showToast('Note saved! ✓');
      ['sc-auto','sc-teleop','sc-endgame','sc-penalties',
       'sc-auto-notes','sc-teleop-notes','sc-park-notes','sc-other-notes','sc-team'
      ].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
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
  const avg=(arr,f)=>{const valid=arr.filter(n=>n[f]!=null);return valid.length?(valid.reduce((a,n)=>a+(n[f]||0),0)/valid.length).toFixed(1):'--';};

  document.getElementById('scout-content').innerHTML=Object.entries(byTeam).sort((a,b)=>a[0]-b[0]).map(([team,ns])=>{
    const rank=rankings.find(r=>r.teamNumber==team);
    const teamName=rank?.teamName||window._teamNames?.[team]||'';
    const hasScores = ns.some(n=>n.auto_score!=null||n.teleop_score!=null||n.endgame_score!=null);
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
        ${hasScores?`<div class="stat-grid stat-grid-3" style="margin-bottom:.5rem">
          <div class="stat-box"><div class="stat-value" style="font-size:.95rem">${avg(ns,'auto_score')}</div><div class="stat-label">Avg Auto</div></div>
          <div class="stat-box"><div class="stat-value" style="font-size:.95rem">${avg(ns,'teleop_score')}</div><div class="stat-label">Avg Teleop</div></div>
          <div class="stat-box"><div class="stat-value" style="font-size:.95rem">${avg(ns,'endgame_score')}</div><div class="stat-label">Avg End</div></div>
        </div>`:''}
        ${ns.map(n=>{
          const sections = parseScoutNotes(n);
          const hasNote = sections.auto||sections.teleop||sections.park||sections.other;
          return `
          <div style="border-top:1px solid var(--border);padding:.55rem 0;display:flex;gap:.5rem">
            <div style="flex:1">
              <div style="font-size:.7rem;font-family:var(--mono);color:var(--text2);margin-bottom:.3rem">
                ${n.scout_name}${n.match_number?' · Q'+n.match_number:''}${n.driver_rating?' · '+'★'.repeat(n.driver_rating):''}
                ${n.auto_score!=null||n.teleop_score!=null||n.endgame_score!=null?`<span style="margin-left:.3rem;color:var(--text3)">A:${n.auto_score??'?'} T:${n.teleop_score??'?'} E:${n.endgame_score??'?'}</span>`:''}
              </div>
              ${hasNote ? renderNoteSections(n) : '<span style="color:var(--text3);font-size:.8rem">—</span>'}
            </div>
            <button class="btn btn-sm" style="color:var(--red);padding:0 .3rem;flex-shrink:0" data-del="${n.id}">✕</button>
          </div>`;
        }).join('')}
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
