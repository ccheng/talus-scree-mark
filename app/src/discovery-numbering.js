// Printed identity belongs to a row, independent of the order of blocks on the page.
export function planDiscoveryIds(kept, components, diagnostics, blockIds) {
  const held = new Set([...blockIds, ...kept.flatMap(block => block.items.flatMap(item =>
    [item.id, ...(item.slots ?? []).map(slot => slot.id)]))]);
  const byBlock = new Map();
  const counts = new Map();
  for (const evidence of diagnostics) {
    const { id, row, decision, number } = evidence;
    if (decision !== 'confirmed' || !Number.isSafeInteger(number) || number < 1) continue;
    if (!byBlock.has(id)) byBlock.set(id, new Map());
    const rows = byBlock.get(id);
    if (!rows.has(row)) rows.set(row, new Set());
    rows.get(row).add('MC' + number);
  }
  const requests = components.flatMap(block => block.items.map(item => ({
    block: block.id, item: item.id, kind: item.kind,
    claims: item.kind === 'mc' ? [...(byBlock.get(block.id)?.get(item.id) ?? [])] : [],
  })));
  for (const { claims } of requests) {
    for (const id of claims) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const used = new Set([...held, ...counts.keys()]);
  const next = { mc: 1, nr: 1 };
  const result = new Map();
  for (const { block, item, kind, claims } of requests) {
    let id = claims.length === 1 && counts.get(claims[0]) === 1 && !held.has(claims[0]) ? claims[0] : null;
    let reason;
    if (!id) {
      if (kind === 'mc') reason = claims.length ? 'conflict' : 'unverified';
      do {
        id = kind.toUpperCase() + next[kind]++;
      } while (used.has(id) || kind === 'nr' && [1, 2, 3, 4].some(index => used.has(id + '.' + index)));
    }
    used.add(id);
    if (kind === 'nr') for (let i = 1; i <= 4; i++) used.add(id + '.' + i);
    if (!result.has(block)) result.set(block, new Map());
    result.get(block).set(item, { id, reason, claims });
  }
  return result;
}
