/**
 * Autochequeo del rasterizador: reconstruye el ajolote del spike (el modelo que
 * quedó validado en el navegador) y compara las métricas contra los números
 * medidos ahí. Si esto se rompe, todo lo generado después está mal.
 *
 *   node scripts/voxel25d/selfcheck.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildCuboids, frontLayer, components, volumeOf } from './voxel.mjs';
import { renderCuboids, encodePng } from './render.mjs';
import { buildAjolotito } from './ajolotito.mjs';

const OPTS = { res: 128, elev: 12, yaw: 0, bands: 4, lightAz: -40, lightElev: 45, dither: 0.35, outline: 2 };

/** Lo que midió el navegador en el snapshot presentado. */
const EXPECTED = { covered: 6795, silhouette: [121, 85], blackPx: 1006 };

const map = buildAjolotito();
const cuboids = buildCuboids(map);
const flat = frontLayer(map, 2);
const flatCuboids = buildCuboids(flat);

const r = renderCuboids(cuboids, OPTS);
const rf = renderCuboids(flatCuboids, OPTS);

const blackOf = img => {
  let n = 0;
  for (let i = 0; i < img.rgba.length; i += 4) {
    if (img.rgba[i + 3] < 8) continue;
    const l = (img.rgba[i] * 299 + img.rgba[i + 1] * 587 + img.rgba[i + 2] * 114) / 1000;
    if (l < 12) n++;
  }
  return n;
};

const report = {
  voxel: {
    voxeles: map.size,
    cuboides: cuboids.length,
    biyectivo: volumeOf(cuboids) === map.size,
    componentes: components(map).length,
    ...r.meta,
    negrosPuros: blackOf(r),
  },
  plano2p5d: {
    voxeles: flat.size,
    cuboides: flatCuboids.length,
    biyectivo: volumeOf(flatCuboids) === flat.size,
    ...rf.meta,
    negrosPuros: blackOf(rf),
  },
  esperadoDelNavegador: EXPECTED,
  desviacion: {
    cubiertos: r.meta.covered - EXPECTED.covered,
    silueta: [r.meta.silhouette[0] - EXPECTED.silhouette[0], r.meta.silhouette[1] - EXPECTED.silhouette[1]],
    contornoNegro: blackOf(r) - EXPECTED.blackPx,
  },
};

const outDir = fileURLToPath(new URL('./out-selfcheck/', import.meta.url));
mkdirSync(outDir, { recursive: true });
writeFileSync(outDir + 'ajolotito-voxel.png', encodePng(r.res, r.res, r.rgba));
writeFileSync(outDir + 'ajolotito-2p5d.png', encodePng(rf.res, rf.res, rf.rgba));

console.log(JSON.stringify(report, null, 2));

const tol = 0.02;
const near = (a, b, t = tol) => Math.abs(a - b) <= Math.max(2, Math.abs(b) * t);
const ok =
  report.voxel.biyectivo && report.voxel.componentes === 1 &&
  report.plano2p5d.biyectivo &&
  r.meta.silhouette[0] === EXPECTED.silhouette[0] &&
  r.meta.silhouette[1] === EXPECTED.silhouette[1] &&
  near(r.meta.covered, EXPECTED.covered) &&
  near(blackOf(r), EXPECTED.blackPx, 0.15);
if (ok) console.log('\nOK: silueta exacta y cobertura dentro de tolerancia.');
else console.log('\nFAIL: revisar proyección/post.');
console.log(
  'Nota: la silueta se compara exacta; cubiertos y contorno llevan tolerancia porque la\n' +
  'regla de relleno de bordes de GL (top-left) y el clamp de textura en la frontera difieren\n' +
  'de este rasterizador por ±1 px. El nº de colores NO se compara: el navegador cuantizaba a\n' +
  'la paleta kawaii de 16, aquí cada animal lleva su rampa derivada del modelo.'
);
process.exit(ok ? 0 : 1);
