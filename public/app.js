(() => {
'use strict';
const FOCUS = {climate:'Climate & energy', fair_finance:'Fair finance & access', civic:'Civic & gov tech', ai_everyday:'AI for everyday people'};
const STAGES = ['pre-seed','seed','Series A','Series B','Series C+','public','acquired','unknown'];
const STAGE_RANK = Object.fromEntries(STAGES.map((s,i)=>[s,i]));
let DB = null, NEWS = null, BY_ID = {};
const $app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const host = u => { try { return new URL(u).hostname.replace(/^www\./,''); } catch { return ''; } };
const fmtDate = d => { if (!d || d === 'unknown') return 'unknown'; const p = d.split('-'); const dt = new Date(Date.UTC(+p[0], (+p[1]||1)-1, +p[2]||1)); return dt.toLocaleDateString('en-US', {month:'short', day: p[2] ? 'numeric' : undefined, year:'numeric', timeZone:'UTC'}); };
const isUnknown = v => !v || v === 'unknown';
const logo = (c, big) => { const h = host(c.website); const ini = esc((c.name||'?').trim()[0]); return h ? `<span class="logo"><img loading="lazy" alt="" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=${big?128:64}" onerror="this.parentNode.textContent='${ini}'"></span>` : `<span class="logo">${ini}</span>`; };
const stageTag = s => `<span class="tag ${s==='unknown'?'unknown':'stage'}">${esc(s==='unknown'?'stage unknown':s)}</span>`;
const focusTags = f => (f||[]).map(t => `<span class="tag f-${t}">${esc(FOCUS[t])}</span>`).join('');

async function load() {
  const [a, b] = await Promise.all([fetch('/data/startups.json').then(r=>r.json()), fetch('/data/news.json').then(r=>r.json())]);
  DB = a; NEWS = b.items; BY_ID = Object.fromEntries(DB.companies.map(c=>[c.id,c]));
  DB.companies.forEach(c => { c._q = [c.name, c.description, c.tagline, c.about, (c.sectors||[]).join(' ')].join(' ').toLowerCase(); });
  document.getElementById('updated').textContent = `Last updated ${fmtDate(DB.meta.last_updated)} · ${DB.companies.length} companies · ${NEWS.length} news items`;
}

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { path, q: new URLSearchParams(qs || '') };
}
function setTab(t) { document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === t)); }

/* ---------- NEWS ---------- */
function renderNews(q) {
  setTab('news');
  const type = q.get('type') || 'all';
  const items = NEWS.filter(n => type === 'all' || n.type === type);
  const types = ['all', ...new Set(NEWS.map(n=>n.type))];
  const counts = t => t==='all' ? NEWS.length : NEWS.filter(n=>n.type===t).length;
  let html = `<div class="hero"><h1>What's happening in NYC startups</h1><p>Funding rounds, launches and acquisitions from New York City companies — every item links to its source. Click any story for the company's stage, links and open roles.</p>
  <div class="feedfilters">${types.map(t=>`<a class="chip ${t===type?'on':''}" href="#/${t==='all'?'':'?type='+t}" style="text-decoration:none">${esc(t==='all'?'All news':t[0].toUpperCase()+t.slice(1))}<span class="n">${counts(t)}</span></a>`).join('')}</div></div>
  <div class="newsgrid"><div class="feed">`;
  let lastMonth = '';
  for (const n of items.slice(0, 200)) {
    const c = BY_ID[n.startup_id]; if (!c) continue;
    const m = n.date ? fmtDate(n.date.slice(0,7)) : 'Undated';
    if (m !== lastMonth) { html += `<div class="day">${esc(m)}</div>`; lastMonth = m; }
    html += `<a class="item" href="#/c/${esc(c.id)}">${logo(c)}<div><h3>${esc(n.headline)}</h3><p>${esc(fmtDate(n.date))} · ${esc(n.summary || c.description)}</p></div><span class="kind ${esc(n.type)}">${esc(n.type)}</span></a>`;
  }
  if (items.length > 200) html += `<p class="count">Showing the latest 200 of ${items.length}.</p>`;
  html += `</div><aside class="side">${sidePanels()}</aside></div>`;
  $app.innerHTML = html;
}
function sidePanels() {
  const cs = DB.companies;
  const f = Object.keys(FOCUS).map(k => `<li><a href="#/companies?focus=${k}">${esc(FOCUS[k])}</a><span>${cs.filter(c=>c.focus.includes(k)).length}</span></li>`).join('');
  const st = STAGES.map(s => `<li><a href="#/companies?stage=${encodeURIComponent(s)}">${esc(s)}</a><span>${cs.filter(c=>c.stage===s).length}</span></li>`).join('');
  const hiring = cs.filter(c=>c.hiring).length;
  return `<div class="panel"><h4>Focus areas</h4><ul>${f}</ul></div>
  <div class="panel"><h4>Hiring now</h4><p style="margin:0 0 10px;color:var(--muted);font-size:14px">${hiring} companies have open roles listed.</p><a class="btn" href="#/companies?hiring=1">Browse hiring companies →</a></div>
  <div class="panel"><h4>By stage</h4><ul>${st}</ul></div>`;
}

/* ---------- DIRECTORY ---------- */
function getState(q) {
  return { s: q.get('s') || '', sector: q.getAll('sector'), stage: q.getAll('stage'), focus: q.getAll('focus'),
    hiring: q.get('hiring') === '1', careers: q.get('careers') === '1', sort: q.get('sort') || 'recent', view: q.get('view') || 'cards' };
}
function stateToHash(st) {
  const p = new URLSearchParams();
  if (st.s) p.set('s', st.s);
  st.sector.forEach(v=>p.append('sector', v)); st.stage.forEach(v=>p.append('stage', v)); st.focus.forEach(v=>p.append('focus', v));
  if (st.hiring) p.set('hiring','1'); if (st.careers) p.set('careers','1');
  if (st.sort !== 'recent') p.set('sort', st.sort); if (st.view !== 'cards') p.set('view', st.view);
  const s = p.toString(); return '#/companies' + (s ? '?' + s : '');
}
function filterList(st) {
  const words = st.s.toLowerCase().split(/\s+/).filter(Boolean);
  let list = DB.companies.filter(c =>
    words.every(w => c._q.includes(w)) &&
    (!st.sector.length || c.sectors.some(x => st.sector.includes(x))) &&
    (!st.stage.length || st.stage.includes(c.stage)) &&
    (!st.focus.length || st.focus.every(f => c.focus.includes(f))) &&
    (!st.hiring || c.hiring) && (!st.careers || !!c.careers_url));
  const d = c => isUnknown(c.last_round.date) ? '' : c.last_round.date;
  const sorters = {
    recent: (a,b) => d(b).localeCompare(d(a)) || a.name.localeCompare(b.name),
    oldest: (a,b) => (d(a)||'9').localeCompare(d(b)||'9') || a.name.localeCompare(b.name),
    name: (a,b) => a.name.localeCompare(b.name),
    'name-desc': (a,b) => b.name.localeCompare(a.name),
    stage: (a,b) => STAGE_RANK[a.stage]-STAGE_RANK[b.stage] || a.name.localeCompare(b.name),
    'stage-desc': (a,b) => (a.stage==='unknown')-(b.stage==='unknown') || STAGE_RANK[b.stage]-STAGE_RANK[a.stage] || a.name.localeCompare(b.name),
  };
  return list.sort(sorters[st.sort] || sorters.recent);
}
let currentState = null;
function renderDir(q, keepFocus) {
  const st = getState(q); currentState = st;
  setTab(st.hiring && !st.s && !st.sector.length && !st.stage.length && !st.focus.length ? 'hiring' : 'companies');
  const all = DB.companies;
  const sectors = [...new Set(all.flatMap(c=>c.sectors))].sort((a,b)=> all.filter(c=>c.sectors.includes(b)).length - all.filter(c=>c.sectors.includes(a)).length);
  const chip = (group, val, label, n) => `<button class="chip ${st[group].includes(val)?'on':''}" data-g="${group}" data-v="${esc(val)}">${esc(label)}<span class="n">${n}</span></button>`;
  const head = st.hiring ? `<h1>Who's hiring in NYC</h1><p>Companies with open roles listed. Careers links go straight to each company's job board.</p>` : `<h1>Browse NYC startups</h1><p>Search by name or what they do, then narrow by sector, stage, focus area or hiring status. Click a card for sources and details.</p>`;
  $app.innerHTML = `<div class="hero">${head}</div>
  <div class="dir">
    <aside class="filters" id="filters">
      <div class="fgroup"><h5>Focus areas</h5><div class="chips">${Object.keys(FOCUS).map(k=>chip('focus',k,FOCUS[k],all.filter(c=>c.focus.includes(k)).length)).join('')}</div></div>
      <div class="fgroup"><h5>Jobs</h5>
        <label class="toggle"><input type="checkbox" id="hiring" ${st.hiring?'checked':''}> Hiring now (roles listed)</label>
        <label class="toggle"><input type="checkbox" id="careers" ${st.careers?'checked':''}> Has careers link</label></div>
      <div class="fgroup"><h5>Stage</h5><div class="chips">${STAGES.map(s=>chip('stage',s,s,all.filter(c=>c.stage===s).length)).join('')}</div></div>
      <div class="fgroup"><h5>Sector</h5><div class="chips">${sectors.map(s=>chip('sector',s,s,all.filter(c=>c.sectors.includes(s)).length)).join('')}</div></div>
      <button class="btn ghost" id="clear">Clear all filters</button>
    </aside>
    <div>
      <div class="toolbar">
        <label class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input id="q" type="search" placeholder="Search name or description…" value="${esc(st.s)}" aria-label="Search companies"></label>
        <select id="sort" aria-label="Sort">
          ${[['recent','Latest round first'],['oldest','Oldest round first'],['name','Name A–Z'],['name-desc','Name Z–A'],['stage','Stage: early → late'],['stage-desc','Stage: late → early']].map(([v,l])=>`<option value="${v}" ${st.sort===v?'selected':''}>${l}</option>`).join('')}
        </select>
        <div class="viewtoggle" role="group" aria-label="View"><button data-view="cards" class="${st.view==='cards'?'on':''}">Cards</button><button data-view="list" class="${st.view==='list'?'on':''}">List</button></div>
        <button class="btn ghost mfilter" id="mf">Filters</button>
      </div>
      <div id="results"></div>
    </div>
  </div>`;
  renderResults(st);
  const go = () => { history.replaceState(null, '', stateToHash(currentState)); renderResults(currentState); };
  const qi = document.getElementById('q');
  qi.addEventListener('input', () => { currentState.s = qi.value; go(); });
  if (keepFocus) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
  document.getElementById('sort').addEventListener('change', e => { currentState.sort = e.target.value; go(); });
  document.getElementById('hiring').addEventListener('change', e => { currentState.hiring = e.target.checked; go(); });
  document.getElementById('careers').addEventListener('change', e => { currentState.careers = e.target.checked; go(); });
  document.querySelectorAll('.filters .chip').forEach(b => b.addEventListener('click', () => {
    const g = b.dataset.g, v = b.dataset.v, arr = currentState[g];
    const i = arr.indexOf(v); if (i>=0) arr.splice(i,1); else arr.push(v);
    b.classList.toggle('on'); go();
  }));
  document.querySelectorAll('.viewtoggle button').forEach(b => b.addEventListener('click', () => {
    currentState.view = b.dataset.view; document.querySelectorAll('.viewtoggle button').forEach(x=>x.classList.toggle('on', x===b)); go();
  }));
  document.getElementById('clear').addEventListener('click', () => { location.hash = '#/companies'; });
  document.getElementById('mf').addEventListener('click', () => document.getElementById('filters').classList.toggle('open'));
}
function renderResults(st) {
  const list = filterList(st);
  const el = document.getElementById('results');
  let html = `<p class="count">${list.length} of ${DB.companies.length} companies</p>`;
  if (!list.length) { el.innerHTML = html + `<div class="empty">No companies match. Try removing a filter.</div>`; return; }
  if (st.view === 'list') {
    html += `<table class="table"><thead><tr><th>Company</th><th class="hide-s">Sector</th><th>Stage</th><th class="hide-s">Last round</th><th class="hide-s">Headcount</th><th>Links</th></tr></thead><tbody>` +
      list.map(c => `<tr><td class="cn"><a class="nm" href="#/c/${esc(c.id)}">${esc(c.name)}</a><br><small style="color:var(--muted)">${esc(c.description)}</small></td>
      <td class="hide-s">${esc(c.sectors.join(', '))}</td><td>${stageTag(c.stage)}</td>
      <td class="hide-s">${esc(c.last_round.amount)}<br><small style="color:var(--muted)">${esc(fmtDate(c.last_round.date))}</small></td>
      <td class="hide-s">${esc(c.headcount)}</td>
      <td class="src">${c.careers_url?`<a href="${esc(c.careers_url)}" target="_blank" rel="noopener">careers</a>`:''}${c.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener nofollow">${esc(s.label.split(' ')[0].toLowerCase())}</a>`).join('')}</td></tr>`).join('') + `</tbody></table>`;
  } else {
    html += `<div class="grid">` + list.map(c => `<a class="card" href="#/c/${esc(c.id)}">
      <div class="head">${logo(c)}<div><h3>${esc(c.name)}</h3><div class="sub">${esc(c.sectors.join(' · '))}${isUnknown(c.last_round.date)?'':' · raised '+esc(fmtDate(c.last_round.date))}</div></div></div>
      <p>${esc(c.description)}</p>
      <div class="meta">${stageTag(c.stage)}${c.hiring?'<span class="tag hiring">hiring</span>':''}${focusTags(c.focus)}</div></a>`).join('') + `</div>`;
  }
  el.innerHTML = html;
}

/* ---------- DETAIL ---------- */
function renderCompany(id) {
  setTab('companies');
  const c = BY_ID[id];
  if (!c) { $app.innerHTML = `<a class="back" href="#/companies">← All companies</a><div class="empty">Company not found.</div>`; return; }
  document.title = `${c.name} — NYC Startup Index`;
  const lr = c.last_round;
  const news = NEWS.filter(n => n.startup_id === id);
  const fact = (k, v, small) => `<div class="fact"><span>${k}</span><b>${isUnknown(v)?'<span style="color:var(--muted)">unknown</span>':esc(v)}</b>${small?`<small>${small}</small>`:''}</div>`;
  const lrSrc = lr.source ? `source: <a href="${esc(lr.source)}" target="_blank" rel="noopener nofollow">${esc(host(lr.source))}</a>` : '';
  $app.innerHTML = `<a class="back" href="javascript:history.length>1?history.back():location.assign('#/companies')">← Back</a>
  <div class="dhead">${logo(c, true)}<div><h1>${esc(c.name)}</h1><p>${esc(c.description)}</p>
    <div class="meta" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">${stageTag(c.stage)}${c.sectors.map(s=>`<a class="tag" href="#/companies?sector=${encodeURIComponent(s)}" style="text-decoration:none">${esc(s)}</a>`).join('')}${c.hiring?'<span class="tag hiring">hiring</span>':''}${focusTags(c.focus)}</div>
    <div class="actions">${c.careers_url?`<a class="btn" href="${esc(c.careers_url)}" target="_blank" rel="noopener">View open roles ↗</a>`:''}${c.website?`<a class="btn ghost" href="${esc(c.website)}" target="_blank" rel="noopener">${esc(host(c.website))} ↗</a>`:''}</div>
  </div></div>
  <div class="dgrid"><div>
    <div class="facts">
      ${fact('Stage', c.stage === 'unknown' ? 'unknown' : c.stage + (c.stage_detail && !c.stage_detail.startsWith(c.stage) && c.stage!=='acquired' ? ` (${c.stage_detail})` : ''), c.acquired_by ? `acquired by ${esc(c.acquired_by)}` : (c.stage==='unknown' && c.stage_detail ? `listed as “${esc(c.stage_detail)}” on startups.gallery` : ''))}
      ${fact('Last round', isUnknown(lr.amount) ? 'unknown' : lr.amount + (/^(\$[\d.,]+[KMB]?|undisclosed)$/i.test(lr.amount) && lr.stage && !isUnknown(lr.stage) ? ' ' + lr.stage : ''), lrSrc)}
      ${fact('Round date', fmtDate(lr.date))}
      ${fact('Headcount', c.headcount, c.headcount_source && !isUnknown(c.headcount) ? 'per ' + esc(c.headcount_source) : '')}
      ${fact('HQ', c.hq?.location, c.hq?.source ? `source: <a href="${esc(c.hq.source)}" target="_blank" rel="noopener nofollow">${esc(c.hq.source_type || host(c.hq.source))}</a>` : '')}
      ${c.work_type ? fact('Work style', c.work_type, 'per startups.gallery') : ''}
    </div>
    ${c.about && c.about !== c.description ? `<section><h2>About</h2><p class="prose">${esc(c.about)}</p></section>` : ''}
    ${news.length ? `<section><h2>News</h2>${news.map(n=>`<a class="item" href="${esc(n.source_url)}" target="_blank" rel="noopener nofollow"><span class="logo" style="font-size:12px">${esc(n.type[0].toUpperCase())}</span><div><h3>${esc(n.headline)}</h3><p>${esc(fmtDate(n.date))} · ${esc(host(n.source_url))} ↗</p></div><span class="kind ${esc(n.type)}">${esc(n.type)}</span></a>`).join('')}</section>` : ''}
    ${c.open_roles_sample?.length ? `<section><h2>Open roles <small style="font:12px var(--mono);color:var(--muted)">${esc(c.open_roles_count_text||'')}, as of ${esc(fmtDate(c.last_verified))}</small></h2><div class="panel"><ul class="roles">${c.open_roles_sample.map(r=>`<li>${esc(r.title)}<small>${esc(r.meta)}</small></li>`).join('')}</ul>${c.careers_url?`<p style="margin:12px 0 0"><a class="btn" href="${esc(c.careers_url)}" target="_blank" rel="noopener">See all roles on their job board ↗</a></p>`:''}</div></section>` : ''}
  </div>
  <aside class="side">
    <div class="panel"><h4>Sources</h4><ul class="srcs">${c.sources.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener nofollow">${esc(s.label)} ↗</a><small>${esc(host(s.url))}</small></li>`).join('')}</ul></div>
    <div class="panel"><h4>Record</h4><ul><li><span>Last verified</span><span>${esc(fmtDate(c.last_verified))}</span></li><li><span>Origin</span><span>${esc(c.origin)}</span></li></ul><p style="margin:10px 0 0;color:var(--muted);font-size:12.5px"><b>unknown</b> = no source found; we don't guess.</p></div>
    ${similar(c)}
  </aside></div>`;
  window.scrollTo(0,0);
}
function similar(c) {
  const sim = DB.companies.filter(x => x.id !== c.id && (x.focus.some(f=>c.focus.includes(f)) || x.sectors.some(s=>c.sectors.includes(s)))).slice(0, 200)
    .sort((a,b)=> (b.focus.filter(f=>c.focus.includes(f)).length - a.focus.filter(f=>c.focus.includes(f)).length) || ((b.last_round.date||'').localeCompare(a.last_round.date||''))).slice(0, 6);
  if (!sim.length) return '';
  return `<div class="panel"><h4>Similar companies</h4><ul>${sim.map(x=>`<li><a href="#/c/${esc(x.id)}">${esc(x.name)}</a><span class="tag ${x.stage==='unknown'?'unknown':''}">${esc(x.stage)}</span></li>`).join('')}</ul></div>`;
}

/* ---------- ABOUT ---------- */
function renderAbout() {
  setTab('about');
  const cs = DB.companies, known = cs.filter(c=>c.stage!=='unknown').length;
  $app.innerHTML = `<div class="hero"><h1>About this index</h1></div><div class="prose">
  <p>A directory of startups headquartered or primarily based in New York City (all five boroughs), built for browsing who's building what — and who's hiring.</p>
  <h2>Rules</h2><ul>
  <li><b>Sourced, not guessed.</b> Stage, round amount, round date and headcount only appear when backed by a source we actually saw. Otherwise the field says <code>unknown</code>.</li>
  <li><b>Every company links to at least one source</b>: its startups.gallery profile, website, LinkedIn page and/or a funding announcement.</li>
  <li><b>NYC only.</b> HQ is checked against the LinkedIn company page where available (otherwise startups.gallery's location or a press source). Companies whose HQ is elsewhere are excluded.</li>
  <li><b>News items</b> are real funding announcements, launches or acquisitions, each with its source link.</li></ul>
  <h2>Coverage</h2><p>${cs.length} companies · ${known} with a known stage · ${cs.length-known} unknown · ${NEWS.length} news items.</p>
  <p>Focus areas: ${Object.keys(FOCUS).map(k=>`${esc(FOCUS[k])} (${cs.filter(c=>c.focus.includes(k)).length})`).join(' · ')}.</p>
  <h2>Data</h2><p>Raw data: <a href="/data/startups.json">startups.json</a> · <a href="/data/news.json">news.json</a>. Last updated ${esc(fmtDate(DB.meta.last_updated))}.</p></div>`;
}

let lastPath = null;
function route() {
  const { path, q } = parseHash();
  const keep = lastPath === '/companies' && path === '/companies' && document.activeElement?.id === 'q';
  if (path !== '/companies' || !keep) document.title = 'NYC Startup Index — funding news, companies & open roles';
  if (path === '/' || path === '') renderNews(q);
  else if (path === '/companies') { if (!keep) renderDir(q); }
  else if (path.startsWith('/c/')) renderCompany(decodeURIComponent(path.slice(3)));
  else if (path === '/about') renderAbout();
  else renderNews(q);
  lastPath = path;
}
load().then(() => { window.addEventListener('hashchange', route); route(); }).catch(e => { $app.innerHTML = `<div class="empty">Couldn't load data: ${esc(e.message)}</div>`; });
})();
