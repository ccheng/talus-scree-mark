import { pageRingCandidates } from './profile-authoring.js';
import { quantile } from './omr-image.js';

// A translation can correct a local residual without allowing the matcher
// to move the template by a full row or choice pitch.
export function refineMcBlock(gray, matrix, page, block, allChoices) {
  const { bounds, items } = block;
  const choices = items.flatMap((item) => item.choices);
  if (items.length < 2 || choices.length < 6) return null;
  const maxRadius = Math.max(...choices.map(({ radius }) => radius));
  const pad = maxRadius * 3.5;
  const x = Math.max(0, bounds.x - pad);
  const y = Math.max(0, bounds.y - pad);
  const region = {
    x, y, width: Math.min(page.width, bounds.x + bounds.width + pad) - x,
    height: Math.min(page.height, bounds.y + bounds.height + pad) - y,
  };
  const outlines = pageRingCandidates(gray, matrix, page, {
    region, minRadius: Math.min(...choices.map(({ radius }) => radius)) * .55,
    maxRadius: maxRadius * 1.45, markedCenters: true, fineOutlines: true, limit: 240,
  });
  if (!outlines.length || outlines.length === 240) return null;
  const sites = items.flatMap(({ choices: row }, rowIndex) => row.map((choice, column) => ({
    choice, held: (rowIndex + column) % 3 === 0,
    limit: Math.min(choice.radius * 2.1, .40 * Math.min(...allChoices.filter((other) => other !== choice)
      .map((other) => Math.hypot(choice.x - other.x, choice.y - other.y)))),
  })));
  function match(candidates, dx, dy, allowance) {
    const pairs = [];
    for (const site of candidates) {
      const { x, y, radius } = site.choice;
      for (const outline of outlines) {
        const error = Math.hypot(outline.x - x - dx, outline.y - y - dy);
        if (error > allowance(site) || outline.radius < .60 * radius || outline.radius > 1.45 * radius) continue;
        pairs.push({ site, outline, error });
      }
    }
    pairs.sort((a, b) => a.error - b.error);
    const usedSites = new Set();
    const usedOutlines = new Set();
    return pairs.filter(({ site, outline }) => {
      if (usedSites.has(site) || usedOutlines.has(outline)) return false;
      usedSites.add(site);
      usedOutlines.add(outline);
      return true;
    });
  }
  const fit = match(sites.filter(({ held }) => !held), 0, 0, ({ limit }) => limit);
  if (fit.length < 3) return null;
  const dx = quantile(fit.map(({ site, outline }) => outline.x - site.choice.x), .5);
  const dy = quantile(fit.map(({ site, outline }) => outline.y - site.choice.y), .5);
  if (sites.some(({ limit }) => Math.hypot(dx, dy) > limit)) return null;
  const matched = match(sites, dx, dy, ({ choice }) => .60 * choice.radius);
  const held = matched.filter(({ site }) => site.held);
  const expected = sites.filter(({ held }) => held).length;
  if (held.length < Math.max(2, Math.ceil(expected * .65))) return null;
  // The unchanged response-geometry verifier checks every row and column
  // separately, including bubbles that are filled and lack a hollow center.
  return { dx, dy, held: held.length, expected };
}
