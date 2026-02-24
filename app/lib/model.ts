// app/lib/model.ts

export function poissonPMF(k: number, lambda: number) {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

function factorial(n: number): number {
  if (n === 0) return 1;
  let result = 1;
  for (let i = 1; i <= n; i++) result *= i;
  return result;
}

export function scoreMatrix(
  lambdaHome: number,
  lambdaAway: number,
  maxGoals = 6
) {
  const matrix: number[][] = [];

  for (let h = 0; h <= maxGoals; h++) {
    const row: number[] = [];
    for (let a = 0; a <= maxGoals; a++) {
      row.push(poissonPMF(h, lambdaHome) * poissonPMF(a, lambdaAway));
    }
    matrix.push(row);
  }

  return matrix;
}

export function collapseMatrix(matrix: number[][]) {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      if (h > a) homeWin += matrix[h][a];
      else if (h === a) draw += matrix[h][a];
      else awayWin += matrix[h][a];
    }
  }

  return { homeWin, draw, awayWin };
}

export function mostLikelyScore(matrix: number[][]) {
  let bestH = 0;
  let bestA = 0;
  let bestP = -1;

  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      const p = matrix[h][a];
      if (p > bestP) {
        bestP = p;
        bestH = h;
        bestA = a;
      }
    }
  }

  return { homeGoals: bestH, awayGoals: bestA, prob: bestP };
}
