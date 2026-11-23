import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { soundEngine } from './audio';
import { BLOCKS, ITEMS, SMELT_RECIPES, getFuelBurnTime } from './blocks';
import {
  DropManager,
  FootprintPool,
  MobManager,
  ParticlePool,
  ProjectileManager,
} from './entities';
import { SkyEnvironment } from './sky';
import {
  WorldSavePayload,
  createWorldId,
  deleteWorldFromDB,
  listWorldMetasFromDB,
  loadSettings,
  loadWorldFromDB,
  saveSettings,
  saveWorldToDB,
} from './storage';
import { createVoxelTextures, GeneratedTextures } from './textures';
import {
  BlockId,
  FurnaceState,
  GameMode,
  GameScreen,
  GameSettings,
  HudSnapshot,
  ItemId,
  ItemStack,
  WeatherType,
  WorldSaveMeta,
} from './types';
import { RaycastHit, SEA_LEVEL, VoxelWorld, WORLD_HEIGHT } from './world';

const _vec3A = new THREE.Vector3();
const _lookDir = new THREE.Vector3();

const PLAYER_RADIUS = 0.28;
const PLAYER_HEIGHT = 1.78;
const EYE_HEIGHT = 1.58;

export class VoxelEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;

  private textures: GeneratedTextures;
  private opaqueMat: THREE.MeshStandardMaterial;
  private waterMat: THREE.MeshStandardMaterial;
  private waterUniforms = { uTime: { value: 0 } };
  private worldGroup = new THREE.Group();
  private world: VoxelWorld;
  private sky: SkyEnvironment;
  private particles: ParticlePool;
  private footprints: FootprintPool;
  private drops: DropManager;
  private projectiles: ProjectileManager;
  private mobs: MobManager;

  // Dynamic light near torches, lanterns, glowstones, lava
  private glowLight: THREE.PointLight;

  // Selection outline, placement preview ghost, and crack overlay
  private selectBox: THREE.LineSegments;
  private previewGroup: THREE.Group;
  private crackMesh: THREE.Mesh;
  private crackMats: THREE.MeshBasicMaterial[];

  // First-person held item / arm
  private handGroup = new THREE.Group();
  private handItemMesh: THREE.Group;
  private lastHandItemId: ItemId | null = null;
  private swingAnim = 0;

  // Pending TNT fuses
  private tntFuses: { x: number; y: number; z: number; timer: number }[] = [];

  // Containers (Furnaces & Chests)
  private furnaces = new Map<string, FurnaceState>();
  private chests = new Map<string, (ItemStack | null)[]>();
  private activeFurnaceKey: string | null = null;
  private activeChestKey: string | null = null;

  // Settings & World Metadata
  private settings: GameSettings = loadSettings();
  private worldId = createWorldId();
  private worldName = 'Meine Voxel-Welt';
  private keepInventory = false;
  private screen: GameScreen = 'title';
  private gameMode: GameMode = 'survival';
  private seed = 42197;
  private timeOfDay = 0.22;
  private dayCount = 1;
  private weather: WeatherType = 'clear';
  private weatherTimer = 140;

  // Player state
  private playerPos = new THREE.Vector3(8.5, 22, 8.5);
  private spawnPoint = new THREE.Vector3(8.5, 22, 8.5);
  private playerVel = new THREE.Vector3();
  private yaw = 0.4;
  private pitch = -0.1;
  private onGround = false;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private lastSpaceTap = 0;
  private lastWTap = 0;
  private isFlying = false;
  private isSprinting = false;
  private isUnderwater = false;
  private walkBob = 0;
  private stepDist = 0;
  private leftFootNext = true;
  private cameraShake = 0;
  private hitstopTimer = 0;
  private titleAngle = 0;

  // Survival stats
  private health = 20;
  private maxHealth = 20;
  private hunger = 20;
  private air = 20;
  private airTimer = 0;
  private lavaTimer = 0;
  private hungerTimer = 0;
  private xpLevel = 1;
  private xpProgress = 0.15;

  // Inventory (9 hotbar + 27 bag + 4 armor + offhand shield)
  private hotbar: (ItemStack | null)[] = new Array(9).fill(null);
  private inventory: (ItemStack | null)[] = new Array(27).fill(null);
  private armor: (ItemStack | null)[] = new Array(4).fill(null);
  private offhand: ItemStack | null = null;
  private selectedSlot = 0;
  private showDebug = false;
  private statusToast: string | null = null;
  private statusToastTimer = 0;

  // Input state
  private keys = new Set<string>();
  private mouseLeftDown = false;
  private mouseRightDown = false;
  private touchBlockHeld = false;
  private attackCooldown = 0;
  private placeCooldown = 0;

  // Touch / Mobile controls
  private touchMoveX = 0;
  private touchMoveY = 0;
  private touchJumpHeld = false;
  private touchDescendHeld = false;
  private touchSneak = false;
  private touchMineHeld = false;
  private lookPointerId: number | null = null;
  private lookLastX = 0;
  private lookLastY = 0;
  private lookMovedDist = 0;
  private touchHoldTimer: number | null = null;
  private touchHoldMining = false;

  // Mining progress
  private miningTarget: { bx: number; by: number; bz: number } | null = null;
  private miningProgress = 0;
  private digSoundTimer = 0;
  private currentHit: RaycastHit | null = null;

  // Loop, Auto-save, FPS & Fullscreen
  private frameId = 0;
  private lastTime = performance.now();
  private hudTimer = 0;
  private autoSaveTimer = 0;
  private fpsFrames = 0;
  private fpsAccum = 0;
  private currentFps = 60;
  private isFullscreen = false;
  private disposed = false;
  private onHudUpdate: (snap: HudSnapshot) => void;
  private pendingPointerLock = false;

  constructor(container: HTMLElement, onHudUpdate: (snap: HudSnapshot) => void) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    soundEngine.muted = this.settings.muted;

    // 1. Software WebGL probe
    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // 2. Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && this.settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // 3. Scene & Studio RoomEnvironment
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x78b4ff);
    this.scene.fog = new THREE.Fog(0x78b4ff, 26, 62);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.25;
    pmrem.dispose();

    // 4. Camera
    const aspect =
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, aspect, 0.08, 240);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // 5. Procedural Textures & Materials (incl. gentle Water wave shader)
    this.textures = createVoxelTextures(this.renderer.capabilities.getMaxAnisotropy());
    this.opaqueMat = new THREE.MeshStandardMaterial({
      map: this.textures.atlasTexture,
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.04,
      alphaTest: 0.5,
      side: THREE.FrontSide,
    });
    this.waterMat = new THREE.MeshStandardMaterial({
      map: this.textures.atlasTexture,
      vertexColors: true,
      roughness: 0.22,
      metalness: 0.08,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.waterMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.waterUniforms.uTime;
      shader.vertexShader =
        'uniform float uTime;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float wFrac = fract(position.y);
           if (wFrac > 0.78 && wFrac < 0.94) {
             transformed.y += sin(position.x * 1.6 + uTime * 2.5) * 0.04 + cos(position.z * 1.6 + uTime * 2.1) * 0.04;
           }`,
        );
    };

    // 6. World, Sky, Particles, Footprints, Drops, Projectiles, Mobs
    this.scene.add(this.worldGroup);
    this.world = this.createWorldInstance(this.seed);
    this.sky = new SkyEnvironment(this.scene, this.isSoftwareGl, this.settings.shadows);
    this.particles = new ParticlePool(this.scene);
    this.footprints = new FootprintPool(this.scene);
    this.drops = new DropManager(this.scene);
    this.projectiles = new ProjectileManager(this.scene);
    this.mobs = new MobManager(this.scene);

    this.glowLight = new THREE.PointLight(0xffcb6b, 0, 15, 1.5);
    this.scene.add(this.glowLight);

    // 7. Block Selection Wireframe, Placement Preview Ghost & Crack Mesh
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    this.selectBox = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.85 }),
    );
    this.selectBox.visible = false;
    this.scene.add(this.selectBox);

    this.previewGroup = new THREE.Group();
    const previewFill = new THREE.Mesh(
      new THREE.BoxGeometry(0.996, 0.996, 0.996),
      new THREE.MeshBasicMaterial({
        color: 0x72d5ff,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    const previewWire = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
      new THREE.LineBasicMaterial({ color: 0x99e6ff, transparent: true, opacity: 0.65 }),
    );
    this.previewGroup.add(previewFill, previewWire);
    this.previewGroup.visible = false;
    this.scene.add(this.previewGroup);

    this.crackMats = this.textures.crackTextures.map(
      (tex) =>
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
    );
    this.crackMesh = new THREE.Mesh(new THREE.BoxGeometry(1.006, 1.006, 1.006), this.crackMats[0]);
    this.crackMesh.visible = false;
    this.scene.add(this.crackMesh);

    // 8. First-Person Held ViewModel
    this.handItemMesh = new THREE.Group();
    this.handGroup.add(this.handItemMesh);
    this.handGroup.position.set(0.42, -0.34, -0.58);
    this.camera.add(this.handGroup);

    // 9. Spawn & Prebuild World
    this.initStarterInventory('survival');
    this.spawnPlayerSafe(true);
    this.world.prebuildAround(this.playerPos.x, this.playerPos.z, this.settings.renderDistance);
    this.mobs.spawnInitialMobs(this.world, this.playerPos.x, this.playerPos.z);
    this.rebuildHandModel();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.emitHud();
    this.startLoop();
  }

  private createWorldInstance(seed: number): VoxelWorld {
    const w = new VoxelWorld(
      seed,
      this.worldGroup,
      this.opaqueMat,
      this.waterMat,
      !this.isSoftwareGl && this.settings.shadows,
    );
    w.onSeedChestLoot = (key, items) => {
      if (!this.chests.has(key)) {
        this.chests.set(key, items);
      }
    };
    return w;
  }

  public getItemIcons(): Record<number, string> {
    return this.textures.itemIcons;
  }

  private showToast(msg: string) {
    this.statusToast = msg;
    this.statusToastTimer = 2.6;
    this.emitHud();
  }

  private initStarterInventory(mode: GameMode) {
    this.hotbar.fill(null);
    this.inventory.fill(null);
    this.armor.fill(null);
    this.offhand = null;

    if (mode === 'creative') {
      const starter: ItemId[] = [
        ItemId.Grass,
        ItemId.Stone,
        ItemId.OakPlanks,
        ItemId.Cobblestone,
        ItemId.Glass,
        ItemId.Brick,
        ItemId.Lantern,
        ItemId.OakLog,
        ItemId.TNT,
      ];
      starter.forEach((id, i) => {
        this.hotbar[i] = { id, count: 64 };
      });
    } else if (mode === 'adventure') {
      this.hotbar[0] = { id: ItemId.IronSword, count: 1, durability: ITEMS[ItemId.IronSword].maxDurability };
      this.hotbar[1] = { id: ItemId.Bow, count: 1, durability: ITEMS[ItemId.Bow].maxDurability };
      this.hotbar[2] = { id: ItemId.Arrow, count: 16 };
      this.hotbar[3] = { id: ItemId.IronPickaxe, count: 1, durability: ITEMS[ItemId.IronPickaxe].maxDurability };
      this.hotbar[4] = { id: ItemId.Torch, count: 8 };
      this.hotbar[5] = { id: ItemId.CookedMeat, count: 6 };
      this.offhand = { id: ItemId.Shield, count: 1, durability: ITEMS[ItemId.Shield].maxDurability };
    } else if (mode === 'survival') {
      this.hotbar[0] = {
        id: ItemId.WoodPickaxe,
        count: 1,
        durability: ITEMS[ItemId.WoodPickaxe].maxDurability,
      };
      this.hotbar[1] = {
        id: ItemId.WoodAxe,
        count: 1,
        durability: ITEMS[ItemId.WoodAxe].maxDurability,
      };
      this.hotbar[2] = { id: ItemId.OakPlanks, count: 16 };
      this.hotbar[3] = { id: ItemId.Cobblestone, count: 12 };
      this.hotbar[4] = { id: ItemId.Torch, count: 6 };
      this.hotbar[5] = { id: ItemId.Apple, count: 4 };
      this.hotbar[6] = { id: ItemId.Shield, count: 1, durability: ITEMS[ItemId.Shield].maxDurability };
    }
  }

  private spawnPlayerSafe(setAsSpawn = false) {
    let bestX = 8.5;
    let bestZ = 8.5;
    let bestY = this.world.getTerrainHeight(bestX, bestZ) + 1.05;
    for (let r = 0; r < 30; r += 2) {
      const y = this.world.getTerrainHeight(8.5 + r, 8.5 + r);
      if (y > SEA_LEVEL + 1) {
        bestX = 8.5 + r;
        bestZ = 8.5 + r;
        bestY = y + 1.05;
        break;
      }
    }
    this.playerPos.set(bestX, bestY, bestZ);
    if (setAsSpawn) {
      this.spawnPoint.copy(this.playerPos);
    }
    this.playerVel.set(0, 0, 0);
    this.health = this.maxHealth;
    this.hunger = 20;
    this.air = 20;
  }

  // ---- Save / Load / Worlds API ----
  public async getWorldList(): Promise<WorldSaveMeta[]> {
    return listWorldMetasFromDB();
  }

  public async saveCurrentWorld(withToast = true): Promise<void> {
    const payload: WorldSavePayload = {
      meta: {
        id: this.worldId,
        name: this.worldName,
        seed: this.seed,
        gameMode: this.gameMode,
        keepInventory: this.keepInventory,
        dayCount: this.dayCount,
        updatedAt: Date.now(),
      },
      player: {
        x: this.playerPos.x,
        y: this.playerPos.y,
        z: this.playerPos.z,
        yaw: this.yaw,
        pitch: this.pitch,
        health: this.health,
        hunger: this.hunger,
        air: this.air,
        xpLevel: this.xpLevel,
        xpProgress: this.xpProgress,
        isFlying: this.isFlying,
        spawnX: this.spawnPoint.x,
        spawnY: this.spawnPoint.y,
        spawnZ: this.spawnPoint.z,
        timeOfDay: this.timeOfDay,
        dayCount: this.dayCount,
      },
      hotbar: this.hotbar.map((s) => (s ? { ...s } : null)),
      inventory: this.inventory.map((s) => (s ? { ...s } : null)),
      armor: this.armor.map((s) => (s ? { ...s } : null)),
      offhand: this.offhand ? { ...this.offhand } : null,
      blockEdits: Array.from(this.world.blockEdits.entries()),
      blockRotations: Array.from(this.world.blockRotations.entries()),
      chests: Array.from(this.chests.entries()),
      furnaces: Array.from(this.furnaces.entries()),
    };
    await saveWorldToDB(payload);
    if (withToast) {
      this.showToast('Welt gespeichert!');
    }
  }

  public async createNewWorld(opts: {
    name: string;
    seed?: number;
    mode: GameMode;
    keepInventory: boolean;
  }): Promise<void> {
    soundEngine.playClick();
    this.worldId = createWorldId();
    this.worldName = opts.name.trim() || 'Neue Welt';
    this.seed = opts.seed || Math.floor(Math.random() * 899999 + 100000);
    this.gameMode = opts.mode;
    this.keepInventory = opts.keepInventory;
    this.isFlying = opts.mode === 'creative' || opts.mode === 'spectator';
    this.timeOfDay = 0.22;
    this.dayCount = 1;
    this.weather = 'clear';
    this.weatherTimer = 140;

    this.resetWorldObjects();
    this.world = this.createWorldInstance(this.seed);
    this.initStarterInventory(opts.mode);
    this.spawnPlayerSafe(true);
    this.world.prebuildAround(this.playerPos.x, this.playerPos.z, this.settings.renderDistance);
    this.mobs.spawnInitialMobs(this.world, this.playerPos.x, this.playerPos.z);
    this.rebuildHandModel();

    this.screen = 'playing';
    this.requestPointerLockSafe();
    await this.saveCurrentWorld(false);
    this.emitHud();
  }

  public async loadWorldById(worldId: string): Promise<boolean> {
    const data = await loadWorldFromDB(worldId);
    if (!data) return false;
    soundEngine.playClick();

    this.worldId = data.meta.id;
    this.worldName = data.meta.name;
    this.seed = data.meta.seed;
    this.gameMode = data.meta.gameMode;
    this.keepInventory = data.meta.keepInventory;

    this.resetWorldObjects();
    for (const [k, v] of data.chests) this.chests.set(k, v);
    for (const [k, v] of data.furnaces) this.furnaces.set(k, v);

    this.world = this.createWorldInstance(this.seed);
    for (const [k, bId] of data.blockEdits) {
      this.world.blockEdits.set(k, bId as BlockId);
    }
    for (const [k, rot] of data.blockRotations) {
      this.world.blockRotations.set(k, rot);
    }

    this.playerPos.set(data.player.x, data.player.y, data.player.z);
    this.spawnPoint.set(data.player.spawnX, data.player.spawnY, data.player.spawnZ);
    this.yaw = data.player.yaw;
    this.pitch = data.player.pitch;
    this.health = data.player.health;
    this.hunger = data.player.hunger;
    this.air = data.player.air ?? 20;
    this.xpLevel = data.player.xpLevel;
    this.xpProgress = data.player.xpProgress;
    this.isFlying = data.player.isFlying;
    this.timeOfDay = data.player.timeOfDay;
    this.dayCount = data.player.dayCount;

    this.hotbar = data.hotbar;
    this.inventory = data.inventory;
    this.armor = data.armor ?? new Array(4).fill(null);
    this.offhand = data.offhand ?? null;

    this.world.prebuildAround(this.playerPos.x, this.playerPos.z, this.settings.renderDistance);
    this.mobs.spawnInitialMobs(this.world, this.playerPos.x, this.playerPos.z);
    this.rebuildHandModel();

    this.screen = 'playing';
    this.requestPointerLockSafe();
    this.emitHud();
    return true;
  }

  public async deleteWorldById(worldId: string): Promise<void> {
    await deleteWorldFromDB(worldId);
  }

  private resetWorldObjects() {
    this.world.dispose();
    this.drops.dispose();
    this.projectiles.clear();
    this.mobs.clear();
    this.tntFuses = [];
    this.furnaces.clear();
    this.chests.clear();
    this.activeFurnaceKey = null;
    this.activeChestKey = null;
  }

  // ---- Settings & Fullscreen ----
  public updateSettings(partial: Partial<GameSettings>) {
    this.settings = { ...this.settings, ...partial };
    saveSettings(this.settings);

    soundEngine.muted = this.settings.muted;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && this.settings.shadows;
    this.sky.setShadowsEnabled(this.settings.shadows);
    this.world.setShadowsEnabled(!this.isSoftwareGl && this.settings.shadows);
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();

    if (this.settings.touchControls && document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
    this.emitHud();
  }

  public async toggleFullscreen() {
    soundEngine.playClick();
    try {
      const doc = document as Document & {
        webkitFullscreenElement?: Element;
        webkitExitFullscreen?: () => Promise<void>;
      };
      const el = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
      };
      if (!document.fullscreenElement && !doc.webkitFullscreenElement) {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      }
    } catch {
      this.showToast('Vollbild im eingebetteten Fenster blockiert');
    }
  }

  // ---- Public UI Actions ----
  public startGame(mode: GameMode) {
    soundEngine.playClick();
    if (this.screen === 'title' && this.gameMode !== mode) {
      this.initStarterInventory(mode);
    }
    this.gameMode = mode;
    this.isFlying = mode === 'creative' || mode === 'spectator';
    this.screen = 'playing';
    this.rebuildHandModel();
    this.requestPointerLockSafe();
    this.emitHud();
  }

  public resumeGame() {
    soundEngine.playClick();
    this.activeFurnaceKey = null;
    this.activeChestKey = null;
    this.screen = 'playing';
    this.requestPointerLockSafe();
    this.emitHud();
  }

  public openScreen(next: GameScreen) {
    if (next === 'title' && this.screen !== 'title') {
      void this.saveCurrentWorld(false);
    }
    this.screen = next;
    if (next !== 'playing' && document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
    this.keys.clear();
    this.mouseLeftDown = false;
    this.mouseRightDown = false;
    this.touchBlockHeld = false;
    this.emitHud();
  }

  public setGameMode(mode: GameMode) {
    soundEngine.playClick();
    this.gameMode = mode;
    if (mode === 'creative' || mode === 'spectator') {
      this.health = this.maxHealth;
      this.hunger = 20;
      this.air = 20;
      if (mode === 'spectator') this.isFlying = true;
    } else {
      this.isFlying = false;
    }
    this.emitHud();
  }

  public setTimePreset(timeOfDay: number) {
    soundEngine.playClick();
    this.timeOfDay = timeOfDay;
    this.emitHud();
  }

  public setWeather(weather: WeatherType) {
    soundEngine.playClick();
    this.weather = weather;
    this.weatherTimer = 150;
    this.emitHud();
  }

  public toggleMute() {
    this.updateSettings({ muted: !this.settings.muted });
    if (!this.settings.muted) soundEngine.playClick();
  }

  public toggleTouchControls() {
    soundEngine.playClick();
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.touchJumpHeld = false;
    this.touchDescendHeld = false;
    this.touchMineHeld = false;
    this.touchBlockHeld = false;
    this.touchSneak = false;
    this.updateSettings({ touchControls: !this.settings.touchControls });
  }

  public setTouchMove(x: number, y: number) {
    this.touchMoveX = THREE.MathUtils.clamp(x, -1, 1);
    this.touchMoveY = THREE.MathUtils.clamp(y, -1, 1);
  }

  public setTouchJump(held: boolean) {
    if (held && !this.touchJumpHeld) {
      const now = performance.now();
      if ((this.gameMode === 'creative' || this.gameMode === 'spectator') && now - this.lastSpaceTap < 300) {
        this.isFlying = !this.isFlying;
        this.playerVel.y = 0;
        this.emitHud();
      }
      this.lastSpaceTap = now;
      this.jumpBufferTimer = 0.14;
    }
    this.touchJumpHeld = held;
  }

  public setTouchDescend(held: boolean) {
    this.touchDescendHeld = held;
  }

  public toggleTouchSneak() {
    this.touchSneak = !this.touchSneak;
  }

  public setTouchMine(held: boolean) {
    this.touchMineHeld = held;
    if (held) {
      this.handlePrimaryClick();
    } else {
      this.resetMining();
    }
  }

  public setTouchBlock(held: boolean) {
    this.touchBlockHeld = held;
    this.emitHud();
  }

  public triggerTouchPlace() {
    this.handleSecondaryClick();
  }

  public respawnPlayer() {
    soundEngine.playClick();
    this.playerPos.copy(this.spawnPoint);
    this.playerVel.set(0, 0, 0);
    this.health = this.maxHealth;
    this.hunger = 20;
    this.air = 20;
    this.screen = 'playing';
    this.requestPointerLockSafe();
    this.emitHud();
  }

  public regenerateWorld(newSeed?: number) {
    void this.createNewWorld({
      name: this.worldName,
      seed: newSeed ?? Math.floor(Math.random() * 899999 + 100000),
      mode: this.gameMode,
      keepInventory: this.keepInventory,
    });
  }

  public selectHotbarSlot(index: number) {
    if (index < 0 || index > 8) return;
    this.selectedSlot = index;
    this.rebuildHandModel();
    this.emitHud();
  }

  public setSlotItem(
    area: 'hotbar' | 'inventory' | 'armor' | 'offhand',
    idx: number,
    stack: ItemStack | null,
  ) {
    const copy = stack ? { ...stack } : null;
    if (area === 'hotbar') this.hotbar[idx] = copy;
    else if (area === 'inventory') this.inventory[idx] = copy;
    else if (area === 'armor') this.armor[idx] = copy;
    else this.offhand = copy;
    this.rebuildHandModel();
    this.emitHud();
  }

  public setFurnaceSlot(slot: 'input' | 'fuel' | 'output', stack: ItemStack | null) {
    if (!this.activeFurnaceKey) return;
    const f = this.getOrCreateFurnace(this.activeFurnaceKey);
    f[slot] = stack ? { ...stack } : null;
    this.emitHud();
  }

  public setChestSlot(idx: number, stack: ItemStack | null) {
    if (!this.activeChestKey) return;
    const chest = this.getOrCreateChest(this.activeChestKey);
    chest[idx] = stack ? { ...stack } : null;
    this.emitHud();
  }

  public dropActiveItem() {
    const held = this.hotbar[this.selectedSlot];
    if (!held) return;
    this.dropStackFromUi(held);
    this.hotbar[this.selectedSlot] = null;
    this.rebuildHandModel();
    this.emitHud();
  }

  public dropStackFromUi(stack: ItemStack) {
    this.camera.getWorldDirection(_lookDir);
    this.drops.spawnDropWithVel(
      this.camera.position.x + _lookDir.x * 0.9,
      this.camera.position.y - 0.15,
      this.camera.position.z + _lookDir.z * 0.9,
      { ...stack },
      _lookDir.x * 4.5,
      2.2,
      _lookDir.z * 4.5,
    );
    soundEngine.playClick();
  }

  public giveCreativeItem(itemId: ItemId) {
    soundEngine.playClick();
    const def = ITEMS[itemId];
    const count = def.maxStack;
    const stack: ItemStack = {
      id: itemId,
      count,
      durability: def.maxDurability,
    };
    if (!this.hotbar[this.selectedSlot]) {
      this.hotbar[this.selectedSlot] = stack;
    } else {
      const emptyIdx = this.hotbar.findIndex((s) => s === null);
      if (emptyIdx !== -1) {
        this.hotbar[emptyIdx] = stack;
        this.selectedSlot = emptyIdx;
      } else {
        this.hotbar[this.selectedSlot] = stack;
      }
    }
    this.rebuildHandModel();
    this.emitHud();
  }

  public addItemToInventory(id: ItemId, count: number, durability?: number): boolean {
    const def = ITEMS[id];
    const maxStack = def?.maxStack ?? 64;
    let remaining = count;

    for (const list of [this.hotbar, this.inventory]) {
      for (let i = 0; i < list.length && remaining > 0; i++) {
        const slot = list[i];
        if (slot && slot.id === id && slot.count < maxStack) {
          const add = Math.min(remaining, maxStack - slot.count);
          slot.count += add;
          remaining -= add;
        }
      }
    }
    for (const list of [this.hotbar, this.inventory]) {
      for (let i = 0; i < list.length && remaining > 0; i++) {
        if (!list[i]) {
          const add = Math.min(remaining, maxStack);
          list[i] = {
            id,
            count: add,
            durability: durability ?? def?.maxDurability,
          };
          remaining -= add;
        }
      }
    }
    this.rebuildHandModel();
    this.emitHud();
    return remaining < count;
  }

  public consumeItemCount(id: ItemId, amount: number): boolean {
    let total = 0;
    for (const list of [this.hotbar, this.inventory]) {
      for (const s of list) {
        if (s && s.id === id) total += s.count;
      }
    }
    if (total < amount) return false;

    let rem = amount;
    for (const list of [this.hotbar, this.inventory]) {
      for (let i = 0; i < list.length && rem > 0; i++) {
        const s = list[i];
        if (s && s.id === id) {
          const take = Math.min(rem, s.count);
          s.count -= take;
          rem -= take;
          if (s.count <= 0) list[i] = null;
        }
      }
    }
    this.rebuildHandModel();
    this.emitHud();
    return true;
  }

  private getOrCreateFurnace(key: string): FurnaceState {
    let f = this.furnaces.get(key);
    if (!f) {
      f = { input: null, fuel: null, output: null, burnTime: 0, maxBurnTime: 0, cookProgress: 0 };
      this.furnaces.set(key, f);
    }
    return f;
  }

  private getOrCreateChest(key: string): (ItemStack | null)[] {
    let c = this.chests.get(key);
    if (!c) {
      c = new Array(27).fill(null);
      this.chests.set(key, c);
    }
    return c;
  }

  private damageHeldTool() {
    if (this.gameMode === 'creative') return;
    const held = this.hotbar[this.selectedSlot];
    if (!held) return;
    const def = ITEMS[held.id];
    if (!def.maxDurability) return;
    const cur = held.durability ?? def.maxDurability;
    if (cur - 1 <= 0) {
      this.hotbar[this.selectedSlot] = null;
      soundEngine.playBreak('wood');
      this.rebuildHandModel();
    } else {
      held.durability = cur - 1;
    }
  }

  private getArmorDefense(): number {
    let sum = 0;
    for (const a of this.armor) {
      if (a) sum += ITEMS[a.id]?.armorDefense ?? 0;
    }
    return Math.min(20, sum);
  }

  private isShieldBlocking(): boolean {
    const held = this.hotbar[this.selectedSlot];
    const hasShield =
      this.offhand?.id === ItemId.Shield || held?.id === ItemId.Shield;
    return hasShield && (this.mouseRightDown || this.touchBlockHeld);
  }

  private requestPointerLockSafe() {
    if (this.settings.touchControls) return;
    this.pendingPointerLock = true;
    try {
      const res = this.renderer.domElement.requestPointerLock?.() as unknown as
        | Promise<void>
        | undefined;
      if (res && typeof res.catch === 'function') {
        res.catch(() => {});
      }
    } catch {
      // Headless / iframe safe
    }
  }

  // ---- ViewModel Builder ----
  private rebuildHandModel() {
    const held = this.hotbar[this.selectedSlot];
    const itemId = held ? held.id : null;
    if (itemId === this.lastHandItemId && this.handItemMesh.children.length > 0) return;
    this.lastHandItemId = itemId;

    while (this.handItemMesh.children.length > 0) {
      const child = this.handItemMesh.children[0];
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      this.handItemMesh.remove(child);
    }

    if (!itemId) {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.16, 0.45),
        new THREE.MeshStandardMaterial({ color: 0xd19f7b, roughness: 0.78 }),
      );
      arm.rotation.set(-0.2, 0.25, 0);
      this.handItemMesh.add(arm);
      return;
    }

    const def = ITEMS[itemId];
    if (def.blockId !== undefined) {
      const mat = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.85,
        metalness: 0.05,
        transparent: def.blockId === BlockId.Glass || def.blockId === BlockId.Ice,
        opacity: def.blockId === BlockId.Glass || def.blockId === BlockId.Ice ? 0.6 : 1,
      });
      const cube = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), mat);
      cube.rotation.set(0.15, 0.55, 0);
      this.handItemMesh.add(cube);
      return;
    }

    const toolGroup = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a5932, roughness: 0.85 });
    const headMat = new THREE.MeshStandardMaterial({
      color: def.color,
      roughness: def.toolKind ? 0.35 : 0.7,
      metalness: (def.toolTier ?? 0) >= 3 ? 0.62 : 0.12,
    });

    if (def.toolKind === 'pickaxe') {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), woodMat);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.07, 0.06), headMat);
      head.position.set(0, 0.19, 0);
      const tipL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.06), headMat);
      tipL.position.set(-0.14, 0.14, 0);
      const tipR = tipL.clone();
      tipR.position.x = 0.14;
      toolGroup.add(handle, head, tipL, tipR);
    } else if (def.toolKind === 'axe') {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), woodMat);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.06), headMat);
      blade.position.set(-0.07, 0.14, 0);
      toolGroup.add(handle, blade);
    } else if (def.toolKind === 'shovel' || def.toolKind === 'hoe') {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), woodMat);
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(def.toolKind === 'hoe' ? 0.18 : 0.13, 0.12, 0.05),
        headMat,
      );
      blade.position.set(def.toolKind === 'hoe' ? -0.06 : 0, 0.2, 0);
      toolGroup.add(handle, blade);
    } else if (def.toolKind === 'sword') {
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.05), woodMat);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.07), headMat);
      guard.position.set(0, 0.08, 0);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.36, 0.04), headMat);
      blade.position.set(0, 0.28, 0);
      toolGroup.add(grip, guard, blade);
    } else if (def.toolKind === 'bow' || def.toolKind === 'crossbow') {
      const limb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.44, 0.06), woodMat);
      const str = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.42, 0.02),
        new THREE.MeshStandardMaterial({ color: 0xe6e6e6 }),
      );
      str.position.set(0, 0, 0.08);
      toolGroup.add(limb, str);
    } else if (def.toolKind === 'shield') {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.44, 0.05), woodMat);
      const boss = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.07), headMat);
      toolGroup.add(plank, boss);
    } else {
      const gem = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), headMat);
      toolGroup.add(gem);
    }
    toolGroup.rotation.set(-0.45, -0.35, 0.25);
    this.handItemMesh.add(toolGroup);
  }

  // ---- Event Listeners ----
  private onResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private onFullscreenChange = () => {
    const doc = document as Document & { webkitFullscreenElement?: Element };
    this.isFullscreen = Boolean(document.fullscreenElement || doc.webkitFullscreenElement);
    this.onResize();
    this.emitHud();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape') {
      if (
        this.screen === 'inventory' ||
        this.screen === 'crafting' ||
        this.screen === 'furnace' ||
        this.screen === 'chest'
      ) {
        this.resumeGame();
      } else if (this.screen === 'playing') {
        this.openScreen('paused');
      } else if (this.screen === 'paused') {
        this.resumeGame();
      }
      return;
    }

    if (this.screen === 'title') {
      if (e.code === 'Enter') {
        e.preventDefault();
        this.startGame('survival');
      }
      return;
    }

    if (e.code === 'KeyE') {
      if (this.screen === 'playing') {
        this.openScreen('inventory');
      } else if (
        this.screen === 'inventory' ||
        this.screen === 'crafting' ||
        this.screen === 'furnace' ||
        this.screen === 'chest'
      ) {
        this.resumeGame();
      }
      return;
    }

    if (this.screen !== 'playing') return;

    if (e.code === 'KeyQ' && !e.repeat) {
      this.dropActiveItem();
      return;
    }

    if (e.code === 'F3' || e.code === 'KeyH') {
      e.preventDefault();
      this.showDebug = !this.showDebug;
      this.emitHud();
      return;
    }

    if (e.code === 'KeyV') {
      this.toggleMute();
      return;
    }

    if (e.code.startsWith('Digit')) {
      const num = parseInt(e.code.slice(5), 10);
      if (num >= 1 && num <= 9) {
        this.selectHotbarSlot(num - 1);
      }
    }

    if (e.code === 'Space') {
      e.preventDefault();
      const now = performance.now();
      if (
        (this.gameMode === 'creative' || this.gameMode === 'spectator') &&
        !e.repeat &&
        now - this.lastSpaceTap < 280
      ) {
        this.isFlying = !this.isFlying;
        this.playerVel.y = 0;
        this.emitHud();
      }
      if (!e.repeat) {
        this.lastSpaceTap = now;
        this.jumpBufferTimer = 0.14;
      }
    }

    if (e.code === 'KeyW' && !e.repeat) {
      const now = performance.now();
      if (now - this.lastWTap < 280) this.isSprinting = true;
      this.lastWTap = now;
    }

    if (e.code === 'ControlLeft' || e.code === 'KeyR') {
      this.isSprinting = true;
    }

    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === 'KeyW') {
      if (!this.keys.has('ControlLeft') && !this.keys.has('KeyR')) {
        this.isSprinting = false;
      }
    }
    if (e.code === 'ControlLeft' || e.code === 'KeyR') {
      this.isSprinting = false;
    }
  };

  private onBlur = () => {
    this.keys.clear();
    this.mouseLeftDown = false;
    this.mouseRightDown = false;
    this.touchBlockHeld = false;
    this.isSprinting = false;
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.touchJumpHeld = false;
    this.touchDescendHeld = false;
    this.touchMineHeld = false;
    this.clearTouchLook();
  };

  private clearTouchLook() {
    this.lookPointerId = null;
    if (this.touchHoldTimer !== null) {
      window.clearTimeout(this.touchHoldTimer);
      this.touchHoldTimer = null;
    }
    if (this.touchHoldMining) {
      this.touchHoldMining = false;
      this.resetMining();
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.screen !== 'playing') return;
    if (e.pointerType !== 'touch' && !this.settings.touchControls) return;
    if (this.lookPointerId !== null) return;

    this.lookPointerId = e.pointerId;
    this.lookLastX = e.clientX;
    this.lookLastY = e.clientY;
    this.lookMovedDist = 0;

    if (this.touchHoldTimer !== null) window.clearTimeout(this.touchHoldTimer);
    this.touchHoldTimer = window.setTimeout(() => {
      this.touchHoldTimer = null;
      if (
        this.lookPointerId === e.pointerId &&
        this.lookMovedDist < 14 &&
        this.screen === 'playing'
      ) {
        this.touchHoldMining = true;
        this.handlePrimaryClick();
      }
    }, 260);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.screen !== 'playing') return;
    if (
      (e.pointerType !== 'touch' && !this.settings.touchControls) ||
      e.pointerId !== this.lookPointerId
    )
      return;

    const dx = e.clientX - this.lookLastX;
    const dy = e.clientY - this.lookLastY;
    this.lookLastX = e.clientX;
    this.lookLastY = e.clientY;
    this.lookMovedDist += Math.hypot(dx, dy);

    if (this.lookMovedDist >= 14 && this.touchHoldTimer !== null) {
      window.clearTimeout(this.touchHoldTimer);
      this.touchHoldTimer = null;
    }

    const sensitivity = 0.0042 * this.settings.sensitivity;
    this.yaw -= dx * sensitivity;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - dy * sensitivity,
      -Math.PI / 2 + 0.01,
      Math.PI / 2 - 0.01,
    );
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId === this.lookPointerId) {
      this.clearTouchLook();
    }
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.screen !== 'playing' || this.settings.touchControls) return;
    if (
      document.pointerLockElement === this.renderer.domElement ||
      this.mouseLeftDown ||
      this.mouseRightDown
    ) {
      const sensitivity = 0.0022 * this.settings.sensitivity;
      this.yaw -= e.movementX * sensitivity;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - e.movementY * sensitivity,
        -Math.PI / 2 + 0.01,
        Math.PI / 2 - 0.01,
      );
    }
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.screen !== 'playing' || this.settings.touchControls) return;
    if (document.pointerLockElement !== this.renderer.domElement) {
      this.requestPointerLockSafe();
    }

    if (e.button === 0) {
      this.mouseLeftDown = true;
      this.handlePrimaryClick();
    } else if (e.button === 2) {
      this.mouseRightDown = true;
      this.handleSecondaryClick();
    } else if (e.button === 1) {
      e.preventDefault();
      this.handlePickBlock();
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.mouseLeftDown = false;
      this.resetMining();
    } else if (e.button === 2) {
      this.mouseRightDown = false;
    }
  };

  private onWheel = (e: WheelEvent) => {
    if (this.screen !== 'playing') return;
    const dir = e.deltaY > 0 ? 1 : -1;
    this.selectHotbarSlot((this.selectedSlot + dir + 9) % 9);
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private onPointerLockChange = () => {
    if (this.settings.touchControls) return;
    const locked = document.pointerLockElement === this.renderer.domElement;
    if (locked) {
      this.pendingPointerLock = false;
    } else if (this.screen === 'playing' && !this.pendingPointerLock) {
      this.openScreen('paused');
    }
  };

  private bindEvents() {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', this.onFullscreenChange);

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    dom.addEventListener('mousemove', this.onMouseMove);
    dom.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    dom.addEventListener('wheel', this.onWheel, { passive: true });
    dom.addEventListener('contextmenu', this.onContextMenu);
  }

  private unbindEvents() {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', this.onFullscreenChange);

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    dom.removeEventListener('mousemove', this.onMouseMove);
    dom.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    dom.removeEventListener('wheel', this.onWheel);
    dom.removeEventListener('contextmenu', this.onContextMenu);
  }

  // ---- Interactions ----
  private handlePrimaryClick() {
    if (this.gameMode === 'spectator' || this.attackCooldown > 0) return;
    this.swingAnim = 1.0;

    this.camera.getWorldDirection(_lookDir);
    const held = this.hotbar[this.selectedSlot];
    const dmg = held ? ITEMS[held.id].attackDamage ?? 2 : 2;
    if (this.mobs.hitMobNearRay(this.camera.position, _lookDir, dmg, this.drops, this.particles)) {
      this.damageHeldTool();
      this.attackCooldown = 0.26;
      return;
    }

    if (this.gameMode === 'creative' && this.currentHit) {
      this.breakBlockAt(this.currentHit.bx, this.currentHit.by, this.currentHit.bz, false);
      this.attackCooldown = 0.18;
    }
  }

  private handleSecondaryClick() {
    if (this.gameMode === 'spectator' || this.placeCooldown > 0) return;
    const held = this.hotbar[this.selectedSlot];

    // 1. Bow & Crossbow shooting
    if (held && (held.id === ItemId.Bow || held.id === ItemId.Crossbow)) {
      const canShoot = this.gameMode === 'creative' || this.consumeItemCount(ItemId.Arrow, 1);
      if (canShoot) {
        this.camera.getWorldDirection(_lookDir);
        const speed = held.id === ItemId.Crossbow ? 38 : 29;
        const dmg = ITEMS[held.id].attackDamage ?? 7;
        this.projectiles.spawnArrow(this.camera.position, _lookDir, speed, dmg, true);
        soundEngine.playBowShoot();
        this.damageHeldTool();
        this.swingAnim = 0.7;
        this.placeCooldown = held.id === ItemId.Crossbow ? 0.55 : 0.35;
      } else {
        this.showToast('Keine Pfeile im Inventar!');
      }
      return;
    }

    // 2. Eat food if hungry or hurt
    if (held && ITEMS[held.id].foodRestore && (this.hunger < 20 || this.health < this.maxHealth)) {
      const restore = ITEMS[held.id].foodRestore ?? 4;
      this.hunger = Math.min(20, this.hunger + restore);
      this.health = Math.min(this.maxHealth, this.health + 2);
      if (this.gameMode !== 'creative') {
        held.count -= 1;
        if (held.count <= 0) this.hotbar[this.selectedSlot] = null;
      }
      soundEngine.playPickup();
      this.swingAnim = 0.8;
      this.placeCooldown = 0.25;
      this.rebuildHandModel();
      this.emitHud();
      return;
    }

    if (!this.currentHit) return;
    const { bx, by, bz, nx, ny, nz, blockId } = this.currentHit;
    const key = `${bx},${by},${bz}`;

    // 3. Interact with Crafting Table, Furnace, Chest, Bed, TNT (unless sneaking)
    if (!this.keys.has('ShiftLeft') && !this.touchSneak) {
      if (blockId === BlockId.CraftingTable) {
        soundEngine.playClick();
        this.openScreen('crafting');
        return;
      }
      if (blockId === BlockId.Furnace) {
        soundEngine.playClick();
        this.getOrCreateFurnace(key);
        this.activeFurnaceKey = key;
        this.openScreen('furnace');
        return;
      }
      if (blockId === BlockId.Chest) {
        soundEngine.playClick();
        this.getOrCreateChest(key);
        this.activeChestKey = key;
        this.openScreen('chest');
        return;
      }
      if (blockId === BlockId.Bed) {
        soundEngine.playClick();
        this.spawnPoint.set(bx + 0.5, by + 1.1, bz + 0.5);
        if (this.timeOfDay > 0.46 || this.timeOfDay < 0.03) {
          this.timeOfDay = 0.04;
          this.dayCount += 1;
          this.health = this.maxHealth;
          this.showToast('Gut geschlafen! Morgen bricht an.');
        } else {
          this.showToast('Wiederbelebungspunkt gesetzt!');
        }
        this.placeCooldown = 0.35;
        return;
      }
      if (blockId === BlockId.TNT) {
        this.igniteTNT(bx, by, bz);
        this.placeCooldown = 0.25;
        return;
      }
    }

    // 4. Hoe tilling Dirt/Grass -> Farmland
    if (
      held &&
      ITEMS[held.id].toolKind === 'hoe' &&
      (blockId === BlockId.Grass || blockId === BlockId.Dirt)
    ) {
      this.world.setBlock(bx, by, bz, BlockId.Farmland);
      soundEngine.playDig('dirt');
      this.damageHeldTool();
      this.swingAnim = 0.8;
      this.placeCooldown = 0.22;
      return;
    }

    // 5. Place block (blocked in Adventure unless creative/survival)
    if (this.gameMode === 'adventure') return;
    if (!held) return;
    const itemDef = ITEMS[held.id];
    if (itemDef.blockId === undefined) return;

    const px = bx + nx;
    const py = by + ny;
    const pz = bz + nz;
    if (py <= 0 || py >= WORLD_HEIGHT) return;
    if (BLOCKS[itemDef.blockId].solid && this.intersectsPlayerAABB(px, py, pz)) return;

    // Facing rotation based on player yaw (0=north, 1=east, 2=south, 3=west)
    let rot = 0;
    if (BLOCKS[itemDef.blockId].rotatable) {
      const deg = (((-this.yaw * 180) / Math.PI) % 360 + 360) % 360;
      if (deg >= 45 && deg < 135) rot = 3;
      else if (deg >= 135 && deg < 225) rot = 2;
      else if (deg >= 225 && deg < 315) rot = 1;
      else rot = 0;
    }

    if (this.world.setBlock(px, py, pz, itemDef.blockId, rot)) {
      soundEngine.playPlace(BLOCKS[itemDef.blockId].sound);
      this.particles.spawnBurst(px + 0.5, py + 0.5, pz + 0.5, BLOCKS[itemDef.blockId].particleColor, 5, 1.5);
      this.swingAnim = 0.9;
      this.placeCooldown = 0.2;

      if (this.gameMode === 'survival') {
        held.count -= 1;
        if (held.count <= 0) {
          this.hotbar[this.selectedSlot] = null;
          this.rebuildHandModel();
        }
      }
      this.emitHud();
    }
  }

  private handlePickBlock() {
    if (!this.currentHit) return;
    const dropItem =
      BLOCKS[this.currentHit.blockId]?.dropId ?? (this.currentHit.blockId as unknown as ItemId);
    const id = this.currentHit.blockId as unknown as ItemId;
    const pickId = ITEMS[id] ? id : dropItem;
    if (!ITEMS[pickId]) return;

    if (this.gameMode === 'creative') {
      this.hotbar[this.selectedSlot] = { id: pickId, count: ITEMS[pickId].maxStack };
      this.rebuildHandModel();
      this.emitHud();
    } else {
      const idx = this.hotbar.findIndex((s) => s && s.id === pickId);
      if (idx !== -1) this.selectHotbarSlot(idx);
    }
  }

  private igniteTNT(bx: number, by: number, bz: number) {
    if (this.tntFuses.some((t) => t.x === bx && t.y === by && t.z === bz)) return;
    soundEngine.playMob('creeper_hiss');
    this.tntFuses.push({ x: bx, y: by, z: bz, timer: 1.0 });
  }

  private triggerExplosion(ex: number, ey: number, ez: number, radius: number) {
    soundEngine.playExplode();
    this.particles.spawnBurst(ex, ey, ez, 0xf27d26, 36, 6.2);
    this.particles.spawnBurst(ex, ey, ez, 0x555555, 28, 5.0);

    const distToPlayer = Math.hypot(
      this.playerPos.x - ex,
      this.playerPos.y - ey,
      this.playerPos.z - ez,
    );
    this.cameraShake = Math.min(0.45, Math.max(this.cameraShake, 1.4 / Math.max(1.5, distToPlayer)));

    if ((this.gameMode === 'survival' || this.gameMode === 'adventure') && distToPlayer < radius * 1.8) {
      const dmg = Math.max(1, Math.round((1 - distToPlayer / (radius * 1.8)) * 12));
      this.applyPlayerDamage(dmg);
      const kx = (this.playerPos.x - ex) / Math.max(0.5, distToPlayer);
      const kz = (this.playerPos.z - ez) / Math.max(0.5, distToPlayer);
      this.playerVel.x += kx * 8;
      this.playerVel.z += kz * 8;
      this.playerVel.y = Math.max(this.playerVel.y, 6);
    }

    const rCeil = Math.ceil(radius);
    const ix = Math.floor(ex);
    const iy = Math.floor(ey);
    const iz = Math.floor(ez);
    for (let dx = -rCeil; dx <= rCeil; dx++) {
      for (let dy = -rCeil; dy <= rCeil; dy++) {
        for (let dz = -rCeil; dz <= rCeil; dz++) {
          if (dx * dx + dy * dy + dz * dz > radius * radius) continue;
          const bx = ix + dx;
          const by = iy + dy;
          const bz = iz + dz;
          const b = this.world.getBlock(bx, by, bz);
          if (b === BlockId.Air || b === BlockId.Bedrock || b === BlockId.Water || b === BlockId.Obsidian)
            continue;
          this.world.setBlock(bx, by, bz, BlockId.Air);
          if (b === BlockId.TNT) {
            this.tntFuses.push({ x: bx, y: by, z: bz, timer: 0.15 });
          }
        }
      }
    }
  }

  private breakBlockAt(bx: number, by: number, bz: number, spawnDrops: boolean) {
    const id = this.world.getBlock(bx, by, bz);
    if (id === BlockId.Air || id === BlockId.Bedrock) return;
    const def = BLOCKS[id];
    const key = `${bx},${by},${bz}`;

    // Drop chest / furnace contents if broken
    if (id === BlockId.Chest) {
      const c = this.chests.get(key);
      if (c) {
        for (const s of c) {
          if (s) this.drops.spawnDrop(bx + 0.5, by + 0.5, bz + 0.5, s.id, s.count, s.durability);
        }
        this.chests.delete(key);
      }
    } else if (id === BlockId.Furnace) {
      const f = this.furnaces.get(key);
      if (f) {
        if (f.input) this.drops.spawnDrop(bx + 0.5, by + 0.5, bz + 0.5, f.input.id, f.input.count);
        if (f.fuel) this.drops.spawnDrop(bx + 0.5, by + 0.5, bz + 0.5, f.fuel.id, f.fuel.count);
        if (f.output) this.drops.spawnDrop(bx + 0.5, by + 0.5, bz + 0.5, f.output.id, f.output.count);
        this.furnaces.delete(key);
      }
    }

    this.world.setBlock(bx, by, bz, BlockId.Air);
    soundEngine.playBreak(def.sound);
    this.particles.spawnBurst(bx + 0.5, by + 0.5, bz + 0.5, def.particleColor, 16, 3.6);
    this.cameraShake = Math.max(this.cameraShake, 0.022);
    this.hitstopTimer = 0.025;

    if (spawnDrops) {
      const held = this.hotbar[this.selectedSlot];
      const itemDef = held ? ITEMS[held.id] : null;
      const toolKind = itemDef?.toolKind ?? 'none';
      const toolTier = itemDef?.toolTier ?? 0;

      const reqTier = def.requiresToolTier ?? 0;
      const canHarvest =
        reqTier === 0 || (toolKind === def.preferredTool && toolTier >= reqTier);

      this.damageHeldTool();

      if (canHarvest && def.dropId) {
        if (
          (id !== BlockId.Leaves && id !== BlockId.SpruceLeaves) ||
          Math.random() < 0.28
        ) {
          this.drops.spawnDrop(bx + 0.5, by + 0.45, bz + 0.5, def.dropId, def.dropCount ?? 1);
        }
      }
      this.xpProgress += 0.08;
      if (this.xpProgress >= 1) {
        this.xpProgress -= 1;
        this.xpLevel += 1;
      }
      this.emitHud();
    }
  }

  private resetMining() {
    this.miningTarget = null;
    this.miningProgress = 0;
    this.crackMesh.visible = false;
  }

  private applyPlayerDamage(rawAmount: number, ignoreShield = false) {
    if ((this.gameMode !== 'survival' && this.gameMode !== 'adventure') || rawAmount <= 0) return;

    let amount = rawAmount;
    if (!ignoreShield && this.isShieldBlocking()) {
      amount = Math.max(0, Math.floor(amount * 0.25));
      soundEngine.playShieldBlock();
    }

    const armorDef = this.getArmorDefense();
    if (armorDef > 0 && amount > 0) {
      amount = Math.max(1, Math.round(amount * (1 - armorDef * 0.032)));
      for (let i = 0; i < 4; i++) {
        const piece = this.armor[i];
        if (!piece) continue;
        const maxD = ITEMS[piece.id].maxDurability ?? 100;
        const cur = (piece.durability ?? maxD) - 1;
        if (cur <= 0) this.armor[i] = null;
        else piece.durability = cur;
      }
    }

    if (amount <= 0) {
      this.emitHud();
      return;
    }

    this.health = Math.max(0, this.health - amount);
    this.cameraShake = Math.max(this.cameraShake, 0.16);
    soundEngine.playHurt();

    if (this.health <= 0) {
      if (!this.keepInventory) {
        for (let i = 0; i < this.hotbar.length; i++) {
          const s = this.hotbar[i];
          if (s) this.drops.spawnDrop(this.playerPos.x, this.playerPos.y + 0.5, this.playerPos.z, s.id, s.count, s.durability);
          this.hotbar[i] = null;
        }
        for (let i = 0; i < this.inventory.length; i++) {
          const s = this.inventory[i];
          if (s) this.drops.spawnDrop(this.playerPos.x, this.playerPos.y + 0.5, this.playerPos.z, s.id, s.count, s.durability);
          this.inventory[i] = null;
        }
        for (let i = 0; i < this.armor.length; i++) {
          const s = this.armor[i];
          if (s) this.drops.spawnDrop(this.playerPos.x, this.playerPos.y + 0.5, this.playerPos.z, s.id, s.count, s.durability);
          this.armor[i] = null;
        }
        if (this.offhand) {
          this.drops.spawnDrop(this.playerPos.x, this.playerPos.y + 0.5, this.playerPos.z, this.offhand.id, this.offhand.count, this.offhand.durability);
          this.offhand = null;
        }
        this.rebuildHandModel();
      }
      this.openScreen('gameover');
    } else {
      this.emitHud();
    }
  }

  // ---- Furnace Simulation ----
  private updateFurnaces(dt: number) {
    let changed = false;
    for (const [key, f] of this.furnaces.entries()) {
      const recipe = f.input ? SMELT_RECIPES.find((r) => r.input === f.input?.id) : null;
      const canOutput =
        recipe &&
        (!f.output ||
          (f.output.id === recipe.output && f.output.count < (ITEMS[recipe.output]?.maxStack ?? 64)));

      if (f.burnTime > 0) {
        f.burnTime = Math.max(0, f.burnTime - dt);
        changed = true;
      }

      if (recipe && canOutput) {
        if (f.burnTime <= 0 && f.fuel && f.fuel.count > 0) {
          const burnDur = getFuelBurnTime(f.fuel.id);
          if (burnDur > 0) {
            f.burnTime = burnDur;
            f.maxBurnTime = burnDur;
            f.fuel.count -= 1;
            if (f.fuel.count <= 0) f.fuel = null;
            changed = true;
          }
        }
        if (f.burnTime > 0) {
          f.cookProgress += dt / recipe.smeltTime;
          changed = true;
          if (f.cookProgress >= 1) {
            f.cookProgress = 0;
            if (f.input) {
              f.input.count -= 1;
              if (f.input.count <= 0) f.input = null;
            }
            if (f.output) {
              f.output.count += 1;
            } else {
              f.output = { id: recipe.output, count: 1 };
            }
          }
        } else {
          f.cookProgress = Math.max(0, f.cookProgress - dt * 0.5);
        }
      } else if (f.cookProgress > 0) {
        f.cookProgress = 0;
        changed = true;
      }

      if (this.activeFurnaceKey === key && changed && this.screen === 'furnace') {
        // Refreshed on regular hud timer
      }
    }
  }

  // ---- Collision Helpers ----
  private isSolidAt(x: number, y: number, z: number): boolean {
    const id = this.world.getBlock(x, y, z);
    return BLOCKS[id].solid;
  }

  private collidesAABB(px: number, py: number, pz: number): boolean {
    if (this.gameMode === 'spectator') return false;
    const minX = Math.floor(px - PLAYER_RADIUS);
    const maxX = Math.floor(px + PLAYER_RADIUS);
    const minY = Math.floor(py);
    const maxY = Math.floor(py + PLAYER_HEIGHT);
    const minZ = Math.floor(pz - PLAYER_RADIUS);
    const maxZ = Math.floor(pz + PLAYER_RADIUS);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.isSolidAt(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  private intersectsPlayerAABB(bx: number, by: number, bz: number): boolean {
    return (
      bx + 1 > this.playerPos.x - PLAYER_RADIUS &&
      bx < this.playerPos.x + PLAYER_RADIUS &&
      by + 1 > this.playerPos.y &&
      by < this.playerPos.y + PLAYER_HEIGHT &&
      bz + 1 > this.playerPos.z - PLAYER_RADIUS &&
      bz < this.playerPos.z + PLAYER_RADIUS
    );
  }

  // ---- Main Simulation Tick ----
  private step(rawDt: number) {
    const dt = Math.min(rawDt, 0.05);
    this.waterUniforms.uTime.value += dt;

    this.fpsFrames += 1;
    this.fpsAccum += rawDt;
    if (this.fpsAccum >= 0.5) {
      this.currentFps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsFrames = 0;
      this.fpsAccum = 0;
    }

    if (this.statusToastTimer > 0) {
      this.statusToastTimer -= dt;
      if (this.statusToastTimer <= 0) {
        this.statusToast = null;
        this.emitHud();
      }
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return;
    }

    // Advance Day/Night & Weather Cycle
    this.timeOfDay += dt * 0.002;
    if (this.timeOfDay >= 1) {
      this.timeOfDay -= 1;
      this.dayCount += 1;
    }

    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      this.weatherTimer = 110 + Math.random() * 140;
      const roll = Math.random();
      const { biome } = this.world.getBiomeInfo(this.playerPos.x, this.playerPos.z);
      if (roll < 0.62) this.weather = 'clear';
      else if (biome === 'snow') this.weather = 'snow';
      else if (roll < 0.88) this.weather = 'rain';
      else this.weather = 'storm';
    }

    const { biome } = this.world.getBiomeInfo(this.playerPos.x, this.playerPos.z);

    if (this.screen === 'title') {
      this.titleAngle += dt * 0.12;
      const orbitR = 26;
      const cx = 8.5 + Math.cos(this.titleAngle) * orbitR;
      const cz = 8.5 + Math.sin(this.titleAngle) * orbitR;
      const cy = Math.max(24, this.world.getTerrainHeight(cx, cz) + 11);
      this.camera.position.set(cx, cy, cz);
      this.camera.lookAt(8.5, 14, 8.5);
      this.world.updateChunksAround(
        this.playerPos.x,
        this.playerPos.z,
        this.settings.renderDistance,
        3,
      );
      this.sky.update(
        this.scene,
        this.camera.position,
        this.timeOfDay,
        dt,
        false,
        this.weather,
        biome,
        this.settings.weatherParticles,
        this.settings.renderDistance,
      );
      this.mobs.update(
        dt,
        this.world,
        this.playerPos,
        'creative',
        this.timeOfDay,
        this.projectiles,
        () => {},
        () => {},
      );
      this.particles.update(dt);
      this.handGroup.visible = false;
      this.selectBox.visible = false;
      this.previewGroup.visible = false;
      return;
    }

    this.handGroup.visible = this.screen === 'playing' && this.gameMode !== 'spectator';

    if (this.screen === 'playing') {
      this.updatePlayer(dt);
      this.updateMining(dt);
      this.autoSaveTimer += dt;
      if (this.autoSaveTimer >= 22) {
        this.autoSaveTimer = 0;
        void this.saveCurrentWorld(false);
      }
    }

    this.updateFurnaces(dt);

    // Update TNT fuses
    for (let i = this.tntFuses.length - 1; i >= 0; i--) {
      const f = this.tntFuses[i];
      f.timer -= dt;
      if (f.timer <= 0) {
        this.tntFuses.splice(i, 1);
        this.world.setBlock(f.x, f.y, f.z, BlockId.Air);
        this.triggerExplosion(f.x + 0.5, f.y + 0.5, f.z + 0.5, 3.6);
      }
    }

    // Nearest Glowstone / Torch / Lantern / Lava point light
    let nearestDist = 256;
    let nearestGlow: THREE.Vector3 | null = null;
    for (const gp of this.world.glowstones.values()) {
      const dSq = gp.distanceToSquared(this.playerPos);
      if (dSq < nearestDist) {
        nearestDist = dSq;
        nearestGlow = gp;
      }
    }
    if (nearestGlow) {
      this.glowLight.position.copy(nearestGlow);
      this.glowLight.intensity = 3.2;
    } else {
      this.glowLight.intensity = 0;
    }

    this.world.updateChunksAround(
      this.playerPos.x,
      this.playerPos.z,
      this.settings.renderDistance,
      3,
    );
    this.sky.update(
      this.scene,
      this.playerPos,
      this.timeOfDay,
      dt,
      this.isUnderwater,
      this.weather,
      biome,
      this.settings.weatherParticles,
      this.settings.renderDistance,
    );
    this.particles.update(dt);
    this.footprints.update(dt);
    this.drops.update(
      dt,
      this.world,
      this.playerPos,
      this.gameMode !== 'spectator',
      (stack) => this.addItemToInventory(stack.id, stack.count, stack.durability),
    );
    this.projectiles.update(
      dt,
      this.world,
      this.mobs,
      this.drops,
      this.particles,
      this.playerPos,
      (dmg, dx, dz) => {
        this.applyPlayerDamage(dmg);
        this.playerVel.x += dx * 4.5;
        this.playerVel.z += dz * 4.5;
      },
    );
    this.mobs.update(
      dt,
      this.world,
      this.playerPos,
      this.gameMode,
      this.timeOfDay,
      this.projectiles,
      (x, y, z, r) => this.triggerExplosion(x, y, z, r),
      (dmg, dx, dz) => {
        this.applyPlayerDamage(dmg);
        this.playerVel.x += dx * 5;
        this.playerVel.z += dz * 5;
        this.playerVel.y = Math.max(this.playerVel.y, 3.2);
      },
    );

    this.hudTimer += dt;
    if (this.hudTimer >= 0.14) {
      this.hudTimer = 0;
      this.emitHud();
    }
  }

  private updatePlayer(dt: number) {
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.placeCooldown > 0) this.placeCooldown -= dt;

    const headBlock = this.world.getBlock(
      this.playerPos.x,
      this.playerPos.y + EYE_HEIGHT,
      this.playerPos.z,
    );
    const feetBlock = this.world.getBlock(this.playerPos.x, this.playerPos.y + 0.2, this.playerPos.z);
    const wasUnderwater = this.isUnderwater;
    this.isUnderwater = headBlock === BlockId.Water && this.gameMode !== 'spectator';
    const inWater = (feetBlock === BlockId.Water || this.isUnderwater) && this.gameMode !== 'spectator';
    const inLava = (feetBlock === BlockId.Lava || headBlock === BlockId.Lava) && this.gameMode !== 'spectator';
    if (!wasUnderwater && this.isUnderwater) {
      soundEngine.playSplash();
    }

    // Drowning & Lava & Cactus survival hazards
    if (this.gameMode === 'survival' || this.gameMode === 'adventure') {
      if (this.isUnderwater) {
        this.airTimer += dt;
        if (this.airTimer >= 0.75) {
          this.airTimer = 0;
          if (this.air > 0) {
            this.air = Math.max(0, this.air - 2);
          } else {
            this.applyPlayerDamage(2, true);
          }
        }
      } else {
        this.air = Math.min(20, this.air + dt * 6);
        this.airTimer = 0;
      }

      if (inLava) {
        this.lavaTimer += dt;
        if (this.lavaTimer >= 0.55) {
          this.lavaTimer = 0;
          soundEngine.playSizzle();
          this.particles.spawnBurst(this.playerPos.x, this.playerPos.y + 0.7, this.playerPos.z, 0xff6b1a, 8, 2.5);
          this.applyPlayerDamage(4, true);
        }
      } else {
        this.lavaTimer = 0.5;
      }
    }

    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    let moveForward = this.touchMoveY;
    let moveRight = this.touchMoveX;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveForward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveForward -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveRight += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveRight -= 1;

    _vec3A.set(-sinY * moveForward + cosY * moveRight, 0, -cosY * moveForward - sinY * moveRight);
    const moveMag = Math.min(1, Math.hypot(moveForward, moveRight));
    if (_vec3A.lengthSq() > 0) _vec3A.normalize().multiplyScalar(moveMag);

    const touchSprint = this.touchMoveY > 0.86;
    const isSneaking = (this.keys.has('ShiftLeft') || this.touchSneak) && !this.isFlying;
    const sprintingNow = (this.isSprinting || touchSprint) && !this.isShieldBlocking();
    const targetSpeed = this.isFlying
      ? sprintingNow
        ? 15.5
        : 9.8
      : isSneaking || this.isShieldBlocking()
        ? 2.6
        : sprintingNow && moveForward > 0
          ? 7.0
          : inWater
            ? 3.2
            : 4.8;

    const accel = this.onGround || this.isFlying ? 24 : 9;
    this.playerVel.x = THREE.MathUtils.damp(this.playerVel.x, _vec3A.x * targetSpeed, accel, dt);
    this.playerVel.z = THREE.MathUtils.damp(this.playerVel.z, _vec3A.z * targetSpeed, accel, dt);

    const jumpHeld = this.keys.has('Space') || this.touchJumpHeld;
    const descendHeld = this.keys.has('ShiftLeft') || this.touchDescendHeld;

    if (this.isFlying || this.gameMode === 'spectator') {
      let vy = 0;
      if (jumpHeld) vy += 8.5;
      if (descendHeld) vy -= 8.5;
      this.playerVel.y = THREE.MathUtils.damp(this.playerVel.y, vy, 12, dt);
    } else if (inWater) {
      this.playerVel.y -= 8.0 * dt;
      if (jumpHeld) {
        this.playerVel.y = Math.min(4.8, this.playerVel.y + 18 * dt);
      }
      this.playerVel.y *= 0.92;
    } else {
      this.playerVel.y -= 24.0 * dt;
      if (this.onGround) this.coyoteTimer = 0.11;
      else if (this.coyoteTimer > 0) this.coyoteTimer -= dt;

      if (this.jumpBufferTimer > 0) this.jumpBufferTimer -= dt;

      if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
        this.playerVel.y = 8.4;
        this.onGround = false;
        this.coyoteTimer = 0;
        this.jumpBufferTimer = 0;
      }
    }

    const dx = this.playerVel.x * dt;
    if (!this.collidesAABB(this.playerPos.x + dx, this.playerPos.y, this.playerPos.z)) {
      if (
        !isSneaking ||
        !this.onGround ||
        this.collidesAABB(this.playerPos.x + dx, this.playerPos.y - 0.5, this.playerPos.z)
      ) {
        this.playerPos.x += dx;
      } else {
        this.playerVel.x = 0;
      }
    } else {
      this.playerVel.x = 0;
    }

    const dz = this.playerVel.z * dt;
    if (!this.collidesAABB(this.playerPos.x, this.playerPos.y, this.playerPos.z + dz)) {
      if (
        !isSneaking ||
        !this.onGround ||
        this.collidesAABB(this.playerPos.x, this.playerPos.y - 0.5, this.playerPos.z + dz)
      ) {
        this.playerPos.z += dz;
      } else {
        this.playerVel.z = 0;
      }
    } else {
      this.playerVel.z = 0;
    }

    const dy = this.playerVel.y * dt;
    const prevVy = this.playerVel.y;
    if (!this.collidesAABB(this.playerPos.x, this.playerPos.y + dy, this.playerPos.z)) {
      this.playerPos.y += dy;
      this.onGround = false;
    } else {
      if (dy < 0) {
        this.playerPos.y = Math.floor(this.playerPos.y + dy) + 1.0001;
        this.onGround = true;
        if (prevVy < -12.5 && !inWater && !this.isFlying) {
          const dmg = Math.floor((-prevVy - 11.5) * 1.15);
          this.applyPlayerDamage(dmg);
        }
      }
      this.playerVel.y = 0;
    }

    if (this.playerPos.y < -8) {
      this.spawnPlayerSafe(false);
    }

    if (this.gameMode === 'survival' || this.gameMode === 'adventure') {
      this.hungerTimer += dt * (sprintingNow ? 2.2 : 1.0);
      if (this.hungerTimer >= 16) {
        this.hungerTimer = 0;
        if (this.hunger > 0) this.hunger -= 1;
        else this.applyPlayerDamage(1, true);
      }
      if (this.hunger >= 18 && this.health < this.maxHealth && Math.random() < dt * 0.25) {
        this.health = Math.min(this.maxHealth, this.health + 1);
      }
    }

    // Walk bobbing, footsteps & visible footprints
    const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    if (this.onGround && horizSpeed > 0.4 && this.gameMode !== 'spectator') {
      this.walkBob += dt * horizSpeed * 2.1;
      this.stepDist += horizSpeed * dt;
      if (this.stepDist > 1.45) {
        this.stepDist = 0;
        const groundBlock = this.world.getBlock(
          this.playerPos.x,
          this.playerPos.y - 0.15,
          this.playerPos.z,
        );
        if (groundBlock !== BlockId.Air) {
          soundEngine.playStep(BLOCKS[groundBlock].sound);
          if (
            groundBlock === BlockId.Grass ||
            groundBlock === BlockId.Dirt ||
            groundBlock === BlockId.Sand ||
            groundBlock === BlockId.Snow ||
            groundBlock === BlockId.Gravel
          ) {
            this.footprints.spawnFootprint(
              this.playerPos.x,
              Math.floor(this.playerPos.y - 0.15) + 1,
              this.playerPos.z,
              this.yaw,
              this.leftFootNext,
            );
            this.leftFootNext = !this.leftFootNext;
          }
        }
      }
    } else {
      this.walkBob *= 0.85;
    }

    // Camera FOV & Shake
    const baseFov = this.settings.fov;
    const targetFov = sprintingNow && horizSpeed > 3 ? baseFov + 8 : baseFov;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 10, dt);
      this.camera.updateProjectionMatrix();
    }

    this.cameraShake = Math.max(0, this.cameraShake - dt * 1.1);
    const shakeX = (Math.random() - 0.5) * this.cameraShake * 0.25;
    const shakeY = (Math.random() - 0.5) * this.cameraShake * 0.25;

    const crouchDip = isSneaking ? -0.18 : 0;
    const bobOffset = this.onGround ? Math.sin(this.walkBob) * 0.045 : 0;
    this.camera.position.set(
      this.playerPos.x + shakeX,
      this.playerPos.y + EYE_HEIGHT + crouchDip + bobOffset + shakeY,
      this.playerPos.z,
    );
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    // Hand swing + shield raise pose
    if (this.swingAnim > 0) {
      this.swingAnim = Math.max(0, this.swingAnim - dt * 5.2);
    }
    const swing = Math.sin(this.swingAnim * Math.PI);
    const blockLift = this.isShieldBlocking() ? 0.16 : 0;
    this.handGroup.position.set(
      0.42 - swing * 0.14 - blockLift,
      -0.34 + bobOffset * 0.45 - swing * 0.08 + blockLift * 0.5,
      -0.58 - swing * 0.18,
    );
    this.handGroup.rotation.set(-swing * 0.85, swing * 0.25 + blockLift * 1.4, swing * 0.3);

    // Raycast targeted block & update placement preview ghost
    if (this.gameMode === 'spectator') {
      this.currentHit = null;
      this.selectBox.visible = false;
      this.previewGroup.visible = false;
      return;
    }

    this.camera.getWorldDirection(_lookDir);
    this.currentHit = this.world.raycast(this.camera.position, _lookDir, 5.5);
    if (this.currentHit) {
      this.selectBox.visible = true;
      this.selectBox.position.set(
        this.currentHit.bx + 0.5,
        this.currentHit.by + 0.5,
        this.currentHit.bz + 0.5,
      );

      const held = this.hotbar[this.selectedSlot];
      const itemDef = held ? ITEMS[held.id] : null;
      const px = this.currentHit.bx + this.currentHit.nx;
      const py = this.currentHit.by + this.currentHit.ny;
      const pz = this.currentHit.bz + this.currentHit.nz;
      const canShowPreview =
        this.gameMode !== 'adventure' &&
        itemDef?.blockId !== undefined &&
        py > 0 &&
        py < WORLD_HEIGHT &&
        (!BLOCKS[itemDef.blockId].solid || !this.intersectsPlayerAABB(px, py, pz));

      if (canShowPreview) {
        this.previewGroup.visible = true;
        this.previewGroup.position.set(px + 0.5, py + 0.5, pz + 0.5);
      } else {
        this.previewGroup.visible = false;
      }
    } else {
      this.selectBox.visible = false;
      this.previewGroup.visible = false;
    }
  }

  private updateMining(dt: number) {
    const isMiningHeld = this.mouseLeftDown || this.touchMineHeld || this.touchHoldMining;
    if (
      !isMiningHeld ||
      (this.gameMode !== 'survival' && this.gameMode !== 'adventure') ||
      !this.currentHit
    ) {
      if (!isMiningHeld) this.resetMining();
      return;
    }

    const { bx, by, bz, blockId } = this.currentHit;
    const def = BLOCKS[blockId];
    if (def.hardness < 0) {
      this.resetMining();
      return;
    }

    const held = this.hotbar[this.selectedSlot];
    const itemDef = held ? ITEMS[held.id] : null;

    // Adventure mode requires matching preferred tool!
    if (
      this.gameMode === 'adventure' &&
      (def.preferredTool === 'none' || itemDef?.toolKind !== def.preferredTool)
    ) {
      this.resetMining();
      return;
    }

    if (
      !this.miningTarget ||
      this.miningTarget.bx !== bx ||
      this.miningTarget.by !== by ||
      this.miningTarget.bz !== bz
    ) {
      this.miningTarget = { bx, by, bz };
      this.miningProgress = 0;
    }

    let mult = 1.0;
    if (itemDef && itemDef.toolKind === def.preferredTool) {
      mult = itemDef.miningMultiplier ?? 1.8;
    } else if ((def.requiresToolTier ?? 0) > 0) {
      mult = 0.3;
    }

    this.miningProgress += (dt * mult) / def.hardness;
    this.swingAnim = Math.max(this.swingAnim, 0.55);

    this.digSoundTimer -= dt;
    if (this.digSoundTimer <= 0) {
      this.digSoundTimer = 0.24;
      soundEngine.playDig(def.sound);
      this.particles.spawnBurst(bx + 0.5, by + 0.5, bz + 0.5, def.particleColor, 4, 2.0);
    }

    const stage = Math.min(9, Math.floor(this.miningProgress * 10));
    this.crackMesh.visible = true;
    this.crackMesh.position.set(bx + 0.5, by + 0.5, bz + 0.5);
    this.crackMesh.material = this.crackMats[stage];

    if (this.miningProgress >= 1.0) {
      this.breakBlockAt(bx, by, bz, true);
      this.resetMining();
    }
  }

  private emitHud() {
    const { biome } = this.world.getBiomeInfo(this.playerPos.x, this.playerPos.z);
    const temp = this.world.getTemperatureC(this.playerPos.x, this.playerPos.y, this.playerPos.z);

    this.onHudUpdate({
      screen: this.screen,
      gameMode: this.gameMode,
      keepInventory: this.keepInventory,
      worldId: this.worldId,
      worldName: this.worldName,
      health: this.health,
      maxHealth: this.maxHealth,
      hunger: this.hunger,
      air: Math.round(this.air),
      armorDefense: this.getArmorDefense(),
      xpLevel: this.xpLevel,
      xpProgress: this.xpProgress,
      hotbar: this.hotbar.map((s) => (s ? { ...s } : null)),
      inventory: this.inventory.map((s) => (s ? { ...s } : null)),
      armor: this.armor.map((s) => (s ? { ...s } : null)),
      offhand: this.offhand ? { ...this.offhand } : null,
      selectedSlot: this.selectedSlot,
      timeOfDay: this.timeOfDay,
      dayCount: this.dayCount,
      biome,
      weather: this.weather,
      temperatureC: temp,
      coords: {
        x: Math.floor(this.playerPos.x),
        y: Math.floor(this.playerPos.y),
        z: Math.floor(this.playerPos.z),
      },
      targetedBlockName: this.currentHit ? BLOCKS[this.currentHit.blockId].name : null,
      breakProgress: this.miningProgress,
      isUnderwater: this.isUnderwater,
      isFlying: this.isFlying,
      isBlocking: this.isShieldBlocking(),
      fps: this.currentFps,
      showDebug: this.showDebug,
      settings: { ...this.settings },
      seed: this.seed,
      activeFurnaceKey: this.activeFurnaceKey,
      activeFurnace: this.activeFurnaceKey
        ? {
            ...(this.furnaces.get(this.activeFurnaceKey) ?? {
              input: null,
              fuel: null,
              output: null,
              burnTime: 0,
              maxBurnTime: 0,
              cookProgress: 0,
            }),
          }
        : null,
      activeChestKey: this.activeChestKey,
      activeChestSlots: this.activeChestKey
        ? (this.chests.get(this.activeChestKey) ?? new Array(27).fill(null)).map((s) =>
            s ? { ...s } : null,
          )
        : [],
      statusToast: this.statusToast,
      isFullscreen: this.isFullscreen,
    });
  }

  // ---- Software WebGL-Safe Render Loop ----
  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = () => {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    this.step(rawDt);
    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private startLoop() {
    this.lastTime = performance.now();
    this.tick();
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.unbindEvents();

    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }

    this.world.dispose();
    this.sky.dispose();
    this.particles.dispose();
    this.footprints.dispose();
    this.drops.dispose();
    this.projectiles.dispose();
    this.mobs.clear();

    this.opaqueMat.dispose();
    this.waterMat.dispose();
    this.textures.atlasTexture.dispose();
    this.textures.crackTextures.forEach((t) => t.dispose());
    this.crackMats.forEach((m) => m.dispose());
    this.crackMesh.geometry.dispose();
    this.selectBox.geometry.dispose();
    (this.selectBox.material as THREE.Material).dispose();
    this.previewGroup.traverse((c) => {
      if (c instanceof THREE.Mesh || c instanceof THREE.LineSegments) {
        c.geometry.dispose();
        (c.material as THREE.Material).dispose();
      }
    });

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
