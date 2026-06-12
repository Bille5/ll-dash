// ── Big Screen view ───────────────────────────────────────────
// Designed for a pit monitor/TV: full qualification schedule with the
// current match highlighted, field assignments, scores for completed
// matches and live rankings. Auto-refreshes — no interaction needed.

const BS_REFRESH_MS = 45000;   // data refresh
const BS_CYCLE_MS   = 15000;   // schedule/rankings cycle (when enabled)

async function bigscreen() {
  if (!appSettings.active_event_code) { noEventPage(); return; }
  document.body.classList.add('bigscreen-mode');
  renderPage('<div class="bs-root" id="bs-root"><div class="loading" style="margin:auto">Loading</div></div>');

  const timers = [];
  let cycle = localStorage.getItem('bs_cycle') === '1';
  let cyclePanel = 'schedule';
  let data = { matches: [], rankings: [], fieldsByMatch: {} };

  const escListener = e => { if (e.key === 'Escape') navigateTo('dashboard'); };
  document.addEventListener('keydown', escListener);
  window._bsCleanup = () => {
    timers.forEach(clearInterval);
    document.removeEventListener('keydown', escListener);
    document.body.classList.remove('bigscreen-mode');
  };

  async function load() {
    const [schedData, rankData, fieldsData] = await Promise.all([
      API.getSchedule('qual').catch(() => null),
      API.getRankings().catch(() => null),
      API.getScheduleFields('qual').catch(() => null),
    ]);
    if (currentPage !== 'bigscreen') return;  // stale fetch — user navigated away
    data.matches      = schedData?.schedule || [];
    data.rankings     = rankData?.rankings || rankData?.Rankings || [];
    data.fieldsByMatch = fieldsData?.fieldsByMatch || {};
    render();
  }

  function chips(list, cls) {
    return list.map(t =>
      `<span class="bs-chip ${cls}${t.teamNumber == TEAM_NUMBER ? ' our' : ''}">${t.teamNumber}</span>`
    ).join('');
  }

  function matchRow(m, isCurrent) {
    const played = m.scoreRedFinal !== null;
    const red  = (m.teams || []).filter(t => t.station?.startsWith('Red'));
    const blue = (m.teams || []).filter(t => t.station?.startsWith('Blue'));
    const field = data.fieldsByMatch[String(m.matchNumber)] ||
                  (m.series != null ? `Field ${m.series + 1}` : '');
    const ours = m.teams?.some(t => t.teamNumber == TEAM_NUMBER);
    const isTie = played && !m.redWins && !m.blueWins;
    const mid = played
      ? `<div class="bs-score">
           <span class="bs-score-r ${m.redWins ? 'win' : ''}">${m.scoreRedFinal}</span>
           <span class="bs-score-sep">–</span>
           <span class="bs-score-b ${m.blueWins ? 'win' : ''}">${m.scoreBlueFinal}</span>
           ${isTie ? '<span class="bs-tie">TIE</span>' : ''}
         </div>`
      : `<div class="bs-time">${formatTime(m.startTime)}</div>`;
    return `
      <div class="bs-match ${isCurrent ? 'bs-current' : ''} ${ours ? 'bs-ours' : ''} ${played ? 'bs-played' : ''}">
        <div class="bs-qnum">Q${m.matchNumber}${isCurrent ? '<div class="bs-now">UP NEXT</div>' : ''}</div>
        <div class="bs-teams">${chips(red, 'red')}</div>
        ${mid}
        <div class="bs-teams bs-right">${chips(blue, 'blue')}</div>
        <div class="bs-field">${field}</div>
      </div>`;
  }

  function render() {
    if (!document.getElementById('bs-root')) return;  // navigated away
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

    const schedHtml = visible.length
      ? visible.map(([m, cur]) => matchRow(m, cur)).join('')
      : '<div class="empty-state">No schedule yet.</div>';

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

    document.getElementById('bs-root').innerHTML = `
      <header class="bs-header">
        <div class="bs-brand">${brandHtml(appSettings.dashboard_name)}</div>
        <div class="bs-event">${escHtml(appSettings.active_event_name || '')}</div>
        <div class="bs-clock" id="bs-clock"></div>
        <div class="bs-controls">
          <button class="icon-btn ${cycle ? 'bs-toggle-on' : ''}" id="bs-cycle-btn" title="Auto-cycle schedule / rankings">⟳</button>
          <button class="icon-btn" id="bs-exit-btn" title="Exit big screen">✕</button>
        </div>
      </header>
      <div class="bs-grid ${cycle ? 'bs-cycling bs-show-' + cyclePanel : ''}">
        <section class="bs-panel bs-schedule">
          <div class="bs-panel-title">Qualification Schedule</div>
          ${schedHtml}
        </section>
        <aside class="bs-panel bs-rankings">
          <div class="bs-panel-title">Rankings</div>
          <div class="bs-rank-row bs-rank-head">
            <span class="bs-rank-pos">#</span><span class="bs-rank-team">Team</span>
            <span class="bs-rank-name"></span><span class="bs-rank-rp">RP</span><span class="bs-rank-wl">W-L</span>
          </div>
          ${rankHtml}
        </aside>
      </div>
      <footer class="attribution bs-attribution">Auto-refreshes every ${BS_REFRESH_MS / 1000}s · Event data provided by <a href="https://frc-events.firstinspires.org/services/API" target="_blank" rel="noopener">FIRST<sup>®</sup> Events API</a></footer>`;

    tickClock();
    document.getElementById('bs-exit-btn').addEventListener('click', () => navigateTo('dashboard'));
    document.getElementById('bs-cycle-btn').addEventListener('click', () => {
      cycle = !cycle;
      localStorage.setItem('bs_cycle', cycle ? '1' : '0');
      cyclePanel = 'schedule';
      render();
    });
  }

  function tickClock() {
    const el = document.getElementById('bs-clock');
    if (el) el.textContent = new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'});
  }

  timers.push(setInterval(load, BS_REFRESH_MS));
  timers.push(setInterval(tickClock, 1000));
  timers.push(setInterval(() => {
    if (!cycle) return;
    cyclePanel = cyclePanel === 'schedule' ? 'rankings' : 'schedule';
    const grid = document.querySelector('.bs-grid');
    if (grid) grid.className = `bs-grid bs-cycling bs-show-${cyclePanel}`;
  }, BS_CYCLE_MS));

  await load();
}
