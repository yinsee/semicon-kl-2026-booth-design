// Booth shell + scene setup from the project JSON: background, lights, ground, carpet floor,
// footprint edges, walls (per-face colour / backdrop image), fascia boards, poles, guides,
// and the optional live reflection (CubeCamera) for polished metal.
import * as THREE from 'three';
import { C } from './core.js';
import { S } from './state.js';
import { carpetTexture, fasciaTexture } from './media.js';

const FACE_INDEX = { '+x': 0, '-x': 1, '+y': 2, '-y': 3, '+z': 4, '-z': 5 };

export function buildScene(project) {
  const { room, scene: cfg, floor: fl } = project;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(cfg.background);   // OutputPass tone-maps the background too
  scene.fog = new THREE.Fog(cfg.background, ...(cfg.fog ?? [20, 60]));
  scene.environment = C.envTex;

  // --- Lighting ---
  scene.add(new THREE.HemisphereLight(cfg.hemi.sky, cfg.hemi.ground, cfg.hemi.intensity));
  const sun = new THREE.DirectionalLight(0xffffff, cfg.sun.intensity);
  sun.position.set(...cfg.sun.position);
  sun.castShadow = true;
  sun.shadow.mapSize.set(cfg.sun.mapSize, cfg.sun.mapSize);
  const e = cfg.sun.extent;
  Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 0.5, far: 30 });
  sun.shadow.bias = -0.0005;
  sun.shadow.radius = cfg.sun.radius ?? 8;   // soft, blurred edges
  scene.add(sun);

  // --- Ground (outside the booth) ---
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x2a2f33, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(room.w / 2, -0.001, room.d / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  // --- Booth shell: one selectable, always-locked object ---
  const booth = new THREE.Group();
  booth.userData = { id: 'booth', isBooth: true, locked: true, w: room.w, d: room.d, h: room.h };
  scene.add(booth);

  const carpet = carpetTexture(fl.carpet);
  carpet.repeat.set(room.w * 2, room.d * 2);       // 1 tile per 0.5 m
  const bump = fl.bumpScale ? carpet.clone() : null; // same canvas as a bump map so the pile catches the light
  if (bump) bump.colorSpace = THREE.NoColorSpace;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(room.w, room.d), new THREE.MeshStandardMaterial({
    map: carpet, bumpMap: bump, bumpScale: fl.bumpScale ?? 0, color: fl.tint, roughness: fl.roughness ?? 1, metalness: 0,
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(room.w / 2, 0, room.d / 2);
  floor.receiveShadow = true;
  booth.add(floor);

  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(room.w, room.d)),
    new THREE.LineBasicMaterial({ color: fl.edgeColor }));
  edges.rotation.x = -Math.PI / 2;
  edges.position.set(room.w / 2, 0.005, room.d / 2);
  booth.add(edges);

  // --- Walls: box per wall; `faces` puts a backdrop image on one face (stretched to fit) ---
  for (const w of project.walls ?? []) {
    const plain = new THREE.MeshStandardMaterial({ color: w.color, roughness: 0.9 });
    const mats = Array(6).fill(plain);
    for (const [face, path] of Object.entries(w.faces ?? {})) {
      const tex = new THREE.TextureLoader().load(path);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = C.renderer.capabilities.getMaxAnisotropy();
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      mats[FACE_INDEX[face]] = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    }
    const m = new THREE.Mesh(new THREE.BoxGeometry(...w.size), mats);
    m.position.set(...w.position);
    m.castShadow = m.receiveShadow = true;
    booth.add(m);
  }

  // --- Fascia boards ---
  for (const f of project.fascias ?? []) {
    if (f.style === 'navy-plane') {
      // Thin sign: printed both sides (back copy mirrored so it reads correctly from behind)
      const geo = new THREE.PlaneGeometry(...f.size);
      for (const [mirrored, side] of [[false, THREE.FrontSide], [true, THREE.BackSide]]) {
        const tex = fasciaTexture(f, mirrored);
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
          map: tex, side, roughness: 0.7, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.18,
        }));
        m.position.set(...f.position);
        m.rotation.y = f.rotationY ?? 0;
        booth.add(m);
      }
    } else {
      // White board with the company name on the outer (+Z) face
      const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
      const print = new THREE.MeshStandardMaterial({ map: fasciaTexture(f), roughness: 0.8 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(...f.size), [white, white, white, white, print, white]);
      m.position.set(...f.position);
      m.rotation.y = f.rotationY ?? 0;
      m.castShadow = m.receiveShadow = true;
      booth.add(m);
    }
  }
  for (const p of project.poles ?? []) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(p.radius, p.radius, p.height, 16),
      new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.5, metalness: 0.35 }));
    m.position.set(...p.position);
    m.castShadow = true;
    booth.add(m);
  }

  // --- Live reflection for polished metal (envmap items) ---
  if (project.reflections) {
    S.cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    S.cubeRT.texture.mapping = THREE.CubeReflectionMapping;
    S.cubeCam = new THREE.CubeCamera(0.1, 40, S.cubeRT);
    S.cubeCam.position.set(...project.reflections.position);
    scene.add(S.cubeCam);
  }

  // --- Guides: floor grid (1 m), Y reference grid (rings every 0.5 m + corner posts), axes ---
  const g = project.guides;
  const grid = new THREE.GridHelper(g.grid.size, g.grid.divisions, 0x8a8f95, 0x6a7076);
  grid.material.opacity = 0.9;
  grid.material.transparent = true;
  grid.position.set(...g.grid.position);
  scene.add(grid);
  const yGrid = new THREE.Group();
  const lineMat = new THREE.LineBasicMaterial({ color: 0x9aa3aa, transparent: true, opacity: 0.55 });
  const line = (pts) => yGrid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  for (let y = 0.5; y <= g.yMax + 1e-6; y += 0.5) {
    line([[0, 0], [room.w, 0], [room.w, room.d], [0, room.d], [0, 0]].map(([x, z]) => new THREE.Vector3(x, y, z)));
  }
  for (const [cx, cz] of [[0, 0], [room.w, 0], [room.w, room.d], [0, room.d]]) {
    line([new THREE.Vector3(cx, 0, cz), new THREE.Vector3(cx, g.yMax, cz)]);
  }
  yGrid.visible = false;
  scene.add(yGrid);
  const axes = new THREE.AxesHelper(0.6);
  axes.position.set(0, 0.01, 0);
  scene.add(axes);

  Object.assign(S, { scene, booth, grid, yGrid, axes });
  return scene;
}

// Free GPU memory of the closed project. Cloned GLB models share their data with the model
// cache (reused by the next project), so they are skipped.
export function disposeScene(scene) {
  const seen = new Set();
  const free = (o) => {
    if (o.userData.cachedModel) return;
    o.geometry?.dispose();
    for (const m of [o.material].flat().filter(Boolean)) {
      if (seen.has(m)) continue;
      seen.add(m);
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      m.dispose();
    }
    if (o.isLight && o.shadow?.map) o.shadow.map.dispose();
    o.children.forEach(free);
  };
  free(scene);
  S.cubeRT?.dispose();
}
