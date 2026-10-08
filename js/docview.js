// Verify by document: the whole text with every coded fragment marked, and the fragments' codes beside it.

import { S, docEvents, addEvent, firstCodes, firstExtras, unitList, findUnit, notify } from './data.js';
import { memoFor, commentsFor } from './events.js';
import { h, colourFor, bar, pct } from './ui.js';
import { pdfParts } from './documents.js';
import { V, renderVerify, modeBar, verifiableFrames, indexMine, unresolved, badParent, fieldRows, docOrder, currentSample } from './verify.js';
import { snippetsFor, findSpans, pageRefs, segments } from './match.js';

export const D = { doc: null, task: null, fidx: 0, tab: null, filter: 'todo', pages: new Map(), failed: new Set(), pdf: new Map(), scroll: null, keep: null };

/** For each verifiable frame, its current sample: the same one the fragment view uses. */
function activeSamples() {
  const out = [];
  for (const f of verifiableFrames()) { const s = currentSample(f); if (s) out.push({ frame: f, sample: s }); }
  return out;
}

/** Every (unit, frame) to verify, grouped by document, in document and unit order. */
function buildTasks(active) {
  const byDoc = new Map();
  const ord = docOrder();
  for (const { frame, sample } of active) {
    const mine = indexMine(sample);
    for (const u of sample.units) {
      if (!byDoc.has(u.doc)) byDoc.set(u.doc, []);
      byDoc.get(u.doc).push({ key: `${frame.id}|${u.unit}`, doc: u.doc, unit: u.unit, frame, sample, st: mine.get(u.unit) || { fields: {}, done: false } });
    }
  }
  for (const [doc, list] of byDoc) {
    const pos = new Map(unitList(doc).map((x, i) => [x.id, i]));
    const fo = new Map(active.map((a, i) => [a.frame.id, i]));
    list.sort((a, b) => ((pos.get(a.unit) ?? 0) - (pos.get(b.unit) ?? 0)) || (fo.get(a.frame.id) - fo.get(b.frame.id)));
  }
  const docs = [...byDoc.keys()].sort((a, b) => (ord.get(a) ?? 0) - (ord.get(b) ?? 0));
  return { byDoc, docs };
}

function loadPages(doc) {
  const path = `documents/${doc}.pages.json`;
  if (D.pages.has(doc) || D.failed.has(doc) || !S.store.has(path)) return;
  D.pages.set(doc, null);
  S.store.readJSON(path).then((x) => { D.pages.set(doc, x.pages || []); notify(); }).catch(() => { D.pages.delete(doc); D.failed.add(doc); notify(); });
}

function hasPdf(d) { return d && pdfParts(d).some((x) => S.store.has(x.file)); }

/** PDF part and page within it for a printed page number. */
function pdfTarget(d, page) {
  const parts = pdfParts(d).filter((x) => S.store.has(x.file));
  const n = parseInt(String(page ?? '').replace(/^(e|pp?\.\s*)/i, ''), 10);
  const part = (Number.isFinite(n) && parts.find((x) => n >= x.from && (x.to === null || n <= x.to))) || parts[0];
  return part ? { file: part.file, local: Number.isFinite(n) ? n - part.from + 1 : null } : null;
}

function pdfUrl(file) {
  if (D.pdf.has(file)) return D.pdf.get(file);
  D.pdf.set(file, null);
  S.store.readBlob(file).then((b) => { D.pdf.set(file, URL.createObjectURL(new Blob([b], { type: 'application/pdf' }))); notify(); }).catch(() => { D.pdf.delete(file); });
  return null;
}

const pageNum = (label) => parseInt(String(label ?? '').replace(/^e/i, ''), 10);

/** Where each unit sits in the text: highlighted spans per page, and the pages it cites. */
function locate(doc, pages, units) {
  const spans = new Map(); // page index -> [{start,end,key}]
  const cites = new Map(); // page index -> Set(unit id)
  const found = new Map(); // unit id -> {marks, pages:Set(page index)}
  const L = S.layers.get(S.review.first_layer)?.get(doc);
  for (const u of units) {
    const quotes = [];
    const raw = L?.codes?.[u.id];
    if (raw) for (const fr of Object.values(raw)) for (const v of Object.values(fr || {})) if (v && typeof v === 'object' && v.quote) quotes.push(v.quote);
    const snips = snippetsFor(u, quotes);
    const refs = new Set(pageRefs(`${u.page ? 'p.' + u.page : ''} ${u.text || ''}`));
    const rec = { marks: 0, pages: new Set() };
    pages.forEach((p, i) => {
      if (snips.length) for (const s of findSpans(p.text, snips)) { if (!spans.has(i)) spans.set(i, []); spans.get(i).push({ ...s, key: u.id }); rec.marks++; rec.pages.add(i); }
      if (refs.has(pageNum(p.label))) { if (!cites.has(i)) cites.set(i, new Set()); cites.get(i).add(u.id); rec.pages.add(i); }
    });
    found.set(u.id, rec);
  }
  return { spans, cites, found };
}

export function renderDocView(root) {
  const rr = () => renderVerify(root);
  if (!S.ready) { root.replaceChildren(modeBar(root), h('div', { class: 'page' }, h('p', { class: 'muted', text: `Loading ${S.loading.done} of ${S.loading.total} files` }))); return; }
  const active = activeSamples();
  if (!active.length) {
    root.replaceChildren(modeBar(root), h('div', { class: 'page narrow' }, h('section', { class: 'card' }, h('h2', { text: 'No sample yet' }),
      h('p', { text: 'Draw a sample first. Choose "Whole documents" to verify every coded fragment in the documents you pick.' }),
      h('button', { type: 'button', class: 'btn primary', onclick: () => { V.sampleId = '__new'; V.draft = { mode: 'docs', seed: 1, fraction: 1, min: 2, result: null, reason: 'Verification by document', docs: null, frames: null }; rr(); } }, 'Draw a sample'))));
    return;
  }
  const { byDoc, docs } = buildTasks(active);
  const done = (t) => t.st.done;
  const docDone = (id) => byDoc.get(id).every(done);
  const shownDocs = docs.filter((id) => D.filter === 'all' || (D.filter === 'todo' ? !docDone(id) : docDone(id)));
  if (!D.doc || !byDoc.has(D.doc)) D.doc = (shownDocs[0] || docs[0]);
  const doc = S.docById.get(D.doc);
  const tasks = byDoc.get(D.doc);
  let cur = tasks.find((t) => t.key === D.task);
  if (!cur) { cur = tasks.find((t) => !done(t)) || tasks[0]; D.task = cur.key; D.fidx = 0; D.scroll = cur.unit; }
  const ti = tasks.indexOf(cur);
  loadPages(D.doc);
  const pages = D.pages.get(D.doc);
  if (!D.tab) D.tab = 'text';
  const tab = D.tab === 'text' && !S.store.has(`documents/${D.doc}.pages.json`) && hasPdf(doc) ? 'pdf' : D.tab;

  // every coded fragment in the document, so ones outside the sample still show (faintly) for context
  const units = unitList(D.doc).filter((u) => !u.excluded && active.some(({ frame }) => firstCodes(D.doc, u.id, frame.id)));
  const loc = pages ? locate(D.doc, pages, units) : null;

  const select = (t, scroll = true) => { D.task = t.key; D.fidx = 0; V.picker = null; if (scroll) D.scroll = t.unit; rr(); };
  const nextTodo = () => tasks.slice(ti + 1).find((t) => !done(t)) || tasks.find((t) => !done(t) && t !== cur) || null;
  const gotoDoc = (id) => { D.doc = id; D.task = null; D.tab = null; V.picker = null; rr(); };
  const nextDoc = () => docs.slice(docs.indexOf(D.doc) + 1).find((id) => !docDone(id)) || docs.find((id) => !docDone(id) && id !== D.doc) || null;

  // ----- documents list
  const totalT = docs.reduce((n, id) => n + byDoc.get(id).length, 0);
  const totalD = docs.reduce((n, id) => n + byDoc.get(id).filter(done).length, 0);
  const aside = h('aside', { class: 'vside' },
    h('section', { class: 'card' }, h('h2', { text: 'Documents' }),
      h('div', { class: 'big' }, h('b', { text: `${docs.filter(docDone).length} / ${docs.length}` }), h('span', { class: 'muted', text: ' documents finished' })),
      bar(docs.length ? docs.filter(docDone).length / docs.length : 0),
      h('div', { class: 'muted', text: `${totalD} of ${totalT} fragments verified by you (${pct(totalD, totalT)})` }),
      h('div', { class: 'pills' }, [['todo', 'To do'], ['done', 'Done'], ['all', 'All']].map(([k, l]) => h('button', { type: 'button', class: 'pill' + (D.filter === k ? ' on' : ''), onclick: () => { D.filter = k; rr(); } }, l))),
      h('div', { class: 'qlist dlist' }, (shownDocs.length ? shownDocs : []).map((id) => {
        const d = S.docById.get(id); const ts = byDoc.get(id); const n = ts.filter(done).length;
        return h('button', { type: 'button', class: 'qi' + (id === D.doc ? ' cur' : ''), onclick: () => gotoDoc(id) },
          h('span', { class: 'qs ' + (n === ts.length ? 'd' : n ? 'p' : '') }),
          h('span', { class: 'qt' }, h('b', { class: 'mono', text: id }), h('span', { text: ' ' + ((d && (d.short || d.title)) || '').slice(0, 48) }), h('span', { class: 'muted', text: ` · ${n}/${ts.length}` })));
      }), shownDocs.length ? null : h('p', { class: 'muted', text: D.filter === 'todo' ? 'Every document is finished.' : 'None.' }))),
    h('section', { class: 'card' }, h('h2', { text: 'Samples in use' }),
      h('p', { class: 'muted small', text: 'The same samples as the fragment view. Work done in either view counts.' }),
      active.map(({ frame, sample }) => { const ss = S.samples.filter((x) => x.frame === frame.id && x.layer === S.review.first_layer);
        return ss.length > 1 ? h('label', { class: 'sel' }, frame.name, h('select', { onchange: (e) => { V.pick[frame.id] = e.target.value; D.task = null; rr(); } }, ss.map((x) => h('option', { value: x.id, selected: x.id === sample.id, text: `${x.id} \u00b7 ${x.units.length} units${x.mode === 'documents' ? ' (whole documents)' : ''}` }))))
          : h('div', { class: 'muted small', text: `${frame.name}: ${sample.id} \u00b7 ${sample.units.length} units` }); }),
      h('button', { type: 'button', class: 'link', onclick: () => { V.sampleId = '__new'; V.draft = null; rr(); } }, 'Draw another sample')));

  // ----- full text
  const selUnit = cur.unit;
  let textBody;
  if (tab === 'pdf') {
    const tgt = hasPdf(doc) ? pdfTarget(doc, (findUnit(cur.doc, cur.unit) || {}).page || (loc && loc.found.get(cur.unit)?.pages.size ? pages[[...loc.found.get(cur.unit).pages][0]].label : null)) : null;
    const url = tgt ? pdfUrl(tgt.file) : null;
    textBody = !tgt ? h('p', { class: 'muted', text: 'The PDF is not in the data repo yet.' }) : !url ? h('p', { class: 'muted', text: 'Loading the PDF' })
      : h('iframe', { class: 'pdfv', src: url + (tgt.local ? `#page=${tgt.local}` : ''), title: 'Full text' });
  } else if (!S.store.has(`documents/${D.doc}.pages.json`)) {
    textBody = h('p', { class: 'muted', text: 'No text version of this document yet. Use the PDF tab.' });
  } else if (!pages) {
    textBody = h('p', { class: 'muted', text: D.failed.has(D.doc) ? 'Could not load the text.' : 'Loading the text' });
  } else {
    const unitTask = new Map(); for (const t of tasks) if (!unitTask.has(t.unit)) unitTask.set(t.unit, t);
    const labelOf = (id) => { const u = findUnit(D.doc, id); return (u && (u.label || u.id)) || id; };
    textBody = pages.map((p, i) => {
      const sp = loc.spans.get(i) || [];
      const ci = [...(loc.cites.get(i) || [])].filter((id) => unitTask.has(id));
      const segs = segments(p.text.length, sp);
      const hot = ci.includes(selUnit) || sp.some((s) => s.key === selUnit);
      return h('section', { class: 'pg' + (hot ? ' hot' : ''), 'data-pg': i },
        h('div', { class: 'pgh' }, h('span', { class: 'mono', text: `p. ${p.label}` }),
          ci.length ? h('span', { class: 'cites' }, h('span', { class: 'muted', text: 'cited by ' }), ci.map((id) => h('button', { type: 'button', class: 'cite' + (id === selUnit ? ' on' : ''), style: { '--c': colourFor(labelOf(id)) }, onclick: () => { const t = unitTask.get(id); if (t) select(t, false); } }, labelOf(id)))) : null),
        h('div', { class: 'pgt' }, segs.map((g) => {
          const txt = p.text.slice(g.start, g.end);
          if (!g.keys.length) return txt;
          const live = g.keys.filter((k) => unitTask.has(k));
          if (!live.length) return h('mark', { class: 'frag ghost', title: 'Coded, not in this sample: ' + g.keys.map(labelOf).join(', ') }, txt);
          const on = live.includes(selUnit);
          return h('mark', { class: 'frag' + (on ? ' on' : ''), 'data-u': live.join(' '), title: live.map(labelOf).join(', '), style: { '--c': colourFor(labelOf(live[0])) }, onclick: () => { const t = unitTask.get(on ? selUnit : live[0]); if (t) select(t, false); } }, txt);
        })));
    });
  }
  const textCard = h('section', { class: 'card dtext' },
    h('div', { class: 'dth' }, h('div', null, h('div', { class: 'mono muted', text: `${D.doc}${doc && doc.year ? ' · ' + doc.year : ''}` }), h('div', { class: 'dt', text: doc ? doc.title : D.doc })),
      h('div', { class: 'seg' }, [['text', 'Text'], ['pdf', 'PDF']].map(([k, l]) => h('button', { type: 'button', class: tab === k ? 'on' : '', disabled: k === 'pdf' && !hasPdf(doc), onclick: () => { D.tab = k; D.scroll = cur.unit; rr(); } }, l)))),
    h('div', { class: 'dtb' + (tab === 'pdf' ? ' pdf' : '') }, textBody));

  // ----- fragments
  const events = docEvents(D.doc);
  const taskCard = (t, i) => {
    const u = findUnit(t.doc, t.unit);
    const isCur = t === cur;
    const f = loc && loc.found.get(t.unit);
    const where = !pages ? '' : f && f.marks ? `${f.marks} highlight${f.marks > 1 ? 's' : ''} in the text` : f && f.pages.size ? `cited on p. ${[...f.pages].map((k) => pages[k].label).join(', ')}` : 'not located in the text';
    const nf = Object.keys(t.st.fields).length;
    const head = h('button', { type: 'button', class: 'th', onclick: () => select(t) },
      h('span', { class: 'qs ' + (t.st.done ? 'd' : nf ? 'p' : '') }),
      h('span', { class: 'tl' }, h('b', { text: (u && u.label) || t.unit }), active.length > 1 && t.frame.name !== (u && u.label) ? h('span', { class: 'muted', text: ` · ${t.frame.name}` }) : null,
        h('span', { class: 'muted small', text: `  ${t.unit}${u && u.page ? ' · p. ' + u.page : ''}${where ? ' · ' + where : ''}` })),
      !isCur && u ? h('span', { class: 'tx', text: (u.text || '').slice(0, 140) }) : null);
    if (!isCur) return h('div', { class: 'task' + (t.st.done ? ' done' : '') }, head);

    const codes = firstCodes(t.doc, t.unit, t.frame.id) || {};
    const st = t.st;
    const act = (fd, action, value) => addEvent(t.doc, 'verify', { sample: t.sample.id, unit: t.unit, frame: t.frame.id, field: fd.id, action, value: value ?? null });
    const open = unresolved(t.frame, codes, st);
    const agreeRest = () => { for (const fd of open) if (!badParent(t.frame, fd, codes, st)) act(fd, 'agree'); };
    const finish = () => { const n = tasks.slice(i + 1).find((x) => !done(x) && x !== t) || tasks.find((x) => !done(x) && x !== t); if (n) { D.task = n.key; D.fidx = 0; D.scroll = n.unit; } V.picker = null; addEvent(t.doc, 'done', { sample: t.sample.id, unit: t.unit, frame: t.frame.id }); };
    const extras = firstExtras(t.doc, t.unit);
    const claudeWhy = (() => { const raw = extras.raw && extras.raw[t.frame.id]; if (!raw) return []; return Object.entries(raw).filter(([, v]) => v && typeof v === 'object' && (v.why || v.conf != null)).map(([k, v]) => ({ k, why: v.why, conf: v.conf })); })();
    const myMemo = memoFor(events, { coder: S.handle, unit: t.unit, frame: t.frame.id });
    const comments = commentsFor(events, t.unit);
    D.keyCtx = { t, codes, st, act, open, agreeRest, finish };
    return h('div', { class: 'task cur' + (st.done ? ' done' : '') }, head,
      h('div', { class: 'passage small' }, u ? (u.text || u.label) : '(unit not found)'),
      h('div', { class: 'frows' }, fieldRows(t.frame, codes, st, { act, sel: D.fidx, setSel: (k) => { D.fidx = k; }, pk: t.key + '|', rerender: rr, root })),
      h('div', { class: 'notes' },
        h('div', null, h('b', { text: "First coder's notes" }), !st.done ? h('div', { class: 'muted', text: 'Hidden until you finish this fragment.' }) :
          h('div', null, extras.note ? h('p', { text: extras.note }) : h('p', { class: 'muted', text: 'No notes.' }), claudeWhy.map((c) => h('p', { class: 'muted', text: `${c.k}: ${c.conf != null ? 'confidence ' + c.conf + '. ' : ''}${c.why || ''}` })))),
        h('label', null, h('b', { text: 'Your memo' }), h('textarea', { rows: 2, placeholder: 'Anything a second reader should know', value: myMemo, onblur: (ev) => { if (ev.target.value !== myMemo) addEvent(t.doc, 'memo', { unit: t.unit, frame: t.frame.id, text: ev.target.value }); } }, myMemo))),
      h('div', { class: 'comments' }, h('b', { text: `Discussion (${comments.length})` }),
        comments.map((c) => h('div', { class: 'cm' }, h('span', { class: 'cmw', text: c.coder }), h('span', { class: 'muted', text: ' ' + c.t.slice(0, 16).replace('T', ' ') }), h('div', { text: c.text }))),
        h('div', { class: 'row' }, h('textarea', { rows: 1, placeholder: 'Comment for the whole team', id: 'newcomment' }), h('button', { type: 'button', class: 'btn', onclick: () => { const x = document.getElementById('newcomment'); if (x.value.trim()) addEvent(t.doc, 'comment', { unit: t.unit, text: x.value.trim() }); } }, 'Post'))),
      h('div', { class: 'foot' }, st.done
        ? h('div', { class: 'row' }, h('span', { class: 'ok', text: 'Done' }), h('button', { type: 'button', class: 'btn', onclick: () => addEvent(t.doc, 'reopen', { sample: t.sample.id, unit: t.unit, frame: t.frame.id }) }, 'Reopen'))
        : h('div', { class: 'row' }, open.length > 1 ? h('button', { type: 'button', class: 'btn', title: 'Agree with every unchecked field (Shift+A)', onclick: agreeRest }, 'Agree with all remaining') : null,
          h('button', { type: 'button', class: 'btn primary', disabled: open.length > 0, onclick: finish }, 'Done, next fragment'),
          open.length ? h('span', { class: 'muted', text: `${open.length} left: ${open.map((x) => x.label).join(', ')}` }) : null)));
  };
  const tdone = tasks.filter(done).length;
  const nd = docDone(D.doc) ? nextDoc() : null;
  const taskPanel = h('section', { class: 'card dtasks' },
    h('div', { class: 'dth' }, h('h2', { text: `Fragments ${tdone} / ${tasks.length}` }), h('span', { class: 'muted small', text: 'J K move · A D O U act · Enter done' })),
    bar(tasks.length ? tdone / tasks.length : 0),
    docDone(D.doc) ? h('div', { class: 'okline' }, h('span', { text: 'This document is finished.' }), nd ? h('button', { type: 'button', class: 'btn primary', onclick: () => gotoDoc(nd) }, `Next document: ${nd}`) : h('span', { class: 'muted', text: ' Every document in the sample is finished.' })) : null,
    h('div', { class: 'tlist' }, tasks.map(taskCard)));

  // keep scroll positions across re-renders
  const prevText = root.querySelector('.dtb'); const prevList = root.querySelector('.tlist');
  const keep = { text: prevText ? prevText.scrollTop : 0, list: prevList ? prevList.scrollTop : 0, doc: D.keep && D.keep.doc };
  root.replaceChildren(modeBar(root), h('div', { class: 'dwrap' }, aside, textCard, taskPanel));
  const tb = root.querySelector('.dtb'); const tl = root.querySelector('.tlist');
  if (keep.doc === D.doc) { if (tb) tb.scrollTop = keep.text; if (tl) tl.scrollTop = keep.list; }
  D.keep = { doc: D.doc };
  if (D.scroll && tab === 'text' && pages && tb) {
    const id = D.scroll;
    const m = [...tb.querySelectorAll('mark.frag[data-u]')].find((x) => x.dataset.u.split(' ').includes(id));
    const f = loc.found.get(id);
    const target = m || (f && f.pages.size ? tb.querySelector(`.pg[data-pg="${[...f.pages][0]}"]`) : null);
    if (target) tb.scrollTop = Math.max(0, target.offsetTop - tb.offsetTop - 80);
    D.scroll = null;
  } else if (D.scroll && tab !== 'text') D.scroll = null;
  const c = tl && tl.querySelector('.task.cur');
  if (c && (c.offsetTop < tl.scrollTop || c.offsetTop > tl.scrollTop + tl.clientHeight - 60)) tl.scrollTop = Math.max(0, c.offsetTop - tl.offsetTop - 8);

  // keyboard
  V.keys = (ev) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) || ev.metaKey || ev.ctrlKey || ev.altKey) return false;
    const k = ev.key.toLowerCase();
    const x = D.keyCtx; if (!x) return false;
    const fd = x.t.frame.fields[D.fidx];
    if (k === 'arrowdown') { D.fidx = Math.min(x.t.frame.fields.length - 1, D.fidx + 1); V.picker = null; rr(); }
    else if (k === 'arrowup') { D.fidx = Math.max(0, D.fidx - 1); V.picker = null; rr(); }
    else if (k === 'j') { const n = tasks[ti + 1]; if (n) select(n); }
    else if (k === 'k') { const n = tasks[ti - 1]; if (n) select(n); }
    else if (k === 'a' && ev.shiftKey) x.agreeRest();
    else if (k === 'a') { if (fd && !badParent(x.t.frame, fd, x.codes, x.st)) x.act(fd, 'agree'); }
    else if (k === 'd') { if (fd && (x.codes[fd.id] ?? null) != null) x.act(fd, 'disagree'); }
    else if (k === 'u') { if (fd) x.act(fd, 'unsure'); }
    else if (k === 'o') { if (fd) { const key = x.t.key + '|' + fd.id; V.picker = V.picker === key ? null : key; V.pickQ = ''; rr(); } }
    else if (k === 'enter' && !x.st.done && x.open.length === 0) x.finish();
    else if (k === 'escape') { if (V.picker) { V.picker = null; rr(); } else return false; }
    else return false;
    ev.preventDefault();
    return true;
  };
}

