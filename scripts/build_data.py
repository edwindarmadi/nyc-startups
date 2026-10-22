#!/usr/bin/env python3
"""Merge cached startups.gallery pages, LinkedIn pages and manual files into data/startups.json + data/news.json.
Run from repo root: python3 scripts/build_data.py"""
import json, re, html, os, datetime, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'raw')
TODAY = datetime.date.today().isoformat()
NYC = re.compile(r'\b(New York|NYC|Brooklyn|Manhattan|Queens|Bronx|Staten Island|Long Island City)\b', re.I)
NOT_NYC_NY = re.compile(r'(Mount Kisco|Peekskill|Albany|Buffalo|Rochester|Syracuse|White Plains|Yonkers|Long Island(?! City)|Westchester|Ithaca)', re.I)

def load(p, default=None):
    p = os.path.join(ROOT, p)
    return json.load(open(p)) if os.path.exists(p) else default

LI_IGNORE = {}
def li_info(slug):
    if slug in LI_IGNORE: return None
    f = os.path.join(RAW, 'li', slug + '.html')
    if not os.path.exists(f): return None
    s = open(f, errors='ignore').read()
    if 'Headquarters' not in s and 'Company size' not in s: return None
    t = re.sub(r'<script.*?</script>|<style.*?</style>', '', s, flags=re.S)
    t = html.unescape(re.sub(r'<[^>]+>', '\n', t))
    L = [l.strip() for l in t.split('\n') if l.strip()]
    out = {}
    for k, key in [('Headquarters', 'hq'), ('Company size', 'size'), ('Website', 'website'), ('Founded', 'founded'), ('Industry', 'industry')]:
        if k in L:
            i = L.index(k)
            if i + 1 < len(L): out[key] = L[i + 1]
    m = re.search(r'<link rel="canonical" href="([^"]+)"', s) or re.search(r'property="og:url" content="([^"]+)"', s)
    if m: out['url'] = m.group(1).split('?')[0]
    nm = re.search(r'<title>([^<|]+)', s)
    if nm: out['name'] = html.unescape(nm.group(1)).strip()
    return out

def stage_enum(raw):
    r = (raw or '').lower()
    if 'acquired' in r: return 'acquired'
    if 'pre-seed' in r: return 'pre-seed'
    if 'seed' in r: return 'seed'
    if 'series a' in r: return 'Series A'
    if 'series b' in r: return 'Series B'
    if re.search(r'series [c-z]', r): return 'Series C+'
    if 'public' in r or 'ipo' in r: return 'public'
    return 'unknown'

ROUND_ORDER = ['pre-seed', 'seed', 'Series A', 'Series B', 'Series C', 'Series D', 'Series E+', 'Series C+ (unspecified)', 'public', 'acquired', 'unknown']
def round_of(text, stage):
    """Fine-grained round bucket. Only uses a series letter when the sourced round name contains one."""
    if stage in ('acquired', 'public'): return stage, None
    t = text or ''
    m = re.search(r'\bSeries ([A-Z])\b', t)
    if m:
        L = m.group(1); name = f'Series {L}'
        if L in 'AB': return name, name
        if L in 'CD': return name, name
        return 'Series E+', name
    if re.search(r'pre-?seed', t, re.I): return 'pre-seed', 'Pre-Seed'
    if re.search(r'\bseed\b', t, re.I): return 'seed', 'Seed'
    if stage == 'Series C+': return 'Series C+ (unspecified)', None
    if stage in ('pre-seed', 'seed', 'Series A', 'Series B'): return stage, None
    return 'unknown', None

def one_liner(about, tagline):
    if about:
        first = re.split(r'(?<=[.!?])\s+', about.strip())[0]
        if 25 <= len(first) <= 220: return first
    return tagline or (about[:200] + '…' if about else '')

def main():
    LI_IGNORE.update(load('data/manual/linkedin_ignore.json', {}))
    tags = load('data/manual/tags.json', {})
    excl = load('data/manual/exclude.json', {})
    overrides = load('data/manual/overrides.json', {})
    gallery = json.load(open(os.path.join(RAW, 'sg_parsed.json')))
    li_urls = json.load(open(os.path.join(RAW, 'li_urls.json')))
    prev = {c['id']: c for c in (load('data/startups.json', {}) or {}).get('companies', [])}
    companies, news, dropped = [], [], {}

    def tag_of(cid, extra=()):
        return sorted(set([t for t, ids in tags.items() if cid in ids] + list(extra)))

    def hq_resolve(cid, li, fallback_txt, fallback_url):
        if li and li.get('hq'):
            h = li['hq']
            if NOT_NYC_NY.search(h) or not NYC.search(h):
                return None, f'LinkedIn HQ is "{h}"'
            return {'location': h, 'source': li.get('url'), 'source_type': 'LinkedIn'}, None
        if fallback_txt:
            return {'location': fallback_txt, 'source': fallback_url, 'source_type': 'other'}, None
        return None, 'HQ could not be confirmed'

    for g in gallery:
        cid = g['slug']
        if cid in excl: dropped[cid] = excl[cid]; continue
        if len(g.get('chips', [])) < 5: dropped[cid] = 'could not parse startups.gallery page'; continue
        loc, round_chip, sector, worktype, size = g['chips'][:5]
        gurl = f'https://startups.gallery/companies/{cid}'
        li = li_info(cid)
        hq, why = hq_resolve(cid, li, 'New York, NY' if 'New York' in loc else None, gurl)
        if not hq: dropped[cid] = why; continue
        if hq['source_type'] == 'other': hq['source_type'] = 'startups.gallery'
        name = g['name']
        acq = re.search(r'\((?:acquired|acq\.?) by ([^)]+)\)', name, re.I)
        clean_name = re.sub(r'\s*\((?:acquired|acq\.?) by [^)]+\)', '', name, flags=re.I).strip()
        m = re.match(r'(\$[\d.,]+[KMB]?|Undisclosed)\s+(.*)', round_chip)
        amount, round_stage = (m.group(1), m.group(2)) if m else (None, round_chip)
        if amount == 'Undisclosed': amount = 'undisclosed'
        stage = 'acquired' if acq else stage_enum(round_stage)
        rdate = g.get('round_date')
        website = (g.get('website') or '').split('?ref=startups.gallery')[0] or None
        sources = [{'label': 'startups.gallery profile', 'url': gurl}]
        if website: sources.append({'label': 'Company website', 'url': website})
        if li and li.get('url'): sources.append({'label': 'LinkedIn', 'url': li['url']})
        if g.get('round_url'): sources.append({'label': 'Funding announcement', 'url': g['round_url']})
        JOBS = re.compile(r'ashbyhq|greenhouse|lever\.co|workable|/careers|/jobs', re.I)
        if g.get('round_url') and JOBS.search(g['round_url']):
            g['round_url'] = None
            sources = [x for x in sources if x['label'] != 'Funding announcement']
        jobs = g.get('jobs')
        c = {
            'id': cid, 'name': clean_name, 'website': website,
            'description': one_liner(g.get('about'), g.get('tagline')),
            'tagline': g.get('tagline'), 'about': g.get('about'),
            'sectors': [sector], 'stage': stage,
            'stage_detail': round_stage if round_stage else None,
            'last_round': {'amount': amount or 'unknown', 'stage': round_stage or 'unknown', 'date': rdate or 'unknown',
                           'source': g.get('round_url') or gurl},
            'acquired_by': acq.group(1) if acq else None,
            'headcount': (li or {}).get('size') or size or 'unknown',
            'headcount_source': 'LinkedIn' if (li or {}).get('size') else 'startups.gallery',
            'work_type': worktype,
            'hq': hq,
            'careers_url': jobs, 'hiring': bool(g.get('jobs_list')),
            'open_roles_sample': g.get('jobs_list', [])[:12],
            'open_roles_count_text': (f"{len(g['jobs_list'])}{'+' if len(g['jobs_list'])>=12 else ''} roles listed on startups.gallery" if g.get('jobs_list') else None),
            'focus': tag_of(cid), 'sources': sources,
            'origin': 'startups.gallery', 'last_verified': TODAY,
        }
        companies.append(c)
        c['last_round']['source'] = g.get('round_url') or gurl
        if g.get('round_text') and g.get('round_url'):
            news.append({'id': f'{cid}-funding-{rdate}', 'date': rdate, 'startup_id': cid, 'type': 'funding',
                         'headline': f"{clean_name} {g['round_text'][0].lower()+g['round_text'][1:].split(' on ')[0]}",
                         'summary': c['description'], 'source_url': g['round_url']})
        am = re.search(r'was acquired by (.+?) on ([A-Z][a-z]+ \d{1,2}, \d{4})', g.get('about') or '')
        if am:
            d = datetime.datetime.strptime(am.group(2), '%B %d, %Y').date().isoformat()
            news.append({'id': f'{cid}-acq-{d}', 'date': d, 'startup_id': cid, 'type': 'acquisition',
                         'headline': f'{clean_name} acquired by {am.group(1)}', 'summary': g.get('tagline') or '', 'source_url': gurl})

    for s in load('data/manual/supplemental.json', []):
        cid = s['id']
        li = li_info(cid)
        hq, why = hq_resolve(cid, li, s.get('hq_hint'), s.get('hq_hint_url'))
        if not hq: dropped[cid] = why; continue
        lr = s.get('last_round') or {}
        sources = [{'label': 'Company website', 'url': s['website']}]
        if li and li.get('url'): sources.append({'label': 'LinkedIn', 'url': li['url']})
        if lr.get('url'): sources.append({'label': 'Funding / news source', 'url': lr['url']})
        if s.get('hq_hint_url') and s['hq_hint_url'] not in [x['url'] for x in sources]:
            sources.append({'label': 'HQ source', 'url': s['hq_hint_url']})
        c = {'id': cid, 'name': s['name'], 'website': s['website'], 'description': s['description'], 'tagline': None, 'about': None,
             'sectors': s.get('sectors', []), 'stage': s.get('stage', 'unknown'), 'stage_detail': None,
             'last_round': {'amount': lr.get('amount', 'unknown'), 'stage': s.get('stage', 'unknown'), 'date': lr.get('date') or 'unknown', 'source': lr.get('url')},
             'acquired_by': s.get('acquired_by'),
             'headcount': (li or {}).get('size') or 'unknown', 'headcount_source': 'LinkedIn' if (li or {}).get('size') else None,
             'work_type': None, 'hq': hq, 'careers_url': s.get('careers_url'), 'hiring': bool(s.get('careers_url')),
             'open_roles_sample': [], 'open_roles_count_text': None,
             'focus': tag_of(cid, s.get('focus', [])), 'sources': sources, 'origin': 'manual research', 'last_verified': TODAY}
        companies.append(c)
        if lr.get('url') and lr.get('date'):
            st = s.get('stage')
            typ = 'acquisition' if st == 'acquired' else ('other' if st == 'public' else 'funding')
            head = {'acquisition': f"{s['name']} {lr['amount'][0].lower()+lr['amount'][1:]}", 'other': f"{s['name']} goes public: {lr['amount']}"}.get(typ, f"{s['name']} raised {lr['amount']}")
            news.append({'id': f"{cid}-{typ}-{lr['date']}", 'date': lr['date'], 'startup_id': cid, 'type': typ, 'headline': head, 'summary': s['description'], 'source_url': lr['url']})
    for n in load('data/manual/news.json', []):
        news.append(n)

    for c in companies:
        o = overrides.get(c['id'])
        if o: c.update(o)
        c['sources'] = [x for i, x in enumerate(c['sources']) if x['url'] and x['url'] not in [y['url'] for y in c['sources'][:i]]]
    # data/manual/url_fixes.json: {old_url: replacement_url or null} for links found dead (applied everywhere)
    fixes = load('data/manual/url_fixes.json', {}) or {}
    if fixes:
        fx = lambda u: fixes.get(u, u) if u else u
        for c in companies:
            c['sources'] = [dict(x, url=fx(x['url'])) for x in c['sources'] if fx(x['url'])]
            c['careers_url'] = fx(c.get('careers_url'))
            if c['last_round'].get('source') in fixes:
                c['last_round']['source'] = fixes[c['last_round']['source']] or (f"https://startups.gallery/companies/{c['id']}" if c['origin'] == 'startups.gallery' else None)
            if c.get('hq') and c['hq'].get('source') in fixes and fixes[c['hq']['source']]: c['hq']['source'] = fixes[c['hq']['source']]
        for n in news:
            if n.get('source_url') in fixes:
                n['source_url'] = fixes[n['source_url']] or (f"https://startups.gallery/companies/{n['startup_id']}")
    for c in companies:
        lr = c['last_round']
        src_text = ' '.join(str(x) for x in (c.get('stage_detail'), lr.get('stage') if lr.get('stage') not in (None, 'unknown', c['stage']) else None, lr.get('amount')) if x)
        c['round'], c['round_name'] = round_of(src_text, c['stage'])
    rmap = {c['id']: c['round'] for c in companies}
    for n in news:
        if n['type'] == 'acquisition': n['round'] = 'acquired'
        elif n['type'] == 'other' and 'IPO' in n['headline']: n['round'] = 'public'
        elif n['type'] == 'funding': n['round'] = round_of(n['headline'], None)[0]
        else: n['round'] = 'unknown'
    # drop URLs that scripts/check-links found dead (404/410/DNS) on the last run
    dead = set((load('data/link-report.json', {}) or {}).get('dead', {}).keys())
    if dead:
        for c in companies:
            gurl = f"https://startups.gallery/companies/{c['id']}" if c['origin'] == 'startups.gallery' else None
            c['sources'] = [x for x in c['sources'] if x['url'] not in dead] or ([{'label': 'startups.gallery profile', 'url': gurl}] if gurl else [])
            if c.get('careers_url') in dead: c['careers_url'] = None
            if c['last_round'].get('source') in dead: c['last_round']['source'] = gurl
            if c['website'] in dead: c['website_status'] = 'dead link on last check'
        for n in news:
            if n['source_url'] in dead:
                n['source_url'] = f"https://startups.gallery/companies/{n['startup_id']}" if n['startup_id'] in {c['id'] for c in companies if c['origin']=='startups.gallery'} else None
        for c in companies: assert c['sources'], c['id']
    ids = {c['id'] for c in companies}
    news = [n for n in news if n['startup_id'] in ids and n.get('source_url')]
    seen = set(); news = [n for n in news if not (n['id'] in seen or seen.add(n['id']))]
    news.sort(key=lambda n: n['date'] or '', reverse=True)
    companies.sort(key=lambda c: c['name'].lower())
    meta = {'last_updated': TODAY, 'count': len(companies), 'round_order': ROUND_ORDER,
            'note': "'unknown' means we could not find a source for that field; nothing is guessed."}
    json.dump({'meta': meta, 'companies': companies}, open(os.path.join(ROOT, 'data/startups.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump({'meta': {'last_updated': TODAY, 'count': len(news)}, 'items': news}, open(os.path.join(ROOT, 'data/news.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump(dropped, open(os.path.join(ROOT, 'data/dropped.json'), 'w'), indent=1)
    os.makedirs(os.path.join(ROOT,'public/data'),exist_ok=True)
    import shutil
    for f in ('startups.json','news.json'): shutil.copy(os.path.join(ROOT,'data',f), os.path.join(ROOT,'public/data',f))
    print(f'{len(companies)} companies, {len(news)} news items, {len(dropped)} dropped')

if __name__ == '__main__':
    main()
