from backend.extensions import db
from datetime import datetime
import json


class AppSettings(db.Model):
    __tablename__ = 'app_settings'
    id    = db.Column(db.Integer, primary_key=True)
    key   = db.Column(db.String(64),  unique=True, nullable=False)
    value = db.Column(db.String(512), nullable=True)

    @staticmethod
    def get(key, default=None):
        row = AppSettings.query.filter_by(key=key).first()
        return row.value if row else default

    @staticmethod
    def set(key, value):
        row = AppSettings.query.filter_by(key=key).first()
        if row:
            row.value = str(value)
        else:
            db.session.add(AppSettings(key=key, value=str(value)))
        db.session.commit()


class ScoutingNote(db.Model):
    __tablename__ = 'scouting_notes'
    id               = db.Column(db.Integer, primary_key=True)
    season           = db.Column(db.Integer, nullable=False)
    event_code       = db.Column(db.String(32), nullable=False)
    team_number      = db.Column(db.Integer, nullable=False)
    match_number     = db.Column(db.Integer, nullable=True)
    scout_name       = db.Column(db.String(64), default='Anonymous')
    auto_score       = db.Column(db.Integer, nullable=True)
    teleop_score     = db.Column(db.Integer, nullable=True)
    endgame_score    = db.Column(db.Integer, nullable=True)
    penalties        = db.Column(db.Integer, default=0)
    driver_rating    = db.Column(db.Integer, nullable=True)
    notes            = db.Column(db.Text,    nullable=True)
    auto_description    = db.Column(db.String(256), nullable=True)
    endgame_description = db.Column(db.String(256), nullable=True)
    created_at       = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return dict(
            id=self.id, season=self.season, event_code=self.event_code,
            team_number=self.team_number, match_number=self.match_number,
            scout_name=self.scout_name, auto_score=self.auto_score,
            teleop_score=self.teleop_score, endgame_score=self.endgame_score,
            penalties=self.penalties, driver_rating=self.driver_rating,
            notes=self.notes, auto_description=self.auto_description,
            endgame_description=self.endgame_description,
            created_at=self.created_at.isoformat() if self.created_at else None,
        )


class AllianceFlag(db.Model):
    __tablename__ = 'alliance_flags'
    id           = db.Column(db.Integer, primary_key=True)
    season       = db.Column(db.Integer, nullable=False)
    event_code   = db.Column(db.String(32), nullable=False)
    team_number  = db.Column(db.Integer, nullable=False)
    flag         = db.Column(db.String(16), default='neutral')
    pick_order   = db.Column(db.Integer, nullable=True)
    __table_args__ = (
        db.UniqueConstraint('season', 'event_code', 'team_number', name='uq_flag'),
    )

    def to_dict(self):
        return dict(team_number=self.team_number, flag=self.flag, pick_order=self.pick_order)


class TeamNote(db.Model):
    __tablename__ = 'team_notes'
    id         = db.Column(db.Integer, primary_key=True)
    author     = db.Column(db.String(64), default='Anonymous')
    title      = db.Column(db.String(128), nullable=False)
    content    = db.Column(db.Text, nullable=False)
    category   = db.Column(db.String(32), default='general')
    pinned     = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return dict(
            id=self.id, author=self.author, title=self.title,
            content=self.content, category=self.category, pinned=self.pinned,
            created_at=self.created_at.isoformat() if self.created_at else None,
        )


class Checklist(db.Model):
    __tablename__ = 'checklists'
    id         = db.Column(db.Integer, primary_key=True)
    name       = db.Column(db.String(128), nullable=False)
    category   = db.Column(db.String(32),  default='general')
    items_json = db.Column(db.Text, default='[]')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return dict(
            id=self.id, name=self.name, category=self.category,
            items=json.loads(self.items_json or '[]'),
            created_at=self.created_at.isoformat() if self.created_at else None,
        )
