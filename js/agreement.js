import { S, allEvents, firstCodes, findUnit } from './data.js';
import { alphaNominal } from './stats.js';
import { h, chip, pct } from './ui.js';
import { openCodebook } from './codebook.js';
import { V } from './verify.js';

const FLOOR = 0.67;

/** One pair per verifier, unit and field: [first coder's value, verifier's final value]. Unsure is excluded. */
export function collectPairs(frame) {
  const sorted = allEvents().sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.id < b.id ? -1 : 1));
  const done = new Set(), last = new Map();
  for (const e of sorted) {
    if (e.frame !== frame.id) continue;
    const k = `${e.coder}|${e.sample}|${e.unit}`;
    if (e.type === 'done') done.add(k); else if (e.type === 'reopen') done.delete(k);
    else if (e.type === 'verify') { if (e.action === 'clear') last.delete(k + '|' + e.field); else last.set(k + '|' + e.field, e); }
  }
  const pairs = [];
  for (const [k, e] of last) {
    if (!done.has(k.split('|').slice(0, 3).join('|'))) continue;
    if (e.action === 'unsure') continue;
    const orig = (firstCodes(e.doc, e.unit, frame.id) || {})[e.field] ?? null;
    const fin = e.action === 'agree' ? orig : e.action === 'disagree' ? null : e.value ?? null;
    pairs.push({ field: e.field, doc: e.doc, unit: e.unit, coder: e.coder, a: orig, b: fin, action: e.action });
  }
  return pairs;
}

export function renderAgreement(root) {
  const frames = Object.values(S.frames).filter((f) => S.samples.some((s) => s.frame === f.id));
  const body = [];
  if (!S.ready) body.push(h('p', { class: 'muted', text: `Loading ${S.loading.done} of ${S.loading.total} files` }));
  else if (!frames.length) body.push(h('p', { class: 'muted', text: 'No sample has been drawn yet. Draw one on the Verify screen.' }));
  for (const fr of S.ready ? frames : []) {
    const pairs = collectPairs(fr);
    const all = alphaNominal(pairs.map((p) => [p.a, p.b]));
    const dis = pairs.filter((p) => p.action !== 'agree');
    body.push(h('section', { class: 'card wide' }, h('h2', { text: fr.name }),
      !pairs.length ? h('p', { class: 'muted', text: 'No finished units yet.' }) : h('div', null,
        h('p', null, 'Pooled over all fields: ', h('b', { text: all.alpha == null ? 'alpha not defined' : `alpha ${all.alpha.toFixed(2)}` }), `, ${pct(Math.round(all.agreement * all.n), all.n)} agreement over ${all.n} checks.`),
        h('table', { class: 't' }, h('thead', null, h('tr', null, ['Field', 'Checks', 'Agreement', "Krippendorff's alpha", ''].map((x) => h('th', { text: x })))),
          h('tbody', null, fr.fields.map((f) => {
            const r = alphaNominal(pairs.filter((p) => p.field === f.id).map((p) => [p.a, p.b]));
            if (!r.n) return h('tr', null, h('td', { text: f.label }), h('td', { class: 'mono', text: 0 }), h('td', { text: '-' }), h('td', { text: '-' }), h('td'));
            const low = r.alpha != null && r.alpha < FLOOR;
            return h('tr', null, h('td', { text: f.label }), h('td', { class: 'mono', text: r.n }), h('td', { class: 'mono', text: pct(Math.round(r.agreement * r.n), r.n) }),
              h('td', { class: 'mono' + (low ? ' bad' : '') }, r.alpha == null ? 'n/a' : r.alpha.toFixed(2)), h('td', null, low ? h('span', { class: 'pill warn', text: `below ${FLOOR}` }) : null));
          }))),
        h('p', { class: 'muted', text: `Alpha of ${FLOOR} is the usual floor for tentative conclusions. Alpha is undefined where a field has no variation.` }),
        h('h3', { text: `Disagreements (${dis.length})` }),
        dis.length ? h('table', { class: 't' }, h('thead', null, h('tr', null, ['Unit', 'Field', 'First coder', 'Verifier', 'By', ''].map((x) => h('th', { text: x })))),
          h('tbody', null, dis.slice(0, 200).map((p) => h('tr', null, h('td', { class: 'mono', text: p.unit }), h('td', { text: (fr.fields.find((f) => f.id === p.field) || {}).label }),
            h('td', { text: p.a ?? '(blank)' }), h('td', { text: p.b ?? '(blank)' }), h('td', { text: p.coder }),
            h('td', null, h('a', { href: '#/verify', onclick: () => { V.frame = fr.id; V.unit = p.unit; V.filter = 'all'; }, text: 'Open' })))))) : h('p', { class: 'muted', text: 'None.' }),
        h('p', { class: 'muted', text: 'Consensus decisions arrive in the next stage.' }))));
  }
  root.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'ph' }, h('h1', { text: 'Agreement' }), h('div', { class: 'muted', text: 'First coder against verifier, from finished units only' })), body));
}
