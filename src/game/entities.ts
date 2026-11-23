import * as THREE from 'three';
import { BLOCKS, ITEMS } from './blocks';
import { soundEngine } from './audio';
import { BlockId, GameMode, ItemId } from './types';
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

const MAX_PARTICLES = 180;

export class ParticlePool {
  public mesh: THREE.InstancedMesh;
  private pool: ParticleItem[] = [];
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
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
          1.5 + Math.random() * speed * 0.9,
          (Math.random() - 0.5) * speed,
        );
        p.life = 0;
        p.maxLife = 0.42 + Math.random() * 0.35;
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

// ---- Dropped Block Item Pickups ----
export interface DroppedItem {
  id: ItemId;
  count: number;
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

  public spawnDrop(x: number, y: number, z: number, id: ItemId, count = 1) {
    const item = ITEMS[id];
    const colorHex = item ? item.color : '#ffffff';
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.7,
      metalness: id === ItemId.Diamond || id === ItemId.IronIngot || id === ItemId.GoldIngot ? 0.55 : 0.05,
    });
    const mesh = new THREE.Mesh(this.dropGeo, mat);
    mesh.castShadow = true;
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.drops.push({
      id,
      count,
      mesh,
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3((Math.random() - 0.5) * 2.4, 3.2, (Math.random() - 0.5) * 2.4),
      age: 0,
    });
  }

  public update(
    dt: number,
    world: VoxelWorld,
    playerPos: THREE.Vector3,
    onCollect: (id: ItemId, count: number) => boolean,
  ) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      if (d.age > 90) {
        this.removeAt(i);
        continue;
      }

      // Gravity & simple ground collision
      d.vel.y -= 16 * dt;
      d.pos.x += d.vel.x * dt;
      d.pos.z += d.vel.z * dt;
      d.vel.x *= 0.92;
      d.vel.z *= 0.92;

      const nextY = d.pos.y + d.vel.y * dt;
      const belowBlock = world.getBlock(d.pos.x, nextY - 0.16, d.pos.z);
      if (BLOCKS[belowBlock].solid && d.vel.y < 0) {
        d.pos.y = Math.floor(nextY - 0.16) + 1.16;
        d.vel.y = 0;
      } else {
        d.pos.y = nextY;
      }

      // Magnetize toward player after 0.35s
      const distSq =
        (d.pos.x - playerPos.x) ** 2 +
        (d.pos.y - (playerPos.y - 0.6)) ** 2 +
        (d.pos.z - playerPos.z) ** 2;

      if (d.age > 0.35 && distSq < 5.5) {
        const pull = 7 * dt;
        d.pos.x += (playerPos.x - d.pos.x) * pull;
        d.pos.y += (playerPos.y - 0.5 - d.pos.y) * pull;
        d.pos.z += (playerPos.z - d.pos.z) * pull;
      }

      if (d.age > 0.35 && distSq < 1.1) {
        if (onCollect(d.id, d.count)) {
          soundEngine.playPickup();
          this.removeAt(i);
          continue;
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

// ---- Composite 3-12 Part Voxel Mobs (Pig, Sheep, Creeper) ----
export type MobKind = 'pig' | 'sheep' | 'creeper';

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
  fuseTimer: number; // For creeper windup telegraph!
  onGround: boolean;
}

function buildPigMesh(): { group: THREE.Group; legs: THREE.Mesh[]; head: THREE.Group } {
  const group = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1a1a8, roughness: 0.78 });
  const snoutMat = new THREE.MeshStandardMaterial({ color: 0xf6b8be, roughness: 0.65 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 });
  const hoofMat = new THREE.MeshStandardMaterial({ color: 0xd17e86, roughness: 0.85 });

  // 1. Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.96), skinMat);
  torso.position.set(0, 0.56, 0);
  torso.castShadow = true;
  group.add(torso);

  // 2..5 Legs (bottom-center aligned at y=0)
  const legGeo = new THREE.BoxGeometry(0.2, 0.34, 0.2);
  const legCoords: [number, number][] = [
    [-0.18, 0.3],
    [0.18, 0.3],
    [-0.18, -0.32],
    [0.18, -0.32],
  ];
  const legs: THREE.Mesh[] = [];
  for (const [lx, lz] of legCoords) {
    const leg = new THREE.Mesh(legGeo, hoofMat);
    leg.position.set(lx, 0.17, lz);
    leg.castShadow = true;
    group.add(leg);
    legs.push(leg);
  }

  // 6..9 Head + Snout + 2 Eyes
  const head = new THREE.Group();
  head.position.set(0, 0.68, 0.54);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.44, 0.44), skinMat);
  skull.castShadow = true;
  head.add(skull);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.1), snoutMat);
  snout.position.set(0, -0.06, 0.24);
  head.add(snout);

  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), eyeMat);
  eyeL.position.set(-0.14, 0.06, 0.22);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.14;
  head.add(eyeL, eyeR);

  group.add(head);
  return { group, legs, head };
}

function buildSheepMesh(): { group: THREE.Group; legs: THREE.Mesh[]; head: THREE.Group } {
  const group = new THREE.Group();
  const woolMat = new THREE.MeshStandardMaterial({ color: 0xf4f2ee, roughness: 0.95 });
  const faceMat = new THREE.MeshStandardMaterial({ color: 0xdfb99b, roughness: 0.72 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.4 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0xcba182, roughness: 0.85 });

  // Wool body + inner core
  const wool = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.68, 1.06), woolMat);
  wool.position.set(0, 0.72, 0);
  wool.castShadow = true;
  group.add(wool);

  const legGeo = new THREE.BoxGeometry(0.2, 0.42, 0.2);
  const legCoords: [number, number][] = [
    [-0.22, 0.34],
    [0.22, 0.34],
    [-0.22, -0.34],
    [0.22, -0.34],
  ];
  const legs: THREE.Mesh[] = [];
  for (const [lx, lz] of legCoords) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(lx, 0.21, lz);
    leg.castShadow = true;
    group.add(leg);
    legs.push(leg);
  }

  const head = new THREE.Group();
  head.position.set(0, 0.88, 0.56);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.46), faceMat);
  skull.castShadow = true;
  const woolCap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.42), woolMat);
  woolCap.position.set(0, 0.2, -0.02);
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), eyeMat);
  eyeL.position.set(-0.13, 0.05, 0.23);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.13;
  head.add(skull, woolCap, eyeL, eyeR);

  group.add(head);
  return { group, legs, head };
}

function buildCreeperMesh(): { group: THREE.Group; legs: THREE.Mesh[]; head: THREE.Group } {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4aa837, roughness: 0.85 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x378527, roughness: 0.9 });
  const faceMat = new THREE.MeshStandardMaterial({ color: 0x111511, roughness: 0.5 });

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.88, 0.32), bodyMat);
  torso.position.set(0, 0.78, 0);
  torso.castShadow = true;
  group.add(torso);

  // 4 Creeper feet
  const legGeo = new THREE.BoxGeometry(0.24, 0.38, 0.22);
  const legCoords: [number, number][] = [
    [-0.14, 0.22],
    [0.14, 0.22],
    [-0.14, -0.22],
    [0.14, -0.22],
  ];
  const legs: THREE.Mesh[] = [];
  for (const [lx, lz] of legCoords) {
    const leg = new THREE.Mesh(legGeo, trimMat);
    leg.position.set(lx, 0.19, lz);
    leg.castShadow = true;
    group.add(leg);
    legs.push(leg);
  }

  // Head + Iconic Creeper Face
  const head = new THREE.Group();
  head.position.set(0, 1.46, 0);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.52), bodyMat);
  skull.castShadow = true;
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.04), faceMat);
  eyeL.position.set(-0.12, 0.06, 0.26);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.12;
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.04), faceMat);
  mouth.position.set(0, -0.09, 0.26);
  const mouthL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.04), faceMat);
  mouthL.position.set(-0.1, -0.15, 0.26);
  const mouthR = mouthL.clone();
  mouthR.position.x = 0.1;

  head.add(skull, eyeL, eyeR, mouth, mouthL, mouthR);
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
    const kinds: MobKind[] = ['pig', 'sheep', 'pig', 'sheep', 'sheep', 'creeper'];
    for (let i = 0; i < kinds.length; i++) {
      const ang = (i / kinds.length) * Math.PI * 2 + 0.4;
      const dist = kinds[i] === 'creeper' ? 24 : 11 + (i % 3) * 5;
      const x = centerX + Math.cos(ang) * dist;
      const z = centerZ + Math.sin(ang) * dist;
      const y = world.groundHeightAt(x, z);
      this.spawnMob(kinds[i], x, y, z);
    }
  }

  public spawnMob(kind: MobKind, x: number, y: number, z: number) {
    const built =
      kind === 'pig'
        ? buildPigMesh()
        : kind === 'sheep'
          ? buildSheepMesh()
          : buildCreeperMesh();
    built.group.position.set(x, y, z);
    this.scene.add(built.group);

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
      hp: kind === 'creeper' ? 14 : 10,
      hurtFlash: 0,
      fuseTimer: 0,
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
    let bestDist = 4.2;
    for (let i = 0; i < this.mobs.length; i++) {
      const m = this.mobs[i];
      const cx = m.pos.x;
      const cy = m.pos.y + 0.85;
      const cz = m.pos.z;
      const dx = cx - origin.x;
      const dy = cy - origin.y;
      const dz = cz - origin.z;
      const proj = dx * dir.x + dy * dir.y + dz * dir.z;
      if (proj < 0 || proj > bestDist) continue;
      const perpSq = dx * dx + dy * dy + dz * dz - proj * proj;
      if (perpSq < 0.72) {
        bestDist = proj;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) return false;
    const m = this.mobs[bestIdx];
    m.hp -= damage;
    m.hurtFlash = 0.22;
    m.vel.x += dir.x * 5.2;
    m.vel.z += dir.z * 5.2;
    m.vel.y = 3.8;
    soundEngine.playHurt();
    particles.spawnBurst(m.pos.x, m.pos.y + 0.8, m.pos.z, 0xd83b3b, 10, 3.0);

    if (m.hp <= 0) {
      if (m.kind === 'pig' || m.kind === 'sheep') {
        drops.spawnDrop(m.pos.x, m.pos.y + 0.6, m.pos.z, ItemId.Apple, 1);
      } else {
        drops.spawnDrop(m.pos.x, m.pos.y + 0.6, m.pos.z, ItemId.Coal, 2);
      }
      this.removeAt(bestIdx);
    }
    return true;
  }

  public update(
    dt: number,
    world: VoxelWorld,
    playerPos: THREE.Vector3,
    mode: GameMode,
    timeOfDay: number,
    onExplosion: (x: number, y: number, z: number, radius: number) => void,
  ) {
    const isNight = timeOfDay > 0.52 && timeOfDay < 0.98;

    // Keep at least 1 creeper wandering at night, peaceful animals nearby
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      const dxP = playerPos.x - m.pos.x;
      const dzP = playerPos.z - m.pos.z;
      const distP = Math.hypot(dxP, dzP);

      // Respawn far away mobs near player
      if (distP > 48) {
        const ang = Math.random() * Math.PI * 2;
        const nx = playerPos.x + Math.cos(ang) * 22;
        const nz = playerPos.z + Math.sin(ang) * 22;
        m.pos.set(nx, world.groundHeightAt(nx, nz), nz);
        m.vel.set(0, 0, 0);
        m.fuseTimer = 0;
        continue;
      }

      // AI steering
      let moveSpeed = 1.65;
      if (m.kind === 'creeper' && mode === 'survival' && (isNight || distP < 12) && distP < 16) {
        m.yaw = Math.atan2(dxP, dzP);
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
      } else {
        m.fuseTimer = 0;
        m.wanderTimer -= dt;
        if (m.wanderTimer <= 0) {
          m.wanderTimer = 1.8 + Math.random() * 3.5;
          m.yaw += (Math.random() - 0.5) * 2.6;
          if (Math.random() < 0.14 && distP < 16) {
            if (m.kind === 'pig') soundEngine.playMob('pig');
            else if (m.kind === 'sheep') soundEngine.playMob('sheep');
          }
        }
      }

      const moving = m.wanderTimer > 0.8 || (m.kind === 'creeper' && distP < 16);
      const speed = moving ? moveSpeed : 0;
      const vx = Math.sin(m.yaw) * speed + m.vel.x;
      const vz = Math.cos(m.yaw) * speed + m.vel.z;
      m.vel.x *= 0.88;
      m.vel.z *= 0.88;

      // Voxel terrain stepping & collision
      const nextX = m.pos.x + vx * dt;
      const nextZ = m.pos.z + vz * dt;
      const blockAtFoot = world.getBlock(nextX, m.pos.y + 0.15, nextZ);
      const blockAtHead = world.getBlock(nextX, m.pos.y + 1.15, nextZ);

      if (BLOCKS[blockAtFoot].solid) {
        if (!BLOCKS[blockAtHead].solid && m.onGround) {
          m.vel.y = 5.4; // Hop up 1-block ledge
          m.onGround = false;
        } else {
          m.yaw += Math.PI * 0.7;
        }
      } else {
        m.pos.x = nextX;
        m.pos.z = nextZ;
      }

      // Gravity
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

      // Visual animation
      m.group.position.copy(m.pos);
      m.group.rotation.y = m.yaw;

      if (speed > 0.1) {
        m.walkPhase += dt * 7;
        const swing = Math.sin(m.walkPhase) * 0.5;
        m.legs[0].rotation.x = swing;
        m.legs[1].rotation.x = -swing;
        m.legs[2].rotation.x = -swing;
        m.legs[3].rotation.x = swing;
      } else {
        for (const leg of m.legs) leg.rotation.x *= 0.85;
      }

      // Hurt / Creeper fuse flash & swell
      if (m.hurtFlash > 0) m.hurtFlash -= dt;
      const swell = m.fuseTimer > 0 ? 1 + Math.sin(m.fuseTimer * 24) * 0.08 + m.fuseTimer * 0.12 : 1;
      m.group.scale.setScalar(swell);

      const flashWhite = m.hurtFlash > 0 || (m.fuseTimer > 0 && Math.floor(m.fuseTimer * 12) % 2 === 0);
      m.group.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
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
