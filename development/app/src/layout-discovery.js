import { checkProvisionalBlankPose, pageTransform, proposePageCorners, proposeWeakPageCorners } from './markerless-registration.js';
import { grayAt, quantile, toGrayImage } from './omr-image.js';
import { createMarkerlessProfile, intersects, pageRingCandidates } from './profile-authoring.js';
import { cross, project } from './projective.js';

export const discoveryVersion = 'printed-ring-lattices-1';
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function rowsOf(candidates) {
  const rows = [];
  for (const ring of [...candidates].sort((a, b) => a.y - b.y)) {
    const previous = rows.at(-1);
    if (previous && ring.y - previous.y <= 1.35) {
      previous.cells.push(ring);
      previous.y = previous.cells.reduce((sum, cell) => sum + cell.y, 0) / previous.cells.length;
    } else rows.push({ y: ring.y, cells: [ring] });
  }
  return rows;
}

function runsOf({ y, cells }) {
  const sorted = [...cells].sort((a, b) => a.x - b.x);
  const options = [];
  for (const [index, first] of sorted.entries()) {
    for (let j = index + 1; j < sorted.length; j++) {
      const next = sorted[j];
      const pitch = next.x - first.x;
      if (pitch > 45) break;
      if (pitch < Math.max(first.radius, next.radius) * 3 || Math.abs(first.radius - next.radius) > 1.05) continue;
      const run = [first, next];
      while (run.length < 13) {
        const x = first.x + run.length * pitch;
        const candidate = sorted.find((cell) => Math.abs(cell.x - x) <= Math.max(1.3, pitch * .075) &&
          Math.abs(cell.radius - first.radius) <= 1.05 && !run.includes(cell));
        if (!candidate) break;
        run.push(candidate);
      }
      options.push({ y, cells: run, pitch });
    }
  }
  return options;
}

function persists(a, b) {
  return a.cells.length === b.cells.length && a.cells.every((cell, i) =>
    Math.abs(cell.x - b.cells[i].x) <= 1.65 && Math.abs(cell.radius - b.cells[i].radius) <= 1.15);
}

function latticesOf(rings) {
  const bands = rowsOf(rings);
  const clusters = [];
  for (const band of bands) {
    for (const row of runsOf(band)) {
      const cluster = clusters.find(({ seed }) => persists(seed, row));
      if (!cluster) clusters.push({ seed: row, rows: [row] });
      else if (cluster.rows.at(-1).y < row.y - 1.3) cluster.rows.push(row);
    }
  }
  const candidates = [];
  for (const cluster of clusters) {
    const rows = cluster.rows;
    for (let start = 0; start + 1 < rows.length; start++) {
      const spacing = rows[start + 1].y - rows[start].y;
      if (spacing < 6 || spacing > 42) continue;
      let end = start + 2;
      while (end < rows.length && Math.abs(rows[end].y - rows[end - 1].y - spacing) <= Math.max(1.45, spacing * .13)) end++;
      const group = rows.slice(start, end);
      const columns = group[0].cells.length;
      if (columns === 2 && group.length < 3) continue;
      const cells = group.flatMap((row) => row.cells);
      candidates.push({ rows: group, columns, cells, spacing, pitch: cluster.seed.pitch });
    }
  }
  candidates.sort((a, b) => b.cells.length - a.cells.length || b.columns - a.columns);
  const used = new Set();
  const output = [];
  for (const candidate of candidates) {
    if (candidate.cells.some((cell) => used.has(cell))) continue;
    output.push(candidate);
    candidate.cells.forEach((cell) => used.add(cell));
  }
  return { output, used };
}

function enclosing(choices, page, padding = 2.6) {
  const x = Math.max(0, Math.min(...choices.map((choice) => choice.x - choice.radius - padding)));
  const y = Math.max(0, Math.min(...choices.map((choice) => choice.y - choice.radius - padding)));
  const right = Math.min(page.width, Math.max(...choices.map((choice) => choice.x + choice.radius + padding)));
  const bottom = Math.min(page.height, Math.max(...choices.map((choice) => choice.y + choice.radius + padding)));
  return { x, y, width: right - x, height: bottom - y };
}

function inkAt(gray, matrix, x, y) {
  const at = project(matrix, x, y);
  return at ? grayAt(gray, at.x, at.y) : NaN;
}

function writingBoxes(gray, matrix, grid) {
  if (grid.columns !== 4) return [];
  const { cells, y } = grid.rows[0];
  const sample = (x, top) => inkAt(gray, matrix, x, top) < 150;
  const hits = [];
  for (let line = y - 38 - grid.spacing; line <= y - 5; line += .55) {
    const horizontal = cells.every(({ x }) =>
      [-.23, -.12, 0, .12, .23].filter((u) => sample(x + u * grid.pitch, line)).length >= 4);
    if (horizontal) hits.push(line);
  }
  for (const top of hits) {
    for (const bottom of hits) {
      if (bottom - top < 7 || bottom - top > 25) continue;
      const checkSide = (x) => [.18, .34, .5, .66, .82].filter((fraction) => sample(x, top + fraction * (bottom - top))).length >= 4;
      const found = cells.map(({ x }, i) => {
        let left, right;
        for (let dx = grid.pitch * .28; dx <= grid.pitch * .53; dx += .35) {
          if (left === undefined && checkSide(x - dx)) left = x - dx;
          if (right === undefined && checkSide(x + dx)) right = x + dx;
        }
        return left === undefined || right === undefined ? null
          : { x: left, y: top, width: right - left, height: bottom - top, slot: i + 1 };
      });
      if (found.every(Boolean)) return found;
    }
  }
  return [];
}

function orderBlocks(blocks) {
  const remaining = [...blocks].sort((a, b) => a.bounds.y - b.bounds.y);
  const sorted = [];
  while (remaining.length) {
    const first = remaining.shift();
    const band = [first];
    for (let i = remaining.length - 1; i >= 0; i--) {
      const other = remaining[i];
      const a = first.bounds, b = other.bounds;
      const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      const separateColumns = a.x + a.width <= b.x || b.x + b.width <= a.x;
      if (separateColumns && overlap >= .40 * Math.min(a.height, b.height)) band.push(...remaining.splice(i, 1));
    }
    sorted.push(...band.sort((a, b) => a.bounds.x - b.bounds.x));
  }
  return sorted;
}

function publicCell(symbol, { x, y, radius }) {
  return { symbol, x, y, radius };
}

function excludePrintedLabels(rings) {
  // Small outlined characters inside, or immediately above, repeated
  // larger bubbles are labels. Check the same offset across the row before
  // discarding an above-bubble candidate from the geometry search.
  const contained = (small, large) => large.radius >= small.radius * 1.65 &&
    distance(small, large) < large.radius - small.radius * .5;
  return rings.filter((ring) => {
    if (rings.some((candidate) => contained(ring, candidate))) return false;
    const above = (small, large) => large.radius >= small.radius * 1.75 &&
      Math.abs(small.x - large.x) < large.radius * .45 && large.y - small.y > large.radius &&
      large.y - small.y < large.radius * 2.35;
    const anchor = rings.find((candidate) => above(ring, candidate));
    if (!anchor) return true;
    const offset = anchor.y - ring.y;
    const labels = rings.filter((candidate) => Math.abs(candidate.y - ring.y) < 1.3 &&
      Math.abs(candidate.radius - ring.radius) < .85 && rings.some((bubble) =>
        above(candidate, bubble) && Math.abs(bubble.y - candidate.y - offset) < 1.3));
    return labels.length < 3;
  });
}

function inspectBlankLayout(image, page, corners) {
  if (!Array.isArray(corners) || corners.length !== 4 || !corners.every((corner, index) =>
    cross(corner, corners[(index + 1) % 4], corners[(index + 2) % 4]) > 0)) {
    return { status: 'needs-corners', corners: [], components: [], issues: ['page-corners'] };
  }
  const matrix = pageTransform(page, corners);
  if (!matrix) return { status: 'needs-corners', corners: [], components: [], issues: ['page-corners'] };
  const gray = toGrayImage(image);
  const candidates = pageRingCandidates(gray, matrix, page, { printedCenters: true });
  if (candidates.length >= 1800) return { status: 'review', corners, components: [], issues: ['too-many-candidates'] };
  const rings = excludePrintedLabels(candidates);
  const { output, used } = latticesOf(rings);
  const observedGrids = output.map((grid) => {
    const boxHints = grid.columns === 4 && grid.rows.length >= 8 ? writingBoxes(gray, matrix, grid) : [];
    const nr = grid.columns === 4 && grid.rows.length >= 8 &&
      (boxHints.length === 4 || (grid.rows.length === 10 && grid.spacing <= grid.pitch * .60));
    const adjacent = (row, offset) => nr ? row.cells.map((choice) => rings.find((ring) => !used.has(ring) &&
      Math.abs(ring.x - choice.x) <= 1.5 && Math.abs(ring.y - row.y - offset) <= 1.5) ?? null) : [];
    const above = adjacent(grid.rows[0], -grid.spacing);
    const below = adjacent(grid.rows.at(-1), grid.spacing);
    const extras = [...above, ...below].filter(Boolean);
    for (const option of extras) used.add(option);
    const bounds = enclosing([...grid.cells, ...extras], page);
    return {
      ...grid, kind: nr ? 'nr' : 'mc', bounds, above, below, writingBoxes: boxHints,
      issues: nr && grid.rows.length !== 10 ? ['nr-symbol-count'] : [],
    };
  });
  const boxed = observedGrids.filter(({ writingBoxes }) => writingBoxes.length === 4);
  const proposals = observedGrids.filter(({ kind, cells }) => kind === 'nr' || !boxed.some(({ bounds }) =>
    cells.filter(({ x, y }) => x >= bounds.x - 9 && x <= bounds.x + bounds.width + 9 &&
      y >= bounds.y && y <= bounds.y + bounds.height).length > cells.length * .5));
  const unassigned = rings.filter((ring) => !used.has(ring));
  const issues = [];
  if (!proposals.length) issues.push('no-grid');
  if (proposals.some((proposal) => proposal.issues.length)) issues.push('unusual-nr-grid');
  const interrupted = proposals.some((proposal, index) => proposals.slice(0, index).some((other) => {
    if (proposal.kind !== 'mc' || other.kind !== 'mc' ||
        Math.abs(proposal.spacing - other.spacing) > Math.max(1.3, proposal.spacing * .13) ||
        !persists(proposal.rows[0], other.rows[0])) return false;
    const [above, below] = [proposal, other].sort((a, b) => a.rows[0].y - b.rows[0].y);
    const gap = below.rows[0].y - above.rows.at(-1).y;
    return gap > 0 && gap <= 2.65 * above.spacing;
  }));
  if (interrupted) issues.push('interrupted-grid');
  const typical = quantile(proposals.flatMap(({ cells }) => cells.map(({ radius }) => radius)), .50);
  // Printed labels also contain closed loops of bubble-like size. Require
  // repeated spacing before treating unmatched ink as an omitted response grid.
  const bubbleLike = unassigned.filter(({ radius }) => Math.abs(radius - typical) <= typical * .22);
  if (latticesOf(bubbleLike).used.size >= 6) issues.push('unassigned-print');
  // An interior unassigned ring on the same printed grid axes is more useful
  // evidence of a partial proposal than isolated printed character outlines.
  if (proposals.some((proposal) => unassigned.some((ring) => proposal.rows.some(({ y, cells }) =>
    Math.abs(ring.y - y) <= 1.3 && Math.abs(ring.radius - cells[0].radius) <= 1 &&
    (Math.abs(ring.x - cells[0].x + proposal.pitch) <= 1.5 || Math.abs(ring.x - cells.at(-1).x - proposal.pitch) <= 1.5))))) {
    issues.push('unassigned-near-grid');
  }
  let mcIndex = 0;
  let nrIndex = 0;
  const diagnostics = [];
  const components = orderBlocks(proposals).flatMap((proposal, index) => {
    const { kind, bounds, rows } = proposal;
    const id = `discovered-${index + 1}`;
    diagnostics.push({
      id, bounds, writingBoxes: proposal.writingBoxes, kind, cellCount: proposal.cells.length,
      mappingReview: kind === 'nr', issues: proposal.issues,
    });
    if (proposal.issues.length) return [];
    if (kind === 'mc') {
      const items = rows.map(({ cells }) => ({
        id: `MC${++mcIndex}`, kind, bounds: enclosing(cells, page, 1.25),
        choices: cells.map((cell, column) => publicCell(String.fromCharCode(65 + column), cell)),
      }));
      return [{ id, kind, bounds, items }];
    }
    const itemId = `NR${++nrIndex}`;
    const slots = [0, 1, 2, 3].map((slot) => ({
      id: `${itemId}.${slot + 1}`, choices: [
        ...(proposal.above[slot] ? [publicCell('.', proposal.above[slot])] : []),
        ...rows.map(({ cells }, row) => publicCell(String(row), cells[slot])),
        ...(proposal.below[slot] ? [publicCell(proposal.above[slot] ? '-' : '.', proposal.below[slot])] : []),
      ],
    }));
    return [{ id, kind, bounds, items: [{ id: itemId, kind, bounds, slots }] }];
  });
  if (components.some((item, i) => components.slice(0, i).some((other) => intersects(item.bounds, other.bounds)))) {
    return { status: 'review', corners, components: [], issues: [...issues, 'overlapping-grids'], diagnostics };
  }
  if (components.length) {
    try {
      createMarkerlessProfile({ id: 'proposal', name: 'Proposal', revision: 1, page, components });
    } catch {
      return { status: 'review', corners, components: [], issues: [...issues, 'invalid-grids'], diagnostics };
    }
  }
  return { status: issues.length ? 'review' : 'proposed', corners, components, issues, diagnostics };
}


function provisionalBlank(image, page, first) {
  // With no physical edges the exact paper origin is unobservable. Use a
  // same-aspect local coordinate frame and verify the visible layout against it.
  const scale = Math.min((image.width - 1) / page.width, (image.height - 1) / page.height);
  const left = (image.width - 1 - scale * page.width) / 2;
  const top = (image.height - 1 - scale * page.height) / 2;
  const corners = [{ x: left, y: top }, { x: left + scale * page.width, y: top },
    { x: left + scale * page.width, y: top + scale * page.height }, { x: left, y: top + scale * page.height }];
  const found = inspectBlankLayout(image, page, corners);
  const signatures = ({ components }) => JSON.stringify(components.map(({ kind, items }) =>
    [kind, items.map((item) => item.kind === 'mc' ? item.choices.map(({ symbol }) => symbol) :
      item.slots.map(({ choices }) => choices.map(({ symbol }) => symbol)))]));
  const coverage = new Set(found.components.map(({ bounds }) =>
    [bounds.x + bounds.width / 2 > page.width / 2, bounds.y + bounds.height / 2 > page.height / 2].join()));
  if (found.status !== 'proposed' || coverage.size < 3 || signatures(first) !== signatures(found)) {
    return { discarded: { reason: 'incomplete-or-inconsistent-visible-lattices', blocks: found.diagnostics ?? [] } };
  }
  const evidence = checkProvisionalBlankPose(toGrayImage(image), { page, components: found.components }, corners);
  if (evidence.discarded) return evidence;
  return { proposal: { ...found, corners: evidence.corners, pagePose: 'virtual-corners',
    poseDiagnostics: { ...evidence, frame: 'provisional', discarded: { reason: 'frame-aspect', corners: first.corners } } } };
}

export function discoverBlankLayout(image, page, suppliedCorners) {
  const provisional = suppliedCorners ?? proposePageCorners(image);
  const first = inspectBlankLayout(image, page, provisional);
  const fillsPhoto = provisional?.length === 4 && provisional[0].x === 0 && provisional[0].y === 0 &&
    provisional[2].x === image.width - 1 && provisional[2].y === image.height - 1;
  if (!suppliedCorners && fillsPhoto && Math.abs(image.width * page.height / (image.height * page.width) - 1) > .017) {
    first.status = 'review';
    first.issues.push('frame-aspect');
  }
  if (suppliedCorners || first.status === 'proposed') return first;
  const faint = proposeWeakPageCorners(image);
  if (faint && !(first.corners.length === 4 && faint.every((corner, index) => distance(corner, first.corners[index]) < 3))) {
    const recovered = inspectBlankLayout(image, page, faint);
    if (recovered.status === 'proposed') return { ...recovered, pagePose: 'faint-boundary' };
  }
  if (first.issues.includes('frame-aspect')) {
    const recovery = first.issues.length === 1 ? provisionalBlank(image, page, first) :
      { discarded: { reason: 'provisional-frame-has-incomplete-lattices', blocks: first.diagnostics ?? [] } };
    if (recovery.proposal) return recovery.proposal;
    return { ...first, components: [], diagnostics: [], pagePose: 'uncertain',
      poseDiagnostics: { discarded: recovery.discarded } };
  }
  return first;
}
