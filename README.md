# LL Dash — Self-Hostable FTC Competition Dashboard

A mobile-first PWA dashboard for *FIRST* Tech Challenge teams: live schedules,
rankings, OPR stats, scouting, alliance-selection pick lists, a ranking
simulator and a big-screen pit display — all backed by the official
[FTC Events API](https://ftc-events.firstinspires.org/services/API) and
[FTCScout](https://ftcscout.org).

Originally built by FTC Team 3650 (Limited Liability) as "LL Dash" — now fully
configurable so **any team can self-host it under their own name, colors and
scouting workflow**. No code changes required.

## Features

- **Setup wizard** — first visit walks you through FTC API credentials
  (validated live), team number, season, PIN, dashboard name and theme colors.
  Everything is stored in the database; change it any time from ⚙ Settings.
- **Dashboard** — next-match countdown, last match result, your team's stats.
- **Schedule** — full hybrid schedule with scores, RP breakdowns and OPR-based
  match predictions.
- **Rankings** — sortable rankings with global/event OPR from FTCScout.
- **Scouting** — *configurable* note form: define your own fields
  (text, textarea, number, select, star rating) in Settings → Scout Fields.
- **Alliance** — pick list with *custom flag categories* (name + color, e.g.
  Target / Do Not Pick / Sleeper), plus side-by-side team comparison.
- **Simulator** — what-if qualification ranking projections.
- **Hub** — team notes and pit/inspection checklists.
- **Big Screen** — a high-contrast, auto-refreshing pit display (Display tab)
  showing the schedule with the current match highlighted, field assignments,
  scores and rankings. Optional auto-cycling between panels. Press Esc or ✕
  to exit.
- **PWA** — installable on phones, works as a home-screen app, offline-tolerant.

## Stack

Flask + PostgreSQL backend, vanilla-JS single-page frontend. No build step.

## Deploy to Render (recommended)

1. Fork/clone this repo to your GitHub account.
2. In [Render](https://render.com), click **New → Blueprint** and point it at
   your repo. The included [`render.yaml`](render.yaml) provisions the web
   service and a free Postgres database automatically.
3. Open your service URL. The **setup wizard** appears on first visit:
   - Enter your FTC Events API username/key
     (request free credentials [here](https://ftc-events.firstinspires.org/services/API) —
     they arrive by email within minutes).
   - Enter your team number, season and a 4-digit PIN for your team.
   - Pick a dashboard name (e.g. `XX Dash` or anything you like) and your
     team colors.
4. Done. Share the URL + PIN with your team; on phones use
   "Add to Home Screen" to install it as an app.

Any other host that runs `gunicorn "app:create_app()"` against a Postgres
database works the same way (Railway, Fly.io, a VPS, …).

## Run locally

```bash
git clone <your fork>
cd ll-dash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

createdb lldash                      # Postgres must be running
cp .env.example .env                 # set SECRET_KEY and DATABASE_URL

python app.py                        # http://127.0.0.1:5000
```

The first visit launches the setup wizard, same as production.

## Database setup & migrations

Tables are created automatically on first boot (`db.create_all()`), so a
fresh, empty Postgres database is all you need. When upgrading an existing
deployment, lightweight column migrations also run automatically at startup —
no manual steps.

To initialize a database without starting the server:

```bash
python -c "from app import create_app; create_app()"
```

## Configuration

All configuration lives in the `app_settings` table and is managed in-app:

| Where | What |
|---|---|
| Setup wizard (first run) | FTC API credentials, team number, season, PIN, name, theme |
| ⚙ Settings → Event | Season + active event (searchable) |
| ⚙ Settings → Branding | Dashboard name, accent/secondary/background colors (live preview) |
| ⚙ Settings → Scout Fields | Add/remove/reorder scouting form fields |
| ⚙ Settings → Flags | Custom alliance flag categories (name, color, emoji) |
| ⚙ Settings → Team & API | Team number, PIN, FTC API credentials |

Environment variables (see [`.env.example`](.env.example)) are only needed for
`SECRET_KEY`/`DATABASE_URL`; the team-specific ones are optional fallbacks
that pre-seed the database and skip the wizard — handy for deployments that
predate the wizard.

## Attribution

Event data is provided by the
[*FIRST* Events API](https://frc-events.firstinspires.org/services/API).
This project is community-built and is not affiliated with or endorsed by
*FIRST*. OPR statistics courtesy of [FTCScout](https://ftcscout.org).
