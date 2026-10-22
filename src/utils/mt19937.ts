const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df;
const UPPER_MASK = 0x80000000;
const LOWER_MASK = 0x7fffffff;

export function seededRandom(seed: number) {
  const mt = new Uint32Array(N);
  let index = N;

  function initGenrand(s: number) {
    mt[0] = s >>> 0;
    for (let i = 1; i < N; i++) {
      const prev = mt[i - 1];
      mt[i] = (Math.imul(1812433253, prev ^ (prev >>> 30)) + i) >>> 0;
    }
  }

  function seedWords(value: number): number[] {
    let v = BigInt(Math.abs(Math.trunc(value)));
    if (v === 0n) return [0];

    const words: number[] = [];
    while (v > 0n) {
      words.push(Number(v & 0xffffffffn));
      v >>= 32n;
    }
    return words;
  }

  function initByArray(key: number[]) {
    initGenrand(19650218);

    let i = 1;
    let j = 0;
    for (let k = Math.max(N, key.length); k > 0; k--) {
      const prev = mt[i - 1];
      mt[i] = ((mt[i] ^ Math.imul(prev ^ (prev >>> 30), 1664525)) + key[j] + j) >>> 0;
      i++;
      j++;
      if (i >= N) {
        mt[0] = mt[N - 1];
        i = 1;
      }
      if (j >= key.length) j = 0;
    }
    for (let k = N - 1; k > 0; k--) {
      const prev = mt[i - 1];
      mt[i] = ((mt[i] ^ Math.imul(prev ^ (prev >>> 30), 1566083941)) - i) >>> 0;
      i++;
      if (i >= N) {
        mt[0] = mt[N - 1];
        i = 1;
      }
    }
    mt[0] = 0x80000000;
  }

  function twist() {
    for (let i = 0; i < N; i++) {
      const y = ((mt[i] & UPPER_MASK) | (mt[(i + 1) % N] & LOWER_MASK)) >>> 0;
      mt[i] = (mt[(i + M) % N] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)) >>> 0;
    }
    index = 0;
  }

  function nextUint32(): number {
    if (index >= N) twist();

    let y = mt[index++];
    y ^= y >>> 11;
    y = (y ^ ((y << 7) & 0x9d2c5680)) >>> 0;
    y = (y ^ ((y << 15) & 0xefc60000)) >>> 0;
    y ^= y >>> 18;
    return y >>> 0;
  }

  function getrandbits(k: number): number {
    if (k <= 0) return 0;
    if (k > 32) throw new Error("getrandbits: k > 32 is not supported");
    return nextUint32() >>> (32 - k);
  }

  function randbelow(n: number): number {
    if (n <= 0) return 0;

    const bits = 32 - Math.clz32(n);
    let r = getrandbits(bits);
    while (r >= n) r = getrandbits(bits);
    return r;
  }

  function sample<T>(population: T[], k: number): T[] {
    const n = population.length;
    if (k < 0 || k > n) throw new Error("sample: asked for more items than the population holds");

    let setsize = 21;
    if (k > 5) setsize += 4 ** Math.ceil(Math.log(k * 3) / Math.log(4));

    const result: T[] = [];

    if (n <= setsize) {
      const pool = population.slice();
      for (let i = 0; i < k; i++) {
        const j = randbelow(n - i);
        result.push(pool[j]);
        pool[j] = pool[n - i - 1];
      }
    } else {
      const selected = new Set<number>();
      for (let i = 0; i < k; i++) {
        let j = randbelow(n);
        while (selected.has(j)) j = randbelow(n);
        selected.add(j);
        result.push(population[j]);
      }
    }
    return result;
  }

  initByArray(seedWords(seed));

  return { getrandbits, randbelow, sample };
}
