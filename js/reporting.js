// The Reporting tab (switch `reporting`, off unless a review sets it to true). It lists the outputs ticked on the
// set-up page, review.json `reporting.outputs`. The outputs themselves are built in the next step of the set-up
// page work (PI, 13 October 2026); until then each one says so.
import { S } from './data.js';
import { h } from './ui.js';
import { OUTPUTS } from './setuprules.js';

export function renderReporting(root) {
  const rp = S.review.reporting || {};
  const ticked = OUTPUTS.filter(([k]) => (rp.outputs || []).includes(k));
  root.replaceChildren(h('div', { class: 'page narrow', id: 'reporting' }, h('h1', { text: 'Reporting' }),
    ticked.length
      ? h('ul', { class: 'plain' }, ticked.map(([k, label]) => h('li', { 'data-output': k }, h('b', { text: label }), '  ',
        h('span', { class: 'muted', text: k === 'dashboard' && rp.dashboard ? `to ${rp.dashboard}: not built yet` : 'not built yet' }))))
      : h('p', { class: 'muted', text: 'No outputs are ticked for this project. The PI picks them on the set-up page.' })));
}
