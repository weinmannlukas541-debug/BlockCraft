export enum BlockId {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Cobblestone = 4,
  OakLog = 5,
  OakPlanks = 6,
  Leaves = 7,
  Sand = 8,
  Glass = 9,
  Brick = 10,
  CoalOre = 11,
  IronOre = 12,
  GoldOre = 13,
  DiamondOre = 14,
  Bedrock = 15,
  CraftingTable = 16,
  Furnace = 17,
  Glowstone = 18,
  Water = 19,
  Snow = 20,
  TNT = 21,
}

export type ToolKind = 'none' | 'pickaxe' | 'axe' | 'shovel' | 'sword';
export type SoundMaterial = 'grass' | 'dirt' | 'stone' | 'wood' | 'sand' | 'glass' | 'leaves' | 'water' | 'snow';

export enum ItemId {
  // Placeable blocks match BlockId values 1..21
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Cobblestone = 4,
  OakLog = 5,
  OakPlanks = 6,
  Leaves = 7,
  Sand = 8,
  Glass = 9,
  Brick = 10,
  CoalOre = 11,
  IronOre = 12,
  GoldOre = 13,
  DiamondOre = 14,
  Bedrock = 15,
  CraftingTable = 16,
  Furnace = 17,
  Glowstone = 18,
  Water = 19,
  Snow = 20,
  TNT = 21,

  // Resources & Tools (100+)
  Stick = 101,
  Coal = 102,
  IronIngot = 103,
  GoldIngot = 104,
  Diamond = 105,
  WoodPickaxe = 106,
  StonePickaxe = 107,
  IronPickaxe = 108,
  DiamondPickaxe = 109,
  WoodAxe = 110,
  StoneAxe = 111,
  DiamondSword = 112,
  Apple = 113,
}

export interface ItemStack {
  id: ItemId;
  count: number;
}

export interface BlockDef {
  id: BlockId;
  name: string;
  hardness: number; // seconds with bare hand (-1 = unbreakable)
  preferredTool: ToolKind;
  requiresPickaxe?: boolean;
  dropId?: ItemId;
  dropCount?: number;
  solid: boolean;
  transparent: boolean;
  alphaTest?: boolean;
  liquid?: boolean;
  emissive?: boolean;
  sound: SoundMaterial;
  // Tile indices in 16x16 atlas: [top, bottom, north(+z), south(-z), east(+x), west(-x)] or single/triple
  tiles: {
    top: number;
    bottom: number;
    side: number;
    front?: number;
  };
  particleColor: number;
}

export interface ItemDef {
  id: ItemId;
  name: string;
  blockId?: BlockId;
  maxStack: number;
  toolKind?: ToolKind;
  miningMultiplier?: number;
  attackDamage?: number;
  foodRestore?: number;
  color: string;
}

export interface CraftingRecipe {
  id: string;
  result: ItemStack;
  // Pattern rows (1..3 strings of 1..3 chars) or shapeless
  pattern?: string[];
  key?: Record<string, ItemId>;
  shapeless?: ItemId[];
  requiresTable?: boolean;
}

export type GameMode = 'survival' | 'creative';
export type GameScreen = 'title' | 'playing' | 'paused' | 'inventory' | 'crafting' | 'gameover';

export interface HudSnapshot {
  screen: GameScreen;
  gameMode: GameMode;
  health: number; // 0..20
  maxHealth: number;
  hunger: number; // 0..20
  xpLevel: number;
  xpProgress: number; // 0..1
  hotbar: (ItemStack | null)[];
  inventory: (ItemStack | null)[]; // 27 slots
  selectedSlot: number; // 0..8
  timeOfDay: number; // 0..1 (0.25 = noon, 0.75 = midnight)
  dayCount: number;
  coords: { x: number; y: number; z: number };
  targetedBlockName: string | null;
  breakProgress: number; // 0..1
  isUnderwater: boolean;
  isFlying: boolean;
  muted: boolean;
  showDebug: boolean;
  touchControls: boolean;
  seed: number;
}
