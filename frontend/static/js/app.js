const TEAM_NUMBER = 3650;
let appSettings  = {};
let currentPage  = 'dashboard';

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
  const auth = await API.checkAuth().catch(()=>({authenticated:false}));
  if (auth.authenticated) { await bootApp(); } else { showPinGate(); }
});

// ── PIN ───────────────────────────────────────────────────────
function showPinGate() {
  document.getElementById('pin-gate').classList.remove('hidden');
  let entered='';
  const dots=document.querySelectorAll('#pin-dots span');
  const errEl=document.getElementById('pin-error');
  const paint=()=>dots.forEach((d,i)=>d.classList.toggle('filled',i<entered.length));
  const tryLogin=async()=>{
    const res=await API.login(entered);
    if (res.success){document.getElementById('pin-gate').classList.add('hidden');await bootApp();}
    else{errEl.textContent='Wrong PIN';entered='';paint();setTimeout(()=>{errEl.textContent='';},2000);}
  };
  document.querySelectorAll('.key').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const k=btn.dataset.key;
      if (k==='clear'){entered=entered.slice(0,-1);errEl.textContent='';}
      else if(k==='enter'){if(entered.length===4)tryLogin();}
      else{if(entered.length>=4)return;entered+=k;if(entered.length===4)setTimeout(tryLogin,120);}
      paint();
    });
  });
}

// ── App Boot ──────────────────────────────────────────────────
async function bootApp() {
  document.getElementById('app').classList.remove('hidden');
  appSettings=await API.getSettings().catch(()=>({}));
  refreshTopbar();
  setupNav();
  setupSettings();
  navigateTo('dashboard');
}

function refreshTopbar(){
  document.getElementById('topbar-event').textContent=appSettings.active_event_name||'No Event';
}

// ── Navigation ────────────────────────────────────────────────
function setupNav(){
  document.querySelectorAll('.nav-btn').forEach(btn=>
    btn.addEventListener('click',()=>navigateTo(btn.dataset.page))
  );
}
function navigateTo(page){
  currentPage=page;
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  ({dashboard,schedule,rankings,scouting,alliance,simulator,hub})[page]?.();
}

// ── Settings (wired ONCE at boot) ─────────────────────────────
function setupSettings(){
  document.getElementById('settings-btn').addEventListener('click',openSettings);
  document.getElementById('settings-close').addEventListener('click',closeSettings);
  document.getElementById('settings-backdrop').addEventListener('click',closeSettings);
  document.getElementById('logout-btn').addEventListener('click',async()=>{await API.logout();location.reload();});
  document.getElementById('refresh-btn').addEventListener('click',()=>{showToast('Refreshing…');navigateTo(currentPage);});

  const searchEl =document.getElementById('setting-event-search');
  const resultsEl=document.getElementById('event-search-results');
  const seasonEl =document.getElementById('setting-season');
  let debounce;

  searchEl.addEventListener('input',()=>{
    clearTimeout(debounce);
    debounce=setTimeout(async()=>{
      const q=searchEl.value.trim().toLowerCase();
      if (q.length<2){resultsEl.innerHTML='';return;}
      const season=seasonEl.value||appSettings.active_season||2025;
      resultsEl.innerHTML='<div class="event-result" style="cursor:default;color:var(--text2);font-size:.78rem">Searching…</div>';
      let data;try{data=await API.getEvents(season);}catch(e){data=null;}
      if (!data||!Array.isArray(data.events)){
        resultsEl.innerHTML='<div class="event-result" style="cursor:default;color:var(--red);font-size:.78rem">Failed to load events</div>';return;
      }
      const hits=data.events.filter(e=>
        (e.name||'').toLowerCase().includes(q)||(e.code||'').toLowerCase().includes(q)||
        (e.city||'').toLowerCase().includes(q)||(e.stateprov||'').toLowerCase().includes(q)
      ).slice(0,12);
      if (!hits.length){resultsEl.innerHTML='<div class="event-result" style="cursor:default;color:var(--text2);font-size:.78rem">No results</div>';return;}
      resultsEl.innerHTML=hits.map(e=>`
        <div class="event-result" data-code="${e.code}" data-name="${encodeURIComponent(e.name)}" data-season="${season}">
          <div class="event-result-name">${e.name}</div>
          <div class="event-result-meta">${e.code} · ${e.city||''}${e.stateprov?', '+e.stateprov:''} · ${(e.dateStart||'').slice(0,10)} · ${e.typeName||''}</div>
        </div>`).join('');
    },320);
  });

  resultsEl.addEventListener('click',async ev=>{
    const row=ev.target.closest('.event-result[data-code]');if(!row)return;
    const code=row.dataset.code, name=decodeURIComponent(row.dataset.name), season=row.dataset.season;
    try{await API.saveSettings({active_event_code:code,active_event_name:name,active_season:season});}
    catch(e){showToast('Save failed');return;}
    appSettings.active_event_code=code;appSettings.active_event_name=name;appSettings.active_season=season;
    document.getElementById('active-event-display').textContent=`${name} (${code})`;
    refreshTopbar();resultsEl.innerHTML='';searchEl.value='';
    showToast('Event set! ✓');closeSettings();navigateTo(currentPage);
  });
}

async function openSettings(){
  document.getElementById('settings-modal').classList.remove('hidden');
  const seasonEl=document.getElementById('setting-season');
  try{
    const sd=await API.getSeasons();
    seasonEl.innerHTML='';
    if (sd&&Array.isArray(sd.seasons)){
      [...sd.seasons].reverse().forEach(s=>{
        const o=document.createElement('option');
        o.value=s;o.textContent=`${s}–${String(s+1).slice(-2)}`;
        if (String(s)===String(appSettings.active_season))o.selected=true;
        seasonEl.appendChild(o);
      });
    }
  }catch(e){}
  const disp=document.getElementById('active-event-display');
  disp.textContent=appSettings.active_event_name?`${appSettings.active_event_name} (${appSettings.active_event_code})`:'None selected';
}
function closeSettings(){
  document.getElementById('settings-modal').classList.add('hidden');
  document.getElementById('event-search-results').innerHTML='';
  document.getElementById('setting-event-search').value='';
}

// ── Toast ─────────────────────────────────────────────────────
let _tt;
function showToast(msg,ms=2200){
  const t=document.getElementById('toast');t.textContent=msg;t.classList.remove('hidden');
  clearTimeout(_tt);_tt=setTimeout(()=>t.classList.add('hidden'),ms);
}

// ── Page helpers ──────────────────────────────────────────────
function renderPage(html){document.getElementById('page-container').innerHTML=html;}
function loadingPage(){renderPage('<div class="loading">Loading</div>');}
function noEventPage(){renderPage(`<div class="empty-state"><div class="empty-icon">◈</div><div>No event selected.</div><div style="margin-top:.5rem;font-size:.75rem">Tap ⚙ to pick an event.</div></div>`);}

function formatTime(iso){
  if (!iso) return '--';
  try{return new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}catch{return '--';}
}

// Team chip: uses teamNumber + alliance, highlights our team
function teamChip(num,alliance){
  return `<span class="team-chip ${alliance}${num==TEAM_NUMBER?' our':''}">${num}</span>`;
}
// Team chip with name tooltip on tap
function teamChipNamed(t,alliance){
  const ours=t.teamNumber==TEAM_NUMBER?' our':'';
  const label=t.teamNumber==TEAM_NUMBER?`<strong>${t.teamNumber}</strong>`:t.teamNumber;
  return `<span class="team-chip ${alliance}${ours} clickable-chip" data-team="${t.teamNumber}" title="${t.teamName||t.teamNumber}" style="${ours?'font-weight:800;border-width:2px':''}">${label}</span>`;
}

// Bind all .clickable-chip elements to open team modal
function bindTeamClicks(rankings){
  document.querySelectorAll('.clickable-chip').forEach(chip=>{
    chip.style.cursor='pointer';
    chip.addEventListener('click',e=>{
      e.stopPropagation();
      openTeamModal(parseInt(chip.dataset.team),rankings);
    });
  });
}

function setActiveTab(id){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

// Match-detail sub-stats bar
// Used in dashboard and schedule
const matchSubStatsStyle=`display:flex;gap:.4rem;flex-wrap:wrap;font-size:.67rem;font-family:var(--mono);color:var(--text2);margin-top:.3rem`;

// Normalize alliance RP flags (accept both FTC API and FTCScout field name variants).
function allianceRPFlags(a) {
  if (!a) return {movement:false, goal:false, pattern:false};
  return {
    movement: !!(a.movementRp ?? a.movementRankingPoint ?? a.MovementRp),
    goal:     !!(a.goalRp     ?? a.goalRankingPoint     ?? a.GoalRp),
    pattern:  !!(a.patternRp  ?? a.patternRankingPoint  ?? a.PatternRp),
  };
}

// Compute ranking points for an alliance in a qualification match.
// In FTC 2025 (Decode): movementRp + goalRp + patternRp (each +1) + 3 for win / 1 for tie
// `a` is an alliance object from the FTC /scores endpoint; `isWinner`/`isTie` describe match outcome.
function computeMatchRP(a, isWinner, isTie) {
  if (!a) return 0;
  const f = allianceRPFlags(a);
  let rp = 0;
  if (f.movement) rp += 1;
  if (f.goal)     rp += 1;
  if (f.pattern)  rp += 1;
  if (isWinner) rp += 3;
  else if (isTie) rp += 1;
  return rp;
}

// Red/blue paired stat chip helpers (used in sub-stats rows across pages)
function pairChip(label, r, b) {
  return `<span class="pair-chip"><span class="pc-lbl">${label}</span><span class="pc-r">${r}</span><span class="pc-sep">·</span><span class="pc-b">${b}</span></span>`;
}
function fieldChip(series) {
  return series != null ? `<span class="pair-chip pair-chip-field">F${series + 1}</span>` : '';
}
// RP summary chip: "RP <red> · <blue>"
function rpPairChip(redRP, blueRP) {
  return `<span class="pair-chip"><span class="pc-lbl">RP</span><span class="pc-r">${redRP}</span><span class="pc-sep">·</span><span class="pc-b">${blueRP}</span></span>`;
}

// Make openTeamModal globally callable from onclick attributes
// openTeamModal is global via rankings.js
// openMatchDetail is global via schedule.js
