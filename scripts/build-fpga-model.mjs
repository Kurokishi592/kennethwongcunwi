// Builds public/models/fpga-object-tracker.glb: the EE2026 FPGA object tracker rig from its 3D-print
// STLs (raw-assets/fpga/, copied from the EE2026 repo's project/hardware folder), plus simple stand-ins
// for the Basys 3 board, the two SG90 servos and the OV7670 camera.
//
//   npm run model:fpga
//
// Units in the STLs are mm, y up. Most parts were exported in assembly position; the pan stage
// (pan base, its servo clamp, tilt base) was exported in its own frame and is moved onto the
// turntable by PAN_STAGE_OFFSET.

import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const OUT = process.env.OUT ?? 'public/models/fpga-object-tracker.glb';
const SRC = 'raw-assets/fpga';
const PAN_STAGE_OFFSET = [146.9, 18.3, -94.4];

const doc = new Document();
const buffer = doc.createBuffer();
const mat = (name, rgb, rough = 0.55, metal = 0.05) =>
  doc.createMaterial(name).setBaseColorFactor([...rgb, 1]).setRoughnessFactor(rough).setMetallicFactor(metal);
const M = {
  grey: mat('print_grey', [0.62, 0.63, 0.65]),
  red: mat('print_red', [0.78, 0.16, 0.14]),
  pcb: mat('basys3_pcb', [0.1, 0.22, 0.42], 0.4),
  black: mat('black', [0.06, 0.06, 0.07], 0.5),
  connector: mat('vga_blue', [0.15, 0.25, 0.65], 0.4, 0.3),
  servo: mat('servo_blue', [0.12, 0.3, 0.85], 0.45),
  camPcb: mat('ov7670_pcb', [0.12, 0.35, 0.85], 0.4),
  lens: mat('lens', [0.04, 0.04, 0.05], 0.25, 0.3)
};

const parseStl = (file) => {
  const buf = readFileSync(file);
  const n = buf.readUInt32LE(80);
  const pos = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) for (let j = 0; j < 9; j++) pos[i * 9 + j] = buf.readFloatLE(84 + i * 50 + 12 + j * 4);
  return { pos, idx: null };
};
const box = (sx, sy, sz, [cx, cy, cz] = [0, 0, 0]) => {
  const [x, y, z] = [sx / 2, sy / 2, sz / 2];
  const c = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
  const f = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7];
  return { pos: new Float32Array(c.flatMap(([a, b, d]) => [a + cx, b + cy, d + cz])), idx: new Uint32Array(f) };
};
// Cylinder along -z (a lens pointing out of the camera's front face), base at the given point.
const lens = (r, h, [cx, cy, cz], n = 20) => {
  const pos = [cx, cy, cz, cx, cy, cz - h];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pos.push(cx + r * Math.cos(a), cy + r * Math.sin(a), cz, cx + r * Math.cos(a), cy + r * Math.sin(a), cz - h);
  }
  const idx = [];
  for (let i = 0; i < n; i++) {
    const a = 2 + i * 2, b = 2 + ((i + 1) % n) * 2;
    idx.push(0, a, b, 1, b + 1, a + 1, a, a + 1, b + 1, a, b + 1, b);
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
};

const meshOf = (name, shapes, material) => {
  const mesh = doc.createMesh(name);
  for (const { pos, idx } of [].concat(shapes)) {
    const prim = doc.createPrimitive().setMaterial(material);
    prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer));
    if (idx) prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(idx).setBuffer(buffer));
    mesh.addPrimitive(prim);
  }
  return mesh;
};
const group = (name, t = [0, 0, 0]) => doc.createNode(name).setTranslation(t);
const add = (parent, name, shapes, material) => parent.addChild(doc.createNode(name).setMesh(meshOf(name, shapes, material)));
const stl = (name) => parseStl(path.join(SRC, `${name}.stl`));

// Root in mm, scaled to metres.
const root = doc.createNode('FPGA object tracker').setScale([0.001, 0.001, 0.001]);

const stand = group('Stand');
for (const n of ['fgpa_combined_mount_back', 'fpga_combined_mount_left', 'fpga_combined_mount_left_cover', 'fpga_combined_mount_right', 'fpga_combined_mount_coin_latch'])
  add(stand, n, stl(n), M.grey);

const frame = group('Basys 3 frame');
for (const n of ['fpga_base_mount', 'fpga_left_clamp', 'fpga_right_clamp']) add(frame, n, stl(n), M.red);

// Basys 3 (about 121 x 81 mm) with a few landmark parts: VGA port, 7-segment display, switch row.
const board = group('Basys 3 board');
add(board, 'basys3_pcb', box(121, 1.6, 81, [0, 5.3, 0.4]), M.pcb);
add(board, 'basys3_vga', box(31, 12, 13, [8, 12, -33]), M.connector);
add(board, 'basys3_7seg', box(30, 7, 12, [-28, 9.5, 8]), M.black);
add(board, 'basys3_switches', box(104, 4, 7, [0, 8, 34]), M.black);
add(board, 'basys3_pmods', [box(16, 9, 6, [-52, 10.5, -10]), box(16, 9, 6, [-52, 10.5, 12]), box(16, 9, 6, [52, 10.5, -10]), box(16, 9, 6, [52, 10.5, 12])], M.black);

const platform = group('Pan-tilt platform');
add(platform, 'pantilt_base_mount', stl('pantilt_base_mount'), M.grey);

// Pan stage: rotates on the turntable and carries the tilt servo and camera plate.
const pan = group('Pan stage', PAN_STAGE_OFFSET);
for (const n of ['pantilt_pan_base', 'pantilt_pan_base_servo_clamp']) add(pan, n, stl(n), M.red);
add(pan, 'pan_servo', box(12.2, 22.7, 23, [17, 11.5, 94]), M.servo);

const tilt = group('Tilt stage & camera');
// The tilt base was exported with the pan stage, so it gets the same offset.
add(tilt, 'pantilt_tilt_base', { pos: stl('pantilt_tilt_base').pos.map((v, i) => v + PAN_STAGE_OFFSET[i % 3]), idx: null }, M.red);
for (const n of ['pantilt_tilt_arm', 'pantilt_tilt_servo_clamp']) add(tilt, n, stl(n), M.red);
add(tilt, 'tilt_servo', box(12.2, 22.7, 23, [151, 33, -53.5]), M.servo);
// OV7670 module on the outer face of the tilt plate, lens facing out.
add(tilt, 'ov7670_pcb', box(35, 35, 1.6, [164, 60, -62.5]), M.camPcb);
add(tilt, 'ov7670_lens_body', box(14, 14, 7, [164, 60, -66.5]), M.black);
add(tilt, 'ov7670_lens', lens(6.5, 11, [164, 60, -70]), M.lens);

// Pan and tilt stages turn together about the turntable axis; face the camera outwards (+x).
const TURNTABLE = [164, 13.3, -24.4];
const panTilt = doc.createNode('Pan-tilt camera').setTranslation(TURNTABLE).setRotation([0, -Math.SQRT1_2, 0, Math.SQRT1_2]);
const panTiltInner = group('', TURNTABLE.map((v) => -v));
panTilt.addChild(panTiltInner);
panTiltInner.addChild(pan).addChild(tilt);

for (const g of [stand, frame, board, platform, panTilt]) root.addChild(g);
doc.createScene('scene').addChild(root);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await MeshoptEncoder.ready;
await doc.transform(weld(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, doc);
console.log(`${OUT}: ${(statSync(OUT).size / 1024).toFixed(0)} KB`);
