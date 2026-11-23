import { BlockDef, BlockId, CraftingRecipe, ItemDef, ItemId } from './types';

// Tile indices in our 16x16 (256x256px) texture atlas
export const TILE = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  COBBLESTONE: 4,
  OAK_LOG_SIDE: 5,
  OAK_LOG_TOP: 6,
  OAK_PLANKS: 7,
  LEAVES: 8,
  SAND: 9,
  GLASS: 10,
  BRICK: 11,
  COAL_ORE: 12,
  IRON_ORE: 13,
  GOLD_ORE: 14,
  DIAMOND_ORE: 15,
  BEDROCK: 16,
  CRAFT_TOP: 17,
  CRAFT_SIDE: 18,
  CRAFT_FRONT: 19,
  FURNACE_SIDE: 20,
  FURNACE_FRONT: 21,
  FURNACE_TOP: 22,
  GLOWSTONE: 23,
  WATER: 24,
  SNOW: 25,
  SNOW_SIDE: 26,
  TNT_SIDE: 27,
  TNT_TOP: 28,
  TNT_BOTTOM: 29,
} as const;

export const BLOCKS: Record<BlockId, BlockDef> = {
  [BlockId.Air]: {
    id: BlockId.Air,
    name: 'Luft',
    hardness: 0,
    preferredTool: 'none',
    solid: false,
    transparent: true,
    sound: 'stone',
    tiles: { top: 0, bottom: 0, side: 0 },
    particleColor: 0xffffff,
  },
  [BlockId.Grass]: {
    id: BlockId.Grass,
    name: 'Grasblock',
    hardness: 0.65,
    preferredTool: 'shovel',
    dropId: ItemId.Dirt,
    solid: true,
    transparent: false,
    sound: 'grass',
    tiles: { top: TILE.GRASS_TOP, bottom: TILE.DIRT, side: TILE.GRASS_SIDE },
    particleColor: 0x5ca338,
  },
  [BlockId.Dirt]: {
    id: BlockId.Dirt,
    name: 'Erde',
    hardness: 0.55,
    preferredTool: 'shovel',
    dropId: ItemId.Dirt,
    solid: true,
    transparent: false,
    sound: 'dirt',
    tiles: { top: TILE.DIRT, bottom: TILE.DIRT, side: TILE.DIRT },
    particleColor: 0x866043,
  },
  [BlockId.Stone]: {
    id: BlockId.Stone,
    name: 'Stein',
    hardness: 1.8,
    preferredTool: 'pickaxe',
    requiresPickaxe: true,
    dropId: ItemId.Cobblestone,
    solid: true,
    transparent: false,
    sound: 'stone',
    tiles: { top: TILE.STONE, bottom: TILE.STONE, side: TILE.STONE },
    particleColor: 0x7d7d7d,
  },
  [BlockId.Cobblestone]: {
    id: BlockId.Cobblestone,
    name: 'Bruchstein',
    hardness: 2.0,
    preferredTool: 'pickaxe',
    requiresPickaxe: true,
    dropId: ItemId.Cobblestone,
    solid: true,
    transparent: false,
    sound: 'stone',
    tiles: { top: TILE.COBBLESTONE, bottom: TILE.COBBLESTONE, side: TILE.COBBLESTONE },
    particleColor: 0x6f6f6f,
  },
  [BlockId.OakLog]: {
    id: BlockId.OakLog,
    name: 'Eichenholz',
    hardness: 1.4,
    preferredTool: 'axe',
    dropId: ItemId.OakLog,
    solid: true,
    transparent: false,
    sound: 'wood',
    tiles: { top: TILE.OAK_LOG_TOP, bottom: TILE.OAK_LOG_TOP, side: TILE.OAK_LOG_SIDE },
    particleColor: 0x6b5130,
  },
  [BlockId.OakPlanks]: {
    id: BlockId.OakPlanks,
    name: 'Eichenbretter',
    hardness: 1.2,
    preferredTool: 'axe',
    dropId: ItemId.OakPlanks,
    solid: true,
    transparent: false,
    sound: 'wood',
    tiles: { top: TILE.OAK_PLANKS, bottom: TILE.OAK_PLANKS, side: TILE.OAK_PLANKS },
    particleColor: 0xb68d53,
  },
  [BlockId.Leaves]: {
    id: BlockId.Leaves,
    name: 'Eichenlaub',
    hardness: 0.3,
    preferredTool: 'none',
    dropId: ItemId.Apple,
    dropCount: 1,
    solid: true,
    transparent: true,
    alphaTest: true,
    sound: 'leaves',
    tiles: { top: TILE.LEAVES, bottom: TILE.LEAVES, side: TILE.LEAVES },
    particleColor: 0x3b7d26,
  },
  [BlockId.Sand]: {
    id: BlockId.Sand,
    name: 'Sand',
    hardness: 0.5,
    preferredTool: 'shovel',
    dropId: ItemId.Sand,
    solid: true,
    transparent: false,
    sound: 'sand',
    tiles: { top: TILE.SAND, bottom: TILE.SAND, side: TILE.SAND },
    particleColor: 0xdccfa3,
  },
  [BlockId.Glass]: {
    id: BlockId.Glass,
    name: 'Glas',
    hardness: 0.4,
    preferredTool: 'none',
    dropId: ItemId.Glass,
    solid: true,
    transparent: true,
    sound: 'glass',
    tiles: { top: TILE.GLASS, bottom: TILE.GLASS, side: TILE.GLASS },
    particleColor: 0xc2e9f2,
  },
  [BlockId.Brick]: {
    id: BlockId.Brick,
    name: 'Ziegelstein',
    hardness: 2.0,
    preferredTool: 'pickaxe',
    requiresPickaxe: true,
    dropId: ItemId.Brick,
    solid: true,
    transparent: false,
    sound: 'stone',
    tiles: { top: TILE.BRICK, bottom: TILE.BRICK, side: TILE.BRICK },
    particleColor: 0x9b4d3b,
  },
  [BlockId.CoalOre]: {
    id: BlockId.CoalOre,
    name: 'Steinkohle-Erz',
    hardness: 2.2,
    preferredTool: 'pickaxe',
    requiresPickaxe: true,
    dropId: ItemId.Coal,
    solid: true,
    transparent: false,
    sound: 'stone',
    tiles: { top: TILE.COAL_ORE, bottom: TILE.COAL_ORE, side: TILE.COAL_ORE },
    particleColor: 0x343434,
  },
  [BlockId.IronOre]: {
    id: BlockId.IronOre,
    name: 'Eisenerz',
    hardness: 2.5,
    preferredTool: 'pickaxe',
    requiresPickaxe: true,
    dropId: ItemId.IronIngot,
    solid: true,
    transparent: false,
    sound: 'stone',
    tiles: { top: TILE.IRON_ORE, bottom: TILE.IRON_ORE, side: TILE.IRON_ORE },
    particleColor: 0xd1b39b,
  },
  [BlockId.GoldOre]: {
    id: BlockId.GoldOre,
    name: 'Golderz',
    hardness: 2.6,
    preferredTool: 'pickaxe',
    requiresPickaxe: true,
    dropId: ItemId.GoldIngot,
    solid: true,
    transparent: false,
    sound: 'stone',
    tiles: { top: TILE.GOLD_ORE, bottom: TILE.GOLD_ORE, side: TILE.GOLD_ORE },
    particleColor: 0xf6d343,
  },
  [BlockId.DiamondOre]: {
    id: BlockId.DiamondOre,
    name: 'Diamanterz',
    hardness: 3.0,
    preferredTool: 'pickaxe',
    requiresPickaxe: true,
    dropId: ItemId.Diamond,
    solid: true,
    transparent: false,
    sound: 'stone',
    tiles: { top: TILE.DIAMOND_ORE, bottom: TILE.DIAMOND_ORE, side: TILE.DIAMOND_ORE },
    particleColor: 0x5de6eb,
  },
  [BlockId.Bedrock]: {
    id: BlockId.Bedrock,
    name: 'Grundgestein',
    hardness: -1,
    preferredTool: 'none',
    solid: true,
    transparent: false,
    sound: 'stone',
    tiles: { top: TILE.BEDROCK, bottom: TILE.BEDROCK, side: TILE.BEDROCK },
    particleColor: 0x383838,
  },
  [BlockId.CraftingTable]: {
    id: BlockId.CraftingTable,
    name: 'Werkbank',
    hardness: 1.2,
    preferredTool: 'axe',
    dropId: ItemId.CraftingTable,
    solid: true,
    transparent: false,
    sound: 'wood',
    tiles: {
      top: TILE.CRAFT_TOP,
      bottom: TILE.OAK_PLANKS,
      side: TILE.CRAFT_SIDE,
      front: TILE.CRAFT_FRONT,
    },
    particleColor: 0x9e6f3d,
  },
  [BlockId.Furnace]: {
    id: BlockId.Furnace,
    name: 'Ofen',
    hardness: 2.0,
    preferredTool: 'pickaxe',
    requiresPickaxe: true,
    dropId: ItemId.Furnace,
    solid: true,
    transparent: false,
    sound: 'stone',
    tiles: {
      top: TILE.FURNACE_TOP,
      bottom: TILE.FURNACE_TOP,
      side: TILE.FURNACE_SIDE,
      front: TILE.FURNACE_FRONT,
    },
    particleColor: 0x6b6b6b,
  },
  [BlockId.Glowstone]: {
    id: BlockId.Glowstone,
    name: 'Leuchtstein',
    hardness: 0.6,
    preferredTool: 'none',
    dropId: ItemId.Glowstone,
    solid: true,
    transparent: false,
    emissive: true,
    sound: 'glass',
    tiles: { top: TILE.GLOWSTONE, bottom: TILE.GLOWSTONE, side: TILE.GLOWSTONE },
    particleColor: 0xfad66c,
  },
  [BlockId.Water]: {
    id: BlockId.Water,
    name: 'Wasser',
    hardness: -1,
    preferredTool: 'none',
    solid: false,
    transparent: true,
    liquid: true,
    sound: 'water',
    tiles: { top: TILE.WATER, bottom: TILE.WATER, side: TILE.WATER },
    particleColor: 0x2f74e0,
  },
  [BlockId.Snow]: {
    id: BlockId.Snow,
    name: 'Schneeblock',
    hardness: 0.45,
    preferredTool: 'shovel',
    dropId: ItemId.Snow,
    solid: true,
    transparent: false,
    sound: 'snow',
    tiles: { top: TILE.SNOW, bottom: TILE.DIRT, side: TILE.SNOW_SIDE },
    particleColor: 0xf2f8ff,
  },
  [BlockId.TNT]: {
    id: BlockId.TNT,
    name: 'TNT',
    hardness: 0.25,
    preferredTool: 'none',
    dropId: ItemId.TNT,
    solid: true,
    transparent: false,
    sound: 'grass',
    tiles: { top: TILE.TNT_TOP, bottom: TILE.TNT_BOTTOM, side: TILE.TNT_SIDE },
    particleColor: 0xd8342a,
  },
};

export const ITEMS: Record<ItemId, ItemDef> = {
  [ItemId.Grass]: { id: ItemId.Grass, name: 'Grasblock', blockId: BlockId.Grass, maxStack: 64, color: '#5ca338' },
  [ItemId.Dirt]: { id: ItemId.Dirt, name: 'Erde', blockId: BlockId.Dirt, maxStack: 64, color: '#866043' },
  [ItemId.Stone]: { id: ItemId.Stone, name: 'Stein', blockId: BlockId.Stone, maxStack: 64, color: '#7d7d7d' },
  [ItemId.Cobblestone]: { id: ItemId.Cobblestone, name: 'Bruchstein', blockId: BlockId.Cobblestone, maxStack: 64, color: '#6b6b6b' },
  [ItemId.OakLog]: { id: ItemId.OakLog, name: 'Eichenholz', blockId: BlockId.OakLog, maxStack: 64, color: '#6b5130' },
  [ItemId.OakPlanks]: { id: ItemId.OakPlanks, name: 'Eichenbretter', blockId: BlockId.OakPlanks, maxStack: 64, color: '#b68d53' },
  [ItemId.Leaves]: { id: ItemId.Leaves, name: 'Eichenlaub', blockId: BlockId.Leaves, maxStack: 64, color: '#3b7d26' },
  [ItemId.Sand]: { id: ItemId.Sand, name: 'Sand', blockId: BlockId.Sand, maxStack: 64, color: '#dccfa3' },
  [ItemId.Glass]: { id: ItemId.Glass, name: 'Glas', blockId: BlockId.Glass, maxStack: 64, color: '#b6e6f2' },
  [ItemId.Brick]: { id: ItemId.Brick, name: 'Ziegelstein', blockId: BlockId.Brick, maxStack: 64, color: '#9b4d3b' },
  [ItemId.CoalOre]: { id: ItemId.CoalOre, name: 'Steinkohle-Erz', blockId: BlockId.CoalOre, maxStack: 64, color: '#4c4c4c' },
  [ItemId.IronOre]: { id: ItemId.IronOre, name: 'Eisenerz', blockId: BlockId.IronOre, maxStack: 64, color: '#b69783' },
  [ItemId.GoldOre]: { id: ItemId.GoldOre, name: 'Golderz', blockId: BlockId.GoldOre, maxStack: 64, color: '#ecc846' },
  [ItemId.DiamondOre]: { id: ItemId.DiamondOre, name: 'Diamanterz', blockId: BlockId.DiamondOre, maxStack: 64, color: '#58dfe3' },
  [ItemId.Bedrock]: { id: ItemId.Bedrock, name: 'Grundgestein', blockId: BlockId.Bedrock, maxStack: 64, color: '#333333' },
  [ItemId.CraftingTable]: { id: ItemId.CraftingTable, name: 'Werkbank', blockId: BlockId.CraftingTable, maxStack: 64, color: '#9e6f3d' },
  [ItemId.Furnace]: { id: ItemId.Furnace, name: 'Ofen', blockId: BlockId.Furnace, maxStack: 64, color: '#6b6b6b' },
  [ItemId.Glowstone]: { id: ItemId.Glowstone, name: 'Leuchtstein', blockId: BlockId.Glowstone, maxStack: 64, color: '#fad66c' },
  [ItemId.Water]: { id: ItemId.Water, name: 'Wasser', blockId: BlockId.Water, maxStack: 64, color: '#2f74e0' },
  [ItemId.Snow]: { id: ItemId.Snow, name: 'Schneeblock', blockId: BlockId.Snow, maxStack: 64, color: '#eef6ff' },
  [ItemId.TNT]: { id: ItemId.TNT, name: 'TNT', blockId: BlockId.TNT, maxStack: 64, color: '#d8342a' },

  [ItemId.Stick]: { id: ItemId.Stick, name: 'Stock', maxStack: 64, color: '#7a5a32' },
  [ItemId.Coal]: { id: ItemId.Coal, name: 'Kohle', maxStack: 64, color: '#2b2b2b' },
  [ItemId.IronIngot]: { id: ItemId.IronIngot, name: 'Eisenbarren', maxStack: 64, color: '#d8d8d8' },
  [ItemId.GoldIngot]: { id: ItemId.GoldIngot, name: 'Goldbarren', maxStack: 64, color: '#f7d547' },
  [ItemId.Diamond]: { id: ItemId.Diamond, name: 'Diamant', maxStack: 64, color: '#54edf2' },
  [ItemId.WoodPickaxe]: {
    id: ItemId.WoodPickaxe,
    name: 'Holzspitzhacke',
    maxStack: 1,
    toolKind: 'pickaxe',
    miningMultiplier: 2.2,
    attackDamage: 3,
    color: '#a67b45',
  },
  [ItemId.StonePickaxe]: {
    id: ItemId.StonePickaxe,
    name: 'Steinspitzhacke',
    maxStack: 1,
    toolKind: 'pickaxe',
    miningMultiplier: 3.6,
    attackDamage: 4,
    color: '#888888',
  },
  [ItemId.IronPickaxe]: {
    id: ItemId.IronPickaxe,
    name: 'Eisenspitzhacke',
    maxStack: 1,
    toolKind: 'pickaxe',
    miningMultiplier: 5.5,
    attackDamage: 5,
    color: '#dcdcdc',
  },
  [ItemId.DiamondPickaxe]: {
    id: ItemId.DiamondPickaxe,
    name: 'Diamantspitzhacke',
    maxStack: 1,
    toolKind: 'pickaxe',
    miningMultiplier: 8.5,
    attackDamage: 6,
    color: '#4de5ec',
  },
  [ItemId.WoodAxe]: {
    id: ItemId.WoodAxe,
    name: 'Holzaxt',
    maxStack: 1,
    toolKind: 'axe',
    miningMultiplier: 2.5,
    attackDamage: 4,
    color: '#a67b45',
  },
  [ItemId.StoneAxe]: {
    id: ItemId.StoneAxe,
    name: 'Steinaxt',
    maxStack: 1,
    toolKind: 'axe',
    miningMultiplier: 4.0,
    attackDamage: 5,
    color: '#888888',
  },
  [ItemId.DiamondSword]: {
    id: ItemId.DiamondSword,
    name: 'Diamantschwert',
    maxStack: 1,
    toolKind: 'sword',
    miningMultiplier: 1.5,
    attackDamage: 9,
    color: '#4de5ec',
  },
  [ItemId.Apple]: {
    id: ItemId.Apple,
    name: 'Apfel',
    maxStack: 64,
    foodRestore: 5,
    color: '#df2f2f',
  },
};

export const CREATIVE_PALETTE: ItemId[] = [
  ItemId.Grass,
  ItemId.Dirt,
  ItemId.Stone,
  ItemId.Cobblestone,
  ItemId.OakLog,
  ItemId.OakPlanks,
  ItemId.Leaves,
  ItemId.Sand,
  ItemId.Glass,
  ItemId.Brick,
  ItemId.CoalOre,
  ItemId.IronOre,
  ItemId.GoldOre,
  ItemId.DiamondOre,
  ItemId.CraftingTable,
  ItemId.Furnace,
  ItemId.Glowstone,
  ItemId.Snow,
  ItemId.TNT,
  ItemId.DiamondPickaxe,
  ItemId.DiamondSword,
  ItemId.StoneAxe,
  ItemId.Apple,
  ItemId.Stick,
  ItemId.Coal,
  ItemId.IronIngot,
  ItemId.GoldIngot,
  ItemId.Diamond,
];

export const RECIPES: CraftingRecipe[] = [
  {
    id: 'planks_from_log',
    shapeless: [ItemId.OakLog],
    result: { id: ItemId.OakPlanks, count: 4 },
  },
  {
    id: 'sticks_from_planks',
    pattern: ['P', 'P'],
    key: { P: ItemId.OakPlanks },
    result: { id: ItemId.Stick, count: 4 },
  },
  {
    id: 'crafting_table',
    pattern: ['PP', 'PP'],
    key: { P: ItemId.OakPlanks },
    result: { id: ItemId.CraftingTable, count: 1 },
  },
  {
    id: 'furnace',
    pattern: ['CCC', 'C C', 'CCC'],
    key: { C: ItemId.Cobblestone },
    result: { id: ItemId.Furnace, count: 1 },
    requiresTable: true,
  },
  {
    id: 'wood_pickaxe',
    pattern: ['PPP', ' S ', ' S '],
    key: { P: ItemId.OakPlanks, S: ItemId.Stick },
    result: { id: ItemId.WoodPickaxe, count: 1 },
    requiresTable: true,
  },
  {
    id: 'stone_pickaxe',
    pattern: ['CCC', ' S ', ' S '],
    key: { C: ItemId.Cobblestone, S: ItemId.Stick },
    result: { id: ItemId.StonePickaxe, count: 1 },
    requiresTable: true,
  },
  {
    id: 'iron_pickaxe',
    pattern: ['III', ' S ', ' S '],
    key: { I: ItemId.IronIngot, S: ItemId.Stick },
    result: { id: ItemId.IronPickaxe, count: 1 },
    requiresTable: true,
  },
  {
    id: 'diamond_pickaxe',
    pattern: ['DDD', ' S ', ' S '],
    key: { D: ItemId.Diamond, S: ItemId.Stick },
    result: { id: ItemId.DiamondPickaxe, count: 1 },
    requiresTable: true,
  },
  {
    id: 'wood_axe',
    pattern: ['PP', 'PS', ' S'],
    key: { P: ItemId.OakPlanks, S: ItemId.Stick },
    result: { id: ItemId.WoodAxe, count: 1 },
    requiresTable: true,
  },
  {
    id: 'stone_axe',
    pattern: ['CC', 'CS', ' S'],
    key: { C: ItemId.Cobblestone, S: ItemId.Stick },
    result: { id: ItemId.StoneAxe, count: 1 },
    requiresTable: true,
  },
  {
    id: 'diamond_sword',
    pattern: ['D', 'D', 'S'],
    key: { D: ItemId.Diamond, S: ItemId.Stick },
    result: { id: ItemId.DiamondSword, count: 1 },
    requiresTable: true,
  },
  {
    id: 'glowstone',
    pattern: ['CC', 'GG'],
    key: { C: ItemId.Coal, G: ItemId.GoldIngot },
    result: { id: ItemId.Glowstone, count: 2 },
  },
  {
    id: 'glass_from_sand',
    pattern: ['SS', 'SS'],
    key: { S: ItemId.Sand },
    result: { id: ItemId.Glass, count: 4 },
  },
  {
    id: 'brick_from_stone',
    pattern: ['CC', 'DD'],
    key: { C: ItemId.Cobblestone, D: ItemId.Dirt },
    result: { id: ItemId.Brick, count: 4 },
  },
  {
    id: 'tnt',
    pattern: ['CSC', 'SCS', 'CSC'],
    key: { C: ItemId.Coal, S: ItemId.Sand },
    result: { id: ItemId.TNT, count: 1 },
    requiresTable: true,
  },
];

export function matchCraftingRecipe(
  grid: (ItemId | null)[],
  gridSize: 2 | 3,
): CraftingRecipe | null {
  const nonEmpty: ItemId[] = [];
  for (let i = 0; i < grid.length; i++) {
    const id = grid[i];
    if (id !== null) nonEmpty.push(id);
  }
  if (nonEmpty.length === 0) return null;

  // Check shapeless recipes first
  for (const recipe of RECIPES) {
    if (recipe.requiresTable && gridSize < 3) continue;
    if (recipe.shapeless) {
      if (nonEmpty.length !== recipe.shapeless.length) continue;
      const sortedA = [...nonEmpty].sort((a, b) => a - b);
      const sortedB = [...recipe.shapeless].sort((a, b) => a - b);
      if (sortedA.every((v, idx) => v === sortedB[idx])) {
        return recipe;
      }
    }
  }

  // Trim bounding box of occupied cells for shaped recipes
  let minR: number = gridSize;
  let maxR = -1;
  let minC: number = gridSize;
  let maxC = -1;
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (grid[r * gridSize + c] !== null) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  const h = maxR - minR + 1;
  const w = maxC - minC + 1;

  for (const recipe of RECIPES) {
    if (recipe.requiresTable && gridSize < 3) continue;
    if (!recipe.pattern || !recipe.key) continue;
    const ph = recipe.pattern.length;
    const pw = recipe.pattern[0].length;
    if (ph !== h || pw !== w) continue;

    let matches = true;
    for (let r = 0; r < ph && matches; r++) {
      for (let c = 0; c < pw; c++) {
        const ch = recipe.pattern[r][c];
        const expected = ch === ' ' ? null : recipe.key[ch] ?? null;
        const actual = grid[(minR + r) * gridSize + (minC + c)];
        if (expected !== actual) {
          matches = false;
          break;
        }
      }
    }
    if (matches) return recipe;
  }

  return null;
}
