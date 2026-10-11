// Per-review switches set in review.json under `features`. A switch left out is on, so a review
// that sets nothing keeps every part of the app. The grey literature review sets
// `document_view: false` (PI ruling 1, 10 October 2026): it is a coding review only.
//   screen         the Screen tab (full-text screening)
//   documents      the Documents tab and document pages
//   code           the Code tab
//   verify         the Verify tab (verifying existing coding)
//   document_view  Verify by document: full text, coded fragments, new codes and comments on selected text
//   pdf            the Open PDF button beside each item
//   agreement      the Agreement tab (agreement between coders)
//   overview       the Overview tab
// A team repo can start with some parts off and switch them on later, in the same repo, once their
// data is added: cogimp-team starts with the Project page and Screen only (PI, 11 October 2026).
import { S } from './data.js';

export const FEATURES = ['screen', 'documents', 'code', 'verify', 'document_view', 'pdf', 'agreement', 'overview'];

/** Is this part of the app switched on for the open review? */
export function feature(key, review = S.review) {
  const f = (review && review.features) || {};
  return f[key] !== false;
}
