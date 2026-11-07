// Builds public/models/vex-tower-takeover.glb: a rough, low-poly rebuild of the 2020 VEX Tower
// Takeover robot (photos in public/assets/vex/IMG_2015.JPEG and IMG_2075.JPEG), made from simple
// shapes. Dimensions are approximate (18 in starting size limit).
//
//   npm run model:vex
//
// A cube stacker: tread intakes at the front feed cubes onto a long ladder hinged at the front,
// which tips upright to score the stack. Each top-level group is one part in the viewer.
// TRAY_DEG sets the ladder angle: ~38 = carrying cubes (default), ~85 = tipped up to score.

import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { Euler, Quaternion } from 'three';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

const OUT = process.env.OUT ?? 'public/models/vex-tower-takeover.glb';
const TRAY_DEG = Number(process.env.TRAY_DEG ?? 40);

// glTF frame: x forward (intake side), y up, z to the robot's left. Units: metres.
const doc = new Document();
const buffer = doc.createBuffer();
const mat = (name, rgb, { rough = 0.5, metal = 0.1, alpha = 1 } = {}) => {
  const m = doc.createMaterial(name).setBaseColorFactor([...rgb, alpha]).setRoughnessFactor(rough).setMetallicFactor(metal);
  if (alpha < 1) m.setAlphaMode('BLEND').setDoubleSided(true);
  return m;
};
const M = {
  alu: mat('aluminium', [0.8, 0.81, 0.83], { rough: 0.35, metal: 0.55 }),
  hole: mat('hole', [0.12, 0.12, 0.14]),
  motor: mat('motor', [0.07, 0.07, 0.08], { rough: 0.6 }),
  logo: mat('vex_red', [0.8, 0.1, 0.12], { rough: 0.5 }),
  green: mat('omni_green', [0.1, 0.24, 0.16], { rough: 0.7 }),
  hub: mat('hub', [0.15, 0.15, 0.16], { rough: 0.5 }),
  sprocket: mat('sprocket_green', [0.08, 0.38, 0.24], { rough: 0.6 }),
  tread: mat('tread_grey', [0.42, 0.43, 0.45], { rough: 0.7 }),
  rung: mat('zip_tie', [0.04, 0.04, 0.05], { rough: 0.6 }),
  nylon: mat('nylon', [0.93, 0.91, 0.85], { rough: 0.6 }),
  band: mat('rubber_band', [0.72, 0.55, 0.32], { rough: 0.8 }),
  steel: mat('steel', [0.6, 0.66, 0.74], { rough: 0.35, metal: 0.6 }),
  cover: mat('clear_cover', [0.85, 0.9, 0.95], { rough: 0.15, alpha: 0.3 }),
  cubeGreen: mat('cube_green', [0.2, 0.68, 0.3], { rough: 0.45 }),
  cubeOrange: mat('cube_orange', [0.95, 0.42, 0.1], { rough: 0.45 }),
  cubePurple: mat('cube_purple', [0.45, 0.22, 0.68], { rough: 0.45 }),
  brain: mat('brain', [0.08, 0.08, 0.09], { rough: 0.5 }),
  screen: mat('screen', [0.1, 0.35, 0.75], { rough: 0.2 }),
  battery: mat('battery', [0.18, 0.18, 0.2], { rough: 0.6 })
};

// ---------- shapes ----------
const box = (sx, sy, sz) => {
  const [x, y, z] = [sx / 2, sy / 2, sz / 2];
  const c = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
  const f = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7];
  return { pos: c.flat(), idx: f };
};
// Cylinder along z, centred.
const cyl = (r, h, n = 20) => {
  const pos = [0, 0, -h / 2, 0, 0, h / 2];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pos.push(r * Math.cos(a), r * Math.sin(a), -h / 2, r * Math.cos(a), r * Math.sin(a), h / 2);
  }
  const idx = [];
  for (let i = 0; i < n; i++) {
    const a = 2 + i * 2, b = 2 + ((i + 1) % n) * 2;
    idx.push(0, b, a, 1, a + 1, b + 1, a, b, b + 1, a, b + 1, a + 1);
  }
  return { pos, idx };
};

const meshCache = new Map();
const mesh = (key, shape, material) => {
  const k = `${key}|${material.getName()}`;
  if (meshCache.has(k)) return meshCache.get(k);
  const s = shape();
  const prim = doc.createPrimitive().setMaterial(material);
  prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(s.pos)).setBuffer(buffer));
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(s.idx)).setBuffer(buffer));
  const m = doc.createMesh(key).addPrimitive(prim);
  meshCache.set(k, m);
  return m;
};
const q = (rx = 0, ry = 0, rz = 0) => new Quaternion().setFromEuler(new Euler(rx, ry, rz, 'XYZ')).toArray();
const node = (name, t = [0, 0, 0], r = [0, 0, 0, 1]) => doc.createNode(name).setTranslation(t).setRotation(r);
const put = (parent, m, t, r) => {
  const n = node('', t, r).setMesh(m);
  parent.addChild(n);
  return n;
};

// VEX C-channel (1x2x1 style) along local x: a web with a row of square holes plus two flanges.
// `up` = which way the flanges point (+1 / -1 along local z).
const PITCH = 0.0127; // 1/2 inch hole spacing
const cChannel = (parent, length, t, r, up = 1, material = M.alu) => {
  const g = node('', t, r);
  parent.addChild(g);
  put(g, mesh(`web_${length}`, () => box(length, 0.0254, 0.0016), material), [0, 0, 0]);
  for (const y of [0.0127, -0.0127]) put(g, mesh(`flange_${length}`, () => box(length, 0.0016, 0.0127), material), [0, y, up * 0.0063]);
  const hole = mesh('hole', () => box(0.0045, 0.0045, 0.0006), M.hole);
  for (let x = -length / 2 + PITCH / 2; x < length / 2; x += PITCH) put(g, hole, [x, 0, -up * 0.0011]);
  return g;
};

const motor = (parent, t, r) => {
  const g = node('', t, r);
  parent.addChild(g);
  put(g, mesh('v5_motor', () => box(0.07, 0.046, 0.033), M.motor), [0, 0, 0]);
  put(g, mesh('v5_logo', () => box(0.03, 0.012, 0.001), M.logo), [0.005, 0, 0.0171]);
  return g;
};

// 4-inch omni wheel: hub plus two staggered rows of green rollers.
const omni = (parent, t) => {
  const r = 0.0508;
  const g = node('', t);
  parent.addChild(g);
  put(g, mesh('omni_hub', () => cyl(r * 0.78, 0.026, 24), M.hub), [0, 0, 0]);
  const roller = mesh('omni_roller', () => cyl(0.0085, 0.017, 10), M.green);
  for (const [row, phase] of [[-0.007, 0], [0.007, Math.PI / 10]]) {
    for (let i = 0; i < 10; i++) {
      const a = phase + (i / 10) * Math.PI * 2;
      // Roller axis is tangent to the rim (perpendicular to the radius, in the wheel plane).
      put(g, roller, [(r - 0.0085) * Math.cos(a), (r - 0.0085) * Math.sin(a), row], q(Math.PI / 2, 0, a));
    }
  }
  return g;
};

// Tank-tread intake: a loop of links around two sprockets, along local x from 0 to `length`.
const tread = (parent, length, t, r) => {
  const R = 0.022;
  const g = node('', t, r);
  parent.addChild(g);
  const link = mesh('tread_link', () => box(0.011, 0.007, 0.03), M.tread);
  const flap = mesh('tread_flap', () => box(0.003, 0.016, 0.026), M.tread);
  const perimeter = 2 * length + 2 * Math.PI * R;
  const n = Math.round(perimeter / 0.0125);
  const arc = Math.PI * R;
  for (let i = 0; i < n; i++) {
    const s = (i / n) * perimeter;
    let x, y, a;
    if (s < length) [x, y, a] = [s, R, 0]; // top run
    else if (s < length + arc) {
      const t = (s - length) / R; // around the far sprocket
      [x, y, a] = [length + R * Math.sin(t), R * Math.cos(t), -t];
    } else if (s < 2 * length + arc) [x, y, a] = [2 * length + arc - s, -R, Math.PI]; // bottom run
    else {
      const t = (s - 2 * length - arc) / R; // around the near sprocket
      [x, y, a] = [-R * Math.sin(t), -R * Math.cos(t), Math.PI - t];
    }
    const l = put(g, link, [x, y, 0], q(0, 0, a));
    if (i % 3 === 0) put(l, flap, [0, 0.011, 0]); // flaps stick out of the loop to grab cubes
  }
  for (const x of [0, length]) put(g, mesh('sprocket', () => cyl(R * 0.9, 0.024, 16), M.sprocket), [x, 0, 0]);
  return g;
};

// ---------- robot ----------
const robot = node('VEX Tower Takeover robot');
const W = 0.19; // half-width to the outer frame rails

// Drivetrain: outer frame rails, front/back cross members, 4 omni wheels inside the rails, 4 motors.
const drive = node('Drivetrain');
robot.addChild(drive);
for (const z of [W, -W]) cChannel(drive, 0.45, [0, 0.055, z], q(0, 0, 0), z > 0 ? -1 : 1);
for (const x of [0.21, -0.21]) cChannel(drive, 0.4, [x, 0.04, 0], q(0, Math.PI / 2, 0));
for (const x of [0.14, -0.14]) for (const z of [W - 0.035, -W + 0.035]) omni(drive, [x, 0.0508, z]);
for (const x of [0.06, -0.06]) for (const z of [W - 0.09, -W + 0.09]) motor(drive, [x, 0.05, z], q(0, x > 0 ? 0 : Math.PI, 0));

// Ladder rest: two uprights mid-robot with a cross bar the ladder leans on.
const rest = node('Ladder rest');
robot.addChild(rest);
for (const z of [0.12, -0.12]) cChannel(rest, 0.18, [0, 0.145, z], q(0, 0, Math.PI / 2), z > 0 ? -1 : 1);
cChannel(rest, 0.26, [0, 0.235, 0], q(0, Math.PI / 2, 0));

// Ladder: two long rails with cross bars, hinged at the front and leaning back over the robot.
// Cubes stack along it; tipping it upright (TRAY_DEG ~ 85) scores the stack.
const ladder = node('Ladder', [0.17, 0.11, 0], q(0, 0, Math.PI - (TRAY_DEG * Math.PI) / 180));
robot.addChild(ladder);
const LL = 0.95;
for (const z of [0.06, -0.06]) cChannel(ladder, LL, [LL / 2, 0, z], q(0, 0, 0), z > 0 ? 1 : -1);
for (const x of [0.08, 0.33, 0.6, 0.88]) cChannel(ladder, 0.14, [x, 0.006, 0], q(0, Math.PI / 2, 0));
// Zip-tie rungs the cubes slide on, and at each telescoping joint white rollers and crossed bands.
const rung = mesh('rung', () => box(0.007, 0.005, 0.135), M.rung);
for (let x = 0.03; x < LL; x += 0.035) put(ladder, rung, [x, -0.016, 0]);
for (const x of [0.33, 0.64]) {
  for (const dx of [-0.02, 0.02]) for (const z of [0.08, -0.08]) put(ladder, mesh('roller', () => cyl(0.01, 0.03, 12), M.nylon), [x + dx, 0, z]);
  for (const a of [0.6, -0.6]) put(ladder, mesh('band', () => box(0.16, 0.003, 0.008), M.band), [x, -0.022, 0], q(0, a, 0));
}

// A few game cubes resting on the ladder (local -y is the upper face after the hinge rotation).
const cubes = node('Game cubes');
ladder.addChild(cubes);
const CUBE = 0.14;
[M.cubeGreen, M.cubeOrange, M.cubePurple, M.cubeOrange, M.cubeGreen].forEach((m, i) =>
  put(cubes, mesh(`cube_${m.getName()}`, () => box(CUBE, CUBE, CUBE), m), [0.17 + i * (CUBE + 0.004), -CUBE / 2 - 0.004, 0])
);

// Intakes: horizontal tread loops at the front corners grip cubes from the sides; motor on top.
for (const [side, z] of [['left', 0.1], ['right', -0.1]]) {
  const intake = node(`Intake (${side})`, [0.2, 0.09, z]);
  robot.addChild(intake);
  tread(intake, 0.18, [0, 0, 0], q(Math.PI / 2, 0, 0));
  cChannel(intake, 0.22, [0.09, -0.025, 0], q(Math.PI / 2, 0, 0));
  motor(intake, [0, 0.05, 0], q(0, 0, Math.PI / 2));
}

// V5 brain lying flat under a clear cover, battery beside it.
const brain = node('V5 brain & battery', [-0.13, 0.085, 0]);
robot.addChild(brain);
put(brain, mesh('brain', () => box(0.075, 0.02, 0.11), M.brain), [0, 0, 0]);
put(brain, mesh('screen', () => box(0.05, 0.002, 0.075), M.screen), [0, 0.011, 0]);
put(brain, mesh('brain_cover', () => box(0.09, 0.032, 0.125), M.cover), [0, 0.004, 0]);
put(brain, mesh('battery', () => box(0.06, 0.03, 0.12), M.battery), [0.09, -0.01, 0.06]);

// Steel rails sticking out of the back along the floor.
for (const z of [0.12, -0.12]) cChannel(drive, 0.3, [-0.36, 0.013, z], q(Math.PI / 2, 0, 0), 1, M.steel);

doc.createScene('scene').addChild(robot);

// ---------- write ----------
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await MeshoptEncoder.ready;
await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, doc);
console.log(`${OUT}: ${(statSync(OUT).size / 1024).toFixed(0)} KB`);
