import { validateAlbertaMapping } from './alberta-nr-grid.js';
import { orderBlocks } from './layout-discovery.js';
import { intersects } from './profile-authoring.js';
import { grayAt, toGrayImage } from './omr-image.js';
import { project } from './projective.js';
import { NRWorker } from './psa-nr/worker-client.js';

const regionScale = 3;
const pageScale = 2.4;

function rectifiedRegion(image, matrix, region, scale) {
  const width = Math.ceil(region.width * scale);
  const height = Math.ceil(region.height * scale);
  const source = toGrayImage(image);
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const point = project(matrix, region.x + x / scale, region.y + y / scale);
      const gray = point && grayAt(source, point.x, point.y);
      pixels[y * width + x] = Number.isFinite(gray) ? Math.round(gray) : 255;
    }
  }
  return { pixels, width, height };
}

export function mapPsaGrid({ proposals }, region) {
  const candidates = proposals.filter(({ decision, centers, decimals }) =>
    (decision === 'accept' || decision === 'review') && centers?.length === 40 && decimals?.length === 2);
  if (candidates.length !== 1 || !verifiedStructure(candidates[0])) return null;
  const slots = gridSlots(candidates[0], region, regionScale);
  validateAlbertaMapping(slots, region);
  return slots;
}

function verifiedStructure({ completeOutlines, evidence }) {
  return completeOutlines === true && Number.isFinite(evidence?.svm_margin) && evidence.svm_margin >= 0;
}

function gridSlots({ centers, decimals, rasterShape, decision }, region, scale) {
  const radius = Math.min(...(rasterShape ?? [])) / scale;
  return Array.from({ length: 4 }, (_, column) => {
    const choice = ([x, y], symbol) => ({
      x: region.x + x / scale,
      y: region.y + y / scale,
      radius, symbol, observed: decision === 'accept',
    });
    const choices = Array.from({ length: 10 }, (_, row) => choice(centers[row * 4 + column], String(row)));
    if (column === 1 || column === 2) choices.unshift(choice(decimals[column - 1], '.'));
    return { choices };
  });
}

const hasGrid = ({ centers, decimals, rasterShape }) =>
  centers?.length === 40 && decimals?.length === 2 && rasterShape?.length === 2;

export function pagePsaProposals({ proposals }, page) {
  return proposals.filter(hasGrid).flatMap((proposal, index) => {
    const slots = gridSlots(proposal, { x: 0, y: 0 }, pageScale);
    const choices = slots.flatMap((slot) => slot.choices);
    const x = Math.max(0, Math.min(...choices.map((cell) => cell.x - cell.radius)) - 1);
    const y = Math.max(0, Math.min(...choices.map((cell) => cell.y - cell.radius)) - 1);
    const right = Math.min(page.width, Math.max(...choices.map((cell) => cell.x + cell.radius)) + 1);
    const bottom = Math.min(page.height, Math.max(...choices.map((cell) => cell.y + cell.radius)) + 1);
    const bounds = { x, y, width: right - x, height: bottom - y };
    try { validateAlbertaMapping(slots, bounds); }
    catch { return []; }
    const id = `psa-nr-${index + 1}`;
    const item = { id: `NR${index + 1}`, kind: 'nr', bounds,
      slots: slots.map(({ choices }, i) => ({
        id: `NR${index + 1}.${i + 1}`, choices: choices.map(({ observed, ...choice }) => choice),
      })),
    };
    return [{
      block: { id, kind: 'nr', bounds, items: [item] },
      usable: ['accept', 'review'].includes(proposal.decision) && verifiedStructure(proposal),
      needsReview: proposal.decision === 'review',
    }];
  });
}

function sameGrid(a, b) {
  const choices = (block) => block.items.flatMap(({ slots }) => slots.flatMap((slot) => slot.choices));
  const first = choices(a);
  const second = choices(b);
  return first.filter((cell) => second.some((other) =>
    Math.hypot(cell.x - other.x, cell.y - other.y) <= Math.min(cell.radius, other.radius))).length >= 32;
}

export function reconcilePsaPage(result, psa, exclusions) {
  const candidates = psa.filter(({ block }) => !exclusions.some((zone) => intersects(zone, block.bounds)));
  const matched = new Set();
  const added = [];
  const diagnostics = [...(result.diagnostics ?? [])];
  let conflicts = 0;
  let reviewCount = 0;

  for (const { block, usable, needsReview } of candidates) {
    const overlap = result.components.filter((existing) => intersects(existing.bounds, block.bounds));
    const equivalents = overlap.filter((existing) => existing.kind === 'nr' && sameGrid(block, existing));
    const competing = candidates.some((other) => other.block !== block && intersects(other.block.bounds, block.bounds));
    if (!usable) {
      // A localized PSA disagreement requires review instead of silently falling back to the same NR grid.
      if (equivalents.length) {
        equivalents.forEach((existing) => matched.add(existing));
        conflicts++;
      }
      continue;
    }
    if (competing || overlap.length !== equivalents.length || equivalents.length > 1) {
      conflicts++;
      continue;
    }
    equivalents.forEach((existing) => matched.add(existing));
    added.push(block);
    if (needsReview) reviewCount++;
    const previous = diagnostics.find(({ id }) => id === equivalents[0]?.id);
    diagnostics.push({ ...previous, id: block.id, bounds: block.bounds, kind: 'nr', mappingReview: needsReview, psaReview: needsReview });
  }

  const components = orderBlocks([...result.components.filter((block) => !matched.has(block)), ...added]);
  const issues = result.issues.filter((issue) => issue !== 'no-grid' || !components.length);
  if (conflicts) issues.push('psa-conflicting-grids');
  if (reviewCount) issues.push('psa-provisional-grids');
  return { ...result, status: issues.length ? 'review' : 'proposed', components, issues, diagnostics,
    psa: { added: added.length, reviewCount, conflicts } };
}

function startSearch(image, matrix, region, page, scale, map) {
  const worker = new NRWorker();
  const result = (async () => {
    try {
      await worker.init();
      const { pixels, width, height } = rectifiedRegion(image, matrix, region, scale);
      const output = await worker.discover(pixels.buffer, width, height,
        { referenceWidth: Math.min(page.width, page.height) * scale });
      return map(output);
    } finally {
      worker.close();
    }
  })();
  return { result, terminate: () => worker.close() };
}

export function startPsaDiscovery(image, matrix, region, page) {
  return startSearch(image, matrix, region, page, regionScale, (result) => mapPsaGrid(result, region));
}

export function startPsaPageDiscovery(image, matrix, page) {
  const region = { x: 0, y: 0, width: page.width, height: page.height };
  return startSearch(image, matrix, region, page, pageScale, (result) => {
    if (result.status !== 'ok') throw new Error('Search limit reached');
    return pagePsaProposals(result, page);
  });
}
