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

function scoutFields() { return window._scoutingFields || DEFAULT_SCOUTING_FIELDS; }

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

// Render one note's dynamic field values as HTML, driven by the configured
// field schema. Values saved under keys no longer in the schema (or from
// legacy notes) still render with a best-effort label.
const _LEGACY_SECTION_LABELS = { auto:'Auto', teleop:'Teleop', park:'Park', other:'Notes' };
function scoutFieldLabel(key) {
  const f = scoutFields().find(f => f.key === key);
  return f ? f.label : (_LEGACY_SECTION_LABELS[key] || key.replace(/_/g, ' '));
}
function renderNoteSections(n) {
  const s = parseScoutNotes(n);
  const rows = [];
  const used = new Set();
  scoutFields().forEach(f => {
    if (LEGACY_SCOUT_KEYS.includes(f.key)) return;   // shown via dedicated columns
    const v = s[f.key];
    if (v == null || v === '') return;
    used.add(f.key);
    rows.push(`<div class="note-section"><span class="note-section-label">${escHtml(f.label)}</span>${escHtml(String(v))}</div>`);
  });
  Object.keys(s).forEach(k => {
    if (used.has(k) || LEGACY_SCOUT_KEYS.includes(k)) return;
    const v = s[k];
    if (v == null || v === '') return;
    const label = _LEGACY_SECTION_LABELS[k] || k.replace(/_/g, ' ');
    rows.push(`<div class="note-section"><span class="note-section-label">${escHtml(label)}</span>${escHtml(String(v))}</div>`);
  });
  return rows.join('') || '<span style="color:var(--text3)">—</span>';
}
function noteHasSections(n) {
  const s = parseScoutNotes(n);
  return Object.keys(s).some(k => !LEGACY_SCOUT_KEYS.includes(k) && s[k] != null && s[k] !== '');
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

// ── Dynamic field rendering ───────────────────────────────────
function scoutFieldHtml(f) {
  const req   = f.required ? ' <span style="color:var(--red)">*</span>' : '';
  const label = `<label class="form-label">${escHtml(f.label)}${req}</label>`;
  const ph    = escHtml(f.placeholder || '');
  switch (f.type) {
    case 'stars':
      return `<div class="form-group">${label}
        <div class="star-rating" data-starfield="${f.key}">${[1,2,3,4,5].map(v=>`<span class="star" data-v="${v}">★</span>`).join('')}</div>
      </div>`;
    case 'number':
      return `<div class="form-group">${label}<input class="form-input scf-input" data-key="${f.key}" type="number" inputmode="numeric" placeholder="${ph||'0'}"/></div>`;
    case 'select':
      return `<div class="form-group">${label}<select class="form-select scf-input" data-key="${f.key}">
        <option value="">— select —</option>${(f.options||[]).map(o=>`<option value="${escHtml(o)}">${escHtml(o)}</option>`).join('')}
      </select></div>`;
    case 'textarea':
      return `<div class="form-group">${label}<textarea class="form-textarea scf-input" data-key="${f.key}" placeholder="${ph}"></textarea></div>`;
    default: // text
      return `<div class="form-group">${label}<input class="form-input scf-input" data-key="${f.key}" placeholder="${ph}"/></div>`;
  }
}

async function renderScoutForm() {
  const [rankings, schedData] = await Promise.all([
    _loadRankings(),
    API.getSchedule('qual').catch(()=>null),
  ]);
  const matches  = (schedData?.schedule||[]).filter(m=>m.scoreRedFinal===null);
  const matchOpts= matches.map(m=>`<option value="${m.matchNumber}">Q${m.matchNumber} — ${formatTime(m.startTime)}</option>`).join('');
  const fields   = scoutFields();
  const cats     = flagCats();

  const container = document.getElementById('scout-content');
  if (!container) return;  // user navigated away while data loaded
  container.innerHTML=`
    <div class="card">
      <div class="form-group">
        <label class="form-label">Team <span style="color:var(--red)">*</span></label>
        <input class="form-input" id="sc-team" placeholder="Type team number or name…" autocomplete="off"/>
        <div id="sc-team-results"></div>
        <div id="sc-team-preview" style="display:none;margin-top:.4rem;padding:.4rem .75rem;background:var(--bg3);border:1px solid var(--accent);border-radius:var(--rs);font-size:.82rem;font-family:var(--mono);color:var(--accent)"></div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Your Name</label>
          <input class="form-input" id="sc-name" placeholder="Scout name…" value="${escHtml(localStorage.getItem('scout_name')||'')}"/>
        </div>
        <div class="form-group">
          <label class="form-label">Match (optional)</label>
          <select class="form-select" id="sc-match"><option value="">General note</option>${matchOpts}</select>
        </div>
      </div>

      <div style="border-top:1px solid var(--border);padding-top:.75rem;margin-bottom:.25rem" id="sc-fields">
        ${fields.map(scoutFieldHtml).join('')}
      </div>

      <div class="form-group">
        <label class="form-label">Alliance Flag</label>
        <div class="flag-row" id="sc-flag-row" style="flex-wrap:wrap">
          ${flagBtnHtml(NEUTRAL_FLAG, true)}
          ${cats.map(c=>flagBtnHtml(c, false)).join('')}
        </div>
      </div>
      <button class="btn btn-primary btn-block" id="sc-submit">Save Scouting Note</button>
    </div>`;

  let selectedFlag='neutral', selectedTeam=null;
  const starValues={};

  // Star rating fields (there can be several)
  document.querySelectorAll('#sc-fields [data-starfield]').forEach(row=>{
    const key=row.dataset.starfield;
    row.querySelectorAll('.star').forEach(star=>{
      star.addEventListener('click',()=>{
        starValues[key]=parseInt(star.dataset.v);
        row.querySelectorAll('.star').forEach(s=>s.classList.toggle('active',parseInt(s.dataset.v)<=starValues[key]));
      });
    });
  });

  // Flag selection
  const flagRow=document.getElementById('sc-flag-row');
  const paintFlags=()=>{
    flagRow.querySelectorAll('.flag-btn').forEach(b=>{
      const cat=b.dataset.flag==='neutral'?NEUTRAL_FLAG:flagCat(b.dataset.flag);
      const active=b.dataset.flag===selectedFlag;
      b.classList.toggle('active',active);
      b.style.background=active?hexA(cat?.color||'#888',.15):'';
      b.style.color=active?(cat?.color||'var(--text)'):'';
      b.style.borderColor=active?(cat?.color||'var(--bhi)'):'';
    });
  };
  flagRow.querySelectorAll('.flag-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{selectedFlag=btn.dataset.flag;paintFlags();});
  });
  paintFlags();

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

    // Collect dynamic field values
    const values={...starValues};
    document.querySelectorAll('#sc-fields .scf-input').forEach(el=>{
      const v=el.value.trim();
      if (v!=='') values[el.dataset.key]= el.type==='number'?Number(v):v;
    });

    // Required check
    const missing=fields.filter(f=>f.required && (values[f.key]==null||values[f.key]===''));
    if (missing.length){showToast(`Fill in: ${missing.map(f=>f.label).join(', ')}`);return;}

    // Known numeric keys map to dedicated DB columns; everything else
    // is stored in the notes JSON blob.
    const noteData={};
    const payload={
      team_number:teamNum, scout_name:scoutName,
      match_number:document.getElementById('sc-match').value||null,
    };
    Object.entries(values).forEach(([k,v])=>{
      if (LEGACY_SCOUT_KEYS.includes(k)) payload[k]=(k==='penalties'?(parseInt(v)||0):(parseInt(v)||null));
      else noteData[k]=v;
    });
    payload.notes=Object.keys(noteData).length?JSON.stringify(noteData):null;

    try {
      await API.addScouting(payload);
      if (selectedFlag!=='neutral') await API.setFlag(teamNum,selectedFlag).catch(()=>{});
      _scoutBroadcast();
      showToast('Note saved! ✓');
      renderScoutForm();
    } catch(e){showToast('Failed to save');}
  });
}

async function renderScoutNotes() {
  document.getElementById('scout-content').innerHTML='<div class="loading">Loading</div>';
  const [notes, rankings] = await Promise.all([
    API.getScouting().catch(()=>[]),
    _loadRankings(),
  ]);
  if (!document.getElementById('scout-content')) return;  // navigated away
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
        ${ns.map(n=>`
          <div style="border-top:1px solid var(--border);padding:.55rem 0;display:flex;gap:.5rem">
            <div style="flex:1">
              <div style="font-size:.7rem;font-family:var(--mono);color:var(--text2);margin-bottom:.3rem">
                ${n.scout_name}${n.match_number?' · Q'+n.match_number:''}${n.driver_rating?' · '+'★'.repeat(n.driver_rating):''}
                ${n.auto_score!=null||n.teleop_score!=null||n.endgame_score!=null?`<span style="margin-left:.3rem;color:var(--text3)">A:${n.auto_score??'?'} T:${n.teleop_score??'?'} E:${n.endgame_score??'?'}</span>`:''}
              </div>
              ${noteHasSections(n) ? renderNoteSections(n) : '<span style="color:var(--text3);font-size:.8rem">—</span>'}
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
  if (!document.getElementById('scout-content')) return;  // navigated away
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
