import * as THREE from 'three';
import { BLOCKS, ITEMS } from './blocks';
import { soundEngine } from './audio';
import { BlockId, GameMode, ItemId, ItemStack } from './types';
import { VoxelWorld } from './world';

// ---- Pooled Voxel Particle Burst System ----
interface ParticleItem {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  scale: number;
  color: THREE.Color;
}

const MAX_PARTICLES = 220;

export class ParticlePool {
  public mesh: THREE.InstancedMesh;
  private pool: ParticleItem[] = [];
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_PARTICLES * 3),
      3,
    );

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool.push({
        active: false,
        pos: new THREE.Vector3(0, -999, 0),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        scale: 0,
        color: new THREE.Color(0xffffff),
      });
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.pool[i].color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
  }

  public spawnBurst(x: number, y: number, z: number, hexColor: number, count = 14, speed = 3.2) {
    let spawned = 0;
    for (let i = 0; i < MAX_PARTICLES && spawned < count; i++) {
      const p = this.pool[i];
      if (!p.active) {
        p.active = true;
        p.pos.set(
          x + (Math.random() - 0.5) * 0.7,
          y + (Math.random() - 0.5) * 0.7,
          z + (Math.random() - 0.5) * 0.7,
        );
        p.vel.set(
          (Math.random() - 0.5) * speed,
          1.4 + Math.random() * speed * 0.9,
          (Math.random() - 0.5) * speed,
        );
        p.life = 0;
        p.maxLife = 0.42 + Math.random() * 0.38;
        p.scale = 0.65 + Math.random() * 0.75;
        p.color.setHex(hexColor).offsetHSL(0, 0, (Math.random() - 0.5) * 0.12);
        this.mesh.setColorAt(i, p.color);
        spawned++;
      }
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  public update(dt: number) {
    let dirty = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      dirty = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      p.vel.y -= 15 * dt;
      p.pos.addScaledVector(p.vel, dt);
      const shrink = p.scale * (1 - p.life / p.maxLife);
      this.dummy.position.copy(p.pos);
      this.dummy.rotation.set(p.life * 6, p.life * 5, 0);
      this.dummy.scale.setScalar(Math.max(0.01, shrink));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    if (dirty) {
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  public dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// ---- Visible Footprints Pool (Instanced ground decals) ----
interface FootprintItem {
  active: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  life: number;
  maxLife: number;
}

const MAX_FOOTPRINTS = 48;

export class FootprintPool {
  public mesh: THREE.InstancedMesh;
  private pool: FootprintItem[] = [];
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.18, 0.015, 0.26);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x1a1a1a,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_FOOTPRINTS);
    this.mesh.frustumCulled = false;

    for (let i = 0; i < MAX_FOOTPRINTS; i++) {
      this.pool.push({ active: false, x: 0, y: -999, z: 0, yaw: 0, life: 0, maxLife: 6 });
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);
  }

  public spawnFootprint(x: number, y: number, z: number, yaw: number, isLeft: boolean) {
    let slot = this.pool.find((p) => !p.active);
    if (!slot) {
      slot = this.pool.reduce((a, b) => (a.life > b.life ? a : b));
    }
    const sideOffset = isLeft ? -0.14 : 0.14;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    slot.active = true;
    slot.x = x + cosY * sideOffset;
    slot.y = y + 0.015;
    slot.z = z - sinY * sideOffset;
    slot.yaw = yaw;
    slot.life = 0;
    slot.maxLife = 5.5;
  }

  public update(dt: number) {
    let dirty = false;
    for (let i = 0; i < MAX_FOOTPRINTS; i++) {
      const f = this.pool[i];
      if (!f.active) continue;
      dirty = true;
      f.life += dt;
      if (f.life >= f.maxLife) {
        f.active = false;
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      const fade = 1 - Math.max(0, (f.life - 3.5) / 2.0);
      this.dummy.position.set(f.x, f.y, f.z);
      this.dummy.rotation.set(0, f.yaw, 0);
      this.dummy.scale.set(fade, 1, fade);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    if (dirty) {
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  public dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// ---- Dropped Item Pickups (preserves durability!) ----
export interface DroppedItem {
  id: ItemId;
  count: number;
  durability?: number;
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
}

export class DropManager {
  public drops: DroppedItem[] = [];
  private scene: THREE.Scene;
  private dropGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public spawnDrop(
    x: number,
    y: number,
    z: number,
    id: ItemId,
    count = 1,
    durability?: number,
  ) {
    this.spawnDropWithVel(
      x,
      y,
      z,
      { id, count, durability },
      (Math.random() - 0.5) * 2.4,
      3.2,
      (Math.random() - 0.5) * 2.4,
    );
  }

  public spawnDropWithVel(
    x: number,
    y: number,
    z: number,
    stack: ItemStack,
    vx: number,
    vy: number,
    vz: number,
  ) {
    const item = ITEMS[stack.id];
    const colorHex = item ? item.color : '#ffffff';
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.65,
      metalness:
        stack.id === ItemId.Diamond ||
        stack.id === ItemId.IronIngot ||
        stack.id === ItemId.GoldIngot ||
        stack.id === ItemId.CopperIngot
          ? 0.55
          : 0.08,
    });
    const mesh = new THREE.Mesh(this.dropGeo, mat);
    mesh.castShadow = true;
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.drops.push({
      id: stack.id,
      count: stack.count,
      durability: stack.durability,
      mesh,
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(vx, vy, vz),
      age: 0,
    });
  }

  public update(
    dt: number,
    world: VoxelWorld,
    playerPos: THREE.Vector3,
    canPickup: boolean,
    onCollect: (stack: ItemStack) => boolean,
  ) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      if (d.age > 95) {
        this.removeAt(i);
        continue;
      }

      d.vel.y -= 16 * dt;
      const nx = d.pos.x + d.vel.x * dt;
      const nz = d.pos.z + d.vel.z * dt;
      if (!BLOCKS[world.getBlock(nx, d.pos.y, nz)].solid) {
        d.pos.x = nx;
        d.pos.z = nz;
      } else {
        d.vel.x *= -0.3;
        d.vel.z *= -0.3;
      }
      d.vel.x *= 0.92;
      d.vel.z *= 0.92;

      const nextY = d.pos.y + d.vel.y * dt;
      const belowBlock = world.getBlock(d.pos.x, nextY - 0.16, d.pos.z);
      if (BLOCKS[belowBlock].solid && d.vel.y <= 0) {
        d.pos.y = Math.floor(nextY - 0.16) + 1.16;
        d.vel.y = 0;
      } else {
        d.pos.y = nextY;
      }

      if (canPickup) {
        const distSq =
          (d.pos.x - playerPos.x) ** 2 +
          (d.pos.y - (playerPos.y + 0.6)) ** 2 +
          (d.pos.z - playerPos.z) ** 2;

        if (d.age > 0.55 && distSq < 5.5) {
          const pull = 7 * dt;
          d.pos.x += (playerPos.x - d.pos.x) * pull;
          d.pos.y += (playerPos.y + 0.6 - d.pos.y) * pull;
          d.pos.z += (playerPos.z - d.pos.z) * pull;
        }

        if (d.age > 0.55 && distSq < 1.15) {
          if (onCollect({ id: d.id, count: d.count, durability: d.durability })) {
            soundEngine.playPickup();
            this.removeAt(i);
            continue;
          }
        }
      }

      d.mesh.position.set(d.pos.x, d.pos.y + Math.sin(d.age * 4) * 0.08, d.pos.z);
      d.mesh.rotation.y += dt * 2.2;
    }
  }

  private removeAt(idx: number) {
    const d = this.drops[idx];
    (d.mesh.material as THREE.Material).dispose();
    this.scene.remove(d.mesh);
    this.drops.splice(idx, 1);
  }

  public dispose() {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      this.removeAt(i);
    }
    this.dropGeo.dispose();
  }
}

// ---- Arrow Projectile System (Bow, Crossbow, Skeletons) ----
interface ArrowEntity {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  damage: number;
  fromPlayer: boolean;
  stuck: boolean;
  age: number;
}

export class ProjectileManager {
  private arrows: ArrowEntity[] = [];
  private scene: THREE.Scene;
  private shaftGeo = new THREE.BoxGeometry(0.05, 0.05, 0.52);
  private tipGeo = new THREE.BoxGeometry(0.09, 0.09, 0.12);
  private shaftMat = new THREE.MeshStandardMaterial({ color: 0x8f6b3e, roughness: 0.8 });
  private tipMat = new THREE.MeshStandardMaterial({ color: 0xced4da, roughness: 0.4, metalness: 0.6 });

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public spawnArrow(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    speed: number,
    damage: number,
    fromPlayer: boolean,
  ) {
    const group = new THREE.Group();
    const shaft = new THREE.Mesh(this.shaftGeo, this.shaftMat);
    const tip = new THREE.Mesh(this.tipGeo, this.tipMat);
    tip.position.z = 0.28;
    group.add(shaft, tip);

    const pos = origin.clone().addScaledVector(dir, 0.55);
    const vel = dir.clone().normalize().multiplyScalar(speed);
    group.position.copy(pos);
    group.lookAt(pos.clone().add(vel));
    this.scene.add(group);

    this.arrows.push({
      mesh: group,
      pos,
      vel,
      damage,
      fromPlayer,
      stuck: false,
      age: 0,
    });
  }

  public update(
    dt: number,
    world: VoxelWorld,
    mobs: MobManager,
    drops: DropManager,
    particles: ParticlePool,
    playerPos: THREE.Vector3,
    onPlayerHit: (damage: number, dirX: number, dirZ: number) => void,
  ) {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.age += dt;
      if (a.age > (a.stuck ? 2.8 : 8)) {
        this.removeAt(i);
        continue;
      }
      if (a.stuck) continue;

      a.vel.y -= 13.5 * dt;
      a.pos.addScaledVector(a.vel, dt);
      a.mesh.position.copy(a.pos);
      a.mesh.lookAt(a.pos.x + a.vel.x, a.pos.y + a.vel.y, a.pos.z + a.vel.z);

      const b = world.getBlock(a.pos.x, a.pos.y, a.pos.z);
      if (BLOCKS[b].solid) {
        a.stuck = true;
        a.age = 0;
        particles.spawnBurst(a.pos.x, a.pos.y, a.pos.z, BLOCKS[b].particleColor, 5, 1.8);
        continue;
      }

      if (a.fromPlayer) {
        if (mobs.hitMobAtPoint(a.pos, a.vel, a.damage, drops, particles)) {
          this.removeAt(i);
          continue;
        }
      } else {
        const dx = playerPos.x - a.pos.x;
        const dy = playerPos.y + 0.9 - a.pos.y;
        const dz = playerPos.z - a.pos.z;
        if (dx * dx + dz * dz < 0.28 && Math.abs(dy) < 0.95) {
          const len = Math.hypot(a.vel.x, a.vel.z) || 1;
          onPlayerHit(a.damage, a.vel.x / len, a.vel.z / len);
          this.removeAt(i);
        }
      }
    }
  }

  private removeAt(idx: number) {
    this.scene.remove(this.arrows[idx].mesh);
    this.arrows.splice(idx, 1);
  }

  public clear() {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      this.removeAt(i);
    }
  }

  public dispose() {
    this.clear();
    this.shaftGeo.dispose();
    this.tipGeo.dispose();
    this.shaftMat.dispose();
    this.tipMat.dispose();
  }
}

// ---- 12 Composite Voxel Mobs (7 Peaceful + 5 Hostile) ----
export type MobKind =
  | 'cow'
  | 'pig'
  | 'sheep'
  | 'chicken'
  | 'horse'
  | 'cat'
  | 'dog'
  | 'zombie'
  | 'skeleton'
  | 'spider'
  | 'creeper'
  | 'enderman';

export function isHostileMob(kind: MobKind): boolean {
  return (
    kind === 'zombie' ||
    kind === 'skeleton' ||
    kind === 'spider' ||
    kind === 'creeper' ||
    kind === 'enderman'
  );
}

export interface MobEntity {
  kind: MobKind;
  group: THREE.Group;
  legs: THREE.Mesh[];
  head: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  wanderTimer: number;
  walkPhase: number;
  hp: number;
  hurtFlash: number;
  fuseTimer: number;
  attackCooldown: number;
  onGround: boolean;
}

function addLegGrid(
  group: THREE.Group,
  w: number,
  h: number,
  d: number,
  coords: [number, number][],
  mat: THREE.Material,
): THREE.Mesh[] {
  const geo = new THREE.BoxGeometry(w, h, d);
  const legs: THREE.Mesh[] = [];
  for (const [lx, lz] of coords) {
    const leg = new THREE.Mesh(geo, mat);
    leg.position.set(lx, h / 2, lz);
    leg.castShadow = true;
    group.add(leg);
    legs.push(leg);
  }
  return legs;
}

function buildMobMesh(kind: MobKind): { group: THREE.Group; legs: THREE.Mesh[]; head: THREE.Group } {
  const group = new THREE.Group();
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.4 });
  const head = new THREE.Group();
  let legs: THREE.Mesh[] = [];

  if (kind === 'pig') {
    const skin = new THREE.MeshStandardMaterial({ color: 0xf1a1a8, roughness: 0.78 });
    const snout = new THREE.MeshStandardMaterial({ color: 0xf7bec4, roughness: 0.65 });
    const hoof = new THREE.MeshStandardMaterial({ color: 0xd17e86, roughness: 0.85 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.96), skin);
    torso.position.set(0, 0.56, 0);
    torso.castShadow = true;
    group.add(torso);
    legs = addLegGrid(group, 0.2, 0.34, 0.2, [[-0.18, 0.3], [0.18, 0.3], [-0.18, -0.32], [0.18, -0.32]], hoof);
    head.position.set(0, 0.68, 0.54);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.44, 0.44), skin);
    skull.castShadow = true;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.1), snout);
    nose.position.set(0, -0.06, 0.24);
    const eL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), eyeMat);
    eL.position.set(-0.14, 0.06, 0.22);
    const eR = eL.clone();
    eR.position.x = 0.14;
    head.add(skull, nose, eL, eR);
  } else if (kind === 'cow') {
    const hide = new THREE.MeshStandardMaterial({ color: 0x5c3c28, roughness: 0.85 });
    const patch = new THREE.MeshStandardMaterial({ color: 0xebe6df, roughness: 0.9 });
    const hornMat = new THREE.MeshStandardMaterial({ color: 0xd8cfc0, roughness: 0.6 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.62, 1.12), hide);
    torso.position.set(0, 0.72, 0);
    torso.castShadow = true;
    const spot = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.28, 0.42), patch);
    spot.position.set(0, 0.78, -0.1);
    group.add(torso, spot);
    legs = addLegGrid(group, 0.2, 0.44, 0.2, [[-0.2, 0.38], [0.2, 0.38], [-0.2, -0.38], [0.2, -0.38]], hide);
    head.position.set(0, 0.92, 0.64);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.42), hide);
    skull.castShadow = true;
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.1), patch);
    muzzle.position.set(0, -0.1, 0.22);
    const hL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.07), hornMat);
    hL.position.set(-0.22, 0.24, 0);
    const hR = hL.clone();
    hR.position.x = 0.22;
    const eL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), eyeMat);
    eL.position.set(-0.14, 0.06, 0.21);
    const eR = eL.clone();
    eR.position.x = 0.14;
    head.add(skull, muzzle, hL, hR, eL, eR);
  } else if (kind === 'sheep') {
    const wool = new THREE.MeshStandardMaterial({ color: 0xf4f2ee, roughness: 0.95 });
    const face = new THREE.MeshStandardMaterial({ color: 0xdfb99b, roughness: 0.72 });
    const legM = new THREE.MeshStandardMaterial({ color: 0xcba182, roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.68, 1.06), wool);
    body.position.set(0, 0.72, 0);
    body.castShadow = true;
    group.add(body);
    legs = addLegGrid(group, 0.2, 0.42, 0.2, [[-0.22, 0.34], [0.22, 0.34], [-0.22, -0.34], [0.22, -0.34]], legM);
    head.position.set(0, 0.88, 0.56);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.46), face);
    skull.castShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.42), wool);
    cap.position.set(0, 0.2, -0.02);
    const eL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), eyeMat);
    eL.position.set(-0.13, 0.05, 0.23);
    const eR = eL.clone();
    eR.position.x = 0.13;
    head.add(skull, cap, eL, eR);
  } else if (kind === 'chicken') {
    const feather = new THREE.MeshStandardMaterial({ color: 0xfbfbfb, roughness: 0.88 });
    const beak = new THREE.MeshStandardMaterial({ color: 0xf09d26, roughness: 0.6 });
    const comb = new THREE.MeshStandardMaterial({ color: 0xd92626, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.36, 0.5), feather);
    body.position.set(0, 0.4, 0);
    body.castShadow = true;
    group.add(body);
    legs = addLegGrid(group, 0.08, 0.24, 0.08, [[-0.1, 0.04], [0.1, 0.04]], beak);
    head.position.set(0, 0.62, 0.24);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.24), feather);
    const bill = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.14), beak);
    bill.position.set(0, -0.02, 0.16);
    const wattle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), comb);
    wattle.position.set(0, -0.1, 0.12);
    const eL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.03), eyeMat);
    eL.position.set(-0.08, 0.04, 0.12);
    const eR = eL.clone();
    eR.position.x = 0.08;
    head.add(skull, bill, wattle, eL, eR);
  } else if (kind === 'horse') {
    const coat = new THREE.MeshStandardMaterial({ color: 0x9b5d33, roughness: 0.8 });
    const mane = new THREE.MeshStandardMaterial({ color: 0x332014, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.68, 1.38), coat);
    body.position.set(0, 0.96, 0);
    body.castShadow = true;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), mane);
    tail.position.set(0, 0.88, -0.74);
    group.add(body, tail);
    legs = addLegGrid(group, 0.18, 0.65, 0.18, [[-0.22, 0.5], [0.22, 0.5], [-0.22, -0.5], [0.22, -0.5]], mane);
    head.position.set(0, 1.38, 0.68);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.52, 0.34), coat);
    neck.position.set(0, -0.1, -0.06);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.54), coat);
    skull.position.set(0, 0.22, 0.16);
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.16), mane);
    crest.position.set(0, 0.08, -0.18);
    head.add(neck, skull, crest);
  } else if (kind === 'cat') {
    const fur = new THREE.MeshStandardMaterial({ color: 0xeb9b46, roughness: 0.82 });
    const belly = new THREE.MeshStandardMaterial({ color: 0xf9e6cf, roughness: 0.85 });
    const catEye = new THREE.MeshStandardMaterial({ color: 0x5ae655, roughness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.66), fur);
    body.position.set(0, 0.3, 0);
    body.castShadow = true;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.4), fur);
    tail.position.set(0, 0.42, -0.45);
    tail.rotation.x = 0.5;
    group.add(body, tail);
    legs = addLegGrid(group, 0.1, 0.2, 0.1, [[-0.09, 0.22], [0.09, 0.22], [-0.09, -0.22], [0.09, -0.22]], belly);
    head.position.set(0, 0.44, 0.36);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.26), fur);
    const earL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.06), fur);
    earL.position.set(-0.09, 0.15, -0.02);
    const earR = earL.clone();
    earR.position.x = 0.09;
    const eL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.03), catEye);
    eL.position.set(-0.07, 0.02, 0.13);
    const eR = eL.clone();
    eR.position.x = 0.07;
    head.add(skull, earL, earR, eL, eR);
  } else if (kind === 'dog') {
    const wolf = new THREE.MeshStandardMaterial({ color: 0xd6d1c9, roughness: 0.85 });
    const collar = new THREE.MeshStandardMaterial({ color: 0xd93030, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.78), wolf);
    body.position.set(0, 0.45, 0);
    body.castShadow = true;
    const neckCollar = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.38, 0.14), collar);
    neckCollar.position.set(0, 0.48, 0.34);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.36), wolf);
    tail.position.set(0, 0.56, -0.48);
    tail.rotation.x = 0.4;
    group.add(body, neckCollar, tail);
    legs = addLegGrid(group, 0.12, 0.3, 0.12, [[-0.13, 0.26], [0.13, 0.26], [-0.13, -0.26], [0.13, -0.26]], wolf);
    head.position.set(0, 0.62, 0.46);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.34), wolf);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.18), wolf);
    snout.position.set(0, -0.06, 0.2);
    const earL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.06), wolf);
    earL.position.set(-0.11, 0.2, -0.04);
    const earR = earL.clone();
    earR.position.x = 0.11;
    const eL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.03), eyeMat);
    eL.position.set(-0.09, 0.04, 0.17);
    const eR = eL.clone();
    eR.position.x = 0.09;
    head.add(skull, snout, earL, earR, eL, eR);
  } else if (kind === 'zombie') {
    const skin = new THREE.MeshStandardMaterial({ color: 0x5c8b47, roughness: 0.85 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0x2d7d8a, roughness: 0.85 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x3b3575, roughness: 0.88 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.72, 0.28), shirt);
    torso.position.set(0, 1.08, 0);
    torso.castShadow = true;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.65), skin);
    armL.position.set(-0.36, 1.28, 0.28);
    const armR = armL.clone();
    armR.position.x = 0.36;
    group.add(torso, armL, armR);
    legs = addLegGrid(group, 0.22, 0.72, 0.24, [[-0.13, 0], [0.13, 0]], pants);
    head.position.set(0, 1.68, 0);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), skin);
    const eL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.04), eyeMat);
    eL.position.set(-0.11, 0.03, 0.23);
    const eR = eL.clone();
    eR.position.x = 0.11;
    head.add(skull, eL, eR);
  } else if (kind === 'skeleton') {
    const bone = new THREE.MeshStandardMaterial({ color: 0xe3e0d5, roughness: 0.75 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.7, 0.22), bone);
    torso.position.set(0, 1.08, 0);
    torso.castShadow = true;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.6), bone);
    armL.position.set(-0.31, 1.28, 0.24);
    const armR = armL.clone();
    armR.position.x = 0.31;
    group.add(torso, armL, armR);
    legs = addLegGrid(group, 0.12, 0.72, 0.12, [[-0.13, 0], [0.13, 0]], bone);
    head.position.set(0, 1.66, 0);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), bone);
    const eL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.04), eyeMat);
    eL.position.set(-0.11, 0.03, 0.22);
    const eR = eL.clone();
    eR.position.x = 0.11;
    head.add(skull, eL, eR);
  } else if (kind === 'spider') {
    const bodyM = new THREE.MeshStandardMaterial({ color: 0x2a252c, roughness: 0.85 });
    const redEye = new THREE.MeshStandardMaterial({ color: 0xe62020, emissive: 0x7a0808, roughness: 0.4 });
    const abdomen = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.46, 0.78), bodyM);
    abdomen.position.set(0, 0.44, -0.3);
    abdomen.castShadow = true;
    group.add(abdomen);
    legs = addLegGrid(
      group,
      0.42,
      0.1,
      0.1,
      [
        [-0.44, 0.22],
        [0.44, 0.22],
        [-0.48, 0.0],
        [0.48, 0.0],
        [-0.44, -0.22],
        [0.44, -0.22],
      ],
      bodyM,
    );
    legs.forEach((l, i) => {
      l.position.y = 0.28;
      l.rotation.z = i % 2 === 0 ? 0.38 : -0.38;
    });
    head.position.set(0, 0.42, 0.34);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.36, 0.42), bodyM);
    const eL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.04), redEye);
    eL.position.set(-0.12, 0.04, 0.21);
    const eR = eL.clone();
    eR.position.x = 0.12;
    head.add(skull, eL, eR);
  } else if (kind === 'creeper') {
    const bodyM = new THREE.MeshStandardMaterial({ color: 0x4aa837, roughness: 0.85 });
    const trimM = new THREE.MeshStandardMaterial({ color: 0x378527, roughness: 0.9 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.88, 0.32), bodyM);
    torso.position.set(0, 0.78, 0);
    torso.castShadow = true;
    group.add(torso);
    legs = addLegGrid(group, 0.24, 0.38, 0.22, [[-0.14, 0.22], [0.14, 0.22], [-0.14, -0.22], [0.14, -0.22]], trimM);
    head.position.set(0, 1.46, 0);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.52), bodyM);
    const eL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.04), eyeMat);
    eL.position.set(-0.12, 0.06, 0.26);
    const eR = eL.clone();
    eR.position.x = 0.12;
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.04), eyeMat);
    mouth.position.set(0, -0.09, 0.26);
    head.add(skull, eL, eR, mouth);
  } else {
    // Enderman (tall dark body + glowing violet eyes)
    const dark = new THREE.MeshStandardMaterial({ color: 0x16141a, roughness: 0.88 });
    const glowEye = new THREE.MeshStandardMaterial({ color: 0xd966ff, emissive: 0x9922dd, roughness: 0.3 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.78, 0.26), dark);
    torso.position.set(0, 1.65, 0);
    torso.castShadow = true;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.15, 0.12), dark);
    armL.position.set(-0.32, 1.4, 0);
    const armR = armL.clone();
    armR.position.x = 0.32;
    group.add(torso, armL, armR);
    legs = addLegGrid(group, 0.12, 1.28, 0.12, [[-0.14, 0], [0.14, 0]], dark);
    head.position.set(0, 2.28, 0);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), dark);
    const eL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.06, 0.04), glowEye);
    eL.position.set(-0.11, 0.02, 0.22);
    const eR = eL.clone();
    eR.position.x = 0.11;
    head.add(skull, eL, eR);
  }

  group.add(head);
  return { group, legs, head };
}

export class MobManager {
  public mobs: MobEntity[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public spawnInitialMobs(world: VoxelWorld, centerX: number, centerZ: number) {
    this.clear();
    const kinds: MobKind[] = [
      'cow',
      'pig',
      'sheep',
      'chicken',
      'horse',
      'cat',
      'dog',
      'zombie',
      'skeleton',
      'spider',
      'creeper',
      'enderman',
    ];
    for (let i = 0; i < kinds.length; i++) {
      const ang = (i / kinds.length) * Math.PI * 2 + 0.35;
      const dist = isHostileMob(kinds[i]) ? 24 + (i % 3) * 4 : 10 + (i % 4) * 4;
      const x = centerX + Math.cos(ang) * dist;
      const z = centerZ + Math.sin(ang) * dist;
      const y = world.groundHeightAt(x, z);
      this.spawnMob(kinds[i], x, y, z);
    }
  }

  public spawnMob(kind: MobKind, x: number, y: number, z: number) {
    const built = buildMobMesh(kind);
    built.group.position.set(x, y, z);
    this.scene.add(built.group);

    const maxHp =
      kind === 'enderman'
        ? 30
        : kind === 'horse'
          ? 20
          : kind === 'zombie' || kind === 'skeleton'
            ? 18
            : kind === 'creeper' || kind === 'spider'
              ? 14
              : kind === 'chicken' || kind === 'cat'
                ? 8
                : 12;

    this.mobs.push({
      kind,
      group: built.group,
      legs: built.legs,
      head: built.head,
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      wanderTimer: 1 + Math.random() * 3,
      walkPhase: Math.random() * 6,
      hp: maxHp,
      hurtFlash: 0,
      fuseTimer: 0,
      attackCooldown: 0.6,
      onGround: false,
    });
  }

  public hitMobNearRay(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    damage: number,
    drops: DropManager,
    particles: ParticlePool,
  ): boolean {
    let bestIdx = -1;
    let bestDist = 4.4;
    for (let i = 0; i < this.mobs.length; i++) {
      const m = this.mobs[i];
      const targetH = m.kind === 'enderman' ? 1.45 : m.kind === 'chicken' || m.kind === 'cat' ? 0.4 : 0.9;
      const cx = m.pos.x;
      const cy = m.pos.y + targetH;
      const cz = m.pos.z;
      const dx = cx - origin.x;
      const dy = cy - origin.y;
      const dz = cz - origin.z;
      const proj = dx * dir.x + dy * dir.y + dz * dir.z;
      if (proj < 0 || proj > bestDist) continue;
      const perpSq = dx * dx + dy * dy + dz * dz - proj * proj;
      if (perpSq < 0.85) {
        bestDist = proj;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) return false;
    this.damageMobAt(bestIdx, damage, dir.x, dir.z, drops, particles);
    return true;
  }

  public hitMobAtPoint(
    point: THREE.Vector3,
    vel: THREE.Vector3,
    damage: number,
    drops: DropManager,
    particles: ParticlePool,
  ): boolean {
    for (let i = 0; i < this.mobs.length; i++) {
      const m = this.mobs[i];
      const h = m.kind === 'enderman' ? 2.5 : 1.5;
      const dx = m.pos.x - point.x;
      const dz = m.pos.z - point.z;
      if (dx * dx + dz * dz < 0.55 && point.y >= m.pos.y && point.y <= m.pos.y + h) {
        const len = Math.hypot(vel.x, vel.z) || 1;
        this.damageMobAt(i, damage, vel.x / len, vel.z / len, drops, particles);
        return true;
      }
    }
    return false;
  }

  private damageMobAt(
    idx: number,
    damage: number,
    dirX: number,
    dirZ: number,
    drops: DropManager,
    particles: ParticlePool,
  ) {
    const m = this.mobs[idx];
    m.hp -= damage;
    m.hurtFlash = 0.24;
    m.vel.x += dirX * 5.2;
    m.vel.z += dirZ * 5.2;
    m.vel.y = 3.8;
    soundEngine.playHurt();
    particles.spawnBurst(m.pos.x, m.pos.y + 0.85, m.pos.z, 0xd83b3b, 10, 3.0);

    // Enderman teleports briefly when struck if still alive
    if (m.kind === 'enderman' && m.hp > 0) {
      particles.spawnBurst(m.pos.x, m.pos.y + 1.4, m.pos.z, 0xb84dff, 16, 4.0);
      const ang = Math.random() * Math.PI * 2;
      m.pos.x += Math.cos(ang) * 5;
      m.pos.z += Math.sin(ang) * 5;
      m.pos.y += 0.5;
    }

    if (m.hp <= 0) {
      this.spawnMobLoot(m, drops);
      this.removeAt(idx);
    }
  }

  private spawnMobLoot(m: MobEntity, drops: DropManager) {
    const x = m.pos.x;
    const y = m.pos.y + 0.6;
    const z = m.pos.z;
    switch (m.kind) {
      case 'cow':
        drops.spawnDrop(x, y, z, ItemId.RawMeat, 2);
        drops.spawnDrop(x, y, z, ItemId.Leather, 1);
        break;
      case 'pig':
        drops.spawnDrop(x, y, z, ItemId.RawMeat, 2);
        break;
      case 'sheep':
        drops.spawnDrop(x, y, z, ItemId.RawMeat, 1);
        drops.spawnDrop(x, y, z, ItemId.String, 2);
        break;
      case 'chicken':
        drops.spawnDrop(x, y, z, ItemId.Feather, 2);
        drops.spawnDrop(x, y, z, ItemId.RawMeat, 1);
        break;
      case 'horse':
        drops.spawnDrop(x, y, z, ItemId.Leather, 2);
        break;
      case 'zombie':
        drops.spawnDrop(x, y, z, Math.random() < 0.35 ? ItemId.IronIngot : ItemId.Coal, 1);
        break;
      case 'skeleton':
        drops.spawnDrop(x, y, z, ItemId.Arrow, 3);
        drops.spawnDrop(x, y, z, ItemId.Feather, 1);
        break;
      case 'spider':
        drops.spawnDrop(x, y, z, ItemId.String, 2);
        break;
      case 'creeper':
        drops.spawnDrop(x, y, z, ItemId.Coal, 2);
        break;
      case 'enderman':
        drops.spawnDrop(x, y, z, ItemId.EnderPearl, 1);
        if (Math.random() < 0.35) drops.spawnDrop(x, y, z, ItemId.Diamond, 1);
        break;
      default:
        break;
    }
  }

  public update(
    dt: number,
    world: VoxelWorld,
    playerPos: THREE.Vector3,
    mode: GameMode,
    timeOfDay: number,
    projectiles: ProjectileManager,
    onExplosion: (x: number, y: number, z: number, radius: number) => void,
    onPlayerAttacked: (damage: number, dirX: number, dirZ: number) => void,
  ) {
    const isNight = timeOfDay > 0.5 && timeOfDay < 0.98;
    const canHostileAggro = mode === 'survival' || mode === 'adventure';

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      const dxP = playerPos.x - m.pos.x;
      const dzP = playerPos.z - m.pos.z;
      const distP = Math.hypot(dxP, dzP);

      if (distP > 54) {
        const ang = Math.random() * Math.PI * 2;
        const nx = playerPos.x + Math.cos(ang) * 24;
        const nz = playerPos.z + Math.sin(ang) * 24;
        m.pos.set(nx, world.groundHeightAt(nx, nz), nz);
        m.vel.set(0, 0, 0);
        m.fuseTimer = 0;
        continue;
      }

      if (m.attackCooldown > 0) m.attackCooldown -= dt;

      // Sunlight burn for undead (zombie & skeleton) during bright day
      if (!isNight && (m.kind === 'zombie' || m.kind === 'skeleton') && timeOfDay > 0.14 && timeOfDay < 0.42) {
        m.hp -= dt * 0.45;
        if (m.hp <= 0) {
          this.removeAt(i);
          continue;
        }
      }

      let moveSpeed = m.kind === 'horse' ? 2.4 : m.kind === 'cat' ? 2.1 : 1.6;
      const hostile = isHostileMob(m.kind);
      const aggroRange = m.kind === 'enderman' ? 11 : isNight ? 20 : 12;

      if (hostile && canHostileAggro && distP < aggroRange) {
        m.yaw = Math.atan2(dxP, dzP);

        if (m.kind === 'creeper') {
          moveSpeed = 2.65;
          if (distP < 2.6) {
            if (m.fuseTimer === 0) soundEngine.playMob('creeper_hiss');
            m.fuseTimer += dt;
            moveSpeed = 0.6;
            if (m.fuseTimer >= 1.35) {
              const ex = m.pos.x;
              const ey = m.pos.y + 0.6;
              const ez = m.pos.z;
              this.removeAt(i);
              onExplosion(ex, ey, ez, 3.2);
              continue;
            }
          } else {
            m.fuseTimer = Math.max(0, m.fuseTimer - dt * 1.5);
          }
        } else if (m.kind === 'skeleton') {
          moveSpeed = distP > 8.5 ? 2.2 : distP < 4.5 ? -1.4 : 0.2;
          if (m.attackCooldown <= 0 && distP < 15) {
            m.attackCooldown = 2.2;
            const origin = new THREE.Vector3(m.pos.x, m.pos.y + 1.45, m.pos.z);
            const aim = new THREE.Vector3(dxP, playerPos.y + 0.9 - origin.y + distP * 0.08, dzP).normalize();
            projectiles.spawnArrow(origin, aim, 22, 3, false);
            soundEngine.playMob('skeleton');
          }
        } else {
          // Zombie, Spider, Enderman melee chase
          moveSpeed = m.kind === 'spider' ? 3.5 : m.kind === 'enderman' ? 3.4 : 2.35;
          if (distP < 1.85 && Math.abs(playerPos.y - m.pos.y) < 2.2 && m.attackCooldown <= 0) {
            m.attackCooldown = m.kind === 'spider' ? 0.9 : 1.25;
            const dmg = m.kind === 'enderman' ? 5 : 3;
            onPlayerAttacked(dmg, dxP / Math.max(0.2, distP), dzP / Math.max(0.2, distP));
            soundEngine.playMob(m.kind);
          }
        }
      } else if (m.kind === 'dog' && distP > 4 && distP < 18) {
        // Friendly dog gently trots near player
        m.yaw = Math.atan2(dxP, dzP);
        moveSpeed = 2.4;
      } else {
        m.fuseTimer = 0;
        m.wanderTimer -= dt;
        if (m.wanderTimer <= 0) {
          m.wanderTimer = 1.8 + Math.random() * 3.5;
          m.yaw += (Math.random() - 0.5) * 2.6;
          if (m.kind !== 'creeper' && Math.random() < 0.16 && distP < 16) {
            soundEngine.playMob(m.kind);
          }
        }
      }

      const moving =
        (hostile && canHostileAggro && distP < aggroRange) ||
        (m.kind === 'dog' && distP > 4 && distP < 18) ||
        m.wanderTimer > 0.8;
      const speed = moving ? moveSpeed : 0;
      const vx = Math.sin(m.yaw) * speed + m.vel.x;
      const vz = Math.cos(m.yaw) * speed + m.vel.z;
      m.vel.x *= 0.88;
      m.vel.z *= 0.88;

      const nextX = m.pos.x + vx * dt;
      const nextZ = m.pos.z + vz * dt;
      const blockAtFoot = world.getBlock(nextX, m.pos.y + 0.15, nextZ);
      const blockAtHead = world.getBlock(nextX, m.pos.y + 1.15, nextZ);

      if (BLOCKS[blockAtFoot].solid) {
        if (!BLOCKS[blockAtHead].solid && m.onGround) {
          m.vel.y = 5.4;
          m.onGround = false;
        } else {
          m.yaw += Math.PI * 0.7;
        }
      } else {
        m.pos.x = nextX;
        m.pos.z = nextZ;
      }

      m.vel.y -= 18 * dt;
      const nextY = m.pos.y + m.vel.y * dt;
      const below = world.getBlock(m.pos.x, nextY - 0.05, m.pos.z);
      if (BLOCKS[below].solid && m.vel.y <= 0) {
        m.pos.y = Math.floor(nextY - 0.05) + 1;
        m.vel.y = 0;
        m.onGround = true;
      } else {
        m.pos.y = nextY;
        m.onGround = false;
      }

      m.group.position.copy(m.pos);
      m.group.rotation.y = m.yaw;

      if (Math.abs(speed) > 0.25 && m.legs.length > 0) {
        m.walkPhase += dt * 7.5;
        const swing = Math.sin(m.walkPhase) * 0.5;
        for (let l = 0; l < m.legs.length; l++) {
          m.legs[l].rotation.x = l % 2 === 0 ? swing : -swing;
        }
      } else {
        for (const leg of m.legs) leg.rotation.x *= 0.85;
      }

      if (m.hurtFlash > 0) m.hurtFlash -= dt;
      const swell = m.fuseTimer > 0 ? 1 + Math.sin(m.fuseTimer * 24) * 0.08 + m.fuseTimer * 0.12 : 1;
      m.group.scale.setScalar(swell);

      const flashWhite = m.hurtFlash > 0 || (m.fuseTimer > 0 && Math.floor(m.fuseTimer * 12) % 2 === 0);
      m.group.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          if (m.kind === 'enderman' || m.kind === 'spider') {
            if (child.material.color.getHex() === 0xd966ff || child.material.color.getHex() === 0xe62020) return;
          }
          child.material.emissive.setHex(
            m.hurtFlash > 0 ? 0xaa2222 : flashWhite ? 0xcccccc : 0x000000,
          );
        }
      });
    }
  }

  private removeAt(idx: number) {
    const m = this.mobs[idx];
    m.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((mat) => mat.dispose());
        else child.material.dispose();
      }
    });
    this.scene.remove(m.group);
    this.mobs.splice(idx, 1);
  }

  public clear() {
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      this.removeAt(i);
    }
  }
}
