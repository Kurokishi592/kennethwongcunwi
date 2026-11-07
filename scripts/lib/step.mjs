// Turns a STEP (.step/.stp) CAD file into small triangle meshes, using OpenCascade (occt-import-js).
// Results are cached next to the STEP file (<name>.<budget>-<error>.cache.json) because tessellating
// large parts takes a while.
//
//   const parts = await loadStep('raw-assets/vex/motor.step', { triangles: 3000 });
//   // -> [{ pos: Float32Array (metres), idx: Uint32Array, color: [r,g,b] | null, size: [x,y,z] }]

import occtimportjs from 'occt-import-js';
import { MeshoptSimplifier } from 'meshoptimizer';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

let occt;

// Merge vertices that share a position (STEP output repeats them per face), so the
// simplifier can collapse edges.
function weld(pos, idx) {
  const map = new Map();
  const out = [];
  const remap = new Uint32Array(pos.length / 3);
  for (let i = 0; i < pos.length / 3; i++) {
    const key = `${pos[i * 3].toFixed(4)},${pos[i * 3 + 1].toFixed(4)},${pos[i * 3 + 2].toFixed(4)}`;
    let j = map.get(key);
    if (j === undefined) {
      j = out.length / 3;
      map.set(key, j);
      out.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    }
    remap[i] = j;
  }
  return { pos: new Float32Array(out), idx: idx.map((i) => remap[i]) };
}

// Vertex clustering: snap vertices to a grid, merge those in the same cell, drop collapsed
// triangles. The grid grows until the triangle count is within budget.
function cluster(pos, idx, target) {
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) (mn[k] = Math.min(mn[k], pos[i + k])), (mx[k] = Math.max(mx[k], pos[i + k]));
  const extent = Math.max(...mx.map((v, k) => v - mn[k]));
  let out = idx;
  for (let cells = 200; cells >= 8; cells = Math.floor(cells * 0.8)) {
    const size = extent / cells;
    const rep = new Map();
    const map = new Uint32Array(pos.length / 3);
    for (let i = 0; i < pos.length / 3; i++) {
      const key = [0, 1, 2].map((k) => Math.floor((pos[i * 3 + k] - mn[k]) / size)).join(',');
      if (!rep.has(key)) rep.set(key, i);
      map[i] = rep.get(key);
    }
    const tris = [];
    const seen = new Set();
    for (let i = 0; i < idx.length; i += 3) {
      const [a, b, c] = [map[idx[i]], map[idx[i + 1]], map[idx[i + 2]]];
      if (a === b || b === c || a === c) continue;
      const key = [a, b, c].sort((x, y) => x - y).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      tris.push(a, b, c);
    }
    out = new Uint32Array(tris);
    if (out.length <= target * 1.5) break;
  }
  return out;
}

/**
 * @param {string} file STEP file
 * @param {{ triangles?: number, deflection?: number, error?: number }} opts
 *   triangles: rough triangle budget for the whole part; deflection: tessellation fineness (ratio of size);
 *   error: how far simplification may move the surface (ratio of size; raise it for hidden detail)
 */
export async function loadStep(file, { triangles = 5000, deflection = 0.003, error = 0.02 } = {}) {
  const cache = file.replace(/\.(step|stp)$/i, `.${triangles}-${error}.cache.json`);
  if (existsSync(cache) && JSON.parse(readFileSync(cache, 'utf8')).source === readFileSync(file).length) {
    return JSON.parse(readFileSync(cache, 'utf8')).meshes.map((m) => ({ ...m, pos: new Float32Array(m.pos), idx: new Uint32Array(m.idx) }));
  }

  occt ??= await occtimportjs();
  await MeshoptSimplifier.ready;
  const result = occt.ReadStepFile(new Uint8Array(readFileSync(file)), {
    linearUnit: 'meter',
    linearDeflectionType: 'bounding_box_ratio',
    linearDeflection: deflection,
    angularDeflection: 0.5
  });
  if (!result.success) throw new Error(`Could not read ${file}`);

  const total = result.meshes.reduce((s, m) => s + m.index.array.length / 3, 0);
  const ratio = Math.min(1, triangles / total);
  const meshes = result.meshes.map((m) => {
    const welded = weld(new Float32Array(m.attributes.position.array), new Uint32Array(m.index.array));
    let idx = welded.idx;
    if (ratio < 1) {
      const target = Math.max(12, Math.floor((idx.length * ratio) / 3) * 3);
      idx = MeshoptSimplifier.simplify(idx, welded.pos, 3, target, error)[0];
      // Some parts (lots of small separate faces) barely simplify; fall back to vertex clustering,
      // which ignores topology. Fine for small or hidden detail such as motor internals.
      if (idx.length > target * 1.5) idx = cluster(welded.pos, idx, target);
    }
    const p = welded.pos;
    const mn = [Infinity, Infinity, Infinity];
    const mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) (mn[k] = Math.min(mn[k], p[i + k])), (mx[k] = Math.max(mx[k], p[i + k]));
    const color = m.color ?? m.brep_faces?.find((f) => f.color)?.color ?? null;
    return { pos: p, idx: new Uint32Array(idx), color, size: mx.map((v, i) => v - mn[i]), center: mx.map((v, i) => (v + mn[i]) / 2) };
  });

  writeFileSync(
    cache,
    JSON.stringify({ source: readFileSync(file).length, meshes: meshes.map((m) => ({ ...m, pos: [...m.pos], idx: [...m.idx] })) })
  );
  return meshes;
}
