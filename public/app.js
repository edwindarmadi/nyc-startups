(() => {
'use strict';
const FOCUS = {climate:'Climate & energy', fair_finance:'Fair finance & access', civic:'Civic & gov tech', ai_everyday:'AI for everyday people'};
const STAGES = ['pre-seed','seed','Series A','Series B','Series C+','public','acquired','unknown'];
const STAGE_RANK = Object.fromEntries(STAGES.map((s,i)=>[s,i]));
const ROUNDS = ['pre-seed','seed','Series A','Series B','Series C','Series D','Series E+','Series C+ (unspecified)','public','acquired','unknown'];
const ROUND_LABEL = {'pre-seed':'Pre-seed','seed':'Seed','public':'Public','acquired':'Acquired','unknown':'Unknown'};
const rl = r => ROUND_LABEL[r] || r;
const ROUND_RANK = Object.fromEntries(ROUNDS.map((s,i)=>[s,i]));
// round chip bar; items: array with .round; sel: selected array; hrefFor(newSel) -> hash
function roundBar(items, sel, hrefFor, title) {
  const cnt = r => items.filter(x => x.round === r).length;
  const opts = ROUNDS.filter(r => r !== 'Series C+ (unspecified)' || cnt(r) > 0);
  const toggle = r => sel.includes(r) ? sel.filter(x => x !== r) : [...sel, r];
  return `<div class="roundbar" role="group" aria-label="${esc(title)}"><span class="rb-title">${esc(title)}</span>
    <a class="chip ${sel.length ? '' : 'on'}" href="${hrefFor([])}">All rounds<span class="n">${items.length}</span></a>
    ${opts.map(r => `<a class="chip ${sel.includes(r) ? 'on' : ''} ${cnt(r) ? '' : 'zero'}" data-round="${esc(r)}" href="${hrefFor(toggle(r))}">${esc(rl(r))}<span class="n">${cnt(r)}</span></a>`).join('')}
  </div>`;
}
let DB = null, NEWS = null, BY_ID = {}, JOBS = [], JOBS_META = {}, JOBS_BY_CO = {};
const $app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const host = u => { try { return new URL(u).hostname.replace(/^www\./,''); } catch { return ''; } };
const fmtDate = d => { if (!d || d === 'unknown') return 'unknown'; const p = d.split('-'); const dt = new Date(Date.UTC(+p[0], (+p[1]||1)-1, +p[2]||1)); return dt.toLocaleDateString('en-US', {month:'short', day: p[2] ? 'numeric' : undefined, year:'numeric', timeZone:'UTC'}); };
const isUnknown = v => !v || v === 'unknown';
const logo = (c, big) => { const h = host(c.website); const ini = esc((c.name||'?').trim()[0]); return h ? `<span class="logo"><img loading="lazy" alt="" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=${big?128:64}" onerror="this.parentNode.textContent='${ini}'"></span>` : `<span class="logo">${ini}</span>`; };
const stageTag = s => `<span class="tag ${s==='unknown'?'unknown':'stage'}">${esc(s==='unknown'?'round unknown':rl(s))}</span>`;
const focusTags = f => (f||[]).map(t => `<span class="tag f-${t}">${esc(FOCUS[t])}</span>`).join('');

async function load() {
  const [a, b, j] = await Promise.all([fetch('/data/startups.json').then(r=>r.json()), fetch('/data/news.json').then(r=>r.json()), fetch('/data/jobs.json').then(r=>r.ok ? r.json() : {meta:{}, jobs:[]}).catch(() => ({meta:{}, jobs:[]}))]);
  DB = a; NEWS = b.items; BY_ID = Object.fromEntries(DB.companies.map(c=>[c.id,c]));
  JOBS_META = j.meta || {};
  JOBS = (j.jobs || []).filter(x => BY_ID[x.company_id]);
  JOBS.forEach(x => { const c = BY_ID[x.company_id]; x.round = c.round; x.focus = c.focus || []; x.location_classes = x.location_classes || ['Other'];
    x._q = [x.title, c.name, x.department, x.team, (x.locations||[]).join(' '), x.employment_type].join(' ').toLowerCase();
    (JOBS_BY_CO[c.id] = JOBS_BY_CO[c.id] || []).push(x); });
  DB.companies.forEach(c => { c.jobs_count = (JOBS_BY_CO[c.id] || []).length; if (c.jobs_count) c.hiring = true; });
  DB.companies.forEach(c => { c._q = [c.name, c.description, c.tagline, c.about, (c.sectors||[]).join(' ')].join(' ').toLowerCase(); });
  document.getElementById('updated').textContent = `Last updated ${fmtDate(DB.meta.last_updated)} · ${DB.companies.length} companies · ${JOBS.length} open roles · ${NEWS.length} news items`;
}

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { path, q: new URLSearchParams(qs || '') };
}
function setTab(t) { document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === t)); }

/* ---------- JOBS ---------- */
const DEPTS = ['Data/Analytics','Engineering','Product','Design','Sales','Ops','Finance','Compliance/Risk/Legal','Marketing','Other'];
const LOCS = ['NYC','Remote','Hybrid','Other'];
const LEVELS = ['Intern/Entry','Mid','Senior','Lead/Manager+'];
const JOB_PAGE = 100;
let jobState = null, jobLimit = JOB_PAGE;
function jobStateFrom(q) {
  return { s: q.get('s') || '', dept: q.getAll('dept'), loc: q.getAll('loc'), round: q.getAll('round'), focus: q.getAll('focus'),
    level: q.getAll('level'), fit: q.get('fit') === '1', co: q.get('co') || '', sort: q.get('sort') || 'newest' };
}
function jobHash(st) {
  const p = new URLSearchParams();
  if (st.fit) p.set('fit', '1');
  if (st.s) p.set('s', st.s);
  if (st.co) p.set('co', st.co);
  ['dept','loc','round','focus','level'].forEach(k => st[k].forEach(v => p.append(k, v)));
  if (st.sort !== 'newest') p.set('sort', st.sort);
  const x = p.toString(); return '#/' + (x ? '?' + x : '');
}
// skip: facet to ignore (so its own chip counts reflect the other filters)
function filterJobs(st, skip) {
  const words = st.s.toLowerCase().split(/\s+/).filter(Boolean);
  return JOBS.filter(j =>
    (!st.fit || skip === 'fit' || j.fits_edwin) &&
    (!st.co || j.company_id === st.co) &&
    words.every(w => j._q.includes(w)) &&
    (skip === 'dept' || !st.dept.length || st.dept.includes(j.department_group)) &&
    (skip === 'loc' || !st.loc.length || j.location_classes.some(l => st.loc.includes(l))) &&
    (skip === 'round' || !st.round.length || st.round.includes(j.round)) &&
    (skip === 'focus' || !st.focus.length || st.focus.every(f => j.focus.includes(f))) &&
    (skip === 'level' || !st.level.length || st.level.includes(j.seniority)));
}
function sortJobs(list, sort) {
  const name = j => BY_ID[j.company_id].name;
  if (sort === 'company') return list.sort((a,b) => name(a).localeCompare(name(b)) || (b.posted||'').localeCompare(a.posted||''));
  return list.sort((a,b) => (b.posted||'').localeCompare(a.posted||'') || name(a).localeCompare(name(b)) || a.title.localeCompare(b.title));
}
const ago = d => {
  if (!d) return 'date not listed';
  const days = Math.floor((Date.now() - Date.parse(d + 'T12:00:00Z')) / 864e5);
  if (days <= 0) return 'today'; if (days === 1) return 'yesterday'; if (days < 30) return days + ' days ago';
  return fmtDate(d);
};
function jobLoc(j) {
  const ls = j.locations || [];
  const txt = ls.length ? ls.slice(0, 2).join(' · ') + (ls.length > 2 ? ` +${ls.length - 2}` : '') : 'location not listed';
  return esc(txt) + (j.work_style ? ` <span class="ws ws-${esc(j.work_style.toLowerCase())}">${esc(j.work_style)}</span>` : '');
}
function jobRow(j, onCompany) {
  const c = BY_ID[j.company_id];
  const meta = [j.department_group !== 'Other' ? j.department_group : (j.department || j.team || ''), j.seniority !== 'Mid' ? j.seniority : '', j.employment_type && !/full/i.test(j.employment_type) ? j.employment_type.replace(/([a-z])([A-Z])/g, '$1-$2') : '', j.compensation || ''].filter(Boolean).map(esc).join(' · ');
  return `<div class="job">
    ${onCompany ? '' : `<a href="#/c/${esc(c.id)}" class="jlogo" aria-hidden="true" tabindex="-1">${logo(c)}</a>`}
    <div class="jmain">
      <a class="jt" href="${esc(j.url || j.apply_url)}" target="_blank" rel="noopener">${esc(j.title)}</a>${j.fits_edwin ? '<span class="fit" title="Data, analytics, business/ops analyst or compliance/risk role">fits Edwin</span>' : ''}
      <div class="jsub">${onCompany ? '' : `<a class="jco" href="#/c/${esc(c.id)}">${esc(c.name)}</a>${stageTag(c.round)}`}<span class="jloc">${jobLoc(j)}</span></div>
      ${meta ? `<div class="jmeta">${meta}</div>` : ''}
    </div>
    <div class="jright"><span class="jdate" title="${esc(j.posted ? 'Posted ' + j.posted : 'The job board does not publish a date')}">${esc(ago(j.posted))}</span><a class="btn apply" href="${esc(j.apply_url || j.url)}" target="_blank" rel="noopener">Apply ↗</a></div>
  </div>`;
}
function renderJobs(q) {
  setTab('jobs');
  jobState = jobStateFrom(q); jobLimit = JOB_PAGE;
  const nCo = Object.keys(JOBS_BY_CO).length;
  const fitN = JOBS.filter(j => j.fits_edwin).length;
  $app.innerHTML = `<div class="hero"><h1>Open roles at NYC startups</h1>
    <p>${JOBS.length.toLocaleString()} jobs at ${nCo} New York companies, pulled straight from their job boards${JOBS_META.fetched_at ? ' on ' + esc(fmtDate(JOBS_META.fetched_at.slice(0,10))) : ''}. Apply opens the real posting.</p>
    <div class="fitbar"><button id="fit" class="fitbtn ${jobState.fit ? 'on' : ''}" aria-pressed="${jobState.fit}">★ Fits Edwin <span class="n">${fitN}</span></button><span class="fitnote">Data &amp; analytics, business/operations analyst, and compliance, risk, AML/KYC roles.</span></div>
    <div id="jrbar"></div></div>
  <div class="dir">
    <aside class="filters" id="jfilters"></aside>
    <div>
      <div class="toolbar">
        <label class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input id="jq" type="search" placeholder="Search title, company or keyword…" value="${esc(jobState.s)}" aria-label="Search jobs"></label>
        <select id="jsort" aria-label="Sort">${[['newest','Newest first'],['company','Company A–Z']].map(([v,l]) => `<option value="${v}" ${jobState.sort===v?'selected':''}>${l}</option>`).join('')}</select>
        <button class="btn ghost mfilter" id="jmf">Filters</button>
      </div>
      <div id="jresults"></div>
    </div>
  </div>`;
  const qi = document.getElementById('jq');
  qi.addEventListener('input', () => { jobState.s = qi.value; jobLimit = JOB_PAGE; updateJobs(); });
  document.getElementById('jsort').addEventListener('change', e => { jobState.sort = e.target.value; updateJobs(); });
  document.getElementById('fit').addEventListener('click', () => { jobState.fit = !jobState.fit; jobLimit = JOB_PAGE; updateJobs(); });
  document.getElementById('jmf').addEventListener('click', () => document.getElementById('jfilters').classList.toggle('open'));
  if (!window.__jc) { $app.addEventListener('click', jobClicks); window.__jc = 1; }
  updateJobs();
}
function jobClicks(e) {
  if (!jobState || parseHash().path !== '/') return;
  const t = e.target.closest('[data-jg],[data-round],#jmore,#jclear,#jco-x');
  if (!t || !$app.contains(t)) return;
  if (t.id === 'jmore') { jobLimit += JOB_PAGE; updateJobs(true); return; }
  e.preventDefault();
  if (t.id === 'jclear') { jobState = jobStateFrom(new URLSearchParams()); document.getElementById('jq').value = ''; }
  else if (t.id === 'jco-x') jobState.co = '';
  else if (t.dataset.jg) { const arr = jobState[t.dataset.jg], v = t.dataset.v, i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }
  else if (t.closest('#jrbar')) { const r = t.dataset.round; if (!r) jobState.round = []; else { const i = jobState.round.indexOf(r); if (i >= 0) jobState.round.splice(i, 1); else jobState.round.push(r); } }
  jobLimit = JOB_PAGE; updateJobs();
}
function updateJobs(more) {
  const st = jobState;
  history.replaceState(null, '', jobHash(st));
  const fb = document.getElementById('fit'); fb.classList.toggle('on', st.fit); fb.setAttribute('aria-pressed', st.fit);
  document.getElementById('jrbar').innerHTML = roundBar(filterJobs(st, 'round'), st.round, rs => jobHash({...st, round: rs}), 'Company round');
  const facet = (key, title, opts, label, val) => {
    const base = filterJobs(st, key);
    return `<div class="fgroup"><h5>${title}</h5><div class="chips">${opts.map(o => { const n = base.filter(j => val(j, o)).length;
      return `<button class="chip ${st[key].includes(o) ? 'on' : ''} ${n ? '' : 'zero'}" data-jg="${key}" data-v="${esc(o)}">${esc(label(o))}<span class="n">${n}</span></button>`; }).join('')}</div></div>`;
  };
  document.getElementById('jfilters').innerHTML =
    (st.co && BY_ID[st.co] ? `<div class="fgroup"><h5>Company</h5><button class="chip on" id="jco-x">${esc(BY_ID[st.co].name)} ✕</button></div>` : '') +
    facet('dept', 'Department', DEPTS, x => x, (j, o) => j.department_group === o) +
    facet('loc', 'Location', LOCS, x => x === 'NYC' ? 'New York City' : x, (j, o) => j.location_classes.includes(o)) +
    facet('level', 'Seniority', LEVELS, x => x, (j, o) => j.seniority === o) +
    facet('focus', 'Focus areas', Object.keys(FOCUS), x => FOCUS[x], (j, o) => j.focus.includes(o)) +
    `<button class="btn ghost" id="jclear">Clear all filters</button>
    <p class="fnote">Seniority is read from the job title; location type from the posting. A role listed in several places counts under each.</p>`;
  const list = sortJobs(filterJobs(st), st.sort);
  const cos = new Set(list.map(j => j.company_id)).size;
  let html = `<p class="count">${list.length.toLocaleString()} role${list.length === 1 ? '' : 's'} at ${cos} compan${cos === 1 ? 'y' : 'ies'}${st.fit ? ' · fits Edwin' : ''}</p>`;
  if (!list.length) html += `<div class="empty">No roles match. <a href="#/" id="jclear">Clear filters</a></div>`;
  else {
    html += `<div class="jobs">${list.slice(0, jobLimit).map(j => jobRow(j)).join('')}</div>`;
    if (list.length > jobLimit) html += `<p style="text-align:center;margin:16px 0 30px"><button class="btn ghost" id="jmore">Show ${Math.min(JOB_PAGE, list.length - jobLimit)} more (${(list.length - jobLimit).toLocaleString()} left)</button></p>`;
  }
  document.getElementById('jresults').innerHTML = html;
}

/* ---------- NEWS ---------- */
function renderNews(q) {
  setTab('news');
  const type = q.get('type') || 'all';
  const rsel = q.getAll('round');
  const byType = NEWS.filter(n => type === 'all' || n.type === type);
  const items = byType.filter(n => !rsel.length || rsel.includes(n.round));
  const newsHash = (t, rs) => { const p = new URLSearchParams(); if (t !== 'all') p.set('type', t); rs.forEach(r => p.append('round', r)); const x = p.toString(); return '#/news' + (x ? '?' + x : ''); };
  const types = ['all', ...new Set(NEWS.map(n=>n.type))];
  const counts = t => t==='all' ? NEWS.length : NEWS.filter(n=>n.type===t).length;
  let html = `<div class="hero"><h1>What's happening in NYC startups</h1><p>Funding rounds, launches and acquisitions from New York City companies — every item links to its source. Click any story for the company's round, links and open roles.</p>
  <div class="feedfilters">${types.map(t=>`<a class="chip ${t===type?'on':''}" href="${newsHash(t, rsel)}" style="text-decoration:none">${esc(t==='all'?'All news':t[0].toUpperCase()+t.slice(1))}<span class="n">${counts(t)}</span></a>`).join('')}</div>
  ${roundBar(byType, rsel, rs => newsHash(type, rs), 'Round')}</div>
  <div class="newsgrid"><div class="feed">`;
  let lastMonth = '';
  for (const n of items.slice(0, 200)) {
    const c = BY_ID[n.startup_id]; if (!c) continue;
    const m = n.date ? fmtDate(n.date.slice(0,7)) : 'Undated';
    if (m !== lastMonth) { html += `<div class="day">${esc(m)}</div>`; lastMonth = m; }
    html += `<a class="item" href="#/c/${esc(c.id)}">${logo(c)}<div><h3>${esc(n.headline)}</h3><p>${esc(fmtDate(n.date))} · ${esc(n.summary || c.description)}</p></div><span class="kind ${esc(n.type)}">${esc(n.type==='funding' && n.round && n.round!=='unknown' ? rl(n.round) : n.type)}</span></a>`;
  }
  if (!items.length) html += `<div class="empty">No news for this round yet. <a href="${newsHash(type, [])}">Show all rounds</a></div>`;
  if (items.length > 200) html += `<p class="count">Showing the latest 200 of ${items.length}.</p>`;
  html += `</div><aside class="side">${sidePanels()}</aside></div>`;
  $app.innerHTML = html;
}
function sidePanels() {
  const cs = DB.companies;
  const f = Object.keys(FOCUS).map(k => `<li><a href="#/companies?focus=${k}">${esc(FOCUS[k])}</a><span>${cs.filter(c=>c.focus.includes(k)).length}</span></li>`).join('');
  const st = ROUNDS.filter(r => r !== 'Series C+ (unspecified)' || cs.some(c=>c.round===r)).map(s => `<li><a href="#/companies?round=${encodeURIComponent(s)}">${esc(rl(s))}</a><span>${cs.filter(c=>c.round===s).length}</span></li>`).join('');
  const hiring = cs.filter(c=>c.hiring).length;
  return `<div class="panel"><h4>Focus areas</h4><ul>${f}</ul></div>
  <div class="panel"><h4>Hiring now</h4><p style="margin:0 0 10px;color:var(--muted);font-size:14px">${JOBS.length} open roles at ${Object.keys(JOBS_BY_CO).length} companies.</p><a class="btn" href="#/">Browse the jobs board →</a></div>
  <div class="panel"><h4>By round</h4><ul>${st}</ul></div>`;
}

/* ---------- DIRECTORY ---------- */
function getState(q) {
  return { s: q.get('s') || '', sector: q.getAll('sector'), round: [...q.getAll('round'), ...q.getAll('stage').flatMap(x => x === 'Series C+' ? ['Series C','Series D','Series E+','Series C+ (unspecified)'] : [x])], focus: q.getAll('focus'),
    hiring: q.get('hiring') === '1', careers: q.get('careers') === '1', sort: q.get('sort') || 'recent', view: q.get('view') || 'cards' };
}
function stateToHash(st) {
  const p = new URLSearchParams();
  if (st.s) p.set('s', st.s);
  st.sector.forEach(v=>p.append('sector', v)); st.round.forEach(v=>p.append('round', v)); st.focus.forEach(v=>p.append('focus', v));
  if (st.hiring) p.set('hiring','1'); if (st.careers) p.set('careers','1');
  if (st.sort !== 'recent') p.set('sort', st.sort); if (st.view !== 'cards') p.set('view', st.view);
  const s = p.toString(); return '#/companies' + (s ? '?' + s : '');
}
function filterList(st) {
  const words = st.s.toLowerCase().split(/\s+/).filter(Boolean);
  let list = DB.companies.filter(c =>
    words.every(w => c._q.includes(w)) &&
    (!st.sector.length || c.sectors.some(x => st.sector.includes(x))) &&
    (!st.round.length || st.round.includes(c.round)) &&
    (!st.focus.length || st.focus.every(f => c.focus.includes(f))) &&
    (!st.hiring || c.hiring) && (!st.careers || !!c.careers_url));
  const d = c => isUnknown(c.last_round.date) ? '' : c.last_round.date;
  const sorters = {
    recent: (a,b) => d(b).localeCompare(d(a)) || a.name.localeCompare(b.name),
    oldest: (a,b) => (d(a)||'9').localeCompare(d(b)||'9') || a.name.localeCompare(b.name),
    name: (a,b) => a.name.localeCompare(b.name),
    'name-desc': (a,b) => b.name.localeCompare(a.name),
    stage: (a,b) => ROUND_RANK[a.round]-ROUND_RANK[b.round] || a.name.localeCompare(b.name),
    'stage-desc': (a,b) => (a.round==='unknown')-(b.round==='unknown') || ROUND_RANK[b.round]-ROUND_RANK[a.round] || a.name.localeCompare(b.name),
  };
  return list.sort(sorters[st.sort] || sorters.recent);
}
let currentState = null;
function renderDir(q, keepFocus) {
  const st = getState(q); currentState = st;
  setTab(st.hiring && !st.s && !st.sector.length && !st.round.length && !st.focus.length ? 'companies' : 'companies');
  const all = DB.companies;
  const sectors = [...new Set(all.flatMap(c=>c.sectors))].sort((a,b)=> all.filter(c=>c.sectors.includes(b)).length - all.filter(c=>c.sectors.includes(a)).length);
  const chip = (group, val, label, n) => `<button class="chip ${st[group].includes(val)?'on':''}" data-g="${group}" data-v="${esc(val)}">${esc(label)}<span class="n">${n}</span></button>`;
  const head = st.hiring ? `<h1>Who's hiring in NYC</h1><p>Companies with open roles listed. Careers links go straight to each company's job board.</p>` : `<h1>Browse NYC startups</h1><p>Search by name or what they do, then narrow by funding round, sector, focus area or hiring status. Click a card for sources and details.</p>`;
  $app.innerHTML = `<div class="hero">${head}<div id="rbar"></div></div>
  <div class="dir">
    <aside class="filters" id="filters">
      <div class="fgroup"><h5>Focus areas</h5><div class="chips">${Object.keys(FOCUS).map(k=>chip('focus',k,FOCUS[k],all.filter(c=>c.focus.includes(k)).length)).join('')}</div></div>
      <div class="fgroup"><h5>Jobs</h5>
        <label class="toggle"><input type="checkbox" id="hiring" ${st.hiring?'checked':''}> Hiring now (roles listed)</label>
        <label class="toggle"><input type="checkbox" id="careers" ${st.careers?'checked':''}> Has careers link</label></div>
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
  const base = filterList({...st, round: []});
  const rb = document.getElementById('rbar');
  if (rb) {
    rb.innerHTML = roundBar(base, st.round, rs => stateToHash({...st, round: rs}), 'Funding round');
    rb.querySelectorAll('a.chip').forEach(a => a.addEventListener('click', e => {
      e.preventDefault(); const r = a.dataset.round;
      if (!r) currentState.round = []; else { const i = currentState.round.indexOf(r); if (i >= 0) currentState.round.splice(i, 1); else currentState.round.push(r); }
      history.replaceState(null, '', stateToHash(currentState)); renderResults(currentState);
    }));
  }
  const el = document.getElementById('results');
  let html = `<p class="count">${list.length} of ${DB.companies.length} companies</p>`;
  if (!list.length) { el.innerHTML = html + `<div class="empty">No companies match. Try removing a filter.</div>`; return; }
  if (st.view === 'list') {
    html += `<table class="table"><thead><tr><th>Company</th><th class="hide-s">Sector</th><th>Round</th><th class="hide-s">Last round</th><th class="hide-s">Headcount</th><th>Links</th></tr></thead><tbody>` +
      list.map(c => `<tr><td class="cn"><a class="nm" href="#/c/${esc(c.id)}">${esc(c.name)}</a><br><small style="color:var(--muted)">${esc(c.description)}</small></td>
      <td class="hide-s">${esc(c.sectors.join(', '))}</td><td>${stageTag(c.round)}${c.round_name && c.round_name !== c.round && c.round==='Series E+' ? `<br><small style="color:var(--muted)">${esc(c.round_name)}</small>` : ''}</td>
      <td class="hide-s">${esc(c.last_round.amount)}<br><small style="color:var(--muted)">${esc(fmtDate(c.last_round.date))}</small></td>
      <td class="hide-s">${esc(c.headcount)}</td>
      <td class="src">${c.careers_url?`<a href="${esc(c.careers_url)}" target="_blank" rel="noopener">careers</a>`:''}${c.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener nofollow">${esc(s.label.split(' ')[0].toLowerCase())}</a>`).join('')}</td></tr>`).join('') + `</tbody></table>`;
  } else {
    html += `<div class="grid">` + list.map(c => `<a class="card" href="#/c/${esc(c.id)}">
      <div class="head">${logo(c)}<div><h3>${esc(c.name)}</h3><div class="sub">${esc(c.sectors.join(' · '))}${isUnknown(c.last_round.date)?'':' · raised '+esc(fmtDate(c.last_round.date))}</div></div></div>
      <p>${esc(c.description)}</p>
      <div class="meta">${stageTag(c.round)}${c.hiring?`<span class="tag hiring">${c.jobs_count ? c.jobs_count + ' open role' + (c.jobs_count>1?'s':'') : 'hiring'}</span>`:''}${focusTags(c.focus)}</div></a>`).join('') + `</div>`;
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
    <div class="meta" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><a href="#/companies?round=${encodeURIComponent(c.round)}" style="text-decoration:none">${stageTag(c.round)}</a>${c.sectors.map(s=>`<a class="tag" href="#/companies?sector=${encodeURIComponent(s)}" style="text-decoration:none">${esc(s)}</a>`).join('')}${c.hiring?'<span class="tag hiring">hiring</span>':''}${focusTags(c.focus)}</div>
    <div class="actions">${(JOBS_BY_CO[c.id]||[]).length ? `<a class="btn" href="#jobs" onclick="document.getElementById('jobs').scrollIntoView({behavior:'smooth'});return false">${JOBS_BY_CO[c.id].length} open roles ↓</a>` : ''}${c.careers_url?`<a class="btn ${(JOBS_BY_CO[c.id]||[]).length ? 'ghost' : ''}" href="${esc(c.careers_url)}" target="_blank" rel="noopener">Careers page ↗</a>`:''}${c.website?`<a class="btn ghost" href="${esc(c.website)}" target="_blank" rel="noopener">${esc(host(c.website))} ↗</a>`:''}</div>
  </div></div>
  <div class="dgrid"><div>
    <div class="facts">
      ${fact('Round', c.round === 'unknown' ? 'unknown' : (c.round_name || rl(c.round)), c.acquired_by ? `acquired by ${esc(c.acquired_by)}` : (c.stage==='unknown' && c.stage_detail ? `listed as “${esc(c.stage_detail)}” on startups.gallery` : ''))}
      ${fact('Last round', isUnknown(lr.amount) ? 'unknown' : lr.amount + (/^(\$[\d.,]+[KMB]?|undisclosed)$/i.test(lr.amount) && lr.stage && !isUnknown(lr.stage) ? ' ' + lr.stage : ''), lrSrc)}
      ${fact('Round date', fmtDate(lr.date))}
      ${fact('Headcount', c.headcount, c.headcount_source && !isUnknown(c.headcount) ? 'per ' + esc(c.headcount_source) : '')}
      ${fact('HQ', c.hq?.location, c.hq?.source ? `source: <a href="${esc(c.hq.source)}" target="_blank" rel="noopener nofollow">${esc(c.hq.source_type || host(c.hq.source))}</a>` : '')}
      ${c.work_type ? fact('Work style', c.work_type, 'per startups.gallery') : ''}
    </div>
    ${c.about && c.about !== c.description ? `<section><h2>About</h2><p class="prose">${esc(c.about)}</p></section>` : ''}
    ${news.length ? `<section><h2>News</h2>${news.map(n=>`<a class="item" href="${esc(n.source_url)}" target="_blank" rel="noopener nofollow"><span class="logo" style="font-size:12px">${esc(n.type[0].toUpperCase())}</span><div><h3>${esc(n.headline)}</h3><p>${esc(fmtDate(n.date))} · ${esc(host(n.source_url))} ↗</p></div><span class="kind ${esc(n.type)}">${esc(n.type)}</span></a>`).join('')}</section>` : ''}
    ${(JOBS_BY_CO[id]||[]).length ? `<section id="jobs"><h2>Open roles <small style="font:12px var(--mono);color:var(--muted)">${JOBS_BY_CO[id].length} listed on their job board · fetched ${esc(fmtDate((JOBS_META.fetched_at||'').slice(0,10)))}</small></h2><div class="jobs compact">${JOBS_BY_CO[id].map(x => jobRow(x, true)).join('')}</div>${JOBS_BY_CO[id].length > 5 ? `<p style="margin:10px 0 0"><a class="btn ghost" href="#/?co=${encodeURIComponent(id)}">Filter these on the jobs board →</a></p>` : ''}</section>` : c.open_roles_sample?.length ? `<section><h2>Open roles <small style="font:12px var(--mono);color:var(--muted)">snapshot from startups.gallery (no public job feed found) · ${esc(c.open_roles_count_text||'')}, as of ${esc(fmtDate(c.last_verified))}</small></h2><div class="panel"><ul class="roles">${c.open_roles_sample.map(r=>`<li>${esc(r.title)}<small>${esc(r.meta)}</small></li>`).join('')}</ul>${c.careers_url?`<p style="margin:12px 0 0"><a class="btn" href="${esc(c.careers_url)}" target="_blank" rel="noopener">See all roles on their job board ↗</a></p>`:''}</div></section>` : ''}
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
  return `<div class="panel"><h4>Similar companies</h4><ul>${sim.map(x=>`<li><a href="#/c/${esc(x.id)}">${esc(x.name)}</a><span class="tag ${x.round==='unknown'?'unknown':''}">${esc(rl(x.round))}</span></li>`).join('')}</ul></div>`;
}

/* ---------- ABOUT ---------- */
function renderAbout() {
  setTab('about');
  const cs = DB.companies, known = cs.filter(c=>c.round!=='unknown').length;
  $app.innerHTML = `<div class="hero"><h1>About this index</h1></div><div class="prose">
  <p>A directory of startups headquartered or primarily based in New York City (all five boroughs), built for browsing who's building what — and who's hiring.</p>
  <h2>Rules</h2><ul>
  <li><b>Sourced, not guessed.</b> Stage, round amount, round date and headcount only appear when backed by a source we actually saw. Otherwise the field says <code>unknown</code>.</li>
  <li><b>Every company links to at least one source</b>: its startups.gallery profile, website, LinkedIn page and/or a funding announcement.</li>
  <li><b>NYC only.</b> HQ is checked against the LinkedIn company page where available (otherwise startups.gallery's location or a press source). Companies whose HQ is elsewhere are excluded.</li>
  <li><b>Jobs</b> come straight from each company's public applicant-tracking feed (Ashby, Greenhouse, Lever, Workable, Gem, Rippling). Every Apply button opens the real posting; roles that disappear from a feed are dropped on the next refresh. Department, location type and seniority are derived from the posting's own fields and title.</li>
  <li><b>News items</b> are real funding announcements, launches or acquisitions, each with its source link.</li></ul>
  <h2>Coverage</h2><p>${cs.length} companies · ${known} with a known round · ${cs.length-known} unknown · ${NEWS.length} news items.</p>
  <p>Focus areas: ${Object.keys(FOCUS).map(k=>`${esc(FOCUS[k])} (${cs.filter(c=>c.focus.includes(k)).length})`).join(' · ')}.</p>
  <h2>Data</h2><p>Raw data: <a href="/data/startups.json">startups.json</a> · <a href="/data/news.json">news.json</a> · <a href="/data/jobs.json">jobs.json</a> (${JOBS.length} roles, fetched ${esc(fmtDate((JOBS_META.fetched_at||'').slice(0,10)))}). Last updated ${esc(fmtDate(DB.meta.last_updated))}.</p></div>`;
}

let lastPath = null;
function route() {
  const { path, q } = parseHash();
  const keep = lastPath === '/companies' && path === '/companies' && document.activeElement?.id === 'q';
  if (path !== '/companies' || !keep) document.title = 'NYC Startup Index — open roles at NYC startups';
  const keepJ = lastPath === '/' && (path === '/' || path === '') && document.activeElement?.id === 'jq';
  if (path === '/' || path === '') { if (!keepJ) renderJobs(q); }
  else if (path === '/news') renderNews(q);
  else if (path === '/companies') { if (!keep) renderDir(q); }
  else if (path.startsWith('/c/')) renderCompany(decodeURIComponent(path.slice(3)));
  else if (path === '/about') renderAbout();
  else renderJobs(new URLSearchParams());
  lastPath = path === '' ? '/' : path;
}
load().then(() => { window.addEventListener('hashchange', route); route(); }).catch(e => { $app.innerHTML = `<div class="empty">Couldn't load data: ${esc(e.message)}</div>`; });
})();
