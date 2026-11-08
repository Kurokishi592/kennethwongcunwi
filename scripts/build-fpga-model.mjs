// Builds public/models/fpga-object-tracker.glb: the EE2026 FPGA object tracker rig from its 3D-print
// STLs (raw-assets/fpga/, copied from the EE2026 repo's project/hardware folder), plus simple stand-ins
// for the Basys 3 board, the two SG90 servos, the OV7670 camera and its jumper wires to the board.
//
//   npm run model:fpga
//
// Units in the STLs are mm, y up. Most parts were exported in assembly position; the pan stage
// (pan base, its servo clamp, tilt base) was exported in its own frame and is moved onto the
// turntable by PAN_STAGE_OFFSET.

import { Document, NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { CatmullRomCurve3, LineCurve3, TubeGeometry, Vector3 } from 'three';
import { loadStep } from './lib/step.mjs';

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
  lens: mat('lens', [0.04, 0.04, 0.05], 0.25, 0.3),
  horn: mat('servo_horn', [0.92, 0.92, 0.9], 0.5),
  gold: mat('pin_gold', [0.85, 0.68, 0.3], 0.3, 0.8),
  glass: mat('lens_glass', [0.08, 0.12, 0.2], 0.05, 0.6)
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

// Cylinder along +y from a base point (servo output boss, spline).
const cylY = (r, h, [cx, cy, cz], n = 20) => {
  const c = lens(r, h, [0, 0, 0], n);
  const pos = new Float32Array(c.pos.length);
  for (let i = 0; i < c.pos.length; i += 3) (pos[i] = c.pos[i] + cx), (pos[i + 1] = -c.pos[i + 2] + cy), (pos[i + 2] = c.pos[i + 1] + cz);
  return { pos, idx: c.idx };
};

// Tube along a path of points (wires, push rod).
const tube = (points, r, segments = 48) => {
  const curve = points.length === 2 ? new LineCurve3(...points.map((v) => new Vector3(...v))) : new CatmullRomCurve3(points.map((v) => new Vector3(...v)));
  const g = new TubeGeometry(curve, segments, r, 6, false);
  return { pos: new Float32Array(g.getAttribute('position').array), idx: new Uint32Array(g.getIndex().array) };
};
// Moves shapes: each vertex v -> f(v).
const mapShapes = (shapes, f) =>
  [].concat(shapes).map(({ pos, idx }) => {
    const out = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) out.set(f([pos[i], pos[i + 1], pos[i + 2]]), i);
    return { pos: out, idx };
  });

// SG90 micro servo (datasheet dimensions): body, mounting tabs, output boss and spline. Built with
// height along y and length along z, output shaft on top towards the +z end, then turned:
//   along: 'x' puts the length along x (output towards +x);  down: true hangs it output-down.
// c is the centre of the body. Returns the tip of the output shaft.
const sg90 = (parent, name, [cx, cy, cz], { along = 'z', down = false } = {}) => {
  const top = 22.7 / 2;
  const local = [box(12.2, 22.7, 22.8), box(12.2, 2.5, 32.2, [0, -top + 15.9, 0]), cylY(5.9, 4, [0, top, 5.5]), cylY(2.4, 3, [0, top + 4, 5.5])];
  const f = ([x, y, z]) => {
    if (down) [x, y] = [-x, -y]; // half turn about the length axis
    if (along === 'x') [x, z] = [z, -x];
    return [x + cx, y + cy, z + cz];
  };
  add(parent, `${name}_body`, mapShapes(local, f), M.servo);
  return f([0, top + 7, 5.5]);
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

// Basys 3: Digilent's STEP model if it is in raw-assets/fpga/ (basys3.step or basys3.stp), otherwise
// a simple stand-in (about 121 x 81 mm) with a few landmark parts.
const board = group('Basys 3 board');
const basysStep = ['basys3.step', 'basys3.stp'].map((f) => path.join(SRC, f)).find(existsSync);
if (basysStep) {
  const pieces = await loadStep(basysStep, { triangles: 40000 });
  // Lay the board flat: its thinnest axis becomes y (up), its longest x. BASYS3_FLIP=1 turns it over.
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (const p of pieces) for (let i = 0; i < p.pos.length; i += 3) for (let k = 0; k < 3; k++) (mn[k] = Math.min(mn[k], p.pos[i + k])), (mx[k] = Math.max(mx[k], p.pos[i + k]));
  const size = mx.map((v, k) => v - mn[k]);
  const order = [0, 1, 2].sort((a, b) => size[b] - size[a]); // longest, middle, thinnest
  const [ax, az, ay] = order;
  const flip = process.env.BASYS3_FLIP === '1' ? -1 : 1;
  // Keep the axis mapping right-handed: swap the sign of z if the permutation is odd.
  const parity = (ax === 0 && ay === 1) || (ax === 1 && ay === 2) || (ax === 2 && ay === 0) ? 1 : -1;
  const centre = mn.map((v, k) => (v + mx[k]) / 2);
  for (const [i, p] of pieces.entries()) {
    if (!p.idx.length) continue;
    const pos = new Float32Array(p.pos.length);
    for (let j = 0; j < p.pos.length; j += 3) {
      const v = [0, 1, 2].map((k) => (p.pos[j + k] - centre[k]) * 1000);
      pos[j] = v[ax] * flip;
      pos[j + 1] = v[ay] * flip + 4.5 + (size[ay] * 1000) / 2;
      pos[j + 2] = v[az] * parity + 0.4;
    }
    // Digilent's STEP has a grey PCB and leaves small parts uncoloured: use the board's real blue
    // for the PCB (the one piece over 100 mm) and black for switches, buttons and headers.
    const isPcb = Math.max(...p.size) > 0.1;
    const rgb = isPcb ? [0.07, 0.2, 0.46] : (p.color ?? [0.08, 0.08, 0.09]);
    add(board, `basys3_${i}`, { pos, idx: p.idx }, mat(`basys3_${rgb.join('_')}`, rgb, 0.5));
  }
} else {
add(board, 'basys3_pcb', box(121, 1.6, 81, [0, 5.3, 0.4]), M.pcb);
add(board, 'basys3_vga', box(31, 12, 13, [8, 12, -33]), M.connector);
add(board, 'basys3_7seg', box(30, 7, 12, [-28, 9.5, 8]), M.black);
add(board, 'basys3_switches', box(104, 4, 7, [0, 8, 34]), M.black);
add(board, 'basys3_pmods', [box(16, 9, 6, [-52, 10.5, -10]), box(16, 9, 6, [-52, 10.5, 12]), box(16, 9, 6, [52, 10.5, -10]), box(16, 9, 6, [52, 10.5, 12])], M.black);
}

const platform = group('Pan-tilt platform');
add(platform, 'pantilt_base_mount', stl('pantilt_base_mount'), M.grey);

// Pan stage: rotates on the turntable and carries the tilt servo and camera plate. The pan servo hangs
// output-down through the 23 x 12.7 mm cutout in the middle of the plate (tabs on the plate's top,
// y 18.3), turning the stage on the turntable. Coordinates below are the assembly frame, so they are
// shifted back by PAN_STAGE_OFFSET inside this group.
const pan = group('Pan stage', PAN_STAGE_OFFSET);
for (const n of ['pantilt_pan_base', 'pantilt_pan_base_servo_clamp']) add(pan, n, stl(n), M.red);
const PLATE_TOP = 18.3;
const local = ([x, y, z]) => [x - PAN_STAGE_OFFSET[0], y - PAN_STAGE_OFFSET[1], z - PAN_STAGE_OFFSET[2]];
sg90(pan, 'pan_servo', local([151.7, PLATE_TOP - 5.55 + 22.7 / 2, -21.65]), { along: 'x', down: true });

const tilt = group('Tilt stage & camera');
// The tilt base was exported with the pan stage, so it gets the same offset.
add(tilt, 'pantilt_tilt_base', { pos: stl('pantilt_tilt_base').pos.map((v, i) => v + PAN_STAGE_OFFSET[i % 3]), idx: null }, M.red);
// pantilt_tilt_arm is left out: in the export it lies across the front of the plate, and the build
// uses the push rod below instead.
add(tilt, 'pantilt_tilt_servo_clamp', stl('pantilt_tilt_servo_clamp'), M.red);
// Tilt servo: upright beside the pan servo, strapped down by the U clamp (x 151.3-160.3), with its
// output end out past the strap. A single-arm horn turns the servo's rotation into a push or pull on
// a rod to a clevis on the back of the camera plate, which tilts the plate about its bottom hinge.
const shaft = sg90(tilt, 'tilt_servo', [161, PLATE_TOP + 22.7 / 2, -0.3], { along: 'x' });
const hornTip = [shaft[0], shaft[1], shaft[2] - 12];
const clevis = [shaft[0], 58, -51];
add(tilt, 'tilt_horn', [cylY(3.5, 2, [shaft[0], shaft[1] - 2, shaft[2]]), box(5, 1.6, 14, [shaft[0], shaft[1], shaft[2] - 6])], M.horn);
add(tilt, 'tilt_push_rod', [tube([[hornTip[0], hornTip[1] + 1, hornTip[2]], [clevis[0], clevis[1], clevis[2] + 1]], 0.9, 4), cylY(1.8, 3, [hornTip[0], hornTip[1] - 1, hornTip[2]])], M.horn);
add(tilt, 'tilt_clevis', box(5, 7, 4.4, [clevis[0], clevis[1], -51]), M.red);
// OV7670 module on the outer face of the tilt plate, lens facing out.
// (35 x 35 mm board, M12 lens holder and lens on the front.) Its 2x9 header runs up one edge and
// pokes through the 5 mm slot in the plate (x 146.8-151.8, y 37.3-77.7).
const HEADER = [149.3, 57.5]; // x, y of the header's centre
add(tilt, 'ov7670_pcb', box(35, 35, 1.6, [164, 60, -62.5]), M.camPcb);
add(tilt, 'ov7670_header', box(5, 23, 2.5, [HEADER[0], HEADER[1], -60]), M.black);
const pins = [];
for (let i = 0; i < 9; i++) for (const dx of [-1.27, 1.27]) pins.push(box(0.64, 0.64, 11.2, [HEADER[0] + dx, HEADER[1] - 10.16 + i * 2.54, -56.1]));
add(tilt, 'ov7670_pins', pins, M.gold);
// 2x9 Dupont housing on the pins behind the plate; the jumpers leave from its back (z -41.2).
add(tilt, 'ov7670_jumper_housing', box(5.4, 23.5, 12, [HEADER[0], HEADER[1], -47.2]), M.black);
add(tilt, 'ov7670_lens_holder', [box(14, 14, 4.5, [164, 60, -65.5]), lens(6.8, 3, [164, 60, -67.7])], M.black);
add(tilt, 'ov7670_lens', lens(5.6, 9, [164, 60, -70.7]), M.lens);
add(tilt, 'ov7670_glass', lens(4.2, 0.4, [164, 60, -79.7]), M.glass);

// Pan and tilt stages turn together about the turntable axis; the camera faces forward (+z), like the board.
const TURNTABLE = [164, 13.3, -24.4];
const panTilt = doc.createNode('Pan-tilt camera').setTranslation(TURNTABLE).setRotation([0, 1, 0, 0]);
const panTiltInner = group('', TURNTABLE.map((v) => -v));
panTilt.addChild(panTiltInner);
panTiltInner.addChild(pan).addChild(tilt);

// The red frame and the board sit on the stand's slanted top edges (30 degrees, running from 58 mm up at
// the back to the front lip), facing forward and up. In the print files they are exported lying flat
// at the bottom, so tilt them about x and lift the frame's bottom centre onto the middle of the slope.
const SLOPE_DEG = 30.3;
const t = (SLOPE_DEG * Math.PI) / 180;
const rot = [Math.sin(t / 2), 0, 0, Math.cos(t / 2)];
const from = [0, -5.8, 0.4]; // frame bottom centre (print files)
const to = [0, 58.1 - Math.tan(t) * 46, -20]; // on the slope, 46 mm in front of its top
const rotated = [from[0], from[1] * Math.cos(t) - from[2] * Math.sin(t), from[1] * Math.sin(t) + from[2] * Math.cos(t)];
for (const g of [frame, board]) g.setRotation(rot).setTranslation(to.map((v, i) => v - rotated[i]));

for (const g of [stand, frame, board, platform, panTilt]) root.addChild(g);

// Jumper wires from the camera's 2x9 header to Pmod JB and JC, the two right-angle headers on the
// board's edge next to the rig (Digilent's STEP has them grey; they are black). From the photo: the
// bundle leaves the back of the camera, drops behind the pan stage onto the base, and goes up into
// the Pmods. World (root) frame, mm.
const mm = (b) => ({ min: b.min.map((v) => v * 1000), max: b.max.map((v) => v * 1000) });
const pmods = board
  .listChildren()
  .map((n) => ({ n, b: mm(getBounds(n)) }))
  .filter(({ b }) => b.max[0] > 50 && Math.max(...b.max.map((v, i) => v - b.min[i])) > 15 && Math.max(...b.max.map((v, i) => v - b.min[i])) < 18)
  .sort((a, b) => b.b.max[1] - a.b.max[1]);
for (const { n } of pmods) n.getMesh().listPrimitives().forEach((pr) => pr.setMaterial(M.black));
const wires = group('Camera wires');
if (pmods.length >= 2) {
  const along = [0, -Math.sin(t), Math.cos(t)]; // pin rows run along the board edge
  const normal = [0, Math.cos(t), Math.sin(t)];
  const at = (c, a, b) => c.map((v, i) => v + along[i] * a + normal[i] * b);
  const ends = []; // 9 sockets on each Pmod (6 on one row, 3 on the other)
  for (const { b } of pmods.slice(0, 2)) {
    const c = [b.max[0] + 12, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]; // back of the plug housing
    for (let k = 0; k < 9; k++) ends.push(at(c, ((k % 6) - 2.5) * 2.54, k < 6 ? 1.27 : -1.27));
    const housing = doc.createNode('pmod_jumper_housing').setRotation(rot).setTranslation([b.max[0] + 6, c[1], c[2]]);
    housing.setMesh(meshOf('pmod_jumper_housing', box(12, 5.4, 15.5), M.black));
    wires.addChild(housing);
  }
  // Camera header pins in the pan-tilt frame, turned like the pan-tilt group (half turn about y at TURNTABLE).
  const turn = ([x, y, z]) => [2 * TURNTABLE[0] - x, y, 2 * TURNTABLE[2] - z];
  const COLOURS = [[0.35, 0.2, 0.1], [0.8, 0.1, 0.1], [0.95, 0.5, 0.1], [0.95, 0.85, 0.15], [0.15, 0.6, 0.25], [0.15, 0.3, 0.8], [0.5, 0.2, 0.7], [0.55, 0.55, 0.55], [0.92, 0.92, 0.92]];
  const wireMats = COLOURS.map((c, i) => mat(`wire_${i}`, c, 0.5));
  for (let j = 0; j < 18; j++) {
    const lane = j - 8.5;
    const start = turn([HEADER[0] + (j < 9 ? 1.27 : -1.27), HEADER[1] - 10.16 + (j % 9) * 2.54, -41.2]);
    const end = ends[j];
    const pts = [
      start,
      [start[0] - 4, start[1] + 4, start[2] - 10],
      [128 + lane * 0.5, 40, -20 + lane * 0.7],
      [100 + lane * 0.5, 12, -16 + lane * 0.9],
      [end[0] + 16, end[1] - 6, end[2] + lane * 0.3],
      end
    ];
    add(wires, `jumper_${j}`, tube(pts, 0.6), wireMats[j % 9]);
  }
}
root.addChild(wires);
doc.createScene('scene').addChild(root);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await MeshoptEncoder.ready;
await doc.transform(weld(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, doc);
console.log(`${OUT}: ${(statSync(OUT).size / 1024).toFixed(0)} KB`);
