from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv
import os

load_dotenv()


def _database_url():
    url = os.getenv('DATABASE_URL', 'postgresql://localhost/lldash')
    # Some hosts (e.g. Heroku, older Render) hand out postgres:// URLs,
    # which SQLAlchemy no longer accepts.
    if url.startswith('postgres://'):
        url = url.replace('postgres://', 'postgresql://', 1)
    return url


def _run_light_migrations(db):
    """Best-effort schema tweaks for deployments created before the
    productization work. New deployments get the right schema from
    create_all(); each statement is independent and safe to fail."""
    from sqlalchemy import text
    statements = [
        'ALTER TABLE app_settings ALTER COLUMN value TYPE TEXT',
        'ALTER TABLE alliance_flags ALTER COLUMN flag TYPE VARCHAR(32)',
    ]
    for stmt in statements:
        try:
            db.session.execute(text(stmt))
            db.session.commit()
        except Exception:
            db.session.rollback()


def _seed_settings_from_env():
    """If this deployment was configured via env vars (pre-wizard installs),
    import them into AppSettings once so the setup wizard is skipped and the
    app keeps working exactly as before."""
    from backend.models.models import AppSettings
    if AppSettings.get('setup_complete') == '1':
        return
    env_map = {
        'team_number':      'TEAM_NUMBER',
        'team_pin':         'TEAM_PIN',
        'ftc_api_username': 'FTC_API_USERNAME',
        'ftc_api_key':      'FTC_API_KEY',
    }
    values = {k: os.getenv(v) for k, v in env_map.items()}
    if not all(values.values()):
        return  # incomplete env config → run the setup wizard instead
    for key, value in values.items():
        AppSettings.set(key, value)
    if os.getenv('DASHBOARD_NAME'):
        AppSettings.set('dashboard_name', os.getenv('DASHBOARD_NAME'))
    AppSettings.set('setup_complete', '1')


def create_app():
    app = Flask(
        __name__,
        template_folder='frontend/templates',
        static_folder='frontend/static',
    )
    CORS(app)

    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-change-me')
    app.config['SQLALCHEMY_DATABASE_URI'] = _database_url()
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    # ── Extensions ─────────────────────────────────────────────
    from backend.extensions import db
    db.init_app(app)

    # ── Blueprints ──────────────────────────────────────────────
    from backend.routes.main import main_bp
    from backend.routes.api  import api_bp
    from backend.routes.auth import auth_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(api_bp,  url_prefix='/api')
    app.register_blueprint(auth_bp, url_prefix='/auth')

    # ── Create / migrate tables ─────────────────────────────────
    with app.app_context():
        import backend.models.models  # noqa – registers models with SQLAlchemy
        db.create_all()
        _run_light_migrations(db)
        _seed_settings_from_env()

    return app


if __name__ == '__main__':
    application = create_app()
    application.run(debug=True, host='127.0.0.1', port=5000)
