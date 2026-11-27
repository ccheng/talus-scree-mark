const limit = 3;
const priority = Object.freeze({ structural: 0, 'possible-row': 1, print: 2 });

function footprintRegion(row) {
  const left = Math.min(...row.choices.map(c => c.x - c.radius));
  const top = Math.min(...row.choices.map(c => c.y - c.radius));
  const right = Math.max(...row.choices.map(c => c.x + c.radius));
  const bottom = Math.max(...row.choices.map(c => c.y + c.radius));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function addRegion(regions, category, reason, bounds) {
  if (!bounds) return;
  const prior = regions.find(region => category === region.category && reason === region.reason &&
    bounds.x <= region.bounds.x + region.bounds.width + 4 && bounds.x + bounds.width + 4 >= region.bounds.x &&
    bounds.y <= region.bounds.y + region.bounds.height + 4 && bounds.y + bounds.height + 4 >= region.bounds.y);
  if (!prior) {
    regions.push({ category, reason, bounds });
    return;
  }
  const x = Math.min(bounds.x, prior.bounds.x), y = Math.min(bounds.y, prior.bounds.y);
  const right = Math.max(bounds.x + bounds.width, prior.bounds.x + prior.bounds.width);
  const bottom = Math.max(bounds.y + bounds.height, prior.bounds.y + prior.bounds.height);
  prior.bounds = { x, y, width: right - x, height: bottom - y };
}

export function teacherIntervention(established, shadow, profile) {
  if (established.status !== 'read') {
    const reasons = established.registration.reasons;
    const regions = established.registration.diagnostics?.responseGeometry?.blocks?.filter(block => !block.verified)
      .flatMap(block => {
        const part = profile?.components?.find(part => part.id === block.id);
        return part ? [{ category: 'structural', reason: 'response-geometry', bounds: part.bounds }] : [];
      }) ?? [];
    return { action: reasons.includes('batch-not-confirmed') ? 'confirm-batch' : 'retake',
      reasons, regions: regions.slice(0, limit), additionalRegions: Math.max(0, regions.length - limit),
      canSetCorners: established.registration.canSetCorners === true };
  }

  const structure = shadow.structure;
  const regions = [];
  const unknown = new Set(structure?.unknown ?? []);
  for (const row of structure?.rows ?? []) {
    if (unknown.has(row.id)) addRegion(regions, 'structural', 'unclassified-structure', footprintRegion(row));
  }
  const seenAmbiguity = new Set((structure?.ambiguityInventory?.previouslyObserved ?? []).map(entry => entry.observed));
  for (const row of structure?.ambiguous ?? []) {
    if (!seenAmbiguity.has(row.id)) addRegion(regions, 'structural', 'competing-associations', footprintRegion(row));
  }
  const novelPairs = new Set(structure?.pairInventory?.novel ?? []);
  for (const row of structure?.tentativePairs ?? []) {
    if (novelPairs.has(row.id)) addRegion(regions, 'possible-row', 'tentative-two-ring-pattern', footprintRegion(row));
  }

  for (const site of shadow.mc?.sites ?? []) {
    if (site.status !== 'mismatch') continue;
    const width = site.kind === 'header' ? 9 : 12;
    addRegion(regions, 'print', 'local-print-difference', { x: site.x - width / 2, y: site.y - 4.25, width, height: 8.5 });
  }

  const block = profile?.components?.find(part => part.items?.some(item => item.id === structure?.row));
  if (block) addRegion(regions, 'structural', structure.reason, block.bounds);
  regions.sort((a, b) => priority[a.category] - priority[b.category]);
  return { action: regions.length ? 'inspect-if-needed' : 'follow-established',
    regions: regions.slice(0, limit), additionalRegions: Math.max(0, regions.length - limit),
    establishedReviewItems: established.items.filter(item => item.review).length,
    pairReferenceIncomplete: structure?.pairInventory?.status === 'incomplete',
    diagnosticOnly: true };
}
