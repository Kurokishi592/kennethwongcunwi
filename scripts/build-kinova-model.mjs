// Builds public/models/kinova-dual-arm.glb: two Kinova Gen3 7-DoF arms (with vision module) and
// Robotiq 2F-85 grippers on a centre mount with a LUCID Helios2 + Triton camera on a 90-degree mount.
//
//   npm run model:kinova
//
// Arm and gripper meshes come from Kinova's ros_kortex repository (BSD-3-Clause) and are downloaded
// into raw-assets/kinova/ on first run. The pose is set by JOINT_DEG below (Kinova zero = arm straight).
// The camera mount comes from the rig's own SOLIDWORKS assembly: its STL exports go in
// raw-assets/kinova/lucid/ (plate.stl, mount.stl, camera.stl).

import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = process.env.OUT ?? 'public/models/kinova-dual-arm.glb';
const CACHE = 'raw-assets/kinova';
const REPO = 'https://raw.githubusercontent.com/Kinovarobotics/ros_kortex/noetic-devel/kortex_description';

// Left arm pose in degrees, joints 1-7: out sideways, down, then forward. The right arm is a mirror image.
const JOINT_DEG = process.env.JOINTS ? process.env.JOINTS.split(',').map(Number) : [-90, 90, 60, 90, 0, -50, 90];
const GRIPPER_DEG = 20; // 0 = open, ~45 = closed

const ARM_LINKS = [
  'base_link', 'shoulder_link', 'half_arm_1_link', 'half_arm_2_link', 'forearm_link',
  'spherical_wrist_1_link', 'spherical_wrist_2_link', 'bracelet_with_vision_link'
];
const GRIPPER_FILES = [
  'meshes/collision/robotiq_arg2f_base_link.stl',
  'meshes/visual/robotiq_arg2f_85_outer_knuckle.dae',
  'meshes/visual/robotiq_arg2f_85_outer_finger.dae',
  'meshes/visual/robotiq_arg2f_85_inner_knuckle.dae',
  'meshes/visual/robotiq_arg2f_85_inner_finger.dae'
];

// ---------- download ----------
mkdirSync(CACHE, { recursive: true });
const fetchOnce = async (url, file) => {
  const dest = path.join(CACHE, file);
  if (!existsSync(dest)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  }
  return dest;
};
const urdfPath = await fetchOnce(`${REPO}/arms/gen3/7dof/urdf/GEN3-7DOF-VISION_ARM_URDF_V12.urdf`, 'gen3.urdf');
for (const l of ARM_LINKS) await fetchOnce(`${REPO}/arms/gen3/7dof/meshes/${l}.STL`, `${l}.STL`);
for (const f of GRIPPER_FILES) await fetchOnce(`${REPO}/grippers/robotiq_2f_85/${f}`, path.basename(f));

// ---------- mesh parsing ----------
const parseStl = (file) => {
  const buf = readFileSync(file);
  const n = buf.readUInt32LE(80);
  const pos = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) for (let j = 0; j < 9; j++) pos[i * 9 + j] = buf.readFloatLE(84 + i * 50 + 12 + j * 4);
  return { pos, idx: null };
};

// Minimal COLLADA reader for these files: triangles only, no node transforms.
const parseDae = (file, scale) => {
  const xml = readFileSync(file, 'utf8');
  const out = [];
  for (const g of xml.matchAll(/<mesh>([\s\S]*?)<\/mesh>/g)) {
    const mesh = g[1];
    const posId = mesh.match(/<vertices[^>]*>[\s\S]*?semantic="POSITION"[^>]*source="#([^"]+)"|<vertices[^>]*>[\s\S]*?source="#([^"]+)"[^>]*semantic="POSITION"/);
    const srcId = posId[1] ?? posId[2];
    const src = mesh.match(new RegExp(`<source[^>]*id="${srcId}"[\\s\\S]*?<float_array[^>]*>([^<]*)<`));
    const verts = src[1].trim().split(/\s+/).map((v) => Number(v) * scale);
    for (const t of mesh.matchAll(/<triangles[^>]*>([\s\S]*?)<\/triangles>/g)) {
      const inputs = [...t[1].matchAll(/<input[^>]*>/g)].map((m) => ({
        sem: m[0].match(/semantic="(\w+)"/)[1],
        off: Number(m[0].match(/offset="(\d+)"/)[1])
      }));
      const stride = Math.max(...inputs.map((i) => i.off)) + 1;
      const vOff = inputs.find((i) => i.sem === 'VERTEX').off;
      const p = t[1].match(/<p>([^<]*)<\/p>/)[1].trim().split(/\s+/).map(Number);
      const idx = [];
      for (let i = vOff; i < p.length; i += stride) idx.push(p[i]);
      out.push({ pos: new Float32Array(verts), idx: new Uint32Array(idx) });
    }
  }
  return out;
};

// ---------- geometry helpers ----------
const box = (sx, sy, sz) => {
  const [x, y, z] = [sx / 2, sy / 2, sz / 2];
  const c = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
  const f = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7];
  return { pos: new Float32Array(c.flat()), idx: new Uint32Array(f) };
};

// ---------- document ----------
const doc = new Document();
const buffer = doc.createBuffer();
const mat = (name, rgb, rough = 0.5, metal = 0.1) =>
  doc.createMaterial(name).setBaseColorFactor([...rgb, 1]).setRoughnessFactor(rough).setMetallicFactor(metal);
const M = {
  arm: mat('arm', [0.9, 0.9, 0.88], 0.45),
  ring: mat('ring', [0.55, 0.57, 0.6], 0.5),
  gripper: mat('gripper', [0.07, 0.07, 0.08], 0.6),
  alu: mat('aluminium', [0.72, 0.74, 0.76], 0.35, 0.6),
  camera: mat('camera', [0.05, 0.05, 0.06], 0.5),
  bracket: mat('bracket', [0.16, 0.16, 0.18], 0.45, 0.4)
};

const meshCache = new Map();
const makeMesh = (key, parts, material) => {
  if (meshCache.has(key)) return meshCache.get(key);
  const mesh = doc.createMesh(key);
  for (const { pos, idx } of [].concat(parts)) {
    const prim = doc.createPrimitive().setMaterial(material);
    prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer));
    if (idx) prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(idx).setBuffer(buffer));
    mesh.addPrimitive(prim);
  }
  meshCache.set(key, mesh);
  return mesh;
};

const rpyQuat = (r, p, y) => new Quaternion().setFromEuler(new Euler(r, p, y, 'ZYX')).toArray();
const axisQuat = (axis, deg) => new Quaternion().setFromAxisAngle(new Vector3(...axis), (deg * Math.PI) / 180).toArray();

// Adds an URDF joint: origin node -> rotated node -> returns the child link frame.
const joint = (parent, name, xyz, rpy, axis = [0, 0, 1], deg = 0) => {
  const origin = doc.createNode(`${name}_origin`).setTranslation(xyz).setRotation(rpyQuat(...rpy));
  const frame = doc.createNode(name).setRotation(axisQuat(axis, deg));
  parent.addChild(origin);
  origin.addChild(frame);
  return frame;
};
const attach = (frame, name, mesh) => frame.addChild(doc.createNode(name).setMesh(mesh));

// ---------- arm (from URDF) ----------
const urdf = readFileSync(urdfPath, 'utf8');
const urdfJoints = [...urdf.matchAll(/<joint name="(joint_\d)"[\s\S]*?<origin xyz="([^"]+)" rpy="([^"]+)"/g)].map((m) => ({
  name: m[1],
  xyz: m[2].trim().split(/\s+/).map(Number),
  rpy: m[3].trim().split(/\s+/).map(Number)
}));

const buildArm = (root, prefix) => {
  let frame = root;
  attach(frame, `${prefix}base_link`, makeMesh('base_link', parseStl(`${CACHE}/base_link.STL`), M.arm));
  urdfJoints.forEach((j, i) => {
    frame = joint(frame, `${prefix}${j.name}`, j.xyz, j.rpy, [0, 0, 1], JOINT_DEG[i]);
    const link = ARM_LINKS[i + 1];
    attach(frame, `${prefix}${link}`, makeMesh(link, parseStl(`${CACHE}/${link}.STL`), M.arm));
  });
  // bracelet -> end_effector_link -> gripper base
  const ee = joint(frame, `${prefix}end_effector`, [0, 0, -0.061525], [Math.PI, 0, 0]);
  const g = joint(ee, `${prefix}gripper_base`, [0, 0, 0], [0, 0, 1.57]);
  attach(g, `${prefix}gripper_body`, makeMesh('gripper_base', parseStl(`${CACHE}/robotiq_arg2f_base_link.stl`), M.gripper));

  const dae = (n) => parseDae(`${CACHE}/robotiq_arg2f_85_${n}.dae`, 0.001);
  for (const [side, reflect] of [['left', 1], ['right', -1]]) {
    const knuckle = side === 'left'
      ? joint(g, `${prefix}${side}_outer_knuckle_joint`, [0, -0.0306011, 0.054904], [0, 0, Math.PI], [1, 0, 0], GRIPPER_DEG)
      : joint(g, `${prefix}${side}_outer_knuckle_joint`, [0, 0.0306011, 0.054904], [0, 0, 0], [1, 0, 0], GRIPPER_DEG);
    attach(knuckle, `${prefix}${side}_outer_knuckle`, makeMesh('outer_knuckle', dae('outer_knuckle'), M.gripper));
    const outer = joint(knuckle, `${prefix}${side}_outer_finger_joint`, [0, 0.0315, -0.0041], [0, 0, 0]);
    attach(outer, `${prefix}${side}_outer_finger`, makeMesh('outer_finger', dae('outer_finger'), M.gripper));
    const inner = joint(outer, `${prefix}${side}_inner_finger_joint`, [0, 0.0061, 0.0471], [0, 0, 0], [1, 0, 0], -GRIPPER_DEG);
    attach(inner, `${prefix}${side}_inner_finger`, makeMesh('inner_finger', dae('inner_finger'), M.gripper));
    const ik = joint(g, `${prefix}${side}_inner_knuckle_joint`, [0, reflect * -0.0127, 0.06142], [0, 0, ((1 + reflect) * Math.PI) / 2], [1, 0, 0], GRIPPER_DEG);
    attach(ik, `${prefix}${side}_inner_knuckle`, makeMesh('inner_knuckle', dae('inner_knuckle'), M.gripper));
  }
};

// ---------- rig (ROS frame: x forward, y left, z up) ----------
// Centre block sized to the shoulder base plate (150 x 110 mm) that sits on top of it.
const MOUNT = { x: 0.15, y: 0.11, z: 0.12 };
const rig = doc.createNode('rig');

const mount = doc.createNode('Centre block').setMesh(makeMesh('mount', box(MOUNT.x, MOUNT.y, MOUNT.z), M.alu));
rig.addChild(mount);

// Shoulder base plate, 90-degree mount and LUCID Helios2 + Triton mock-up, exported from the
// SOLIDWORKS assembly (raw-assets/kinova/lucid/, mm, x forward / y up / z sideways).
// Offset puts the plate's bottom centre on top of the block; rotation turns y-up into z-up.
const lucid = doc.createNode('LUCID Helios2 + Triton mount')
  .setTranslation([0, 0, MOUNT.z / 2])
  .setRotation(rpyQuat(Math.PI / 2, 0, 0))
  .setScale([0.001, 0.001, 0.001]);
const lucidParts = doc.createNode('lucid_parts').setTranslation([-75.75, -13.604, -55.55]);
lucid.addChild(lucidParts);
for (const [name, material] of [['plate', M.alu], ['mount', M.bracket], ['camera', M.camera]]) {
  lucidParts.addChild(doc.createNode(`lucid_${name}`).setMesh(makeMesh(`lucid_${name}`, parseStl(`${CACHE}/lucid/${name}.stl`), material)));
}
rig.addChild(lucid);

// Left arm on the +y face, base pointing +y. Right arm is its mirror image.
const left = doc.createNode('Left arm').setTranslation([0, MOUNT.y / 2, 0]).setRotation(rpyQuat(-Math.PI / 2, 0, 0));
buildArm(left, 'L_');
rig.addChild(left);
const right = doc.createNode('Right arm').setScale([1, -1, 1]);
const rightBase = doc.createNode('right_arm_base').setTranslation([0, MOUNT.y / 2, 0]).setRotation(rpyQuat(-Math.PI / 2, 0, 0));
buildArm(rightBase, 'R_');
right.addChild(rightBase);
rig.addChild(right);

// glTF is y-up: rotate the z-up robot frame.
const root = doc.createNode('KinovaDualArm').setRotation(rpyQuat(-Math.PI / 2, 0, 0));
root.addChild(rig);
doc.createScene('scene').addChild(root);

// ---------- optimise ----------
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
await doc.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.35, error: 0.004 }),
  (d) => d.getRoot().listMeshes().forEach((m) => m.listPrimitives().forEach((p) => compactPrimitive(p))),
  prune(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' })
);
mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, doc);
const tris = doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
console.log(`${OUT}: ${(statSync(OUT).size / 1e6).toFixed(2)} MB, ${Math.round(tris).toLocaleString()} triangles (per unique mesh)`);
