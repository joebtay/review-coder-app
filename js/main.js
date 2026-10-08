import { S, loadReview, refreshEvents } from './data.js';
import { GitHubStore, StaticStore } from './store.js';
import { h } from './ui.js';
import { mountCodebook, toggleCodebook, render as renderCodebook } from './codebook.js';
import { renderProject } from './project.js';
import { renderDocuments, renderDocProfile } from './documents.js';
import { renderVerify, V } from './verify.js';
import { renderAgreement } from './agreement.js';

const NAV = [['project', 'Project'], ['documents', 'Documents'], ['screen', 'Screen'], ['code', 'Code'], ['verify', 'Verify'], ['agreement', 'Agreement'], ['overview', 'Overview']];
const CFG = 'rc:config';
const app = document.getElementById('app');
let shell = null, main = null, pill = null, pendingRender = false;

const cfg = () => { try { return JSON.parse(localStorage.getItem(CFG) || 'null'); } catch { return null; } };
const saveCfg = (c) => { try { localStorage.setItem(CFG, JSON.stringify(c)); } catch {} };
const apiOverride = () => { const q = new URLSearchParams(location.search).get('api'); return q && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(q) ? q : null; };

function signIn(msg) {
  const c = cfg() || {};
  const qRepo = new URLSearchParams(location.search).get('repo');
  const linkRepo = qRepo && /^[\w.-]+\/[\w.-]+$/.test(qRepo) ? qRepo : null;
  const repo = h('input', { type: 'text', id: 'repo', placeholder: 'owner/repo', value: linkRepo || c.repo || '', autocomplete: 'off' });
  const token = h('input', { type: 'password', id: 'token', placeholder: 'GitHub fine-grained token', value: c.token || '', autocomplete: 'off' });
  const remember = h('input', { type: 'checkbox', id: 'remember', checked: true });
  const err = h('div', { class: 'warnline', id: 'err', text: msg || '' });
  const go = async () => {
    err.textContent = '';
    const conf = { repo: repo.value.trim(), token: token.value.trim(), api: apiOverride() || undefined };
    if (!/^[\w.-]+\/[\w.-]+$/.test(conf.repo) || !conf.token) { err.textContent = 'Enter the repository as owner/name and paste your token.'; return; }
    await start(new GitHubStore(conf), conf, remember.checked);
  };
  app.replaceChildren(h('div', { class: 'signin' },
    h('h1', { text: 'Review Coder' }), h('p', { class: 'muted', text: 'Code, verify and screen documents for an evidence review. Everything is saved to your review\'s private GitHub repo.' }),
    h('label', null, 'Review data repository', repo), h('label', null, 'Your GitHub token', token),
    h('label', { class: 'inline' }, remember, ' Remember on this device'),
    err, h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', onclick: go, text: 'Open review' }), h('button', { type: 'button', class: 'btn', onclick: () => start(new StaticStore('./demo/'), null, false), text: 'Try the demo' })),
    h('details', null, h('summary', { text: 'How to make a token' }),
      h('ol', null, h('li', { text: 'GitHub, Settings, Developer settings, Fine-grained tokens, Generate new token.' }), h('li', { text: 'Repository access: only select repositories, then pick the review data repo.' }),
        h('li', { text: 'Permissions: Contents, read and write. Nothing else.' }), h('li', { text: 'Set an expiry that covers the review. The token stays in this browser and goes only to api.github.com.' })))));
}

async function start(store, conf, remember) {
  app.replaceChildren(h('div', { class: 'signin' }, h('p', { class: 'muted', text: 'Opening the review' })));
  try {
    const u = await store.user();
    await store.init();
    if (conf && remember) saveCfg(conf);
    await loadReview(store, u.login);
    buildShell(u.login);
    route();
  } catch (e) {
    if (conf && (e.status === 0 || e.status >= 500)) { offlineScreen(store, conf, remember, e); return; }
    const m = e.status === 401 ? 'GitHub rejected the token.' : e.status === 404 ? 'Repository not found, or the token cannot see it.' : e.status === 0 ? 'Could not reach GitHub.' : e.message;
    signIn(m);
  }
}

function offlineScreen(store, conf, remember, e) {
  let n = 0;
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(`rc:${conf.repo}:`) && k.endsWith(':outbox')) n += Object.values(JSON.parse(localStorage.getItem(k) || '{}')).reduce((a, l) => a + l.length, 0); } } catch {}
  app.replaceChildren(h('div', { class: 'signin' }, h('h1', { text: 'Cannot reach GitHub' }),
    h('p', null, e.message + '. '), h('p', { class: 'ok', text: n ? `${n} change${n > 1 ? 's' : ''} saved on this device will sync when the connection returns.` : 'Nothing is waiting to sync.' }),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', onclick: () => start(store, conf, remember), text: 'Try again' }), h('button', { type: 'button', class: 'btn', onclick: () => signIn(), text: 'Change repository or token' }))));
}

function buildShell(handle) {
  pill = h('div', { class: 'syncpill' });
  main = h('main', { id: 'main' });
  const nav = h('nav', { 'aria-label': 'Workspace' }, NAV.map(([k, l]) => h('a', { href: `#/${k}`, 'data-k': k, text: l })));
  shell = h('div', { class: 'shell' },
    h('header', { class: 'top' },
      h('div', { class: 'brand' }, h('div', { class: 'logo' }, '≡'), h('div', null, h('b', { text: 'Review Coder' }), h('div', { class: 'muted small', text: S.review.title }))),
      nav,
      h('div', { class: 'right' }, pill,
        h('button', { type: 'button', class: 'btn small', onclick: () => toggleCodebook(), title: 'Show definitions (?)' }, 'Codebook'),
        h('div', { class: 'who', title: handle }, h('span', { class: 'av', text: handle.slice(0, 2).toUpperCase() }), h('span', { class: 'muted small', text: handle })),
        h('button', { type: 'button', class: 'btn small', onclick: () => { if (S.sync && S.sync.pending() && !confirm(`${S.sync.pending()} changes have not reached GitHub yet. They stay saved on this device. Sign out anyway?`)) return; try { localStorage.removeItem(CFG); } catch {} location.hash = ''; location.reload(); } }, 'Sign out'))),
    main);
  app.replaceChildren(shell);
  mountCodebook(app);
  S.listeners.add(scheduleRender);
  S.statusListeners.add(paintPill);
  paintPill();
}

function paintPill() {
  if (!pill) return;
  const s = S.syncStatus;
  const where = S.store && S.store.demo ? 'in this browser (demo)' : 'to GitHub';
  const txt = s.state === 'saved' ? `Saved ${where}` : s.state === 'syncing' ? `Saved on this device · ${s.pending} syncing` : s.state === 'offline' ? `Saved on this device · ${s.pending} waiting, offline` : `Saved on this device · ${s.pending} not synced`;
  pill.className = 'syncpill ' + s.state;
  pill.title = s.message || '';
  const kids = [h('span', { class: 'sd' }), txt];
  if (s.state !== 'saved') kids.push(h('button', { type: 'button', class: 'link', onclick: () => S.sync.flush(), text: 'Retry' }));
  pill.replaceChildren(...kids);
}

function scheduleRender() {
  const a = document.activeElement;
  if (a && /^(TEXTAREA|INPUT)$/.test(a.tagName) && a.closest('#main') && a.type !== 'checkbox') { pendingRender = true; return; }
  route();
}
document.addEventListener('focusout', () => { if (pendingRender) { pendingRender = false; setTimeout(route, 0); } });

function route() {
  if (!main) return;
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const page = parts[0] || 'project';
  shell.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.dataset.k === page || (page === 'doc' && a.dataset.k === 'documents')));
  const y = window.scrollY;
  if (page === 'project') renderProject(main);
  else if (page === 'documents') renderDocuments(main);
  else if (page === 'doc') renderDocProfile(main, decodeURIComponent(parts[1] || ''));
  else if (page === 'verify') renderVerify(main);
  else if (page === 'agreement') renderAgreement(main);
  else main.replaceChildren(h('div', { class: 'page' }, h('h1', { text: NAV.find((n) => n[0] === page)?.[1] || 'Not found' }), h('p', { class: 'muted', text: page === 'overview' ? 'The matrix and audit trail arrive in stage 4.' : 'This module arrives in stage 5.' })));
  renderCodebook(true);
  if (page !== 'verify') window.scrollTo(0, y);
}
window.addEventListener('hashchange', () => { if (main) { route(); window.scrollTo(0, 0); } });

document.addEventListener('keydown', (e) => {
  if (!main) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.key === '?') { toggleCodebook(); e.preventDefault(); return; }
  if ((location.hash.startsWith('#/verify')) && V.keys) V.keys(e);
});

const c = cfg();
if (location.search.includes('demo')) start(new StaticStore('./demo/'), null, false);
else if (c && c.repo && c.token) start(new GitHubStore({ ...c, api: apiOverride() || c.api }), c, true);
else signIn();
