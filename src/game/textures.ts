import * as THREE from 'three';
import { BLOCKS, ITEMS, TILE } from './blocks';
import { BlockId, ItemId } from './types';

export const ATLAS_GRID = 16; // 16x16 tiles = 256 slots
export const TILE_PX = 16;
export const ATLAS_SIZE = ATLAS_GRID * TILE_PX; // 256x256

function seededRand(seed: number) {
  let s = seed | 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x85ebca6b) + 0xc2b2ae35) | 0;
    return ((s >>> 0) % 10000) / 10000;
  };
}

function drawNoiseTile(
  ctx: CanvasRenderingContext2D,
  tileIdx: number,
  baseColors: string[],
  seed: number,
) {
  const tx = (tileIdx % ATLAS_GRID) * TILE_PX;
  const ty = Math.floor(tileIdx / ATLAS_GRID) * TILE_PX;
  const rand = seededRand(seed);
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      ctx.fillStyle = baseColors[Math.floor(rand() * baseColors.length)];
      ctx.fillRect(tx + x, ty + y, 1, 1);
    }
  }
}

function setPx(
  ctx: CanvasRenderingContext2D,
  tileIdx: number,
  x: number,
  y: number,
  color: string,
) {
  const tx = (tileIdx % ATLAS_GRID) * TILE_PX;
  const ty = Math.floor(tileIdx / ATLAS_GRID) * TILE_PX;
  ctx.fillStyle = color;
  ctx.fillRect(tx + x, ty + y, 1, 1);
}

function fillRectTile(
  ctx: CanvasRenderingContext2D,
  tileIdx: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  const tx = (tileIdx % ATLAS_GRID) * TILE_PX;
  const ty = Math.floor(tileIdx / ATLAS_GRID) * TILE_PX;
  ctx.fillStyle = color;
  ctx.fillRect(tx + x, ty + y, w, h);
}

export function getTileUVs(tileIdx: number): [number, number, number, number] {
  const col = tileIdx % ATLAS_GRID;
  const row = Math.floor(tileIdx / ATLAS_GRID);
  const eps = 0.0012;
  const u0 = col / ATLAS_GRID + eps;
  const u1 = (col + 1) / ATLAS_GRID - eps;
  const v1 = 1 - row / ATLAS_GRID - eps;
  const v0 = 1 - (row + 1) / ATLAS_GRID + eps;
  return [u0, v0, u1, v1];
}

export interface GeneratedTextures {
  atlasCanvas: HTMLCanvasElement;
  atlasTexture: THREE.CanvasTexture;
  crackTextures: THREE.CanvasTexture[];
  itemIcons: Record<number, string>;
}

export function createVoxelTextures(maxAnisotropy: number): GeneratedTextures {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  // 0: Grass Top
  drawNoiseTile(ctx, TILE.GRASS_TOP, ['#599d34', '#63ab3b', '#4d8c2c', '#6fb944', '#519230'], 101);

  // 1: Grass Side
  drawNoiseTile(ctx, TILE.GRASS_SIDE, ['#866043', '#7a553a', '#916a4c', '#6e4c32'], 102);
  const grassEdge = [3, 4, 3, 5, 4, 3, 2, 4, 5, 3, 4, 3, 4, 2, 3, 4];
  const grassColors = ['#599d34', '#65ae3c', '#4b8a2a', '#70ba45'];
  const rGrass = seededRand(103);
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < grassEdge[x]; y++) {
      setPx(ctx, TILE.GRASS_SIDE, x, y, grassColors[Math.floor(rGrass() * grassColors.length)]);
    }
    setPx(ctx, TILE.GRASS_SIDE, x, grassEdge[x], '#3d6e22');
  }

  // 2: Dirt
  drawNoiseTile(ctx, TILE.DIRT, ['#866043', '#785439', '#946c4e', '#6d4a31', '#8b6447'], 104);

  // 3: Stone
  drawNoiseTile(ctx, TILE.STONE, ['#7e7e7e', '#878787', '#747474', '#8e8e8e', '#6d6d6d'], 105);
  const rStone = seededRand(106);
  for (let i = 0; i < 18; i++) {
    fillRectTile(
      ctx,
      TILE.STONE,
      Math.floor(rStone() * 13),
      Math.floor(rStone() * 16),
      3,
      1,
      rStone() > 0.5 ? '#666666' : '#959595',
    );
  }

  // 4: Cobblestone
  drawNoiseTile(ctx, TILE.COBBLESTONE, ['#767676', '#838383', '#6b6b6b'], 107);
  for (let y = 0; y < 16; y += 4) {
    fillRectTile(ctx, TILE.COBBLESTONE, 0, y, 16, 1, '#4e4e4e');
    const offset = (y / 4) % 2 === 0 ? 0 : 4;
    for (let x = offset; x < 16; x += 6) {
      fillRectTile(ctx, TILE.COBBLESTONE, x, y, 1, 4, '#4e4e4e');
      if (x + 1 < 16 && y + 1 < 16) {
        fillRectTile(ctx, TILE.COBBLESTONE, x + 1, y + 1, 3, 1, '#949494');
      }
    }
  }

  // 5..6: Oak Log
  drawNoiseTile(ctx, TILE.OAK_LOG_SIDE, ['#695031', '#5c4428', '#755a38'], 108);
  for (let x = 0; x < 16; x += 2) {
    for (let y = 0; y < 16; y++) {
      if ((x + y * 3) % 5 === 0) setPx(ctx, TILE.OAK_LOG_SIDE, x, y, '#4a351e');
      if ((x * 2 + y) % 7 === 0) setPx(ctx, TILE.OAK_LOG_SIDE, x, y, '#7e6340');
    }
  }
  fillRectTile(ctx, TILE.OAK_LOG_TOP, 0, 0, 16, 16, '#5c4428');
  fillRectTile(ctx, TILE.OAK_LOG_TOP, 1, 1, 14, 14, '#c29d63');
  fillRectTile(ctx, TILE.OAK_LOG_TOP, 3, 3, 10, 10, '#ad8850');
  fillRectTile(ctx, TILE.OAK_LOG_TOP, 5, 5, 6, 6, '#c8a46b');
  fillRectTile(ctx, TILE.OAK_LOG_TOP, 7, 7, 2, 2, '#916e3c');

  // 7: Oak Planks
  drawNoiseTile(ctx, TILE.OAK_PLANKS, ['#ba9156', '#b1874d', '#c39a5f', '#a77e46'], 109);
  for (let y = 0; y < 16; y += 4) {
    fillRectTile(ctx, TILE.OAK_PLANKS, 0, y, 16, 1, '#845f32');
    fillRectTile(ctx, TILE.OAK_PLANKS, ((y / 4) * 5 + 3) % 14 + 1, y, 1, 4, '#845f32');
  }

  // 8: Oak Leaves
  const rLeaf = seededRand(110);
  const leafPalette = ['#2f6b1e', '#3a7f25', '#46912d', '#255817'];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (rLeaf() > 0.2) {
        setPx(ctx, TILE.LEAVES, x, y, leafPalette[Math.floor(rLeaf() * leafPalette.length)]);
      }
    }
  }

  // 9: Sand
  drawNoiseTile(ctx, TILE.SAND, ['#dfd2a3', '#d7c896', '#e6daaf', '#cec08e'], 111);

  // 10: Glass
  fillRectTile(ctx, TILE.GLASS, 0, 0, 16, 16, 'rgba(180, 232, 246, 0.22)');
  fillRectTile(ctx, TILE.GLASS, 0, 0, 16, 1, '#b8e8f5');
  fillRectTile(ctx, TILE.GLASS, 0, 15, 16, 1, '#9cd8ea');
  fillRectTile(ctx, TILE.GLASS, 0, 0, 1, 16, '#b8e8f5');
  fillRectTile(ctx, TILE.GLASS, 15, 0, 1, 16, '#9cd8ea');
  for (let i = 3; i <= 6; i++) {
    setPx(ctx, TILE.GLASS, i, 7 - i + 2, '#eefcff');
    setPx(ctx, TILE.GLASS, i + 5, 13 - i, '#eefcff');
  }

  // 11: Brick
  drawNoiseTile(ctx, TILE.BRICK, ['#9a4a3a', '#a55241', '#8c4031'], 112);
  for (let y = 0; y < 16; y += 4) {
    fillRectTile(ctx, TILE.BRICK, 0, y, 16, 1, '#c4bdb6');
    const offset = (y / 4) % 2 === 0 ? 0 : 4;
    for (let x = offset; x < 16; x += 8) {
      fillRectTile(ctx, TILE.BRICK, x, y, 1, 4, '#c4bdb6');
    }
  }

  // 12..15 + 39..40: Ores
  const ores: [number, string[], number, string[]][] = [
    [TILE.COAL_ORE, ['#242424', '#333333', '#191919'], 113, ['#7d7d7d', '#868686', '#747474']],
    [TILE.IRON_ORE, ['#d8b89b', '#c49d7d', '#ecd2ba'], 114, ['#7d7d7d', '#868686', '#747474']],
    [TILE.GOLD_ORE, ['#f7d33e', '#e3b21c', '#fff08a'], 115, ['#7d7d7d', '#868686', '#747474']],
    [TILE.DIAMOND_ORE, ['#4be8ed', '#2cc4ca', '#a7fbff'], 116, ['#7d7d7d', '#868686', '#747474']],
    [TILE.REDSTONE_ORE, ['#e52424', '#ff5454', '#b01616'], 139, ['#494b54', '#3f4149', '#52545e']],
    [TILE.COPPER_ORE, ['#de7847', '#49a88c', '#f09467'], 140, ['#7d7d7d', '#868686', '#747474']],
  ];
  for (const [tile, flecks, s, stoneBg] of ores) {
    drawNoiseTile(ctx, tile, stoneBg, 105);
    const ro = seededRand(s);
    for (let i = 0; i < 9; i++) {
      const ox = 2 + Math.floor(ro() * 11);
      const oy = 2 + Math.floor(ro() * 11);
      setPx(ctx, tile, ox, oy, flecks[0]);
      setPx(ctx, tile, ox + 1, oy, flecks[1]);
      setPx(ctx, tile, ox, oy + 1, flecks[2]);
    }
  }

  // 16: Bedrock
  drawNoiseTile(ctx, TILE.BEDROCK, ['#262626', '#3d3d3d', '#1b1b1b', '#525252', '#303030'], 117);

  // 17..19: Crafting Table
  fillRectTile(ctx, TILE.CRAFT_TOP, 0, 0, 16, 16, '#875b30');
  fillRectTile(ctx, TILE.CRAFT_TOP, 1, 1, 14, 14, '#ba884e');
  for (let i = 5; i <= 10; i += 5) {
    fillRectTile(ctx, TILE.CRAFT_TOP, i, 1, 1, 14, '#54361a');
    fillRectTile(ctx, TILE.CRAFT_TOP, 1, i, 14, 1, '#54361a');
  }
  drawNoiseTile(ctx, TILE.CRAFT_SIDE, ['#9b6d3c', '#8e6234', '#a87846'], 118);
  fillRectTile(ctx, TILE.CRAFT_SIDE, 0, 0, 16, 3, '#6e4b26');
  fillRectTile(ctx, TILE.CRAFT_SIDE, 4, 5, 3, 6, '#5c5c5c');
  fillRectTile(ctx, TILE.CRAFT_SIDE, 10, 5, 2, 7, '#4e351c');
  drawNoiseTile(ctx, TILE.CRAFT_FRONT, ['#9b6d3c', '#8e6234', '#a87846'], 119);
  fillRectTile(ctx, TILE.CRAFT_FRONT, 0, 0, 16, 3, '#6e4b26');
  fillRectTile(ctx, TILE.CRAFT_FRONT, 3, 4, 4, 8, '#3f2814');
  fillRectTile(ctx, TILE.CRAFT_FRONT, 9, 4, 4, 8, '#3f2814');

  // 20..22: Furnace
  drawNoiseTile(ctx, TILE.FURNACE_SIDE, ['#727272', '#656565', '#7f7f7f'], 120);
  fillRectTile(ctx, TILE.FURNACE_SIDE, 0, 7, 16, 1, '#4c4c4c');
  drawNoiseTile(ctx, TILE.FURNACE_TOP, ['#767676', '#696969', '#838383'], 121);
  drawNoiseTile(ctx, TILE.FURNACE_FRONT, ['#727272', '#656565', '#7f7f7f'], 122);
  fillRectTile(ctx, TILE.FURNACE_FRONT, 3, 2, 10, 5, '#2a2a2a');
  fillRectTile(ctx, TILE.FURNACE_FRONT, 4, 10, 8, 5, '#1d1d1d');
  fillRectTile(ctx, TILE.FURNACE_FRONT, 5, 11, 6, 3, '#e86f24');
  fillRectTile(ctx, TILE.FURNACE_FRONT, 6, 12, 4, 2, '#ffd15c');

  // 23: Glowstone
  drawNoiseTile(ctx, TILE.GLOWSTONE, ['#f7d060', '#e5ad3a', '#ffeb99', '#c48324'], 123);
  for (let i = 0; i < 16; i += 4) {
    fillRectTile(ctx, TILE.GLOWSTONE, i, 0, 1, 16, '#9f651a');
    fillRectTile(ctx, TILE.GLOWSTONE, 0, i, 16, 1, '#9f651a');
  }

  // 24: Water
  drawNoiseTile(
    ctx,
    TILE.WATER,
    ['rgba(45,112,226,0.78)', 'rgba(54,126,238,0.78)', 'rgba(38,98,208,0.78)'],
    124,
  );
  fillRectTile(ctx, TILE.WATER, 2, 4, 5, 1, 'rgba(130, 192, 255, 0.8)');
  fillRectTile(ctx, TILE.WATER, 8, 11, 6, 1, 'rgba(130, 192, 255, 0.8)');

  // 25..26: Snow
  drawNoiseTile(ctx, TILE.SNOW, ['#f2f8ff', '#e4effa', '#ffffff', '#dce8f6'], 125);
  drawNoiseTile(ctx, TILE.SNOW_SIDE, ['#866043', '#7a553a', '#916a4c', '#6e4c32'], 126);
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < grassEdge[x]; y++) {
      setPx(ctx, TILE.SNOW_SIDE, x, y, y === 0 ? '#ffffff' : '#e6f1fc');
    }
  }

  // 27..29: TNT
  fillRectTile(ctx, TILE.TNT_SIDE, 0, 0, 16, 5, '#c9332b');
  fillRectTile(ctx, TILE.TNT_SIDE, 0, 11, 16, 5, '#c9332b');
  for (let x = 0; x < 16; x += 2) {
    fillRectTile(ctx, TILE.TNT_SIDE, x, 0, 1, 5, '#a8231c');
    fillRectTile(ctx, TILE.TNT_SIDE, x, 11, 1, 5, '#a8231c');
  }
  fillRectTile(ctx, TILE.TNT_SIDE, 0, 5, 16, 6, '#ece8e1');
  fillRectTile(ctx, TILE.TNT_SIDE, 2, 6, 3, 1, '#1e1e1e');
  fillRectTile(ctx, TILE.TNT_SIDE, 3, 6, 1, 4, '#1e1e1e');
  fillRectTile(ctx, TILE.TNT_SIDE, 6, 6, 1, 4, '#1e1e1e');
  fillRectTile(ctx, TILE.TNT_SIDE, 7, 7, 1, 1, '#1e1e1e');
  fillRectTile(ctx, TILE.TNT_SIDE, 8, 8, 1, 1, '#1e1e1e');
  fillRectTile(ctx, TILE.TNT_SIDE, 9, 6, 1, 4, '#1e1e1e');
  fillRectTile(ctx, TILE.TNT_SIDE, 11, 6, 3, 1, '#1e1e1e');
  fillRectTile(ctx, TILE.TNT_SIDE, 12, 6, 1, 4, '#1e1e1e');
  fillRectTile(ctx, TILE.TNT_TOP, 0, 0, 16, 16, '#c9332b');
  fillRectTile(ctx, TILE.TNT_TOP, 2, 2, 12, 12, '#8c221b');
  fillRectTile(ctx, TILE.TNT_TOP, 5, 5, 6, 6, '#dcd6cc');
  fillRectTile(ctx, TILE.TNT_TOP, 7, 7, 2, 2, '#333333');
  fillRectTile(ctx, TILE.TNT_BOTTOM, 0, 0, 16, 16, '#a8231c');

  // 30: Deepslate
  drawNoiseTile(ctx, TILE.DEEPSLATE, ['#3f414a', '#353740', '#4a4c56', '#2c2e36'], 130);
  for (let y = 0; y < 16; y += 3) {
    fillRectTile(ctx, TILE.DEEPSLATE, (y * 3) % 12, y, 5, 1, '#585b66');
  }

  // 31: Gravel
  drawNoiseTile(ctx, TILE.GRAVEL, ['#807a77', '#6c6765', '#96908c', '#5e5a58'], 131);

  // 32..34: Birch Log & Planks
  drawNoiseTile(ctx, TILE.BIRCH_LOG_SIDE, ['#eceae2', '#dfdcd2', '#f4f2eb'], 132);
  for (let i = 0; i < 12; i++) {
    fillRectTile(ctx, TILE.BIRCH_LOG_SIDE, (i * 5) % 12, (i * 3) % 15, 4, 1, '#323232');
  }
  fillRectTile(ctx, TILE.BIRCH_LOG_TOP, 0, 0, 16, 16, '#dcdad2');
  fillRectTile(ctx, TILE.BIRCH_LOG_TOP, 2, 2, 12, 12, '#e3d1a2');
  fillRectTile(ctx, TILE.BIRCH_LOG_TOP, 5, 5, 6, 6, '#ccb786');
  drawNoiseTile(ctx, TILE.BIRCH_PLANKS, ['#decb96', '#d4c08a', '#e6d4a1'], 134);
  for (let y = 0; y < 16; y += 4) {
    fillRectTile(ctx, TILE.BIRCH_PLANKS, 0, y, 16, 1, '#b5a06b');
  }

  // 35..38: Spruce Log, Planks & Leaves
  drawNoiseTile(ctx, TILE.SPRUCE_LOG_SIDE, ['#462d1a', '#3a2413', '#523620'], 135);
  fillRectTile(ctx, TILE.SPRUCE_LOG_TOP, 0, 0, 16, 16, '#3a2413');
  fillRectTile(ctx, TILE.SPRUCE_LOG_TOP, 2, 2, 12, 12, '#8b633c');
  drawNoiseTile(ctx, TILE.SPRUCE_PLANKS, ['#765331', '#69492a', '#825d39'], 137);
  for (let y = 0; y < 16; y += 4) {
    fillRectTile(ctx, TILE.SPRUCE_PLANKS, 0, y, 16, 1, '#4f351c');
  }
  const rSpruce = seededRand(138);
  const spruceColors = ['#244a2c', '#2e5c37', '#1d3b23', '#366940'];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (rSpruce() > 0.16) {
        setPx(ctx, TILE.SPRUCE_LEAVES, x, y, spruceColors[Math.floor(rSpruce() * spruceColors.length)]);
      }
    }
  }

  // 41: Obsidian
  drawNoiseTile(ctx, TILE.OBSIDIAN, ['#181024', '#26183b', '#120b1c', '#3c255e'], 141);

  // 42: Lava
  drawNoiseTile(ctx, TILE.LAVA, ['#f05a14', '#ff8c24', '#cf360e', '#ffbe3b'], 142);

  // 43..44: Sandstone
  drawNoiseTile(ctx, TILE.SANDSTONE_TOP, ['#dfd2a3', '#d4c592', '#e8dcb2'], 143);
  drawNoiseTile(ctx, TILE.SANDSTONE_SIDE, ['#dcd09e', '#cfc18d', '#e5dab0'], 144);
  fillRectTile(ctx, TILE.SANDSTONE_SIDE, 0, 0, 16, 3, '#e8dcb2');
  fillRectTile(ctx, TILE.SANDSTONE_SIDE, 0, 6, 16, 2, '#c5b47e');

  // 45: Stone Brick
  drawNoiseTile(ctx, TILE.STONE_BRICK, ['#7a7a7a', '#848484', '#707070'], 145);
  for (let y = 0; y < 16; y += 8) {
    fillRectTile(ctx, TILE.STONE_BRICK, 0, y, 16, 1, '#545454');
    fillRectTile(ctx, TILE.STONE_BRICK, y === 0 ? 7 : 15, y, 1, 8, '#545454');
  }

  // 46: Ice
  fillRectTile(ctx, TILE.ICE, 0, 0, 16, 16, 'rgba(148, 198, 255, 0.72)');
  fillRectTile(ctx, TILE.ICE, 2, 3, 5, 1, 'rgba(235, 248, 255, 0.85)');
  fillRectTile(ctx, TILE.ICE, 8, 10, 5, 1, 'rgba(235, 248, 255, 0.85)');

  // 47..48: Cactus
  drawNoiseTile(ctx, TILE.CACTUS_TOP, ['#4c9632', '#3c7a26', '#5aa83e'], 147);
  fillRectTile(ctx, TILE.CACTUS_TOP, 1, 1, 14, 14, '#3c7a26');
  fillRectTile(ctx, TILE.CACTUS_TOP, 3, 3, 10, 10, '#5aa83e');
  drawNoiseTile(ctx, TILE.CACTUS_SIDE, ['#44882c', '#366e22', '#529c37'], 148);
  for (let x = 2; x < 16; x += 4) {
    fillRectTile(ctx, TILE.CACTUS_SIDE, x, 0, 1, 16, '#295718');
    setPx(ctx, TILE.CACTUS_SIDE, x + 1, (x * 3) % 14 + 1, '#d9d9b4');
  }

  // 49..51: Chest
  fillRectTile(ctx, TILE.CHEST_TOP, 0, 0, 16, 16, '#6e4c21');
  fillRectTile(ctx, TILE.CHEST_TOP, 1, 1, 14, 14, '#a67738');
  fillRectTile(ctx, TILE.CHEST_SIDE, 0, 0, 16, 16, '#6e4c21');
  fillRectTile(ctx, TILE.CHEST_SIDE, 1, 1, 14, 14, '#9b6e32');
  fillRectTile(ctx, TILE.CHEST_SIDE, 0, 5, 16, 1, '#3d2810');
  fillRectTile(ctx, TILE.CHEST_FRONT, 0, 0, 16, 16, '#6e4c21');
  fillRectTile(ctx, TILE.CHEST_FRONT, 1, 1, 14, 14, '#9b6e32');
  fillRectTile(ctx, TILE.CHEST_FRONT, 0, 5, 16, 1, '#3d2810');
  fillRectTile(ctx, TILE.CHEST_FRONT, 6, 4, 4, 4, '#d9dce0'); // silver latch

  // 52..53: Bed
  fillRectTile(ctx, TILE.BED_TOP, 0, 0, 16, 5, '#f2f2f2');
  fillRectTile(ctx, TILE.BED_TOP, 0, 5, 16, 11, '#c92e2e');
  fillRectTile(ctx, TILE.BED_TOP, 1, 6, 14, 9, '#b82424');
  fillRectTile(ctx, TILE.BED_SIDE, 0, 0, 16, 10, '#c92e2e');
  fillRectTile(ctx, TILE.BED_SIDE, 0, 10, 16, 6, '#875b30');

  // 54: Torch Block
  fillRectTile(ctx, TILE.TORCH, 0, 0, 16, 16, '#4a351e');
  fillRectTile(ctx, TILE.TORCH, 3, 3, 10, 10, '#ffb833');
  fillRectTile(ctx, TILE.TORCH, 5, 5, 6, 6, '#fff4a3');

  // 55: Bookshelf
  drawNoiseTile(ctx, TILE.BOOKSHELF, ['#ba9156', '#a77e46'], 155);
  fillRectTile(ctx, TILE.BOOKSHELF, 0, 0, 16, 2, '#845f32');
  fillRectTile(ctx, TILE.BOOKSHELF, 0, 7, 16, 2, '#845f32');
  fillRectTile(ctx, TILE.BOOKSHELF, 0, 14, 16, 2, '#845f32');
  const bookCols = ['#a83232', '#326ea8', '#3e8a45', '#d4a635', '#7b3fa1'];
  for (let bx = 1; bx < 15; bx += 2) {
    fillRectTile(ctx, TILE.BOOKSHELF, bx, 2, 2, 5, bookCols[bx % bookCols.length]);
    fillRectTile(ctx, TILE.BOOKSHELF, bx, 9, 2, 5, bookCols[(bx + 2) % bookCols.length]);
  }

  // 56: Lantern
  fillRectTile(ctx, TILE.LANTERN, 0, 0, 16, 16, '#30343d');
  fillRectTile(ctx, TILE.LANTERN, 2, 2, 12, 12, '#ffbc42');
  fillRectTile(ctx, TILE.LANTERN, 4, 4, 8, 8, '#fff099');
  fillRectTile(ctx, TILE.LANTERN, 7, 0, 2, 16, '#30343d');

  // 57: Farmland
  drawNoiseTile(ctx, TILE.FARMLAND, ['#5c3c22', '#4c301a', '#694629'], 157);
  for (let y = 2; y < 16; y += 4) {
    fillRectTile(ctx, TILE.FARMLAND, 0, y, 16, 1, '#362010');
  }

  const atlasTexture = new THREE.CanvasTexture(canvas);
  atlasTexture.colorSpace = THREE.SRGBColorSpace;
  atlasTexture.magFilter = THREE.NearestFilter;
  atlasTexture.minFilter = THREE.NearestFilter;
  atlasTexture.generateMipmaps = false;
  atlasTexture.anisotropy = maxAnisotropy;
  atlasTexture.needsUpdate = true;

  // 10-stage mining crack overlays
  const crackTextures: THREE.CanvasTexture[] = [];
  for (let stage = 0; stage < 10; stage++) {
    const cCanvas = document.createElement('canvas');
    cCanvas.width = 16;
    cCanvas.height = 16;
    const cCtx = cCanvas.getContext('2d')!;
    const rCrack = seededRand(900 + stage * 37);
    const branches = stage + 2;
    cCtx.fillStyle = 'rgba(15, 15, 15, 0.78)';
    for (let b = 0; b < branches; b++) {
      let cx = 7 + Math.floor((rCrack() - 0.5) * 4);
      let cy = 7 + Math.floor((rCrack() - 0.5) * 4);
      const steps = 2 + stage;
      for (let s = 0; s < steps; s++) {
        cCtx.fillRect(cx, cy, 1, 1);
        cx = Math.max(0, Math.min(15, cx + Math.floor(rCrack() * 3) - 1));
        cy = Math.max(0, Math.min(15, cy + Math.floor(rCrack() * 3) - 1));
      }
    }
    const tex = new THREE.CanvasTexture(cCanvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    crackTextures.push(tex);
  }

  // Generate crisp 32x32 UI icons for every ItemId
  const itemIcons: Record<number, string> = {};
  const iconCanvas = document.createElement('canvas');
  iconCanvas.width = 32;
  iconCanvas.height = 32;
  const iCtx = iconCanvas.getContext('2d')!;
  iCtx.imageSmoothingEnabled = false;

  for (const key of Object.keys(ITEMS)) {
    const id = Number(key) as ItemId;
    const item = ITEMS[id];
    iCtx.clearRect(0, 0, 32, 32);

    if (item.blockId !== undefined) {
      const def = BLOCKS[item.blockId as BlockId];
      const drawTileSkew = (
        tileIdx: number,
        a: number,
        b: number,
        c: number,
        d: number,
        e: number,
        f: number,
        shade: string | null,
      ) => {
        const sx = (tileIdx % ATLAS_GRID) * TILE_PX;
        const sy = Math.floor(tileIdx / ATLAS_GRID) * TILE_PX;
        iCtx.save();
        iCtx.setTransform(a, b, c, d, e, f);
        iCtx.drawImage(canvas, sx, sy, TILE_PX, TILE_PX, 0, 0, 16, 16);
        if (shade) {
          iCtx.fillStyle = shade;
          iCtx.fillRect(0, 0, 16, 16);
        }
        iCtx.restore();
      };
      drawTileSkew(def.tiles.top, 0.82, 0.42, -0.82, 0.42, 16, 2.2, null);
      drawTileSkew(def.tiles.front ?? def.tiles.side, 0.82, 0.42, 0, 0.9, 2.9, 8.9, 'rgba(0,0,0,0.16)');
      drawTileSkew(def.tiles.side, 0.82, -0.42, 0, 0.9, 16, 15.6, 'rgba(0,0,0,0.34)');
    } else {
      drawItemSprite(iCtx, id, item.color, item.toolKind, item.armorSlot);
    }

    itemIcons[id] = iconCanvas.toDataURL('image/png');
  }

  return { atlasCanvas: canvas, atlasTexture, crackTextures, itemIcons };
}

function drawItemSprite(
  ctx: CanvasRenderingContext2D,
  id: ItemId,
  color: string,
  toolKind?: string,
  armorSlot?: string,
) {
  const px = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x * 2, y * 2, w * 2, h * 2);
  };

  if (id === ItemId.Stick) {
    for (let i = 2; i < 14; i++) px(i, 15 - i, 2, 2, i % 2 === 0 ? '#7d5b32' : '#9c7342');
    return;
  }
  if (id === ItemId.Coal) {
    px(4, 4, 8, 8, '#262626');
    px(5, 3, 5, 10, '#1b1b1b');
    px(5, 5, 2, 2, '#474747');
    return;
  }
  if (id === ItemId.IronIngot || id === ItemId.GoldIngot || id === ItemId.CopperIngot) {
    px(3, 6, 10, 5, '#595959');
    px(4, 5, 8, 5, color);
    px(5, 6, 5, 2, '#ffffff88');
    return;
  }
  if (id === ItemId.Diamond || id === ItemId.EnderPearl) {
    px(4, 4, 8, 8, color);
    px(5, 3, 6, 10, color);
    px(6, 5, 3, 3, '#ffffffaa');
    return;
  }
  if (id === ItemId.RedstoneDust) {
    px(5, 5, 6, 6, '#e01e1e');
    px(4, 8, 3, 3, '#ff4d4d');
    px(9, 7, 3, 3, '#b81414');
    return;
  }
  if (id === ItemId.Flint) {
    px(5, 4, 6, 8, '#383840');
    px(4, 7, 7, 5, '#52525c');
    return;
  }
  if (id === ItemId.Feather) {
    for (let i = 3; i < 13; i++) px(i, 15 - i, 2, 2, '#f5f5f5');
    px(8, 3, 4, 5, '#ffffff');
    return;
  }
  if (id === ItemId.String) {
    px(4, 4, 8, 2, '#e8e8e8');
    px(4, 4, 2, 8, '#d4d4d4');
    px(6, 9, 6, 2, '#e8e8e8');
    return;
  }
  if (id === ItemId.Leather) {
    px(3, 3, 10, 10, '#9c5a34');
    px(5, 5, 6, 6, '#b56d43');
    return;
  }
  if (id === ItemId.RawMeat || id === ItemId.CookedMeat) {
    px(3, 5, 10, 7, color);
    px(5, 6, 5, 3, id === ItemId.CookedMeat ? '#a35634' : '#e08080');
    px(3, 5, 2, 2, '#f0e2d0');
    return;
  }
  if (id === ItemId.Apple) {
    px(7, 2, 2, 2, '#5c3c1e');
    px(9, 2, 2, 1, '#4d9c30');
    px(4, 4, 8, 9, '#d12626');
    px(3, 5, 10, 6, '#e03535');
    px(5, 6, 2, 2, '#ff8e8e');
    return;
  }
  if (id === ItemId.Arrow) {
    for (let i = 3; i < 12; i++) px(i, 15 - i, 1, 2, '#7d5b32');
    px(11, 2, 3, 3, '#b8b8c2');
    px(2, 11, 3, 3, '#f2f2f2');
    return;
  }

  if (toolKind === 'pickaxe') {
    for (let i = 2; i < 12; i++) px(i, 15 - i, 1, 2, '#7d5b32');
    px(4, 2, 7, 2, color);
    px(10, 3, 3, 2, color);
    px(12, 5, 2, 6, color);
    px(6, 2, 3, 1, '#ffffff55');
    return;
  }
  if (toolKind === 'axe') {
    for (let i = 2; i < 12; i++) px(i, 15 - i, 1, 2, '#7d5b32');
    px(7, 2, 5, 4, color);
    px(9, 6, 4, 3, color);
    return;
  }
  if (toolKind === 'shovel') {
    for (let i = 2; i < 11; i++) px(i, 15 - i, 1, 2, '#7d5b32');
    px(10, 2, 4, 4, color);
    return;
  }
  if (toolKind === 'hoe') {
    for (let i = 2; i < 12; i++) px(i, 15 - i, 1, 2, '#7d5b32');
    px(7, 2, 6, 2, color);
    px(11, 4, 2, 3, color);
    return;
  }
  if (toolKind === 'sword') {
    px(2, 12, 2, 2, '#6f4e27');
    px(4, 10, 2, 2, '#3d3d3d');
    px(5, 11, 2, 2, '#3d3d3d');
    for (let i = 5; i < 14; i++) px(i, 15 - i, 2, 2, color);
    return;
  }
  if (toolKind === 'bow') {
    px(4, 2, 2, 12, '#dcdcdc');
    px(6, 2, 3, 2, color);
    px(9, 4, 2, 8, color);
    px(6, 12, 3, 2, color);
    return;
  }
  if (toolKind === 'crossbow') {
    px(3, 7, 10, 2, '#7a5932');
    px(9, 3, 2, 10, '#8c8c8c');
    px(4, 3, 6, 1, '#dcdcdc');
    px(4, 12, 6, 1, '#dcdcdc');
    return;
  }
  if (toolKind === 'shield') {
    px(3, 2, 10, 12, '#7a5932');
    px(4, 3, 8, 10, color);
    px(6, 5, 4, 6, '#c4c4c4');
    return;
  }

  // Armor icons
  if (armorSlot === 'helmet') {
    px(3, 4, 10, 8, color);
    px(5, 9, 6, 3, '#00000044');
    return;
  }
  if (armorSlot === 'chestplate') {
    px(2, 3, 12, 4, color);
    px(4, 4, 8, 9, color);
    return;
  }
  if (armorSlot === 'leggings') {
    px(4, 3, 8, 4, color);
    px(4, 7, 3, 7, color);
    px(9, 7, 3, 7, color);
    return;
  }
  if (armorSlot === 'boots') {
    px(3, 6, 4, 7, color);
    px(2, 10, 5, 3, color);
    px(9, 6, 4, 7, color);
    px(9, 10, 5, 3, color);
  }
}
