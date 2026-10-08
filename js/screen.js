// Screen: full-text screening. The screener reads the full text beside the first screener's call on each
// criterion, agrees or disagrees with each point, then records include, exclude (with a reason) or discuss.
// Switched on per review in review.json "screening". Open (not blinded) when screening.blind is false.

import { S, docEvents, addEvent } from './data.js';
import { commentsFor } from './events.js';
import { h, bar } from './ui.js';
import { textPane, whereText, saveScroll, restoreScroll } from './fulltext.js';

export const SC = { rec: null, crit: 0, tab: null, filter: 'todo', scroll: null, keep: null, pick: null, draft: null, keys: null };

const JCOL = { Met: '#0b7a53', 'Not met': '#b3261e', Unclear: '#b7791f' };
const CCOL = ['#1c5cab', '#7b3fa0', '#0f7c8c', '#a3541b', '#4f6b1a', '#9b2c5a'];
const DEC = { include: 'Include', exclude: 'Exclude', discuss: 'Discuss' };

const cmpT = (a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.id < b.id ? -1 : 1);

/** One coder's screening state for a record: per-criterion latest action and the latest decision. */
export function screenState(rec, coder) {
  const st = { crit: {}, decision: null };
  for (const e of docEvents(rec).filter((x) => x.coder === coder && x.record === rec).sort(cmpT)) {
    if (e.type === 'screen') { if (e.action === 'clear') delete st.crit[e.criterion]; else st.crit[e.criterion] = e; }
    else if (e.type === 'screen-decision') st.decision = e;
  }
  return st;
}

/** Every screener's decision on each record, beside the first screen's. For the Agreement tab. */
export function screenPairs() {
  const cfg = S.review.screening; const first = S.firstScreen?.records || {};
  const coders = new Set();
  for (const r of S.records || []) for (const e of docEvents(r.id)) if (e.type === 'screen-decision' || e.type === 'screen') coders.add(e.coder);
  const out = [];
  for (const c of coders) for (const r of S.records || []) {
    const st = screenState(r.id, c); const f = first[r.id];
    if (!f) continue;
    out.push({ coder: c, rec: r.id, first: f.decision, firstReason: f.reason, decision: st.decision ? st.decision.decision : null, reason: st.decision ? st.decision.reason : null,
      crit: (cfg.criteria || []).map((k) => ({ id: k.id, first: f.criteria[k.id]?.judgement, action: st.crit[k.id]?.action || null, value: st.crit[k.id]?.action === 'agree' ? f.criteria[k.id]?.judgement : st.crit[k.id]?.value || null })) });
  }
  return out;
}

export function renderScreen(root) {
  const cfg = S.review.screening;
  const rr = () => renderScreen(root);
  if (!cfg || !cfg.enabled) {
    root.replaceChildren(h('div', { class: 'page narrow' }, h('h1', { text: 'Screen' }), h('section', { class: 'card' },
      h('p', { text: 'Full-text screening is switched off for this review.' }), cfg && cfg.note ? h('p', { class: 'muted', text: cfg.note }) : null)));
    return;
  }
  if (!S.records || !S.firstScreen) { root.replaceChildren(h('div', { class: 'page' }, h('p', { class: 'muted', text: 'Loading the screening records' }))); return; }
  const first = S.firstScreen.records || {};
  const crits = cfg.criteria || [];
  const recs = S.records;
  const me = S.handle;
  const stOf = (id) => screenState(id, me);
  const isDone = (id) => !!stOf(id).decision;
  const differs = (id) => { const d = stOf(id).decision; return d && (d.decision !== first[id]?.decision || (d.decision === 'exclude' && d.reason !== first[id]?.reason)); };
  const shown = recs.filter((r) => SC.filter === 'all' || (SC.filter === 'todo' ? !isDone(r.id) : SC.filter === 'done' ? isDone(r.id) : differs(r.id)));
  if (!SC.rec || !recs.find((r) => r.id === SC.rec)) { SC.rec = (shown[0] || recs[0]).id; SC.crit = 0; SC.scroll = crits[0]?.id; }
  const rec = recs.find((r) => r.id === SC.rec);
  const f = first[rec.id] || { criteria: {}, rulings: [] };
  const st = stOf(rec.id);
  const ri = recs.indexOf(rec);
  const goto = (r) => { if (r) { SC.rec = r.id; SC.crit = 0; SC.tab = null; SC.draft = null; SC.pick = null; SC.scroll = crits[0]?.id; rr(); } };
  const act = (c, action, value) => addEvent(rec.id, 'screen', { record: rec.id, criterion: c.id, action, value: value ?? null });
  const colour = (k) => CCOL[Math.max(0, crits.findIndex((c) => c.id === k)) % CCOL.length];

  // ----- records list
  const doneN = recs.filter((r) => isDone(r.id)).length;
  const diffN = recs.filter((r) => differs(r.id)).length;
  const aside = h('aside', { class: 'vside' },
    h('section', { class: 'card' }, h('h2', { text: 'Full-text records' }),
      h('div', { class: 'big' }, h('b', { text: `${doneN} / ${recs.length}` }), h('span', { class: 'muted', text: ' decided by you' })), bar(recs.length ? doneN / recs.length : 0),
      diffN ? h('div', { class: 'muted', text: `${diffN} differ from the first screen` }) : null,
      h('div', { class: 'pills' }, [['todo', 'To do'], ['done', 'Done'], ['differ', 'Differ'], ['all', 'All']].map(([k, l]) => h('button', { type: 'button', class: 'pill' + (SC.filter === k ? ' on' : ''), onclick: () => { SC.filter = k; rr(); } }, l))),
      h('div', { class: 'qlist dlist' }, shown.map((r) => {
        const s = stOf(r.id); const fd = first[r.id]?.decision;
        return h('button', { type: 'button', class: 'qi' + (r.id === rec.id ? ' cur' : ''), onclick: () => goto(r) },
          h('span', { class: 'qs ' + (s.decision ? 'd' : Object.keys(s.crit).length ? 'p' : '') }),
          h('span', { class: 'qt' }, h('b', { class: 'mono', text: r.id }), h('span', { text: ' ' + (r.short || r.title || '').slice(0, 40) }),
            h('span', { class: 'dk ' + (fd || ''), text: fd === 'include' ? 'I' : fd === 'exclude' ? 'E' : '' }), differs(r.id) ? h('span', { class: 'dk diff', text: '≠' }) : null));
      }), shown.length ? null : h('p', { class: 'muted', text: 'None.' }))),
    h('section', { class: 'card' }, h('h2', { text: 'How this screen works' }),
      h('p', { class: 'muted small', text: cfg.note || '' }),
      h('p', { class: 'muted small', text: `Criteria: ${cfg.source || 'the protocol'}. First screen: ${S.firstScreen.name || S.firstScreen.screener}, ${S.firstScreen.date}.` })));

  // ----- full text with the first screener's notes marked
  const evText = (c) => ((f.criteria[c.id] || {}).evidence || []).map((x) => x.text).join(' ');
  const items = crits.map((c) => ({ key: c.id, label: c.label, text: `${f.criteria[c.id]?.note || ''} ${evText(c)}`, kind: 'note' }));
  const pane = textPane({ doc: rec, id: rec.id, title: rec.title, sub: `${rec.id} · ${rec.short || ''}${rec.type ? ' · ' + rec.type : ''}`,
    items, sel: crits[SC.crit]?.id, onSelect: (k) => { SC.crit = Math.max(0, crits.findIndex((c) => c.id === k)); rr(); },
    tab: SC.tab, setTab: (k) => { SC.tab = k; SC.scroll = crits[SC.crit]?.id; rr(); }, scrollTo: SC.scroll, colour });

  // ----- the call, point by point
  const allActed = crits.every((c) => st.crit[c.id]);
  const critCard = (c, i) => {
    const fc = f.criteria[c.id] || { judgement: 'Unclear', note: '' };
    const e = st.crit[c.id];
    const sel = i === SC.crit;
    const others = (cfg.judgements || ['Met', 'Not met', 'Unclear']).filter((j) => j !== fc.judgement);
    const pk = rec.id + '|' + c.id;
    const status = !e ? 'Not checked' : e.action === 'agree' ? 'Agreed' : e.action === 'disagree' ? `Disagreed: ${e.value}` : 'Marked unsure';
    return h('div', { class: 'task crit' + (sel ? ' cur' : '') + (e ? ' ' + e.action : ''), style: { '--c': colour(c.id) }, onclick: () => { if (!sel) { SC.crit = i; SC.scroll = c.id; rr(); } } },
      h('div', { class: 'th' }, h('span', { class: 'cbar' }), h('span', { class: 'tl' }, h('b', { text: c.label }), ' ', h('span', { class: 'jchip', style: { '--j': JCOL[fc.judgement] || '#5d6675' }, text: fc.judgement }),
        h('span', { class: 'muted small', text: '  ' + whereText(pane.pages, pane.loc, c.id) }))),
      h('div', { class: 'passage small', text: fc.note || '(no note)' }),
      (fc.evidence || []).length ? h('details', { class: 'pdef', open: sel }, h('summary', { text: `Extraction notes (${fc.evidence.map((x) => x.field.toLowerCase()).join(', ')})` }),
        fc.evidence.map((x) => h('p', { class: 'small' }, h('b', { text: x.field + '. ' }), x.text))) : null,
      h('details', { class: 'pdef' }, h('summary', { text: 'Protocol definition' }), h('p', { class: 'small', text: c.definition || '' })),
      h('div', { class: 'acts' },
        h('button', { type: 'button', class: 'act agree' + (e && e.action === 'agree' ? ' on' : ''), title: 'Agree (A)', onclick: (ev) => { ev.stopPropagation(); SC.crit = i; SC.pick = null; act(c, 'agree'); } }, 'Agree', h('kbd', { text: 'A' })),
        h('button', { type: 'button', class: 'act disagree' + (e && e.action === 'disagree' ? ' on' : ''), title: 'Disagree (D)', onclick: (ev) => { ev.stopPropagation(); SC.crit = i; SC.pick = SC.pick === pk ? null : pk; rr(); } }, 'Disagree', h('kbd', { text: 'D' })),
        h('button', { type: 'button', class: 'act unsure' + (e && e.action === 'unsure' ? ' on' : ''), title: 'Unsure (U)', onclick: (ev) => { ev.stopPropagation(); SC.crit = i; SC.pick = null; act(c, 'unsure'); } }, 'Unsure', h('kbd', { text: 'U' })),
        h('span', { class: 'fs muted', text: status })),
      SC.pick === pk ? h('div', { class: 'picker' }, h('div', { class: 'muted small', text: `${f.criteria[c.id] ? 'The first screen says ' + fc.judgement + '.' : ''} Your judgement:` }),
        others.map((j) => h('button', { type: 'button', class: 'po', onclick: (ev) => { ev.stopPropagation(); SC.pick = null; act(c, 'disagree', j); } }, h('span', { class: 'dot', style: { background: JCOL[j] } }), h('b', { text: j }), h('span', { class: 'pd', text: '' })))) : null);
  };
  const rulings = (cfg.rulings || []).filter((r) => (f.rulings || []).includes(r.id));
  const cur = st.decision;
  if (!SC.draft || SC.draft.rec !== rec.id) SC.draft = { rec: rec.id, decision: cur ? cur.decision : null, reason: cur ? cur.reason : null, note: cur ? cur.note || '' : '' };
  const dr = SC.draft;
  const saveDecision = () => {
    if (!dr.decision || (dr.decision === 'exclude' && !dr.reason)) return;
    const n = !cur && (recs.slice(ri + 1).find((r) => !isDone(r.id)) || recs.find((r) => !isDone(r.id) && r.id !== rec.id));
    const ev = { record: rec.id, decision: dr.decision, reason: dr.decision === 'exclude' ? dr.reason : null, note: dr.note || '' };
    if (n) { SC.rec = n.id; SC.crit = 0; SC.tab = null; SC.draft = null; SC.scroll = crits[0]?.id; }
    addEvent(rec.id, 'screen-decision', ev);
  };
  const comments = commentsFor(docEvents(rec.id), '_screen');
  const fd = f.decision;
  const panel = h('section', { class: 'card dtasks' },
    h('div', { class: 'dth' }, h('h2', { text: `${rec.id} · ${rec.short || ''}` }), h('span', { class: 'muted small', text: 'J K record · ↑↓ criterion · A D U' })),
    h('div', { class: 'tlist' },
      rec.note ? h('div', { class: 'warnline', text: rec.note }) : null,
      h('div', { class: 'muted small rmeta' }, rec.citation ? h('div', { text: rec.citation }) : null, rec.fulltext_source ? h('div', { text: 'Full text: ' + rec.fulltext_source }) : null,
        rec.url ? h('a', { href: rec.url, target: '_blank', rel: 'noopener', text: rec.url }) : null),
      h('h3', { text: `First screen, criterion by criterion` }),
      crits.map(critCard),
      rulings.length ? h('div', { class: 'rulings' }, h('h3', { text: 'Rulings that apply' }), rulings.map((r) => h('div', { class: 'ruling' }, h('b', { class: 'mono', text: r.id }), h('span', { text: ` ${r.question} ` }), h('span', { class: 'muted', text: r.ruling })))) : null,
      h('div', { class: 'firstdec' }, h('span', { class: 'muted', text: 'First screen decision: ' }), h('b', { class: 'dec ' + fd, text: DEC[fd] || '?' }), fd === 'exclude' && f.reason ? h('span', { text: ` (${f.reason})` }) : null,
        f.call ? h('div', { class: 'muted small', text: 'Call: ' + f.call }) : null),
      h('div', { class: 'mydec' }, h('h3', { text: 'Your decision' }),
        !allActed ? h('div', { class: 'muted small', text: 'Check every criterion first.' }) : null,
        h('div', { class: 'seg' }, ['include', 'exclude', 'discuss'].map((k) => h('button', { type: 'button', class: dr.decision === k ? 'on' : '', disabled: !allActed, onclick: () => { dr.decision = k; if (k === 'exclude' && !dr.reason) dr.reason = fd === 'exclude' ? f.reason : null; rr(); } }, DEC[k]))),
        dr.decision === 'exclude' ? h('label', { class: 'sel' }, 'Reason', h('select', { onchange: (e) => { dr.reason = e.target.value || null; rr(); } }, h('option', { value: '', text: 'Choose a reason' }), (cfg.reasons || []).map((x) => h('option', { value: x, selected: dr.reason === x, text: x })))) : null,
        h('label', { class: 'sel' }, 'Note', h('textarea', { rows: 2, placeholder: 'Why, especially if you differ from the first screen', value: dr.note, oninput: (e) => { dr.note = e.target.value; } }, dr.note)),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', disabled: !allActed || !dr.decision || (dr.decision === 'exclude' && !dr.reason), onclick: saveDecision }, cur ? 'Update decision' : 'Save decision, next record'),
          cur ? h('span', { class: 'ok', text: `Saved: ${DEC[cur.decision]}${cur.reason ? ' (' + cur.reason + ')' : ''}` }) : null)),
      h('div', { class: 'comments' }, h('b', { text: `Discussion (${comments.length})` }),
        comments.map((c) => h('div', { class: 'cm' }, h('span', { class: 'cmw', text: c.coder }), h('span', { class: 'muted', text: ' ' + c.t.slice(0, 16).replace('T', ' ') }), h('div', { text: c.text }))),
        h('div', { class: 'row' }, h('textarea', { rows: 1, placeholder: 'Comment for the whole team', id: 'newcomment' }), h('button', { type: 'button', class: 'btn', onclick: () => { const x = document.getElementById('newcomment'); if (x.value.trim()) addEvent(rec.id, 'comment', { unit: '_screen', text: x.value.trim() }); } }, 'Post')))));

  const saved = saveScroll(root, ['.dtb', '.tlist']);
  root.replaceChildren(h('div', { class: 'dwrap' }, aside, pane.el, panel));
  if (SC.keep === rec.id) restoreScroll(root, saved);
  SC.keep = rec.id;
  if (SC.scroll) { pane.after(root); SC.scroll = null; }

  SC.keys = (ev) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) || ev.metaKey || ev.ctrlKey || ev.altKey) return false;
    const k = ev.key.toLowerCase(); const c = crits[SC.crit];
    if (k === 'arrowdown') { SC.crit = Math.min(crits.length - 1, SC.crit + 1); SC.scroll = crits[SC.crit].id; SC.pick = null; rr(); }
    else if (k === 'arrowup') { SC.crit = Math.max(0, SC.crit - 1); SC.scroll = crits[SC.crit].id; SC.pick = null; rr(); }
    else if (k === 'j') goto(recs[ri + 1]);
    else if (k === 'k') goto(recs[ri - 1]);
    else if (k === 'a' && c) { SC.pick = null; if (SC.crit < crits.length - 1) { SC.crit++; SC.scroll = crits[SC.crit].id; } act(c, 'agree'); }
    else if (k === 'd' && c) { const pk = rec.id + '|' + c.id; SC.pick = SC.pick === pk ? null : pk; rr(); }
    else if (k === 'u' && c) { SC.pick = null; act(c, 'unsure'); }
    else if (k === 'escape' && SC.pick) { SC.pick = null; rr(); }
    else return false;
    ev.preventDefault();
    return true;
  };
}
