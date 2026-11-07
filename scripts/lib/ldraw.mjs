// Minimal LDraw reader: turns LEGO parts from the LDraw library (raw-assets/lego/ldraw, from
// library.ldraw.org, CC BY 4.0) into triangle meshes, one per colour.
//
//   const lib = createLDraw('raw-assets/lego/ldraw');
//   lib.add('95646c01.dat', 15, matrix);   // part, LDraw colour code, 4x4 column-major (LDU, -y up)
//   const meshes = lib.meshes();           // [{ rgb: [r,g,b], pos: Float32Array }] in LDU

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function createLDraw(root) {
  const dirs = ['parts', 'p', 'parts/s', 'p/48', 'models'].map((d) => path.join(root, d));
  const files = new Map();

  // Colour table from LDConfig.ldr: code -> [r, g, b] (0..1).
  const colours = new Map();
  for (const line of readFileSync(path.join(root, 'LDConfig.ldr'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/!COLOUR\s+\S+\s+CODE\s+(\d+)\s+VALUE\s+#([0-9A-Fa-f]{6})/);
    if (m) colours.set(Number(m[1]), [0, 2, 4].map((i) => parseInt(m[2].slice(i, i + 2), 16) / 255));
  }

  const load = (name) => {
    const key = name.toLowerCase().replace(/\\/g, '/');
    if (files.has(key)) return files.get(key);
    const file = dirs.map((d) => path.join(d, key)).find(existsSync);
    if (!file) {
      files.set(key, null);
      return null;
    }
    const cmds = [];
    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const t = raw.trim().split(/\s+/);
      const type = t[0];
      if (type === '1') cmds.push({ type: 1, colour: Number(t[1]), m: t.slice(2, 14).map(Number), name: t.slice(14).join(' ') });
      else if (type === '3') cmds.push({ type: 3, colour: Number(t[1]), v: t.slice(2, 11).map(Number) });
      else if (type === '4') cmds.push({ type: 4, colour: Number(t[1]), v: t.slice(2, 14).map(Number) });
    }
    files.set(key, cmds);
    return cmds;
  };

  // 4x4 matrices as arrays of 12: [x y z a b c d e f g h i] like LDraw line type 1.
  const mul = (A, B) => {
    const [ax, ay, az, a, b, c, d, e, f, g, h, i] = A;
    const [bx, by, bz, A2, B2, C2, D2, E2, F2, G2, H2, I2] = B;
    return [
      a * bx + b * by + c * bz + ax,
      d * bx + e * by + f * bz + ay,
      g * bx + h * by + i * bz + az,
      a * A2 + b * D2 + c * G2, a * B2 + b * E2 + c * H2, a * C2 + b * F2 + c * I2,
      d * A2 + e * D2 + f * G2, d * B2 + e * E2 + f * H2, d * C2 + e * F2 + f * I2,
      g * A2 + h * D2 + i * G2, g * B2 + h * E2 + i * H2, g * C2 + h * F2 + i * I2
    ];
  };
  const apply = (M, x, y, z) => [M[3] * x + M[4] * y + M[5] * z + M[0], M[6] * x + M[7] * y + M[8] * z + M[1], M[9] * x + M[10] * y + M[11] * z + M[2]];

  const byColour = new Map();
  const push = (colour, a, b, c) => {
    if (!byColour.has(colour)) byColour.set(colour, []);
    byColour.get(colour).push(...a, ...b, ...c);
  };

  const walk = (cmds, M, colour, depth) => {
    if (!cmds || depth > 30) return;
    for (const cmd of cmds) {
      const col = cmd.colour === 16 ? colour : cmd.colour;
      if (cmd.type === 1) walk(load(cmd.name), mul(M, cmd.m), col, depth + 1);
      else {
        const v = cmd.v;
        const p = [0, 3, 6, 9].slice(0, cmd.type).map((k) => apply(M, v[k], v[k + 1], v[k + 2]));
        push(col, p[0], p[1], p[2]);
        if (cmd.type === 4) push(col, p[0], p[2], p[3]);
      }
    }
  };

  return {
    /** Add a part with LDraw colour `colour` and placement M (12 numbers, as in an LDraw type 1 line). */
    add(part, colour, M) {
      const cmds = load(part);
      if (!cmds) throw new Error(`LDraw part not found: ${part}`);
      walk(cmds, M, colour, 0);
    },
    meshes() {
      return [...byColour.entries()].map(([code, list]) => ({
        code,
        rgb: colours.get(code) ?? [0.5, 0.5, 0.5],
        pos: new Float32Array(list)
      }));
    }
  };
}
