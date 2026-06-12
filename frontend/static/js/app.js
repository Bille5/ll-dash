let TEAM_NUMBER  = null;   // set from deployment config at boot
let appSettings  = {};
let currentPage  = 'dashboard';

// ── Deployment-config fallbacks (server is the source of truth) ──
const DEFAULT_THEME = { accent:'#e8ff47', accent2:'#47c8ff', bg:'#0a0a0f' };
const DEFAULT_FLAG_CATEGORIES = [
  { key:'target', label:'Target',      color:'#2ed573', icon:'🎯' },
  { key:'dnp',    label:'Do Not Pick', color:'#ff4757', icon:'🚫' },
];
const NEUTRAL_FLAG = { key:'neutral', label:'Neutral', color:'#888888', icon:'—' };
const DEFAULT_SCOUTING_FIELDS = [
  { key:'driver_rating', label:'Driver Rating',        type:'stars' },
  { key:'auto',          label:'Auto Notes',           type:'textarea' },
  { key:'teleop',        label:'Teleop Notes',         type:'textarea' },
  { key:'park',          label:'Park / Endgame Notes', type:'textarea' },
  { key:'other',         label:'Other Notes',          type:'textarea' },
  { key:'auto_score',    label:'Auto Score',           type:'number' },
  { key:'teleop_score',  label:'TeleOp Score',         type:'number' },
  { key:'endgame_score', label:'Endgame Score',        type:'number' },
  { key:'penalties',     label:'Penalties',            type:'number' },
];
// Values for these keys live in dedicated DB columns, not the notes JSON
const LEGACY_SCOUT_KEYS = ['driver_rating','auto_score','teleop_score','endgame_score','penalties'];

// All pages the bottom nav can show, in default order
const NAV_PAGES = {
  dashboard: { icon:'◈', label:'Dash' },
  schedule:  { icon:'◷', label:'Schedule' },
  rankings:  { icon:'◬', label:'Rankings' },
  scouting:  { icon:'◉', label:'Scout' },
  alliance:  { icon:'⬡', label:'Alliance' },
  simulator: { icon:'▲', label:'Sim' },
  hub:       { icon:'⊞', label:'Hub' },
  bigscreen: { icon:'⛶', label:'Display' },
  playoffs:  { icon:'🏁', label:'Playoffs' },
  awards:    { icon:'🏆', label:'Awards' },
};
const DEFAULT_NAV_CONFIG = Object.keys(NAV_PAGES).map(key => ({key, visible:true}));

// One-click theme presets — they just populate the accent/accent2/bg pickers
const THEME_PRESETS = [
  { name:'Classic Dark',  mode:'dark',  accent:'#e8ff47', accent2:'#47c8ff', bg:'#0a0a0f' },
  { name:'High Contrast', mode:'dark',  accent:'#ffe600', accent2:'#00e5ff', bg:'#000000' },
  { name:'Light Mode',    mode:'light', accent:'#6d28d9', accent2:'#0284c7', bg:'#f5f5f7' },
  { name:'Red Alliance',  mode:'dark',  accent:'#ff4757', accent2:'#ffa502', bg:'#140a0c' },
  { name:'Blue Alliance', mode:'dark',  accent:'#47c8ff', accent2:'#e8ff47', bg:'#080d14' },
  { name:'Forest',        mode:'dark',  accent:'#2ed573', accent2:'#7bed9f', bg:'#0a120c' },
  { name:'Royal',         mode:'dark',  accent:'#a55eea', accent2:'#fd79a8', bg:'#0e0a14' },
];

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'<br>');
}

// ── Theming ───────────────────────────────────────────────────
function shadeHex(hex, amt) {
  const h = String(hex).replace('#','');
  const full = h.length===3 ? h.split('').map(c=>c+c).join('') : h;
  const n = parseInt(full, 16);
  if (isNaN(n)) return hex;
  let r=(n>>16)&255, g=(n>>8)&255, b=n&255;
  if (0.299*r+0.587*g+0.114*b > 128) amt = -amt;  // light theme → darken instead
  const c = v => Math.max(0, Math.min(255, v+amt));
  return '#'+[c(r),c(g),c(b)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
function applyTheme(t) {
  if (!t) return;
  const r = document.documentElement.style;
  if (t.accent)  r.setProperty('--accent',  t.accent);
  if (t.accent2) r.setProperty('--accent2', t.accent2);
  if (t.bg) {
    r.setProperty('--bg',  t.bg);
    r.setProperty('--bg2', t.bg2 || shadeHex(t.bg, 8));
    r.setProperty('--bg3', t.bg3 || shadeHex(t.bg, 15));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg);
  }
}

// Light/dark + density are root classes; CSS variable sets do the rest
function applyDisplayMode(mode, density) {
  const root = document.documentElement;
  if (mode)    root.classList.toggle('light',   mode === 'light');
  if (density) root.classList.toggle('compact', density === 'compact');
}

// ── Branding ──────────────────────────────────────────────────
function brandHtml(name) {
  const parts = String(name||'LL Dash').trim().split(/\s+/);
  if (parts.length === 1) return escHtml(parts[0]);
  return `${escHtml(parts[0])}<span>${escHtml(parts.slice(1).join(' '))}</span>`;
}
function applyBranding(name, teamNumber) {
  name = name || 'LL Dash';
  document.title = name;
  const html = brandHtml(name);
  const tb = document.getElementById('topbar-logo'); if (tb) tb.innerHTML = html;
  const pl = document.getElementById('pin-logo');    if (pl) pl.innerHTML = html;
  const ps = document.getElementById('pin-sub');
  if (ps) ps.textContent = teamNumber ? `Team ${teamNumber}` : '';
}

// ── Flag category helpers (used by scouting / alliance / rankings) ──
function flagCats()  { return window._flagCategories || DEFAULT_FLAG_CATEGORIES; }
function flagCat(key){ return flagCats().find(c=>c.key===key) || null; }
function hexA(hex, a) {
  const h = String(hex||'#888888').replace('#','');
  const full = h.length===3 ? h.split('').map(c=>c+c).join('') : h;
  const n = parseInt(full, 16);
  if (isNaN(n)) return `rgba(136,136,136,${a})`;
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}
function flagIcon(cat) {
  return cat.icon ? cat.icon : `<span style="color:${cat.color}">●</span>`;
}
function flagBtnHtml(cat, active, team, compact=false) {
  const style = (active ? `background:${hexA(cat.color,.15)};color:${cat.color};border-color:${cat.color};` : '')
              + (compact ? 'flex:unset;padding:.2rem .4rem' : '');
  const label = compact ? flagIcon(cat) : `${flagIcon(cat)} ${escHtml(cat.label)}`;
  return `<button class="flag-btn ${active?'active':''}" data-flag="${cat.key}"${team!=null?` data-team="${team}"`:''} title="${escHtml(cat.label)}" style="${style}" onclick="event.stopPropagation()">${label}</button>`;
}

// ── OPR match prediction (shared by schedule, sim, playoffs, match modal) ──
// teams: array of team numbers or {teamNumber} objects; oprMap entries are
// {total, auto, teleop, endgame} from FTCScout.
function oprSum(teams, oprMap, key = 'total') {
  return (teams || []).reduce((s, t) => {
    const num = typeof t === 'number' ? t : t.teamNumber;
    return s + (oprMap?.[num]?.[key] || 0);
  }, 0);
}
function oprPredictSides(redTeams, blueTeams, oprMap) {
  const comp = {};
  ['total', 'auto', 'teleop', 'endgame'].forEach(k => {
    comp[k] = [oprSum(redTeams, oprMap, k), oprSum(blueTeams, oprMap, k)];
  });
  const [redOPR, blueOPR] = comp.total;
  const diff = redOPR - blueOPR;
  const totalOPR = Math.max(redOPR + blueOPR, 1);
  const rawConf = Math.min(Math.abs(diff) / (totalOPR * 0.4), 1);
  return {
    winner: diff > 0 ? 'Red' : diff < 0 ? 'Blue' : 'Tie',
    confidence: Math.round(rawConf * 100),
    redWinProb: 0.5 + (diff >= 0 ? 1 : -1) * rawConf / 2,
    redOPR, blueOPR, diff, comp,
    hasData: redOPR > 0 || blueOPR > 0,
  };
}
// Compact component-OPR comparison table (Auto/Teleop/Endgame/Total)
function oprBreakdownHtml(pred) {
  if (!pred?.hasData) return '';
  const row = (label, r, b) => `
    <div class="opr-cmp-row${label === 'Total' ? ' opr-cmp-total' : ''}">
      <span class="opr-cmp-lbl">${label}</span>
      <span class="opr-cmp-r ${r > b ? 'opr-cmp-win' : ''}">${r.toFixed(1)}</span>
      <span class="opr-cmp-sep">·</span>
      <span class="opr-cmp-b ${b > r ? 'opr-cmp-win' : ''}">${b.toFixed(1)}</span>
    </div>`;
  return `
    <div class="opr-cmp">
      ${row('Auto', pred.comp.auto[0], pred.comp.auto[1])}
      ${row('Teleop', pred.comp.teleop[0], pred.comp.teleop[1])}
      ${row('Endgame', pred.comp.endgame[0], pred.comp.endgame[1])}
      ${row('Total', pred.comp.total[0], pred.comp.total[1])}
    </div>`;
}

// ── Per-device nav hiding (localStorage, layered on the deployment config) ──
function deviceHiddenTabs() {
  try {
    const v = JSON.parse(localStorage.getItem('device_hidden_tabs') || '[]');
    return Array.isArray(v) ? v.filter(k => k !== 'dashboard') : [];
  } catch (e) { return []; }
}
function setDeviceHiddenTabs(keys) {
  localStorage.setItem('device_hidden_tabs', JSON.stringify(keys.filter(k => k !== 'dashboard')));
}

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
  let cfg = {};
  try { cfg = await API.getConfig(); } catch(e) {}
  window._appConfig = cfg;
  if (cfg.theme) applyTheme(cfg.theme);
  applyDisplayMode(cfg.theme_mode, cfg.density);
  if (cfg.dashboard_name) applyBranding(cfg.dashboard_name, cfg.team_number);
  if (cfg.needs_setup) { showSetupWizard(cfg); return; }
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
  appSettings = await API.getSettings().catch(()=>({}));
  TEAM_NUMBER = parseInt(appSettings.team_number) || null;
  applyBranding(appSettings.dashboard_name || window._appConfig?.dashboard_name, appSettings.team_number);
  if (appSettings.theme) applyTheme(appSettings.theme);
  applyDisplayMode(appSettings.theme_mode, appSettings.density);

  const [cats, fields] = await Promise.all([
    API.getFlagCategories().catch(()=>null),
    API.getScoutingFields().catch(()=>null),
  ]);
  window._flagCategories = Array.isArray(cats)  && cats.length   ? cats   : DEFAULT_FLAG_CATEGORIES;
  window._scoutingFields = Array.isArray(fields) && fields.length ? fields : DEFAULT_SCOUTING_FIELDS;

  refreshTopbar();
  buildNav();
  setupSettings();
  navigateTo('dashboard');
}

function refreshTopbar(){
  document.getElementById('topbar-event').textContent=appSettings.active_event_name||'No Event';
}

// ── Navigation ────────────────────────────────────────────────
// The bottom nav is built from the configured page order/visibility
// (Settings → Pages). Dashboard is always present.
function navConfig(){
  const nav = appSettings.nav;
  return Array.isArray(nav) && nav.length ? nav : DEFAULT_NAV_CONFIG;
}
function buildNav(){
  const el = document.getElementById('bottom-nav');
  if (!el) return;
  const hidden = deviceHiddenTabs();
  el.innerHTML = navConfig()
    .filter(n => n.visible && NAV_PAGES[n.key] && !hidden.includes(n.key))
    .map(n => `
      <button class="nav-btn ${n.key===currentPage?'active':''}" data-page="${n.key}">
        <span class="nav-icon">${NAV_PAGES[n.key].icon}</span>
        <span class="nav-label">${NAV_PAGES[n.key].label}</span>
      </button>`).join('');
  el.querySelectorAll('.nav-btn').forEach(btn=>
    btn.addEventListener('click',()=>navigateTo(btn.dataset.page))
  );
}
function navigateTo(page){
  if (window._bsCleanup){ try{window._bsCleanup();}catch(e){} window._bsCleanup=null; }
  currentPage=page;
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  ({dashboard,schedule,rankings,scouting,alliance,simulator,hub,bigscreen,playoffs,awards})[page]?.();
}

// ── Settings sheet (tabbed) ───────────────────────────────────
function setupSettings(){
  document.getElementById('settings-btn').addEventListener('click',openSettings);
  document.getElementById('settings-close').addEventListener('click',closeSettings);
  document.getElementById('settings-backdrop').addEventListener('click',closeSettings);
  document.getElementById('logout-btn').addEventListener('click',async()=>{await API.logout();location.reload();});
  document.getElementById('refresh-btn').addEventListener('click',()=>{showToast('Refreshing…');navigateTo(currentPage);});
  document.querySelectorAll('#settings-tabs .tab').forEach(t=>
    t.addEventListener('click',()=>renderSettingsTab(t.dataset.stab))
  );
}

function openSettings(){
  document.getElementById('settings-modal').classList.remove('hidden');
  renderSettingsTab('event');
}
function closeSettings(){
  document.getElementById('settings-modal').classList.add('hidden');
  // discard unsaved live previews
  applyTheme(appSettings.theme || DEFAULT_THEME);
  applyDisplayMode(appSettings.theme_mode || 'dark', appSettings.density || 'normal');
  applyBranding(appSettings.dashboard_name, appSettings.team_number);
}

function renderSettingsTab(tab){
  document.querySelectorAll('#settings-tabs .tab').forEach(t=>t.classList.toggle('active',t.dataset.stab===tab));
  const c = document.getElementById('settings-content');
  if (tab==='event')    renderSettingsEvent(c);
  if (tab==='display')  renderSettingsDisplay(c);
  if (tab==='scouting') renderSettingsScoutFields(c);
  if (tab==='flags')    renderSettingsFlags(c);
  if (tab==='pages')    renderSettingsPages(c);
  if (tab==='data')     renderSettingsData(c);
  if (tab==='advanced') renderSettingsAdvanced(c);
}

// — Event tab —
function renderSettingsEvent(c){
  c.innerHTML=`
    <div class="setting-group">
      <label class="setting-label">Season</label>
      <select class="setting-select" id="setting-season"></select>
    </div>
    <div class="setting-group">
      <label class="setting-label">Search Events</label>
      <input class="setting-input" id="setting-event-search" placeholder="Type city or event name…" autocomplete="off"/>
      <div class="event-search-results" id="event-search-results"></div>
    </div>
    <div class="setting-group">
      <label class="setting-label">Active Event</label>
      <div class="active-event-display" id="active-event-display">${appSettings.active_event_name?`${escHtml(appSettings.active_event_name)} (${escHtml(appSettings.active_event_code||'')})`:'None selected'}</div>
    </div>`;

  const seasonEl =document.getElementById('setting-season');
  const searchEl =document.getElementById('setting-event-search');
  const resultsEl=document.getElementById('event-search-results');

  API.getSeasons().then(sd=>{
    seasonEl.innerHTML='';
    if (sd&&Array.isArray(sd.seasons)){
      [...sd.seasons].reverse().forEach(s=>{
        const o=document.createElement('option');
        o.value=s;o.textContent=`${s}–${String(s+1).slice(-2)}`;
        if (String(s)===String(appSettings.active_season))o.selected=true;
        seasonEl.appendChild(o);
      });
    }
  }).catch(()=>{});

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

// — Display tab (branding + theme presets + light/dark + density) —
function renderSettingsDisplay(c){
  const theme = appSettings.theme || DEFAULT_THEME;
  let mode    = appSettings.theme_mode || 'dark';
  let density = appSettings.density || 'normal';

  c.innerHTML=`
    <div class="setting-group">
      <label class="setting-label">Dashboard Name</label>
      <input class="setting-input" id="brand-name" value="${escHtml(appSettings.dashboard_name||'')}" placeholder="e.g. LL Dash" maxlength="48"/>
      <div class="setting-hint">Shown in the header, app title and home-screen icon. Any name works — "XX Dash" is just the convention.</div>
    </div>
    <div class="setting-group">
      <label class="setting-label">Theme Presets</label>
      <div class="preset-row">
        ${THEME_PRESETS.map((p,i)=>`
          <button class="preset-chip" data-preset="${i}" title="${escHtml(p.name)}"
                  style="background:${p.bg};border-color:${p.accent}">
            <span class="preset-dot" style="background:${p.accent}"></span>
            <span class="preset-dot" style="background:${p.accent2}"></span>
            <span class="preset-name" style="color:${p.mode==='light'?'#222':'#eee'}">${escHtml(p.name)}</span>
          </button>`).join('')}
      </div>
    </div>
    <div class="setting-group">
      <label class="setting-label">Colors</label>
      <div class="color-row"><input type="color" id="brand-accent"  value="${theme.accent||DEFAULT_THEME.accent}"/><span>Accent</span></div>
      <div class="color-row"><input type="color" id="brand-accent2" value="${theme.accent2||DEFAULT_THEME.accent2}"/><span>Secondary</span></div>
      <div class="color-row"><input type="color" id="brand-bg"      value="${theme.bg||DEFAULT_THEME.bg}"/><span>Background</span></div>
      <div class="setting-hint">Changes preview live — hit Save to keep them.</div>
    </div>
    <div class="setting-group">
      <label class="setting-label">Mode &amp; Density</label>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <div class="seg-toggle" id="disp-mode">
          <button data-v="dark"  class="${mode==='dark'?'on':''}">🌙 Dark</button>
          <button data-v="light" class="${mode==='light'?'on':''}">☀️ Light</button>
        </div>
        <div class="seg-toggle" id="disp-density">
          <button data-v="normal"  class="${density==='normal'?'on':''}">Normal</button>
          <button data-v="compact" class="${density==='compact'?'on':''}">Compact</button>
        </div>
      </div>
      <div class="setting-hint">Compact shrinks fonts and padding — more data per screen on tablets.</div>
    </div>
    <div style="display:flex;gap:.5rem">
      <button class="btn btn-primary" style="flex:1" id="brand-save">Save Display</button>
      <button class="btn btn-secondary" id="brand-reset">Reset</button>
    </div>`;

  const livePreview=()=>{
    applyTheme({
      accent: document.getElementById('brand-accent').value,
      accent2:document.getElementById('brand-accent2').value,
      bg:     document.getElementById('brand-bg').value,
    });
    applyDisplayMode(mode, density);
    applyBranding(document.getElementById('brand-name').value.trim()||appSettings.dashboard_name, appSettings.team_number);
  };
  ['brand-accent','brand-accent2','brand-bg'].forEach(id=>document.getElementById(id).addEventListener('input',livePreview));
  document.getElementById('brand-name').addEventListener('input',livePreview);

  c.querySelectorAll('.preset-chip').forEach(chip=>{
    chip.addEventListener('click',()=>{
      const p = THEME_PRESETS[+chip.dataset.preset];
      document.getElementById('brand-accent').value =p.accent;
      document.getElementById('brand-accent2').value=p.accent2;
      document.getElementById('brand-bg').value     =p.bg;
      mode = p.mode;
      c.querySelectorAll('#disp-mode button').forEach(b=>b.classList.toggle('on',b.dataset.v===mode));
      livePreview();
    });
  });

  c.querySelectorAll('#disp-mode button').forEach(b=>b.addEventListener('click',()=>{
    mode=b.dataset.v;
    c.querySelectorAll('#disp-mode button').forEach(x=>x.classList.toggle('on',x===b));
    // switching mode with a mismatched background looks broken — flip it
    const bgEl=document.getElementById('brand-bg');
    const lum=(h=>{const n=parseInt(h.slice(1),16);return .299*((n>>16)&255)+.587*((n>>8)&255)+.114*(n&255);})(bgEl.value);
    if (mode==='light' && lum<128) bgEl.value='#f5f5f7';
    if (mode==='dark'  && lum>=128) bgEl.value=DEFAULT_THEME.bg;
    livePreview();
  }));
  c.querySelectorAll('#disp-density button').forEach(b=>b.addEventListener('click',()=>{
    density=b.dataset.v;
    c.querySelectorAll('#disp-density button').forEach(x=>x.classList.toggle('on',x===b));
    livePreview();
  }));

  document.getElementById('brand-reset').addEventListener('click',()=>{
    document.getElementById('brand-accent').value =DEFAULT_THEME.accent;
    document.getElementById('brand-accent2').value=DEFAULT_THEME.accent2;
    document.getElementById('brand-bg').value     =DEFAULT_THEME.bg;
    mode='dark'; density='normal';
    c.querySelectorAll('#disp-mode button').forEach(b=>b.classList.toggle('on',b.dataset.v==='dark'));
    c.querySelectorAll('#disp-density button').forEach(b=>b.classList.toggle('on',b.dataset.v==='normal'));
    livePreview();
  });

  document.getElementById('brand-save').addEventListener('click',async()=>{
    const name = document.getElementById('brand-name').value.trim();
    const payload={
      theme_accent: document.getElementById('brand-accent').value,
      theme_accent2:document.getElementById('brand-accent2').value,
      theme_bg:     document.getElementById('brand-bg').value,
      theme_mode:   mode,
      density:      density,
    };
    if (name) payload.dashboard_name=name;
    try{ await API.saveSettings(payload); }catch(e){ showToast('Save failed'); return; }
    if (name) appSettings.dashboard_name=name;
    appSettings.theme={accent:payload.theme_accent,accent2:payload.theme_accent2,bg:payload.theme_bg};
    appSettings.theme_mode=mode; appSettings.density=density;
    applyTheme(appSettings.theme);
    applyDisplayMode(mode, density);
    applyBranding(appSettings.dashboard_name, appSettings.team_number);
    showToast('Display saved ✓');
  });
}

// — Pages tab (nav order/visibility + Big Screen panels/intervals) —
function renderSettingsPages(c){
  let nav = JSON.parse(JSON.stringify(navConfig()));
  const bs = JSON.parse(JSON.stringify(appSettings.bigscreen || {panels:{schedule:true,rankings:true,playoffs:true},cycle_seconds:15,refresh_seconds:45}));
  let highlightOurs = appSettings.awards_highlight_ours !== false;
  let advPred = appSettings.advanced_predictions !== false;

  function draw(){
    c.innerHTML=`
      <div class="setting-group">
        <label class="setting-label">Navigation Tabs</label>
        <div class="setting-hint" style="margin:0 0 .5rem">Reorder with ↑↓, untick to hide a tab. Dashboard is always shown.</div>
        <div id="nav-list">${nav.map((n,i)=>{
          const meta=NAV_PAGES[n.key]||{icon:'•',label:n.key};
          const locked=n.key==='dashboard';
          return `
          <div class="cfg-row" style="padding:.4rem .55rem">
            <div class="cfg-row-main" style="align-items:center">
              <label class="sf-req-label" style="margin-right:0">
                <input type="checkbox" class="nav-vis" data-i="${i}" ${n.visible?'checked':''} ${locked?'disabled':''}/>
              </label>
              <span style="font-size:.95rem;width:1.4rem;text-align:center">${meta.icon}</span>
              <span style="flex:1;font-size:.85rem;font-weight:600">${escHtml(meta.label)}${locked?' <span style="color:var(--text3);font-size:.65rem">(always on)</span>':''}</span>
              <button class="icon-btn cfg-mini" data-up="${i}" ${i===0?'disabled':''}>↑</button>
              <button class="icon-btn cfg-mini" data-down="${i}" ${i===nav.length-1?'disabled':''}>↓</button>
            </div>
          </div>`;}).join('')}
        </div>
      </div>
      <div class="setting-group">
        <label class="setting-label">Big Screen</label>
        <div class="setting-hint" style="margin:0 0 .5rem">Panels shown on the pit display (and rotated through in cycle mode).</div>
        ${['schedule','rankings','playoffs'].map(k=>`
          <label class="sf-req-label" style="margin:0 0 .4rem;font-size:.8rem">
            <input type="checkbox" class="bs-panel" data-k="${k}" ${bs.panels?.[k]?'checked':''}/>
            ${k.charAt(0).toUpperCase()+k.slice(1)} panel
          </label>`).join('')}
        <div class="form-row" style="margin-top:.6rem">
          <div>
            <label class="setting-label" style="font-size:.6rem">Cycle interval (s)</label>
            <input class="setting-input" id="bs-cycle" type="number" min="5" max="300" value="${bs.cycle_seconds||15}"/>
          </div>
          <div>
            <label class="setting-label" style="font-size:.6rem">Refresh interval (s)</label>
            <input class="setting-input" id="bs-refresh" type="number" min="10" max="600" value="${bs.refresh_seconds||45}"/>
          </div>
        </div>
      </div>
      <div class="setting-group">
        <label class="setting-label">On This Device</label>
        <div class="setting-hint" style="margin:0 0 .5rem">Untick tabs you don't need on this phone/tablet. Only affects this device — the shared settings above apply everywhere.</div>
        <div class="device-tab-grid">${nav.filter(n=>n.visible&&n.key!=='dashboard'&&NAV_PAGES[n.key]).map(n=>`
          <label class="sf-req-label" style="margin:0;font-size:.78rem">
            <input type="checkbox" class="dev-vis" data-k="${n.key}" ${deviceHiddenTabs().includes(n.key)?'':'checked'}/>
            ${NAV_PAGES[n.key].icon} ${escHtml(NAV_PAGES[n.key].label)}
          </label>`).join('')}
        </div>
      </div>
      <div class="setting-group">
        <label class="setting-label">Predictions</label>
        <label class="sf-req-label" style="margin:0;font-size:.8rem">
          <input type="checkbox" id="adv-pred" ${advPred?'checked':''}/>
          Advanced favoring — compare Auto / Teleop / Endgame OPR in match details &amp; playoff cards
        </label>
      </div>
      <div class="setting-group">
        <label class="setting-label">Awards</label>
        <label class="sf-req-label" style="margin:0;font-size:.8rem">
          <input type="checkbox" id="awards-ours" ${highlightOurs?'checked':''}/>
          Highlight our team's awards
        </label>
      </div>
      <button class="btn btn-primary btn-block" id="pages-save">Save Pages</button>`;

    // Device-local tab hiding applies immediately (it's not a server setting)
    c.querySelectorAll('.dev-vis').forEach(el=>el.addEventListener('change',()=>{
      const hidden = [...c.querySelectorAll('.dev-vis')].filter(x=>!x.checked).map(x=>x.dataset.k);
      setDeviceHiddenTabs(hidden);
      buildNav();
      if (hidden.includes(currentPage)) navigateTo('dashboard');
      showToast('Tabs updated on this device');
    }));

    c.querySelectorAll('[data-up]').forEach(b=>b.addEventListener('click',()=>{sync();const i=+b.dataset.up;[nav[i-1],nav[i]]=[nav[i],nav[i-1]];draw();}));
    c.querySelectorAll('[data-down]').forEach(b=>b.addEventListener('click',()=>{sync();const i=+b.dataset.down;[nav[i],nav[i+1]]=[nav[i+1],nav[i]];draw();}));

    function sync(){
      c.querySelectorAll('.nav-vis').forEach(el=>{nav[+el.dataset.i].visible=el.checked;});
      c.querySelectorAll('.bs-panel').forEach(el=>{bs.panels=bs.panels||{};bs.panels[el.dataset.k]=el.checked;});
      bs.cycle_seconds  =parseInt(document.getElementById('bs-cycle').value)||15;
      bs.refresh_seconds=parseInt(document.getElementById('bs-refresh').value)||45;
      highlightOurs=document.getElementById('awards-ours').checked;
      advPred=document.getElementById('adv-pred').checked;
    }

    document.getElementById('pages-save').addEventListener('click',async()=>{
      sync();
      if (!Object.values(bs.panels||{}).some(Boolean)){showToast('Enable at least one Big Screen panel');return;}
      try{
        await API.saveSettings({nav_config:nav, bigscreen_config:bs, awards_highlight_ours:highlightOurs, advanced_predictions:advPred});
      }catch(e){showToast('Save failed');return;}
      appSettings.nav=nav; appSettings.bigscreen=bs; appSettings.awards_highlight_ours=highlightOurs;
      appSettings.advanced_predictions=advPred;
      buildNav();
      // if the page we're on just got hidden, fall back to the dashboard
      const visible = nav.filter(n=>n.visible).map(n=>n.key);
      if (!visible.includes(currentPage)) { closeSettings(); navigateTo('dashboard'); }
      showToast('Pages saved ✓');
    });
  }
  draw();
}

// — Data tab (exports) —
function renderSettingsData(c){
  const dl = (path) => { window.open(path, '_blank'); };
  c.innerHTML=`
    <div class="setting-hint" style="margin-bottom:.75rem">Download your team's data. Scouting CSV columns follow the current scouting field schema.</div>
    <div class="setting-group">
      <label class="setting-label">Scouting Notes</label>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" data-dl="/api/export/scouting?format=csv">⬇ CSV (this event)</button>
        <button class="btn btn-secondary btn-sm" data-dl="/api/export/scouting?format=json">⬇ JSON (this event)</button>
        <button class="btn btn-secondary btn-sm" data-dl="/api/export/scouting?format=csv&all=1">⬇ CSV (everything)</button>
      </div>
    </div>
    <div class="setting-group">
      <label class="setting-label">Alliance Flags</label>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" data-dl="/api/export/flags?format=csv">⬇ CSV (this event)</button>
        <button class="btn btn-secondary btn-sm" data-dl="/api/export/flags?format=json">⬇ JSON (this event)</button>
      </div>
    </div>
    <div class="setting-group">
      <label class="setting-label">Hub Notes &amp; Checklists</label>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" data-dl="/api/export/hub">⬇ JSON</button>
      </div>
    </div>`;
  c.querySelectorAll('[data-dl]').forEach(b=>b.addEventListener('click',()=>dl(b.dataset.dl)));
}

// — Scouting fields tab —
function renderSettingsScoutFields(c){
  let wf = JSON.parse(JSON.stringify(window._scoutingFields||DEFAULT_SCOUTING_FIELDS));

  function draw(){
    c.innerHTML=`
      <div class="setting-hint" style="margin-bottom:.6rem">These fields make up the scouting "Add Note" form. Existing notes keep their saved values.</div>
      <div id="sf-list">${wf.map((f,i)=>`
        <div class="cfg-row" data-i="${i}">
          <div class="cfg-row-main">
            <input class="setting-input sf-label" data-i="${i}" value="${escHtml(f.label||'')}" placeholder="Field label"/>
            <select class="setting-select sf-type" data-i="${i}">
              ${['text','textarea','number','select','stars'].map(t=>`<option value="${t}" ${f.type===t?'selected':''}>${t==='stars'?'star rating':t}</option>`).join('')}
            </select>
          </div>
          ${f.type==='select'?`<input class="setting-input sf-options" data-i="${i}" value="${escHtml((f.options||[]).join(', '))}" placeholder="Options, comma separated" style="margin-top:.35rem"/>`:''}
          <div class="cfg-row-actions">
            <label class="sf-req-label"><input type="checkbox" class="sf-req" data-i="${i}" ${f.required?'checked':''}/> required</label>
            <button class="icon-btn cfg-mini" data-up="${i}" ${i===0?'disabled':''}>↑</button>
            <button class="icon-btn cfg-mini" data-down="${i}" ${i===wf.length-1?'disabled':''}>↓</button>
            <button class="icon-btn cfg-mini cfg-del" data-del="${i}">✕</button>
          </div>
        </div>`).join('')}
      </div>
      <div style="display:flex;gap:.5rem;margin-top:.75rem">
        <button class="btn btn-secondary" id="sf-add">+ Add Field</button>
        <button class="btn btn-secondary" id="sf-defaults">Restore Defaults</button>
        <button class="btn btn-primary" style="flex:1" id="sf-save">Save Fields</button>
      </div>`;

    const sync=()=>{
      c.querySelectorAll('.sf-label').forEach(el=>{wf[+el.dataset.i].label=el.value;});
      c.querySelectorAll('.sf-req').forEach(el=>{wf[+el.dataset.i].required=el.checked;});
      c.querySelectorAll('.sf-options').forEach(el=>{wf[+el.dataset.i].options=el.value.split(',').map(s=>s.trim()).filter(Boolean);});
    };
    c.querySelectorAll('.sf-type').forEach(el=>el.addEventListener('change',()=>{sync();wf[+el.dataset.i].type=el.value;draw();}));
    c.querySelectorAll('[data-up]').forEach(b=>b.addEventListener('click',()=>{sync();const i=+b.dataset.up;[wf[i-1],wf[i]]=[wf[i],wf[i-1]];draw();}));
    c.querySelectorAll('[data-down]').forEach(b=>b.addEventListener('click',()=>{sync();const i=+b.dataset.down;[wf[i],wf[i+1]]=[wf[i+1],wf[i]];draw();}));
    c.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',()=>{sync();wf.splice(+b.dataset.del,1);draw();}));
    document.getElementById('sf-add').addEventListener('click',()=>{sync();wf.push({label:'',type:'text',required:false});draw();});
    document.getElementById('sf-defaults').addEventListener('click',()=>{wf=JSON.parse(JSON.stringify(DEFAULT_SCOUTING_FIELDS));draw();});
    document.getElementById('sf-save').addEventListener('click',async()=>{
      sync();
      if (wf.some(f=>!String(f.label||'').trim())){showToast('Every field needs a label');return;}
      if (wf.some(f=>f.type==='select'&&!(f.options||[]).length)){showToast('Select fields need options');return;}
      try{
        const saved=await API.saveScoutingFields(wf);
        window._scoutingFields=saved; wf=JSON.parse(JSON.stringify(saved));
        showToast('Scouting fields saved ✓'); draw();
      }catch(e){showToast('Save failed');}
    });
  }
  draw();
}

// — Flag categories tab —
function renderSettingsFlags(c){
  let wc = JSON.parse(JSON.stringify(window._flagCategories||DEFAULT_FLAG_CATEGORIES));

  function draw(){
    c.innerHTML=`
      <div class="setting-hint" style="margin-bottom:.6rem">Alliance flag categories used in Pick List, Compare and team profiles. Unflagged teams are always "Neutral".</div>
      <div id="fc-list">${wc.map((f,i)=>`
        <div class="cfg-row" data-i="${i}">
          <div class="cfg-row-main">
            <input type="color" class="fc-color" data-i="${i}" value="${f.color||'#2ed573'}" style="width:38px;height:38px;flex-shrink:0"/>
            <input class="setting-input fc-label" data-i="${i}" value="${escHtml(f.label||'')}" placeholder="Category name" maxlength="32"/>
            <input class="setting-input fc-icon" data-i="${i}" value="${escHtml(f.icon||'')}" placeholder="🎯" maxlength="4" style="width:58px;flex-shrink:0;text-align:center"/>
          </div>
          <div class="cfg-row-actions">
            <button class="icon-btn cfg-mini" data-up="${i}" ${i===0?'disabled':''}>↑</button>
            <button class="icon-btn cfg-mini" data-down="${i}" ${i===wc.length-1?'disabled':''}>↓</button>
            <button class="icon-btn cfg-mini cfg-del" data-del="${i}">✕</button>
          </div>
        </div>`).join('')}
      </div>
      <div style="display:flex;gap:.5rem;margin-top:.75rem">
        <button class="btn btn-secondary" id="fc-add">+ Add Category</button>
        <button class="btn btn-secondary" id="fc-defaults">Restore Defaults</button>
        <button class="btn btn-primary" style="flex:1" id="fc-save">Save Flags</button>
      </div>`;

    const sync=()=>{
      c.querySelectorAll('.fc-label').forEach(el=>{wc[+el.dataset.i].label=el.value;});
      c.querySelectorAll('.fc-color').forEach(el=>{wc[+el.dataset.i].color=el.value;});
      c.querySelectorAll('.fc-icon').forEach(el=>{wc[+el.dataset.i].icon=el.value.trim();});
    };
    c.querySelectorAll('[data-up]').forEach(b=>b.addEventListener('click',()=>{sync();const i=+b.dataset.up;[wc[i-1],wc[i]]=[wc[i],wc[i-1]];draw();}));
    c.querySelectorAll('[data-down]').forEach(b=>b.addEventListener('click',()=>{sync();const i=+b.dataset.down;[wc[i],wc[i+1]]=[wc[i+1],wc[i]];draw();}));
    c.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',()=>{sync();wc.splice(+b.dataset.del,1);draw();}));
    document.getElementById('fc-add').addEventListener('click',()=>{sync();wc.push({label:'',color:'#a55eea',icon:''});draw();});
    document.getElementById('fc-defaults').addEventListener('click',()=>{wc=JSON.parse(JSON.stringify(DEFAULT_FLAG_CATEGORIES));draw();});
    document.getElementById('fc-save').addEventListener('click',async()=>{
      sync();
      if (wc.some(f=>!String(f.label||'').trim())){showToast('Every category needs a name');return;}
      try{
        const saved=await API.saveFlagCategories(wc);
        window._flagCategories=saved; wc=JSON.parse(JSON.stringify(saved));
        showToast('Flag categories saved ✓'); draw();
      }catch(e){showToast('Save failed');}
    });
  }
  draw();
}

// — Team & API tab —
function renderSettingsAdvanced(c){
  c.innerHTML=`
    <div class="setting-group">
      <label class="setting-label">Team Number</label>
      <input class="setting-input" id="adv-team" inputmode="numeric" value="${escHtml(appSettings.team_number||'')}" placeholder="e.g. 3650"/>
    </div>
    <div class="setting-group">
      <label class="setting-label">Change PIN (4 digits)</label>
      <input class="setting-input" id="adv-pin" inputmode="numeric" maxlength="4" placeholder="Leave blank to keep current PIN"/>
    </div>
    <div class="setting-group">
      <label class="setting-label">FTC Events API Username</label>
      <input class="setting-input" id="adv-user" value="${escHtml(appSettings.ftc_api_username||'')}" autocomplete="off"/>
    </div>
    <div class="setting-group">
      <label class="setting-label">FTC Events API Key</label>
      <input class="setting-input" id="adv-key" type="password" placeholder="${appSettings.has_credentials?'•••••••• (saved — leave blank to keep)':'Paste your API key'}" autocomplete="off"/>
      <div class="setting-hint">Get credentials at <a href="https://ftc-events.firstinspires.org/services/API" target="_blank" rel="noopener" style="color:var(--accent2)">ftc-events.firstinspires.org</a></div>
    </div>
    <div style="display:flex;gap:.5rem">
      <button class="btn btn-secondary" id="adv-test">Test API</button>
      <button class="btn btn-primary" style="flex:1" id="adv-save">Save</button>
    </div>
    <div id="adv-status" class="setting-hint" style="margin-top:.5rem"></div>`;

  const status=document.getElementById('adv-status');
  document.getElementById('adv-test').addEventListener('click',async()=>{
    const u=document.getElementById('adv-user').value.trim();
    const k=document.getElementById('adv-key').value.trim();
    if (!u||!k){status.textContent='Enter both username and key to test.';return;}
    status.textContent='Testing…';
    const res=await API.setupValidate({username:u,key:k}).catch(()=>({valid:false,error:'Request failed'}));
    status.innerHTML=res.valid
      ?`<span style="color:var(--green)">✓ Credentials valid — current season ${res.currentSeason}</span>`
      :`<span style="color:var(--red)">✕ ${escHtml(res.error||'Invalid credentials')}</span>`;
  });

  document.getElementById('adv-save').addEventListener('click',async()=>{
    const payload={};
    const team=document.getElementById('adv-team').value.trim();
    const pin =document.getElementById('adv-pin').value.trim();
    const user=document.getElementById('adv-user').value.trim();
    const key =document.getElementById('adv-key').value.trim();
    if (team){ if(!/^\d+$/.test(team)){showToast('Team number must be numeric');return;} payload.team_number=team; }
    if (pin){ if(!/^\d{4}$/.test(pin)){showToast('PIN must be 4 digits');return;} payload.team_pin=pin; }
    if (user) payload.ftc_api_username=user;
    if (key)  payload.ftc_api_key=key;
    if (!Object.keys(payload).length){showToast('Nothing to save');return;}
    try{ await API.saveSettings(payload); }catch(e){ showToast('Save failed'); return; }
    if (team){ appSettings.team_number=team; TEAM_NUMBER=parseInt(team)||null; applyBranding(appSettings.dashboard_name, team); }
    if (user) appSettings.ftc_api_username=user;
    if (key)  appSettings.has_credentials=true;
    showToast('Saved ✓');
  });
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
// NOTE: `series` here is derived from the hybrid schedule and is not the FTC
// API's canonical `field` string. For the real per-match field assignment,
// call /api/schedule-fields (backend proxies the non-hybrid schedule endpoint).
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
