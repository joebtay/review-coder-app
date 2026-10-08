// Open queries for the PI: decisions about documents (for example, whether instruments belong in the publication-level review).
// A decision is an append-only event on the pseudo-document "_queries", so it syncs like any other work and nothing is overwritten.
import { S, addEvent, decisionsFor, latestDecision } from './data.js';
import { h } from './ui.js';

const draft = new Map(); // qid -> { choice, text }, kept across re-renders

const when = (t) => (t || '').slice(0, 10);
const who = (e) => (S.review.team || []).find((m) => m.handle === e.coder)?.name || e.coder;
const optLabel = (q, id) => (q.options || []).find((o) => o.id === id)?.label || id;

function decisionLine(q, e) {
  return h('div', { class: 'qdec' }, h('b', { text: optLabel(q, e.choice) }), e.text ? h('span', { text: ': ' + e.text }) : null,
    h('span', { class: 'muted', text: `  ${who(e)}, ${when(e.t)}` }));
}

export function queryCard(q) {
  const last = latestDecision(q.id);
  const dr = draft.get(q.id) || { choice: last ? last.choice : null, text: '' };
  const hist = decisionsFor(q.id);
  const docs = (q.docs || []).concat(q.related_docs || []);
  return h('div', { class: 'query' + (last ? ' decided' : ''), 'data-query': q.id },
    h('div', { class: 'qh' }, h('b', { text: `${q.id}  ${q.title}` }), h('span', { class: 'pill ' + (last ? 'on' : 'warn'), text: last ? 'decided' : q.priority ? `open · ${q.priority}` : 'open' })),
    h('p', { text: q.question }),
    q.context ? h('p', { class: 'muted', text: q.context }) : null,
    h('div', { class: 'qdocs' }, h('span', { class: 'muted', text: 'Documents: ' }),
      docs.map((id) => S.docById.has(id) ? h('a', { class: 'pill' + ((q.docs || []).includes(id) ? '' : ' faint'), href: `#/doc/${id}`, text: id }) : null)),
    h('div', { class: 'qopts' }, (q.options || []).map((o) => h('label', { class: 'qopt' },
      h('input', { type: 'radio', name: 'q-' + q.id, value: o.id, checked: dr.choice === o.id, onchange: () => { draft.set(q.id, { ...(draft.get(q.id) || { text: '' }), choice: o.id }); } }), ' ', o.label))),
    h('textarea', { class: 'qnote', rows: 2, placeholder: 'Reason or condition (optional)', 'aria-label': 'Note for ' + q.id, oninput: (e) => draft.set(q.id, { ...(draft.get(q.id) || { choice: dr.choice }), text: e.target.value }) }, dr.text),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary small', onclick: (ev) => {
      const d = draft.get(q.id) || {};
      const choice = d.choice || (last && last.choice);
      if (!choice) { ev.target.textContent = 'Pick an option first'; return; }
      addEvent('_queries', 'decision', { query: q.id, choice, text: (d.text || '').trim() });
      draft.delete(q.id);
    }, text: 'Record decision' })),
    hist.length ? h('div', { class: 'qhist' }, hist.slice().reverse().map((e) => decisionLine(q, e))) : null);
}

export function queriesSection() {
  const qs = S.queries || [];
  if (!qs.length) return null;
  const open = qs.filter((q) => !latestDecision(q.id)).length;
  return h('section', { class: 'card wide', id: 'queries' }, h('h2', { text: `Queries for the PI (${open} open of ${qs.length})` }),
    h('p', { class: 'muted', text: 'Decisions about which documents belong in the publication-level review. Every decision is saved with who made it and when, and can be revised.' }),
    qs.map(queryCard));
}

/** Short notices for a document profile. */
export function docQueryNotes(docId) {
  const qs = (S.queries || []).filter((q) => (q.docs || []).includes(docId));
  if (!qs.length) return null;
  return h('section', { class: 'card wide' }, h('h2', { text: 'Open queries about this document' }),
    qs.map((q) => { const l = latestDecision(q.id); return h('div', { class: 'qnote-doc' }, h('b', { text: `${q.id}  ${q.title}` }), l ? [' ', decisionLine(q, l)] : h('span', { class: 'muted', text: '  open' }), ' ', h('a', { href: '#/project', text: 'Go to query' })); }));
}
