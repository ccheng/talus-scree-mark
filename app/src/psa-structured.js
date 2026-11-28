import { orderBlocks } from './layout-discovery.js';
import { createMarkerlessProfile, intersects } from './profile-authoring.js';
import { pagePsaProposals, pageScale, reconcilePsaPage, rectifiedRegion } from './psa-nr-discovery.js';
import { NRWorker } from './psa-nr/worker-client.js';
import { MCWorker } from './psa-mc/worker-client.js';

function enclosure(choices) {
  const left = Math.min(...choices.map(({ x, radius }) => x - radius - .25));
  const top = Math.min(...choices.map(({ y, radius }) => y - radius - .25));
  const right = Math.max(...choices.map(({ x, radius }) => x + radius + .25));
  const bottom = Math.max(...choices.map(({ y, radius }) => y + radius + .25));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function union(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y };
}

function mapRow(row, outlines, page, index) {
  if (![4, 5].includes(row.points.length) || row.observed.length !== row.points.length) return null;
  const distances = row.points.map(([x, y]) => outlines.find(([ox, oy]) => Math.hypot(x - ox, y - oy) < .01));
  const radii = distances.filter(Boolean).map((outline) => outline[2]).sort((a, b) => a - b);
  if (!radii.length || row.observed.some((present, i) => present && !distances[i])) return null;
  const choices = row.points.map(([x, y], i) => ({
    x: x / pageScale, y: y / pageScale,
    radius: (row.observed[i] ? distances[i][2] : radii[Math.floor(radii.length / 2)]) / pageScale,
    symbol: 'ABCDE'[i], provenance: row.observed[i] ? 'observed' : 'inferred',
  }));
  const bounds = enclosure(choices);
  if (bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > page.width || bounds.y + bounds.height > page.height) return null;
  const item = { id: `psa-item-${index}`, kind: 'mc', bounds, choices };
  return { item, number: row.number, reasons: row.review_reasons, arbitration: row.arbitration, decision: row.decision };
}

function sameRow(a, b) {
  return a.choices.length === b.choices.length && a.choices.every((cell, i) =>
    Math.hypot(cell.x - b.choices[i].x, cell.y - b.choices[i].y) <= Math.min(cell.radius, b.choices[i].radius));
}

function validBlocks(page, components) {
  try { createMarkerlessProfile({ page, components, id: 'structured-check', name: 'Structured check', revision: 1 }); }
  catch { return false; }
  return true;
}

export function reconcileStructured(result, { mc, nr }, exclusions, page) {
  const numerical = reconcilePsaPage(result, pagePsaProposals(nr, page), exclusions);
  const issues = new Set(numerical.issues);
  let blocks = [...numerical.components];
  // An NR geometry remains contested when its symbols fail verification.
  // Its digit rows cannot become MC simply because the NR proposal was withheld.
  const establishedNumerical = result.components.filter(({ kind }) => kind === 'nr');
  const unresolvedNumerical = numerical.conflictRegions.filter(region => region.requiresResolution && !region.unlocalized);
  const diagnostics = [...numerical.diagnostics];
  let added = 0;
  let refined = 0;
  const conflictRegions = [...numerical.conflictRegions];
  let conflicts = 0;
  const recordConflict = (bounds, reason) => {
    conflicts++;
    if (!conflictRegions.some((entry) => intersects(entry.bounds, bounds))) conflictRegions.push({ bounds, reason, requiresResolution: true });
  };
  const rows = mc.rows.flatMap((row, index) => {
    const mapped = mapRow(row, mc.outlines, page, index);
    if (mapped) return [mapped];
    if (!['confirmed', 'review'].includes(row.decision)) return [];
    const points = row.points.filter(point => point.every(Number.isFinite))
      .map(([x, y]) => ({ x: x / pageScale, y: y / pageScale, radius: 1 }));
    const region = points.length ? enclosure(points) : null;
    if (region && exclusions.some(zone => intersects(zone, region))) return [];
    conflicts++;
    conflictRegions.push({ bounds: region ?? { x: 0, y: 0, width: page.width, height: page.height },
      reason: 'A detected MC row could not be mapped.', requiresResolution: true });
    return [];
  });
  for (const row of rows) {
    const { item } = row;
    if (exclusions.some((zone) => intersects(zone, item.bounds))) continue;
    if (result.excludedNumericalRegions?.some((bounds) => intersects(bounds, item.bounds))) continue;
    if (unresolvedNumerical.some(({ bounds }) => intersects(bounds, item.bounds))) continue;
    const numericalRegion = establishedNumerical.find(({ bounds }) => intersects(bounds, item.bounds));
    if (numericalRegion) {
      const occupied = blocks.some(({ kind, bounds }) => kind === 'nr' && intersects(bounds, item.bounds));
      if (!occupied || row.arbitration === 'unresolved') {
        recordConflict(numericalRegion.bounds, 'MC and NR interpretations compete in this region');
      }
      continue;
    }
    if (row.arbitration) {
      if (row.arbitration === 'unresolved' || !blocks.some((b) => b.kind === 'nr' && intersects(b.bounds, item.bounds))) {
        recordConflict(item.bounds, 'MC and NR interpretations compete in this region');
      }
      continue;
    }
    const overlaps = blocks.filter(({ bounds }) => intersects(bounds, item.bounds));
    const target = overlaps.length === 1 && overlaps[0].kind === 'mc' ? overlaps[0] : null;
    const prior = target?.items.find((other) => sameRow(item, other));
    if (prior) {
      refined++;
      diagnostics.push({ id: target.id, row: prior.id, number: row.number, decision: row.decision, reasons: row.reasons });
      continue;
    }
    if ((overlaps.length && !target) || target?.items.some((other) => intersects(other.bounds, item.bounds))) {
      recordConflict(target?.bounds ?? item.bounds, 'The PSA MC row overlaps an existing response');
      continue;
    }
    const proposal = target
      ? { ...target, bounds: union(target.bounds, item.bounds), items: [...target.items, item].sort((a,b) => a.bounds.y - b.bounds.y) }
      : { id: `psa-mc-${added + 1}`, kind: 'mc', bounds: item.bounds, items: [item] };
    const next = target ? blocks.map((block) => block === target ? proposal : block) : [...blocks, proposal];
    if (!validBlocks(page, next)) {
      recordConflict(item.bounds, 'The PSA MC row could not be added to the current mapping');
      continue;
    }
    blocks = next;
    added++;
    diagnostics.push({ id: proposal.id, row: item.id, number: row.number, decision: row.decision, reasons: row.reasons, psaReview: true });
  }
  if (added) issues.add('psa-mc-review');
  if (conflicts) issues.add('psa-type-review');
  if (blocks.length) issues.delete('no-grid');
  // A block can have both layout diagnostics and per-row PSA evidence.
  const reviewIds = new Set(diagnostics.filter(({ psaReview }) => psaReview).map(({ id }) => id));
  return { ...numerical, components: orderBlocks(blocks), conflictRegions,
    diagnostics: diagnostics.map((d) => reviewIds.has(d.id) ? { ...d, psaReview: true } : d),
    issues: [...issues], status: issues.size ? 'review' : 'proposed',
    psa: { ...numerical.psa, mcAdded: added, mcRefined: refined, mcConflicts: conflicts, observations: mc.observations } };
}

export function startStructuredDiscovery(image, matrix, page, mcOnly) {
  const mc = new MCWorker();
  let nr;
  let canceled = false;
  const terminate = () => { canceled = true; mc.close(); nr?.close(); };
  const result = (async () => {
    try {
      const { pixels, width, height } = rectifiedRegion(image, matrix, { x: 0, y: 0, ...page }, pageScale);
      let numerical = { proposals: [] };
      if (!mcOnly) {
        nr = new NRWorker();
        await nr.init();
        numerical = await nr.discover(pixels.slice().buffer, width, height, { referenceWidth: Math.min(width, height) });
        nr.close();
        if (numerical.status !== 'ok') throw new Error('Numerical search limit reached');
      }
      if (canceled) throw new Error('Search canceled');
      await mc.init();
      const found = await mc.discover(pixels.buffer, width, height, numerical.proposals);
      return { mc: found, nr: numerical };
    } finally { terminate(); }
  })();
  return { result, terminate };
}
