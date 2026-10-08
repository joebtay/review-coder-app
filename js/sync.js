// Autosave and sync. Every event is written to this browser first (the outbox), then pushed to
// work/<handle>/<doc>.json on GitHub. A failed push leaves the event in the outbox and retries.

import { mergeEvents } from './events.js';

export class Sync {
  /** status callback receives {state:'saved'|'syncing'|'offline'|'error', pending:n, message} */
  constructor(store, handle, onStatus, { debounce = 1200, backoff = [4000, 10000, 30000, 60000] } = {}) {
    this.store = store;
    this.handle = handle;
    this.onStatus = onStatus || (() => {});
    this.debounce = debounce;
    this.backoff = backoff;
    this.key = `rc:${store.repo}:${handle}:outbox`;
    this.outbox = this._load(); // {doc: [events]}
    this.timer = null;
    this.running = false;
    this.fails = 0;
    this.listeners = [];
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.flushSoon(0));
      document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && this.pending() && this.flushSoon(0));
      window.addEventListener('beforeunload', (e) => { if (this.pending()) { e.preventDefault(); e.returnValue = ''; } });
    }
    this._status();
    if (this.pending()) this.flushSoon(500);
  }

  _load() { try { return JSON.parse(localStorage.getItem(this.key) || '{}'); } catch { return {}; } }
  _save() { try { localStorage.setItem(this.key, JSON.stringify(this.outbox)); } catch {} }
  pending() { return Object.values(this.outbox).reduce((s, l) => s + l.length, 0); }
  pendingEvents(doc) { return this.outbox[doc] || []; }
  _status(state, message) {
    const p = this.pending();
    this.onStatus({ state: state || (p ? 'syncing' : 'saved'), pending: p, message: message || '' });
  }

  add(doc, event) {
    (this.outbox[doc] ||= []).push(event);
    this._save(); // saved on this device before anything else happens
    this._status('syncing');
    this.flushSoon(this.debounce);
  }

  flushSoon(ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), ms);
  }

  async flush() {
    if (this.running) return;
    this.running = true;
    try {
      for (const doc of Object.keys(this.outbox)) {
        if (!this.outbox[doc].length) { delete this.outbox[doc]; continue; }
        await this._pushDoc(doc);
      }
      this.fails = 0;
      this._status('saved');
      this.listeners.forEach((f) => f());
    } catch (e) {
      const wait = this.backoff[Math.min(this.fails++, this.backoff.length - 1)];
      const offline = e.status === 0 || e.status >= 500 || e.status === 429;
      const msg = e.status === 401 || e.status === 403 ? 'GitHub refused the write. Check the token has Contents: read and write on this repo.' : e.message;
      this._status(offline ? 'offline' : 'error', msg);
      this.flushSoon(wait);
    } finally {
      this.running = false;
    }
  }

  async _pushDoc(doc) {
    const path = `work/${this.handle}/${doc}.json`;
    for (let attempt = 0; attempt < 6; attempt++) {
      const batch = this.outbox[doc].slice();
      const remote = await this.store.readFile(path);
      let events = [];
      if (remote) { try { events = JSON.parse(remote.text).events || []; } catch { events = []; } }
      const merged = mergeEvents(events, batch);
      try {
        await this.store.writeJSON(path, { schema: 1, coder: this.handle, doc, events: merged },
          { sha: remote ? remote.sha : undefined, message: `${this.handle}: ${batch.length} event(s) on ${doc}` });
      } catch (e) {
        if (e.status === 409 || e.status === 422) continue; // someone wrote first (another device): re-read and merge
        throw e;
      }
      const sent = new Set(batch.map((b) => b.id));
      this.outbox[doc] = this.outbox[doc].filter((x) => !sent.has(x.id));
      if (!this.outbox[doc].length) delete this.outbox[doc];
      this._save();
      return;
    }
    throw Object.assign(new Error('Could not merge after 6 attempts'), { status: 409 });
  }
}
