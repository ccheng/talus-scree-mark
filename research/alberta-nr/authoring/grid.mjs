import { manualGrid, validBounds } from '../../../app/src/profile-authoring.js';

export function teacherGrid(anchors, region, retained = []) {
  const [topLeft, topRight, bottomLeft, decimal] = anchors;
  const rowPitch = Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y) / 9;
  const colPitch = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y) / 3;
  if (rowPitch < 6 || colPitch < 10) throw new Error('Tap the centers of the first and last digit bubbles, then the left decimal.');
  const radius = Math.min(rowPitch * .36, colPitch * .31);
  const grid = manualGrid({ topLeft, topRight, bottomLeft, rows: 10, columns: 4, radius });
  const step = { x: (topRight.x - topLeft.x) / 3, y: (topRight.y - topLeft.y) / 3 };
  const second = grid.cells[1];
  const decGap = second.y - decimal.y;
  if (Math.abs(decimal.x - second.x) > colPitch * .35 || decGap < rowPitch * .4 || decGap > rowPitch * 1.65) {
    throw new Error('The left decimal should be above the second digit column. Retap the four printed centers.');
  }
  const slots = Array.from({ length: 4 }, (_, column) => {
    const digits = grid.cells.filter((cell) => cell.column === column).map(({ x, y, row }) =>
      ({ x, y, radius, symbol: String(row), observed: false }));
    const offset = column - 1;
    if (column === 1 || column === 2) {
      digits.unshift({ x: decimal.x + step.x * offset, y: decimal.y + step.y * offset, radius, symbol: '.', observed: false });
    }
    return { choices: digits.map((choice) => {
      const previous = retained?.[column]?.choices.find((item) => item.symbol === choice.symbol && item.observed);
      if (!previous) return choice;
      if (Math.hypot(previous.x - choice.x, previous.y - choice.y) > Math.max(1.5, .55 * radius)) {
        throw new Error('The tapped grid conflicts with detected bubbles. Check the anchors or restart without the proposal.');
      }
      return { ...previous };
    }) };
  });
  validateResearchMapping(slots, region);
  return slots;
}

export function validateResearchMapping(slots, region) {
  if (!validBounds(region) || slots?.length !== 4) throw new Error('Place one four-column NR grid first.');
  const all = [];
  for (const [index, slot] of slots.entries()) {
    const symbols = (index === 1 || index === 2 ? '.0123456789' : '0123456789');
    if (slot.choices.map(({ symbol }) => symbol).join('') !== symbols) throw new Error('The grid must have ten digits and two inner decimal bubbles.');
    for (const { x, y, radius } of slot.choices) {
      if (![x, y, radius].every(Number.isFinite) || radius <= 0 || x - radius < region.x || y - radius < region.y ||
          x + radius > region.x + region.width || y + radius > region.y + region.height) {
        throw new Error('A bubble extends outside the region. Redraw the box with a small margin.');
      }
      if (all.some((cell) => Math.hypot(cell.x - x, cell.y - y) <= cell.radius + radius)) {
        throw new Error('Two bubble positions overlap. Adjust the selected bubble or retap the grid.');
      }
      all.push({ x, y, radius });
    }
  }
  for (let row = 0; row < 10; row++) {
    const columns = slots.map(({ choices }, slot) => choices[row + (slot === 1 || slot === 2 ? 1 : 0)]);
    if (columns.some((cell, i) => i > 0 && cell.x <= columns[i - 1].x)) throw new Error('Digit columns must keep their left-to-right order.');
  }
  if (slots.some(({ choices }) => choices.some((cell, i) => i > 0 && cell.y <= choices[i - 1].y))) {
    throw new Error('The decimal and digit positions must keep their top-to-bottom order.');
  }
}
