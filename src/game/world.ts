import * as THREE from 'three';
import { BLOCKS } from './blocks';
import { SeededNoise } from './noise';
import { getTileUVs } from './textures';
import { BlockId } from './types';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 48;
export const SEA_LEVEL = 12;

interface FaceDef {
  dir: [number, number, number];
  corners: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];
  // 2 tangent axes for 4-neighbor AO sampling
  uAxis: [number, number, number];
  vAxis: [number, number, number];
  uvOrder: [number, number][]; // [u0/u1, v0/v1] per corner
  shade: number;
  faceKey: 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west';
}

// Counter-clockwise winding looking from outside each face
const FACES: FaceDef[] = [
  {
    // +Y Top
    dir: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
    uAxis: [1, 0, 0],
    vAxis: [0, 0, -1],
    uvOrder: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    shade: 1.0,
    faceKey: 'top',
  },
  {
    // -Y Bottom
    dir: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    uAxis: [1, 0, 0],
    vAxis: [0, 0, 1],
    uvOrder: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    shade: 0.58,
    faceKey: 'bottom',
  },
  {
    // +Z North (Front)
    dir: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
    uAxis: [1, 0, 0],
    vAxis: [0, 1, 0],
    uvOrder: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    shade: 0.86,
    faceKey: 'north',
  },
  {
    // -Z South (Back)
    dir: [0, 0, -1],
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
    uAxis: [-1, 0, 0],
    vAxis: [0, 1, 0],
    uvOrder: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    shade: 0.82,
    faceKey: 'south',
  },
  {
    // +X East
    dir: [1, 0, 0],
    corners: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
    uAxis: [0, 0, -1],
    vAxis: [0, 1, 0],
    uvOrder: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    shade: 0.76,
    faceKey: 'east',
  },
  {
    // -X West
    dir: [-1, 0, 0],
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    uAxis: [0, 0, 1],
    vAxis: [0, 1, 0],
    uvOrder: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    shade: 0.76,
    faceKey: 'west',
  },
];

const AO_CURVE = [0.46, 0.65, 0.82, 1.0];

export interface RaycastHit {
  bx: number;
  by: number;
  bz: number;
  nx: number;
  ny: number;
  nz: number;
  blockId: BlockId;
  distance: number;
}

export interface ChunkEntry {
  cx: number;
  cz: number;
  data: Uint8Array;
  opaqueMesh: THREE.Mesh | null;
  waterMesh: THREE.Mesh | null;
  dirty: boolean;
}

export class VoxelWorld {
  public seed: number;
  private noise: SeededNoise;
  private caveNoise: SeededNoise;
  private biomeNoise: SeededNoise;

  private chunks = new Map<string, ChunkEntry>();
  private worldGroup: THREE.Group;
  private opaqueMaterial: THREE.MeshStandardMaterial;
  private waterMaterial: THREE.MeshStandardMaterial;
  public glowstones = new Map<string, THREE.Vector3>();

  constructor(
    seed: number,
    worldGroup: THREE.Group,
    opaqueMaterial: THREE.MeshStandardMaterial,
    waterMaterial: THREE.MeshStandardMaterial,
  ) {
    this.seed = seed;
    this.noise = new SeededNoise(seed);
    this.caveNoise = new SeededNoise(seed + 1337);
    this.biomeNoise = new SeededNoise(seed + 7919);
    this.worldGroup = worldGroup;
    this.opaqueMaterial = opaqueMaterial;
    this.waterMaterial = waterMaterial;
  }

  private static chunkKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  private static idx(lx: number, y: number, lz: number): number {
    return (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
  }

  public getTerrainHeight(wx: number, wz: number): number {
    const continent = this.noise.fbm2D(wx * 0.008, wz * 0.008, 3, 0.5, 2.0);
    const detail = this.noise.fbm2D(wx * 0.032 + 100, wz * 0.032 - 50, 3, 0.5, 2.0);
    const ridge = Math.abs(this.biomeNoise.fbm2D(wx * 0.015 - 40, wz * 0.015 + 80, 2, 0.5, 2.0));
    const mountainBoost = Math.max(0, 0.35 - ridge) * 26;

    const raw = 15 + continent * 9.5 + detail * 4.5 + mountainBoost;
    return Math.max(3, Math.min(WORLD_HEIGHT - 8, Math.round(raw)));
  }

  public groundHeightAt(wx: number, wz: number): number {
    const bx = Math.floor(wx);
    const bz = Math.floor(wz);
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      const b = this.getBlock(bx, y, bz);
      if (b !== BlockId.Air && b !== BlockId.Water) {
        return y + 1;
      }
    }
    return SEA_LEVEL + 1;
  }

  private ensureChunk(cx: number, cz: number): ChunkEntry {
    const key = VoxelWorld.chunkKey(cx, cz);
    const existing = this.chunks.get(key);
    if (existing) return existing;

    const data = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    const entry: ChunkEntry = {
      cx,
      cz,
      data,
      opaqueMesh: null,
      waterMesh: null,
      dirty: true,
    };
    this.chunks.set(key, entry);
    this.generateChunkTerrain(entry);
    return entry;
  }

  private generateChunkTerrain(entry: ChunkEntry) {
    const { cx, cz, data } = entry;
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = baseX + lx;
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wz = baseZ + lz;
        const h = this.getTerrainHeight(wx, wz);
        const temp = this.biomeNoise.noise2D(wx * 0.012 + 300, wz * 0.012 - 200);

        for (let y = 0; y < WORLD_HEIGHT; y++) {
          let block = BlockId.Air;

          if (y === 0) {
            block = BlockId.Bedrock;
          } else if (y <= h) {
            // Check 3D cave carving between y=2 and y=h-1
            const isNearSurface = y >= h - 1;
            let carved = false;
            if (!isNearSurface && y > 1 && y < h - 1) {
              const cVal = this.caveNoise.noise3D(wx * 0.07, y * 0.09, wz * 0.07);
              if (Math.abs(cVal) < 0.085 && h > SEA_LEVEL + 1) {
                carved = true;
              }
            }

            if (!carved) {
              if (y === h) {
                if (h <= SEA_LEVEL + 1) {
                  block = BlockId.Sand;
                } else if (h >= 24 || (h >= 21 && temp < -0.15)) {
                  block = BlockId.Snow;
                } else {
                  block = BlockId.Grass;
                }
              } else if (y >= h - 3) {
                block = h <= SEA_LEVEL + 1 ? BlockId.Sand : BlockId.Dirt;
              } else {
                // Underground Stone + Ores
                block = BlockId.Stone;
                const oreHash = this.caveNoise.noise3D(wx * 0.24 + 50, y * 0.24, wz * 0.24);
                if (y <= 7 && oreHash > 0.56) {
                  block = BlockId.DiamondOre;
                } else if (y <= 13 && oreHash < -0.53) {
                  block = BlockId.GoldOre;
                } else if (y <= 20 && oreHash > 0.45 && oreHash <= 0.56) {
                  block = BlockId.IronOre;
                } else if (oreHash < -0.38 && oreHash >= -0.53) {
                  block = BlockId.CoalOre;
                }
              }
            }
          } else if (y <= SEA_LEVEL) {
            block = BlockId.Water;
          }

          data[VoxelWorld.idx(lx, y, lz)] = block;
        }
      }
    }

    // Deterministic Trees (keep 2-block margin inside chunk so canopy doesn't clip chunks)
    for (let lx = 2; lx < CHUNK_SIZE - 2; lx++) {
      for (let lz = 2; lz < CHUNK_SIZE - 2; lz++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const h = this.getTerrainHeight(wx, wz);
        if (h <= SEA_LEVEL + 1 || h >= 23) continue;

        const treeRand = this.noise.hash2D(wx, wz);
        const forestDensity = this.biomeNoise.noise2D(wx * 0.025, wz * 0.025);
        const threshold = forestDensity > 0.1 ? 0.972 : 0.988;

        if (treeRand > threshold) {
          // Avoid placing adjacent trees
          const n1 = this.noise.hash2D(wx + 1, wz);
          const n2 = this.noise.hash2D(wx - 1, wz);
          if (n1 > threshold || n2 > threshold) continue;

          const trunkH = 4 + Math.floor((treeRand * 1000) % 2);
          if (h + trunkH + 3 >= WORLD_HEIGHT) continue;

          // Canopy
          for (let dy = trunkH - 1; dy <= trunkH + 1; dy++) {
            const rad = dy === trunkH + 1 ? 1 : 2;
            for (let dx = -rad; dx <= rad; dx++) {
              for (let dz = -rad; dz <= rad; dz++) {
                if (dx === 0 && dz === 0 && dy < trunkH + 1) continue;
                if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && dy === trunkH) continue;
                const cur = data[VoxelWorld.idx(lx + dx, h + dy, lz + dz)];
                if (cur === BlockId.Air) {
                  data[VoxelWorld.idx(lx + dx, h + dy, lz + dz)] = BlockId.Leaves;
                }
              }
            }
          }
          // Top crown
          data[VoxelWorld.idx(lx, h + trunkH + 2, lz)] = BlockId.Leaves;

          // Trunk
          for (let ty = 1; ty <= trunkH; ty++) {
            data[VoxelWorld.idx(lx, h + ty, lz)] = BlockId.OakLog;
          }
        }
      }
    }
  }

  public getBlock(wx: number, wy: number, wz: number): BlockId {
    const y = Math.floor(wy);
    if (y < 0 || y >= WORLD_HEIGHT) return BlockId.Air;
    const bx = Math.floor(wx);
    const bz = Math.floor(wz);
    const cx = Math.floor(bx / CHUNK_SIZE);
    const cz = Math.floor(bz / CHUNK_SIZE);
    const entry = this.chunks.get(VoxelWorld.chunkKey(cx, cz));
    if (!entry) return BlockId.Air;
    const lx = bx - cx * CHUNK_SIZE;
    const lz = bz - cz * CHUNK_SIZE;
    return entry.data[VoxelWorld.idx(lx, y, lz)] as BlockId;
  }

  public setBlock(wx: number, wy: number, wz: number, id: BlockId): boolean {
    const y = Math.floor(wy);
    if (y <= 0 || y >= WORLD_HEIGHT) return false;
    const bx = Math.floor(wx);
    const bz = Math.floor(wz);
    const cx = Math.floor(bx / CHUNK_SIZE);
    const cz = Math.floor(bz / CHUNK_SIZE);
    const entry = this.ensureChunk(cx, cz);
    const lx = bx - cx * CHUNK_SIZE;
    const lz = bz - cz * CHUNK_SIZE;
    const index = VoxelWorld.idx(lx, y, lz);

    const prev = entry.data[index] as BlockId;
    if (prev === id) return false;

    const key = `${bx},${y},${bz}`;
    if (prev === BlockId.Glowstone) this.glowstones.delete(key);
    if (id === BlockId.Glowstone) {
      this.glowstones.set(key, new THREE.Vector3(bx + 0.5, y + 0.5, bz + 0.5));
    }

    entry.data[index] = id;
    entry.dirty = true;

    // Mark neighbor chunks dirty if on chunk border
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);

    return true;
  }

  private markDirty(cx: number, cz: number) {
    const entry = this.chunks.get(VoxelWorld.chunkKey(cx, cz));
    if (entry) entry.dirty = true;
  }

  public updateChunksAround(px: number, pz: number, radius: number, maxBuildsPerFrame = 4) {
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);

    // Ensure chunks exist in spiral/distance order
    const needed: { cx: number; cz: number; dist: number }[] = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz > radius * radius + 2) continue;
        needed.push({ cx: pcx + dx, cz: pcz + dz, dist: dx * dx + dz * dz });
      }
    }
    needed.sort((a, b) => a.dist - b.dist);

    for (const item of needed) {
      this.ensureChunk(item.cx, item.cz);
    }

    // Hide chunks far outside radius
    for (const entry of this.chunks.values()) {
      const dx = entry.cx - pcx;
      const dz = entry.cz - pcz;
      const visible = dx * dx + dz * dz <= radius * radius + 2;
      if (entry.opaqueMesh) entry.opaqueMesh.visible = visible;
      if (entry.waterMesh) entry.waterMesh.visible = visible;
    }

    // Rebuild dirty visible chunks up to budget
    let built = 0;
    for (const item of needed) {
      if (built >= maxBuildsPerFrame) break;
      const entry = this.chunks.get(VoxelWorld.chunkKey(item.cx, item.cz));
      if (entry && entry.dirty) {
        this.rebuildChunkMesh(entry);
        entry.dirty = false;
        built++;
      }
    }
  }

  public prebuildAround(px: number, pz: number, radius: number) {
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz > radius * radius + 2) continue;
        this.ensureChunk(pcx + dx, pcz + dz);
      }
    }
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz > radius * radius + 2) continue;
        const entry = this.chunks.get(VoxelWorld.chunkKey(pcx + dx, pcz + dz));
        if (entry && entry.dirty) {
          this.rebuildChunkMesh(entry);
          entry.dirty = false;
        }
      }
    }
  }

  private isOpaqueOccluder(wx: number, wy: number, wz: number): boolean {
    const id = this.getBlock(wx, wy, wz);
    if (id === BlockId.Air) return false;
    const def = BLOCKS[id];
    return !def.transparent;
  }

  private cornerAO(
    wx: number,
    wy: number,
    wz: number,
    nDir: [number, number, number],
    u: [number, number, number],
    v: [number, number, number],
    su: number,
    sv: number,
  ): number {
    const nx = wx + nDir[0];
    const ny = wy + nDir[1];
    const nz = wz + nDir[2];

    const side1 = this.isOpaqueOccluder(nx + u[0] * su, ny + u[1] * su, nz + u[2] * su) ? 1 : 0;
    const side2 = this.isOpaqueOccluder(nx + v[0] * sv, ny + v[1] * sv, nz + v[2] * sv) ? 1 : 0;
    if (side1 && side2) return 0;
    const corner = this.isOpaqueOccluder(
      nx + u[0] * su + v[0] * sv,
      ny + u[1] * su + v[1] * sv,
      nz + u[2] * su + v[2] * sv,
    )
      ? 1
      : 0;
    return 3 - (side1 + side2 + corner);
  }

  private rebuildChunkMesh(entry: ChunkEntry) {
    const { cx, cz, data } = entry;
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    const oPos: number[] = [];
    const oNorm: number[] = [];
    const oUv: number[] = [];
    const oCol: number[] = [];
    const oIdx: number[] = [];

    const wPos: number[] = [];
    const wNorm: number[] = [];
    const wUv: number[] = [];
    const wCol: number[] = [];
    const wIdx: number[] = [];

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wz = baseZ + lz;
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const id = data[VoxelWorld.idx(lx, y, lz)] as BlockId;
          if (id === BlockId.Air) continue;

          const def = BLOCKS[id];
          const wx = baseX + lx;
          const isWaterOrGlass = def.liquid || id === BlockId.Glass;

          for (let f = 0; f < FACES.length; f++) {
            const face = FACES[f];
            const nbx = wx + face.dir[0];
            const nby = y + face.dir[1];
            const nbz = wz + face.dir[2];

            const neighborId = this.getBlock(nbx, nby, nbz);
            const neighborDef = BLOCKS[neighborId];

            if (isWaterOrGlass) {
              // Cull water/glass faces touching same block or opaque blocks
              if (neighborId === id || (neighborId !== BlockId.Air && !neighborDef.transparent)) {
                continue;
              }
            } else {
              // Cull opaque/leaves faces touching opaque blocks (leaves cull leaves optionally? keep leaves visible!)
              if (neighborId !== BlockId.Air && !neighborDef.transparent) {
                continue;
              }
            }

            // Pick tile index for this face
            let tileIdx = def.tiles.side;
            if (face.faceKey === 'top') tileIdx = def.tiles.top;
            else if (face.faceKey === 'bottom') tileIdx = def.tiles.bottom;
            else if (face.faceKey === 'north' && def.tiles.front !== undefined) {
              tileIdx = def.tiles.front;
            }

            const [u0, v0, u1, v1] = getTileUVs(tileIdx);

            const targetPos = isWaterOrGlass ? wPos : oPos;
            const targetNorm = isWaterOrGlass ? wNorm : oNorm;
            const targetUv = isWaterOrGlass ? wUv : oUv;
            const targetCol = isWaterOrGlass ? wCol : oCol;
            const targetIdx = isWaterOrGlass ? wIdx : oIdx;

            const vertStart = targetPos.length / 3;
            const aoVals: number[] = [3, 3, 3, 3];

            const waterTopDrop =
              def.liquid && this.getBlock(wx, y + 1, wz) !== BlockId.Water ? -0.14 : 0;

            for (let c = 0; c < 4; c++) {
              const corner = face.corners[c];
              let cy = y + corner[1];
              if (corner[1] === 1 && waterTopDrop !== 0) {
                cy += waterTopDrop;
              }
              targetPos.push(wx + corner[0], cy, wz + corner[2]);
              targetNorm.push(face.dir[0], face.dir[1], face.dir[2]);

              const [uu, vv] = face.uvOrder[c];
              targetUv.push(uu === 0 ? u0 : u1, vv === 0 ? v0 : v1);

              // Vertex AO calculation
              let ao = 3;
              if (!isWaterOrGlass && !def.emissive) {
                const su = uu === 0 ? -1 : 1;
                const sv = vv === 0 ? -1 : 1;
                ao = this.cornerAO(wx, y, wz, face.dir, face.uAxis, face.vAxis, su, sv);
              }
              aoVals[c] = ao;

              const glowBoost = def.emissive ? 1.35 : 1.0;
              const shade = (def.emissive ? 1.0 : face.shade) * AO_CURVE[ao] * glowBoost;
              targetCol.push(shade, shade, shade);
            }

            // Flip quad diagonal to avoid AO interpolation artifacts
            if (aoVals[0] + aoVals[2] > aoVals[1] + aoVals[3]) {
              targetIdx.push(
                vertStart,
                vertStart + 1,
                vertStart + 2,
                vertStart,
                vertStart + 2,
                vertStart + 3,
              );
            } else {
              targetIdx.push(
                vertStart + 1,
                vertStart + 2,
                vertStart + 3,
                vertStart + 1,
                vertStart + 3,
                vertStart,
              );
            }
          }
        }
      }
    }

    // Update or dispose opaque mesh
    if (entry.opaqueMesh) {
      entry.opaqueMesh.geometry.dispose();
      this.worldGroup.remove(entry.opaqueMesh);
      entry.opaqueMesh = null;
    }
    if (oPos.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(oPos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(oNorm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(oUv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(oCol, 3));
      geo.setIndex(oIdx);
      geo.computeBoundingSphere();

      const mesh = new THREE.Mesh(geo, this.opaqueMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.worldGroup.add(mesh);
      entry.opaqueMesh = mesh;
    }

    // Update or dispose translucent mesh
    if (entry.waterMesh) {
      entry.waterMesh.geometry.dispose();
      this.worldGroup.remove(entry.waterMesh);
      entry.waterMesh = null;
    }
    if (wPos.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(wNorm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(wUv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(wCol, 3));
      geo.setIndex(wIdx);
      geo.computeBoundingSphere();

      const mesh = new THREE.Mesh(geo, this.waterMaterial);
      mesh.receiveShadow = true;
      mesh.renderOrder = 2;
      this.worldGroup.add(mesh);
      entry.waterMesh = mesh;
    }
  }

  // Exact 3D DDA voxel raycast (Amanatides & Woo)
  public raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist = 5.5): RaycastHit | null {
    let bx = Math.floor(origin.x);
    let by = Math.floor(origin.y);
    let bz = Math.floor(origin.z);

    const stepX = dir.x >= 0 ? 1 : -1;
    const stepY = dir.y >= 0 ? 1 : -1;
    const stepZ = dir.z >= 0 ? 1 : -1;

    const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : 1e9;
    const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : 1e9;
    const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : 1e9;

    let tMaxX = dir.x >= 0 ? (bx + 1 - origin.x) * tDeltaX : (origin.x - bx) * tDeltaX;
    let tMaxY = dir.y >= 0 ? (by + 1 - origin.y) * tDeltaY : (origin.y - by) * tDeltaY;
    let tMaxZ = dir.z >= 0 ? (bz + 1 - origin.z) * tDeltaZ : (origin.z - bz) * tDeltaZ;

    let nx = 0;
    let ny = 0;
    let nz = 0;
    let dist = 0;

    for (let i = 0; i < 48; i++) {
      const id = this.getBlock(bx, by, bz);
      if (id !== BlockId.Air && id !== BlockId.Water) {
        return { bx, by, bz, nx, ny, nz, blockId: id, distance: dist };
      }

      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          dist = tMaxX;
          bx += stepX;
          tMaxX += tDeltaX;
          nx = -stepX;
          ny = 0;
          nz = 0;
        } else {
          dist = tMaxZ;
          bz += stepZ;
          tMaxZ += tDeltaZ;
          nx = 0;
          ny = 0;
          nz = -stepZ;
        }
      } else {
        if (tMaxY < tMaxZ) {
          dist = tMaxY;
          by += stepY;
          tMaxY += tDeltaY;
          nx = 0;
          ny = -stepY;
          nz = 0;
        } else {
          dist = tMaxZ;
          bz += stepZ;
          tMaxZ += tDeltaZ;
          nx = 0;
          ny = 0;
          nz = -stepZ;
        }
      }

      if (dist > maxDist) break;
    }

    return null;
  }

  public dispose() {
    for (const entry of this.chunks.values()) {
      if (entry.opaqueMesh) {
        entry.opaqueMesh.geometry.dispose();
        this.worldGroup.remove(entry.opaqueMesh);
      }
      if (entry.waterMesh) {
        entry.waterMesh.geometry.dispose();
        this.worldGroup.remove(entry.waterMesh);
      }
    }
    this.chunks.clear();
    this.glowstones.clear();
  }
}
