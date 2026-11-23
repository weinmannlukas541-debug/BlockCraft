// Deterministic seeded value & gradient noise for terrain, biomes, caves, and ores

export class SeededNoise {
  private perm: Uint8Array;

  constructor(seed: number) {
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;

    let s = (seed | 0) ^ 0x9e3779b9;
    for (let i = 255; i > 0; i--) {
      s = (Math.imul(s ^ (s >>> 15), 0x85ebca6b) + 0xc2b2ae35) | 0;
      const j = ((s >>> 0) % (i + 1)) | 0;
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
    }
  }

  private static fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private static lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private static grad2(hash: number, x: number, y: number): number {
    switch (hash & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  }

  private static grad3(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = SeededNoise.fade(xf);
    const v = SeededNoise.fade(yf);

    const aa = this.perm[this.perm[X] + Y];
    const ab = this.perm[this.perm[X] + Y + 1];
    const ba = this.perm[this.perm[X + 1] + Y];
    const bb = this.perm[this.perm[X + 1] + Y + 1];

    const x1 = SeededNoise.lerp(
      SeededNoise.grad2(aa, xf, yf),
      SeededNoise.grad2(ba, xf - 1, yf),
      u,
    );
    const x2 = SeededNoise.lerp(
      SeededNoise.grad2(ab, xf, yf - 1),
      SeededNoise.grad2(bb, xf - 1, yf - 1),
      u,
    );

    return SeededNoise.lerp(x1, x2, v);
  }

  noise3D(x: number, y: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);

    const u = SeededNoise.fade(xf);
    const v = SeededNoise.fade(yf);
    const w = SeededNoise.fade(zf);

    const A = this.perm[X] + Y;
    const AA = this.perm[A] + Z;
    const AB = this.perm[A + 1] + Z;
    const B = this.perm[X + 1] + Y;
    const BA = this.perm[B] + Z;
    const BB = this.perm[B + 1] + Z;

    const x1 = SeededNoise.lerp(
      SeededNoise.grad3(this.perm[AA], xf, yf, zf),
      SeededNoise.grad3(this.perm[BA], xf - 1, yf, zf),
      u,
    );
    const x2 = SeededNoise.lerp(
      SeededNoise.grad3(this.perm[AB], xf, yf - 1, zf),
      SeededNoise.grad3(this.perm[BB], xf - 1, yf - 1, zf),
      u,
    );
    const y1 = SeededNoise.lerp(x1, x2, v);

    const x3 = SeededNoise.lerp(
      SeededNoise.grad3(this.perm[AA + 1], xf, yf, zf - 1),
      SeededNoise.grad3(this.perm[BA + 1], xf - 1, yf, zf - 1),
      u,
    );
    const x4 = SeededNoise.lerp(
      SeededNoise.grad3(this.perm[AB + 1], xf, yf - 1, zf - 1),
      SeededNoise.grad3(this.perm[BB + 1], xf - 1, yf - 1, zf - 1),
      u,
    );
    const y2 = SeededNoise.lerp(x3, x4, v);

    return SeededNoise.lerp(y1, y2, w);
  }

  fbm2D(x: number, y: number, octaves = 4, persistence = 0.5, lacunarity = 2): number {
    let total = 0;
    let amp = 1;
    let freq = 1;
    let maxAmp = 0;
    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * freq, y * freq) * amp;
      maxAmp += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return total / maxAmp;
  }

  hash2D(ix: number, iz: number): number {
    let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + this.perm[0];
    n = (n ^ (n >>> 13)) | 0;
    n = Math.imul(n, 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }
}
