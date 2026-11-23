import * as THREE from 'three';
import { BLOCKS, ITEMS, TILE } from './blocks';
import { BlockId, ItemId } from './types';

export const ATLAS_GRID = 16; // 16x16 tiles
export const TILE_PX = 16; // 16x16 pixels per tile
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
      const c = baseColors[Math.floor(rand() * baseColors.length)];
      ctx.fillStyle = c;
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
  // Canvas Y=0 is top, Three.js texture UV V=1 is top
  const eps = 0.001;
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

  // 1: Grass Side (Dirt base + grass overhang on top)
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
    const x = Math.floor(rStone() * 13);
    const y = Math.floor(rStone() * 16);
    fillRectTile(ctx, TILE.STONE, x, y, 3, 1, rStone() > 0.5 ? '#666666' : '#959595');
  }

  // 4: Cobblestone
  drawNoiseTile(ctx, TILE.COBBLESTONE, ['#767676', '#838383', '#6b6b6b'], 107);
  const mortar = '#4e4e4e';
  for (let y = 0; y < 16; y += 4) {
    fillRectTile(ctx, TILE.COBBLESTONE, 0, y, 16, 1, mortar);
    const offset = (y / 4) % 2 === 0 ? 0 : 4;
    for (let x = offset; x < 16; x += 6) {
      fillRectTile(ctx, TILE.COBBLESTONE, x, y, 1, 4, mortar);
      if (x + 1 < 16 && y + 1 < 16) {
        fillRectTile(ctx, TILE.COBBLESTONE, x + 1, y + 1, 3, 1, '#949494');
      }
    }
  }

  // 5: Oak Log Side
  drawNoiseTile(ctx, TILE.OAK_LOG_SIDE, ['#695031', '#5c4428', '#755a38'], 108);
  for (let x = 0; x < 16; x += 2) {
    for (let y = 0; y < 16; y++) {
      if ((x + y * 3) % 5 === 0) setPx(ctx, TILE.OAK_LOG_SIDE, x, y, '#4a351e');
      if ((x * 2 + y) % 7 === 0) setPx(ctx, TILE.OAK_LOG_SIDE, x, y, '#7e6340');
    }
  }

  // 6: Oak Log Top
  fillRectTile(ctx, TILE.OAK_LOG_TOP, 0, 0, 16, 16, '#5c4428');
  fillRectTile(ctx, TILE.OAK_LOG_TOP, 1, 1, 14, 14, '#c29d63');
  fillRectTile(ctx, TILE.OAK_LOG_TOP, 3, 3, 10, 10, '#ad8850');
  fillRectTile(ctx, TILE.OAK_LOG_TOP, 5, 5, 6, 6, '#c8a46b');
  fillRectTile(ctx, TILE.OAK_LOG_TOP, 7, 7, 2, 2, '#916e3c');

  // 7: Oak Planks
  drawNoiseTile(ctx, TILE.OAK_PLANKS, ['#ba9156', '#b1874d', '#c39a5f', '#a77e46'], 109);
  for (let y = 0; y < 16; y += 4) {
    fillRectTile(ctx, TILE.OAK_PLANKS, 0, y, 16, 1, '#845f32');
    const joint = ((y / 4) * 5 + 3) % 14 + 1;
    fillRectTile(ctx, TILE.OAK_PLANKS, joint, y, 1, 4, '#845f32');
  }

  // 8: Leaves (with alpha cutout holes)
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

  // 10: Glass (crisp border + translucent center + diagonal glint)
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

  // Ores (12..15)
  const ores: [number, string[], number][] = [
    [TILE.COAL_ORE, ['#242424', '#333333', '#191919'], 113],
    [TILE.IRON_ORE, ['#d8b89b', '#c49d7d', '#ecd2ba'], 114],
    [TILE.GOLD_ORE, ['#f7d33e', '#e3b21c', '#fff08a'], 115],
    [TILE.DIAMOND_ORE, ['#4be8ed', '#2cc4ca', '#a7fbff'], 116],
  ];
  for (const [tile, flecks, s] of ores) {
    drawNoiseTile(ctx, tile, ['#7d7d7d', '#868686', '#747474', '#8d8d8d'], 105);
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
  fillRectTile(ctx, TILE.CRAFT_SIDE, 4, 5, 3, 6, '#5c5c5c'); // saw/hammer silhouette
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
  fillRectTile(ctx, TILE.FURNACE_FRONT, 5, 11, 6, 3, '#e86f24'); // warm embers!
  fillRectTile(ctx, TILE.FURNACE_FRONT, 6, 12, 4, 2, '#ffd15c');

  // 23: Glowstone
  drawNoiseTile(ctx, TILE.GLOWSTONE, ['#f7d060', '#e5ad3a', '#ffeb99', '#c48324'], 123);
  for (let i = 0; i < 16; i += 4) {
    fillRectTile(ctx, TILE.GLOWSTONE, i, 0, 1, 16, '#9f651a');
    fillRectTile(ctx, TILE.GLOWSTONE, 0, i, 16, 1, '#9f651a');
  }

  // 24: Water
  drawNoiseTile(ctx, TILE.WATER, ['rgba(45,112,226,0.78)', 'rgba(54,126,238,0.78)', 'rgba(38,98,208,0.78)'], 124);
  fillRectTile(ctx, TILE.WATER, 2, 4, 5, 1, 'rgba(130, 192, 255, 0.8)');
  fillRectTile(ctx, TILE.WATER, 8, 11, 6, 1, 'rgba(130, 192, 255, 0.8)');

  // 25..26: Snow & Snow Side
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
  // Pixel "TNT" letters on band
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
      // Render isometric 3-face cube icon from atlas tiles!
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
      // Top diamond
      drawTileSkew(def.tiles.top, 0.82, 0.42, -0.82, 0.42, 16, 2.2, null);
      // Left face
      drawTileSkew(def.tiles.front ?? def.tiles.side, 0.82, 0.42, 0, 0.9, 2.9, 8.9, 'rgba(0,0,0,0.16)');
      // Right face
      drawTileSkew(def.tiles.side, 0.82, -0.42, 0, 0.9, 16, 15.6, 'rgba(0,0,0,0.34)');
    } else {
      // Pixel sprite for tools & resources
      drawItemSprite(iCtx, id, item.color);
    }

    itemIcons[id] = iconCanvas.toDataURL('image/png');
  }

  return { atlasCanvas: canvas, atlasTexture, crackTextures, itemIcons };
}

function drawItemSprite(ctx: CanvasRenderingContext2D, id: ItemId, color: string) {
  const px = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x * 2, y * 2, w * 2, h * 2);
  };

  if (id === ItemId.Stick) {
    for (let i = 2; i < 14; i++) {
      px(i, 15 - i, 2, 2, i % 2 === 0 ? '#7d5b32' : '#9c7342');
    }
    return;
  }
  if (id === ItemId.Coal) {
    px(4, 4, 8, 8, '#262626');
    px(5, 3, 5, 10, '#1b1b1b');
    px(5, 5, 2, 2, '#474747');
    return;
  }
  if (id === ItemId.IronIngot || id === ItemId.GoldIngot) {
    const dark = id === ItemId.GoldIngot ? '#b58412' : '#8a8a8a';
    const light = id === ItemId.GoldIngot ? '#fff08a' : '#ffffff';
    px(3, 6, 10, 5, dark);
    px(4, 5, 8, 5, color);
    px(5, 6, 5, 2, light);
    return;
  }
  if (id === ItemId.Diamond) {
    px(4, 4, 8, 8, '#29b9c0');
    px(5, 3, 6, 10, color);
    px(6, 5, 3, 3, '#c8feff');
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
  if (
    id === ItemId.WoodPickaxe ||
    id === ItemId.StonePickaxe ||
    id === ItemId.IronPickaxe ||
    id === ItemId.DiamondPickaxe
  ) {
    // Handle
    for (let i = 2; i < 12; i++) {
      px(i, 15 - i, 1, 2, '#7d5b32');
    }
    // Curved pick head
    px(4, 2, 7, 2, color);
    px(10, 3, 3, 2, color);
    px(12, 5, 2, 6, color);
    px(6, 2, 3, 1, '#ffffff55');
    return;
  }
  if (id === ItemId.WoodAxe || id === ItemId.StoneAxe) {
    for (let i = 2; i < 12; i++) {
      px(i, 15 - i, 1, 2, '#7d5b32');
    }
    px(7, 2, 5, 4, color);
    px(9, 6, 4, 3, color);
    return;
  }
  if (id === ItemId.DiamondSword) {
    px(2, 12, 2, 2, '#6f4e27');
    px(4, 10, 2, 2, '#2d7c82');
    px(5, 11, 2, 2, '#2d7c82');
    for (let i = 5; i < 14; i++) {
      px(i, 15 - i, 2, 2, color);
    }
    px(13, 2, 1, 1, '#ffffff');
    return;
  }
}
