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
//   beams run along z, holes along x;  pins along x;  wheels' axle along z;
//   EV3 large motor: hub axle along x, body forward (+z) and up;  medium motor: output along -z;
//   EV3 brick: lying flat, screen up.
const lib = createLDraw(LIB);
const parts = []; // [name, colour, [x,y,z], R] so each group can be exported as its own node
const place = (group, part, colour, [x, y, z], R = I) => parts.push([group, part, colour, [x, y, z], R]);

// Beam along an arbitrary direction in the x-y plane (degrees from +x), holes along z.
const BEAM_IN_XY = (angle) => rot(rz(angle), ry(90));
// Beam standing up (along y), holes along x / along z.
const UP_X = rx(90);
const UP_Z = rot(ry(90), rx(90));
// Beam lying across the robot (along x), holes along z.
const ACROSS = ry(90);

// ---------- drive: two large motors, rear wheels ----------
const AXLE_Y = 54; // wheel radius
for (const s of [-1, 1]) {
  place('Drive', '95658.dat', WHITE, [s * 80, AXLE_Y, 0]);
  place('Drive', '56145c01.dat', WHITE, [s * 168, AXLE_Y, 0], ry(90));
}
// Rear skids that the robot rests on.
for (const s of [-1, 1]) place('Drive', '32140.dat', BLACK, [s * 40, 10, -40], rot(rz(180), rx(-90)));

// ---------- chassis ----------
for (const s of [-1, 1]) {
  place('Chassis', '32278.dat', BLACK, [s * 140, 180, 130]); // side rails
  place('Chassis', '32524.dat', BLACK, [s * 140, 120, 250], UP_X);
}
place('Chassis', '32525.dat', BLACK, [0, 180, 290], ACROSS); // front cross beam
place('Chassis', '32525.dat', BLACK, [0, 100, 300], ACROSS); // sensor bar
for (const x of [-100, -60, 60, 100]) place('Chassis', '6558.dat', YELLOW, [x, 180, 300], ry(90));

// ---------- line-following colour sensors under the front ----------
// Lenses face down at the line (the sensor's lens faces +z by default).
for (const x of [-60, -20, 20, 60]) place('Colour sensors', '95650.dat', WHITE, [x, 80, 290], rx(90));

// ---------- EV3 brick, upright, screen facing forward ----------
place('EV3 brick', '95646c01.dat', WHITE, [0, 345, 140], rx(90));

// ---------- towers either side of the brick ----------
for (const s of [-1, 1]) {
  for (const z of [40, 240]) place('Towers', '32278.dat', BLACK, [s * 150, 340, z], UP_X);
  place('Towers', '41239.dat', BLACK, [s * 150, 330, 140], rot(rx(90), rx(-36))); // diagonal brace
  place('Towers', '40490.dat', BLACK, [s * 150, 480, 140]); // top rail
  place('Towers', '40490.dat', BLACK, [s * 150, 240, 140]); // middle rail
  for (const [y, z] of [[480, 60], [480, 220], [240, 60], [240, 220], [400, 40], [400, 240], [320, 40], [320, 240]])
    place('Towers', '6558.dat', YELLOW, [s * 160, y, z]);
  // Red cross bracing at the back of each tower.
  place('Towers', '32316.dat', RED, [s * 110, 300, 0], ACROSS);
}
// Rear red beams across the back.
place('Towers', '32524.dat', RED, [0, 260, -10], ACROSS);
place('Towers', '32524.dat', RED, [0, 300, -10], ACROSS);

// ---------- side arms: medium motor on each tower drives an arm that reaches out and down ----------
for (const [side, s] of [['left', -1], ['right', 1]]) {
  const group = `Arm (${side})`;
  place(group, '99455.dat', WHITE, [s * 190, 300, 140], ry(s * 90));
  place(group, '40490.dat', BLACK, [s * 255, 255, 250], BEAM_IN_XY(s > 0 ? -30 : 210));
  place(group, '32316.dat', RED, [s * 320, 175, 250], BEAM_IN_XY(s > 0 ? -95 : 275));
  place(group, '95650.dat', WHITE, [s * 320, 135, 265], rx(90));
  place(group, '6558.dat', RED, [s * 330, 215, 250], ry(90));
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

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.35, error: 0.002 }), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, doc);
const tris = doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
console.log(`${OUT}: ${(statSync(OUT).size / 1024).toFixed(0)} KB, ${Math.round(tris / 1000)}k triangles`);
