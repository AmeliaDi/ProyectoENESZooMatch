/**
 * Generador del lote 2.5D.
 *
 *   node scripts/voxel25d/run.mjs --only=cuervito,tucancito
 *   node scripts/voxel25d/run.mjs --todos --sheet
 *
 * Por animal: construye el modelo voxel, lo proyecta a 2.5D y valida sobre la
 * PROYECCIÓN (que es lo que se ve): fusión biyectiva y silueta en un solo
 * cuerpo. Las costuras que hay que hacer para cerrar la silueta se cuentan: son
 * deuda de diseño del plano, no del validador. Rasteriza, escribe PNG. NO toca
 * src/domain/avatars/pixel-sprites.ts ni la UI: sólo produce datos e imágenes.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildCuboids, frontLayer, frontComponents, stitchFront, volumeOf, asciiFront } from './voxel.mjs';
import { renderCuboids, encodePng } from './render.mjs';
import { buildPlan, PLANS } from './plans.mjs';
import { SPECIES } from './species.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const hit = argv.find(a => a.startsWith('--' + name + '='));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const has = name => argv.includes('--' + name);

const catalog = JSON.parse(readFileSync(ROOT + 'data/arquetipos.json', 'utf8'));
const only = has('todos') ? null : (arg('only', '') || '').split(',').filter(Boolean);
const ids = only && only.length ? only : catalog.animales.map(a => a.id);

const RES = +arg('res', 128);
const DEPTH = +arg('profundidad', 2);
const OUT = arg('out', 'data/voxel-2p5d');
const dir = ROOT + OUT + '/';
mkdirSync(dir, { recursive: true });

const OPTS = {
  res: RES, elev: 12, yaw: 0, bands: 4, lightAz: -40, lightElev: 45,
  dither: 0.35, outline: +arg('contorno', 2),
};

const filas = [];
const imagenes = [];

for (const id of ids) {
  const animal = catalog.animales.find(a => a.id === id);
  const spec = SPECIES[id];
  if (!spec) {
    filas.push({ id, estado: animal ? 'sin-spec (' + animal.familia_sprite + ')' : 'id-desconocido' });
    continue;
  }
  const C = spec.C;
  const m = spec.plano === 'bespoke' ? spec.build(C) : buildPlan(spec.plano, spec.P ?? {}, C);
  const cubos = buildCuboids(m);
  const plano = frontLayer(m, DEPTH);
  const partes = frontComponents(plano).length;
  const cosido = stitchFront(plano, DEPTH);
  const cubosPlano = buildCuboids(plano);
  const r = renderCuboids(cubosPlano, OPTS);

  writeFileSync(dir + id + '.png', encodePng(RES, RES, r.rgba));
  imagenes.push({ id, rgba: r.rgba });

  const males = [];
  if (volumeOf(cubos) !== m.size) males.push('fusion-no-biyectiva');
  if (partes !== 1) males.push('silueta-partida:' + partes + (cosido ? '+cosido' + cosido : ''));
  if (r.meta.silhouette[0] >= RES - 2 || r.meta.silhouette[1] >= RES - 2) males.push('recorta');
  if (r.meta.colors > 24) males.push('colores:' + r.meta.colors);

  filas.push({
    id,
    estado: males.length ? 'MAL: ' + males.join(',') : 'ok',
    voxeles: m.size,
    cuboides: cubos.length,
    planoVoxeles: plano.size,
    planos: cubosPlano.length,
    silueta: r.meta.silhouette.join('x'),
    colores: r.meta.colors,
    cubiertos: r.meta.covered,
    familia: spec.plano,
  });
}

const mal = filas.filter(f => f.estado.startsWith('MAL'));
console.table(filas);
console.log(`\n${filas.length} pedidos · ${filas.filter(f => f.estado === 'ok').length} ok · ${mal.length} con defectos`);

if (has('ascii') && ids.length === 1) {
  const spec = SPECIES[ids[0]];
  const m = spec.plano === 'bespoke' ? spec.build(spec.C) : buildPlan(spec.plano, spec.P ?? {}, spec.C);
  console.log(asciiFront(m, {}));
}

if (has('sheet') && imagenes.length) {
  const cols = +arg('cols', Math.ceil(Math.sqrt(imagenes.length)));
  const Z = Math.max(1, +arg('zoom', 1));
  const rows = Math.ceil(imagenes.length / cols);
  const pad = 4;
  const cell = RES * Z + pad;
  const W = cols * cell + pad;
  const H = rows * cell + pad;
  const sheet = new Uint8Array(W * H * 4);
  // fondo papel de atlas para que el contorno negro contraste
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = Math.floor(i / W);
    const alt = ((x >> 3) + (y >> 3)) % 2;
    const c = alt ? [0xe9, 0xdd, 0xc2] : [0xf3, 0xea, 0xd7];
    sheet[i * 4] = c[0]; sheet[i * 4 + 1] = c[1]; sheet[i * 4 + 2] = c[2]; sheet[i * 4 + 3] = 255;
  }
  imagenes.forEach((im, n) => {
    const ox = pad + (n % cols) * cell, oy = pad + Math.floor(n / cols) * cell;
    for (let y = 0; y < RES; y++)
      for (let x = 0; x < RES; x++) {
        const s = (y * RES + x) * 4;
        if (im.rgba[s + 3] < 8) continue;
        for (let j = 0; j < Z; j++)
          for (let i = 0; i < Z; i++) {
            const d = ((oy + y * Z + j) * W + ox + x * Z + i) * 4;
            sheet[d] = im.rgba[s]; sheet[d + 1] = im.rgba[s + 1]; sheet[d + 2] = im.rgba[s + 2]; sheet[d + 3] = 255;
          }
      }
  });
  const hoja = arg('hoja', 'docs/voxel-2p5d-contacto.png');
  writeFileSync(ROOT + hoja, encodePng(W, H, sheet));
  console.log(`hoja de contacto: ${hoja} (${W}x${H}, ${cols}x${rows}, zoom ${Z}x)`);
}

writeFileSync(dir + 'reporte.json', JSON.stringify(filas, null, 2) + '\n');
console.log('reporte: ' + OUT + '/reporte.json');
console.log('planes disponibles: ' + Object.keys(PLANS).join(', '));
