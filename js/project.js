import { S, docEvents, allEvents, firstCodes, unitList } from './data.js';
import { h, bar, pct, colourFor, chip } from './ui.js';
import { openCodebook } from './codebook.js';
import { queriesSection } from './queries.js';

const num = (n) => (n === null || n === undefined ? h('span', { class: 'muted', text: 'not entered' }) : String(n));

export function prisma() {
  const p = S.review.prisma || {};
  const box = (t, n, cls) => h('div', { class: 'pbox ' + (cls || '') }, h('div', { class: 'pt', text: t }), h('div', { class: 'pn' }, num(n)));
  const excl = p.excluded || [];
  const exTotal = excl.reduce((s, x) => s + (x.n || 0), 0);
  return h('div', { class: 'prisma' },
    h('div', { class: 'pcol' }, box('Records identified', p.identified), h('div', { class: 'parrow', text: '↓' }), box('Records screened', p.screened), h('div', { class: 'parrow', text: '↓' }),
      box('Reports sought for retrieval', p.sought), h('div', { class: 'parrow', text: '↓' }), box('Reports assessed for eligibility (full text)', p.assessed), h('div', { class: 'parrow', text: '↓' }),
      box('Included', p.included, 'inc')),
    h('div', { class: 'pcol side' },
      h('div', { class: 'pbox ex' }, h('div', { class: 'pt', text: `Reports excluded at full text${exTotal ? ` (n = ${exTotal})` : ''}` }),
        excl.length ? h('ul', null, excl.map((x) => h('li', { text: `${x.reason}: ${x.n}` }))) : h('div', { class: 'muted', text: 'No exclusions recorded yet. They come from the Screen module.' }))));
}

/** units coded in the first layer / total units, per frame */
export function codedProgress() {
  const first = S.review.first_layer;
  const out = {};
  let total = 0;
  for (const d of S.docs) total += unitList(d.id).filter((u) => !u.excluded).length;
  for (const fr of Object.values(S.frames)) {
    const layerFrames = (S.review.layers.find((l) => l.id === first) || {}).frames || [];
    if (!layerFrames.includes(fr.id)) { out[fr.id] = { coded: 0, total }; continue; }
    let coded = 0;
    for (const d of S.docs) for (const u of unitList(d.id)) if (!u.excluded && firstCodes(d.id, u.id, fr.id)) coded++;
    out[fr.id] = { coded, total };
  }
  return { out, total };
}

export function verifiedProgress(frame) {
  const samples = S.samples.filter((s) => s.frame === frame);
  const sampled = new Set(), done = new Set();
  for (const s of samples) for (const u of s.units) sampled.add(u.unit);
  for (const e of allEvents()) if (e.type === 'done' && e.frame === frame && sampled.has(e.unit)) done.add(e.unit);
  const mine = new Set();
  for (const e of allEvents()) if (e.type === 'done' && e.frame === frame && e.coder === S.handle && sampled.has(e.unit)) mine.add(e.unit);
  return { sampled: sampled.size, done: done.size, mine: mine.size };
}

export function renderProject(root) {
  const r = S.review;
  const prog = S.ready ? codedProgress() : null;
  root.replaceChildren(
    h('div', { class: 'page' },
      h('div', { class: 'ph' }, h('h1', { text: r.title }), r.subtitle ? h('div', { class: 'muted', text: r.subtitle }) : null),
      h('div', { class: 'grid2' },
        h('section', { class: 'card' }, h('h2', { text: 'Research questions' }),
          (r.questions || []).length ? h('ol', { class: 'rq' }, r.questions.map((q) => h('li', null, h('b', { text: q.id + '  ' }), q.text,
            (q.frames || []).length ? h('div', { class: 'rqf' }, q.frames.map((f) => h('span', { class: 'pill', text: (S.frames[f] || {}).name || f }))) : null))) : h('p', { class: 'muted', text: 'None entered. Edit review.json in the data repo.' })),
        h('section', { class: 'card' }, h('h2', { text: 'Progress' }),
          !S.ready ? h('p', { class: 'muted', text: `Loading ${S.loading.done} of ${S.loading.total} files` }) : h('div', { class: 'prog' },
            h('div', { class: 'muted', text: `${S.docs.length} documents · ${prog.total.toLocaleString()} units of coding` }),
            Object.values(S.frames).map((fr) => {
              const c = prog.out[fr.id], v = verifiedProgress(fr.id);
              return h('div', { class: 'pr' }, h('div', { class: 'prh' }, h('b', { text: fr.name }), h('span', { class: 'muted', text: fr.type })),
                h('div', { class: 'prl' }, h('span', { text: 'Corpus coded' }), h('b', { text: `${pct(c.coded, c.total)}  (${c.coded.toLocaleString()} of ${c.total.toLocaleString()})` })), bar(c.total ? c.coded / c.total : 0, 'var(--blue)'),
                h('div', { class: 'prl' }, h('span', { text: 'Sample verified' }), h('b', { text: v.sampled ? `${pct(v.done, v.sampled)}  (${v.done} of ${v.sampled}; you ${v.mine})` : 'no sample drawn' })), bar(v.sampled ? v.done / v.sampled : 0, 'var(--green)'));
            }))),
        h('section', { class: 'card' }, h('h2', { text: 'Team' }),
          h('ul', { class: 'plain' }, (r.team || []).map((t) => h('li', null, h('b', { text: t.name }), '  ', h('span', { class: 'muted', text: `${t.role}${t.handle ? ' · @' + t.handle : ''}` }))))),
        h('section', { class: 'card' }, h('h2', { text: 'Key links' }),
          h('ul', { class: 'plain' },
            h('li', null, h('a', { href: '#/documents', text: 'Included documents' })),
            r.codebook ? h('li', null, h('a', { href: '#', onclick: (e) => { e.preventDefault(); openCodebook({ tab: 'full' }); }, text: `Codebook ${r.codebook_version || ''}` })) : null,
            (r.links || []).filter((l) => !/codebook/i.test(l.label)).map((l) => h('li', null, h('a', { href: l.url, target: '_blank', rel: 'noopener', text: l.label }))))),
        queriesSection(),
        h('section', { class: 'card wide' }, h('h2', { text: 'PRISMA 2020 flow' }), prisma()),
        h('section', { class: 'card' }, h('h2', { text: 'Milestones' }),
          h('ul', { class: 'plain' }, (r.milestones || []).map((m) => h('li', { class: m.done ? 'done' : '' }, h('span', { class: 'tick', text: m.done ? '✓' : '○' }), ' ', m.label, m.date ? h('span', { class: 'muted', text: '  ' + m.date }) : null)))),
        h('section', { class: 'card' }, h('h2', { text: 'Layers' }),
          (r.layers || []).length ? h('table', { class: 't' }, h('thead', null, h('tr', null, ['Layer', 'Kind', 'Frames'].map((x) => h('th', { text: x })))),
            h('tbody', null, r.layers.map((l) => h('tr', null, h('td', { text: l.label || l.id }), h('td', { text: l.kind }), h('td', { text: (l.frames || []).join(', ') }))))) : h('p', { class: 'muted', text: 'No coded layers yet.' }))
      )));
}
