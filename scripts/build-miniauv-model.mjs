// Builds public/models/mini-auv.glb: a stand-in for the RoboSub 2025 Mini-AUV, modelled from the
// SOLIDWORKS render (public/assets/mini-auv/FinalMiniAUVRender.jpg) until the real CAD is exported.
// Dimensions are estimates.
//
//   npm run model:miniauv
//
// Frame: x forward, y up, z to the left; metres. Propellers are named rotor_N so the website spins them.

import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

const OUT = process.env.OUT ?? 'public/models/mini-auv.glb';
const doc = new Document();
const buffer = doc.createBuffer();

const mat = (name, rgb, { rough = 0.45, metal = 0.1, alpha = 1 } = {}) => {
  const m = doc.createMaterial(name).setBaseColorFactor([...rgb, alpha]).setRoughnessFactor(rough).setMetallicFactor(metal);
  if (alpha < 1) m.setAlphaMode('BLEND').setDoubleSided(true);
  return m;
};
const M = {
  black: mat('anodised_black', [0.04, 0.04, 0.05], { rough: 0.35, metal: 0.3 }),
  gloss: mat('gloss_black', [0.02, 0.02, 0.025], { rough: 0.15, metal: 0.2 }),
  blue: mat('propeller_blue', [0.1, 0.12, 0.75], { rough: 0.3 }),
  yellow: mat('yellow', [0.95, 0.75, 0.05], { rough: 0.4 }),
  acrylic: mat('acrylic', [0.85, 0.9, 0.95], { rough: 0.05, alpha: 0.22 }),
  pcb: mat('pcb_green', [0.08, 0.42, 0.18], { rough: 0.5 }),
  part: mat('component_yellow', [0.9, 0.7, 0.2], { rough: 0.5 }),
  silver: mat('aluminium', [0.75, 0.77, 0.8], { rough: 0.3, metal: 0.7 }),
  red: mat('red', [0.8, 0.08, 0.06], { rough: 0.4 }),
  white: mat('white', [0.93, 0.93, 0.93], { rough: 0.5 })
};

// ---------- geometry helpers (return { pos, idx }) ----------
// Surface of revolution about +x from a profile of [radius, x] points (open at the ends).
const lathe = (profile, n = 32) => {
  const pos = [];
  const idx = [];
  for (const [r, x] of profile) for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pos.push(x, r * Math.cos(a), r * Math.sin(a));
  }
  for (let j = 0; j < profile.length - 1; j++)
    for (let i = 0; i < n; i++) {
      const a = j * n + i, b = j * n + ((i + 1) % n), c = a + n, d = b + n;
      idx.push(a, c, b, b, c, d);
    }
  return { pos, idx };
};
const box = (sx, sy, sz) => {
  const [x, y, z] = [sx / 2, sy / 2, sz / 2];
  const c = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
  return { pos: c.flat(), idx: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7] };
};
// Convex polygon (points in the y-z plane) extruded along x by `t`.
const plate = (pts, t) => {
  const n = pts.length;
  const pos = [...pts.flatMap(([y, z]) => [-t / 2, y, z]), ...pts.flatMap(([y, z]) => [t / 2, y, z])];
  const idx = [];
  for (let i = 1; i < n - 1; i++) idx.push(0, i + 1, i, n, n + i, n + i + 1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(i, j, n + j, i, n + j, n + i);
  }
  return { pos, idx };
};
const octagon = (w, h, c) => [[h / 2 - c, w / 2], [h / 2, w / 2 - c], [h / 2, -w / 2 + c], [h / 2 - c, -w / 2], [-h / 2 + c, -w / 2], [-h / 2, -w / 2 + c], [-h / 2, w / 2 - c], [-h / 2 + c, w / 2]].map(([y, z]) => [y, z]);
const cyl = (r, len, n = 24) => lathe([[0, -len / 2], [r, -len / 2], [r, len / 2], [0, len / 2]], n);

const meshes = new Map();
const mesh = (key, shapes) => {
  if (meshes.has(key)) return meshes.get(key);
  const m = doc.createMesh(key);
  for (const [{ pos, idx }, material] of shapes)
    m.addPrimitive(
      doc
        .createPrimitive()
        .setMaterial(material)
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buffer))
    );
  meshes.set(key, m);
  return m;
};
const q = (x = 0, y = 0, z = 0) => new Quaternion().setFromEuler(new Euler(x, y, z, 'XYZ')).toArray();
const node = (parent, name, t = [0, 0, 0], r = q(), m) => {
  const n = doc.createNode(name).setTranslation(t).setRotation(r);
  if (m) n.setMesh(m);
  parent.addChild(n);
  return n;
};

// ---------- T200-style thruster: duct, stator, motor nose, 3-blade propeller (thrust along +x) ----------
let rotorCount = 0;
const DUCT = mesh('duct', [[lathe([[0.046, -0.03], [0.05, -0.034], [0.052, 0.0], [0.05, 0.034], [0.046, 0.03], [0.046, -0.03]], 40), M.gloss]]);
const NOSE = mesh('motor', [[lathe([[0, -0.07], [0.012, -0.066], [0.02, -0.05], [0.021, 0.0], [0.016, 0.02], [0, 0.03]], 28), M.gloss]]);
const STATOR = mesh('stator', [[box(0.004, 0.09, 0.004), M.black]]);
const blade = () => {
  const pts = [];
  const idx = [];
  // A twisted, tapered blade from the hub out to the duct.
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const r = 0.016 + (0.028 * i) / steps;
    const chord = 0.026 - 0.01 * (i / steps);
    const twist = 0.7 - 0.35 * (i / steps);
    for (const s of [-1, 1]) pts.push(s * (chord / 2) * Math.sin(twist), r, s * (chord / 2) * Math.cos(twist));
  }
  for (let i = 0; i < steps; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3, a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return { pos: pts, idx };
};
const PROP = mesh('propeller', [0, 1, 2].map((k) => {
  const b = blade();
  const m = new Matrix4().makeRotationX((k * 2 * Math.PI) / 3);
  const pos = [];
  for (let i = 0; i < b.pos.length; i += 3) pos.push(...new Vector3(b.pos[i], b.pos[i + 1], b.pos[i + 2]).applyMatrix4(m).toArray());
  return [{ pos, idx: b.idx }, M.blue];
}).concat([[cyl(0.017, 0.02), M.blue]]));

const thruster = (parent, t, r) => {
  const g = node(parent, 'Thruster', t, r);
  node(g, '', [0, 0, 0], q(), DUCT);
  node(g, '', [0.0, 0, 0], q(), NOSE);
  for (const a of [Math.PI / 4, -Math.PI / 4]) node(g, '', [-0.025, 0, 0], q(a, 0, 0), STATOR);
  node(g, `rotor_${++rotorCount}`, [0.005, 0, 0], q(), PROP);
  return g;
};

// ---------- vehicle ----------
const root = doc.createNode('Mini-AUV');
doc.createScene('scene').addChild(root);

// Hull: clear acrylic tube with the electronics tray inside.
const HULL_R = 0.085;
const HULL_L = 0.44;
const hull = node(root, 'Acrylic hull');
node(hull, '', [0, 0, 0], q(), mesh('tube', [[lathe([[HULL_R, -HULL_L / 2], [HULL_R, HULL_L / 2]], 48), M.acrylic]]));
for (const x of [-HULL_L / 2 + 0.01, HULL_L / 2 - 0.01]) node(hull, '', [x, 0, 0], q(), mesh('flange', [[cyl(HULL_R + 0.006, 0.02, 48), M.silver]]));
const tray = node(root, 'Electronics tray');
node(tray, '', [0, -0.02, 0], q(), mesh('tray_pcb', [[box(0.34, 0.003, 0.12), M.pcb]]));
node(tray, '', [0.02, 0.03, 0], q(Math.PI / 2, 0, 0), mesh('tray_pcb2', [[box(0.26, 0.003, 0.07), M.pcb]]));
for (let i = 0; i < 9; i++) {
  const x = -0.14 + i * 0.035;
  node(tray, '', [x, -0.008, (i % 3) * 0.03 - 0.03], q(), mesh('cap', [[box(0.018, 0.022, 0.012), M.part]]));
}
node(tray, '', [-0.05, -0.05, 0], q(), mesh('battery', [[box(0.2, 0.04, 0.09), M.yellow]]));

// End caps: octagonal plates with penetrators on the front one.
const CAP = mesh('end_cap', [[plate(octagon(0.24, 0.24, 0.06), 0.012), M.black]]);
const caps = node(root, 'End caps');
node(caps, '', [HULL_L / 2 + 0.01, 0, 0], q(), CAP);
node(caps, '', [-HULL_L / 2 - 0.01, 0, 0], q(), CAP);
const PEN = mesh('penetrator', [[lathe([[0.009, 0], [0.009, 0.03], [0.007, 0.034], [0.007, 0.045], [0, 0.045]], 20), M.gloss]]);
for (const [y, z, red] of [[0.06, -0.05, 1], [0.06, -0.02, 0], [0.0, -0.06, 0], [0.0, 0.05, 0], [-0.05, -0.04, 0], [-0.05, 0.04, 0]])
  node(caps, '', [HULL_L / 2 + 0.016, y, z], q(), red ? mesh('penetrator_red', [[lathe([[0.009, 0], [0.009, 0.025], [0, 0.025]], 20), M.red]]) : PEN);

// Frame: hexagonal ring of black side plates around the hull, in the horizontal plane.
const frame = node(root, 'Frame');
const H = 0.11; // plate height
const outline = [[0.24, 0.12], [0.15, 0.22], [-0.15, 0.22], [-0.24, 0.12]];
for (const s of [-1, 1]) {
  for (let i = 0; i < outline.length - 1; i++) {
    const [x0, z0] = outline[i];
    const [x1, z1] = outline[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    node(frame, '', [(x0 + x1) / 2, -0.02, (s * (z0 + z1)) / 2], q(0, -Math.atan2(s * (z1 - z0), x1 - x0), 0), mesh(`side_${i}`, [[box(len, H, 0.006), M.black]]));
  }
}

// Thrusters: four vectored ones outside the angled corners, four vertical ones inside the frame.
const thrusters = node(root, 'Thrusters');
for (const sx of [-1, 1])
  for (const sz of [-1, 1]) {
    thruster(thrusters, [sx * 0.255, -0.02, sz * 0.225], q(0, Math.atan2(-sz, sx) + Math.PI, 0));
    thruster(thrusters, [sx * 0.11, -0.01, sz * 0.155], q(0, 0, Math.PI / 2));
  }

// Handles: black frames over the top at both ends, with yellow grips.
const handles = node(root, 'Handles');
for (const x of [-0.2, 0.2]) {
  for (const z of [-0.07, 0.07]) node(handles, '', [x, 0.13, z], q(), mesh('handle_post', [[box(0.012, 0.13, 0.012), M.black]]));
  node(handles, '', [x, 0.195, 0], q(), mesh('handle_bar', [[box(0.012, 0.012, 0.15), M.black]]));
  node(handles, '', [x, 0.207, 0], q(0, Math.PI / 2, 0), mesh('grip', [[lathe([[0, -0.06], [0.011, -0.058], [0.011, 0.058], [0, 0.06]], 20), M.yellow]]));
}

// Camera housing below the front cap: yellow tube with a white lens cap.
const cam = node(root, 'Camera');
node(cam, '', [HULL_L / 2 + 0.03, -0.11, 0.03], q(), mesh('camera_tube', [[cyl(0.026, 0.14), M.yellow]]));
node(cam, '', [HULL_L / 2 + 0.103, -0.11, 0.03], q(), mesh('camera_cap', [[cyl(0.022, 0.008), M.white]]));
node(cam, '', [HULL_L / 2 - 0.02, -0.11, 0.03], q(), mesh('camera_mount', [[box(0.05, 0.05, 0.04), M.yellow]]));

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await MeshoptEncoder.ready;
await doc.transform(weld(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, doc);
console.log(`${OUT}: ${(statSync(OUT).size / 1024).toFixed(0)} KB`);
