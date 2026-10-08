// Loads a review from a store and holds all state in one object.

import { mergeEvents, makeEvent, cmp } from './events.js';
import { Sync } from './sync.js';

export const S = {
  store: null, handle: null, review: null, frames: {}, docs: [], docById: new Map(),
  units: new Map(), layers: new Map(), samples: [], events: new Map(), sync: null,
  loading: { total: 0, done: 0 }, syncStatus: { state: 'saved', pending: 0 }, listeners: new Set(), statusListeners: new Set(), codebook: null,
};

export const notify = () => S.listeners.forEach((f) => f());
export const notifyStatus = () => S.statusListeners.forEach((f) => f());

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const x = items[i++]; await fn(x); }
  }));
}

export async function loadReview(store, handle) {
  S.store = store;
  S.handle = handle;
  S.review = await store.readJSON('review.json');
  S.frames = {};
  for (const f of S.review.frames || []) if (store.has(`frames/${f}.json`)) S.frames[f] = await store.readJSON(`frames/${f}.json`);
  S.docs = store.has('documents/index.json') ? await store.readJSON('documents/index.json') : [];
  S.docById = new Map(S.docs.map((d) => [d.id, d]));
  S.queries = store.has('queries.json') ? await store.readJSON('queries.json') : [];
  S.sync = new Sync(store, handle, (st) => { S.syncStatus = st; notifyStatus(); });
  notify();
  loadRest().catch((e) => { S.loadError = e; notify(); });
}

export async function loadRest() {
  const { store, review } = S;
  const first = review.first_layer;
  const jobs = [];
  for (const d of S.docs) {
    if (store.has(`units/${d.id}.json`)) jobs.push(['units', d.id]);
    if (first && store.has(`layers/${first}/${d.id}.json`)) jobs.push(['layer', d.id]);
  }
  const samplePaths = store.list('samples/').filter((p) => p.endsWith('.json'));
  const workPaths = store.list('work/').filter((p) => p.endsWith('.json'));
  S.loading = { total: jobs.length + samplePaths.length + workPaths.length, done: 0 };
  const tick = () => { S.loading.done++; if (S.loading.done % 8 === 0) notify(); };
  S.samples = [];
  await pool(samplePaths, 6, async (p) => { S.samples.push(await store.readJSON(p)); tick(); });
  await pool(workPaths, 6, async (p) => {
    const [, , file] = p.split('/');
    const doc = file.replace(/\.json$/, '');
    try {
      const w = await store.readJSON(p);
      S.events.set(doc, mergeEvents(S.events.get(doc), w.events));
    } catch {}
    tick();
  });
  // local outbox events that have not reached GitHub yet
  for (const [doc, evs] of Object.entries(S.sync.outbox)) S.events.set(doc, mergeEvents(S.events.get(doc), evs));
  notify();
  await pool(jobs, 8, async ([kind, id]) => {
    if (kind === 'units') S.units.set(id, (await store.readJSON(`units/${id}.json`)).units);
    else {
      if (!S.layers.has(first)) S.layers.set(first, new Map());
      S.layers.get(first).set(id, await store.readJSON(`layers/${first}/${id}.json`));
    }
    tick();
  });
  S.loading.done = S.loading.total;
  S.ready = true;
  notify();
}

export async function refreshEvents() {
  await S.store.refreshTree();
  const paths = S.store.list('work/').filter((p) => p.endsWith('.json'));
  await pool(paths, 6, async (p) => {
    const doc = p.split('/')[2].replace(/\.json$/, '');
    try { S.events.set(doc, mergeEvents(S.events.get(doc), (await S.store.readJSON(p)).events, S.sync.pendingEvents(doc))); } catch {}
  });
  notify();
}

export function addEvent(doc, type, fields) {
  const e = makeEvent(S.handle, type, { doc, ...fields });
  S.events.set(doc, mergeEvents(S.events.get(doc), [e]));
  S.sync.add(doc, e);
  notify();
  return e;
}

/** Latest recorded decision for a query (by time, then id), or null. */
export function latestDecision(qid) { const d = decisionsFor(qid); return d.length ? d[d.length - 1] : null; }
export function decisionsFor(qid) { return docEvents('_queries').filter((e) => e.type === 'decision' && e.query === qid).sort(cmp); }

export const allEvents = () => [].concat(...S.events.values());
export const docEvents = (doc) => S.events.get(doc) || [];

const val = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x.v ?? null : x ?? null);
export const codeValue = val;

/** The first layer's codes for a unit and frame: {field: value}. */
export function firstCodes(doc, unit, frame) {
  const L = S.layers.get(S.review.first_layer)?.get(doc);
  const c = L?.codes?.[unit]?.[frame];
  if (!c) return null;
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, val(v)]));
}
export function firstExtras(doc, unit) {
  const L = S.layers.get(S.review.first_layer)?.get(doc);
  const raw = L?.codes?.[unit];
  return { note: L?.notes?.[unit] || '', raw };
}

export function unitList(doc) { return S.units.get(doc) || []; }
export function findUnit(doc, id) { return unitList(doc).find((u) => u.id === id); }

export function populationFor(frame) {
  const f = S.frames[frame];
  const out = [];
  for (const d of S.docs) {
    for (const u of unitList(d.id)) {
      if (u.excluded) continue;
      const c = firstCodes(d.id, u.id, frame);
      if (!c) continue;
      out.push({ doc: d.id, unit: u.id, stratum: c[f.stratify_by] ?? '(blank)' });
    }
  }
  return out;
}

export function fieldDef(frame, field) { return S.frames[frame].fields.find((x) => x.id === field); }
export function valueDef(frame, field, value) { return fieldDef(frame, field)?.values.find((v) => v.id === value); }
