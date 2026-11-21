function multiply(left, right) {
  const result = [];
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      result.push(left[row * 3] * right[column] + left[row * 3 + 1] * right[column + 3] + left[row * 3 + 2] * right[column + 6]);
    }
  }
  return result;
}

export function project(matrix, x, y) {
  const scale = matrix[6] * x + matrix[7] * y + matrix[8];
  if (Math.abs(scale) < 1e-12) return null;
  const projected = {
    x: (matrix[0] * x + matrix[1] * y + matrix[2]) / scale,
    y: (matrix[3] * x + matrix[4] * y + matrix[5]) / scale,
  };
  return Number.isFinite(projected.x) && Number.isFinite(projected.y) ? projected : null;
}

export function invertProjective(matrix) {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const inverse = [e*i-f*h, c*h-b*i, b*f-c*e, f*g-d*i, a*i-c*g, c*d-a*f, d*h-e*g, b*g-a*h, a*e-b*d];
  const determinant = a * inverse[0] + b * inverse[3] + c * inverse[6];
  if (Math.abs(determinant) < 1e-12 || !Number.isFinite(determinant)) return null;
  return inverse.map((value) => value / determinant);
}

function normalize(points) {
  const divisor = points.length;
  const centerX = points.reduce((sum, point) => sum + point.x, 0) / divisor;
  const centerY = points.reduce((sum, point) => sum + point.y, 0) / divisor;
  const distance = points.reduce((sum, point) => sum + Math.hypot(point.x - centerX, point.y - centerY), 0) / divisor;
  if (distance < 1e-10) return null;
  const scale = Math.SQRT2 / distance;
  const matrix = [scale, 0, -scale * centerX, 0, scale, -scale * centerY, 0, 0, 1];
  return { matrix, points: points.map(({ x, y }) => project(matrix, x, y)) };
}

function solve(equations) {
  const size = equations.length;
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(equations[row][column]) > Math.abs(equations[pivot][column])) pivot = row;
    }
    if (Math.abs(equations[pivot][column]) < 1e-7) return null;
    [equations[column], equations[pivot]] = [equations[pivot], equations[column]];
    const leading = equations[column][column];
    for (let j = column; j <= size; j++) equations[column][j] /= leading;
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = equations[row][column];
      for (let j = column; j <= size; j++) equations[row][j] -= factor * equations[column][j];
    }
  }
  return equations.map((row) => row[size]);
}

export function fitProjective(source, target) {
  if (source.length !== 4 || target.length !== 4) return null;
  const from = normalize(source);
  const to = normalize(target);
  if (!from || !to) return null;
  const equations = from.points.flatMap(({ x, y }, index) => {
    const { x: u, y: v } = to.points[index];
    return [[x, y, 1, 0, 0, 0, -u*x, -u*y, u], [0, 0, 0, x, y, 1, -v*x, -v*y, v]];
  });
  const solved = solve(equations);
  if (!solved) return null;
  return multiply(multiply(invertProjective(to.matrix), [...solved, 1]), from.matrix);
}

export function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
