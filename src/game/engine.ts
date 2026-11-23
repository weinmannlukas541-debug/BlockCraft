import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { soundEngine } from './audio';
import { BLOCKS, ITEMS } from './blocks';
import { DropManager, MobManager, ParticlePool } from './entities';
import { SkyEnvironment } from './sky';
import { createVoxelTextures, GeneratedTextures } from './textures';
import { BlockId, GameMode, GameScreen, HudSnapshot, ItemId, ItemStack } from './types';
import { RaycastHit, SEA_LEVEL, VoxelWorld, WORLD_HEIGHT } from './world';

const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _lookDir = new THREE.Vector3();

const RENDER_RADIUS = 3; // 7x7 chunks (112x112 blocks active)
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
  private worldGroup = new THREE.Group();
  private world: VoxelWorld;
  private sky: SkyEnvironment;
  private particles: ParticlePool;
  private drops: DropManager;
  private mobs: MobManager;

  // Dynamic glowstone point light
  private glowLight: THREE.PointLight;

  // Selection outline & crack overlay
  private selectBox: THREE.LineSegments;
  private crackMesh: THREE.Mesh;
  private crackMats: THREE.MeshBasicMaterial[];

  // First-person held item / arm
  private handGroup = new THREE.Group();
  private handItemMesh: THREE.Group;
  private lastHandItemId: ItemId | null = null;
  private swingAnim = 0;

  // Pending TNT fuses
  private tntFuses: { x: number; y: number; z: number; timer: number }[] = [];

  // Simulation state
  private screen: GameScreen = 'title';
  private gameMode: GameMode = 'survival';
  private seed = 42197;
  private timeOfDay = 0.23; // Start at crisp morning-noon sun
  private dayCount = 1;

  // Player state
  private playerPos = new THREE.Vector3(8.5, 22, 8.5);
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
  private cameraShake = 0;
  private hitstopTimer = 0;
  private titleAngle = 0;

  // Survival stats
  private health = 20;
  private maxHealth = 20;
  private hunger = 20;
  private hungerTimer = 0;
  private xpLevel = 1;
  private xpProgress = 0.15;

  // Inventory (9 hotbar + 27 main)
  private hotbar: (ItemStack | null)[] = new Array(9).fill(null);
  private inventory: (ItemStack | null)[] = new Array(27).fill(null);
  private selectedSlot = 0;
  private showDebug = false;

  // Input state
  private keys = new Set<string>();
  private mouseLeftDown = false;
  private mouseRightDown = false;
  private attackCooldown = 0;
  private placeCooldown = 0;

  // Touch / Mobile controls
  private touchControls: boolean =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia?.('(pointer: coarse)').matches === true);
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

  // Loop & callbacks
  private frameId = 0;
  private lastTime = performance.now();
  private hudTimer = 0;
  private disposed = false;
  private onHudUpdate: (snap: HudSnapshot) => void;
  private pendingPointerLock = false;

  constructor(container: HTMLElement, onHudUpdate: (snap: HudSnapshot) => void) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;

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
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // 3. Scene & Studio RoomEnvironment
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x78b4ff);
    this.scene.fog = new THREE.Fog(0x78b4ff, 26, 56);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.25;
    pmrem.dispose();

    // 4. Camera
    const aspect = (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(74, aspect, 0.08, 220);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // 5. Procedural Textures & Materials
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

    // 6. World, Sky, Particles, Drops, Mobs
    this.scene.add(this.worldGroup);
    this.world = new VoxelWorld(this.seed, this.worldGroup, this.opaqueMat, this.waterMat);
    this.sky = new SkyEnvironment(this.scene, this.isSoftwareGl);
    this.particles = new ParticlePool(this.scene);
    this.drops = new DropManager(this.scene);
    this.mobs = new MobManager(this.scene);

    this.glowLight = new THREE.PointLight(0xffcb6b, 0, 14, 1.5);
    this.scene.add(this.glowLight);

    // 7. Block Selection Wireframe & Crack Mesh
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    this.selectBox = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.8 }),
    );
    this.selectBox.visible = false;
    this.scene.add(this.selectBox);

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
    this.spawnPlayerSafe();
    this.world.prebuildAround(this.playerPos.x, this.playerPos.z, RENDER_RADIUS);
    this.mobs.spawnInitialMobs(this.world, this.playerPos.x, this.playerPos.z);
    this.rebuildHandModel();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.emitHud();
    this.startLoop();
  }

  public getItemIcons(): Record<number, string> {
    return this.textures.itemIcons;
  }

  private initStarterInventory(mode: GameMode) {
    this.hotbar.fill(null);
    this.inventory.fill(null);
    if (mode === 'creative') {
      const starter: ItemId[] = [
        ItemId.Grass,
        ItemId.Stone,
        ItemId.OakPlanks,
        ItemId.Cobblestone,
        ItemId.Glass,
        ItemId.Brick,
        ItemId.Glowstone,
        ItemId.OakLog,
        ItemId.TNT,
      ];
      starter.forEach((id, i) => {
        this.hotbar[i] = { id, count: 64 };
      });
    } else {
      this.hotbar[0] = { id: ItemId.WoodPickaxe, count: 1 };
      this.hotbar[1] = { id: ItemId.WoodAxe, count: 1 };
      this.hotbar[2] = { id: ItemId.OakPlanks, count: 16 };
      this.hotbar[3] = { id: ItemId.Cobblestone, count: 16 };
      this.hotbar[4] = { id: ItemId.Glowstone, count: 4 };
      this.hotbar[5] = { id: ItemId.Apple, count: 4 };
      this.hotbar[6] = { id: ItemId.TNT, count: 2 };
    }
  }

  private spawnPlayerSafe() {
    let bestX = 8.5;
    let bestZ = 8.5;
    let bestY = this.world.getTerrainHeight(bestX, bestZ) + 1;
    // Find dry spot above sea level
    for (let r = 0; r < 24; r += 2) {
      const y = this.world.getTerrainHeight(8.5 + r, 8.5 + r);
      if (y > SEA_LEVEL + 1) {
        bestX = 8.5 + r;
        bestZ = 8.5 + r;
        bestY = y + 1.05;
        break;
      }
    }
    this.playerPos.set(bestX, bestY, bestZ);
    this.playerVel.set(0, 0, 0);
    this.health = this.maxHealth;
    this.hunger = 20;
  }

  // ---- Public UI Actions ----
  public startGame(mode: GameMode) {
    soundEngine.playClick();
    if (this.screen === 'title' && this.gameMode !== mode) {
      this.initStarterInventory(mode);
    }
    this.gameMode = mode;
    this.isFlying = mode === 'creative';
    this.screen = 'playing';
    this.rebuildHandModel();
    this.requestPointerLockSafe();
    this.emitHud();
  }

  public resumeGame() {
    soundEngine.playClick();
    this.screen = 'playing';
    this.requestPointerLockSafe();
    this.emitHud();
  }

  public openScreen(next: GameScreen) {
    this.screen = next;
    if (next !== 'playing' && document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
    this.keys.clear();
    this.mouseLeftDown = false;
    this.mouseRightDown = false;
    this.emitHud();
  }

  public setGameMode(mode: GameMode) {
    soundEngine.playClick();
    this.gameMode = mode;
    if (mode === 'creative') {
      this.health = this.maxHealth;
      this.hunger = 20;
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

  public toggleMute() {
    soundEngine.muted = !soundEngine.muted;
    if (!soundEngine.muted) soundEngine.playClick();
    this.emitHud();
  }

  public toggleTouchControls() {
    soundEngine.playClick();
    this.touchControls = !this.touchControls;
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.touchJumpHeld = false;
    this.touchDescendHeld = false;
    this.touchMineHeld = false;
    this.touchSneak = false;
    if (this.touchControls && document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
    this.emitHud();
  }

  public setTouchMove(x: number, y: number) {
    this.touchMoveX = THREE.MathUtils.clamp(x, -1, 1);
    this.touchMoveY = THREE.MathUtils.clamp(y, -1, 1);
  }

  public setTouchJump(held: boolean) {
    if (held && !this.touchJumpHeld) {
      const now = performance.now();
      if (this.gameMode === 'creative' && now - this.lastSpaceTap < 300) {
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

  public triggerTouchPlace() {
    this.handleSecondaryClick();
  }

  public respawnPlayer() {
    soundEngine.playClick();
    this.spawnPlayerSafe();
    this.screen = 'playing';
    this.requestPointerLockSafe();
    this.emitHud();
  }

  public regenerateWorld(newSeed?: number) {
    soundEngine.playClick();
    this.seed = newSeed ?? Math.floor(Math.random() * 899999 + 100000);
    this.world.dispose();
    this.drops.dispose();
    this.mobs.clear();
    this.tntFuses = [];

    this.world = new VoxelWorld(this.seed, this.worldGroup, this.opaqueMat, this.waterMat);
    this.initStarterInventory(this.gameMode);
    this.spawnPlayerSafe();
    this.world.prebuildAround(this.playerPos.x, this.playerPos.z, RENDER_RADIUS);
    this.mobs.spawnInitialMobs(this.world, this.playerPos.x, this.playerPos.z);
    this.screen = 'playing';
    this.requestPointerLockSafe();
    this.emitHud();
  }

  public selectHotbarSlot(index: number) {
    if (index < 0 || index > 8) return;
    this.selectedSlot = index;
    this.rebuildHandModel();
    this.emitHud();
  }

  public setSlotItem(area: 'hotbar' | 'inventory', idx: number, stack: ItemStack | null) {
    if (area === 'hotbar') this.hotbar[idx] = stack ? { ...stack } : null;
    else this.inventory[idx] = stack ? { ...stack } : null;
    this.rebuildHandModel();
    this.emitHud();
  }

  public giveCreativeItem(itemId: ItemId) {
    soundEngine.playClick();
    const def = ITEMS[itemId];
    const count = def.maxStack;
    // Put in selected slot or first empty hotbar slot
    if (!this.hotbar[this.selectedSlot]) {
      this.hotbar[this.selectedSlot] = { id: itemId, count };
    } else {
      const emptyIdx = this.hotbar.findIndex((s) => s === null);
      if (emptyIdx !== -1) {
        this.hotbar[emptyIdx] = { id: itemId, count };
        this.selectedSlot = emptyIdx;
      } else {
        this.hotbar[this.selectedSlot] = { id: itemId, count };
      }
    }
    this.rebuildHandModel();
    this.emitHud();
  }

  public addItemToInventory(id: ItemId, count: number): boolean {
    const maxStack = ITEMS[id]?.maxStack ?? 64;
    let remaining = count;

    // 1. Merge into existing hotbar/inventory stacks
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
    // 2. Fill empty slots
    for (const list of [this.hotbar, this.inventory]) {
      for (let i = 0; i < list.length && remaining > 0; i++) {
        if (!list[i]) {
          const add = Math.min(remaining, maxStack);
          list[i] = { id, count: add };
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

  private requestPointerLockSafe() {
    if (this.touchControls) return;
    this.pendingPointerLock = true;
    try {
      const res = this.renderer.domElement.requestPointerLock?.() as unknown as Promise<void> | undefined;
      if (res && typeof res.catch === 'function') {
        res.catch(() => {});
      }
    } catch {
      // Headless or browser gesture restriction handled gracefully on canvas click
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
      // Bare voxel forearm
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
      // Mini 3D block in hand
      const mat = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.85,
        metalness: 0.05,
        transparent: def.blockId === BlockId.Glass,
        opacity: def.blockId === BlockId.Glass ? 0.55 : 1,
      });
      const cube = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), mat);
      cube.rotation.set(0.15, 0.55, 0);
      this.handItemMesh.add(cube);
      return;
    }

    // Composite Tool / Sword / Resource
    const toolGroup = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a5932, roughness: 0.85 });
    const headMat = new THREE.MeshStandardMaterial({
      color: def.color,
      roughness: def.toolKind ? 0.35 : 0.7,
      metalness: itemId === ItemId.DiamondPickaxe || itemId === ItemId.DiamondSword || itemId === ItemId.IronPickaxe ? 0.65 : 0.1,
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
    } else if (def.toolKind === 'sword') {
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.05), woodMat);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.07), headMat);
      guard.position.set(0, 0.08, 0);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.36, 0.04), headMat);
      blade.position.set(0, 0.28, 0);
      toolGroup.add(grip, guard, blade);
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

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape') {
      if (this.screen === 'inventory' || this.screen === 'crafting') {
        this.resumeGame();
      } else if (this.screen === 'playing') {
        this.openScreen('paused');
      } else if (this.screen === 'paused') {
        this.resumeGame();
      }
      return;
    }

    if (this.screen === 'title') {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.startGame('survival');
      }
      return;
    }

    if (e.code === 'KeyE') {
      if (this.screen === 'playing') {
        this.openScreen('inventory');
      } else if (this.screen === 'inventory' || this.screen === 'crafting') {
        this.resumeGame();
      }
      return;
    }

    if (this.screen !== 'playing') return;

    if (e.code === 'F3' || e.code === 'KeyH') {
      e.preventDefault();
      this.showDebug = !this.showDebug;
      this.emitHud();
      return;
    }

    if (e.code === 'KeyM') {
      this.setGameMode(this.gameMode === 'survival' ? 'creative' : 'survival');
      return;
    }

    if (e.code === 'KeyV') {
      this.toggleMute();
      return;
    }

    // Hotbar 1..9
    if (e.code.startsWith('Digit')) {
      const num = parseInt(e.code.slice(5), 10);
      if (num >= 1 && num <= 9) {
        this.selectHotbarSlot(num - 1);
      }
    }

    if (e.code === 'Space') {
      e.preventDefault();
      const now = performance.now();
      if (this.gameMode === 'creative' && !e.repeat && now - this.lastSpaceTap < 280) {
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
    if (e.pointerType !== 'touch' && !this.touchControls) return;
    if (this.lookPointerId !== null) return;

    this.lookPointerId = e.pointerId;
    this.lookLastX = e.clientX;
    this.lookLastY = e.clientY;
    this.lookMovedDist = 0;

    // Long-press still on the 3D scene starts mining
    if (this.touchHoldTimer !== null) window.clearTimeout(this.touchHoldTimer);
    this.touchHoldTimer = window.setTimeout(() => {
      this.touchHoldTimer = null;
      if (this.lookPointerId === e.pointerId && this.lookMovedDist < 14 && this.screen === 'playing') {
        this.touchHoldMining = true;
        this.handlePrimaryClick();
      }
    }, 260);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.screen !== 'playing') return;
    if ((e.pointerType !== 'touch' && !this.touchControls) || e.pointerId !== this.lookPointerId) return;

    const dx = e.clientX - this.lookLastX;
    const dy = e.clientY - this.lookLastY;
    this.lookLastX = e.clientX;
    this.lookLastY = e.clientY;
    this.lookMovedDist += Math.hypot(dx, dy);

    if (this.lookMovedDist >= 14 && this.touchHoldTimer !== null) {
      window.clearTimeout(this.touchHoldTimer);
      this.touchHoldTimer = null;
    }

    const sensitivity = 0.0042;
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
    if (this.screen !== 'playing' || this.touchControls) return;
    if (document.pointerLockElement === this.renderer.domElement || this.mouseLeftDown || this.mouseRightDown) {
      // Pointer lock delta
      const sensitivity = 0.0022;
      this.yaw -= e.movementX * sensitivity;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - e.movementY * sensitivity,
        -Math.PI / 2 + 0.01,
        Math.PI / 2 - 0.01,
      );
    }
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.screen !== 'playing' || this.touchControls) return;

    // Ensure pointer lock when clicking canvas in playing state
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
    if (this.touchControls) return;
    const locked = document.pointerLockElement === this.renderer.domElement;
    if (locked) {
      this.pendingPointerLock = false;
    } else if (this.screen === 'playing' && !this.pendingPointerLock) {
      // User pressed Esc or browser unlocked pointer -> pause cleanly
      this.openScreen('paused');
    }
  };

  private bindEvents() {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);

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
    if (this.attackCooldown > 0) return;
    this.swingAnim = 1.0;

    // 1. Check mob hit
    this.camera.getWorldDirection(_lookDir);
    const held = this.hotbar[this.selectedSlot];
    const dmg = held ? ITEMS[held.id].attackDamage ?? 2 : 2;
    if (this.mobs.hitMobNearRay(this.camera.position, _lookDir, dmg, this.drops, this.particles)) {
      this.attackCooldown = 0.26;
      return;
    }

    // 2. Creative instant break
    if (this.gameMode === 'creative' && this.currentHit) {
      this.breakBlockAt(this.currentHit.bx, this.currentHit.by, this.currentHit.bz, false);
      this.attackCooldown = 0.18;
    }
  }

  private handleSecondaryClick() {
    if (this.placeCooldown > 0) return;

    const held = this.hotbar[this.selectedSlot];

    // 1. Eat food if holding Apple & hungry/hurt in Survival
    if (held && ITEMS[held.id].foodRestore && (this.hunger < 20 || this.health < this.maxHealth)) {
      const restore = ITEMS[held.id].foodRestore ?? 4;
      this.hunger = Math.min(20, this.hunger + restore);
      this.health = Math.min(this.maxHealth, this.health + 2);
      if (this.gameMode === 'survival') {
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

    // 2. Interact with Crafting Table or TNT (unless sneaking)
    if (!this.keys.has('ShiftLeft')) {
      if (this.currentHit.blockId === BlockId.CraftingTable) {
        soundEngine.playClick();
        this.openScreen('crafting');
        return;
      }
      if (this.currentHit.blockId === BlockId.TNT) {
        this.igniteTNT(this.currentHit.bx, this.currentHit.by, this.currentHit.bz);
        this.placeCooldown = 0.25;
        return;
      }
    }

    // 3. Place block
    if (!held) return;
    const itemDef = ITEMS[held.id];
    if (itemDef.blockId === undefined) return;

    const px = this.currentHit.bx + this.currentHit.nx;
    const py = this.currentHit.by + this.currentHit.ny;
    const pz = this.currentHit.bz + this.currentHit.nz;
    if (py <= 0 || py >= WORLD_HEIGHT) return;

    // Prevent placing inside player's own AABB
    if (this.intersectsPlayerAABB(px, py, pz)) return;

    if (this.world.setBlock(px, py, pz, itemDef.blockId)) {
      soundEngine.playPlace(BLOCKS[itemDef.blockId].sound);
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
    const dropItem = BLOCKS[this.currentHit.blockId]?.dropId ?? (this.currentHit.blockId as unknown as ItemId);
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

    if (this.gameMode === 'survival' && distToPlayer < radius * 1.8) {
      const dmg = Math.max(1, Math.round((1 - distToPlayer / (radius * 1.8)) * 12));
      this.applyPlayerDamage(dmg);
      // Knockback
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
          if (b === BlockId.Air || b === BlockId.Bedrock || b === BlockId.Water) continue;
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

    this.world.setBlock(bx, by, bz, BlockId.Air);
    soundEngine.playBreak(def.sound);
    this.particles.spawnBurst(bx + 0.5, by + 0.5, bz + 0.5, def.particleColor, 16, 3.6);
    this.cameraShake = Math.max(this.cameraShake, 0.022);
    this.hitstopTimer = 0.028;

    if (spawnDrops) {
      const held = this.hotbar[this.selectedSlot];
      const tool = held ? ITEMS[held.id].toolKind : 'none';
      const canHarvest = !def.requiresPickaxe || tool === 'pickaxe';
      if (canHarvest && def.dropId) {
        // Leaves only drop apples sometimes
        if (id !== BlockId.Leaves || Math.random() < 0.28) {
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

  private applyPlayerDamage(amount: number) {
    if (this.gameMode !== 'survival' || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.cameraShake = Math.max(this.cameraShake, 0.16);
    soundEngine.playHurt();
    if (this.health <= 0) {
      this.openScreen('gameover');
    } else {
      this.emitHud();
    }
  }

  // ---- Collision Helpers ----
  private isSolidAt(x: number, y: number, z: number): boolean {
    const id = this.world.getBlock(x, y, z);
    return BLOCKS[id].solid;
  }

  private collidesAABB(px: number, py: number, pz: number): boolean {
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

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return;
    }

    // Advance Day/Night Cycle slowly (~8 minutes full day)
    this.timeOfDay += dt * 0.0022;
    if (this.timeOfDay >= 1) {
      this.timeOfDay -= 1;
      this.dayCount += 1;
    }

    if (this.screen === 'title') {
      this.titleAngle += dt * 0.12;
      const orbitR = 26;
      const cx = 8.5 + Math.cos(this.titleAngle) * orbitR;
      const cz = 8.5 + Math.sin(this.titleAngle) * orbitR;
      const cy = Math.max(24, this.world.getTerrainHeight(cx, cz) + 11);
      this.camera.position.set(cx, cy, cz);
      this.camera.lookAt(8.5, 14, 8.5);
      this.world.updateChunksAround(this.playerPos.x, this.playerPos.z, RENDER_RADIUS, 3);
      this.sky.update(this.scene, this.camera.position, this.timeOfDay, dt, false);
      this.mobs.update(dt, this.world, this.playerPos, 'creative', this.timeOfDay, () => {});
      this.particles.update(dt);
      this.handGroup.visible = false;
      this.selectBox.visible = false;
      return;
    }

    this.handGroup.visible = this.screen === 'playing';

    if (this.screen === 'playing') {
      this.updatePlayer(dt);
      this.updateMining(dt);
    }

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

    // Nearest Glowstone point light
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

    this.world.updateChunksAround(this.playerPos.x, this.playerPos.z, RENDER_RADIUS, 3);
    this.sky.update(this.scene, this.playerPos, this.timeOfDay, dt, this.isUnderwater);
    this.particles.update(dt);
    this.drops.update(dt, this.world, this.playerPos, (id, cnt) => this.addItemToInventory(id, cnt));
    this.mobs.update(dt, this.world, this.playerPos, this.gameMode, this.timeOfDay, (x, y, z, r) =>
      this.triggerExplosion(x, y, z, r),
    );

    this.hudTimer += dt;
    if (this.hudTimer >= 0.12) {
      this.hudTimer = 0;
      this.emitHud();
    }
  }

  private updatePlayer(dt: number) {
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.placeCooldown > 0) this.placeCooldown -= dt;

    // Water check
    const headBlock = this.world.getBlock(
      this.playerPos.x,
      this.playerPos.y + EYE_HEIGHT,
      this.playerPos.z,
    );
    const feetBlock = this.world.getBlock(this.playerPos.x, this.playerPos.y + 0.2, this.playerPos.z);
    const wasUnderwater = this.isUnderwater;
    this.isUnderwater = headBlock === BlockId.Water;
    const inWater = feetBlock === BlockId.Water || this.isUnderwater;
    if (!wasUnderwater && this.isUnderwater) {
      soundEngine.playSplash();
    }

    // Movement basis from yaw (keyboard + analog touch stick)
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
    const sprintingNow = this.isSprinting || touchSprint;
    const targetSpeed = this.isFlying
      ? sprintingNow
        ? 14.5
        : 9.2
      : isSneaking
        ? 2.6
        : sprintingNow && moveForward > 0
          ? 6.9
          : inWater
            ? 3.2
            : 4.8;

    const accel = this.onGround || this.isFlying ? 24 : 9;
    this.playerVel.x = THREE.MathUtils.damp(this.playerVel.x, _vec3A.x * targetSpeed, accel, dt);
    this.playerVel.z = THREE.MathUtils.damp(this.playerVel.z, _vec3A.z * targetSpeed, accel, dt);

    // Vertical physics (Fly vs Water vs Gravity)
    const jumpHeld = this.keys.has('Space') || this.touchJumpHeld;
    const descendHeld = this.keys.has('ShiftLeft') || this.touchDescendHeld;

    if (this.isFlying) {
      let vy = 0;
      if (jumpHeld) vy += 8.0;
      if (descendHeld) vy -= 8.0;
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

    // Separate X, Z, Y axis sweep collisions (with Sneak edge guard)
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
        // Fall damage in Survival
        if (prevVy < -12.5 && !inWater && !this.isFlying) {
          const dmg = Math.floor((-prevVy - 11.5) * 1.15);
          this.applyPlayerDamage(dmg);
        }
      }
      this.playerVel.y = 0;
    }

    // Prevent falling below void
    if (this.playerPos.y < -8) {
      this.spawnPlayerSafe();
    }

    // Hunger tick in Survival
    if (this.gameMode === 'survival') {
      this.hungerTimer += dt * (this.isSprinting ? 2.2 : 1.0);
      if (this.hungerTimer >= 16) {
        this.hungerTimer = 0;
        if (this.hunger > 0) this.hunger -= 1;
        else this.applyPlayerDamage(1);
      }
      if (this.hunger >= 18 && this.health < this.maxHealth && Math.random() < dt * 0.25) {
        this.health = Math.min(this.maxHealth, this.health + 1);
      }
    }

    // Walk bobbing & footsteps
    const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    if (this.onGround && horizSpeed > 0.4) {
      this.walkBob += dt * horizSpeed * 2.1;
      this.stepDist += horizSpeed * dt;
      if (this.stepDist > 1.75) {
        this.stepDist = 0;
        const groundBlock = this.world.getBlock(this.playerPos.x, this.playerPos.y - 0.15, this.playerPos.z);
        if (groundBlock !== BlockId.Air) {
          soundEngine.playStep(BLOCKS[groundBlock].sound);
        }
      }
    } else {
      this.walkBob *= 0.85;
    }

    // Camera FOV & Shake
    const targetFov = this.isSprinting && horizSpeed > 3 ? 82 : 74;
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

    // Hand swing animation
    if (this.swingAnim > 0) {
      this.swingAnim = Math.max(0, this.swingAnim - dt * 5.2);
    }
    const swing = Math.sin(this.swingAnim * Math.PI);
    this.handGroup.position.set(
      0.42 - swing * 0.14,
      -0.34 + bobOffset * 0.45 - swing * 0.08,
      -0.58 - swing * 0.18,
    );
    this.handGroup.rotation.set(-swing * 0.85, swing * 0.25, swing * 0.3);

    // Raycast targeted block
    this.camera.getWorldDirection(_lookDir);
    this.currentHit = this.world.raycast(this.camera.position, _lookDir, 5.5);
    if (this.currentHit) {
      this.selectBox.visible = true;
      this.selectBox.position.set(
        this.currentHit.bx + 0.5,
        this.currentHit.by + 0.5,
        this.currentHit.bz + 0.5,
      );
    } else {
      this.selectBox.visible = false;
    }
  }

  private updateMining(dt: number) {
    const isMiningHeld = this.mouseLeftDown || this.touchMineHeld || this.touchHoldMining;
    if (!isMiningHeld || this.gameMode !== 'survival' || !this.currentHit) {
      if (!isMiningHeld) this.resetMining();
      return;
    }

    const { bx, by, bz, blockId } = this.currentHit;
    const def = BLOCKS[blockId];
    if (def.hardness < 0) {
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

    // Calculate speed multiplier from held tool
    const held = this.hotbar[this.selectedSlot];
    const itemDef = held ? ITEMS[held.id] : null;
    let mult = 1.0;
    if (itemDef && itemDef.toolKind === def.preferredTool) {
      mult = itemDef.miningMultiplier ?? 1.5;
    } else if (def.requiresPickaxe && (!itemDef || itemDef.toolKind !== 'pickaxe')) {
      mult = 0.35; // Very slow bare-handed stone mining
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
    this.onHudUpdate({
      screen: this.screen,
      gameMode: this.gameMode,
      health: this.health,
      maxHealth: this.maxHealth,
      hunger: this.hunger,
      xpLevel: this.xpLevel,
      xpProgress: this.xpProgress,
      hotbar: this.hotbar.map((s) => (s ? { ...s } : null)),
      inventory: this.inventory.map((s) => (s ? { ...s } : null)),
      selectedSlot: this.selectedSlot,
      timeOfDay: this.timeOfDay,
      dayCount: this.dayCount,
      coords: {
        x: Math.floor(this.playerPos.x),
        y: Math.floor(this.playerPos.y),
        z: Math.floor(this.playerPos.z),
      },
      targetedBlockName: this.currentHit ? BLOCKS[this.currentHit.blockId].name : null,
      breakProgress: this.miningProgress,
      isUnderwater: this.isUnderwater,
      isFlying: this.isFlying,
      muted: soundEngine.muted,
      showDebug: this.showDebug,
      touchControls: this.touchControls,
      seed: this.seed,
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
    this.drops.dispose();
    this.mobs.clear();

    this.opaqueMat.dispose();
    this.waterMat.dispose();
    this.textures.atlasTexture.dispose();
    this.textures.crackTextures.forEach((t) => t.dispose());
    this.crackMats.forEach((m) => m.dispose());
    this.crackMesh.geometry.dispose();
    this.selectBox.geometry.dispose();
    (this.selectBox.material as THREE.Material).dispose();

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

// Unused vector suppression for clean TS
void _vec3B;
