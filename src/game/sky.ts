import * as THREE from 'three';

const SKY_DAWN = new THREE.Color(0xf09b6c);
const SKY_DAY = new THREE.Color(0x78b4ff);
const SKY_DUSK = new THREE.Color(0xd96b52);
const SKY_NIGHT = new THREE.Color(0x0b1020);
const _skyCol = new THREE.Color();
const _sunColor = new THREE.Color();

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
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene, isSoftwareGl: boolean) {
    // 1. Hemisphere Light (sky/ground contrast)
    this.hemiLight = new THREE.HemisphereLight(0x9bd2ff, 0x4b4236, 0.72);
    scene.add(this.hemiLight);

    // 2. Directional Key Light (Sun / Moon)
    this.sunLight = new THREE.DirectionalLight(0xfff5e0, 1.5);
    this.sunLight.castShadow = !isSoftwareGl;
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

    // 3. Blocky Sun & Moon
    const sunGeo = new THREE.BoxGeometry(10, 10, 2);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff6b8, fog: false });
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
    this.group.add(this.sunMesh);

    const moonGeo = new THREE.BoxGeometry(8, 8, 2);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xdce6ff, fog: false });
    this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
    this.group.add(this.moonMesh);

    // 4. Procedural Starfield
    const starCount = 320;
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
      size: 1.4,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      fog: false,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.group.add(this.stars);

    // 5. Blocky Minecraft Clouds (InstancedMesh)
    const cloudCount = 36;
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
        y: 38 + Math.floor(Math.random() * 3) * 1.5,
        z: (Math.random() - 0.5) * 180,
        sx: 6 + Math.floor(Math.random() * 10),
        sz: 5 + Math.floor(Math.random() * 8),
      });
    }
    scene.add(this.cloudMesh);
    scene.add(this.group);
  }

  public update(
    scene: THREE.Scene,
    playerPos: THREE.Vector3,
    timeOfDay: number,
    dt: number,
    isUnderwater: boolean,
  ) {
    // 0.0 = dawn, 0.25 = noon, 0.5 = dusk, 0.75 = midnight
    const angle = timeOfDay * Math.PI * 2;
    const sunY = Math.sin(angle);
    const sunX = Math.cos(angle);

    this.group.position.set(playerPos.x, 0, playerPos.z);

    this.sunMesh.position.set(sunX * 115, sunY * 115, -24);
    this.sunMesh.lookAt(playerPos.x, 12, playerPos.z);

    this.moonMesh.position.set(-sunX * 115, -sunY * 115, 24);
    this.moonMesh.lookAt(playerPos.x, 12, playerPos.z);

    // Light follows player for crisp shadows
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
      const edge = sunX > 0 ? SKY_DAWN : SKY_DUSK;
      _skyCol.copy(edge).lerp(SKY_DAY, t);
    } else if (sunY > -0.25) {
      const t = (sunY + 0.25) / 0.2;
      const edge = sunX > 0 ? SKY_DAWN : SKY_DUSK;
      _skyCol.copy(SKY_NIGHT).lerp(edge, t);
    } else {
      _skyCol.copy(SKY_NIGHT);
    }

    if (isUnderwater) {
      _skyCol.lerp(new THREE.Color(0x164482), 0.78);
    }

    if (scene.background instanceof THREE.Color) {
      scene.background.copy(_skyCol);
    } else {
      scene.background = _skyCol.clone();
    }

    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(_skyCol);
      scene.fog.near = isUnderwater ? 4 : 26;
      scene.fog.far = isUnderwater ? 22 : 56;
    }

    // Light intensities
    const dayFactor = THREE.MathUtils.clamp((sunY + 0.15) / 0.45, 0, 1);
    this.sunLight.intensity = THREE.MathUtils.lerp(0.32, 1.55, dayFactor);
    if (dayFactor > 0.4) {
      _sunColor.setHex(0xfff3d8);
    } else if (dayFactor > 0.05) {
      _sunColor.setHex(0xffa469);
    } else {
      _sunColor.setHex(0x88a8e6);
    }
    this.sunLight.color.copy(_sunColor);

    this.hemiLight.intensity = THREE.MathUtils.lerp(0.28, 0.76, dayFactor);
    this.starMat.opacity = THREE.MathUtils.clamp(1 - dayFactor * 1.4, 0, 0.92);
    this.cloudMat.color.setHex(0xffffff).lerp(new THREE.Color(0x2e3b5c), 1 - dayFactor);

    // Drift clouds gently
    for (let i = 0; i < this.cloudPositions.length; i++) {
      const c = this.cloudPositions[i];
      c.x += dt * 1.3;
      if (c.x - playerPos.x > 95) c.x -= 190;
      if (c.x - playerPos.x < -95) c.x += 190;
      if (c.z - playerPos.z > 95) c.z -= 190;
      if (c.z - playerPos.z < -95) c.z += 190;

      this.dummy.position.set(c.x, c.y, c.z);
      this.dummy.scale.set(c.sx, 1, c.sz);
      this.dummy.updateMatrix();
      this.cloudMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.cloudMesh.instanceMatrix.needsUpdate = true;
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
  }
}
