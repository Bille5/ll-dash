from flask import Blueprint, render_template, send_from_directory
import os

main_bp = Blueprint('main', __name__)


@main_bp.route('/', defaults={'path': ''})
@main_bp.route('/<path:path>')
def index(path):
    return render_template('index.html')


@main_bp.route('/manifest.json')
def manifest():
    return send_from_directory('frontend/static', 'manifest.json')


@main_bp.route('/sw.js')
def sw():
    r = send_from_directory('frontend/static', 'sw.js')
    r.headers['Service-Worker-Allowed'] = '/'
    return r
