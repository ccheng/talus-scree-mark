import { pageRingCandidates } from './profile-authoring.js';
import { fitProjective, fitProjectiveSamples, project } from './projective.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// These correspondences propose a pose only. The caller still verifies that
// every enrolled response block exists and that the orientation is unique.
export function outlinePoseProposals(gray, profile, axisRatio = 1, shear = 0) {
  const { page, components } = profile;
  const blocks = components.map(({ items }) => items.flatMap((item) =>
    item.kind === 'mc' ? item.choices : item.slots.flatMap(({ choices }) => choices)));
  const choices = blocks.flat();
  const stride = Math.max(1, Math.ceil(choices.length / 96));
  const sample = choices.filter((_, index) => index % stride === 0);
  if (sample.length < 12) return [];
  const xs = sample.map(({ x }) => x);
  const ys = sample.map(({ y }) => y);
  if (Math.max(...xs) - Math.min(...xs) < page.width * .27 ||
      Math.max(...ys) - Math.min(...ys) < page.height * .27) return [];

  const scale = Math.max(page.width, page.height) / Math.max(gray.width, gray.height);
  const frame = { width: gray.width * scale, height: gray.height * scale };
  const observed = pageRingCandidates(gray, [1 / scale, 0, 0, 0, 1 / scale, 0, 0, 0, 1], frame,
    { minRadius: 1.6, maxRadius: 8, margin: 0, limit: 360 });
  if (observed.length < 12 || observed.length >= 360) return [];

  const binSize = 12;
  const bins = new Map();
  const binKey = (x, y) => y * 1_000 + x;
  for (const ring of observed) {
    const key = binKey(Math.floor(ring.x / binSize), Math.floor(ring.y / binSize));
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push(ring);
  }

  function neighbors(point, radius, tolerance, maxMatches = 1) {
    if (!point || point.x < -tolerance || point.y < -tolerance ||
        point.x > frame.width + tolerance || point.y > frame.height + tolerance) return [];
    const matches = [];
    let best = tolerance ** 2;
    for (let y = Math.floor((point.y - tolerance) / binSize); y <= Math.floor((point.y + tolerance) / binSize); y++) {
      for (let x = Math.floor((point.x - tolerance) / binSize); x <= Math.floor((point.x + tolerance) / binSize); x++) {
        const rings = bins.get(binKey(x, y));
        if (!rings) continue;
        for (const ring of rings) {
          if (ring.radius < radius * .55 || ring.radius > radius * 1.85) continue;
          const delta = (point.x - ring.x) ** 2 + (point.y - ring.y) ** 2;
          if (delta >= best) continue;
          if (maxMatches === 1) {
            best = delta;
            matches[0] = { ring, delta };
          } else {
            matches.push({ ring, delta });
            matches.sort((a, b) => a.delta - b.delta);
            if (matches.length > maxMatches) matches.pop();
            if (matches.length === maxMatches) best = matches.at(-1).delta;
          }
        }
      }
    }
    return matches;
  }
  const nearest = (point, radius, tolerance) => neighbors(point, radius, tolerance)[0];

  function associate(matrix, sites, tolerance, magnification) {
    const assigned = new Map();
    for (const choice of sites) {
      const match = nearest(project(matrix, choice.x, choice.y), choice.radius * magnification, tolerance);
      if (match && (assigned.get(match.ring)?.delta ?? Infinity) > match.delta) {
        assigned.set(match.ring, { ...match, choice });
      }
    }
    return [...assigned.values()];
  }

  function fit(matches) {
    return matches.length >= 12 &&
      fitProjectiveSamples(matches.map(({ choice }) => choice), matches.map(({ ring }) => ring));
  }

  // Use pairs near opposite ends of the printed response field. Multiple sites
  // per end tolerate an anchor ring being covered by a filled answer.
  const ranked = (direction) => [...choices].sort((a, b) =>
    (a.x - b.x) / page.width + direction * (a.y - b.y) / page.height);
  const pairs = [-1, 1].flatMap((direction) => {
    const ordered = ranked(direction);
    return [0, 2].flatMap((index) => [ordered.at(-1), ordered.at(-3)]
      .map((end) => [ordered[index], end]).filter(([start, end]) => distance(start, end) >= Math.min(page.width, page.height) * .32));
  });
  const scouts = sample.filter((_, index) => index % Math.max(1, Math.ceil(sample.length / 24)) === 0);
  // Alternate distant parts of the form to discard unrelated pair alignments early.
  const probeOrder = scouts.filter((_, index) => index % 4 === 0)
    .concat(scouts.filter((_, index) => index % 4 !== 0));
  const middle = { x: page.width / 2, y: page.height / 2 };
  const best = [];
  const coarseTolerance = Math.min(12, Math.max(6, Math.min(frame.width, frame.height) * .017));
  for (const mirrored of [false, true]) {
    const sign = mirrored ? -1 : 1;
    for (const [start, end] of pairs) {
      const dx = axisRatio * (end.x - start.x) + shear * (end.y - start.y);
      const dy = sign * (end.y - start.y);
      const span = dx ** 2 + dy ** 2;
      for (const first of observed) {
        for (const last of observed) {
          const u = last.x - first.x;
          const v = last.y - first.y;
          const ratio2 = (u ** 2 + v ** 2) / span;
          if (ratio2 < .14 || ratio2 > 1.44) continue;
          const a = (u * dx + v * dy) / span;
          const b = (v * dx - u * dy) / span;
          if (Math.min(Math.abs(a), Math.abs(b)) > .44 * Math.max(Math.abs(a), Math.abs(b))) continue;
          const magnification = Math.sqrt(ratio2);
          if (Math.abs(first.radius / start.radius - magnification) > magnification * .40 ||
              Math.abs(last.radius / end.radius - magnification) > magnification * .40) continue;
          const xShear = a * shear - sign * b;
          const yShear = b * shear + sign * a;
          const matrix = [axisRatio * a, xShear, first.x - axisRatio * a * start.x - xShear * start.y,
            axisRatio * b, yShear, first.y - axisRatio * b * start.x - yShear * start.y, 0, 0, 1];
          let count = 0;
          let score = 0;
          for (const [index, choice] of probeOrder.entries()) {
            if (index === Math.ceil(scouts.length / 4) && count < 2) break;
            const match = nearest(project(matrix, choice.x, choice.y), choice.radius * magnification, coarseTolerance);
            if (!match) continue;
            count++;
            score += 1 - .6 * match.delta / coarseTolerance ** 2;
          }
          if (count < scouts.length * .35) continue;
          const center = project(matrix, middle.x, middle.y);
          const turn = (Math.round(Math.atan2(b, a) / (Math.PI / 2)) + 4) % 4;
          const nearby = best.findIndex((entry) => entry.mirrored === mirrored && entry.turn === turn &&
            distance(entry.center, center) < coarseTolerance * .45 && Math.abs(entry.magnification - magnification) < .025);
          if (nearby >= 0 && best[nearby].score >= score) continue;
          if (nearby >= 0) best.splice(nearby, 1);
          best.push({ matrix, score, magnification, center, turn, mirrored });
          best.sort((a, b) => b.score - a.score);
          if (best.length > 48) best.pop();
        }
      }
    }
  }

  let randomState = 12345;
  function select(entries) {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return entries[(randomState >>> 0) % entries.length];
  }

  function robustSeed(matrix, magnification) {
    const sorted = sample.map((choice) => ({
      choice, readings: neighbors(project(matrix, choice.x, choice.y), choice.radius * magnification, coarseTolerance * 1.35, 3),
    })).filter(({ readings }) => readings.length);
    const regions = [
      sorted.filter(({ choice }) => choice.x < middle.x && choice.y < middle.y),
      sorted.filter(({ choice }) => choice.x >= middle.x && choice.y < middle.y),
      sorted.filter(({ choice }) => choice.x >= middle.x && choice.y >= middle.y),
      sorted.filter(({ choice }) => choice.x < middle.x && choice.y >= middle.y),
    ];
    if (regions.some((region) => region.length < 2)) return matrix;

    let highest = associate(matrix, sample, magnification * 1.85, magnification).length;
    let candidate = matrix;
    for (let iteration = 0; iteration < 144; iteration++) {
      const picks = regions.map(select);
      const fit = fitProjective(picks.map(({ choice }) => choice), picks.map(({ readings }) =>
        (iteration % 3 === 0 ? readings[0] : select(readings)).ring));
      if (!fit) continue;
      const score = associate(fit, sample, magnification * 1.85, magnification).length;
      if (score > highest) { highest = score; candidate = fit; }
    }
    return candidate;
  }

  return best.flatMap(({ matrix, magnification, mirrored }, index) => {
    const proposed = index < 18 ? robustSeed(matrix, magnification) : matrix;
    const tolerances = proposed === matrix ? [coarseTolerance, coarseTolerance * .55, coarseTolerance * .26] : [magnification * 2.3, magnification * 1.6];
    matrix = proposed;
    for (const tolerance of tolerances) {
      matrix = fit(associate(matrix, sample, tolerance, magnification));
      if (!matrix) return [];
    }
    const witnesses = associate(matrix, sample, Math.min(1.7, magnification * 2), magnification);
    const holdout = witnesses.filter((_, index) => index % 3 === 0);
    const training = witnesses.filter((_, index) => index % 3 !== 0);
    const trained = fit(training);
    if (!trained || holdout.some(({ ring, choice }) => {
      const estimate = project(trained, choice.x, choice.y);
      return !estimate || distance(ring, estimate) > Math.max(.9, magnification * choice.radius * .48);
    })) return [];
    const final = fit(witnesses);
    if (!final) return [];
    return [{ transform: final.map((value, index) => index < 6 ? value / scale : value), mirrored }];
  });
}
