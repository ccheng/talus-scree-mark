import { grayAt } from '../omr-image.js';
import { project } from '../projective.js';

const step = .5;
const support = count => Math.ceil(count * .75);
const inside = ({ x, y }, r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

function windows(profile) {
  return profile.components.filter(block => block.kind === 'mc').flatMap(block => {
    const items = block.items.map(item => ({
      item, choices: [...item.choices].sort((a, b) => a.x - b.x),
    })).sort((a, b) => a.choices[0].y - b.choices[0].y);
    const first = items[0].choices;
    const gaps = first.slice(1).map((choice, index) => choice.x - first[index].x).sort((a, b) => a - b);
    const pitch = gaps[Math.floor(gaps.length / 2)];
    const separation = Math.min(Infinity, ...items.slice(1).map(({ choices }, index) => choices[0].y - items[index].choices[0].y));
    if (!(pitch >= 10 && pitch <= 65) || Math.abs(first[0].y - first.at(-1).y) > .15 * (first.at(-1).x - first[0].x)) return [];
    const header = first.filter(c => c.provenance !== 'inferred').map(c => {
      const top = c.y - 1.65 * pitch, bottom = c.y - c.radius - 3;
      return { kind: 'header', block: block.id, symbol: c.symbol, x: c.x, y: (top + bottom) / 2,
        rx: Math.min(13, pitch * .4), ry: (bottom - top) / 2 };
    });
    const left = [], right = [];
    for (const { item, choices } of items) {
      for (const [side, destination, endpoint] of [[-1, left, choices[0]], [1, right, choices.at(-1)]]) {
        if (endpoint.provenance === 'inferred') continue;
        destination.push({ kind: 'number', block: block.id, symbol: item.id, x: endpoint.x + side * pitch,
          y: endpoint.y, rx: Math.min(22, pitch * .6), ry: Math.min(7, separation * .44) });
      }
    }
    return [{ id: block.id, header, left, right, choiceCount: first.length, rowCount: items.length }];
  });
}

function locate(sample, window) {
  const { x, y, rx, ry } = window;
  if (ry < 2) return null;
  const background = [-1, 1].flatMap(dx => [-1, 1].map(dy => sample(x + dx * rx, y + dy * ry))).sort((a, b) => a - b);
  if (!background.every(Number.isFinite)) return null;
  const level = (background[1] + background[2]) / 2;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity, count = 0;
  for (let dy = -ry; dy <= ry; dy += step) for (let dx = -rx; dx <= rx; dx += step) {
    const value = sample(x + dx, y + dy);
    if (!Number.isFinite(value)) return null;
    if (level - value <= 65) continue;
    count++;
    left = Math.min(left, dx); right = Math.max(right, dx);
    top = Math.min(top, dy); bottom = Math.max(bottom, dy);
  }
  const width = right - left, height = bottom - top;
  const maxWidth = window.kind === 'header' ? 8 : 11.5;
  if (count < 5 || width < .5 || height < 2.5 || height > 8 || width > maxWidth ||
      left < -rx + step || right > rx - step || top < -ry + step || bottom > ry - step) return null;
  return { kind: window.kind, block: window.block, symbol: window.symbol, x: x + (left + right) / 2,
    y: y + (top + bottom) / 2 };
}

export function locateAdaptiveMcSites(gray, matrix, profile) {
  const sample = (x, y) => {
    const point = project(matrix, x, y);
    return point ? grayAt(gray, point.x, point.y) : NaN;
  };
  const bubbles = profile.components.flatMap(block => block.items.flatMap(item => item.choices ??
    item.slots.flatMap(slot => slot.choices)));
  const safe = site => !profile.exclusions?.some(r => inside(site, r)) && !bubbles.some(bubble =>
    Math.hypot(Math.max(0, Math.abs(bubble.x - site.x) - (site.kind === 'number' ? 6 : 4.25)),
      Math.max(0, Math.abs(bubble.y - site.y) - 4.25)) <= bubble.radius);
  const found = group => group.map(window => locate(sample, window)).filter(site => site && safe(site));
  return windows(profile).flatMap(({ header, left, right, choiceCount, rowCount }) => {
    const headers = found(header);
    const coherent = headers.length >= support(choiceCount) &&
      Math.max(...headers.map(h => h.y)) - Math.min(...headers.map(h => h.y)) <= 2;
    const sides = [found(left), found(right)].filter(sites => sites.length >= support(rowCount) &&
      Math.max(...sites.map(site => site.x)) - Math.min(...sites.map(site => site.x)) <= 8);
    return [...(coherent ? headers : []), ...(sides.length === 1 ? sides[0] : [])];
  });
}

export function plausibleAdaptiveMcSites(sites, profile) {
  if (!Array.isArray(sites)) return false;
  const byKey = new Map();
  for (const { header, left, right } of windows(profile)) for (const window of [...header, ...left, ...right]) {
    const key = JSON.stringify([window.block, window.kind, window.symbol]);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(window);
  }
  const matched = new Set();
  return sites.length <= byKey.size && sites.every(site => {
    const key = JSON.stringify([site?.block, site?.kind, site?.symbol]);
    if (matched.has(key) || !byKey.get(key)?.some(window =>
      Math.abs(window.x - site.x) <= window.rx && Math.abs(window.y - site.y) <= window.ry)) return false;
    matched.add(key);
    return !profile.exclusions?.some(r => inside(site, r));
  });
}
