// ── Awards page ───────────────────────────────────────────────
// The FTC API returns one award entry per place, with the place baked
// into the name ("Think Award 2nd Place", "Winning Alliance - Captain"),
// names that may contain HTML ("<i>FIRST</i>® Leadership Award"),
// placeholder entries with no recipient, and fullTeamName as a long
// sponsor string ("Sponsor1/Sponsor2&School"). This page normalizes all
// of that: groups by base award, labels places/roles, skips empty
// entries, and shows short team names.

const JUDGED_AWARD_ORDER = ['inspire', 'think', 'connect', 'innovate', 'control',
                            'motivate', 'design', 'judges', 'promote', 'compass',
                            'reach', 'sustain', 'leadership', "dean's list"];

function stripAwardHtml(name) {
  return String(name || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// "Think Award 2nd Place" → {base:"Think Award", place:"2nd"}
// "Winning Alliance - Captain" → {base:"Winning Alliance", place:"Captain"}
function splitAwardPlace(name) {
  let m = name.match(/^(.*?)\s+(2nd|3rd|4th|5th|6th)\s+Place$/i);
  if (m) return {base: m[1].trim(), place: m[2]};
  m = name.match(/^(.*?)\s*-\s*(Captain|(\d)(?:st|nd|rd|th) Team Selected|Backup)$/i);
  if (m) {
    const role = /captain/i.test(m[2]) ? 'Captain'
               : /backup/i.test(m[2]) ? 'Backup'
               : `Pick ${m[2].match(/\d/)[0]}`;
    return {base: m[1].trim(), place: role};
  }
  return {base: name, place: null};
}

function awardCategory(base) {
  const n = base.toLowerCase();
  return (n.includes('winning alliance') || n.includes('finalist alliance')) ? 'performance' : 'judged';
}

function awardSortIndex(base) {
  const n = base.toLowerCase();
  if (n.includes('winning alliance')) return -2;   // performance ordering
  if (n.includes('finalist alliance')) return -1;
  const i = JUDGED_AWARD_ORDER.findIndex(k => n.includes(k));
  return i === -1 ? JUDGED_AWARD_ORDER.length : i;
}

// Short team name: rankings/teams map first, otherwise the school part of
// fullTeamName ("Sponsor1/Sponsor2&School" → "School"). Never the sponsor blob.
function awardTeamName(r) {
  const fromMap = r.teamNumber != null ? window._teamNames?.[r.teamNumber] : '';
  if (fromMap) return fromMap;
  const full = stripAwardHtml(r.fullTeamName || r.teamName || '');
  if (!full) return '';
  const parts = full.split('&').map(s => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : full;
}

async function awards() {
  if (!appSettings.active_event_code) { noEventPage(); return; }
  loadingPage();

  const [awardData, rankData, teamData] = await Promise.all([
    API.getAwards().catch(() => null),
    API.getRankings().catch(() => null),
    API.getTeams().catch(() => null),
  ]);
  if (currentPage !== 'awards') return;  // stale fetch — user navigated away

  const list     = awardData?.awards || awardData?.Awards || [];
  const rankings = rankData?.rankings || rankData?.Rankings || [];
  window._teamNames = window._teamNames || {};
  rankings.forEach(r => { window._teamNames[r.teamNumber] = r.teamName || ''; });
  (teamData?.teams || []).forEach(t => {
    if (t.teamNumber && t.nameShort) window._teamNames[t.teamNumber] = t.nameShort;
  });
  const highlightOurs = appSettings.awards_highlight_ours !== false;

  // Drop placeholder entries with no recipient at all
  const entries = list
    .map(a => ({...a, _name: stripAwardHtml(a.name || a.awardName || 'Award')}))
    .filter(a => a.teamNumber != null || (a.person && String(a.person).trim()));

  if (!entries.length) {
    renderPage(`
      <div class="page-title">Awards</div>
      <div class="empty-state"><div class="empty-icon">🏆</div><div>No awards posted yet.</div>
      <div style="margin-top:.5rem;font-size:.75rem">Awards appear here once the event publishes them.</div></div>`);
    return;
  }

  // Group by base award name; "2nd Place"/"- Captain" variants fold in
  const byAward = {};
  const order = [];
  entries.forEach(a => {
    const {base, place} = splitAwardPlace(a._name);
    if (!byAward[base]) { byAward[base] = []; order.push(base); }
    byAward[base].push({...a, _place: place});
  });

  const placeRank = p => p == null ? 0
    : /^2nd/.test(p) ? 2 : /^3rd/.test(p) ? 3 : /^4th/.test(p) ? 4
    : p === 'Captain' ? 0 : /^Pick (\d)/.test(p) ? parseInt(p.match(/\d/)[0]) : 9;

  const groups = order.map(base => ({
    base,
    category: awardCategory(base),
    recipients: byAward[base].sort((a, b) =>
      placeRank(a._place) - placeRank(b._place) || (a.series || 0) - (b.series || 0)),
  }));
  groups.sort((a, b) => awardSortIndex(a.base) - awardSortIndex(b.base) || a.base.localeCompare(b.base));

  const groupCard = g => `
    <div class="card">
      <div class="card-header" style="margin-bottom:.4rem">
        <span class="card-title">🏆 ${escHtml(g.base)}</span>
      </div>
      ${g.recipients.map(r => {
        const team  = r.teamNumber;
        const ours  = highlightOurs && team != null && team == TEAM_NUMBER;
        const tName = awardTeamName(r);
        const person = r.person && String(r.person).trim();
        const lbl = r._place || (g.recipients.length > 1 ? 'Winner' : '');
        return `
          <div class="award-row ${ours ? 'award-ours' : ''}" ${team != null ? `onclick="openTeamModal(${team})" style="cursor:pointer"` : ''}>
            ${lbl ? `<span class="award-series">${escHtml(lbl)}</span>` : ''}
            ${team != null ? `<span class="award-team">${team}</span>` : ''}
            <span class="award-name">${escHtml(person || tName || '—')}</span>
            ${person && tName ? `<span class="award-sub">${escHtml(tName)}</span>` : ''}
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
    <div style="font-size:.73rem;font-family:var(--mono);color:var(--text2);margin-bottom:.75rem">${escHtml(appSettings.active_event_name || '')} · ${entries.length} award${entries.length > 1 ? 's' : ''}</div>
    ${perf.length ? `<div class="section-label">Performance Awards</div>${perf.map(groupCard).join('')}` : ''}
    ${judged.length ? `<div class="section-label" style="margin-top:.75rem">Judged Awards</div>${judged.map(groupCard).join('')}` : ''}
  `);
}
