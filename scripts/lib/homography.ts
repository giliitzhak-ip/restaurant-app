export type Point = [number, number];
export type Matrix3 = number[];

/**
 * Solves the projective transform that maps four `from` points onto four `to`
 * points. Used to project a texture plane into the perspective of a
 * photographed (or generated) room.
 */
export function solveHomography(from: Point[], to: Point[]): Matrix3 {
  const a: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i += 1) {
    const [x, y] = from[i]!;
    const [X, Y] = to[i]!;
    a.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    b.push(X);
    a.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    b.push(Y);
  }

  const h = gaussianSolve(a, b);
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

export function applyHomography(h: Matrix3, x: number, y: number): Point {
  const denom = h[6]! * x + h[7]! * y + h[8]!;
  const safe = Math.abs(denom) < 1e-9 ? 1e-9 : denom;
  return [
    (h[0]! * x + h[1]! * y + h[2]!) / safe,
    (h[3]! * x + h[4]! * y + h[5]!) / safe,
  ];
}

export function invertMatrix3(m: Matrix3): Matrix3 {
  const [a, b, c, d, e, f, g, hh, i] = m as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const det =
    a * (e * i - f * hh) - b * (d * i - f * g) + c * (d * hh - e * g);
  const safe = Math.abs(det) < 1e-12 ? 1e-12 : det;
  return [
    (e * i - f * hh) / safe,
    (c * hh - b * i) / safe,
    (b * f - c * e) / safe,
    (f * g - d * i) / safe,
    (a * i - c * g) / safe,
    (c * d - a * f) / safe,
    (d * hh - e * g) / safe,
    (b * g - a * hh) / safe,
    (a * e - b * d) / safe,
  ];
}

function gaussianSolve(matrix: number[][], vector: number[]): number[] {
  const n = vector.length;
  const m = matrix.map((row, i) => [...row, vector[i]!]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row]![col]!) > Math.abs(m[pivot]![col]!)) pivot = row;
    }
    const tmp = m[col]!;
    m[col] = m[pivot]!;
    m[pivot] = tmp;

    const pivotValue = m[col]![col]!;
    if (Math.abs(pivotValue) < 1e-12) continue;

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = m[row]![col]! / pivotValue;
      if (factor === 0) continue;
      for (let k = col; k <= n; k += 1) {
        m[row]![k]! -= factor * m[col]![k]!;
      }
    }
  }

  return Array.from({ length: n }, (_, i) => {
    const pivotValue = m[i]![i]!;
    return Math.abs(pivotValue) < 1e-12 ? 0 : m[i]![n]! / pivotValue;
  });
}
