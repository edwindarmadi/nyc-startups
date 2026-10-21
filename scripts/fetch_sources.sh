#!/usr/bin/env bash
# Re-download the raw inputs into raw/ (git-ignored cache):
#   1. startups.gallery New York listing + every company page
#   2. each company homepage (to find its LinkedIn link)
#   3. LinkedIn company pages (HQ, company size) — slow on purpose to avoid rate limits (HTTP 999)
# Usage: scripts/fetch_sources.sh [--skip-linkedin] [--force]
set -euo pipefail
cd "$(dirname "$0")/.."
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
SKIP_LI=0; FORCE=0
for a in "$@"; do case $a in --skip-linkedin) SKIP_LI=1;; --force) FORCE=1;; esac; done
mkdir -p raw/co raw/web raw/li
curl -sL -A "$UA" https://startups.gallery/categories/locations/cities/new-york -o raw/ny.html
grep -o 'companies/[a-z0-9-]*' raw/ny.html | sort -u | sed 's/companies\///' > raw/slugs.txt
echo "$(wc -l < raw/slugs.txt) NYC slugs on startups.gallery"
# company pages (retry ones that came back as the generic fallback page = soft rate limit)
for pass in 1 2 3 4; do
  todo=0
  while read -r s; do
    f=raw/co/$s.html
    if [ $FORCE = 1 ] && [ $pass = 1 ] || [ ! -s "$f" ] || grep -q '<title>Top Early-Stage' "$f"; then
      curl -sL -A "$UA" --max-time 30 "https://startups.gallery/companies/$s" -o "$f"; todo=$((todo+1)); sleep 0.3
    fi
  done < raw/slugs.txt
  echo "pass $pass fetched $todo"; [ $todo = 0 ] && break
done
(cd raw && python3 ../scripts/parse_gallery.py)
# homepages -> LinkedIn URLs
python3 -c "
import json
for x in json.load(open('raw/sg_parsed.json')):
    if x.get('website'): print(x['slug'], x['website'].split('?ref=')[0])
" > raw/sites.txt
xargs -P 16 -n 2 sh -c '[ -s raw/web/$0.html ] || curl -sL -A "'"$UA"'" --max-time 20 -o raw/web/$0.html "$1" || true' < raw/sites.txt
python3 - <<'P'
import json, re, os, collections
li = json.load(open('raw/li_urls.json')) if os.path.exists('raw/li_urls.json') else {}
for x in json.load(open('raw/sg_parsed.json')):
    f = f"raw/web/{x['slug']}.html"
    if x['slug'] in li or not os.path.exists(f): continue
    m = [a.strip('/') for a in re.findall(r'https?://(?:[a-z]{2,3}\.)?linkedin\.com/company/([A-Za-z0-9_\-%.]+)', open(f, errors='ignore').read())]
    if m: li[x['slug']] = 'https://www.linkedin.com/company/' + collections.Counter(m).most_common(1)[0][0]
for s in json.load(open('data/manual/supplemental.json')):
    if s.get('linkedin'): li.setdefault(s['id'], s['linkedin'])
json.dump(li, open('raw/li_urls.json', 'w'), indent=0)
print(len(li), 'LinkedIn URLs')
P
[ $SKIP_LI = 1 ] && exit 0
python3 -c "import json;[print(k,v) for k,v in json.load(open('raw/li_urls.json')).items()]" | while read -r s u; do
  f=raw/li/$s.html
  if [ $FORCE = 1 ] || [ ! -s "$f" ] || ! grep -q 'Headquarters\|Company size' "$f"; then
    code=$(curl -sL -A "$UA" --max-time 20 -o "$f" -w '%{http_code}' "$u" || echo 000)
    echo "$s $code"; sleep 1.5
  fi
done
