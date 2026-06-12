"""Deployment configuration resolved from AppSettings (DB) with env-var fallback.

All deployment-specific values (team number, PIN, FTC API credentials,
branding, theming, scouting field schema, flag categories) live in the
app_settings table so a deployment can be configured entirely through the
setup wizard / in-app settings without env vars or redeploys. Env vars are
kept as a fallback for existing deployments and local development.
"""
import json
import os
import re

from backend.models.models import AppSettings

# ── Defaults (the original LL Dash deployment values are defaults, not requirements) ──
DEFAULT_DASHBOARD_NAME = 'LL Dash'

DEFAULT_THEME = {
    'accent':  '#e8ff47',
    'accent2': '#47c8ff',
    'bg':      '#0a0a0f',
}

DEFAULT_SCOUTING_FIELDS = [
    {'key': 'driver_rating', 'label': 'Driver Rating',         'type': 'stars',    'required': False},
    {'key': 'auto',          'label': 'Auto Notes',            'type': 'textarea', 'required': False,
     'placeholder': 'What did they do in autonomous? Consistency, scoring, starting position…'},
    {'key': 'teleop',        'label': 'Teleop Notes',          'type': 'textarea', 'required': False,
     'placeholder': 'Teleop observations — cycle speed, scoring zones, defense, driver skill…'},
    {'key': 'park',          'label': 'Park / Endgame Notes',  'type': 'textarea', 'required': False,
     'placeholder': 'Endgame behavior — park, climb, consistency…'},
    {'key': 'other',         'label': 'Other Notes',           'type': 'textarea', 'required': False,
     'placeholder': 'Strengths, weaknesses, alliance strategy tips, notable moments…'},
    {'key': 'auto_score',    'label': 'Auto Score',            'type': 'number',   'required': False},
    {'key': 'teleop_score',  'label': 'TeleOp Score',          'type': 'number',   'required': False},
    {'key': 'endgame_score', 'label': 'Endgame Score',         'type': 'number',   'required': False},
    {'key': 'penalties',     'label': 'Penalties',             'type': 'number',   'required': False},
]

DEFAULT_FLAG_CATEGORIES = [
    {'key': 'target', 'label': 'Target',      'color': '#2ed573', 'icon': '🎯'},
    {'key': 'dnp',    'label': 'Do Not Pick', 'color': '#ff4757', 'icon': '🚫'},
]

# ── Navigation / page visibility ──────────────────────────────
NAV_PAGE_KEYS = ['dashboard', 'schedule', 'rankings', 'scouting', 'alliance',
                 'simulator', 'hub', 'bigscreen', 'playoffs', 'awards']
DEFAULT_NAV = [{'key': k, 'visible': True} for k in NAV_PAGE_KEYS]

# ── Big Screen display config ─────────────────────────────────
DEFAULT_BIGSCREEN = {
    'panels': {'schedule': True, 'rankings': True, 'playoffs': True},
    'cycle_seconds': 15,
    'refresh_seconds': 45,
}
BS_CYCLE_RANGE = (5, 300)
BS_REFRESH_RANGE = (10, 600)

THEME_MODES = {'dark', 'light'}
DENSITIES = {'normal', 'compact'}

SCOUTING_FIELD_TYPES = {'text', 'textarea', 'number', 'select', 'stars'}

# Field keys whose values are stored in dedicated ScoutingNote columns rather
# than the notes JSON blob (kept for backwards compatibility with old data).
LEGACY_SCOUT_KEYS = {'driver_rating', 'auto_score', 'teleop_score', 'endgame_score', 'penalties'}


def get(key, env_key=None, default=None):
    try:
        v = AppSettings.get(key)
    except Exception:
        v = None
    if v not in (None, ''):
        return v
    if env_key:
        v = os.getenv(env_key)
        if v not in (None, ''):
            return v
    return default


def get_json(key, default):
    raw = get(key)
    if not raw:
        return default
    try:
        v = json.loads(raw)
        return v if v else default
    except (ValueError, TypeError):
        return default


def needs_setup():
    return get('setup_complete') != '1'


def team_number():
    return get('team_number', 'TEAM_NUMBER')


def team_pin():
    return get('team_pin', 'TEAM_PIN', '3650')


def ftc_credentials():
    return (get('ftc_api_username', 'FTC_API_USERNAME', ''),
            get('ftc_api_key', 'FTC_API_KEY', ''))


def dashboard_name():
    return get('dashboard_name', default=DEFAULT_DASHBOARD_NAME)


def _shade(hex_color, amt):
    """Lighten (dark themes) / darken (light themes) a hex color slightly,
    used to derive the card/raised surface colors from the base background."""
    h = str(hex_color).lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    try:
        r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    except (ValueError, IndexError):
        return hex_color
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    if lum > 128:
        amt = -amt
    clamp = lambda v: max(0, min(255, v + amt))
    return '#%02x%02x%02x' % (clamp(r), clamp(g), clamp(b))


def theme():
    t = {
        'accent':  get('theme_accent',  default=DEFAULT_THEME['accent']),
        'accent2': get('theme_accent2', default=DEFAULT_THEME['accent2']),
        'bg':      get('theme_bg',      default=DEFAULT_THEME['bg']),
    }
    t['bg2'] = _shade(t['bg'], 8)
    t['bg3'] = _shade(t['bg'], 15)
    return t


def theme_mode():
    m = get('theme_mode', default='dark')
    return m if m in THEME_MODES else 'dark'


def density():
    d = get('density', default='normal')
    return d if d in DENSITIES else 'normal'


def nav_config():
    """Ordered list of {key, visible}. Always contains every known page
    exactly once, dashboard always visible, unknown keys dropped."""
    raw = get_json('nav_config', DEFAULT_NAV)
    cleaned, err = validate_nav_config(raw)
    return cleaned if not err else list(DEFAULT_NAV)


def validate_nav_config(items):
    if not isinstance(items, list):
        return None, 'Nav config must be an array'
    cleaned, seen = [], set()
    for it in items:
        if not isinstance(it, dict):
            continue
        key = it.get('key')
        if key not in NAV_PAGE_KEYS or key in seen:
            continue
        seen.add(key)
        cleaned.append({'key': key, 'visible': bool(it.get('visible', True))})
    for key in NAV_PAGE_KEYS:          # anything missing goes to the end
        if key not in seen:
            cleaned.append({'key': key, 'visible': True})
    for it in cleaned:                 # dashboard can never be hidden
        if it['key'] == 'dashboard':
            it['visible'] = True
    return cleaned, None


def _clamp(v, lo, hi, default):
    try:
        return max(lo, min(hi, int(v)))
    except (TypeError, ValueError):
        return default


def bigscreen_config():
    raw = get_json('bigscreen_config', DEFAULT_BIGSCREEN)
    cleaned, err = validate_bigscreen_config(raw)
    return cleaned if not err else dict(DEFAULT_BIGSCREEN)


def validate_bigscreen_config(cfg):
    if not isinstance(cfg, dict):
        return None, 'Big Screen config must be an object'
    panels_in = cfg.get('panels') or {}
    panels = {k: bool(panels_in.get(k, DEFAULT_BIGSCREEN['panels'][k]))
              for k in DEFAULT_BIGSCREEN['panels']}
    if not any(panels.values()):
        return None, 'At least one Big Screen panel must be enabled'
    return {
        'panels': panels,
        'cycle_seconds':   _clamp(cfg.get('cycle_seconds'),   *BS_CYCLE_RANGE,
                                  default=DEFAULT_BIGSCREEN['cycle_seconds']),
        'refresh_seconds': _clamp(cfg.get('refresh_seconds'), *BS_REFRESH_RANGE,
                                  default=DEFAULT_BIGSCREEN['refresh_seconds']),
    }, None


def awards_highlight_ours():
    return get('awards_highlight_ours', default='1') != '0'


def advanced_predictions():
    return get('advanced_predictions', default='1') != '0'


def branding():
    """Branding info for templates / the manifest. Never raises — falls back
    to defaults if the database isn't reachable yet (e.g. first boot)."""
    try:
        name = dashboard_name()
        thm = theme()
        team = team_number()
        mode = theme_mode()
        dens = density()
    except Exception:
        name, thm, team = DEFAULT_DASHBOARD_NAME, dict(DEFAULT_THEME), None
        mode, dens = 'dark', 'normal'
        thm['bg2'] = _shade(thm['bg'], 8)
        thm['bg3'] = _shade(thm['bg'], 15)
    parts = str(name).strip().split(None, 1)
    return {
        'name': name,
        'name_first': parts[0] if parts else name,
        'name_rest': parts[1] if len(parts) > 1 else '',
        'theme': thm,
        'team_number': team,
        'theme_mode': mode,
        'density': dens,
    }


def scouting_fields():
    return get_json('scouting_fields', DEFAULT_SCOUTING_FIELDS)


def flag_categories():
    return get_json('flag_categories', DEFAULT_FLAG_CATEGORIES)


def slugify(label):
    s = re.sub(r'[^a-z0-9]+', '_', str(label).lower()).strip('_')
    return s[:32] or 'field'


def validate_scouting_fields(fields):
    """Returns (cleaned_fields, error). Cleaned fields have stable keys."""
    if not isinstance(fields, list) or not fields:
        return None, 'Field list must be a non-empty array'
    if len(fields) > 40:
        return None, 'Too many fields (max 40)'
    cleaned, seen = [], set()
    for f in fields:
        if not isinstance(f, dict):
            return None, 'Each field must be an object'
        label = str(f.get('label', '')).strip()[:64]
        ftype = f.get('type', 'text')
        if not label:
            return None, 'Every field needs a label'
        if ftype not in SCOUTING_FIELD_TYPES:
            return None, f'Invalid field type: {ftype}'
        key = slugify(f.get('key') or label)
        base, i = key, 2
        while key in seen:
            key, i = f'{base}_{i}', i + 1
        seen.add(key)
        entry = {'key': key, 'label': label, 'type': ftype, 'required': bool(f.get('required'))}
        if f.get('placeholder'):
            entry['placeholder'] = str(f['placeholder'])[:256]
        if ftype == 'select':
            opts = [str(o).strip()[:64] for o in (f.get('options') or []) if str(o).strip()]
            if not opts:
                return None, f'Select field "{label}" needs at least one option'
            entry['options'] = opts[:20]
        cleaned.append(entry)
    return cleaned, None


def validate_flag_categories(cats):
    """Returns (cleaned_categories, error)."""
    if not isinstance(cats, list):
        return None, 'Categories must be an array'
    if len(cats) > 12:
        return None, 'Too many categories (max 12)'
    cleaned, seen = [], set()
    for c in cats:
        if not isinstance(c, dict):
            return None, 'Each category must be an object'
        label = str(c.get('label', '')).strip()[:32]
        if not label:
            return None, 'Every category needs a name'
        color = str(c.get('color', '')).strip()
        if not re.fullmatch(r'#[0-9a-fA-F]{6}', color):
            return None, f'Category "{label}" needs a hex color like #2ed573'
        key = slugify(c.get('key') or label)
        if key == 'neutral':
            return None, '"neutral" is reserved for unflagged teams'
        base, i = key, 2
        while key in seen:
            key, i = f'{base}_{i}', i + 1
        seen.add(key)
        entry = {'key': key, 'label': label, 'color': color}
        if c.get('icon'):
            entry['icon'] = str(c['icon'])[:8]
        cleaned.append(entry)
    return cleaned, None
