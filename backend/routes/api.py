from flask import Blueprint, request, jsonify, current_app
from backend.extensions import db
from backend.models.models import AppSettings, ScoutingNote, AllianceFlag, TeamNote, Checklist
from backend.routes.auth import require_auth
from backend.services import ftc_api
import json

api_bp = Blueprint('api', __name__)


# ── Helpers ───────────────────────────────────────────────────
def _season():
    s = AppSettings.get('active_season')
    return int(s) if s else ftc_api.current_season()

def _event():
    return AppSettings.get('active_event_code')


# ── Settings ──────────────────────────────────────────────────
@api_bp.route('/settings', methods=['GET'])
def get_settings():
    return jsonify({
        'active_event_code': AppSettings.get('active_event_code'),
        'active_event_name': AppSettings.get('active_event_name'),
        'active_season':     _season(),
        'team_number':       current_app.config.get('TEAM_NUMBER', '3650'),
    })

@api_bp.route('/settings', methods=['POST'])
@require_auth
def update_settings():
    data = request.get_json() or {}
    for key in ('active_event_code', 'active_event_name', 'active_season'):
        if key in data and data[key] is not None:
            AppSettings.set(key, data[key])
    return jsonify({'success': True})


# ── Seasons / Events ──────────────────────────────────────────
@api_bp.route('/seasons', methods=['GET'])
def get_seasons():
    return jsonify(ftc_api.get_seasons())

@api_bp.route('/events', methods=['GET'])
def get_events():
    season = request.args.get('season', _season())
    team   = request.args.get('team')
    data   = ftc_api.get_events(season=season, team_number=team)
    return jsonify(data or {'events': [], 'eventCount': 0})


# ── Live data ─────────────────────────────────────────────────
def _require_event():
    e = request.args.get('event', _event())
    if not e:
        return None, (jsonify({'error': 'No event selected'}), 400)
    return e, None

@api_bp.route('/rankings', methods=['GET'])
def get_rankings():
    event, err = _require_event()
    if err: return err
    season = request.args.get('season', _season())
    return jsonify(ftc_api.get_rankings(season, event) or {'Rankings': []})

@api_bp.route('/schedule', methods=['GET'])
def get_schedule():
    event, err = _require_event()
    if err: return err
    season = request.args.get('season', _season())
    level  = request.args.get('level', 'qual')
    return jsonify(ftc_api.get_hybrid_schedule(season, event, level) or {'schedule': []})

@api_bp.route('/matches', methods=['GET'])
def get_matches():
    event, err = _require_event()
    if err: return err
    season = request.args.get('season', _season())
    level  = request.args.get('level', 'qual')
    return jsonify(ftc_api.get_match_scores(season, event, level) or {'MatchScores': []})

@api_bp.route('/oprs', methods=['GET'])
def get_oprs():
    event, err = _require_event()
    if err: return err
    season = request.args.get('season', _season())
    return jsonify(ftc_api.get_oprs(season, event) or {'oprList': []})

@api_bp.route('/teams', methods=['GET'])
def get_teams():
    event, err = _require_event()
    if err: return err
    season = request.args.get('season', _season())
    return jsonify(ftc_api.get_teams(season, event_code=event) or {'teams': []})

@api_bp.route('/team/<int:num>', methods=['GET'])
def get_team(num):
    season = request.args.get('season', _season())
    return jsonify(ftc_api.get_teams(season, team_number=num) or {'teams': []})

@api_bp.route('/alliances', methods=['GET'])
def get_alliances():
    event, err = _require_event()
    if err: return err
    season = request.args.get('season', _season())
    return jsonify(ftc_api.get_alliances(season, event) or {'alliances': []})

@api_bp.route('/awards', methods=['GET'])
def get_awards():
    event, err = _require_event()
    if err: return err
    season = request.args.get('season', _season())
    return jsonify(ftc_api.get_awards(season, event) or {'awards': []})

@api_bp.route('/advancement', methods=['GET'])
def get_advancement():
    event, err = _require_event()
    if err: return err
    season = request.args.get('season', _season())
    return jsonify(ftc_api.get_advancement(season, event) or {})


# ── Scouting ──────────────────────────────────────────────────
@api_bp.route('/scouting', methods=['GET'])
@require_auth
def get_scouting():
    season = request.args.get('season', _season())
    event  = request.args.get('event',  _event())
    team   = request.args.get('team')
    q = ScoutingNote.query.filter_by(season=int(season), event_code=event)
    if team:
        q = q.filter_by(team_number=int(team))
    return jsonify([n.to_dict() for n in q.order_by(ScoutingNote.created_at.desc()).all()])

@api_bp.route('/scouting', methods=['POST'])
@require_auth
def add_scouting():
    d = request.get_json() or {}
    note = ScoutingNote(
        season=int(d.get('season', _season())),
        event_code=d.get('event_code', _event()),
        team_number=int(d['team_number']),
        match_number=d.get('match_number') or None,
        scout_name=d.get('scout_name', 'Anonymous'),
        auto_score=d.get('auto_score') or None,
        teleop_score=d.get('teleop_score') or None,
        endgame_score=d.get('endgame_score') or None,
        penalties=d.get('penalties') or 0,
        driver_rating=d.get('driver_rating') or None,
        notes=d.get('notes') or None,
        auto_description=d.get('auto_description') or None,
        endgame_description=d.get('endgame_description') or None,
    )
    db.session.add(note)
    db.session.commit()
    return jsonify(note.to_dict()), 201

@api_bp.route('/scouting/<int:nid>', methods=['DELETE'])
@require_auth
def delete_scouting(nid):
    n = ScoutingNote.query.get_or_404(nid)
    db.session.delete(n)
    db.session.commit()
    return jsonify({'success': True})


# ── Alliance Flags ────────────────────────────────────────────
@api_bp.route('/flags', methods=['GET'])
@require_auth
def get_flags():
    season = request.args.get('season', _season())
    event  = request.args.get('event',  _event())
    flags  = AllianceFlag.query.filter_by(season=int(season), event_code=event).all()
    return jsonify({str(f.team_number): f.to_dict() for f in flags})

@api_bp.route('/flags/<int:team_number>', methods=['POST'])
@require_auth
def set_flag(team_number):
    d      = request.get_json() or {}
    season = int(d.get('season', _season()))
    event  = d.get('event_code', _event())
    f = AllianceFlag.query.filter_by(season=season, event_code=event, team_number=team_number).first()
    if not f:
        f = AllianceFlag(season=season, event_code=event, team_number=team_number)
        db.session.add(f)
    f.flag       = d.get('flag', 'neutral')
    f.pick_order = d.get('pick_order')
    db.session.commit()
    return jsonify(f.to_dict())


# ── Hub Notes ─────────────────────────────────────────────────
@api_bp.route('/hub/notes', methods=['GET'])
@require_auth
def get_hub_notes():
    notes = TeamNote.query.order_by(TeamNote.pinned.desc(), TeamNote.created_at.desc()).all()
    return jsonify([n.to_dict() for n in notes])

@api_bp.route('/hub/notes', methods=['POST'])
@require_auth
def add_hub_note():
    d = request.get_json() or {}
    n = TeamNote(
        author=d.get('author', 'Anonymous'),
        title=d.get('title', 'Untitled'),
        content=d.get('content', ''),
        category=d.get('category', 'general'),
        pinned=bool(d.get('pinned', False)),
    )
    db.session.add(n)
    db.session.commit()
    return jsonify(n.to_dict()), 201

@api_bp.route('/hub/notes/<int:nid>', methods=['DELETE'])
@require_auth
def delete_hub_note(nid):
    n = TeamNote.query.get_or_404(nid)
    db.session.delete(n)
    db.session.commit()
    return jsonify({'success': True})


# ── Checklists ────────────────────────────────────────────────
@api_bp.route('/hub/checklists', methods=['GET'])
@require_auth
def get_checklists():
    return jsonify([c.to_dict() for c in Checklist.query.all()])

@api_bp.route('/hub/checklists', methods=['POST'])
@require_auth
def add_checklist():
    d = request.get_json() or {}
    c = Checklist(
        name=d.get('name', 'Checklist'),
        category=d.get('category', 'general'),
        items_json=json.dumps(d.get('items', [])),
    )
    db.session.add(c)
    db.session.commit()
    return jsonify(c.to_dict()), 201


# ── FTCScout proxy ────────────────────────────────────────────
# Proxies requests to api.ftcscout.org so CORS isn't a problem from mobile
import requests as _req

@api_bp.route('/ftcscout/team/<int:num>', methods=['GET'])
def ftcscout_team(num):
    season = request.args.get('season', _season())
    try:
        r = _req.get(f'https://api.ftcscout.org/rest/v1/teams/{num}/quick-stats?season={season}', timeout=8)
        print(f"[FTCScout quick-stats {num}] status={r.status_code} body={r.text[:300]}")
        if r.status_code == 200:
            return jsonify(r.json())
        return jsonify({}), r.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/ftcscout/team/<int:num>/events', methods=['GET'])
def ftcscout_team_events(num):
    """Get all events a team attended this season - for previous competition history"""
    season = request.args.get('season', _season())
    try:
        r = _req.get(f'https://api.ftcscout.org/rest/v1/teams/{num}/events/{season}', timeout=10)
        print(f"[FTCScout team events {num}] status={r.status_code} body={r.text[:300]}")
        if r.status_code == 200:
            return jsonify(r.json())
        return jsonify([]), r.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/ftcscout/event/<event_code>/teams', methods=['GET'])
def ftcscout_event_teams(event_code):
    season = request.args.get('season', _season())
    try:
        r = _req.get(f'https://api.ftcscout.org/rest/v1/events/{season}/{event_code}/teams', timeout=8)
        print(f"[FTCScout event teams {event_code}] status={r.status_code} body={r.text[:300]}")
        if r.status_code == 200:
            return jsonify(r.json())
        return jsonify([]), r.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500
