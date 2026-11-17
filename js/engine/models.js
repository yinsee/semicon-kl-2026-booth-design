// Shared furniture models: assets/models/<name>.glb + manifest.json (footprint per model).
// Each GLB loads once; every item gets its own clone (geometry + materials shared).
// Tags written by tools/models/factories.js come back as userData:
//   role ('screen', 'screen0'.., 'print', 'holo', 'spin', 'envmap'), noPick, noShadow.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { C } from './core.js';

const BASE = 'assets/models/';
// Revalidate with the server on load (edited models / manifest show without a hard refresh)
const loader = new GLTFLoader().setRequestHeader({ 'Cache-Control': 'no-cache' });
const cache = new Map();
let manifest = null;

export async function loadManifest() {
  manifest ??= await fetch(BASE + 'manifest.json', { cache: 'no-cache' }).then(r => r.json());
  return manifest;
}
export function modelMeta(name) {
  const m = manifest?.[name];
  if (!m) console.error(`[models] "${name}" missing from ${BASE}manifest.json`);
  return m ?? { w: 0.5, d: 0.5, h: 0.5 };
}

function loadModel(name) {
  if (!cache.has(name)) {
    cache.set(name, loader.loadAsync(`${BASE}${name}.glb`).then(gltf => {
      const aniso = C.renderer.capabilities.getMaxAnisotropy();
      gltf.scene.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = !o.userData.noShadow && !o.userData.noPick;
        o.receiveShadow = true;
        for (const m of [o.material].flat()) {
          for (const k of ['map', 'emissiveMap']) if (m[k]) m[k].anisotropy = aniso;
        }
      });
      return gltf.scene;
    }));
  }
  return cache.get(name);
}

// Clone the model into `root`, then call onReady(roles, model).
// roles: { role: [objects] }; named nodes are reachable with model.getObjectByName().
export function addModel(root, name, onReady) {
  return loadModel(name).then(src => {
    const model = src.clone(true);
    model.userData.cachedModel = true;          // shared GPU data: not disposed when a project closes
    const roles = {};
    model.traverse(o => {
      if (o.userData.noPick) o.raycast = () => {};
      const r = o.userData.role;
      if (r) (roles[r] ??= []).push(o);
    });
    onReady?.(roles, model);
    root.add(model);
    return model;
  }).catch(err => console.error(`[models] ${name} failed to load`, err));
}
