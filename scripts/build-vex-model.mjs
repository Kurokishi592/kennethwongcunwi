// Builds public/models/vex-tower-takeover.glb: the 2020 VEX Tower Takeover robot (national champions),
// assembled from VEX's official STEP parts (C-channels, omni wheels, V5 motors/brain/battery, gears,
// tank tread). Part positions are estimated from photos, so the layout is approximate.
//
//   npm run model:vex
//
// STEP files go in raw-assets/vex/ (from github.com/TlorschCode/VEX-V5-Parts-Solidworks-Download,
// which mirrors VEX's CAD downloads). LADDER_DEG sets the ladder angle: ~40 carrying cubes,
// ~85 tipped up to score.

import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadStep } from './lib/step.mjs';

const OUT = process.env.OUT ?? 'public/models/vex-tower-takeover.glb';
const SRC = 'raw-assets/vex';
const LADDER_DEG = Number(process.env.LADDER_DEG ?? 40);

// glTF frame: x forward (intake side), y up, z to the robot's left. Units: metres.
const doc = new Document();
const buffer = doc.createBuffer();

// ---------- materials ----------
const materials = new Map();
const mat = (rgb, { rough = 0.5, metal = 0.1, alpha = 1 } = {}) => {
  const key = `${rgb.map((c) => c.toFixed(2))}|${rough}|${metal}|${alpha}`;
  if (!materials.has(key)) {
    const m = doc.createMaterial(key).setBaseColorFactor([...rgb, alpha]).setRoughnessFactor(rough).setMetallicFactor(metal);
    if (alpha < 1) m.setAlphaMode('BLEND').setDoubleSided(true);
    materials.set(key, m);
  }
  return materials.get(key);
};
const C = {
  alu: [0.8, 0.82, 0.85],
  steel: [0.6, 0.66, 0.74],
  green: [0.09, 0.33, 0.2],
  rollerGreen: [0.13, 0.26, 0.18],
  hub: [0.12, 0.12, 0.13],
  tread: [0.36, 0.37, 0.39],
  black: [0.04, 0.04, 0.05],
  nylon: [0.93, 0.91, 0.85],
  band: [0.72, 0.55, 0.32],
  cover: [0.85, 0.9, 0.95],
  cubeGreen: [0.18, 0.66, 0.3],
  cubeOrange: [0.95, 0.42, 0.1],
  cubePurple: [0.45, 0.22, 0.68]
};

// ---------- parts from STEP ----------
// Each part becomes one glTF mesh (one primitive per colour), shared by every copy of the part.
const meshCache = new Map();
async function part(name, { triangles, error, color, colorOf, clip, alpha = 1 } = {}) {
  const key = `${name}|${clip ?? ''}|${color ?? ''}|${triangles}`;
  if (meshCache.has(key)) return meshCache.get(key);
  let pieces = await loadStep(path.join(SRC, `${name}.step`), { triangles, error });
  // Shorten a channel by keeping only triangles within +-clip/2 along its length (x).
  if (clip) {
    pieces = pieces.map((p) => {
      const keep = [];
      for (let i = 0; i < p.idx.length; i += 3) {
        const xs = [0, 1, 2].map((k) => p.pos[p.idx[i + k] * 3]);
        if (xs.every((x) => Math.abs(x) <= clip / 2 + 1e-4)) keep.push(p.idx[i], p.idx[i + 1], p.idx[i + 2]);
      }
      return { ...p, idx: new Uint32Array(keep) };
    });
  }
  const mn = new Vector3(Infinity, Infinity, Infinity);
  const mx = new Vector3(-Infinity, -Infinity, -Infinity);
  const v = new Vector3();
  const mesh = doc.createMesh(name);
  for (const p of pieces) {
    if (!p.idx.length) continue;
    for (const i of p.idx) v.set(p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]), mn.min(v), mx.max(v);
    const rgb = colorOf?.(p) ?? color ?? p.color ?? [0.6, 0.6, 0.62];
    const metal = rgb === C.alu || rgb === C.steel;
    const prim = doc
      .createPrimitive()
      .setMaterial(mat(rgb, metal ? { rough: 0.35, metal: 0.55 } : { rough: 0.55, alpha }))
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(p.pos)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(p.idx)).setBuffer(buffer));
    mesh.addPrimitive(prim);
  }
  const result = { mesh, center: mn.clone().add(mx).multiplyScalar(0.5).toArray(), size: mx.clone().sub(mn).toArray() };
  meshCache.set(key, result);
  return result;
}

// ---------- placement helpers ----------
const q = (rx = 0, ry = 0, rz = 0) => new Quaternion().setFromEuler(new Euler(rx, ry, rz, 'XYZ')).toArray();
const group = (parent, name, t = [0, 0, 0], r = [0, 0, 0, 1]) => {
  const n = doc.createNode(name).setTranslation(t).setRotation(r);
  parent.addChild(n);
  return n;
};
// Place a part so its bounding-box centre lands on `t`, rotated by `r` about that centre.
const place = (parent, p, t, r = [0, 0, 0, 1]) => {
  const outer = group(parent, '', t, r);
  outer.addChild(doc.createNode('').setTranslation(p.center.map((c) => -c)).setMesh(p.mesh));
  return outer;
};

// ---------- simple shapes (zip ties, rollers, bands, game cubes) ----------
const primitive = (pos, idx, rgb, opts) =>
  doc
    .createPrimitive()
    .setMaterial(mat(rgb, opts))
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buffer));
const shapeMesh = (name, [pos, idx], rgb, opts) => doc.createMesh(name).addPrimitive(primitive(pos, idx, rgb, opts));
const boxData = (sx, sy, sz) => {
  const [x, y, z] = [sx / 2, sy / 2, sz / 2];
  const c = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
  return [c.flat(), [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7]];
};
const cylData = (r, h, n = 16) => {
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
  return [pos, idx];
};
const put = (parent, mesh, t, r) => parent.addChild(doc.createNode('').setTranslation(t).setRotation(r ?? [0, 0, 0, 1]).setMesh(mesh));

// Tower Takeover cube: 5.5 in, with a raised X on every face.
const cubeMesh = (rgb) => {
  const S = 0.14;
  const m = shapeMesh('cube', boxData(S * 0.97, S * 0.97, S * 0.97), rgb, { rough: 0.45 });
  const [bp, bi] = boxData(S * 1.18, 0.012, 0.004);
  const pos = [];
  const idx = [];
  const faces = [[0, 0, 0], [0, Math.PI / 2, 0], [0, Math.PI, 0], [0, -Math.PI / 2, 0], [Math.PI / 2, 0, 0], [-Math.PI / 2, 0, 0]];
  for (const f of faces) {
    for (const d of [Math.PI / 4, -Math.PI / 4]) {
      const mtx = new Matrix4()
        .makeRotationFromEuler(new Euler(...f))
        .multiply(new Matrix4().makeTranslation(0, 0, S * 0.485))
        .multiply(new Matrix4().makeRotationZ(d));
      const base = pos.length / 3;
      for (let i = 0; i < bp.length; i += 3) pos.push(...new Vector3(bp[i], bp[i + 1], bp[i + 2]).applyMatrix4(mtx).toArray());
      idx.push(...bi.map((k) => k + base));
    }
  }
  m.addPrimitive(primitive(pos, idx, rgb.map((c) => c * 0.62), { rough: 0.5 }));
  return m;
};

// ---------- parts ----------
const CH = (len) => part('cchannel_35', { triangles: 5000, color: C.alu, clip: len });
const STEEL = (len) => part('cchannel_35', { triangles: 5000, color: C.steel, clip: len });
const OMNI = await part('omni4', {
  triangles: 6000,
  // The omni wheel STEP has no colours: small pieces are the rollers, the rest is the hub.
  colorOf: (p) => (Math.max(...p.size) < 0.03 ? C.rollerGreen : C.hub)
});
const MOTOR = await part('motor', { triangles: 2000, error: 0.15 });
const BRAIN = await part('brain', { triangles: 4000 });
const COVER = await part('brain_cover', { triangles: 1500, color: C.cover, alpha: 0.3 });
const BATTERY = await part('battery', { triangles: 3000, error: 0.06 });
const SPROCKET = await part('tread_wheel', { triangles: 3000, color: C.green });
const LINK = await part('tread_link', { triangles: 150, error: 0.05, color: C.tread });
const TRACTION = await part('tread_traction', { triangles: 180, error: 0.05, color: C.tread });
const GEAR84 = await part('gear84', { triangles: 6000, color: C.green });
const GEAR12 = await part('gear12', { triangles: 600, color: C.black });
const STANDOFF = await part('standoff2', { triangles: 200 });

// ---------- robot ----------
const root = doc.createNode('VEX Tower Takeover robot');
doc.createScene('scene').addChild(root);

// STEP frames: C-channel runs along x with flanges towards -z; omni axle and motor shaft are y;
// sprockets and gears turn about z; the brain lies in x-y.
const ALONG_X = q();
const ALONG_X_FLIP = q(Math.PI, 0, 0); // flanges towards +z
const ALONG_Z = q(0, Math.PI / 2, 0);
const UPRIGHT = q(0, 0, Math.PI / 2);
const AXLE_Z = q(Math.PI / 2, 0, 0);

// Drivetrain: outer and inner rails, omni wheels between them, drive motors inside.
const drive = group(root, 'Drivetrain');
for (const z of [0.2, -0.2]) place(drive, await CH(0.445), [0, 0.045, z], z > 0 ? ALONG_X : ALONG_X_FLIP);
for (const z of [0.115, -0.115]) place(drive, await CH(0.445), [0, 0.045, z], z > 0 ? ALONG_X_FLIP : ALONG_X);
for (const x of [0.215, -0.215]) place(drive, await CH(0.42), [x, 0.03, 0], ALONG_Z);
for (const x of [0.155, -0.155]) for (const z of [0.1575, -0.1575]) place(drive, OMNI, [x, 0.0508, z], AXLE_Z);
for (const x of [0.105, -0.105]) for (const z of [0.08, -0.08]) place(drive, MOTOR, [x, 0.05, z], AXLE_Z);
// Steel rails sticking out of the back along the floor.
for (const z of [0.12, -0.12]) place(drive, await STEEL(0.3), [-0.37, 0.013, z], q(Math.PI / 2, 0, 0));

// Lift: two arms on the 84T gear shafts mid-robot, driven by 12T pinions on two motors. Each arm
// ends in a roller that pushes the ladder up from underneath; it leans back when the ladder is
// down and swings forward and up as the ladder tips upright.
const HINGE = [0.12, 0.105];
const PIVOT = [0.0, 0.125];
const ARM = 0.24;
const theta = (LADDER_DEG * Math.PI) / 180;
const dir = [-Math.cos(theta), Math.sin(theta)]; // along the ladder, back and up from the hinge
const w = [HINGE[0] - PIVOT[0], HINGE[1] - PIVOT[1]];
const wd = w[0] * dir[0] + w[1] * dir[1];
const along = -wd + Math.sqrt(wd * wd - (w[0] ** 2 + w[1] ** 2) + ARM * ARM); // where the arm meets the ladder
const tip = [HINGE[0] + along * dir[0], HINGE[1] + along * dir[1]];
const armAngle = Math.atan2(tip[1] - PIVOT[1], tip[0] - PIVOT[0]);
const lift = group(root, 'Lift gear train');
for (const z of [0.085, -0.085]) {
  const s = Math.sign(z);
  place(lift, await CH(0.1), [PIVOT[0], 0.085, z + s * 0.02], UPRIGHT);
  place(lift, GEAR84, [PIVOT[0], PIVOT[1], z], q(0, 0, armAngle));
  place(lift, GEAR12, [PIVOT[0] - 0.0525, PIVOT[1], z + s * 0.002]);
  place(lift, MOTOR, [PIVOT[0] - 0.0525, PIVOT[1], z + s * 0.03], AXLE_Z);
  const arm = group(lift, '', [PIVOT[0], PIVOT[1], z - s * 0.014], q(0, 0, armAngle));
  place(arm, await CH(ARM), [ARM / 2, 0, 0], s > 0 ? ALONG_X_FLIP : ALONG_X);
}
const tipRoller = shapeMesh('lift_roller', cylData(0.011, 0.15), C.nylon, { rough: 0.6 });
put(lift, tipRoller, [tip[0], tip[1] - 0.012, 0]);

// Ladder: two telescoping sections hinged at the front, zip-tie rungs, rollers and bands at the joint.
const ladder = group(root, 'Ladder', [0.12, 0.105, 0], q(0, 0, Math.PI - (LADDER_DEG * Math.PI) / 180));
const L1 = 0.445;
for (const z of [0.06, -0.06]) place(ladder, await CH(L1), [L1 / 2, 0, z], z > 0 ? ALONG_X_FLIP : ALONG_X);
for (const z of [0.046, -0.046]) place(ladder, await CH(L1), [0.38 + L1 / 2, 0.004, z], z > 0 ? ALONG_X_FLIP : ALONG_X);
const rung = shapeMesh('zip_tie', boxData(0.006, 0.004, 0.135), C.black, { rough: 0.6 });
for (let x = 0.04; x < 0.8; x += 0.034) put(ladder, rung, [x, -0.016, 0]);
const roller = shapeMesh('nylon_roller', cylData(0.009, 0.028), C.nylon, { rough: 0.6 });
const band = shapeMesh('band', boxData(0.16, 0.003, 0.008), C.band, { rough: 0.8 });
for (const x of [0.4, 0.62]) {
  for (const dx of [-0.018, 0.018]) for (const z of [0.083, -0.083]) put(ladder, roller, [x + dx, 0, z]);
  for (const a of [0.55, -0.55]) put(ladder, band, [x, -0.02, 0], q(0, a, 0));
}
place(ladder, await CH(0.13), [0.81, 0, 0], ALONG_Z);
const cubes = group(ladder, 'Game cubes');
[C.cubeGreen, C.cubeOrange, C.cubePurple].forEach((rgb, i) =>
  put(cubes, cubeMesh(rgb), [0.17 + i * 0.143, -0.073, 0])
);

// Intakes: a tank-tread loop at each front corner, motor standing on the rear sprocket.
const R = 0.0254; // sprocket pitch radius
const LOOP = 0.17;
for (const [side, z] of [['left', 0.098], ['right', -0.098]]) {
  // Parallel to the ladder: the loop runs forward and down from beside the hinge to the floor.
  const intake = group(root, `Intake (${side})`, [0.13, 0.15, z], q(0, 0, -theta));
  for (const x of [0, LOOP]) place(intake, SPROCKET, [x, 0, 0], q(Math.PI / 2, 0, 0));
  // Links around the loop (in the horizontal x-z plane), every third one with traction bumps.
  const per = 2 * LOOP + 2 * Math.PI * R;
  const n = Math.round(per / 0.0135);
  for (let i = 0; i < n; i++) {
    const s = (i / n) * per;
    let pos, tan;
    if (s < LOOP) (pos = [s, 0, R]), (tan = [1, 0, 0]);
    else if (s < LOOP + Math.PI * R) {
      const a = (s - LOOP) / R;
      (pos = [LOOP + R * Math.sin(a), 0, R * Math.cos(a)]), (tan = [Math.cos(a), 0, -Math.sin(a)]);
    } else if (s < 2 * LOOP + Math.PI * R) (pos = [2 * LOOP + Math.PI * R - s, 0, -R]), (tan = [-1, 0, 0]);
    else {
      const a = (s - 2 * LOOP - Math.PI * R) / R;
      (pos = [-R * Math.sin(a), 0, -R * Math.cos(a)]), (tan = [-Math.cos(a), 0, Math.sin(a)]);
    }
    const t = new Vector3(...tan);
    const up = new Vector3(0, 1, 0);
    const out = new Vector3().crossVectors(up, t); // link thickness points out of the loop
    const rot = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(t, out, up)).toArray();
    place(intake, i % 3 === 0 ? TRACTION : LINK, pos, rot);
  }
  place(intake, await CH(0.22), [LOOP / 2, -0.03, 0], q(Math.PI / 2, 0, 0));
  place(intake, MOTOR, [0, 0.055, 0]);
}

// V5 brain lying flat under its clear cover, battery beside it; standoffs hold the cover.
const brainGroup = group(root, 'V5 brain & battery', [-0.11, 0.08, 0.04]);
place(brainGroup, BRAIN, [0, 0, 0], q(-Math.PI / 2, 0, 0));
place(brainGroup, COVER, [0, 0.022, 0]);
place(brainGroup, BATTERY, [0, -0.01, -0.13]);
for (const [x, z] of [[0.06, 0.045], [-0.06, 0.045], [0.06, -0.045], [-0.06, -0.045]]) place(brainGroup, STANDOFF, [x, -0.015, z]);

// ---------- write ----------
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await MeshoptEncoder.ready;
await doc.transform(weld(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, doc);
let tris = 0;
root.traverse((n) => n.getMesh()?.listPrimitives().forEach((p) => (tris += p.getIndices().getCount() / 3)));
console.log(`${OUT}: ${(statSync(OUT).size / 1024).toFixed(0)} KB, ${Math.round(tris / 1000)}k triangles drawn`);
