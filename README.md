# NYC Startup Index

Open roles at New York City startups (jobs board on the home page, pulled from public ATS feeds), plus a sourced
directory of the companies — news feed, company browser with filters (sector, round, focus area, hiring) and
company detail pages with every source link and all current jobs.

- `public/` — static site (vanilla JS, no build step). Hash routes: `#/` jobs, `#/news`, `#/companies`, `#/c/<id>`, `#/about`.
- `data/` — canonical JSON + manual inputs. `unknown` means unsourced; nothing is guessed.
- `scripts/` — `fetch_sources.sh`, `parse_gallery.py`, `build_data.py`, `fetch-jobs`, `check-links`.

See **UPDATE.md** for the refresh / redeploy runbook.

Local preview: `python3 -m http.server -d public 8000`.
