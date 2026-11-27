import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessGeometry } from '../app/src/psa-registration/geometry.js';
import { project } from '../app/src/projective.js';

test('registration anchors correlate on both identical and translated pixels', () => {
  const components = ['top', 'middle', 'bottom'].map(id => ({ id }));
  const profile = { page: { width: 612, height: 792 }, components };
  const texture = (x, y) => {
    const seed = Math.imul(73856093, x) ^ Math.imul(19349663, y);
    return Math.imul(seed ^ (seed >>> 13), 1274126177) >>> 24;
  };
  const anchors = components.flatMap(({ id }, block) => [120, 230, 350, 480].map((x, index) => {
    const y = 170 + 170 * block + index * 30;
    const values = [];
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      values.push(texture(x + dx, y + dy));
    }
    return { block: id, x, y, heldOut: index === 3, values };
  }));
  for (const [dx, dy] of [[0, 0], [3, -2]]) {
    const assessed = assessGeometry(profile, anchors, (x, y) => texture(x - dx, y - dy));
    assert.equal(assessed.status, 'bounded-proposal');
    assert.deepEqual(assessed.coverage.map(({ matched }) => matched), [4, 4, 4]);
    assert.equal(assessed.heldOut, 3);
    assert.ok(assessed.maximumError < 1e-8);
    const center = project(assessed.correction, 300, 400);
    assert.ok(Math.hypot(center.x - 300 - dx, center.y - 400 - dy) < 1e-8);
  }
});
