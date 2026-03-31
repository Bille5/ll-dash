const API = {
  async _f(method, path, body) {
    const opts = { method, headers: {} };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const r = await fetch(path, opts);
    if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
    return r.json();
  },
  get:    p    => API._f('GET',    '/api' + p),
  post:   (p,b)=> API._f('POST',   '/api' + p, b),
  delete: p    => API._f('DELETE', '/api' + p),

  login:     pin => fetch('/auth/login',  {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin})}).then(r=>r.json()),
  logout:    ()  => fetch('/auth/logout', {method:'POST'}),
  checkAuth: ()  => fetch('/auth/check').then(r=>r.json()),

  getSettings:  ()  => API.get('/settings'),
  saveSettings: d   => API.post('/settings', d),

  getSeasons:   ()      => API.get('/seasons'),
  getEvents:    season  => API.get(`/events?season=${season}`),
  getRankings:  ()      => API.get('/rankings'),
  getSchedule:  (l='qual') => API.get(`/schedule?level=${l}`),
  getMatches:   (l='qual') => API.get(`/matches?level=${l}`),
  getOprs:      ()      => API.get('/oprs'),
  getTeams:     ()      => API.get('/teams'),
  getTeam:      num     => API.get(`/team/${num}`),
  getAlliances:  ()      => API.get('/alliances'),

  getScouting:    team  => API.get('/scouting' + (team ? `?team=${team}` : '')),
  addScouting:    d     => API.post('/scouting', d),
  deleteScouting: id    => API.delete(`/scouting/${id}`),

  getFlags: ()             => API.get('/flags'),
  setFlag:  (team,flag,order) => API.post(`/flags/${team}`, {flag, pick_order:order}),

  getHubNotes:   ()  => API.get('/hub/notes'),
  addHubNote:    d   => API.post('/hub/notes', d),
  deleteHubNote: id  => API.delete(`/hub/notes/${id}`),
  getChecklists: ()  => API.get('/hub/checklists'),
  addChecklist:  d   => API.post('/hub/checklists', d),
};

// FTCScout (proxied through our backend to avoid CORS)
API.ftcscoutTeam       = (num, season)  => API.get(`/ftcscout/team/${num}?season=${season||2025}`).catch(()=>null);
API.ftcscoutTeamEvents = (num, season)  => API.get(`/ftcscout/team/${num}/events?season=${season||2025}`).catch(()=>null);
API.ftcscoutEvent      = (code, season) => API.get(`/ftcscout/event/${code}/teams?season=${season||2025}`).catch(()=>null);
