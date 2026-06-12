from flask import Blueprint, jsonify, render_template, send_from_directory

from backend.services import config

main_bp = Blueprint('main', __name__)


@main_bp.route('/', defaults={'path': ''})
@main_bp.route('/<path:path>')
def index(path):
    return render_template('index.html', brand=config.branding())


@main_bp.route('/manifest.json')
def manifest():
    b = config.branding()
    desc = 'FTC Competition Dashboard'
    if b.get('team_number'):
        desc += f" — Team {b['team_number']}"
    return jsonify({
        'name': b['name'],
        'short_name': b['name'],
        'description': desc,
        'start_url': '/',
        'display': 'standalone',
        'background_color': b['theme']['bg'],
        'theme_color': b['theme']['bg'],
        'orientation': 'portrait-primary',
        'icons': [
            {'src': '/static/icons/icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any maskable'},
            {'src': '/static/icons/icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any maskable'},
        ],
    })


@main_bp.route('/sw.js')
def sw():
    r = send_from_directory('frontend/static', 'sw.js')
    r.headers['Service-Worker-Allowed'] = '/'
    return r
