import assert from 'node:assert/strict';
import { test } from 'node:test';
import { proposePageCorners } from '../app/src/markerless-registration.js';
import { cross } from '../app/src/projective.js';

test('markerless corner proposal refines perspective edges at native resolution', () => {
  const width = 900;
  const height = 1200;
  const corners = [
    { x: 83.3, y: 54.8 }, { x: 791.4, y: 68.1 },
    { x: 749.3, y: 1100.6 }, { x: 52.4, y: 1083.8 },
  ];
  const lengths = corners.map((a, i) => {
    const b = corners[(i + 1) % 4];
    return Math.hypot(b.x - a.x, b.y - a.y);
  });
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const distance = Math.min(...corners.map((a, i) => cross(a, corners[(i + 1) % 4], { x, y }) / lengths[i]));
      const value = 50 + 190 * Math.min(1, Math.max(0, (distance + 1) / 2));
      const start = (y * width + x) * 4;
      pixels.fill(value, start, start + 3);
      pixels[start + 3] = 255;
    }
  }
  const proposed = proposePageCorners({ width, height, pixels });
  assert.equal(proposed?.length, 4);
  for (const [i, point] of proposed.entries()) {
    assert(Math.hypot(point.x - corners[i].x, point.y - corners[i].y) < 1.15);
  }
});
