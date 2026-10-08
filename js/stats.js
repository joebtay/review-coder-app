// Krippendorff's alpha for two coders, nominal data.
// pairs: array of [a, b]. null and undefined count as the category "(blank)".

const cat = (x) => (x === null || x === undefined || x === '' ? '(blank)' : String(x));

export function alphaNominal(pairs) {
  const N = pairs.length;
  if (N === 0) return { alpha: null, n: 0, agreement: null };
  const o = new Map(); // coincidence matrix
  const add = (a, b) => {
    if (!o.has(a)) o.set(a, new Map());
    o.get(a).set(b, (o.get(a).get(b) || 0) + 1);
  };
  let same = 0;
  for (const [x, y] of pairs) {
    const a = cat(x), b = cat(y);
    add(a, b);
    add(b, a);
    if (a === b) same++;
  }
  const n = 2 * N;
  const nc = new Map();
  for (const [c, row] of o) nc.set(c, [...row.values()].reduce((s, v) => s + v, 0));
  let Do = 0;
  for (const [c, row] of o) for (const [k, v] of row) if (c !== k) Do += v;
  let De = 0;
  for (const [c, a] of nc) for (const [k, b] of nc) if (c !== k) De += (a * b) / (n - 1);
  const alpha = De === 0 ? (Do === 0 ? 1 : null) : 1 - Do / De;
  return { alpha, n: N, agreement: same / N };
}
