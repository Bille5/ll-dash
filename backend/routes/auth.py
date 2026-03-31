from flask import Blueprint, request, jsonify, session
from functools import wraps
import os

auth_bp = Blueprint('auth', __name__)


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('authenticated'):
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    if str(data.get('pin', '')) == str(os.getenv('TEAM_PIN', '3650')):
        session['authenticated'] = True
        session.permanent = True
        return jsonify({'success': True})
    return jsonify({'error': 'Wrong PIN'}), 401


@auth_bp.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})


@auth_bp.route('/check', methods=['GET'])
def check():
    return jsonify({'authenticated': bool(session.get('authenticated'))})
