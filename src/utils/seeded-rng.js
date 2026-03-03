/**
 * Simple seeded PRNG (xorshift32 variant).
 * Seed can be a string (hashed) or number.
 */
export class SeededRNG {
  constructor(seed) {
    if (typeof seed === 'string') {
      this.state = this._hashString(seed);
    } else {
      this.state = seed >>> 0;
    }
    if (this.state === 0) this.state = 1;
  }

  _hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // Returns float in [0, 1)
  next() {
    let x = this.state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return (this.state >>> 0) / 4294967296;
  }

  // Returns integer in [min, max)
  nextInt(min, max) {
    return min + Math.floor(this.next() * (max - min));
  }
}
