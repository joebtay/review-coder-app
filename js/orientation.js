// Orientation to the coding frame: opens before a coder's first item in a sample and stays one
// click away while coding (PI ruling 2, 10 October 2026). The text is a Markdown file in the data
// repo, named in review.json as `orientation.file`; `orientation.task` is the one-line task shown
// at the top of the Verify screen. Neither is set until the PI approves the wording.
import { S } from './data.js';
import { h, mdToHtml } from './ui.js';

let cache = { file: null, html: null };

export const hasOrientation = () => !!(S.review.orientation && S.review.orientation.file);

const seenKey = (sampleId) => `rc:${S.review.id}:${S.handle}:orientation:${sampleId}`;
export function seen(sampleId) { try { return localStorage.getItem(seenKey(sampleId)) === '1'; } catch { return false; } }
export function markSeen(sampleId) { try { localStorage.setItem(seenKey(sampleId), '1'); } catch {} }

/** True when the orientation should open before the first item of this sample. */
export function shouldOpen(sample, doneN) { return hasOrientation() && !!sample && doneN === 0 && !seen(sample.id); }

/** The orientation page. `onStart` closes it and goes to the coding screen. */
export function orientationPage(onStart, startLabel = 'Start coding') {
  const body = h('div', { class: 'md orient' });
  const file = S.review.orientation.file;
  if (cache.file === file && cache.html != null) body.innerHTML = cache.html;
  else {
    body.append(h('p', { class: 'muted', text: 'Loading the orientation' }));
    S.store.readText(file).then((t) => { cache = { file, html: mdToHtml(t) }; body.innerHTML = cache.html; })
      .catch((e) => { body.textContent = 'Could not load the orientation: ' + e.message; });
  }
  return h('div', { class: 'page narrow' }, h('section', { class: 'card' }, body,
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', id: 'orient-start', onclick: onStart, text: startLabel }))));
}

/** The task line at the top of the Verify screen, with its link to the orientation. */
export function taskLine(openIt) {
  const o = S.review.orientation || {};
  if (!o.task) return null;
  return h('div', { class: 'taskline' }, h('span', { text: o.task + ' ' }),
    hasOrientation() ? h('button', { type: 'button', class: 'link', id: 'orient-open', onclick: openIt, text: o.link || 'How the codes work' }) : null);
}
