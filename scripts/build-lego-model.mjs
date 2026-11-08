// Builds public/models/lego-ev3-robot.glb: the EV3 robot from the WRO "Precision Farming" run video,
// rebuilt with real LEGO part geometry from the LDraw library. Part sizes are exact; the layout is
// read off the video frames, so hidden internals (gearing under the fork, cable routing) are guesses.
//
//   npm run model:lego
//
// Needs the LDraw library unzipped in raw-assets/lego/ldraw
// (https://library.ldraw.org/library/updates/complete.zip, CC BY 4.0).
//
// Positions below are in LDraw units (1 LDU = 0.4 mm; a stud / beam hole = 20 LDU) in a y-up frame:
// x to the robot's right, y up, z forward (see place()). Wheels are at the back, the fork at the front.

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
const BLACK = 0, RED = 4, TAN = 19, LBGREY = 71, WHITE = 15;

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
//   beams run along z, holes along x;  open frames lie flat (5/7 wide along x, 7/11 long along z);
//   pins and axles along x;  wheels' axle and bushes along z;
//   EV3 large motor: hub axle along x, body forward (+z) and up;  medium motor: output faces +z,
//   body back along -z;  EV3 sensors: lens / front face +z;  EV3 brick: lying flat, screen up, at -z.
const parts = []; // [name, colour, [x,y,z], R] so each group can be exported as its own node
// Layout is written with +x to the robot's right. Facing +z in a right-handed y-up frame, right is
// -x, so positions are mirrored in x and rotations conjugated (M R M) to keep each part un-mirrored.
const M = [-1, 0, 0, 0, 1, 0, 0, 0, 1];
const place = (group, part, colour, [x, y, z], R = I) => parts.push([group, part, colour, [-x, y, z], m3(m3(M, R), M)]);

const ACROSS = ry(90); // beam along x, holes along z
const UP_X = rx(90); // beam standing up, holes along x
const UP_Z = rot(ry(90), rx(90)); // beam standing up, holes along z
const ALONG_Z = ry(90); // pin / axle along z
const SIDE = rz(90); // open frame as a side wall (y-z plane)
const WALL = rot(rx(90), ry(90)); // open frame as a front wall (x-y plane), long side along x
const LID = ry(90); // open frame lying flat, long side along x
const LENS_UP = rx(-90);
const LENS_DOWN = rx(90);

// ---------- layout, from the run video (lego robo.MP4) ----------
// WRO "Precision Farming" robot: a low black box with the drive wheels inside it at the back, the EV3
// brick lying flat on the left (screen forward), a gyro sensor and a colour sensor standing next to
// it, a black motor housing at the front right that swings a colour sensor out on an arm, and a red
// fork at the front with two black prongs that tips up to carry the seedlings.

// Drive: two large motors lying flat, hubs at the rear axle; 56908 rims with 41897 tyres sit inside
// the side frames.
const WHEEL = [125, 70, -110]; // x, y (tyre radius), z
for (const s of [-1, 1]) {
  place('Drive', '95658.dat', WHITE, [s * 50, WHEEL[1], WHEEL[2]]);
  place('Drive', '3706.dat', BLACK, [s * 105, WHEEL[1], WHEEL[2]]);
  place('Drive', '56908.dat', LBGREY, [s * WHEEL[0], WHEEL[1], WHEEL[2]], ry(90));
  place('Drive', '41897.dat', BLACK, [s * WHEEL[0], WHEEL[1], WHEEL[2]], ry(90));
}

// Chassis: 11x7 open frames along the back half of each side (the wheels show through them), 7x5
// frames along the front half, 15L beams across the front and back, and 15L rails under the brick.
for (const s of [-1, 1]) {
  place('Chassis', '39794.dat', BLACK, [s * 175, 90, -100], SIDE);
  place('Chassis', '64179.dat', BLACK, [s * 175, 90, 80], SIDE);
  place('Chassis', '32278.dat', BLACK, [s * 150, 190, -60]);
  place('Chassis', '32316.dat', BLACK, [s * 160, 150, 140], UP_Z);
  place('Chassis', '32140.dat', BLACK, [s * 100, 10, 140], rot(rz(180), rx(-90)));
}
for (const y of [60, 140]) place('Chassis', '32278.dat', BLACK, [0, y, 160], ACROSS);
for (const y of [40, 120, 180]) place('Chassis', '32278.dat', BLACK, [0, y, -220], ACROSS);
place('Chassis', '32278.dat', BLACK, [0, 190, 140], ACROSS);

// EV3 brick lying flat on the rails, screen towards the front.
place('EV3 brick', '95646c01.dat', WHITE, [-75, 308, -70], ry(180));

// Gyro sensor and colour sensor standing up beside the brick.
place('Sensors', '99380.dat', WHITE, [45, 229, 0], LENS_UP);
place('Sensors', '95650.dat', WHITE, [110, 229, -60], LENS_UP);

// Front right: a medium motor inside a black housing (front wall, side wall and lid are 7x5 frames).
// Its output comes through the front wall and swings the sensor arm out to the right.
place('Sensor arm', '99455.dat', WHITE, [130, 250, 150]);
place('Sensor arm', '64179.dat', BLACK, [90, 250, 170], WALL);
place('Sensor arm', '64179.dat', BLACK, [170, 250, 100], SIDE);
place('Sensor arm', '64179.dat', BLACK, [90, 300, 115], LID);
place('Sensor arm', '3705.dat', BLACK, [130, 250, 190], ALONG_Z);
place('Sensor arm', '3713.dat', LBGREY, [130, 250, 222]);
place('Sensor arm', '40490.dat', BLACK, [210, 250, 200], ACROSS);
place('Sensor arm', '32524.dat', BLACK, [290, 190, 200], UP_Z);
place('Sensor arm', '95650.dat', WHITE, [290, 90, 192], LENS_DOWN);

// Front fork: a second medium motor across the front turns an axle; two red 7L arms hang from it
// with two red 9L beams across, a red T-beam in the middle, tan pins, and two 8L axles as prongs.
place('Fork', '99455.dat', WHITE, [5, 230, 120], ry(90));
const PIVOT = [0, 170, 190];
place('Fork', '3707.dat', BLACK, PIVOT);
for (const s of [-1, 1]) {
  place('Fork', '3713.dat', LBGREY, [s * 88, PIVOT[1], PIVOT[2]], ry(90));
  place('Fork', '32524.dat', RED, [s * 70, 110, PIVOT[2]], UP_X);
  place('Fork', '3707.dat', BLACK, [s * 30, 50, 290], ALONG_Z);
  for (const y of [150, 50]) place('Fork', '32556.dat', TAN, [s * 50, y, 220], ALONG_Z);
}
for (const y of [150, 50]) place('Fork', '40490.dat', RED, [0, y, 210], ACROSS);
place('Fork', '60484.dat', RED, [0, 140, 230], rx(90));

// Cables are not LEGO parts: thin tubes added after the LDraw meshes. Points are in the same frame
// (LDU). In the video they loop high over the brick before going down to each port.
const PORTS_FRONT = (i) => [-140 + i * 40, 315, 60]; // motor ports A-D, at the screen end
const PORTS_BACK = (i) => [-140 + i * 40, 315, -200]; // sensor ports 1-4
const CABLES = [
  [PORTS_FRONT(0), [-150, 380, 90], [-120, 300, 140], [-60, 240, 130]], // fork motor
  [PORTS_FRONT(1), [-60, 420, 60], [80, 380, 40], [130, 280, -40]], // arm motor
  [PORTS_FRONT(2), [-40, 360, -40], [-160, 300, -120], [-160, 170, -150], [-50, 150, -140]], // left drive
  [PORTS_FRONT(3), [10, 340, -20], [60, 300, -140], [50, 150, -140]], // right drive
  [PORTS_BACK(0), [-120, 400, -120], [40, 420, 40], [200, 340, 160], [290, 300, 230], [290, 150, 215]], // arm sensor
  [PORTS_BACK(1), [-60, 380, -150], [40, 340, -40], [45, 305, 0]], // gyro
  [PORTS_BACK(2), [0, 360, -160], [100, 360, -100], [110, 305, -60]] // colour sensor
];

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

const root = doc.createNode('WRO EV3 robot');
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

// Tubes for the cables (LDU, layout frame -> glTF metres, mirrored in x like place()).
const tubeMesh = (name, paths, radius, rgb) => {
  const mesh = doc.createMesh(name);
  for (const pts of paths) {
    const curve = new CatmullRomCurve3(pts.map(([x, y, z]) => new Vector3(-x * 4e-4, y * 4e-4, z * 4e-4)));
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
root.addChild(doc.createNode('Cables').setMesh(tubeMesh('cables', CABLES, 6, [0.06, 0.06, 0.07])));

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.35, error: 0.002 }), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, doc);
const tris = doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
console.log(`${OUT}: ${(statSync(OUT).size / 1024).toFixed(0)} KB, ${Math.round(tris / 1000)}k triangles`);
