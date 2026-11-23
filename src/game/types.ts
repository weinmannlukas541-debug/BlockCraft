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
  Deepslate = 22,
  Gravel = 23,
  BirchLog = 24,
  BirchPlanks = 25,
  SpruceLog = 26,
  SprucePlanks = 27,
  SpruceLeaves = 28,
  RedstoneOre = 29,
  CopperOre = 30,
  Obsidian = 31,
  Lava = 32,
  Sandstone = 33,
  StoneBrick = 34,
  Ice = 35,
  Cactus = 36,
  Chest = 37,
  Bed = 38,
  Torch = 39,
  Bookshelf = 40,
  Lantern = 41,
  Farmland = 42,
}

export type ToolKind = 'none' | 'pickaxe' | 'axe' | 'shovel' | 'hoe' | 'sword' | 'bow' | 'crossbow' | 'shield';
export type ArmorSlot = 'helmet' | 'chestplate' | 'leggings' | 'boots';
export type SoundMaterial =
  | 'grass'
  | 'dirt'
  | 'stone'
  | 'wood'
  | 'sand'
  | 'glass'
  | 'leaves'
  | 'water'
  | 'snow'
  | 'lava';

export enum ItemId {
  // Placeable blocks match BlockId 1..42
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
  Deepslate = 22,
  Gravel = 23,
  BirchLog = 24,
  BirchPlanks = 25,
  SpruceLog = 26,
  SprucePlanks = 27,
  SpruceLeaves = 28,
  RedstoneOre = 29,
  CopperOre = 30,
  Obsidian = 31,
  Lava = 32,
  Sandstone = 33,
  StoneBrick = 34,
  Ice = 35,
  Cactus = 36,
  Chest = 37,
  Bed = 38,
  Torch = 39,
  Bookshelf = 40,
  Lantern = 41,
  Farmland = 42,

  // Resources & Food (101..129)
  Stick = 101,
  Coal = 102,
  IronIngot = 103,
  GoldIngot = 104,
  Diamond = 105,
  CopperIngot = 114,
  RedstoneDust = 115,
  Flint = 116,
  Feather = 117,
  String = 118,
  Leather = 119,
  RawMeat = 120,
  CookedMeat = 121,
  Apple = 113,
  Arrow = 122,
  EnderPearl = 123,

  // Tools & Weapons (130..170)
  WoodPickaxe = 106,
  StonePickaxe = 107,
  CopperPickaxe = 130,
  IronPickaxe = 108,
  GoldPickaxe = 131,
  DiamondPickaxe = 109,

  WoodAxe = 110,
  StoneAxe = 111,
  IronAxe = 132,
  DiamondAxe = 133,

  WoodShovel = 134,
  StoneShovel = 135,
  IronShovel = 136,
  DiamondShovel = 137,

  WoodHoe = 138,
  IronHoe = 139,

  WoodSword = 140,
  StoneSword = 141,
  IronSword = 142,
  GoldSword = 143,
  DiamondSword = 112,

  Bow = 144,
  Crossbow = 145,
  Shield = 146,

  // Armor (170..185)
  LeatherHelmet = 170,
  LeatherChestplate = 171,
  LeatherLeggings = 172,
  LeatherBoots = 173,
  IronHelmet = 174,
  IronChestplate = 175,
  IronLeggings = 176,
  IronBoots = 177,
  DiamondHelmet = 178,
  DiamondChestplate = 179,
  DiamondLeggings = 180,
  DiamondBoots = 181,
}

export interface ItemStack {
  id: ItemId;
  count: number;
  durability?: number;
}

export interface BlockDef {
  id: BlockId;
  name: string;
  hardness: number; // -1 = unbreakable
  preferredTool: ToolKind;
  requiresToolTier?: number; // 0=any, 1=wood, 2=stone, 3=iron, 4=diamond
  dropId?: ItemId;
  dropCount?: number;
  solid: boolean;
  transparent: boolean;
  alphaTest?: boolean;
  liquid?: boolean;
  emissive?: boolean;
  rotatable?: boolean;
  sound: SoundMaterial;
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
  toolTier?: number; // 1=wood, 2=stone/copper, 3=iron, 4=gold, 5=diamond
  miningMultiplier?: number;
  attackDamage?: number;
  maxDurability?: number;
  foodRestore?: number;
  armorSlot?: ArmorSlot;
  armorDefense?: number;
  color: string;
}

export interface CraftingRecipe {
  id: string;
  result: ItemStack;
  pattern?: string[];
  key?: Record<string, ItemId>;
  shapeless?: ItemId[];
  requiresTable?: boolean;
}

export interface SmeltRecipe {
  input: ItemId;
  output: ItemId;
  smeltTime: number;
}

export interface FurnaceState {
  input: ItemStack | null;
  fuel: ItemStack | null;
  output: ItemStack | null;
  burnTime: number;
  maxBurnTime: number;
  cookProgress: number;
}

export type BiomeId = 'plains' | 'forest' | 'desert' | 'snow' | 'mountains' | 'ocean';
export type WeatherType = 'clear' | 'rain' | 'snow' | 'storm';
export type GameMode = 'survival' | 'creative' | 'adventure' | 'spectator';
export type GameScreen =
  | 'title'
  | 'playing'
  | 'paused'
  | 'inventory'
  | 'crafting'
  | 'furnace'
  | 'chest'
  | 'gameover';

export interface GameSettings {
  renderDistance: number; // 2..5
  shadows: boolean;
  weatherParticles: boolean;
  showFps: boolean;
  fov: number; // 65..95
  sensitivity: number; // 0.5..2.0
  touchControls: boolean;
  muted: boolean;
}

export interface WorldSaveMeta {
  id: string;
  name: string;
  seed: number;
  gameMode: GameMode;
  keepInventory: boolean;
  dayCount: number;
  updatedAt: number;
}

export interface HudSnapshot {
  screen: GameScreen;
  gameMode: GameMode;
  keepInventory: boolean;
  worldId: string;
  worldName: string;
  health: number; // 0..20
  maxHealth: number;
  hunger: number; // 0..20
  air: number; // 0..20 (oxygen bubbles underwater)
  armorDefense: number; // 0..20
  xpLevel: number;
  xpProgress: number; // 0..1
  hotbar: (ItemStack | null)[];
  inventory: (ItemStack | null)[]; // 27 slots
  armor: (ItemStack | null)[]; // 4 slots: helmet, chest, legs, boots
  offhand: ItemStack | null; // shield slot
  selectedSlot: number; // 0..8
  timeOfDay: number; // 0..1
  dayCount: number;
  biome: BiomeId;
  weather: WeatherType;
  temperatureC: number;
  coords: { x: number; y: number; z: number };
  targetedBlockName: string | null;
  breakProgress: number; // 0..1
  isUnderwater: boolean;
  isFlying: boolean;
  isBlocking: boolean;
  fps: number;
  showDebug: boolean;
  settings: GameSettings;
  seed: number;
  activeFurnaceKey: string | null;
  activeFurnace: FurnaceState | null;
  activeChestKey: string | null;
  activeChestSlots: (ItemStack | null)[];
  statusToast: string | null;
  isFullscreen: boolean;
}
