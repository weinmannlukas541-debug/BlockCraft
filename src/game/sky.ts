import * as THREE from 'three';
import { soundEngine } from './audio';
import { BiomeId, WeatherType } from './types';

const SKY_DAWN = new THREE.Color(0xf09b6c);
const SKY_DAY = new THREE.Color(0x78b4ff);
const SKY_DUSK = new THREE.Color(0xd96b52);
const SKY_NIGHT = new THREE.Color(0x0b1020);
const SKY_STORM = new THREE.Color(0x3b4454);
const _skyCol = new THREE.Color();
const _sunColor = new THREE.Color();

const PRECIP_COUNT = 340;

export class SkyEnvironment {
  public group = new THREE.Group();
  public sunLight: THREE.DirectionalLight;
  public hemiLight: THREE.HemisphereLight;

  private sunMesh: THREE.Mesh;
  private moonMesh: THREE.Mesh;
  private stars: THREE.Points;
  private starMat: THREE.PointsMaterial;
  private cloudMesh: THREE.InstancedMesh;
  private cloudMat: THREE.MeshStandardMaterial;
  private cloudPositions: { x: number; y: number; z: number; sx: number; sz: number }[] = [];

  // Weather precipitation particles
  private precipMesh: THREE.InstancedMesh;
  private precipMat: THREE.MeshBasicMaterial;
  private precipOffsets: { x: number; y: number; z: number; speed: number }[] = [];
  private lightningFlash = 0;
  private nextLightningTimer = 14;
  private isSoftwareGl: boolean;
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene, isSoftwareGl: boolean, shadowsEnabled = true) {
    this.isSoftwareGl = isSoftwareGl;

    this.hemiLight = new THREE.HemisphereLight(0x9bd2ff, 0x4b4236, 0.72);
    scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff5e0, 1.5);
    this.sunLight.castShadow = !isSoftwareGl && shadowsEnabled;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    const d = 34;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 140;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    this.sunMesh = new THREE.Mesh(
      new THREE.BoxGeometry(10, 10, 2),
      new THREE.MeshBasicMaterial({ color: 0xfff6b8, fog: false }),
    );
    this.group.add(this.sunMesh);

    this.moonMesh = new THREE.Mesh(
      new THREE.BoxGeometry(8, 8, 2),
      new THREE.MeshBasicMaterial({ color: 0xdce6ff, fog: false }),
    );
    this.group.add(this.moonMesh);

    const starCount = 340;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.85 + 0.1);
      const r = 135;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi);
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      fog: false,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.group.add(this.stars);

    const cloudCount = 38;
    const cloudGeo = new THREE.BoxGeometry(1, 1.4, 1);
    this.cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0,
      transparent: true,
      opacity: 0.88,
    });
    this.cloudMesh = new THREE.InstancedMesh(cloudGeo, this.cloudMat, cloudCount);
    this.cloudMesh.frustumCulled = false;

    for (let i = 0; i < cloudCount; i++) {
      this.cloudPositions.push({
        x: (Math.random() - 0.5) * 180,
        y: 44 + Math.floor(Math.random() * 3) * 1.5,
        z: (Math.random() - 0.5) * 180,
        sx: 6 + Math.floor(Math.random() * 10),
        sz: 5 + Math.floor(Math.random() * 8),
      });
    }
    scene.add(this.cloudMesh);

    // Rain / Snow instanced mesh
    this.precipMat = new THREE.MeshBasicMaterial({
      color: 0xaaccff,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    this.precipMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.08, 0.55, 0.08),
      this.precipMat,
      PRECIP_COUNT,
    );
    this.precipMesh.frustumCulled = false;
    this.precipMesh.visible = false;
    for (let i = 0; i < PRECIP_COUNT; i++) {
      this.precipOffsets.push({
        x: (Math.random() - 0.5) * 28,
        y: Math.random() * 18 - 4,
        z: (Math.random() - 0.5) * 28,
        speed: 14 + Math.random() * 6,
      });
    }
    scene.add(this.precipMesh);
    scene.add(this.group);
  }

  public setShadowsEnabled(enabled: boolean) {
    this.sunLight.castShadow = !this.isSoftwareGl && enabled;
  }

  public update(
    scene: THREE.Scene,
    playerPos: THREE.Vector3,
    timeOfDay: number,
    dt: number,
    isUnderwater: boolean,
    weather: WeatherType,
    biome: BiomeId,
    weatherParticlesEnabled: boolean,
    renderDistance: number,
  ) {
    const angle = timeOfDay * Math.PI * 2;
    const sunY = Math.sin(angle);
    const sunX = Math.cos(angle);

    this.group.position.set(playerPos.x, 0, playerPos.z);

    this.sunMesh.position.set(sunX * 115, sunY * 115, -24);
    this.sunMesh.lookAt(playerPos.x, 12, playerPos.z);
    this.moonMesh.position.set(-sunX * 115, -sunY * 115, 24);
    this.moonMesh.lookAt(playerPos.x, 12, playerPos.z);

    const isDay = sunY >= -0.05;
    const dirX = isDay ? sunX : -sunX;
    const dirY = Math.max(0.22, isDay ? sunY : -sunY);
    this.sunLight.position.set(
      playerPos.x + dirX * 55,
      playerPos.y + dirY * 60,
      playerPos.z - 18,
    );
    this.sunLight.target.position.set(playerPos.x, playerPos.y, playerPos.z);
    this.sunLight.target.updateMatrixWorld();

    // Sky color interpolation
    if (sunY > 0.25) {
      _skyCol.copy(SKY_DAY);
    } else if (sunY > -0.05) {
      const t = (sunY + 0.05) / 0.3;
      _skyCol.copy(sunX > 0 ? SKY_DAWN : SKY_DUSK).lerp(SKY_DAY, t);
    } else if (sunY > -0.25) {
      const t = (sunY + 0.25) / 0.2;
      _skyCol.copy(SKY_NIGHT).lerp(sunX > 0 ? SKY_DAWN : SKY_DUSK, t);
    } else {
      _skyCol.copy(SKY_NIGHT);
    }

    const isStormy = weather === 'rain' || weather === 'storm' || weather === 'snow';
    if (isStormy && biome !== 'desert') {
      _skyCol.lerp(SKY_STORM, weather === 'storm' ? 0.65 : 0.42);
    }

    // Lightning flash during storm
    if (weather === 'storm' && biome !== 'desert' && biome !== 'snow') {
      this.nextLightningTimer -= dt;
      if (this.nextLightningTimer <= 0) {
        this.nextLightningTimer = 8 + Math.random() * 14;
        this.lightningFlash = 1.0;
        soundEngine.playThunder();
      }
    }
    if (this.lightningFlash > 0) {
      this.lightningFlash = Math.max(0, this.lightningFlash - dt * 3.8);
      _skyCol.lerp(new THREE.Color(0xeef6ff), this.lightningFlash * 0.75);
    }

    if (isUnderwater) {
      _skyCol.lerp(new THREE.Color(0x164482), 0.78);
    }

    if (scene.background instanceof THREE.Color) {
      scene.background.copy(_skyCol);
    } else {
      scene.background = _skyCol.clone();
    }

    const maxFog = Math.max(36, renderDistance * 16 + 10);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(_skyCol);
      scene.fog.near = isUnderwater ? 4 : isStormy ? maxFog * 0.35 : maxFog * 0.5;
      scene.fog.far = isUnderwater ? 22 : isStormy ? maxFog * 0.85 : maxFog;
    }

    const dayFactor = THREE.MathUtils.clamp((sunY + 0.15) / 0.45, 0, 1);
    const stormDim = isStormy && biome !== 'desert' ? 0.72 : 1.0;
    this.sunLight.intensity =
      THREE.MathUtils.lerp(0.32, 1.55, dayFactor) * stormDim + this.lightningFlash * 2.5;
    if (dayFactor > 0.4) _sunColor.setHex(0xfff3d8);
    else if (dayFactor > 0.05) _sunColor.setHex(0xffa469);
    else _sunColor.setHex(0x88a8e6);
    this.sunLight.color.copy(_sunColor);

    this.hemiLight.intensity = THREE.MathUtils.lerp(0.28, 0.76, dayFactor);
    this.starMat.opacity = isStormy ? 0 : THREE.MathUtils.clamp(1 - dayFactor * 1.4, 0, 0.92);
    this.cloudMat.color
      .setHex(0xffffff)
      .lerp(new THREE.Color(0x2e3b5c), 1 - dayFactor)
      .lerp(new THREE.Color(0x4c5464), isStormy ? 0.55 : 0);

    // Wind-driven clouds
    const windSpeed = weather === 'storm' ? 3.8 : 1.4;
    for (let i = 0; i < this.cloudPositions.length; i++) {
      const c = this.cloudPositions[i];
      c.x += dt * windSpeed;
      if (c.x - playerPos.x > 95) c.x -= 190;
      if (c.x - playerPos.x < -95) c.x += 190;
      if (c.z - playerPos.z > 95) c.z -= 190;
      if (c.z - playerPos.z < -95) c.z += 190;

      this.dummy.position.set(c.x, c.y, c.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(c.sx, 1, c.sz);
      this.dummy.updateMatrix();
      this.cloudMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.cloudMesh.instanceMatrix.needsUpdate = true;

    // Weather precipitation particles
    const showSnow = weather === 'snow' || (isStormy && (biome === 'snow' || biome === 'mountains'));
    const showRain = !showSnow && (weather === 'rain' || weather === 'storm') && biome !== 'desert';

    if (weatherParticlesEnabled && (showRain || showSnow) && !isUnderwater) {
      this.precipMesh.visible = true;
      this.precipMat.color.setHex(showSnow ? 0xf2f8ff : 0x8ec0ff);
      this.precipMat.opacity = showSnow ? 0.85 : 0.58;
      const fallMult = showSnow ? 0.22 : 1.0;
      const windX = weather === 'storm' ? 3.2 : 0.8;

      for (let i = 0; i < PRECIP_COUNT; i++) {
        const p = this.precipOffsets[i];
        p.y -= p.speed * fallMult * dt;
        p.x += windX * dt;
        if (p.y < -4) p.y += 18;
        if (p.x > 14) p.x -= 28;

        this.dummy.position.set(playerPos.x + p.x, playerPos.y + p.y, playerPos.z + p.z);
        this.dummy.rotation.set(0, 0, showSnow ? p.y : -windX * 0.04);
        this.dummy.scale.set(showSnow ? 1.5 : 0.7, showSnow ? 0.25 : 1.15, showSnow ? 1.5 : 0.7);
        this.dummy.updateMatrix();
        this.precipMesh.setMatrixAt(i, this.dummy.matrix);
      }
      this.precipMesh.instanceMatrix.needsUpdate = true;
    } else {
      this.precipMesh.visible = false;
    }
  }

  public dispose() {
    this.sunMesh.geometry.dispose();
    (this.sunMesh.material as THREE.Material).dispose();
    this.moonMesh.geometry.dispose();
    (this.moonMesh.material as THREE.Material).dispose();
    this.stars.geometry.dispose();
    this.starMat.dispose();
    this.cloudMesh.geometry.dispose();
    this.cloudMat.dispose();
    this.precipMesh.geometry.dispose();
    this.precipMat.dispose();
  }
}
