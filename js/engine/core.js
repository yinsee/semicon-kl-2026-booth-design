// Long-lived rendering objects, created once and reused for every project:
// renderer, perspective + iso cameras, OrbitControls (orbit / visitor look mode), composer with
// the outline pass, resize handling and the render loop.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { S } from './state.js';
import { updateQueueStraps } from './items.js';

export const C = {
  app: null, renderer: null, envTex: null,
  camera: null, isoCamera: null, activeCamera: null, controls: null,
  center: new THREE.Vector3(1.5, 1.2, 1.5),
  controlMode: 'orbit',
  composer: null, renderPass: null, outlinePass: null,
  clock: new THREE.Clock(),
};
export const LOOK_RADIUS = 0.05;
const ROT_PER_SEC = Math.PI / 180; // 1°/s
const emptyScene = new THREE.Scene();

export function initCore() {
  const app = C.app = document.getElementById('app');
  const renderer = C.renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(app.clientWidth || 1, app.clientHeight || 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCF honours shadow.radius (blur); PCFSoft ignores it
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  app.appendChild(renderer.domElement);
  C.envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

  C.camera = new THREE.PerspectiveCamera(50, (app.clientWidth || 1) / (app.clientHeight || 1), 0.1, 200);
  C.isoCamera = new THREE.OrthographicCamera();
  C.isoCamera.near = -50; C.isoCamera.far = 100;
  C.activeCamera = C.camera;
  bindControls(C.camera);

  // Visitor look mode: scroll = zoom by field of view (eye does not move)
  renderer.domElement.addEventListener('wheel', (e) => {
    if (C.controlMode !== 'look') return;
    e.preventDefault();
    C.camera.fov = THREE.MathUtils.clamp(C.camera.fov + Math.sign(e.deltaY) * 3, 25, 80);
    C.camera.updateProjectionMatrix();
  }, { passive: false });

  // Post-processing: render → outline (selection / Items-list hover) → output (tone map + sRGB)
  C.composer = new EffectComposer(renderer);
  C.renderPass = new RenderPass(emptyScene, C.activeCamera);
  C.outlinePass = new OutlinePass(new THREE.Vector2(app.clientWidth || 1, app.clientHeight || 1), emptyScene, C.activeCamera);
  Object.assign(C.outlinePass, { edgeStrength: 5, edgeGlow: 0.4, edgeThickness: 1.5, pulsePeriod: 0 });
  C.outlinePass.visibleEdgeColor.set(0xffd166);
  C.outlinePass.hiddenEdgeColor.set(0xb38a2a);   // edges behind other objects still show, dimmer
  C.composer.addPass(C.renderPass);
  C.composer.addPass(C.outlinePass);
  C.composer.addPass(new OutputPass());

  // The viewport (#app) changes size with the window and when the Items pane is minimized.
  new ResizeObserver(resizeViewport).observe(app);
  tick();
}

export function setScene(scene) {
  C.renderPass.scene = scene ?? emptyScene;
  C.outlinePass.renderScene = scene ?? emptyScene;
  C.outlinePass.selectedObjects = [];
}

// Per-project camera setup: orbit pivot + iso camera placement
export function placeCameras(views) {
  C.center.set(...views.center);
  fitIsoFrustum();
  const dist = views.iso?.dist ?? 15, elev = Math.atan(1 / Math.SQRT2), azim = Math.PI / 4;
  C.isoCamera.position.set(
    C.center.x + dist * Math.cos(elev) * Math.sin(azim),
    dist * Math.sin(elev),
    C.center.z + dist * Math.cos(elev) * Math.cos(azim),
  );
  C.isoCamera.lookAt(C.center);
  C.controls.target.copy(C.center);
}

function fitIsoFrustum() {
  const halfH = S.project?.views.iso?.halfH ?? 3;
  const halfW = halfH * (C.app.clientWidth || 1) / (C.app.clientHeight || 1);
  Object.assign(C.isoCamera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
  C.isoCamera.updateProjectionMatrix();
}

function bindControls(cam) {
  if (C.controls) C.controls.dispose();
  C.controls = new OrbitControls(cam, C.renderer.domElement);
  C.controls.target.copy(C.center);
  // Pan: Shift + drag on empty space (OrbitControls' modifier pan) or right-drag.
  // Each view button puts the pivot back on the booth centre.
  C.controls.screenSpacePanning = true;
  C.controls.enableDamping = true;
  setControlMode('orbit');
}

// 'orbit': normal booth orbit around the pivot.
// 'look' : first-person visitor — the eye stays put and drag turns the head. The pivot sits
//          5 cm in front of the eye, so orbiting it is effectively looking around.
export function setControlMode(mode) {
  const { controls, camera } = C;
  C.controlMode = mode;
  const look = mode === 'look';
  controls.enablePan = !look;
  controls.enableZoom = !look;             // in look mode the wheel changes the field of view instead
  controls.minDistance = look ? LOOK_RADIUS : 1.5;
  controls.maxDistance = look ? LOOK_RADIUS : 30;
  controls.minPolarAngle = look ? 0.35 : 0;
  controls.maxPolarAngle = look ? Math.PI - 0.35 : Math.PI / 2 - 0.01;
  controls.rotateSpeed = look ? -0.35 : 1;   // look: drag "grabs" the view, slower
  if (!look && camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
}

// Make `cam` (perspective or iso) the active camera. Rebinding the controls also leaves
// visitor look mode (orbit controls, normal lens).
export function useCamera(cam) {
  C.activeCamera = cam;
  if (cam === C.isoCamera) fitIsoFrustum();
  bindControls(cam);
  C.renderPass.camera = C.outlinePass.renderCamera = cam;
}
// Switch between the perspective and the iso (orthographic) camera. Returns true when iso is on.
export function toggleIsoCamera() {
  const turningOn = C.activeCamera === C.camera;
  useCamera(turningOn ? C.isoCamera : C.camera);
  return turningOn;
}

function resizeViewport() {
  const w = C.app.clientWidth, h = C.app.clientHeight;
  if (!w || !h) return;
  C.camera.aspect = w / h;
  C.camera.updateProjectionMatrix();
  fitIsoFrustum();
  C.renderer.setSize(w, h);
  C.composer.setSize(w, h);
}

function tick() {
  const dt = C.clock.getDelta();
  if (S.scene) {
    for (const o of S.animatedItems) o.rotation.y += ROT_PER_SEC * dt;
    updateQueueStraps();
    // Live reflection for polished metal (projects with `reflections`), refreshed every N frames
    if (S.cubeCam && S.frame++ % (S.project.reflections.every ?? 2) === 0) S.cubeCam.update(C.renderer, S.scene);
    C.controls.update();
    C.composer.render();
  }
  requestAnimationFrame(tick);
}
