// Re-packs a ready-made .glb (e.g. one using Draco compression) into the format the site uses
// (meshopt compression), so the website only needs one decoder.
//
//   npm run model:import -- raw-assets/auv5/bb5-web-full.glb public/models/auv5.glb

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import { statSync } from 'node:fs';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: npm run model:import -- <input.glb> <output.glb>');
  process.exit(1);
}
await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder
});
const doc = await io.read(input);
// Drop the Draco extension so the file is written uncompressed, then apply meshopt.
for (const ext of doc.getRoot().listExtensionsUsed()) if (ext.extensionName === 'KHR_draco_mesh_compression') ext.dispose();
// Normals are rebuilt by the website (keeps the file small).
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) prim.setAttribute('NORMAL', null);
await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(output, doc);
console.log(`${output}: ${(statSync(input).size / 1024).toFixed(0)} KB -> ${(statSync(output).size / 1024).toFixed(0)} KB`);
