// Re-assembles the Mini-AUV export (raw-assets/mini-auv/miniauv.glb). In that export the
// sub-assemblies lost their mates and landed in different places:
//   - the end caps are consistent with each other and are used as the reference (hull axis);
//   - the acrylic tube and everything inside it are shifted as one block -> moved onto the caps;
//   - the frame (side plates, bottom plate, DVL, thrusters) is rotated and ~6 m away -> rotated onto
//     the hull axis and centred on it;
//   - scattered pieces (exploded motherboard PCB components, loose camera parts) are left out.
// It also regroups the parts for the website's parts list. Output: raw-assets/mini-auv/miniauv-fixed.glb
//
//   node scripts/fix-miniauv.mjs && npm run model -- raw-assets/mini-auv/miniauv-fixed.glb public/models/mini-auv.glb

import { NodeIO, getBounds } from '@gltf-transform/core';
import { Matrix4, Vector3 } from 'three';

const IN = 'raw-assets/mini-auv/miniauv.glb';
const OUT = 'raw-assets/mini-auv/miniauv-fixed.glb';
// Frame height relative to the hull axis (the plates' centre sits a little below the tube's).
const FRAME_DROP = 0.03;

const io = new NodeIO();
const doc = await io.read(IN);
const nodes = doc.getRoot().listNodes();
const byName = (name) => nodes.filter((n) => n.getName() === name);
const one = (name) => {
  const n = byName(name)[0];
  if (!n) throw new Error(`Node not found: ${name}`);
  return n;
};
const centre = (n) => {
  const b = getBounds(n);
  return new Vector3(...b.min.map((v, i) => (v + b.max[i]) / 2));
};
const world = (n) => new Matrix4().fromArray(n.getWorldMatrix());
const parentOf = (n) => n.listParents().find((p) => p.propertyType === 'Node') ?? null;
// Apply a world-space transform T to node n (keeps its parent).
const applyWorld = (n, T) => {
  const p = parentOf(n);
  const local = (p ? world(p).invert() : new Matrix4()).multiply(T).multiply(world(n));
  n.setMatrix(local.toArray());
};
// Move node n under newParent without changing where it is in the world.
const reparent = (n, newParent) => {
  const W = world(n);
  parentOf(n)?.removeChild(n);
  newParent.addChild(n);
  n.setMatrix(world(newParent).invert().multiply(W).toArray());
};

// ---------- reference: hull axis from the two end-cap flanges ----------
const [fa, fb] = byName('Flange').map(centre);
const axis = fb.clone().sub(fa).normalize();
const hullMid = fa.clone().add(fb).multiplyScalar(0.5);

// ---------- tube and internals: one block, moved so the tube centres between the caps ----------
const tube = one('Master_AcrylicTube');
const shift = new Matrix4().makeTranslation(hullMid.clone().sub(centre(tube)));
for (const n of [tube, one('Mini AUV Thruster Board final.step-1'), one('SPlit Internal Master Assem')]) applyWorld(n, shift);

// ---------- frame: rotate its long axis onto the hull axis, centre it on the hull ----------
const left = one('Master_LeftPlate');
const right = one('Master_RightPlate');
const frameMid = centre(left).add(centre(right)).multiplyScalar(0.5);
const across = centre(right).sub(centre(left));
across.y = 0;
const frameLong = new Vector3(across.z, 0, -across.x).normalize(); // perpendicular to the plates' spacing
let angle = Math.atan2(axis.x, axis.z) - Math.atan2(frameLong.x, frameLong.z);
if (Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) > Math.PI / 2) angle += Math.PI; // smaller turn
const frameT = new Matrix4()
  .makeTranslation(hullMid.x, hullMid.y - FRAME_DROP, hullMid.z)
  .multiply(new Matrix4().makeRotationY(angle))
  .multiply(new Matrix4().makeTranslation(-frameMid.x, -frameMid.y, -frameMid.z));
const frame = one('Master_Frame');
applyWorld(frame, frameT);
// The thruster-end penetrators (wetlinks, ethernet bulkhead) ended up ~6 m away, while their back
// plate stayed on the cap. Move them as one block (keeping their layout) onto the plate: turn the
// block so the wetlinks point out of the hull, centre it on the plate, and push the nuts against
// the plate's inner face.
const strayFaceplates = nodes.filter((n) => n.getName().endsWith('^ThrusterFaceplate') && centre(n).distanceTo(hullMid) > 1);
const thrusterPlate = one('Master_ThrusterHullCap-1/ThrusterFaceplate-3/ThrusterFaceplate-2');
const plateMid = centre(thrusterPlate);
const outward = plateMid.clone().sub(hullMid);
outward.y = 0;
outward.normalize();
const wetlinks = strayFaceplates.filter((n) => n.getName().startsWith('wetlink'));
const partOf = (g, key) => centre(g.listChildren().find((n) => n.getName().includes(key)));
const nutsMid = () => wetlinks.reduce((s, g) => s.add(partOf(g, 'NUT')), new Vector3()).divideScalar(wetlinks.length);
if (wetlinks.length) {
  // Penetrator body minus its nut points outward (the nut is on the inside of the plate).
  const was = wetlinks.reduce((s, g) => s.add(partOf(g, 'WLP').sub(partOf(g, 'NUT'))), new Vector3());
  was.y = 0;
  const turn = Math.atan2(outward.x, outward.z) - Math.atan2(was.x, was.z);
  const box = strayFaceplates.map((n) => getBounds(n));
  const lo = [0, 1, 2].map((i) => Math.min(...box.map((b) => b.min[i])));
  const hi = [0, 1, 2].map((i) => Math.max(...box.map((b) => b.max[i])));
  const blockMid = new Vector3(...lo.map((v, i) => (v + hi[i]) / 2));
  const T = new Matrix4()
    .makeTranslation(plateMid.x, plateMid.y, plateMid.z)
    .multiply(new Matrix4().makeRotationY(turn))
    .multiply(new Matrix4().makeTranslation(-blockMid.x, -blockMid.y, -blockMid.z));
  for (const n of strayFaceplates) applyWorld(n, T);
  const b = getBounds(thrusterPlate);
  const plateThick = Math.min(...b.max.map((v, i) => v - b.min[i]));
  const slide = plateMid.clone().sub(nutsMid()).dot(outward) - plateThick / 2 - 0.006;
  const S = new Matrix4().makeTranslation(outward.clone().multiplyScalar(slide));
  for (const n of strayFaceplates) applyWorld(n, S);
}

// ---------- leave out anything still far from the vehicle ----------
let dropped = 0;
for (const n of doc.getRoot().listNodes()) {
  if (!n.getMesh()) continue;
  if (centre(n).distanceTo(hullMid) > 0.45) {
    n.setMesh(null);
    dropped++;
  }
}

// The PCB mount bracket ends up below the bottom plate with no clear home; leave it out too.
for (const n of byName('pcb mount-1')) n.traverse((x) => x.setMesh(null));

// ---------- regroup for the parts list ----------
const root = doc.getRoot().listScenes()[0].listChildren().find((n) => n.listChildren().length);
const group = (name) => {
  const g = doc.createNode(name);
  root.addChild(g);
  return g;
};
const thrusters = group('Thrusters');
const frameGroup = group('Frame');
const hull = group('Hull & end caps');
const electronics = group('Electronics trays');
for (const n of doc.getRoot().listNodes().filter((n) => /^Thruster$|^Thruster-\d+$/.test(n.getName()))) reparent(n, thrusters);
for (const n of [left, right, one('Master_BottomPlate')]) reparent(n, frameGroup);
for (const n of [tube, one('Master_SensorHullCap'), one('Master_ThrusterHullCap')]) reparent(n, hull);
for (const n of [one('SPlit Internal Master Assem'), one('Mini AUV Thruster Board final.step-1')]) reparent(n, electronics);
for (const n of [...root.listChildren()]) if (![thrusters, frameGroup, hull, electronics].includes(n)) root.removeChild(n);

// ---------- appearance: SOLIDWORKS exported the frame plates white; they are anodised black ----------
const black = doc.createMaterial('anodised_black').setBaseColorFactor([0.05, 0.05, 0.06, 1]).setRoughnessFactor(0.35).setMetallicFactor(0.3);
const acrylic = doc.createMaterial('acrylic').setBaseColorFactor([0.85, 0.9, 0.95, 0.2]).setAlphaMode('BLEND').setDoubleSided(true).setRoughnessFactor(0.05);
const recolour = (n, m) => n.traverse((x) => x.getMesh()?.listPrimitives().forEach((p) => p.setMaterial(m)));
recolour(frameGroup, black);
recolour(tube, acrylic);
// End-cap plates also came out white; in the render they are black (other colours, e.g. the red camera, stay).
for (const cap of [one('Master_SensorHullCap'), one('Master_ThrusterHullCap')])
  cap.traverse((x) =>
    x.getMesh()?.listPrimitives().forEach((p) => {
      const c = p.getMaterial()?.getBaseColorFactor() ?? [1, 1, 1, 1];
      if ((c[0] + c[1] + c[2]) / 3 > 0.75) p.setMaterial(black);
    })
  );

await io.write(OUT, doc);
console.log(`${OUT}: frame turned ${((angle * 180) / Math.PI).toFixed(1)} deg, ${strayFaceplates.length} faceplate parts moved, ${dropped} stray meshes left out`);
