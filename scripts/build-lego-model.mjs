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
const BLACK = 0, RED = 4, TAN = 19, LBGREY = 71, DBGREY = 72, WHITE = 15;

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
//   pins and axles along x;  wheels' axle, gears and bushes along z;
//   medium motor: output faces +z, body back along -z;  EV3 / NXT sensors: lens or front face +z
//   (the gyro's red marking is on top);  EV3 brick: lying flat, screen up, at -z.
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
const LENS_DOWN = rx(90);
const OUT_RIGHT = ry(90); // medium motor output facing +x
const OUT_LEFT = ry(-90);

// ---------- layout, from the run video (lego robo.MP4) and notes drawn on one of its frames ----------
// WRO "Precision Farming" robot, compact: two medium motors back to back on the rear axle drive thin
// bicycle wheels; the EV3 brick lies flat (screen forward) next to the left wheel, on top of the left
// drive motor. To its right, a forward-facing medium motor with the gyro sensor on top drives the
// grab-and-lift fork through a pair of bevel gears, and beside it another medium motor swings a
// HiTechnic light sensor out past the right wheel on an arm (folded down, as in the video).

// Drive: medium motors along the axle, outputs out to 2903 bicycle rims with 2902 tyres.
const AXLE = [102, -60]; // y (tyre radius), z
for (const [s, R] of [[-1, OUT_LEFT], [1, OUT_RIGHT]]) {
  place('Drive', '99455.dat', WHITE, [s * 181, ...AXLE], R);
  place('Drive', '3705.dat', BLACK, [s * 215, ...AXLE]);
  place('Drive', '2903.dat', WHITE, [s * 211, ...AXLE], ry(90));
  place('Drive', '2902.dat', BLACK, [s * 211, ...AXLE], ry(90));
}

// Chassis: 11x7 open frames outside the wheels, 7x5 frames ahead of them, 15L beams across the back
// and front with 5L beams out to the side frames, 15L rails along under the brick and the two
// upper motors, a 15L beam across the top front, and two skids at the front.
for (const s of [-1, 1]) {
  place('Chassis', '39794.dat', BLACK, [s * 245, 90, -40], SIDE);
  place('Chassis', '64179.dat', BLACK, [s * 245, 90, 140], SIDE);
  for (const [y, z] of [[40, -165], [120, -165], [60, 165], [140, 165]]) place('Chassis', '32316.dat', BLACK, [s * 200, y, z], ACROSS);
  place('Chassis', '32140.dat', BLACK, [s * 100, 10, 140], rot(rz(180), rx(-90)));
}
for (const [y, z] of [[40, -165], [120, -165], [60, 165], [140, 165], [240, 150]]) place('Chassis', '32278.dat', BLACK, [0, y, z], ACROSS);
for (const x of [-160, -40, 30, 100]) place('Chassis', '32278.dat', BLACK, [x, 141, -20]);

// EV3 brick on the rails above the left drive motor, screen towards the front.
place('EV3 brick', '95646c01.dat', WHITE, [-100, 259, -20], ry(180));

// Lift-and-grab: forward-facing medium motor (gyro sensor on top, red marking up), a 12T double
// bevel on its output meshing with one on the cross axle, and the two halves of the red fork on
// that axle, each a 9L arm, two red 5L beams, a red T-beam, tan pins and an 8L axle as a prong.
const LIFT = [30, 200]; // motor x, output axis height
const PIVOT_Z = 190;
place('Lift and grab', '99455.dat', WHITE, [LIFT[0], LIFT[1], 155]);
place('Gyro sensor', '99380.dat', WHITE, [LIFT[0], 238, 40]);
place('Lift and grab', '32270.dat', DBGREY, [LIFT[0], LIFT[1], 173]);
place('Lift and grab', '32270.dat', DBGREY, [LIFT[0] - 17, LIFT[1], PIVOT_Z], ry(90));
place('Lift and grab', '3707.dat', BLACK, [0, LIFT[1], PIVOT_Z]);
for (const s of [-1, 1]) {
  place('Lift and grab', '3713.dat', LBGREY, [s * 88, LIFT[1], PIVOT_Z], ry(90));
  place('Lift and grab', '40490.dat', RED, [s * 70, 120, PIVOT_Z], UP_X);
  for (const y of [170, 50]) {
    place('Lift and grab', '32316.dat', RED, [s * 50, y, 210], ACROSS);
    place('Lift and grab', '32556.dat', TAN, [s * 70, y, 220], ALONG_Z);
  }
  place('Lift and grab', '60484.dat', RED, [s * 50, 160, 230], rx(90));
  place('Lift and grab', '3707.dat', BLACK, [s * 30, 50, 290], ALONG_Z);
}

// Light sensor arm: medium motor facing forward, a 13L beam on its output reaching out past the
// right wheel, a 5L hanger, and the HiTechnic light sensor (NXT housing) looking down at the mat.
const ARM = [100, 200, 175]; // motor x, output height, arm z
place('Light sensor arm', '99455.dat', WHITE, [ARM[0], ARM[1], 160]);
place('Light sensor arm', '3705.dat', BLACK, [ARM[0], ARM[1], ARM[2]], ALONG_Z);
place('Light sensor arm', '41239.dat', BLACK, [ARM[0] + 120, ARM[1], ARM[2]], ACROSS);
place('Light sensor arm', '32316.dat', BLACK, [ARM[0] + 240, ARM[1] - 40, ARM[2]], UP_Z);
place('Light sensor arm', '55969.dat', LBGREY, [ARM[0] + 240, 95, 165], LENS_DOWN);

// Cables are not LEGO parts: thin tubes added after the LDraw meshes. Points are in the same frame
// (LDU). In the video they loop high over the brick before going down to each port.
const PORTS_FRONT = (i) => [-160 + i * 40, 270, 112]; // motor ports A-D, at the screen end
const PORTS_BACK = (i) => [-160 + i * 40, 270, -152]; // sensor ports 1-4
const CABLES = [
  [PORTS_FRONT(0), [-120, 340, 140], [-20, 300, 60], [LIFT[0], 240, -30]], // lift motor
  [PORTS_FRONT(1), [-60, 360, 80], [80, 320, -40], [ARM[0], 240, -30]], // arm motor
  [PORTS_FRONT(2), [-2, 300, 40], [0, 250, -110], [-5, 140, -75]], // left drive (port at the axle centre)
  [PORTS_FRONT(3), [10, 330, 30], [5, 245, -120], [5, 140, -75]], // right drive
  [PORTS_BACK(0), [-140, 320, -170], [60, 345, 20], [260, 300, 200], [ARM[0] + 240, 150, 185]], // light sensor
  [PORTS_BACK(1), [-100, 315, -175], [0, 320, -60], [LIFT[0], 290, 5]] // gyro
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
