// Geometry-guided print evidence from the frozen PSA experiment.
// A reference patch describes the enrolled print, not an OCR-certified label.
const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const offsets = [-.45, 0, .45];
const shapes = { number: [6, 4, .5], header: [3.5, 4, .5], digit: [2.3, 2.3, .46], decimal: [2.3, 2.3, .46] };
const distances = (a, b) => average(a.map((value, index) => (value - b[index]) ** 2));

function patch(sample, { x, y, kind }) {
  const [rx, ry, step] = shapes[kind];
  const numerical = kind === 'digit' || kind === 'decimal';
  const backgrounds = numerical ? Array.from({ length: 16 }, (_, i) =>
    sample(x + 5.8 * Math.cos(i * Math.PI / 8), y + 5.8 * Math.sin(i * Math.PI / 8))) :
    [-1, 1].flatMap(dx => [-1, 1].map(dy => sample(x + dx * (rx + 1.5), y + dy * (ry + 1.5))));
  if (backgrounds.some(value => !Number.isFinite(value))) return null;
  const bg = numerical ? median(backgrounds) : average(backgrounds);
  const pixels = [];
  for (let dy = -ry; dy <= ry + 1e-8; dy += step) {
    for (let dx = -rx; dx <= rx + 1e-8; dx += step) {
      if (numerical && Math.hypot(dx, dy) > 2.95) continue;
      const gray = sample(x + dx, y + dy);
      if (!Number.isFinite(gray)) return null;
      pixels.push(Math.max(0, Math.min(1, (bg - gray) / Math.max(50, bg - 20))));
    }
  }
  return pixels;
}

const patchSizes = Object.fromEntries(Object.keys(shapes).map(kind =>
  [kind, patch(() => 255, { kind, x: 0, y: 0 }).length]));

function inkCenter(sample, x, y, rx) {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity, count = 0;
  const background = median([-1, 1].flatMap(dx => [-1, 1].map(dy => sample(x + dx * (rx + 1), y + dy * 8))));
  if (!Number.isFinite(background)) return null;
  for (let dy = -7; dy <= 7; dy += .5) {
    for (let dx = -rx; dx <= rx; dx += .5) {
      const value = sample(x + dx, y + dy);
      if (!Number.isFinite(value)) return null;
      if ((background - value) / Math.max(50, background - 20) < .35) continue;
      left = Math.min(left, dx);
      right = Math.max(right, dx);
      top = Math.min(top, dy);
      bottom = Math.max(bottom, dy);
      count++;
    }
  }
  if (count < 6 || right - left < 1 || bottom - top < 2 ||
      left <= -rx || right >= rx - .5 || top <= -7 || bottom >= 7) return null;
  return { x: x + (left + right) / 2, y: y + (top + bottom) / 2 };
}

export function possibleSites(profile) {
  return profile.components.flatMap(block => {
    if (block.kind === 'nr') return block.items.flatMap(item => item.slots.flatMap(slot =>
      slot.choices.filter(({ symbol }) => /^[0-9.]$/.test(symbol)).map(choice => ({
        kind: choice.symbol === '.' ? 'decimal' : 'digit', block: block.id, group: slot.id,
        symbol: choice.symbol, x: choice.x, y: choice.y, inferred: choice.provenance === 'inferred',
      }))));
    const rows = block.items.map(item => ({
      item, choices: [...item.choices].sort((a, b) => a.x - b.x),
    })).sort((a, b) => a.choices[0].y - b.choices[0].y);
    const first = rows[0].choices;
    const spacing = median(first.slice(1).map((choice, i) => choice.x - first[i].x));
    const numbers = rows.map(({ item, choices }) => ({
      kind: 'number', block: block.id, group: block.id, symbol: item.id,
      x: choices[0].x - spacing, y: choices[0].y, spacing,
      inferred: choices[0].provenance === 'inferred',
    }));
    const headers = first.map(choice => ({
      kind: 'header', block: block.id, group: block.id, symbol: choice.symbol,
      x: choice.x, y: choice.y - spacing * .9, spacing, inferred: choice.provenance === 'inferred',
    }));
    return [...numbers, ...headers];
  });
}

function outsideExclusions({ x, y }, profile) {
  return !(profile.exclusions ?? []).some(box =>
    x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height);
}

export function enrollSemanticEvidence(profile, sample) {
  const candidates = possibleSites(profile);
  const all = profile.components.flatMap(block => block.items.flatMap(item =>
    item.choices ?? item.slots.flatMap(slot => slot.choices)));
  const placements = candidates.map(site => {
    if (site.inferred) return null;
    if (!site.spacing) return site;
    if (site.spacing <= 0) return null;
    const maxWidth = site.kind === 'number' ? 8 : 7;
    const center = inkCenter(sample, site.x, site.y, Math.min(maxWidth, site.spacing * .4));
    return center && { ...site, ...center };
  });
  const headers = new Map();
  for (const site of placements.filter(site => site?.kind === 'header')) {
    if (!headers.has(site.block)) headers.set(site.block, []);
    headers.get(site.block).push(site.y);
  }
  return placements.flatMap((site, index) => {
    if (!site) return [];
    if (site.kind === 'header') site = { ...site, x: candidates[index].x, y: median(headers.get(site.block)) };
    const origin = candidates[index];
    if (!outsideExclusions(site, profile) || Math.abs(site.x - origin.x) > 8 ||
        Math.abs(site.y - origin.y) > 14) return [];
    const [rx, ry] = shapes[site.kind];
    if (site.spacing && all.some(choice =>
      Math.hypot(Math.max(0, Math.abs(choice.x - site.x) - rx), Math.max(0, Math.abs(choice.y - site.y) - ry)) < choice.radius + 1)) return [];
    const reference = patch(sample, site);
    if (!reference || Math.max(...reference) < .25 ||
        average(reference) < (site.kind === 'decimal' ? .005 : .015)) return [];
    const variants = site.kind === 'digit' ? offsets.flatMap(dx => offsets.map(dy =>
      patch(sample, { ...site, x: site.x + dx, y: site.y + dy }))) : [reference];
    if (variants.some(value => !value)) return [];
    const { kind, block, group, symbol, x, y } = site;
    return [{ index, kind, block, group, symbol, x, y, variants }];
  });
}

export function validatedSemanticSites(sites, profile) {
  const expected = possibleSites(profile);
  if (!Array.isArray(sites) || sites.length > expected.length) throw new TypeError('Invalid semantic evidence.');
  const indexes = new Set();
  for (const site of sites) {
    const origin = expected[site?.index];
    const variants = site?.variants;
    if (!Number.isSafeInteger(site?.index) || indexes.has(site.index) || !origin || origin.inferred ||
        ['kind', 'block', 'group', 'symbol'].some(key => site[key] !== origin[key]) ||
        !Number.isFinite(site.x) || !Number.isFinite(site.y) ||
        site.x < 0 || site.y < 0 || site.x > profile.page.width || site.y > profile.page.height ||
        !outsideExclusions(site, profile) ||
        Math.abs(site.x - origin.x) > (origin.spacing ? 8 : 0) ||
        Math.abs(site.y - origin.y) > (origin.spacing ? 14 : 0) ||
        !Array.isArray(variants) || variants.length !== (site.kind === 'digit' ? 9 : 1) ||
        variants.some(row => !Array.isArray(row) || row.length !== patchSizes[site.kind] ||
          row.some(value => !Number.isFinite(value) || value < 0 || value > 1))) {
      throw new TypeError('Invalid semantic evidence.');
    }
    indexes.add(site.index);
  }
  const enrolled = new Set(sites.map(site => site.index));
  const coverage = Object.fromEntries(Object.keys(shapes).map(kind => [kind, {
    expected: expected.filter(site => site.kind === kind).length,
    enrolled: expected.filter((site, i) => site.kind === kind && enrolled.has(i)).length,
  }]));
  const missing = expected.filter((_, i) => !enrolled.has(i)).map(({ kind, block, group, symbol, x, y }) =>
    ({ kind, block, group, symbol, x, y }));
  return { coverage, missing };
}

export function compareSemanticEvidence(sites, sampler) {
  const groups = new Map();
  const observations = [];
  for (const site of sites) {
    const key = JSON.stringify([site.kind, site.block, site.group]);
    if (!groups.has(key)) groups.set(key, { kind: site.kind, block: site.block, group: site.group, checked: 0, conflicts: 0 });
    const group = groups.get(key);
    const actual = patch(sampler(site), site);
    let status = 'unavailable';
    const peers = sites.filter(peer => peer.block === site.block && peer.group === site.group &&
      peer.symbol !== site.symbol && peer.kind === (site.kind === 'decimal' ? 'digit' : site.kind));
    if (actual && (site.kind === 'digit' || site.kind === 'decimal') && average(actual) > .72) status = 'masked';
    else if (actual && peers.length) {
      const distance = peer => Math.min(...peer.variants.map(reference => distances(actual, reference)));
      const expected = distance(site);
      const alternative = Math.min(...peers.map(distance));
      const limit = site.kind === 'decimal' ? .10 : .12;
      const margin = { number: .025, header: .035, digit: .035, decimal: .055 }[site.kind];
      if (Math.min(expected, alternative) <= limit) {
        group.checked++;
        status = expected - alternative > margin ? 'conflict' :
          alternative - expected > margin ? 'consistent' : 'ambiguous';
        if (status === 'conflict') group.conflicts++;
      } else status = 'weak';
    }
    const { variants, ...location } = site;
    observations.push({ ...location, status });
  }
  const evidence = [...groups.values()];
  const confirmed = evidence.filter(({ kind, checked, conflicts }) => {
    const [minimum, required] = { number: [4, 2], header: [3, 2], digit: [5, 3], decimal: [1, 1] }[kind];
    return checked >= minimum && conflicts >= required;
  });
  return { groups: evidence, observations, confirmed };
}
