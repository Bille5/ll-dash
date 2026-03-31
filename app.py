from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv
import os

load_dotenv()


def create_app():
    app = Flask(
        __name__,
        template_folder='frontend/templates',
        static_folder='frontend/static',
    )
    CORS(app)

    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-change-me')
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'postgresql://localhost/lldash')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['TEAM_NUMBER'] = os.getenv('TEAM_NUMBER', '3650')
    app.config['TEAM_PIN']    = os.getenv('TEAM_PIN',    '3650')

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

    # ── Create tables ───────────────────────────────────────────
    with app.app_context():
        import backend.models.models  # noqa – registers models with SQLAlchemy
        db.create_all()

    return app


if __name__ == '__main__':
    application = create_app()
    application.run(debug=True, host='127.0.0.1', port=5000)
