"""
FTC Events API v2.0 client
Base: https://ftc-api.firstinspires.org/v2.0
Auth: Basic base64(username:token)

Key response shapes (from swagger):
  /v2.0/                             -> {currentSeason, maxSeason, ...}
  /v2.0/{s}/events                   -> {events:[{eventId,code,name,type,typeName,
                                          city,stateprov,country,dateStart,dateEnd,
                                          venue,regionCode,leagueCode,published,...}]}
  /v2.0/{s}/teams                    -> {teams:[{teamNumber,nameShort,nameFull,
                                          city,stateProv,country,rookieYear,...}]}
  /v2.0/{s}/rankings/{code}          -> {Rankings:[{rank,teamNumber,wins,losses,ties,
                                          rankingPoints,tieBreakerPoints,
                                          matchesPlayed,qualAverage,...}]}
  /v2.0/{s}/schedule/{code}/{lvl}/hybrid -> {schedule:[{matchNumber,startTime,
                                          actualStartTime,description,
                                          teams:[{teamNumber,station,alliance,
                                                  surrogate,noShow}],
                                          scoreRedFinal,scoreBlueFinal,
                                          scoreRedAuto,scoreBlueAuto,...}]}
                                          (score fields null when unplayed)
  /v2.0/{s}/scores/{code}/{lvl}      -> {MatchScores:[{matchNumber,matchLevel,
                                          alliances:[{alliance,totalPoints,
                                          autoPoints,dcPoints,endgamePoints,
                                          penaltyPoints,...}]}]}
  /v2.0/{s}/oprs/{code}             -> {oprList:[{teamNumber,opr,np_opr}]}
  /v2.0/{s}/alliances/{code}        -> {alliances:[{number,name,captain,
                                          round1,round2,round3,...}]}
  /v2.0/{s}/awards/{code}           -> {awards:[{awardId,teamNumber,awardName,...}]}
  /v2.0/{s}/advancement/{code}      -> {advancement:[{teamNumber,advancedTo,...}]}
"""
import os
import base64
import requests
from datetime import datetime

FTC_BASE = "https://ftc-api.firstinspires.org/v2.0"


def _headers():
    u = os.getenv('FTC_API_USERNAME', '')
    k = os.getenv('FTC_API_KEY', '')
    tok = base64.b64encode(f"{u}:{k}".encode()).decode()
    return {'Authorization': f'Basic {tok}', 'Accept': 'application/json'}


def _get(url, params=None):
    try:
        r = requests.get(url, headers=_headers(), params=params, timeout=15)
        if r.status_code == 304:
            return None
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"[FTC API] {url} → {e}")
        return None


def current_season():
    data = _get(f"{FTC_BASE}/")
    if data and 'currentSeason' in data:
        return int(data['currentSeason'])
    now = datetime.now()
    return now.year if now.month >= 9 else now.year - 1


def get_seasons():
    data = _get(f"{FTC_BASE}/")
    if data and 'maxSeason' in data:
        hi = int(data['maxSeason'])
        return {'seasons': list(range(2015, hi + 1)), 'currentSeason': int(data.get('currentSeason', hi))}
    cur = current_season()
    return {'seasons': list(range(2015, cur + 1)), 'currentSeason': cur}


def get_events(season, team_number=None, event_code=None):
    params = {}
    if team_number:
        params['teamNumber'] = team_number
    elif event_code:
        params['eventCode'] = event_code
    return _get(f"{FTC_BASE}/{season}/events", params=params)


def get_teams(season, event_code=None, team_number=None):
    params = {}
    if event_code:
        params['eventCode'] = event_code
    elif team_number:
        params['teamNumber'] = team_number
    return _get(f"{FTC_BASE}/{season}/teams", params=params)


def get_rankings(season, event_code):
    return _get(f"{FTC_BASE}/{season}/rankings/{event_code}")


def get_hybrid_schedule(season, event_code, level='qual'):
    return _get(f"{FTC_BASE}/{season}/schedule/{event_code}/{level}/hybrid")


def get_schedule_basic(season, event_code, level='qual'):
    """Non-hybrid schedule endpoint. Unlike /hybrid, this response may include
    an explicit per-match `field` string (e.g. "Field 1") from the FTC API.
    Shape: {schedule:[{description, field, tournamentLevel, startTime,
                      matchNumber, teams:[{teamNumber,station,...}]}]}
    """
    return _get(f"{FTC_BASE}/{season}/schedule/{event_code}/{level}")


def get_match_scores(season, event_code, level='qual'):
    return _get(f"{FTC_BASE}/{season}/scores/{event_code}/{level}")


def get_oprs(season, event_code):
    return _get(f"{FTC_BASE}/{season}/oprs/{event_code}")


def get_alliances(season, event_code):
    return _get(f"{FTC_BASE}/{season}/alliances/{event_code}")


def get_awards(season, event_code):
    return _get(f"{FTC_BASE}/{season}/awards/{event_code}")


def get_advancement(season, event_code):
    return _get(f"{FTC_BASE}/{season}/advancement/{event_code}")
