const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);

  const z = x - 1;
  let series = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i++) series += LANCZOS[i]! / (z + i + 1);

  const t = z + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(series);
}

const MAX_ITERATIONS = 500;
const EPSILON = 1e-15;

function lowerGammaSeries(s: number, x: number): number {
  let term = 1 / s;
  let sum = term;

  for (let n = 1; n < MAX_ITERATIONS; n++) {
    term *= x / (s + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * EPSILON) break;
  }
  return sum * Math.exp(-x + s * Math.log(x) - logGamma(s));
}

function upperGammaContinuedFraction(s: number, x: number): number {
  const tiny = 1e-300;
  let b = x + 1 - s;
  let c = 1 / tiny;
  let d = 1 / b;
  let result = d;

  for (let i = 1; i < MAX_ITERATIONS; i++) {
    const a = -i * (i - s);
    b += 2;
    d = a * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + a / c;
    if (Math.abs(c) < tiny) c = tiny;

    const delta = d === 0 ? 0 : (1 / d) * c;
    d = 1 / d;
    result *= delta;
    if (Math.abs(delta - 1) < EPSILON) break;
  }
  return result * Math.exp(-x + s * Math.log(x) - logGamma(s));
}

function gammaUpperRegularized(s: number, x: number): number {
  if (x <= 0) return 1;
  return x < s + 1 ? 1 - lowerGammaSeries(s, x) : upperGammaContinuedFraction(s, x);
}

export function chiSquareSurvival(value: number, degreesOfFreedom: number): number {
  if (value <= 0) return 1;
  if (degreesOfFreedom <= 0) return Number.NaN;

  return gammaUpperRegularized(degreesOfFreedom / 2, value / 2);
}

function erfc(x: number): number {
  const absolute = Math.abs(x);
  const value = gammaUpperRegularized(0.5, absolute * absolute);
  return x >= 0 ? value : 2 - value;
}

export function normalCdf(z: number): number {
  return 0.5 * erfc(-z / Math.SQRT2);
}

export function normalSurvival(z: number): number {
  return 0.5 * erfc(z / Math.SQRT2);
}

const QUANTILE_A = [
  -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
  1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
];
const QUANTILE_B = [
  -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
  6.680131188771972e1, -1.328068155288572e1,
];
const QUANTILE_C = [
  -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
  -2.549732539343734, 4.374664141464968, 2.938163982698783,
];
const QUANTILE_D = [
  7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416,
];

export function normalQuantile(p: number): number {
  if (p <= 0 || p >= 1) return p <= 0 ? -Infinity : Infinity;

  const low = 0.02425;
  let x: number;

  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = poly(QUANTILE_C, q) / poly1(QUANTILE_D, q);
  } else if (p <= 1 - low) {
    const q = p - 0.5;
    const r = q * q;
    x = (poly(QUANTILE_A, r) * q) / poly1(QUANTILE_B, r);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -poly(QUANTILE_C, q) / poly1(QUANTILE_D, q);
  }

  for (let i = 0; i < 2; i++) {
    const error = normalCdf(x) - p;
    const density = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
    if (density === 0) break;
    x -= error / density;
  }
  return x;
}

function poly(coefficients: number[], x: number): number {
  return coefficients.reduce((sum, coefficient) => sum * x + coefficient, 0);
}

function poly1(coefficients: number[], x: number): number {
  return coefficients.reduce((sum, coefficient) => sum * x + coefficient, 0) * x + 1;
}

export function logFactorial(n: number): number {
  return logGamma(n + 1);
}

export function hypergeometricPmf(k: number, N: number, K: number, n: number): number {
  if (k < 0 || k > K || n - k < 0 || n - k > N - K) return 0;

  const logP =
    logFactorial(K) - logFactorial(k) - logFactorial(K - k) +
    logFactorial(N - K) - logFactorial(n - k) - logFactorial(N - K - n + k) -
    (logFactorial(N) - logFactorial(n) - logFactorial(N - n));

  return Math.exp(logP);
}
