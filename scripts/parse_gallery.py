import re,html,json,os
out=[]
def textlines(s):
    t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S)
    t=re.sub(r'<[^>]+>','\n',t); t=html.unescape(t)
    return [l.strip() for l in t.split('\n') if l.strip() and l.strip()!="')\">"]
def anchor_with(s,label):
    for m in re.finditer(r'<a\b([^>]*)>(.*?)</a>',s,flags=re.S):
        if label in re.sub(r'<[^>]+>','',m.group(2)):
            h=re.search(r'href="([^"]+)"',m.group(1))
            if h: return html.unescape(h.group(1))
    return None
for slug in open('slugs.txt').read().split():
    s=open(f'co/{slug}.html').read()
    d={'slug':slug}
    m=re.search(r'<meta name="description" content="([^"]*)"',s)
    desc=html.unescape(m.group(1)) if m else ''
    desc=desc.split(' Find top early-stage')[0]
    title=re.search(r'<title>([^<|]*)',s).group(1).strip()
    d['name']=title
    if ': ' in desc: d['tagline']=desc.split(': ',1)[1].strip()
    d['website']=anchor_with(s,'Visit Website')
    d['jobs']=anchor_with(s,'View Jobs')
    rm=re.search(r'<a[^>]*href="([^"]+)"[^>]*>(?:(?!</a>).)*?<time datetime="([^"]+)">(Raised[^<]*)</time>',s,flags=re.S)
    if rm:
        d['round_url']=html.unescape(rm.group(1)); d['round_date']=rm.group(2)[:10]; d['round_text']=html.unescape(rm.group(3))
    else:
        tm=re.search(r'<time datetime="([^"]+)">(Raised[^<]*)</time>',s)
        if tm: d['round_date']=tm.group(1)[:10]; d['round_text']=html.unescape(tm.group(2))
    L=textlines(s)
    try: end=L.index(next(l for l in L if l.startswith('Explore similar companies')))
    except StopIteration: end=len(L)
    L=L[:end]
    # chips after location line
    loc_i=next((i for i,l in enumerate(L) if i>2 and i+1<len(L) and L[i+1]=='·' and len(l)<60),None)
    chips=[]
    if loc_i is not None:
        i=loc_i
        chips=[L[i]]
        while i+2<len(L) and L[i+1]=='·':
            chips.append(L[i+2]); i+=2
        d['about']=L[loc_i-1] if not L[loc_i-1].startswith('Raised') else None
    d['chips']=chips
    d['jobs_list']=[]
    j=(loc_i or 0)+max(len(chips)*2-1,0)
    while j+1<len(L) and ' · ' in L[j+1] and len(d['jobs_list'])<40:
        d['jobs_list'].append({'title':L[j],'meta':L[j+1]}); j+=2
    out.append(d)
json.dump(out,open('sg_parsed.json','w'),indent=1)
print(len(out))
