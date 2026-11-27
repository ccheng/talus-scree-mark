// REG-R10 shadow association. The score ranks geometric explanations only.
export function arbitrateFootprints(hypotheses, points) {
  const byWitness = new Map();
  for (const row of hypotheses) {
    for (const index of row) {
      if (!byWitness.has(index)) byWitness.set(index, []);
      byWitness.get(index).push(row);
    }
  }
  const rows = [], tentative = [], unresolved = [], seen = new Set();
  let budget = 100000;
  for (const root of hypotheses) {
    if (seen.has(root)) continue;
    const group = [root];
    seen.add(root);
    for (const row of group) for (const index of row) for (const other of byWitness.get(index)) {
      if (seen.has(other)) continue;
      seen.add(other);
      group.push(other);
    }
    if (group.length > 22 || budget <= 0) {
      unresolved.push({ reason: 'association-budget', rows: group });
      continue;
    }
    const ranked = group.map(indexes => {
      const [first, next] = indexes.map(index => points[index]);
      const dx = next.x - first.x, dy = next.y - first.y;
      const error = indexes.reduce((sum, index, offset) => sum +
        Math.hypot(points[index].x - first.x - dx * offset, points[index].y - first.y - dy * offset), 0) / indexes.length;
      return { indexes, score: indexes.length - .65 - 2 * Math.abs(dy / dx) - error / first.radius };
    }).sort((a, b) => b.score - a.score);
    let best = -Infinity, second = -Infinity, solution = [];
    const occupied = new Set(), stack = [];
    function visit(index, score) {
      if (--budget < 0) return;
      if (index === ranked.length) {
        if (score > best) {
          second = best;
          best = score;
          solution = [...stack];
        } else second = Math.max(second, score);
        return;
      }
      const row = ranked[index];
      if (row.indexes.every(i => !occupied.has(i))) {
        row.indexes.forEach(i => occupied.add(i));
        stack.push(row.indexes);
        visit(index + 1, score + row.score);
        stack.pop();
        row.indexes.forEach(i => occupied.delete(i));
      }
      if (budget >= 0) visit(index + 1, score);
    }
    visit(0, 0);
    if (budget < 0 || best - second < .25) {
      unresolved.push({ reason: budget < 0 ? 'association-budget' : 'near-tie', rows: group });
      continue;
    }
    for (const row of solution) (row.length === 2 ? tentative : rows).push(row);
  }
  return { rows, tentative, unresolved };
}
