// Shrinks a CAD export (.glb from SolidWorks) so it can be shown on the website.
//
//   npm run model -- raw-assets/MyAssembly.glb public/models/my-assembly.glb
//
// What it does:
//   1. Drops parts smaller than --min-size (mm). Resistors/capacitors are invisible at web size.
//   2. Merges each top-level part of the assembly into one object (needed for the explode effect).
//   3. Simplifies the meshes and compresses the file (EXT_meshopt_compression).
//
// Options (all optional):
//   --min-size 2.5   smallest part to keep, in mm
//   --ratio 0.08     fraction of triangles to keep after simplifying
//   --error 0.002    how far the simplified shape may drift, relative to the part size
//   --keep rotor_    nodes whose name starts with this stay separate objects inside their part
//                    (e.g. propellers the website spins), instead of being merged into it

import { NodeIO, PropertyType, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, dedup, join, meshopt, prune, simplify, transformPrimitive, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { Matrix4 } from 'three';
import { statSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const [input, output] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!input || !output) {
  console.error('Usage: npm run model -- <input.glb> <output.glb> [--min-size 2.5] [--ratio 0.08] [--error 0.002]');
  process.exit(1);
}
const minSize = flag('min-size', 2.5) / 1000;
const ratio = flag('ratio', 0.08);
const error = flag('error', 0.002);
const keep = args.includes('--keep') ? args[args.indexOf('--keep') + 1] : null;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder
});
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

const doc = await io.read(input);
const root = doc.getRoot();
const scene = root.getDefaultScene() ?? root.listScenes()[0];

// The assembly is the scene child that has children (SolidWorks also exports a camera node).
const assembly = scene.listChildren().find((n) => n.listChildren().length > 0);
if (!assembly) throw new Error('Could not find the assembly node in the scene.');

const countTris = () =>
  root.listMeshes().reduce(
    (sum, m) => sum + m.listPrimitives().reduce((s, p) => s + (p.getIndices()?.getCount() ?? 0) / 3, 0),
    0
  );
console.log(`input: ${(statSync(input).size / 1e6).toFixed(1)} MB, ${Math.round(countTris()).toLocaleString()} triangles`);

const out = doc.createNode(assembly.getName() || 'model');
let kept = 0;
let dropped = 0;

for (const part of assembly.listChildren()) {
  const b = getBounds(part);
  const center = b.min.map((v, i) => (v + b.max[i]) / 2);
  const node = doc.createNode(part.getName()).setTranslation(center);
  const mesh = doc.createMesh(part.getName());
  const toLocal = new Matrix4().makeTranslation(-center[0], -center[1], -center[2]);

  // Altium CoDesigner boards also export every copper/mask layer as a sheet. Copper sits at the same
  // height as the solder mask (flickers), and some layers come out rotated 90 degrees. Keep only
  // solder-mask layers that line up with the board itself.
  const board = part.listChildren().find((c) => /_BOARD-\d+$/.test(c.getName()));
  const bb = board ? getBounds(board) : null;
  const alignedWithBoard = (b) =>
    bb && b.min.every((v, i) => v >= bb.min[i] - 0.002) && b.max.every((v, i) => v <= bb.max[i] + 0.002);

  // Copies src's primitives into mesh with `matrix` baked in. Repeated parts share vertex data, and
  // each copy gets a different transform, so the data is copied too.
  const bake = (src, mesh, matrix) => {
    for (const prim of src.listPrimitives()) {
      const copy = prim.clone();
      for (const semantic of copy.listSemantics()) copy.setAttribute(semantic, copy.getAttribute(semantic).clone());
      if (copy.getIndices()) copy.setIndices(copy.getIndices().clone());
      transformPrimitive(copy, matrix);
      mesh.addPrimitive(copy);
    }
  };
  part.traverse((child) => {
    const src = child.getMesh();
    if (!src) return;
    if (keep && child.getName().startsWith(keep)) {
      const kb = getBounds(child);
      const kc = kb.min.map((v, i) => (v + kb.max[i]) / 2);
      const kmesh = doc.createMesh(child.getName());
      bake(src, kmesh, new Matrix4().makeTranslation(-kc[0], -kc[1], -kc[2]).multiply(new Matrix4().fromArray(child.getWorldMatrix())).toArray());
      node.addChild(doc.createNode(child.getName()).setTranslation(kc.map((v, i) => v - center[i])).setMesh(kmesh));
      kept++;
      return;
    }
    const cb = getBounds(child);
    if (child.getName().startsWith('Layer_') && !(/SolderMask/.test(child.getName()) && alignedWithBoard(cb))) {
      dropped++;
      return;
    }
    if (Math.max(...cb.max.map((v, i) => v - cb.min[i])) < minSize) {
      dropped++;
      return;
    }
    kept++;
    bake(src, mesh, toLocal.clone().multiply(new Matrix4().fromArray(child.getWorldMatrix())).toArray());
  });

  if (mesh.listPrimitives().length) node.setMesh(mesh);
  if (mesh.listPrimitives().length || node.listChildren().length) out.addChild(node);
}

// Replace the original hierarchy with the merged one.
for (const n of scene.listChildren()) scene.removeChild(n);
scene.addChild(out);

// SolidWorks writes one material per part. Round the colours so identical-looking ones merge.
for (const m of root.listMaterials()) {
  m.setBaseColorFactor(m.getBaseColorFactor().map((v) => Math.round(v * 20) / 20));
  m.setMetallicFactor(0.15).setRoughnessFactor(0.55).setName('');
}

// CAD exports store a separate vertex per face (for sharp edges), which stops the simplifier from
// collapsing anything. Drop the normals so vertices can be welded; the website recomputes shading.
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) prim.setAttribute('NORMAL', null);
}

await doc.transform(
  prune(),
  // Materials only: merging identical meshes (e.g. 8 copies of one board) breaks the compression step.
  dedup({ propertyTypes: [PropertyType.MATERIAL] }),
  join({ keepNamed: true }),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio, error }),
  // Simplifying leaves unused vertices behind; they would make the model's bounding box wrong.
  (d) => d.getRoot().listMeshes().forEach((m) => m.listPrimitives().forEach((p) => compactPrimitive(p))),
  prune(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' })
);

await io.write(output, doc);
console.log(`kept ${kept} parts, dropped ${dropped} below ${minSize * 1000} mm`);
console.log(`output: ${(statSync(output).size / 1e6).toFixed(1)} MB, ${Math.round(countTris()).toLocaleString()} triangles, ${root.listMaterials().length} materials`);
