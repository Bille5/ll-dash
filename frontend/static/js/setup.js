// ── First-run setup wizard ────────────────────────────────────
// Shown when /api/config reports needs_setup. Collects FTC API credentials
// (validated live), team number, season, PIN, dashboard name and theme,
// then POSTs everything to /api/setup.

function showSetupWizard(cfg) {
  const root = document.getElementById('setup-wizard');
  root.classList.remove('hidden');

  const state = {
    username: '', key: '',
    currentSeason: null, maxSeason: null,
    team: '', season: '', eventCode: '', pin: '',
    namePrefix: 'LL', customName: '', useCustom: false,
    accent: DEFAULT_THEME.accent, accent2: DEFAULT_THEME.accent2, bg: DEFAULT_THEME.bg,
  };
  let step = 1;

  const dashName = () => state.useCustom
    ? (state.customName.trim() || 'LL Dash')
    : `${state.namePrefix.trim() || 'LL'} Dash`;

  function shell(inner, pct) {
    root.innerHTML = `
      <div class="setup-overlay">
        <div class="setup-card">
          <div class="setup-progress"><div class="setup-progress-fill" style="width:${pct}%"></div></div>
          ${inner}
          <footer class="attribution" style="margin-top:1.25rem">Event data provided by <a href="https://frc-events.firstinspires.org/services/API" target="_blank" rel="noopener">FIRST<sup>®</sup> Events API</a></footer>
        </div>
      </div>`;
  }

  // — Step 1: FTC API credentials —
  function renderStep1(err) {
    shell(`
      <div class="setup-title">Welcome 👋</div>
      <div class="setup-sub">Let's set up your FTC competition dashboard. First, connect to the official <strong>FTC Events API</strong> — live schedules, scores and rankings come from there.</div>
      <div class="form-group">
        <label class="form-label">API Username</label>
        <input class="form-input" id="su-user" value="${escHtml(state.username)}" autocomplete="off" placeholder="Your FTC Events API username"/>
      </div>
      <div class="form-group">
        <label class="form-label">API Key</label>
        <input class="form-input" id="su-key" type="password" value="${escHtml(state.key)}" autocomplete="off" placeholder="Your authorization token"/>
        <div class="setting-hint">No credentials yet? Request free access at <a href="https://ftc-events.firstinspires.org/services/API" target="_blank" rel="noopener" style="color:var(--accent2)">ftc-events.firstinspires.org/services/API</a></div>
      </div>
      <div class="setup-error" id="su-err">${err?escHtml(err):''}</div>
      <button class="btn btn-primary btn-block" id="su-next1">Validate &amp; Continue →</button>
    `, 25);
    document.getElementById('su-next1').addEventListener('click', async () => {
      state.username = document.getElementById('su-user').value.trim();
      state.key      = document.getElementById('su-key').value.trim();
      const errEl = document.getElementById('su-err');
      if (!state.username || !state.key) { errEl.textContent = 'Enter both username and key.'; return; }
      const btn = document.getElementById('su-next1');
      btn.disabled = true; btn.textContent = 'Checking credentials…';
      const res = await API.setupValidate({username: state.username, key: state.key})
        .catch(() => ({valid:false, error:'Could not reach the server'}));
      if (!res.valid) { btn.disabled=false; btn.textContent='Validate & Continue →'; errEl.textContent = res.error || 'Invalid credentials'; return; }
      state.currentSeason = res.currentSeason;
      state.maxSeason     = res.maxSeason || res.currentSeason;
      if (!state.season) state.season = res.currentSeason;
      step = 2; renderStep2();
    });
  }

  // — Step 2: team / season / PIN —
  function renderStep2() {
    const seasons = [];
    for (let s = state.maxSeason || 2025; s >= 2019; s--) seasons.push(s);
    shell(`
      <div class="setup-title">Your Team ✓ <span class="setup-ok">API connected</span></div>
      <div class="setup-sub">Tell the dashboard who you are. Your team's matches get highlighted everywhere.</div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Team Number</label>
          <input class="form-input" id="su-team" inputmode="numeric" value="${escHtml(state.team)}" placeholder="e.g. 3650"/>
        </div>
        <div class="form-group">
          <label class="form-label">Season</label>
          <select class="form-select" id="su-season">
            ${seasons.map(s=>`<option value="${s}" ${String(s)===String(state.season)?'selected':''}>${s}–${String(s+1).slice(-2)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Event Code (optional)</label>
        <input class="form-input" id="su-event" value="${escHtml(state.eventCode)}" placeholder="e.g. USNYLIQ1 — or pick one later in Settings"/>
      </div>
      <div class="form-group">
        <label class="form-label">Team PIN (4 digits)</label>
        <input class="form-input" id="su-pin" inputmode="numeric" maxlength="4" value="${escHtml(state.pin)}" placeholder="Unlocks the app for your team"/>
      </div>
      <div class="setup-error" id="su-err"></div>
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-secondary" id="su-back2">← Back</button>
        <button class="btn btn-primary" style="flex:1" id="su-next2">Continue →</button>
      </div>
    `, 50);
    document.getElementById('su-back2').addEventListener('click', () => { step=1; renderStep1(); });
    document.getElementById('su-next2').addEventListener('click', () => {
      state.team      = document.getElementById('su-team').value.trim();
      state.season    = document.getElementById('su-season').value;
      state.eventCode = document.getElementById('su-event').value.trim();
      state.pin       = document.getElementById('su-pin').value.trim();
      const errEl = document.getElementById('su-err');
      if (!/^\d+$/.test(state.team)) { errEl.textContent='Team number must be numeric.'; return; }
      if (!/^\d{4}$/.test(state.pin)) { errEl.textContent='PIN must be exactly 4 digits.'; return; }
      step = 3; renderStep3();
    });
  }

  // — Step 3: branding & theme —
  function renderStep3() {
    shell(`
      <div class="setup-title">Make It Yours 🎨</div>
      <div class="setup-sub">Name your dashboard and pick your team colors — they apply to the whole app, including the home-screen icon title.</div>
      <div class="form-group">
        <label class="form-label">Dashboard Name</label>
        <div class="form-row" id="su-prefix-row" style="${state.useCustom?'display:none':''}">
          <input class="form-input" id="su-prefix" value="${escHtml(state.namePrefix)}" maxlength="12" placeholder="LL"/>
          <div class="setup-name-suffix">Dash</div>
        </div>
        <input class="form-input" id="su-custom-name" value="${escHtml(state.customName)}" maxlength="48"
               placeholder="Any name you like" style="${state.useCustom?'':'display:none'}"/>
        <label class="setting-hint" style="display:flex;align-items:center;gap:.45rem;margin-top:.45rem;cursor:pointer">
          <input type="checkbox" id="su-use-custom" ${state.useCustom?'checked':''} style="accent-color:var(--accent)"/>
          Use a fully custom name instead of "<span id="su-pattern-hint">${escHtml(dashName())}</span>"
        </label>
      </div>
      <div class="form-group">
        <label class="form-label">Theme Colors <span style="color:var(--text3);font-weight:400;text-transform:none">(live preview)</span></label>
        <div class="color-row"><input type="color" id="su-accent"  value="${state.accent}"/><span>Accent</span></div>
        <div class="color-row"><input type="color" id="su-accent2" value="${state.accent2}"/><span>Secondary</span></div>
        <div class="color-row"><input type="color" id="su-bg"      value="${state.bg}"/><span>Background</span></div>
      </div>
      <div class="setup-preview">
        <div class="setup-preview-logo" id="su-preview-logo">${brandHtml(dashName())}</div>
        <span class="team-chip red">1234</span><span class="team-chip blue our">${escHtml(state.team||'3650')}</span>
        <button class="btn btn-primary btn-sm" style="pointer-events:none">Button</button>
      </div>
      <div class="setup-error" id="su-err"></div>
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-secondary" id="su-back3">← Back</button>
        <button class="btn btn-primary" style="flex:1" id="su-finish">Finish Setup ✓</button>
      </div>
    `, 75);

    const preview = () => {
      state.namePrefix = document.getElementById('su-prefix').value;
      state.customName = document.getElementById('su-custom-name').value;
      state.useCustom  = document.getElementById('su-use-custom').checked;
      state.accent  = document.getElementById('su-accent').value;
      state.accent2 = document.getElementById('su-accent2').value;
      state.bg      = document.getElementById('su-bg').value;
      document.getElementById('su-prefix-row').style.display  = state.useCustom ? 'none' : '';
      document.getElementById('su-custom-name').style.display = state.useCustom ? '' : 'none';
      document.getElementById('su-pattern-hint').textContent  = `${state.namePrefix.trim()||'LL'} Dash`;
      document.getElementById('su-preview-logo').innerHTML    = brandHtml(dashName());
      applyTheme({accent:state.accent, accent2:state.accent2, bg:state.bg});
      document.title = dashName();
    };
    ['su-prefix','su-custom-name','su-accent','su-accent2','su-bg'].forEach(id=>
      document.getElementById(id).addEventListener('input', preview));
    document.getElementById('su-use-custom').addEventListener('change', preview);

    document.getElementById('su-back3').addEventListener('click', () => { step=2; renderStep2(); });
    document.getElementById('su-finish').addEventListener('click', async () => {
      preview();
      const btn = document.getElementById('su-finish');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        await API.completeSetup({
          ftc_api_username: state.username,
          ftc_api_key:      state.key,
          team_number:      state.team,
          team_pin:         state.pin,
          active_season:    state.season,
          active_event_code: state.eventCode,
          dashboard_name:   dashName(),
          theme_accent:     state.accent,
          theme_accent2:    state.accent2,
          theme_bg:         state.bg,
        });
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Finish Setup ✓';
        document.getElementById('su-err').textContent = (e.message||'Setup failed').replace(/^\d+:\s*/,'').replace(/[{}"]/g,'').replace('error:','');
        return;
      }
      shell(`
        <div class="setup-title">All Set 🎉</div>
        <div class="setup-sub">Your dashboard is configured. Loading <strong>${escHtml(dashName())}</strong>…</div>
      `, 100);
      setTimeout(()=>location.reload(), 900);
    });
  }

  renderStep1();
}
