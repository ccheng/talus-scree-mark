import { checkProvisionalBlankPose, pageTransform, proposePageCorners, proposeWeakPageCorners } from './markerless-registration.js';
import { grayAt, quantile, toGrayImage } from './omr-image.js';
import { createMarkerlessProfile, intersects, pageRingCandidates } from './profile-authoring.js';
import { cross, project } from './projective.js';

export const discoveryVersion = 'printed-ring-lattices-3';
const maxColumnPitch = 45;
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

function runsOf({ y, cells }, refinePitch) {
  const sorted = [...cells].sort((a, b) => a.x - b.x);
  const options = [];
  for (const [index, first] of sorted.entries()) {
    for (let j = index + 1; j < sorted.length; j++) {
      const next = sorted[j];
      const pitch = next.x - first.x;
      if (pitch > maxColumnPitch) break;
      if (pitch < Math.max(first.radius, next.radius) * 3 || Math.abs(first.radius - next.radius) > 1.05) continue;
      const run = [first, next];
      while (run.length < 13) {
        // After another outline agrees, use the span of all observed
        // columns so quantization of the first interval doesn't accumulate.
        const step = refinePitch ? (run.at(-1).x - first.x) / (run.length - 1) : pitch;
        const x = first.x + run.length * step;
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

function latticesOf(rings, refinePitch = false) {
  const bands = rowsOf(rings);
  const clusters = [];
  for (const band of bands) {
    for (const row of runsOf(band, refinePitch)) {
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
      // A header-shaped row can align with one real row at the wrong
      // pitch. Rank that pair below rows whose spacing repeats, including
      // across one intentionally empty interval between MC groups.
      const support = rows.filter(({ y }) => {
        const steps = Math.round((y - group[0].y) / spacing);
        return Math.abs(y - group[0].y - steps * spacing) <= Math.max(1.45, spacing * .13);
      }).length;
      candidates.push({ rows: group, columns, cells, spacing, pitch: cluster.seed.pitch, support });
    }
  }
  // Directly observed runs outrank extrapolated support across gaps. Use
  // the latter to choose between equally complete fragments before joining.
  candidates.sort((a, b) => b.cells.length - a.cells.length ||
    b.support * b.columns - a.support * a.columns || b.columns - a.columns);
  const used = new Set();
  const output = [];
  for (const candidate of candidates) {
    if (candidate.cells.some((cell) => used.has(cell))) continue;
    output.push(candidate);
    candidate.cells.forEach((cell) => used.add(cell));
  }
  return { output, used };
}

function albertaGrids(rings) {
  const bands = rowsOf(rings).map((band) => ({ ...band, cells: band.cells.sort((a, b) => a.x - b.x) }));
  const candidates = [];
  for (const [index, { y, cells }] of bands.entries()) {
    for (const [column, left] of cells.entries()) {
      const right = cells[column + 1];
      if (!right) continue;
      const pitch = right.x - left.x;
      const radius = (left.radius + right.radius) / 2;
      // The boxes aren't reliable under all captures. Adjacent decimal
      // outlines must be distinct, with space beyond their combined radii.
      if (pitch < left.radius + right.radius + .65 || pitch > maxColumnPitch ||
          Math.abs(left.radius - right.radius) > radius * .25) continue;
      const tolerance = Math.min(pitch * .18, Math.max(1.4, radius * .40));
      const match = (band, x) => band.cells.find((ring) => Math.abs(ring.x - x) <= tolerance &&
        Math.abs(ring.radius - radius) <= radius * .28);
      if (match(bands[index], left.x - pitch) || match(bands[index], right.x + pitch)) continue;
      const xs = [left.x - pitch, left.x, right.x, right.x + pitch];
      const rows = [];
      let spacing;
      for (const band of bands.slice(index + 1)) {
        const gap = band.y - (rows.at(-1)?.y ?? y);
        if (gap > (spacing ? spacing * 1.19 + .8 : pitch * 1.6)) break;
        const matched = xs.map((x) => match(band, x));
        if (!matched.some(Boolean)) continue;
        if (!matched.every(Boolean)) break;
        if (rows.length === 1) {
          if (gap < 1.75 * radius || gap > pitch * 1.5 || rows[0].y - y < gap * .54) break;
          spacing = gap;
        } else if (spacing && gap < spacing * .81 - .8) break;
        rows.push({ y: band.y, cells: matched });
        if (rows.length === 10) break;
      }
      if (rows.length >= 8) candidates.push({
        rows, columns: 4, cells: rows.flatMap((row) => row.cells), spacing, pitch,
        above: [null, left, right, null], below: [], kind: 'nr',
        issues: rows.length === 10 ? [] : ['nr-symbol-count'],
      });
    }
  }
  return candidates;
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
  // Alberta forms may use one tall strip with shared dividers rather than
  // four short separate boxes. Scale the search to the printed column pitch.
  const maxHeight = Math.max(25, Math.min(48, grid.pitch * 2));
  for (let line = y - 13 - grid.spacing - maxHeight; line <= y - 5; line += .55) {
    const horizontal = cells.every(({ x }) =>
      [-.23, -.12, 0, .12, .23].filter((u) => sample(x + u * grid.pitch, line)).length >= 4);
    if (horizontal) hits.push(line);
  }
  for (const top of hits) {
    for (const bottom of hits) {
      if (bottom - top < 7 || bottom - top > maxHeight) continue;
      const checkSide = (x) => [.18, .34, .5, .66, .82].filter((fraction) => sample(x, top + fraction * (bottom - top))).length >= 4;
      const found = cells.map(({ x }, i) => {
        let left, right;
        for (let dx = grid.pitch * .28; dx <= grid.pitch * .58; dx += .35) {
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

function joinMcGroups(proposals, unassigned, page) {
  const blocks = [];
  let interrupted = false;
  for (const proposal of [...proposals].sort((a, b) => a.rows[0].y - b.rows[0].y)) {
    const first = proposal.rows[0];
    const previous = proposal.kind === 'mc' && blocks.findLast((other) => {
      if (other.kind !== 'mc' || !persists(first, other.rows[0]) ||
          Math.abs(proposal.spacing - other.spacing) > Math.max(1.3, proposal.spacing * .13)) return false;
      const gap = first.y - other.rows.at(-1).y;
      return gap > 0 && gap <= 2.65 * other.spacing;
    });
    if (!previous) {
      blocks.push(proposal);
      continue;
    }
    const hasPartialRow = unassigned.some((ring) =>
      ring.y > previous.rows.at(-1).y + 1.35 && ring.y < first.y - 1.35 &&
      first.cells.some((cell) => Math.abs(cell.x - ring.x) <= 1.65 && Math.abs(cell.radius - ring.radius) <= 1.15));
    if (hasPartialRow || proposal.columns < 4 || proposal.columns > 5) {
      interrupted = true;
      blocks.push(proposal);
      continue;
    }
    previous.rows = [...previous.rows, ...proposal.rows];
    previous.cells = [...previous.cells, ...proposal.cells];
    previous.bounds = enclosing(previous.cells, page);
  }
  return { blocks, interrupted };
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

function numericalBlock(id, itemId, bounds, { rows, above, below }) {
  const slots = [0, 1, 2, 3].map((slot) => ({
      id: `${itemId}.${slot + 1}`, choices: [
        ...(above[slot] ? [publicCell('.', above[slot])] : []),
        ...rows.map(({ cells }, row) => publicCell(String(row), cells[slot])),
        ...(below[slot] ? [publicCell(above[slot] ? '-' : '.', below[slot])] : []),
      ],
    }));
  return { id, kind: 'nr', bounds, items: [{ id: itemId, kind: 'nr', bounds, slots }] };
}

export function discoverBoxedAlberta(image, matrix, page, region) {
  const rings = excludePrintedLabels(pageRingCandidates(toGrayImage(image), matrix, page,
    { printedCenters: true, maxRadius: 8.6, fineOutlines: true, region }));
  const grids = albertaGrids(rings);
  if (grids.length !== 1) return { count: grids.length };
  const [grid] = grids;
  if (grid.issues.length) return { count: 1, incomplete: true };
  const bounds = enclosing([...grid.cells, ...grid.above.filter(Boolean)], page);
  return { count: 1, block: numericalBlock('boxed-nr', 'NR1', bounds, grid) };
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

function inspectBlankLayout(image, page, corners, { exclusions = [], scope } = {}) {
  if (!Array.isArray(corners) || corners.length !== 4 || !corners.every((corner, index) =>
    cross(corner, corners[(index + 1) % 4], corners[(index + 2) % 4]) > 0)) {
    return { status: 'needs-corners', corners: [], components: [], issues: ['page-corners'] };
  }
  const matrix = pageTransform(page, corners);
  if (!matrix) return { status: 'needs-corners', corners: [], components: [], issues: ['page-corners'] };
  const gray = toGrayImage(image);
  const options = { printedCenters: true, maxRadius: 8, exclusions };
  const candidates = pageRingCandidates(gray, matrix, page, options);
  if (candidates.length >= 1800) return { status: 'review', corners, components: [], issues: ['too-many-candidates'] };
  const fine = pageRingCandidates(gray, matrix, page, { ...options, maxRadius: 8.6, fineOutlines: true });
  if (fine.length >= 1800) return { status: 'review', corners, components: [], issues: ['too-many-candidates'] };
  const alberta = albertaGrids(excludePrintedLabels(fine));
  const usedAlberta = alberta.flatMap(({ cells, above }) => [...cells, ...above.filter(Boolean)]);
  const rings = excludePrintedLabels(candidates).filter((ring) =>
    !usedAlberta.some((cell) => distance(ring, cell) <= 1.8));
  const { output, used } = latticesOf(rings, scope === 'mc-only');
  const observedGrids = [...alberta, ...output].map((grid) => {
    if (grid.kind === 'nr') return {
      ...grid, bounds: enclosing([...grid.cells, ...grid.above.filter(Boolean)], page),
      writingBoxes: writingBoxes(gray, matrix, grid),
    };
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
  const filtered = observedGrids.filter(({ kind, cells }) => kind === 'nr' || !boxed.some(({ bounds }) =>
    cells.filter(({ x, y }) => x >= bounds.x - 9 && x <= bounds.x + bounds.width + 9 &&
      y >= bounds.y && y <= bounds.y + bounds.height).length > cells.length * .5));
  const unassigned = rings.filter((ring) => !used.has(ring));
  const { blocks, interrupted } = joinMcGroups(filtered, unassigned, page);
  const outsideExclusions = blocks.filter(({ bounds }) => !exclusions.some((zone) => intersects(bounds, zone)));
  const proposals = outsideExclusions.filter(({ kind, columns }) =>
    scope !== 'mc-only' || (kind === 'mc' && (columns === 4 || columns === 5)));
  const issues = [];
  if (!proposals.length) issues.push('no-grid');
  if (outsideExclusions.some(({ kind, columns }) => scope === 'mc-only' && kind === 'mc' && columns !== 4 && columns !== 5)) {
    issues.push('check-mc-choice-counts');
  }
  if (proposals.some((proposal) => proposal.issues.length)) issues.push('unusual-nr-grid');
  if (interrupted) issues.push('interrupted-grid');
  const typical = quantile(proposals.flatMap(({ cells }) => cells.map(({ radius }) => radius)), .50);
  // Printed labels also contain closed loops of bubble-like size. Require
  // repeated spacing before treating unmatched ink as an omitted response grid.
  const bubbleLike = unassigned.filter(({ radius }) => Math.abs(radius - typical) <= typical * .22);
  if (latticesOf(bubbleLike).used.size >= 6) issues.push('unassigned-print');
  // An interior unassigned ring on the same printed grid axes is more useful
  // evidence of a partial proposal than isolated printed character outlines.
  if (proposals.some(({ rows, pitch, spacing, columns }) => [-1, 1].some((side) => {
    const unmatched = rows.filter(({ y, cells }) => {
      const edge = side < 0 ? cells[0] : cells.at(-1);
      return unassigned.some((ring) => Math.abs(ring.y - y) <= 1.3 &&
        Math.abs(ring.radius - edge.radius) <= Math.min(1, edge.radius * .22) &&
        Math.abs(ring.x - edge.x - side * pitch) <= 1.5);
    });
    return columns < 4 ? unmatched.length > 0 : unmatched.some(({ y }, i) =>
      i > 0 && y - unmatched[i - 1].y <= spacing * 1.25);
  }))) issues.push('unassigned-near-grid');
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
    return [numericalBlock(id, itemId, bounds, proposal)];
  });
  const conflicted = new Set();
  for (const [i, component] of components.entries()) {
    for (const other of components.slice(0, i)) {
      if (!intersects(component.bounds, other.bounds)) continue;
      conflicted.add(component);
      conflicted.add(other);
    }
  }
  const independent = components.filter((component) => !conflicted.has(component));
  if (conflicted.size) issues.push('overlapping-grids');
  if (independent.length) {
    try {
      createMarkerlessProfile({ id: 'proposal', name: 'Proposal', revision: 1, page, components: independent });
    } catch {
      return { status: 'review', corners, components: [], issues: [...issues, 'invalid-grids'], diagnostics };
    }
  }
  return { status: issues.length ? 'review' : 'proposed', corners, components: independent, issues, diagnostics };
}


function provisionalBlank(image, page, first, options) {
  // With no physical edges the exact paper origin is unobservable. Use a
  // same-aspect local coordinate frame and verify the visible layout against it.
  const scale = Math.min((image.width - 1) / page.width, (image.height - 1) / page.height);
  const left = (image.width - 1 - scale * page.width) / 2;
  const top = (image.height - 1 - scale * page.height) / 2;
  const corners = [{ x: left, y: top }, { x: left + scale * page.width, y: top },
    { x: left + scale * page.width, y: top + scale * page.height }, { x: left, y: top + scale * page.height }];
  const found = inspectBlankLayout(image, page, corners, options);
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

export function discoverBlankLayout(image, page, suppliedCorners, options) {
  const provisional = suppliedCorners ?? proposePageCorners(image);
  const first = inspectBlankLayout(image, page, provisional, options);
  const fillsPhoto = provisional?.length === 4 && provisional[0].x === 0 && provisional[0].y === 0 &&
    provisional[2].x === image.width - 1 && provisional[2].y === image.height - 1;
  if (!suppliedCorners && fillsPhoto && Math.abs(image.width * page.height / (image.height * page.width) - 1) > .017) {
    first.status = 'review';
    first.issues.push('frame-aspect');
  }
  if (suppliedCorners || first.status === 'proposed') return first;
  const faint = proposeWeakPageCorners(image);
  if (faint && !(first.corners.length === 4 && faint.every((corner, index) => distance(corner, first.corners[index]) < 3))) {
    const recovered = inspectBlankLayout(image, page, faint, options);
    if (recovered.status === 'proposed') return { ...recovered, pagePose: 'faint-boundary' };
  }
  if (first.issues.includes('frame-aspect')) {
    const recovery = first.issues.length === 1 ? provisionalBlank(image, page, first, options) :
      { discarded: { reason: 'provisional-frame-has-incomplete-lattices', blocks: first.diagnostics ?? [] } };
    if (recovery.proposal) return recovery.proposal;
    return { ...first, components: [], diagnostics: [], pagePose: 'uncertain',
      poseDiagnostics: { discarded: recovery.discarded } };
  }
  return first;
}
