// Builds public/models/lego-ev3-robot.glb: the EV3 robot for the National Robotics Competition,
// rebuilt from video with real LEGO part geometry from the LDraw library. The layout is approximate.
//
//   npm run model:lego
//
// Needs the LDraw library unzipped in raw-assets/lego/ldraw
// (https://library.ldraw.org/library/updates/complete.zip, CC BY 4.0).
//
// Positions below are in LDraw units (1 LDU = 0.4 mm; a stud / beam hole = 20 LDU) in a y-up frame:
// x to the robot's right, y up, z forward. Wheels are at the back, colour sensors at the front.

import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { CatmullRomCurve3, TubeGeometry, Vector3 } from 'three';
import { createLDraw } from './lib/ldraw.mjs';

const OUT = process.env.OUT ?? 'public/models/lego-ev3-robot.glb';
const LIB = 'raw-assets/lego/ldraw';

// LDraw colour codes
const BLACK = 0, RED = 4, YELLOW = 14, LBGREY = 71, DBGREY = 72, WHITE = 15;

// ---------- placement helpers (y-up frame -> LDraw's y-down frame) ----------
const deg = (d) => (d * Math.PI) / 180;
const rx = (d) => [1, 0, 0, 0, Math.cos(deg(d)), -Math.sin(deg(d)), 0, Math.sin(deg(d)), Math.cos(deg(d))];
const ry = (d) => [Math.cos(deg(d)), 0, Math.sin(deg(d)), 0, 1, 0, -Math.sin(deg(d)), 0, Math.cos(deg(d))];
const rz = (d) => [Math.cos(deg(d)), -Math.sin(deg(d)), 0, Math.sin(deg(d)), Math.cos(deg(d)), 0, 0, 0, 1];
const m3 = (A, B) => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]));
const rot = (...rs) => rs.reduce(m3, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
const I = rot();
// F = diag(1, -1, -1) turns the y-up frame into LDraw's; parts are placed with F R F.
const F = [1, 0, 0, 0, -1, 0, 0, 0, -1];

// Natural orientation of the parts used (y-up frame, from the LDraw geometry):
//   beams run along z, holes along x;  pins and axles along x;  wheels' axle, gears and bushes along z;
//   cross blocks along y;
//   EV3 large motor: hub axle along x, body forward (+z) and up;  medium motor: output along -z;
//   EV3 brick: lying flat, screen up.
const parts = []; // [name, colour, [x,y,z], R] so each group can be exported as its own node
const place = (group, part, colour, [x, y, z], R = I) => parts.push([group, part, colour, [x, y, z], R]);

// Beam along an arbitrary direction in the x-y plane (degrees from +x), holes along z.
const BEAM_IN_XY = (angle) => rot(rz(angle), ry(90));
// Beam standing up (along y), holes along x / along z.
const UP_X = rx(90);
const UP_Z = rot(ry(90), rx(90));
// Beam lying across the robot (along x), holes along z.
const ACROSS = ry(90);

// ---------- layout, from the front photo ----------
// Two boxy black towers either side, the EV3 brick tilted between them (screen forward and up),
// two line sensors at the front centre, an outer sensor hanging on each side, side arms with red
// axles ending in black feet, two more feet at the front, and grey axles across the towers with
// yellow bushes, black 24T gears on the outer ends and yellow rubber bands.

// Four-wheeled base: two large motors drive the rear wheels (56908 rims with 41897 tyres);
// the front wheels are small 56145 rims without tyres.
const REAR_Y = 70; // tyre radius
const FRONT_Y = 38; // rim radius
for (const s of [-1, 1]) {
  place('Drive', '95658.dat', WHITE, [s * 60, REAR_Y, -80]);
  place('Drive', '56908.dat', LBGREY, [s * 150, REAR_Y, -80], ry(90));
  place('Drive', '41897.dat', BLACK, [s * 150, REAR_Y, -80], ry(90));
  place('Drive', '56145.dat', WHITE, [s * 95, FRONT_Y, 185], ry(90));
  place('Drive', '3706.dat', LBGREY, [s * 95, FRONT_Y, 185]);
  place('Drive', '32278.dat', BLACK, [s * 115, 175, 60]);
}
place('Drive', '32524.dat', BLACK, [0, 175, 200], ACROSS);

// EV3 brick, lying back about 60 degrees so the screen faces mostly up and a little forward.
place('EV3 brick', '95646c01.dat', WHITE, [0, 270, -20], rx(30));
place('EV3 brick', '32524.dat', RED, [0, 180, 175], ACROSS);
place('EV3 brick', '32524.dat', RED, [0, 365, -45], ACROSS);

// Line sensors at the front centre, lenses down, with red brackets either side.
for (const s of [-1, 1]) {
  place('Line sensors', '95650.dat', WHITE, [s * 26, 80, 235], rx(90));
  place('Line sensors', '32523.dat', RED, [s * 72, 120, 235], UP_X);
  place('Line sensors', '32184.dat', RED, [s * 72, 165, 220], rz(90));
}
place('Line sensors', '40490.dat', BLACK, [0, 165, 245], ACROSS);

// Front feet: red axles straight down with black cross blocks as feet.
for (const s of [-1, 1]) {
  place('Front feet', '3706.dat', RED, [s * 118, 110, 255], rz(90));
  place('Front feet', '32184.dat', BLACK, [s * 118, 45, 255], rz(90));
}

// The towers are the lifting mechanisms; they lean back a little (side view sketch).
const LEAN = 12;
const PIVOT = [0, 240, 130];
const lean = ([x, y, z]) => {
  const c = Math.cos(deg(-LEAN)), sn = Math.sin(deg(-LEAN));
  const [dy, dz] = [y - PIVOT[1], z - PIVOT[2]];
  return [x, PIVOT[1] + dy * c - dz * sn, PIVOT[2] + dy * sn + dz * c];
};
const placeLean = (g, part, colour, p, R = I) => place(g, part, colour, lean(p), rot(rx(-LEAN), R));
// Towers: 13L uprights at the four corners, 7L beams across top and bottom, a medium motor and
// grey gears inside, grey axles across the front with yellow bushes, rubber bands and black gears.
for (const [side, s] of [['left', -1], ['right', 1]]) {
  const g = `Tower (${side})`;
  for (const x of [s * 140, s * 240]) for (const z of [70, 190]) placeLean(g, '41239.dat', BLACK, [x, 360, z], UP_X);
  for (const y of [240, 490]) for (const z of [70, 200]) placeLean(g, '32524.dat', BLACK, [s * 190, y, z], ACROSS);
  placeLean(g, '99455.dat', WHITE, [s * 190, 380, 160], rx(-90));
  placeLean(g, '3648b.dat', LBGREY, [s * 190, 300, 200]);
  placeLean(g, '3648b.dat', LBGREY, [s * 190, 420, 200]);
  for (const [y, z] of [[460, 214], [280, 214], [470, 80]]) {
    placeLean(g, '3708.dat', LBGREY, [s * 205, y, z]);
    placeLean(g, '3648b.dat', BLACK, [s * 310, y, z], ry(90));
    for (const x of [150, 235]) placeLean(g, '32123a.dat', YELLOW, [s * x, y, z + 4], ry(90));
  }
  for (const y of [360, 420]) placeLean(g, '6558.dat', YELLOW, [s * 245, y, 205]);
}

// Side arms: two black 9L beams reaching out from each tower, a red axle down to a black foot,
// and the outer line sensor hanging from a short black upright.
for (const [side, s] of [['left', -1], ['right', 1]]) {
  const g = `Arm (${side})`;
  for (const z of [170, 200]) place(g, '40490.dat', BLACK, [s * 320, 305, z], BEAM_IN_XY(s > 0 ? -12 : 192));
  place(g, '32184.dat', LBGREY, [s * 400, 290, 215], rz(90));
  place(g, '3706.dat', RED, [s * 410, 225, 215], rz(90));
  place(g, '32184.dat', BLACK, [s * 410, 160, 215], rz(90));
  place(g, '32316.dat', BLACK, [s * 300, 220, 200], UP_X);
  place(g, '95650.dat', WHITE, [s * 300, 95, 215], rx(90));
}

// Rear: red cross beams and skids.
place('Rear', '32524.dat', RED, [0, 300, -40], ACROSS);
for (const s of [-1, 1]) place('Rear', '32140.dat', BLACK, [s * 40, 10, -160], rot(rz(180), rx(-90)));

// Rubber bands and cables are not LEGO parts: thin tubes added after the LDraw meshes.
// Points are in the same frame (LDU).
const BANDS = [];
for (const s of [-1, 1]) for (const x of [150, 235]) BANDS.push([lean([s * x, 460, 220]), lean([s * x, 280, 220])]);
const CABLES = [];
for (const s of [-1, 1]) {
  CABLES.push([[s * 300, 115, 215], [s * 340, 420, 170], [s * 230, 560, 120], [s * 40, 375, -10]]); // outer sensors
  CABLES.push([[s * 26, 115, 235], [s * 20, 300, 265], [s * 70, 430, 160], [s * 30, 375, -10]]); // line sensors
  CABLES.push([[s * 190, 500, 160], [s * 90, 570, 90], [s * 25, 380, -15]]); // tower motors
}

// ---------- build meshes per group ----------
const doc = new Document();
const buffer = doc.createBuffer();
const materials = new Map();
// LDraw's "Black" is a dark slate; real LEGO black reads much darker on screen.
const TUNE = new Map([[BLACK, [0.05, 0.05, 0.06]]]);
const matFor = (rgb) => {
  const key = rgb.join(',');
  if (!materials.has(key))
    materials.set(key, doc.createMaterial(key).setBaseColorFactor([...rgb, 1]).setRoughnessFactor(0.4).setMetallicFactor(0));
  return materials.get(key);
};

const root = doc.createNode('NRC EV3 robot');
doc.createScene('scene').addChild(root);
const groups = [...new Set(parts.map((p) => p[0]))];
for (const g of groups) {
  const lg = createLDraw(LIB);
  for (const [, part, colour, [x, y, z], R] of parts.filter((p) => p[0] === g)) {
    const M = m3(m3(F, R), F);
    lg.add(part, colour, [x, -y, -z, ...M]);
  }
  const mesh = doc.createMesh(g);
  for (const m of lg.meshes()) {
    // LDraw (y down, LDU) -> glTF (y up, metres): flip y and z, scale 0.4 mm.
    const pos = new Float32Array(m.pos.length);
    for (let i = 0; i < pos.length; i += 3) (pos[i] = m.pos[i] * 4e-4), (pos[i + 1] = -m.pos[i + 1] * 4e-4), (pos[i + 2] = -m.pos[i + 2] * 4e-4);
    mesh.addPrimitive(doc.createPrimitive().setMaterial(matFor(TUNE.get(m.code) ?? m.rgb)).setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer)));
  }
  root.addChild(doc.createNode(g).setMesh(mesh));
}

// Tubes for rubber bands and cables (LDU, y-up frame -> glTF metres).
const tubeMesh = (name, paths, radius, rgb) => {
  const mesh = doc.createMesh(name);
  for (const pts of paths) {
    const curve = new CatmullRomCurve3(pts.map(([x, y, z]) => new Vector3(x * 4e-4, y * 4e-4, z * 4e-4)));
    const geo = new TubeGeometry(curve, 40, radius * 4e-4, 6, false);
    mesh.addPrimitive(
      doc
        .createPrimitive()
        .setMaterial(matFor(rgb))
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(geo.getAttribute('position').array)).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(geo.getIndex().array)).setBuffer(buffer))
    );
  }
  return mesh;
};
root.addChild(doc.createNode('Rubber bands').setMesh(tubeMesh('bands', BANDS, 3, [0.95, 0.85, 0.1])));
root.addChild(doc.createNode('Cables').setMesh(tubeMesh('cables', CABLES, 6, [0.06, 0.06, 0.07])));

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.35, error: 0.002 }), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, doc);
const tris = doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
console.log(`${OUT}: ${(statSync(OUT).size / 1024).toFixed(0)} KB, ${Math.round(tris / 1000)}k triangles`);
