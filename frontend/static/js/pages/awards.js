// ── Awards page ───────────────────────────────────────────────
// Lists event awards grouped by award, split into judged vs performance
// categories, with optional accent highlighting of our team's awards.

const JUDGED_AWARD_ORDER = ['inspire', 'think', 'connect', 'innovate', 'control',
                            'motivate', 'design', 'promote', 'compass', 'judges', "dean's list"];

function awardCategory(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('winning alliance') || n.includes('finalist alliance') ||
      n.includes('winner') && n.includes('alliance')) return 'performance';
  return 'judged';
}

function awardSortIndex(name) {
  const n = (name || '').toLowerCase();
  const i = JUDGED_AWARD_ORDER.findIndex(k => n.includes(k));
  return i === -1 ? JUDGED_AWARD_ORDER.length : i;
}

async function awards() {
  if (!appSettings.active_event_code) { noEventPage(); return; }
  loadingPage();

  const [awardData, rankData] = await Promise.all([
    API.getAwards().catch(() => null),
    API.getRankings().catch(() => null),
  ]);
  if (currentPage !== 'awards') return;  // stale fetch — user navigated away

  const list     = awardData?.awards || awardData?.Awards || [];
  const rankings = rankData?.rankings || rankData?.Rankings || [];
  rankings.forEach(r => { window._teamNames = window._teamNames || {}; window._teamNames[r.teamNumber] = r.teamName || ''; });
  const highlightOurs = appSettings.awards_highlight_ours !== false;

  if (!list.length) {
    renderPage(`
      <div class="page-title">Awards</div>
      <div class="empty-state"><div class="empty-icon">🏆</div><div>No awards posted yet.</div>
      <div style="margin-top:.5rem;font-size:.75rem">Awards appear here once the event publishes them.</div></div>`);
    return;
  }

  // Group recipients by award name, keep series order (1st, 2nd, …)
  const byAward = {};
  list.forEach(a => {
    const name = a.name || a.awardName || 'Award';
    if (!byAward[name]) byAward[name] = [];
    byAward[name].push(a);
  });
  const groups = Object.entries(byAward).map(([name, recipients]) => ({
    name,
    category: awardCategory(name),
    recipients: recipients.sort((a, b) => (a.series || 0) - (b.series || 0)),
  }));
  groups.sort((a, b) => awardSortIndex(a.name) - awardSortIndex(b.name) || a.name.localeCompare(b.name));

  const seriesLabel = (s, n) => n <= 1 ? '' : s === 1 ? 'Winner' : s === 2 ? '2nd' : s === 3 ? '3rd' : `${s}th`;

  const groupCard = g => `
    <div class="card">
      <div class="card-header" style="margin-bottom:.4rem">
        <span class="card-title">🏆 ${escHtml(g.name)}</span>
      </div>
      ${g.recipients.map(r => {
        const team  = r.teamNumber;
        const ours  = highlightOurs && team != null && team == TEAM_NUMBER;
        const tName = r.fullTeamName || r.teamName || (team != null ? window._teamNames?.[team] : '') || '';
        const lbl   = seriesLabel(r.series, g.recipients.length);
        return `
          <div class="award-row ${ours ? 'award-ours' : ''}" ${team != null ? `onclick="openTeamModal(${team})" style="cursor:pointer"` : ''}>
            ${lbl ? `<span class="award-series">${lbl}</span>` : ''}
            ${team != null ? `<span class="award-team">${team}</span>` : ''}
            <span class="award-name">${escHtml(r.person || tName || '—')}</span>
            ${r.person && tName ? `<span class="award-sub">${escHtml(tName)}</span>` : ''}
            ${ours ? '<span class="award-star">★</span>' : ''}
          </div>`;
      }).join('')}
    </div>`;

  const judged = groups.filter(g => g.category === 'judged');
  const perf   = groups.filter(g => g.category === 'performance');

  renderPage(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.25rem">
      <div class="page-title" style="margin-bottom:0">Awards</div>
      <button class="icon-btn" onclick="awards()" title="Reload">↻</button>
    </div>
    <div style="font-size:.73rem;font-family:var(--mono);color:var(--text2);margin-bottom:.75rem">${escHtml(appSettings.active_event_name || '')} · ${list.length} award${list.length > 1 ? 's' : ''}</div>
    ${judged.length ? `<div class="section-label">Judged Awards</div>${judged.map(groupCard).join('')}` : ''}
    ${perf.length ? `<div class="section-label" style="margin-top:.75rem">Performance Awards</div>${perf.map(groupCard).join('')}` : ''}
  `);
}
