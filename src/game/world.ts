import * as THREE from 'three';
import { BLOCKS } from './blocks';
import { SeededNoise } from './noise';
import { getTileUVs } from './textures';
import { BiomeId, BlockId, ItemId, ItemStack } from './types';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 56;
export const SEA_LEVEL = 14;

interface FaceDef {
  dir: [number, number, number];
  corners: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];
  uAxis: [number, number, number];
  vAxis: [number, number, number];
  uvOrder: [number, number][];
  shade: number;
  faceKey: 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west';
}

const FACES: FaceDef[] = [
  {
    dir: [0, 1, 0],
    corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
    uAxis: [1, 0, 0],
    vAxis: [0, 0, -1],
    uvOrder: [[0, 0], [1, 0], [1, 1], [0, 1]],
    shade: 1.0,
    faceKey: 'top',
  },
  {
    dir: [0, -1, 0],
    corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
    uAxis: [1, 0, 0],
    vAxis: [0, 0, 1],
    uvOrder: [[0, 0], [1, 0], [1, 1], [0, 1]],
    shade: 0.58,
    faceKey: 'bottom',
  },
  {
    dir: [0, 0, 1],
    corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
    uAxis: [1, 0, 0],
    vAxis: [0, 1, 0],
    uvOrder: [[0, 0], [1, 0], [1, 1], [0, 1]],
    shade: 0.86,
    faceKey: 'north',
  },
  {
    dir: [0, 0, -1],
    corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
    uAxis: [-1, 0, 0],
    vAxis: [0, 1, 0],
    uvOrder: [[0, 0], [1, 0], [1, 1], [0, 1]],
    shade: 0.82,
    faceKey: 'south',
  },
  {
    dir: [1, 0, 0],
    corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
    uAxis: [0, 0, -1],
    vAxis: [0, 1, 0],
    uvOrder: [[0, 0], [1, 0], [1, 1], [0, 1]],
    shade: 0.76,
    faceKey: 'east',
  },
  {
    dir: [-1, 0, 0],
    corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
    uAxis: [0, 0, 1],
    vAxis: [0, 1, 0],
    uvOrder: [[0, 0], [1, 0], [1, 1], [0, 1]],
    shade: 0.76,
    faceKey: 'west',
  },
];

const AO_CURVE = [0.46, 0.65, 0.82, 1.0];

// Facing direction order: 0=north(+z), 1=east(+x), 2=south(-z), 3=west(-x)
const DIR_FACE_KEYS = ['north', 'east', 'south', 'west'] as const;

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
  private shadowsEnabled = true;

  public glowstones = new Map<string, THREE.Vector3>();
  public blockEdits = new Map<string, BlockId>();
  public blockRotations = new Map<string, number>();
  private structureChestsSeeded = new Set<string>();
  public onSeedChestLoot?: (key: string, items: (ItemStack | null)[]) => void;

  constructor(
    seed: number,
    worldGroup: THREE.Group,
    opaqueMaterial: THREE.MeshStandardMaterial,
    waterMaterial: THREE.MeshStandardMaterial,
    shadowsEnabled = true,
  ) {
    this.seed = seed;
    this.noise = new SeededNoise(seed);
    this.caveNoise = new SeededNoise(seed + 1337);
    this.biomeNoise = new SeededNoise(seed + 7919);
    this.worldGroup = worldGroup;
    this.opaqueMaterial = opaqueMaterial;
    this.waterMaterial = waterMaterial;
    this.shadowsEnabled = shadowsEnabled;
  }

  public setShadowsEnabled(enabled: boolean) {
    this.shadowsEnabled = enabled;
    for (const entry of this.chunks.values()) {
      if (entry.opaqueMesh) {
        entry.opaqueMesh.castShadow = enabled;
        entry.opaqueMesh.receiveShadow = enabled;
      }
      if (entry.waterMesh) {
        entry.waterMesh.receiveShadow = enabled;
      }
    }
  }

  private static chunkKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  private static blockKey(bx: number, by: number, bz: number): string {
    return `${bx},${by},${bz}`;
  }

  private static idx(lx: number, y: number, lz: number): number {
    return (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
  }

  public getBiomeInfo(wx: number, wz: number): { biome: BiomeId; temp: number; moisture: number } {
    const temp = this.biomeNoise.fbm2D(wx * 0.0045 + 120, wz * 0.0045 - 90, 2, 0.5, 2.0);
    const moisture = this.biomeNoise.fbm2D(wx * 0.005 - 210, wz * 0.005 + 170, 2, 0.5, 2.0);
    const continent = this.noise.fbm2D(wx * 0.0065, wz * 0.0065, 3, 0.5, 2.0);

    if (continent < -0.26) return { biome: 'ocean', temp, moisture };
    if (continent > 0.34) return { biome: 'mountains', temp: temp - 0.3, moisture };
    if (temp > 0.18 && moisture < 0.05) return { biome: 'desert', temp, moisture };
    if (temp < -0.16) return { biome: 'snow', temp, moisture };
    if (moisture > 0.1) return { biome: 'forest', temp, moisture };
    return { biome: 'plains', temp, moisture };
  }

  public getTemperatureC(wx: number, wy: number, wz: number): number {
    const { biome, temp } = this.getBiomeInfo(wx, wz);
    let base = 20 + temp * 18;
    if (biome === 'desert') base += 12;
    if (biome === 'snow') base -= 22;
    if (biome === 'mountains') base -= 10;
    base -= Math.max(0, wy - 18) * 0.65;
    return Math.round(base);
  }

  public getTerrainHeight(wx: number, wz: number): number {
    const continent = this.noise.fbm2D(wx * 0.0065, wz * 0.0065, 3, 0.5, 2.0);
    const detail = this.noise.fbm2D(wx * 0.03 + 100, wz * 0.03 - 50, 3, 0.5, 2.0);
    const ridge = Math.abs(this.biomeNoise.fbm2D(wx * 0.015 - 40, wz * 0.015 + 80, 2, 0.5, 2.0));
    const river = Math.abs(this.noise.noise2D(wx * 0.011 + 500, wz * 0.011 - 300));

    let raw = 17 + continent * 11 + detail * 4.5;
    if (continent > 0.25) {
      raw += (continent - 0.25) * 28 + Math.max(0, 0.32 - ridge) * 24;
    }
    if (river < 0.055 && continent > -0.22) {
      raw = Math.min(raw, SEA_LEVEL - 2.5 + river * 45);
    }
    return Math.max(4, Math.min(WORLD_HEIGHT - 10, Math.round(raw)));
  }

  public groundHeightAt(wx: number, wz: number): number {
    const bx = Math.floor(wx);
    const bz = Math.floor(wz);
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      const b = this.getBlock(bx, y, bz);
      if (b !== BlockId.Air && b !== BlockId.Water && b !== BlockId.Lava) {
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
    this.applySavedEditsToChunk(entry);
    return entry;
  }

  private applySavedEditsToChunk(entry: ChunkEntry) {
    const baseX = entry.cx * CHUNK_SIZE;
    const baseZ = entry.cz * CHUNK_SIZE;
    for (const [bKey, blockId] of this.blockEdits.entries()) {
      const parts = bKey.split(',');
      const bx = Number(parts[0]);
      const by = Number(parts[1]);
      const bz = Number(parts[2]);
      if (
        bx >= baseX &&
        bx < baseX + CHUNK_SIZE &&
        bz >= baseZ &&
        bz < baseZ + CHUNK_SIZE &&
        by > 0 &&
        by < WORLD_HEIGHT
      ) {
        const lx = bx - baseX;
        const lz = bz - baseZ;
        entry.data[VoxelWorld.idx(lx, by, lz)] = blockId;
        if (BLOCKS[blockId]?.emissive && blockId !== BlockId.RedstoneOre) {
          this.glowstones.set(bKey, new THREE.Vector3(bx + 0.5, by + 0.5, bz + 0.5));
        }
      }
    }
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
        const { biome } = this.getBiomeInfo(wx, wz);

        for (let y = 0; y < WORLD_HEIGHT; y++) {
          let block = BlockId.Air;

          if (y === 0) {
            block = BlockId.Bedrock;
          } else if (y <= h) {
            const isNearSurface = y >= h - 1;
            let carved = false;
            if (!isNearSurface && y > 1 && y < h - 1) {
              const cVal = this.caveNoise.noise3D(wx * 0.068, y * 0.088, wz * 0.068);
              if (Math.abs(cVal) < 0.088 && h > SEA_LEVEL + 1) {
                carved = true;
              }
            }

            if (carved) {
              if (y <= 3) block = BlockId.Lava;
            } else if (y === h) {
              if (biome === 'desert') {
                block = h <= SEA_LEVEL ? BlockId.Sand : BlockId.Sand;
              } else if (biome === 'ocean' || h <= SEA_LEVEL + 1) {
                block = h < SEA_LEVEL - 1 ? BlockId.Gravel : BlockId.Sand;
              } else if (biome === 'snow' || h >= 29) {
                block = BlockId.Snow;
              } else if (biome === 'mountains' && h >= 25) {
                block = BlockId.Stone;
              } else {
                block = BlockId.Grass;
              }
            } else if (y >= h - 3) {
              if (biome === 'desert' || h <= SEA_LEVEL + 1) {
                block = y <= h - 2 && biome === 'desert' ? BlockId.Sandstone : BlockId.Sand;
              } else if (biome === 'mountains' && h >= 25) {
                block = BlockId.Stone;
              } else {
                block = BlockId.Dirt;
              }
            } else {
              // Stone vs Deepslate depth layering + rich ores
              const isDeep = y <= 9;
              block = isDeep ? BlockId.Deepslate : BlockId.Stone;
              const oreHash = this.caveNoise.noise3D(wx * 0.24 + 50, y * 0.24, wz * 0.24);
              if (y <= 8 && oreHash > 0.56) {
                block = BlockId.DiamondOre;
              } else if (y <= 11 && oreHash < -0.57) {
                block = BlockId.RedstoneOre;
              } else if (y <= 15 && oreHash < -0.51 && oreHash >= -0.57) {
                block = BlockId.GoldOre;
              } else if (y <= 24 && oreHash > 0.45 && oreHash <= 0.56) {
                block = BlockId.IronOre;
              } else if (y >= 12 && y <= 28 && oreHash > 0.37 && oreHash <= 0.44) {
                block = BlockId.CopperOre;
              } else if (oreHash < -0.37 && oreHash >= -0.5) {
                block = BlockId.CoalOre;
              } else if (y > 10 && Math.abs(oreHash) < 0.04) {
                block = BlockId.Gravel;
              }
            }
          } else if (y <= SEA_LEVEL) {
            block = y === SEA_LEVEL && biome === 'snow' ? BlockId.Ice : BlockId.Water;
          }

          data[VoxelWorld.idx(lx, y, lz)] = block;
        }
      }
    }

    // Trees & Cacti
    for (let lx = 2; lx < CHUNK_SIZE - 2; lx++) {
      for (let lz = 2; lz < CHUNK_SIZE - 2; lz++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const h = this.getTerrainHeight(wx, wz);
        if (h <= SEA_LEVEL + 1 || h >= 28) continue;

        const { biome } = this.getBiomeInfo(wx, wz);
        const treeRand = this.noise.hash2D(wx, wz);

        if (biome === 'desert') {
          if (treeRand > 0.986 && data[VoxelWorld.idx(lx, h, lz)] === BlockId.Sand) {
            const ch = 2 + Math.floor((treeRand * 100) % 2);
            for (let dy = 1; dy <= ch; dy++) {
              data[VoxelWorld.idx(lx, h + dy, lz)] = BlockId.Cactus;
            }
          }
          continue;
        }

        const threshold = biome === 'forest' ? 0.962 : biome === 'snow' ? 0.976 : 0.988;
        if (treeRand > threshold) {
          const n1 = this.noise.hash2D(wx + 1, wz);
          const n2 = this.noise.hash2D(wx - 1, wz);
          if (n1 > threshold || n2 > threshold) continue;

          const isSpruce = biome === 'snow' || biome === 'mountains';
          const isBirch = !isSpruce && (Math.floor(treeRand * 1000) % 4 === 0);
          const logId = isSpruce ? BlockId.SpruceLog : isBirch ? BlockId.BirchLog : BlockId.OakLog;
          const leafId = isSpruce ? BlockId.SpruceLeaves : BlockId.Leaves;

          const trunkH = isSpruce ? 5 : 4 + Math.floor((treeRand * 1000) % 2);
          if (h + trunkH + 3 >= WORLD_HEIGHT) continue;

          for (let dy = trunkH - 1; dy <= trunkH + 1; dy++) {
            const rad = dy === trunkH + 1 ? 1 : 2;
            for (let dx = -rad; dx <= rad; dx++) {
              for (let dz = -rad; dz <= rad; dz++) {
                if (dx === 0 && dz === 0 && dy < trunkH + 1) continue;
                if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && dy === trunkH) continue;
                const cur = data[VoxelWorld.idx(lx + dx, h + dy, lz + dz)];
                if (cur === BlockId.Air) {
                  data[VoxelWorld.idx(lx + dx, h + dy, lz + dz)] = leafId;
                }
              }
            }
          }
          data[VoxelWorld.idx(lx, h + trunkH + 2, lz)] = leafId;
          for (let ty = 1; ty <= trunkH; ty++) {
            data[VoxelWorld.idx(lx, h + ty, lz)] = logId;
          }
        }
      }
    }

    // Natural Structures: Villages & Mineshafts (avoid spawn chunk 0,0)
    const structHash = this.noise.hash2D(cx * 31 + 7, cz * 17 - 3);
    if ((cx !== 0 || cz !== 0) && structHash > 0.91) {
      const centerW = baseX + 8;
      const centerZ = baseZ + 8;
      const { biome } = this.getBiomeInfo(centerW, centerZ);
      const baseH = this.getTerrainHeight(centerW, centerZ);

      if ((biome === 'plains' || biome === 'desert') && baseH > SEA_LEVEL + 2 && baseH < 25) {
        this.carveVillageHouse(entry, baseH, biome === 'desert');
      } else if (structHash > 0.94) {
        this.carveMineshaft(entry);
      }
    } else if (structHash < 0.08 && (cx !== 0 || cz !== 0)) {
      this.carveMineshaft(entry);
    }
  }

  private carveVillageHouse(entry: ChunkEntry, floorY: number, desert: boolean) {
    const { cx, cz, data } = entry;
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    const wallMat = desert ? BlockId.Sandstone : BlockId.OakPlanks;
    const pillarMat = desert ? BlockId.Sandstone : BlockId.OakLog;
    const floorMat = desert ? BlockId.Sandstone : BlockId.Cobblestone;
    const roofMat = desert ? BlockId.Sandstone : BlockId.SprucePlanks;

    // 7x7 cottage at lx=4..10, lz=4..10
    for (let lx = 4; lx <= 10; lx++) {
      for (let lz = 4; lz <= 10; lz++) {
        // Fill foundation
        for (let y = Math.max(2, floorY - 3); y <= floorY; y++) {
          data[VoxelWorld.idx(lx, y, lz)] = floorMat;
        }
        // Clear interior & build walls (height 4)
        for (let dy = 1; dy <= 4; dy++) {
          const y = floorY + dy;
          if (y >= WORLD_HEIGHT - 1) continue;
          const isEdgeX = lx === 4 || lx === 10;
          const isEdgeZ = lz === 4 || lz === 10;
          const isWall = isEdgeX || isEdgeZ;

          if (dy === 4) {
            data[VoxelWorld.idx(lx, y, lz)] = roofMat;
          } else if (isWall) {
            if (isEdgeX && isEdgeZ) {
              data[VoxelWorld.idx(lx, y, lz)] = pillarMat;
            } else if (lx === 7 && lz === 4 && (dy === 1 || dy === 2)) {
              data[VoxelWorld.idx(lx, y, lz)] = BlockId.Air; // Doorway
            } else if (dy === 2 && ((lx === 7 && lz === 10) || (lz === 7 && (lx === 4 || lx === 10)))) {
              data[VoxelWorld.idx(lx, y, lz)] = BlockId.Glass; // Windows
            } else {
              data[VoxelWorld.idx(lx, y, lz)] = wallMat;
            }
          } else {
            data[VoxelWorld.idx(lx, y, lz)] = BlockId.Air;
          }
        }
      }
    }

    // Interior furniture: Crafting Table, Furnace, Bed, Lantern, Loot Chest
    data[VoxelWorld.idx(5, floorY + 1, 9)] = BlockId.CraftingTable;
    data[VoxelWorld.idx(6, floorY + 1, 9)] = BlockId.Furnace;
    data[VoxelWorld.idx(9, floorY + 1, 9)] = BlockId.Bed;
    data[VoxelWorld.idx(9, floorY + 1, 5)] = BlockId.Chest;
    data[VoxelWorld.idx(7, floorY + 3, 7)] = BlockId.Lantern;

    const chestKey = VoxelWorld.blockKey(baseX + 9, floorY + 1, baseZ + 5);
    this.glowstones.set(chestKey, new THREE.Vector3(baseX + 7.5, floorY + 3.5, baseZ + 7.5));
    if (!this.structureChestsSeeded.has(chestKey) && this.onSeedChestLoot) {
      this.structureChestsSeeded.add(chestKey);
      const loot: (ItemStack | null)[] = new Array(27).fill(null);
      loot[0] = { id: ItemId.Apple, count: 4 };
      loot[1] = { id: ItemId.CookedMeat, count: 3 };
      loot[2] = { id: ItemId.IronIngot, count: 3 };
      loot[3] = { id: ItemId.Arrow, count: 8 };
      loot[4] = { id: ItemId.OakPlanks, count: 12 };
      this.onSeedChestLoot(chestKey, loot);
    }
  }

  private carveMineshaft(entry: ChunkEntry) {
    const { cx, cz, data } = entry;
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    const yFloor = 11;

    for (let lx = 2; lx < CHUNK_SIZE - 2; lx++) {
      for (let lz = 6; lz <= 8; lz++) {
        data[VoxelWorld.idx(lx, yFloor, lz)] = BlockId.OakPlanks;
        for (let dy = 1; dy <= 3; dy++) {
          data[VoxelWorld.idx(lx, yFloor + dy, lz)] = BlockId.Air;
        }
      }
      if (lx % 5 === 2) {
        data[VoxelWorld.idx(lx, yFloor + 1, 6)] = BlockId.OakLog;
        data[VoxelWorld.idx(lx, yFloor + 2, 6)] = BlockId.OakLog;
        data[VoxelWorld.idx(lx, yFloor + 1, 8)] = BlockId.OakLog;
        data[VoxelWorld.idx(lx, yFloor + 2, 8)] = BlockId.OakLog;
        data[VoxelWorld.idx(lx, yFloor + 3, 6)] = BlockId.OakPlanks;
        data[VoxelWorld.idx(lx, yFloor + 3, 7)] = BlockId.Torch;
        data[VoxelWorld.idx(lx, yFloor + 3, 8)] = BlockId.OakPlanks;
      }
    }

    // Mineshaft loot chest
    data[VoxelWorld.idx(4, yFloor + 1, 7)] = BlockId.Chest;
    const chestKey = VoxelWorld.blockKey(baseX + 4, yFloor + 1, baseZ + 7);
    if (!this.structureChestsSeeded.has(chestKey) && this.onSeedChestLoot) {
      this.structureChestsSeeded.add(chestKey);
      const loot: (ItemStack | null)[] = new Array(27).fill(null);
      loot[0] = { id: ItemId.Coal, count: 8 };
      loot[1] = { id: ItemId.IronIngot, count: 4 };
      loot[2] = { id: ItemId.Diamond, count: 1 };
      loot[3] = { id: ItemId.Torch, count: 6 };
      this.onSeedChestLoot(chestKey, loot);
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

  public setBlock(wx: number, wy: number, wz: number, id: BlockId, rotation = 0): boolean {
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

    const key = VoxelWorld.blockKey(bx, y, bz);
    if (BLOCKS[prev]?.emissive) this.glowstones.delete(key);
    if (BLOCKS[id]?.emissive && id !== BlockId.RedstoneOre) {
      this.glowstones.set(key, new THREE.Vector3(bx + 0.5, y + 0.5, bz + 0.5));
    }

    entry.data[index] = id;
    entry.dirty = true;
    this.blockEdits.set(key, id);
    if (rotation !== 0 && BLOCKS[id]?.rotatable) {
      this.blockRotations.set(key, rotation & 3);
    } else if (id === BlockId.Air) {
      this.blockRotations.delete(key);
    }

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

    // Dynamic chunk unloading beyond radius + 2 to keep RAM & GPU clean
    const unloadLimit = (radius + 2) * (radius + 2) + 2;
    for (const [key, entry] of this.chunks.entries()) {
      const dx = entry.cx - pcx;
      const dz = entry.cz - pcz;
      const dSq = dx * dx + dz * dz;
      const visible = dSq <= radius * radius + 2;
      if (entry.opaqueMesh) entry.opaqueMesh.visible = visible;
      if (entry.waterMesh) entry.waterMesh.visible = visible;
      if (dSq > unloadLimit) {
        if (entry.opaqueMesh) {
          entry.opaqueMesh.geometry.dispose();
          this.worldGroup.remove(entry.opaqueMesh);
        }
        if (entry.waterMesh) {
          entry.waterMesh.geometry.dispose();
          this.worldGroup.remove(entry.waterMesh);
        }
        this.chunks.delete(key);
      }
    }

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
    return !BLOCKS[id].transparent;
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
          const isWaterOrGlass = id === BlockId.Water || id === BlockId.Glass || id === BlockId.Ice;
          const rot = def.rotatable ? this.blockRotations.get(VoxelWorld.blockKey(wx, y, wz)) ?? 0 : 0;
          const frontFaceKey = DIR_FACE_KEYS[rot];

          for (let f = 0; f < FACES.length; f++) {
            const face = FACES[f];
            const nbx = wx + face.dir[0];
            const nby = y + face.dir[1];
            const nbz = wz + face.dir[2];

            const neighborId = this.getBlock(nbx, nby, nbz);
            const neighborDef = BLOCKS[neighborId];

            if (isWaterOrGlass) {
              if (neighborId === id || (neighborId !== BlockId.Air && !neighborDef.transparent)) {
                continue;
              }
            } else {
              if (neighborId !== BlockId.Air && !neighborDef.transparent) {
                continue;
              }
            }

            let tileIdx = def.tiles.side;
            if (face.faceKey === 'top') tileIdx = def.tiles.top;
            else if (face.faceKey === 'bottom') tileIdx = def.tiles.bottom;
            else if (face.faceKey === frontFaceKey && def.tiles.front !== undefined) {
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

            const liquidDrop =
              (id === BlockId.Water || id === BlockId.Lava) &&
              this.getBlock(wx, y + 1, wz) !== id
                ? -0.14
                : 0;

            for (let c = 0; c < 4; c++) {
              const corner = face.corners[c];
              let cy = y + corner[1];
              if (corner[1] === 1 && liquidDrop !== 0) {
                cy += liquidDrop;
              }
              targetPos.push(wx + corner[0], cy, wz + corner[2]);
              targetNorm.push(face.dir[0], face.dir[1], face.dir[2]);

              const [uu, vv] = face.uvOrder[c];
              targetUv.push(uu === 0 ? u0 : u1, vv === 0 ? v0 : v1);

              let ao = 3;
              if (!isWaterOrGlass && !def.emissive) {
                const su = uu === 0 ? -1 : 1;
                const sv = vv === 0 ? -1 : 1;
                ao = this.cornerAO(wx, y, wz, face.dir, face.uAxis, face.vAxis, su, sv);
              }
              aoVals[c] = ao;

              const glowBoost = def.emissive ? 1.38 : 1.0;
              const shade = (def.emissive ? 1.0 : face.shade) * AO_CURVE[ao] * glowBoost;
              targetCol.push(shade, shade, shade);
            }

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
      mesh.castShadow = this.shadowsEnabled;
      mesh.receiveShadow = this.shadowsEnabled;
      this.worldGroup.add(mesh);
      entry.opaqueMesh = mesh;
    }

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
      mesh.receiveShadow = this.shadowsEnabled;
      mesh.renderOrder = 2;
      this.worldGroup.add(mesh);
      entry.waterMesh = mesh;
    }
  }

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
      if (id !== BlockId.Air && id !== BlockId.Water && id !== BlockId.Lava) {
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
