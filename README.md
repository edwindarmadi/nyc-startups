# NYC Startup Index

A sourced directory of New York City startups — funding news feed, company browser with filters
(sector, stage, focus area, hiring), company detail pages with every source link, and careers links.

- `public/` — static site (vanilla JS, no build step). Hash routes: `#/` news, `#/companies`, `#/c/<id>`, `#/about`.
- `data/` — canonical JSON + manual inputs. `unknown` means unsourced; nothing is guessed.
- `scripts/` — `fetch_sources.sh`, `parse_gallery.py`, `build_data.py`, `check-links`.

See **UPDATE.md** for the refresh / redeploy runbook.

Local preview: `python3 -m http.server -d public 8000`.
