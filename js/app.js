(function () {
  'use strict';
  /* ---------- constantes ---------- */
  const GROUPS = {
    fixes: { label: 'Fixes', color: '#0e7c86' },
    var:   { label: 'Variables', color: '#e8a33d' },
    save:  { label: 'Épargne', color: '#6a994e' }
  };
  const GKEYS = Object.keys(GROUPS);
  const CASES = { opt: 'Optimiste', mid: 'Central', pes: 'Pessimiste' };
  const MODES = { fixed: 'Fixe', pct: '± %', range: 'Plage' };
  const KEY = 'budget-scenarios-v2';
  const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const r0 = Math.round;
  let uid = 0;
  const nid = () => 'i' + (++uid) + Math.random().toString(36).slice(2, 6);

  /* ---------- valeurs : fixe / ± % / plage ---------- */
  const fx = n => ({ mode: 'fixed', base: n, pct: 10, min: r0(n * .9), max: r0(n * 1.1) });
  const pc = (n, p) => ({ mode: 'pct', base: n, pct: p, min: r0(n * (1 - p / 100)), max: r0(n * (1 + p / 100)) });
  const rg = (a, b) => ({ mode: 'range', base: (a + b) / 2, pct: 10, min: a, max: b });

  function bounds(v) {
    if (v.mode === 'pct') { const d = v.base * v.pct / 100; return { min: v.base - d, max: v.base + d, mid: v.base }; }
    if (v.mode === 'range') { const lo = Math.min(v.min, v.max), hi = Math.max(v.min, v.max); return { min: lo, max: hi, mid: (lo + hi) / 2 }; }
    return { min: v.base, max: v.base, mid: v.base };
  }
  // optimiste = dépenses basses / revenu haut ; pessimiste = dépenses hautes / revenu bas
  function val(v, c, isIncome) {
    const b = bounds(v);
    if (c === 'mid') return b.mid;
    const low = isIncome ? c === 'pes' : c === 'opt';
    return low ? b.min : b.max;
  }
  function compute(sc, c) {
    const income = val(sc.income, c, true), g = { fixes: 0, var: 0, save: 0 };
    sc.items.forEach(i => { g[i.group] += val(i.v, c, false); });
    const total = g.fixes + g.var + g.save;
    return { income, g, total, rest: income - total };
  }
  const comps = sc => ({ opt: compute(sc, 'opt'), mid: compute(sc, 'mid'), pes: compute(sc, 'pes') });
  const fmtRange = (lo, hi) => r0(lo) === r0(hi) ? eur.format(lo) : nf.format(lo) + '–' + nf.format(hi) + ' €';

  function cleanSpec(v) {
    v = v || {};
    const n = x => Number.isFinite(+x) ? +x : 0;
    return { mode: MODES[v.mode] ? v.mode : 'fixed', base: n(v.base), pct: Math.max(0, n(v.pct)), min: n(v.min), max: n(v.max) };
  }
  function changeMode(v, m) {
    const b = bounds(v);
    if (m === 'pct') {
      if (v.mode === 'range') { v.base = r0(b.mid); v.pct = b.mid ? Math.round((b.max - b.min) / 2 / Math.abs(b.mid) * 1000) / 10 : 10; }
      else if (!v.pct) v.pct = 10;
    } else if (m === 'range') {
      v.min = r0(b.min); v.max = r0(b.max);
      if (v.min === v.max) { v.min = r0(v.base * .9); v.max = r0(v.base * 1.1); }
    } else { v.base = r0(b.mid); }
    v.mode = m;
  }

  /* ---------- données par défaut ---------- */
  function defItems() {
    return [
      ['Loyer / crédit immobilier', 'fixes', fx(1500)], ['Eau & ordures', 'fixes', pc(70, 10)],
      ['Électricité (clim incluse)', 'fixes', rg(100, 200)], ['Internet & mobiles', 'fixes', fx(80)],
      ['Assurance habitation', 'fixes', fx(40)], ['Assurances auto (2 véhicules)', 'fixes', fx(130)],
      ['Crédit auto', 'fixes', fx(350)], ['Mutuelle famille', 'fixes', fx(150)],
      ['Garde / cantine / périscolaire', 'fixes', pc(250, 20)],
      ['Courses alimentaires', 'var', pc(900, 10)], ['Carburant', 'var', pc(250, 15)],
      ['Santé hors mutuelle', 'var', rg(30, 70)], ['Enfant (vêtements, jouets, activités)', 'var', pc(150, 20)],
      ['Vêtements adultes', 'var', pc(120, 25)], ['Soins & beauté', 'var', fx(80)],
      ['Sorties & restaurants', 'var', rg(200, 400)], ['Abonnements (streaming, etc.)', 'var', fx(40)],
      ['Épargne mensuelle', 'save', fx(700)], ['Voyages (billets d’avion)', 'save', rg(200, 600)],
      ['Imprévus & entretien', 'save', pc(150, 30)]
    ].map(a => ({ id: nid(), name: a[0], group: a[1], v: a[2] }));
  }
  const newScenario = name => ({ id: nid(), name, income: fx(6000), items: defItems() });
  function freshProject() {
    const s = newScenario('Budget de base');
    return { title: 'Budget famille Guadeloupe', scenarios: [s], activeId: s.id, compare: [s.id] };
  }
  function cloneScenario(sc, name) {
    return { id: nid(), name, income: Object.assign({}, sc.income),
      items: sc.items.map(i => ({ id: nid(), name: i.name, group: i.group, v: Object.assign({}, i.v) })) };
  }

  /* ---------- import / validation ---------- */
  function parseProject(o) {
    if (!o || !Array.isArray(o.scenarios) || !o.scenarios.length) throw new Error('Fichier invalide : aucun scénario');
    const map = {};
    const scenarios = o.scenarios.map(s => {
      const id = nid(); map[s && s.id] = id; s = s || {};
      return { id, name: String(s.name || 'Scénario').slice(0, 80), income: cleanSpec(s.income),
        items: (Array.isArray(s.items) ? s.items : []).map(i => ({ id: nid(), name: String((i && i.name) || 'Poste').slice(0, 80),
          group: GROUPS[i && i.group] ? i.group : 'var', v: cleanSpec(i && i.v) })) };
    });
    let compare = Array.isArray(o.compare) ? o.compare.map(x => map[x]).filter(Boolean) : [];
    if (!compare.length) compare = scenarios.map(s => s.id);
    return { title: String(o.title || 'Projet').slice(0, 100), scenarios, activeId: map[o.activeId] || scenarios[0].id, compare };
  }

  /* ---------- état & persistance ---------- */
  let P, storeState = '';
  const ui = { tab: 'budget', case: 'mid', cmp: 'range' };
  const S = () => P.scenarios.find(s => s.id === P.activeId) || P.scenarios[0];
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) return parseProject(JSON.parse(raw)); } catch (e) {}
    return freshProject();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ title: P.title, activeId: P.activeId, compare: P.compare, scenarios: P.scenarios })); }
    catch (e) { toast('Stockage local indisponible : pense à exporter ton fichier JSON'); }
  }
  async function initStorage() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        let p = await navigator.storage.persisted();
        if (!p) p = await navigator.storage.persist();
        storeState = p ? 'Stockage persistant activé : le navigateur ne purgera pas tes données.' :
          'Stockage non garanti : installe l’appli (PWA) et pense à exporter un JSON de sauvegarde.';
      } else storeState = 'Données enregistrées sur cet appareil. Exporte un JSON pour les sauvegarder.';
    } catch (e) {}
    renderLeft();
  }
  let tt;
  function toast(m) {
    const t = $('#toast'); t.textContent = m; t.classList.add('show');
    clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- rendu : vue Budget ---------- */
  function renderHeader() { $('#hTitle').textContent = S().name; $('#hSub').textContent = P.title; }

  function renderBudget() {
    const sc = S(), c = ui.case, m = compute(sc, c), cp = comps(sc);
    $('#scChips').innerHTML = P.scenarios.map(s => `<button class="chip2${s.id === P.activeId ? ' on' : ''}" data-sid="${s.id}">${esc(s.name)}</button>`).join('');
    $('#caseSeg').innerHTML = Object.keys(CASES).map(k => `<button data-case="${k}" class="${c === k ? 'on' : ''}">${CASES[k]}</button>`).join('');
    const R = 80, C = 2 * Math.PI * R, base = Math.max(m.income, m.total, 1);
    const segs = GKEYS.map(g => ({ v: m.g[g], c: GROUPS[g].color }));
    if (m.rest > 0) segs.push({ v: m.rest, c: '#d9d4ca' });
    let off = 0, circles = '';
    segs.forEach(s => {
      const len = s.v / base * C;
      if (len > 0) circles += `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${s.c}" stroke-width="26" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}"/>`;
      off += len;
    });
    $('#donut').innerHTML = `<circle cx="100" cy="100" r="${R}" fill="none" stroke="#f1ece2" stroke-width="26"/>` + circles;
    $('#restVal').textContent = eur.format(m.rest);
    $('#restVal').className = 'val' + (m.rest < 0 ? ' neg' : '');
    $('#restLbl').textContent = m.rest < 0 ? 'Dépassement' : 'Reste à vivre';
    $('#restSub').textContent = `sur ${eur.format(m.income)} net / mois`;
    const lo = cp.pes.rest, hi = cp.opt.rest;
    $('#restRange').innerHTML = r0(lo) === r0(hi) ? 'Aucune incertitude dans ce scénario' :
      `Reste entre <b class="${lo < 0 ? 'neg' : ''}">${eur.format(lo)}</b> (pessimiste) et <b>${eur.format(hi)}</b> (optimiste)`;
    $('#groups').innerHTML = GKEYS.map(g => `<div class="chip"><div class="n"><span class="dot" style="background:${GROUPS[g].color}"></span>${GROUPS[g].label}</div>
      <div class="a">${eur.format(m.g[g])}</div><div class="p">${m.income ? r0(m.g[g] / m.income * 100) : 0} %</div></div>`).join('');
    const rows = sc.items.map(i => ({ i, x: val(i.v, c, false), b: bounds(i.v) })).sort((a, b) => b.x - a.x);
    const max = Math.max(1, ...rows.map(r => r.x));
    $('#list').innerHTML = rows.length ? rows.map(r => `<div class="row"><div class="top"><span>${esc(r.i.name)}</span><span>${eur.format(r.x)}</span></div>
      <div class="bar"><i style="width:${Math.max(0, r.x) / max * 100}%;background:${GROUPS[r.i.group].color}"></i></div>
      <div class="pct">${m.income ? (r.x / m.income * 100).toFixed(1).replace('.', ',') : 0} % du revenu${r.b.min !== r.b.max ? ' · plage ' + fmtRange(r.b.min, r.b.max) : ''}</div></div>`).join('')
      : '<div class="empty">Aucune dépense. Ajoute-en via ✎.</div>';
  }

  /* ---------- rendu : vue Comparer ---------- */
  function renderCompare() {
    $('#cmpChips').innerHTML = P.scenarios.map(s => `<button class="chip2${P.compare.includes(s.id) ? ' on' : ' off'}" data-cid="${s.id}">${esc(s.name)}</button>`).join('');
    const views = { range: 'Plage', opt: 'Optimiste', mid: 'Central', pes: 'Pessimiste' };
    $('#cmpSeg').innerHTML = Object.keys(views).map(k => `<button data-cv="${k}" class="${ui.cmp === k ? 'on' : ''}">${views[k]}</button>`).join('');
    const scs = P.scenarios.filter(s => P.compare.includes(s.id));
    if (!scs.length) {
      $('#cmpTable').innerHTML = '<tr><td class="empty">Sélectionne au moins un scénario ci-dessus.</td></tr>';
      $('#chartStack').innerHTML = $('#chartRange').innerHTML = '<div class="empty">–</div>'; return;
    }
    const cps = scs.map(comps), v = ui.cmp;
    const agg = (cp, get) => {
      if (v === 'range') { const a = get(cp.opt), b = get(cp.pes); return { t: fmtRange(Math.min(a, b), Math.max(a, b)), neg: Math.min(a, b) < 0 }; }
      const x = get(cp[v]); return { t: eur.format(x), neg: x < 0 };
    };
    const td = a => `<td class="${a.neg ? 'neg' : ''}">${a.t}</td>`;
    let h = `<thead><tr><th></th>${scs.map(s => `<th>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>`;
    h += `<tr><td>Revenu net</td>${cps.map(cp => td(agg(cp, m => m.income))).join('')}</tr>`;
    h += `<tr><td>Dépenses totales</td>${cps.map(cp => td(Object.assign(agg(cp, m => m.total), { neg: false }))).join('')}</tr>`;
    h += `<tr class="strong"><td>Reste à vivre</td>${cps.map(cp => td(agg(cp, m => m.rest))).join('')}</tr>`;
    GKEYS.forEach(g => { h += `<tr><td><span class="dot" style="background:${GROUPS[g].color}"></span>${GROUPS[g].label}</td>${cps.map(cp => td(Object.assign(agg(cp, m => m.g[g]), { neg: false }))).join('')}</tr>`; });
    h += `<tr class="sep"><td colspan="${scs.length + 1}">Détail par poste</td></tr>`;
    const keyOf = i => i.group + '|' + i.name.trim().toLowerCase(), order = [], seen = {};
    scs.forEach(s => s.items.forEach(i => { const k = keyOf(i); if (!seen[k]) { seen[k] = { name: i.name, group: i.group }; order.push(k); } }));
    GKEYS.forEach(g => order.filter(k => seen[k].group === g).forEach(k => {
      h += `<tr><td><span class="dot" style="background:${GROUPS[g].color}"></span>${esc(seen[k].name)}</td>` + scs.map(s => {
        const it = s.items.find(i => keyOf(i) === k);
        if (!it) return '<td>–</td>';
        if (v === 'range') { const b = bounds(it.v); return `<td>${fmtRange(b.min, b.max)}</td>`; }
        return `<td>${eur.format(val(it.v, v, false))}</td>`;
      }).join('') + '</tr>';
    }));
    $('#cmpTable').innerHTML = h + '</tbody>';
    const cc = v === 'range' ? 'mid' : v;
    $('#stackTitle').textContent = 'Répartition (' + (v === 'range' ? 'cas central' : CASES[cc].toLowerCase()) + ')';
    $('#chartStack').innerHTML = stackChart(scs, cps.map(cp => cp[cc]));
    $('#chartRange').innerHTML = rangeChart(scs, cps);
  }

  function stackChart(scs, ms) {
    const W = 360, RH = 56, max = Math.max(1, ...ms.map(m => Math.max(m.income, m.total)));
    let s = '';
    ms.forEach((m, i) => {
      const y = i * RH; let x = 0;
      s += `<text x="0" y="${y + 13}">${esc(scs[i].name)}</text>`;
      GKEYS.forEach(g => { const w = Math.max(0, m.g[g] / max * W); s += `<rect x="${x}" y="${y + 20}" width="${w}" height="20" fill="${GROUPS[g].color}"/>`; x += w; });
      if (m.rest > 0) s += `<rect x="${x}" y="${y + 20}" width="${m.rest / max * W}" height="20" fill="#d9d4ca"/>`;
      s += `<rect x="0" y="${y + 20}" width="${W}" height="20" rx="4" fill="none" stroke="#ebe5da"/>`;
      s += `<text class="mut" x="0" y="${y + 53}">Dépenses ${eur.format(m.total)} · Reste </text><text x="${W}" y="${y + 53}" text-anchor="end" fill="${m.rest < 0 ? '#d64545' : '#1f2a30'}" style="fill:${m.rest < 0 ? '#d64545' : '#1f2a30'};font-weight:700">${eur.format(m.rest)}</text>`;
    });
    const ly = ms.length * RH + 6;
    GKEYS.forEach((g, k) => { s += `<rect x="${k * 96}" y="${ly}" width="10" height="10" rx="2" fill="${GROUPS[g].color}"/><text class="mut" x="${k * 96 + 15}" y="${ly + 9}">${GROUPS[g].label}</text>`; });
    s += `<rect x="288" y="${ly}" width="10" height="10" rx="2" fill="#d9d4ca"/><text class="mut" x="303" y="${ly + 9}">Reste</text>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${ly + 18}">${s}</svg>`;
  }

  function rangeChart(scs, cps) {
    const RH = 50, X0 = 52, XW = 256, W = 360;
    const lo = cps.map(c => c.pes.rest), hi = cps.map(c => c.opt.rest), mid = cps.map(c => c.mid.rest);
    const mn = Math.min(0, ...lo), mx = Math.max(0, ...hi), span = (mx - mn) || 1;
    const X = v => X0 + (v - mn) / span * XW;
    let s = '';
    scs.forEach((sc, i) => {
      const y = i * RH, cy = y + 30;
      s += `<text x="0" y="${y + 12}">${esc(sc.name)}</text>`;
      s += `<line x1="${X(lo[i])}" x2="${X(hi[i])}" y1="${cy}" y2="${cy}" stroke="#0e7c86" stroke-opacity=".35" stroke-width="12" stroke-linecap="round"/>`;
      s += `<circle cx="${X(mid[i])}" cy="${cy}" r="5.5" fill="#0e7c86"/>`;
      if (r0(lo[i]) === r0(hi[i])) s += `<text class="mut" x="${X(mid[i]) + 12}" y="${cy + 4}">${nf.format(mid[i])} €</text>`;
      else {
        s += `<text class="mut" x="${X(lo[i]) - 10}" y="${cy + 4}" text-anchor="end" style="${lo[i] < 0 ? 'fill:#d64545' : ''}">${nf.format(lo[i])}</text>`;
        s += `<text class="mut" x="${X(hi[i]) + 10}" y="${cy + 4}">${nf.format(hi[i])}</text>`;
      }
    });
    const h = scs.length * RH;
    s += `<line x1="${X(0)}" x2="${X(0)}" y1="0" y2="${h}" stroke="#6b767c" stroke-dasharray="3 3"/>`;
    s += `<text class="mut" x="${X(0)}" y="${h + 12}" text-anchor="middle">0 €</text>`;
    s += `<text class="mut" x="0" y="${h + 28}">Barre = de pessimiste à optimiste · point = central</text>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${h + 34}">${s}</svg>`;
  }

  /* ---------- tiroir gauche : projet & scénarios ---------- */
  function renderLeft() {
    const canShare = typeof File === 'function' && navigator.canShare && (() => { try { return navigator.canShare({ files: [new File(['{}'], 'a.json', { type: 'application/json' })] }); } catch (e) { return false; } })();
    let h = `<div class="gtitle">Titre du projet</div><div class="field"><input class="name" id="ptitle" value="${esc(P.title)}"></div>
      <div class="gtitle">Scénarios</div>`;
    h += P.scenarios.map(s => `<div class="field sc${s.id === P.activeId ? ' active' : ''}" data-sid="${s.id}">
      <button class="ib selbtn" data-act="sel" title="Ouvrir">${s.id === P.activeId ? '●' : '○'}</button>
      <input class="name" data-act="rename" value="${esc(s.name)}" aria-label="Nom du scénario">
      <button class="ib" data-act="dup" title="Dupliquer">⧉</button><button class="ib" data-act="delsc" title="Supprimer">✕</button></div>`).join('');
    h += `<div class="btns"><button class="btn ghost" id="newSc">+ Nouveau (budget type)</button></div>
      <div class="gtitle">Fichier</div>
      <div class="btns"><button class="btn primary" id="exportBtn">Exporter JSON</button>${canShare ? '<button class="btn ghost" id="shareBtn">Partager</button>' : ''}<button class="btn ghost" id="importBtn">Importer JSON</button></div>
      <p class="note">Nom du fichier : titre du projet + date. L’import remplace le projet actuel.</p>
      <p class="note">${esc(storeState)}</p>
      <details><summary>Hypothèses du budget type</summary><ul class="note">
        <li>2 adultes + 1 enfant de 3 ans et demi (maternelle, cantine/périscolaire), Guadeloupe.</li>
        <li>Courses majorées (vie chère), deux véhicules, climatisation, billets d’avion vers la métropole.</li>
        <li>Optimiste = dépenses au minimum et revenu au maximum ; pessimiste = l’inverse.</li>
      </ul></details>`;
    $('#leftBody').innerHTML = h;
  }

  /* ---------- vue Éditer : tableau ---------- */
  function editRow(o, isIncome) {
    const id = isIncome ? 'income' : o.id, v = isIncome ? o.income : o.v, b = bounds(v);
    const inp = (f, x) => `<input type="number" inputmode="decimal" step="any" data-id="${id}" data-f="${f}" value="${x}" aria-label="${f}">`;
    const ro = (k, x) => `<span class="ro" id="${k}-${id}">${nf.format(x)}</span>`;
    const mode = `<select data-id="${id}" data-f="mode" aria-label="Mode">${Object.keys(MODES).map(m => `<option value="${m}"${v.mode === m ? ' selected' : ''}>${MODES[m]}</option>`).join('')}</select>`;
    const name = isIncome ? '<b>Salaire net mensuel</b>' :
      `<button class="gdot" data-act="grp" data-id="${id}" style="background:${GROUPS[o.group].color}" title="Changer de catégorie"></button><input class="nin" data-id="${id}" data-f="name" value="${esc(o.name)}" aria-label="Nom">`;
    return `<tr${isIncome ? ' class="inc"' : ''}><td><div class="nmw">${name}</div></td><td>${mode}</td>
      <td>${v.mode === 'range' ? ro('bs', b.mid) : inp('base', v.base)}</td>
      <td>${v.mode === 'pct' ? inp('pct', v.pct) : '<span class="ro">–</span>'}</td>
      <td>${v.mode === 'range' ? inp('min', v.min) : ro('mn', b.min)}</td>
      <td>${v.mode === 'range' ? inp('max', v.max) : ro('mx', b.max)}</td>
      <td>${isIncome ? '' : `<button class="delb" data-act="delitem" data-id="${id}" title="Supprimer">✕</button>`}</td></tr>`;
  }
  function renderEditChips() {
    $('#edChips').innerHTML = P.scenarios.map(s => `<button class="chip2${s.id === P.activeId ? ' on' : ''}" data-sid="${s.id}">${esc(s.name)}</button>`).join('');
  }
  function renderEditTotals() {
    const cp = comps(S());
    const set = (id, x, neg) => { const el = $('#' + id); if (el) { el.textContent = nf.format(x); if (neg) el.classList.toggle('neg', x < 0); } };
    set('tt-b', cp.mid.total); set('tt-mn', cp.opt.total); set('tt-mx', cp.pes.total);
    set('rt-b', cp.mid.rest, 1); set('rt-mn', cp.pes.rest, 1); set('rt-mx', cp.opt.rest, 1);
    const cl = x => x < 0 ? ' class="neg"' : '';
    $('#edSummary').innerHTML = `<b>Reste à vivre</b> : <b${cl(cp.mid.rest)}>${eur.format(cp.mid.rest)}</b> central · de <b${cl(cp.pes.rest)}>${eur.format(cp.pes.rest)}</b> (pessimiste) à <b${cl(cp.opt.rest)}>${eur.format(cp.opt.rest)}</b> (optimiste)`;
  }
  function renderEdit() {
    const sc = S(); renderEditChips();
    let h = '<thead><tr><th>Poste</th><th>Mode</th><th>Base €</th><th>± %</th><th>Min €</th><th>Max €</th><th></th></tr></thead><tbody>';
    h += editRow(sc, true);
    GKEYS.forEach(g => {
      h += `<tr class="gh"><td colspan="7" style="color:${GROUPS[g].color}">${GROUPS[g].label}</td></tr>`;
      sc.items.filter(i => i.group === g).forEach(i => { h += editRow(i, false); });
      h += `<tr class="addr"><td colspan="7"><button class="addbtn" data-act="additem" data-g="${g}">+ Ajouter une ligne</button></td></tr>`;
    });
    h += `<tr class="gh"><td colspan="7">Totaux</td></tr>
      <tr class="tot"><td>Total dépenses</td><td></td><td id="tt-b"></td><td></td><td id="tt-mn"></td><td id="tt-mx"></td><td></td></tr>
      <tr class="tot"><td>Reste à vivre</td><td></td><td id="rt-b"></td><td></td><td id="rt-mn"></td><td id="rt-mx"></td><td></td></tr></tbody>`;
    $('#edTable').innerHTML = h; renderEditTotals();
  }

  function renderAll() { renderHeader(); renderBudget(); renderCompare(); }
  function setTab(t) {
    ui.tab = t;
    $('#viewBudget').hidden = t !== 'budget'; $('#viewEdit').hidden = t !== 'edit'; $('#viewCompare').hidden = t !== 'compare';
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    window.scrollTo(0, 0);
  }

  /* ---------- fichier : export / import ---------- */
  const pad = n => String(n).padStart(2, '0');
  function fileName() {
    const t = (P.title || 'budget').replace(/[\\/:*?"<>|]+/g, '').trim() || 'budget', d = new Date();
    return `${t}_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
  }
  function exportBlob() {
    const data = { app: 'budget-scenarios', version: 2, title: P.title, exportedAt: new Date().toISOString(),
      activeId: P.activeId, compare: P.compare, scenarios: P.scenarios };
    return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  }
  function doExport() {
    const a = document.createElement('a'); a.href = URL.createObjectURL(exportBlob()); a.download = fileName();
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Exporté : ' + a.download);
  }
  async function doShare() {
    try { await navigator.share({ files: [new File([exportBlob()], fileName(), { type: 'application/json' })], title: P.title }); }
    catch (e) { if (e.name !== 'AbortError') toast('Partage impossible'); }
  }
  function doImport(file) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const p = parseProject(JSON.parse(rd.result));
        if (!confirm(`Remplacer le projet actuel par « ${p.title} » (${p.scenarios.length} scénario${p.scenarios.length > 1 ? 's' : ''}) ?`)) return;
        P = p; save(); renderAll(); renderLeft(); renderEdit(); toast('Projet importé');
      } catch (e) { toast('Import impossible : ' + e.message); }
    };
    rd.readAsText(file);
  }

  /* ---------- événements ---------- */
  function toggle(id, open) { $(id).classList.toggle('open', open); $('#scrim').classList.toggle('open', open); }
  function closeAll() { document.querySelectorAll('.drawer').forEach(d => d.classList.remove('open')); $('#scrim').classList.remove('open'); }
  function setActive(id) { P.activeId = id; save(); renderAll(); renderLeft(); renderEdit(); }

  function bind() {
    $('#menuBtn').onclick = () => { renderLeft(); toggle('#drawerL', true); };
    $('#scrim').onclick = closeAll;
    document.querySelectorAll('.close').forEach(b => b.onclick = closeAll);
    document.querySelector('.tabs').onclick = e => { const t = e.target.dataset.tab; if (t) setTab(t); };
    $('#scChips').onclick = e => { const id = e.target.dataset.sid; if (id) setActive(id); };
    $('#caseSeg').onclick = e => { const k = e.target.dataset.case; if (k) { ui.case = k; renderBudget(); } };
    $('#cmpSeg').onclick = e => { const k = e.target.dataset.cv; if (k) { ui.cmp = k; renderCompare(); } };
    $('#cmpChips').onclick = e => {
      const id = e.target.dataset.cid; if (!id) return;
      P.compare = P.compare.includes(id) ? P.compare.filter(x => x !== id) : P.compare.concat(id);
      save(); renderCompare();
    };
    $('#fileIn').onchange = e => { if (e.target.files[0]) doImport(e.target.files[0]); e.target.value = ''; };

    const left = $('#leftBody');
    left.addEventListener('input', e => {
      const t = e.target;
      if (t.id === 'ptitle') P.title = t.value;
      else if (t.dataset.act === 'rename') P.scenarios.find(s => s.id === t.closest('.sc').dataset.sid).name = t.value;
      else return;
      save(); renderHeader(); renderBudget(); renderCompare(); renderEditChips();
    });
    left.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      const row = t.closest('.sc'), id = row && row.dataset.sid, act = t.dataset.act;
      if (act === 'sel') setActive(id);
      else if (act === 'dup') {
        const src = P.scenarios.find(s => s.id === id), c = cloneScenario(src, src.name + ' (copie)');
        P.scenarios.splice(P.scenarios.indexOf(src) + 1, 0, c); P.compare.push(c.id); P.activeId = c.id;
        save(); renderAll(); renderLeft(); renderEdit(); toast('Scénario dupliqué');
      } else if (act === 'delsc') {
        if (P.scenarios.length < 2) return toast('Il faut garder au moins un scénario');
        const s = P.scenarios.find(x => x.id === id);
        if (!confirm(`Supprimer le scénario « ${s.name} » ?`)) return;
        P.scenarios = P.scenarios.filter(x => x.id !== id); P.compare = P.compare.filter(x => x !== id);
        if (!P.compare.length) P.compare = [P.scenarios[0].id];
        if (P.activeId === id) P.activeId = P.scenarios[0].id;
        save(); renderAll(); renderLeft(); renderEdit();
      } else if (t.id === 'newSc') {
        const s = newScenario('Nouveau scénario'); P.scenarios.push(s); P.compare.push(s.id); P.activeId = s.id;
        save(); renderAll(); renderLeft(); renderEdit();
      } else if (t.id === 'exportBtn') doExport();
      else if (t.id === 'shareBtn') doShare();
      else if (t.id === 'importBtn') $('#fileIn').click();
    });

    const tbl = $('#edTable');
    const specOf = id => id === 'income' ? S().income : S().items.find(i => i.id === id).v;
    const refreshRow = id => {
      const b = bounds(specOf(id)), set = (k, x) => { const el = $('#' + k + '-' + id); if (el) el.textContent = nf.format(x); };
      set('bs', b.mid); set('mn', b.min); set('mx', b.max);
    };
    $('#edChips').onclick = e => { const id = e.target.dataset.sid; if (id) setActive(id); };
    tbl.addEventListener('input', e => {
      const t = e.target, id = t.dataset.id, f = t.dataset.f; if (!id || !f || f === 'mode') return;
      if (f === 'name') S().items.find(i => i.id === id).name = t.value;
      else { specOf(id)[f] = parseFloat(t.value) || 0; refreshRow(id); }
      save(); renderBudget(); renderCompare(); renderEditTotals();
    });
    tbl.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.f === 'mode') { changeMode(specOf(t.dataset.id), t.value); save(); renderBudget(); renderCompare(); renderEdit(); }
    });
    tbl.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      const act = t.dataset.act, id = t.dataset.id;
      if (act === 'grp') {
        const it = S().items.find(i => i.id === id); it.group = GKEYS[(GKEYS.indexOf(it.group) + 1) % GKEYS.length];
        save(); renderAll(); renderEdit();
      } else if (act === 'delitem') {
        const it = S().items.find(i => i.id === id);
        if (!confirm(`Supprimer « ${it.name} » ?`)) return;
        S().items = S().items.filter(i => i.id !== id); save(); renderAll(); renderEdit();
      } else if (act === 'additem') {
        const it = { id: nid(), name: 'Nouveau poste', group: t.dataset.g, v: fx(0) };
        S().items.push(it); save(); renderAll(); renderEdit();
        const inp = document.querySelector(`input[data-id="${it.id}"][data-f="name"]`); if (inp) { inp.focus(); inp.select(); }
      }
    });
  }

  /* ---------- PWA ---------- */
  function initInstall() {
    const btn = $('#installBtn'); if (!btn) return;
    if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;
    let deferred = null;
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; btn.style.display = 'grid'; });
    window.addEventListener('appinstalled', () => { btn.style.display = 'none'; });
    btn.onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; btn.style.display = 'none'; };
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

  P = load();
  bind(); renderAll(); renderLeft(); renderEdit(); initInstall(); initStorage();
})();
