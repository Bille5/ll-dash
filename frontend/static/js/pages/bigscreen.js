// ── Big Screen view ───────────────────────────────────────────
// Designed for a pit monitor/TV. Panels (qual schedule, rankings,
// playoffs), refresh interval and cycle interval are configurable in
// Settings → Pages. Auto-refreshes — no interaction needed.

async function bigscreen() {
  if (!appSettings.active_event_code) { noEventPage(); return; }
  document.body.classList.add('bigscreen-mode');
  renderPage('<div class="bs-root" id="bs-root"><div class="loading" style="margin:auto">Loading</div></div>');

  const cfg = appSettings.bigscreen || {};
  const panelsCfg = cfg.panels || {schedule: true, rankings: true, playoffs: true};
  const refreshMs = (cfg.refresh_seconds || 45) * 1000;
  const cycleMs   = (cfg.cycle_seconds || 15) * 1000;
  const enabled   = ['schedule', 'rankings', 'playoffs'].filter(k => panelsCfg[k]);

  const timers = [];
  let cycle = localStorage.getItem('bs_cycle') === '1';
  let cycleIdx = 0;
  let data = { matches: [], rankings: [], fieldsByMatch: {}, playoffMatches: [], alliances: [] };

  const escListener = e => { if (e.key === 'Escape') navigateTo('dashboard'); };
  document.addEventListener('keydown', escListener);
  window._bsCleanup = () => {
    timers.forEach(clearInterval);
    document.removeEventListener('keydown', escListener);
    document.body.classList.remove('bigscreen-mode');
  };

  async function load() {
    const wantPlayoffs = enabled.includes('playoffs');
    const [schedData, rankData, fieldsData, poData, allianceData] = await Promise.all([
      enabled.includes('schedule') ? API.getSchedule('qual').catch(() => null) : null,
      enabled.includes('rankings') ? API.getRankings().catch(() => null) : null,
      enabled.includes('schedule') ? API.getScheduleFields('qual').catch(() => null) : null,
      wantPlayoffs ? API.getPlayoffSchedule().catch(() => null) : null,
      wantPlayoffs ? API.getAlliances().catch(() => null) : null,
    ]);
    if (currentPage !== 'bigscreen') return;  // stale fetch — user navigated away
    data.matches        = schedData?.schedule || [];
    data.rankings       = rankData?.rankings || rankData?.Rankings || [];
    data.fieldsByMatch  = fieldsData?.fieldsByMatch || {};
    data.playoffMatches = poData?.schedule || [];
    data.alliances      = allianceData?.alliances || allianceData?.Alliances || [];
    render();
  }

  function chips(list, cls) {
    return list.map(t =>
      `<span class="bs-chip ${cls}${t.teamNumber == TEAM_NUMBER ? ' our' : ''}">${t.teamNumber}</span>`
    ).join('');
  }

  function scoreOrTime(m) {
    const played = m.scoreRedFinal !== null && m.scoreRedFinal !== undefined;
    if (!played) return `<div class="bs-time">${formatTime(m.startTime)}</div>`;
    const isTie = !m.redWins && !m.blueWins;
    return `<div class="bs-score">
        <span class="bs-score-r ${m.redWins ? 'win' : ''}">${m.scoreRedFinal}</span>
        <span class="bs-score-sep">–</span>
        <span class="bs-score-b ${m.blueWins ? 'win' : ''}">${m.scoreBlueFinal}</span>
        ${isTie ? '<span class="bs-tie">TIE</span>' : ''}
      </div>`;
  }

  function matchRow(m, isCurrent) {
    const played = m.scoreRedFinal !== null;
    const red  = (m.teams || []).filter(t => t.station?.startsWith('Red'));
    const blue = (m.teams || []).filter(t => t.station?.startsWith('Blue'));
    const field = data.fieldsByMatch[String(m.matchNumber)] ||
                  (m.series != null ? `Field ${m.series + 1}` : '');
    const ours = m.teams?.some(t => t.teamNumber == TEAM_NUMBER);
    return `
      <div class="bs-match ${isCurrent ? 'bs-current' : ''} ${ours ? 'bs-ours' : ''} ${played ? 'bs-played' : ''}">
        <div class="bs-qnum">Q${m.matchNumber}${isCurrent ? '<div class="bs-now">UP NEXT</div>' : ''}</div>
        <div class="bs-teams">${chips(red, 'red')}</div>
        ${scoreOrTime(m)}
        <div class="bs-teams bs-right">${chips(blue, 'blue')}</div>
        <div class="bs-field">${field}</div>
      </div>`;
  }

  function schedulePanel() {
    const matches = data.matches;
    let currentIdx = matches.findIndex(m => m.scoreRedFinal === null);
    let visible;
    if (!matches.length) {
      visible = [];
    } else if (currentIdx === -1) {        // event over — show the last matches
      visible = matches.slice(-12).map(m => [m, false]);
    } else {
      const done = matches.slice(Math.max(0, currentIdx - 3), currentIdx);
      const next = matches.slice(currentIdx, currentIdx + 10);
      visible = [...done.map(m => [m, false]), ...next.map((m, i) => [m, i === 0])];
    }
    return `
      <section class="bs-panel bs-schedule">
        <div class="bs-panel-title">Qualification Schedule</div>
        ${visible.length ? visible.map(([m, cur]) => matchRow(m, cur)).join('') : '<div class="empty-state">No schedule yet.</div>'}
      </section>`;
  }

  function rankingsPanel() {
    const rankHtml = data.rankings.length
      ? data.rankings.slice(0, 16).map(r => `
          <div class="bs-rank-row ${r.teamNumber == TEAM_NUMBER ? 'bs-ours' : ''}">
            <span class="bs-rank-pos">${r.rank}</span>
            <span class="bs-rank-team">${r.teamNumber}</span>
            <span class="bs-rank-name">${escHtml(r.teamName || '')}</span>
            <span class="bs-rank-rp">${r.sortOrder1?.toFixed(2) ?? '--'}</span>
            <span class="bs-rank-wl">${r.wins}-${r.losses}${r.ties ? '-' + r.ties : ''}</span>
          </div>`).join('')
      : '<div class="empty-state">No rankings yet.</div>';
    return `
      <aside class="bs-panel bs-rankings">
        <div class="bs-panel-title">Rankings</div>
        <div class="bs-rank-row bs-rank-head">
          <span class="bs-rank-pos">#</span><span class="bs-rank-team">Team</span>
          <span class="bs-rank-name"></span><span class="bs-rank-rp">RP</span><span class="bs-rank-wl">W-L</span>
        </div>
        ${rankHtml}
      </aside>`;
  }

  function playoffPanel() {
    const bracket = buildBracketHtml(data.playoffMatches, data.alliances);
    let body;
    if (bracket) {
      body = bracket;
    } else if (data.playoffMatches.length) {
      // non-double-elim format → grouped rounds list
      const aMap = allianceMap(data.alliances);
      const rounds = groupPlayoffRounds(data.playoffMatches);
      const aBadge = list => {
        const n = list.map(t => aMap[t.teamNumber]).find(v => v != null);
        return n != null ? `<span class="bs-abadge">A${n}</span>` : '';
      };
      body = rounds.map(round => `
        <div class="bs-round-label">${escHtml(round.label)}</div>
        ${round.matches.map(m => {
          const red  = (m.teams || []).filter(t => t.station?.startsWith('Red'));
          const blue = (m.teams || []).filter(t => t.station?.startsWith('Blue'));
          const played = m.scoreRedFinal !== null && m.scoreRedFinal !== undefined;
          const ours = m.teams?.some(t => t.teamNumber == TEAM_NUMBER);
          return `
            <div class="bs-match ${ours ? 'bs-ours' : ''} ${played ? 'bs-played' : ''}">
              <div class="bs-qnum" style="font-size:clamp(.7rem,1vw,1rem)">${escHtml((m.description || 'M' + m.matchNumber).replace(/Match/i, 'M'))}</div>
              <div class="bs-teams">${aBadge(red)}${chips(red, 'red')}</div>
              ${scoreOrTime(m)}
              <div class="bs-teams bs-right">${chips(blue, 'blue')}${aBadge(blue)}</div>
              <div class="bs-field"></div>
            </div>`;
        }).join('')}`).join('');
    } else {
      body = '<div class="empty-state">No playoff matches yet.</div>';
    }
    return `
      <section class="bs-panel bs-playoffs">
        <div class="bs-panel-title">Playoffs</div>
        ${body}
      </section>`;
  }

  const PANEL_RENDERERS = { schedule: schedulePanel, rankings: rankingsPanel, playoffs: playoffPanel };
  const PANEL_WIDTHS    = { schedule: '2fr', rankings: '1fr', playoffs: '1.6fr' };

  function render() {
    if (!document.getElementById('bs-root')) return;  // navigated away
    const shown = cycle ? [enabled[cycleIdx % enabled.length]] : enabled;
    const gridCols = shown.map(k => PANEL_WIDTHS[k]).join(' ');

    document.getElementById('bs-root').innerHTML = `
      <header class="bs-header">
        <div class="bs-brand">${brandHtml(appSettings.dashboard_name)}</div>
        <div class="bs-event">${escHtml(appSettings.active_event_name || '')}</div>
        <div class="bs-clock" id="bs-clock"></div>
        <div class="bs-controls">
          ${enabled.length > 1 ? `<button class="icon-btn ${cycle ? 'bs-toggle-on' : ''}" id="bs-cycle-btn" title="Auto-cycle panels every ${cycleMs / 1000}s">⟳</button>` : ''}
          <button class="icon-btn" id="bs-exit-btn" title="Exit big screen">✕</button>
        </div>
      </header>
      <div class="bs-grid" style="grid-template-columns:${gridCols}">
        ${shown.map(k => PANEL_RENDERERS[k]()).join('')}
      </div>
      <footer class="attribution bs-attribution">Auto-refreshes every ${refreshMs / 1000}s · Event data provided by <a href="https://frc-events.firstinspires.org/services/API" target="_blank" rel="noopener">FIRST<sup>®</sup> Events API</a></footer>`;

    tickClock();
    document.getElementById('bs-exit-btn').addEventListener('click', () => navigateTo('dashboard'));
    document.getElementById('bs-cycle-btn')?.addEventListener('click', () => {
      cycle = !cycle;
      localStorage.setItem('bs_cycle', cycle ? '1' : '0');
      cycleIdx = 0;
      render();
    });
  }

  function tickClock() {
    const el = document.getElementById('bs-clock');
    if (el) el.textContent = new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'});
  }

  timers.push(setInterval(load, refreshMs));
  timers.push(setInterval(tickClock, 1000));
  timers.push(setInterval(() => {
    if (!cycle || enabled.length < 2) return;
    cycleIdx = (cycleIdx + 1) % enabled.length;
    render();
  }, cycleMs));

  await load();
}
