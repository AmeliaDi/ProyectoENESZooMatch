/**
 * Rasterizador 2.5D por software, sin GPU y sin dependencias externas.
 *
 * Replica el pipeline del spike validado en el navegador:
 *   1. G-buffer: por tóxel se guarda el color base y el eje+signo de la cara
 *      visible (1..6 = ±X ±Y ±Z). El modelo nunca gira y la cámara orbita, así
 *      que las normales siguen alineadas al eje y la luz se reconstruye en post.
 *   2. Post: bandas de luz, dithering sólo en costuras, cuantización redmean y
 *      contorno negro por dilatación de disco fuera de la silueta.
 *
 * Cámara ortográfica centrada en el bbox, con radius = max(semiextensión) * 1.1,
 * igual que fitCamera() del spike.
 */

import { deflateSync } from 'node:zlib';

/** cara f -> [eje de la normal, signo]. Idéntico a faceNormal() del GLSL. */
const FACE_DEF = [null, [0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
const normalOf = f => { const [ax, sg] = FACE_DEF[f]; return ax === 0 ? [sg, 0, 0] : ax === 1 ? [0, sg, 0] : [0, 0, sg]; };

const fract = x => x - Math.floor(x);

function bayer2(x, y) {
  x = Math.floor(x); y = Math.floor(y);
  return fract(x / 2 + y * y * 0.75);
}
const bayer4 = (x, y) => bayer2(x, y) * 0.25 + bayer2(Math.floor(x * 0.5), Math.floor(y * 0.5));
const bayer8 = (x, y) => bayer4(x, y) * 0.25 + bayer2(Math.floor(x * 0.25), Math.floor(y * 0.25));
const bayerAt = (x, y, mat) => (mat === 8 ? bayer8(x % 8, y % 8) : bayer4(x % 4, y % 4));

/** Distancia redmean ponderada, la misma que nearestPal() en GLSL. */
export function nearestPalette(c, pal) {
  let best = pal[0];
  let bd = Infinity;
  for (const p of pal) {
    const dm = (c[0] + p[0]) * 0.5;
    const dr = c[0] - p[0], dg = c[1] - p[1], db = c[2] - p[2];
    const d = (2 + dm) * dr * dr + 4 * dg * dg + (2 + (1 - dm)) * db * db;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

export function boundsOfCuboids(cuboids) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const b of cuboids)
    for (let i = 0; i < 3; i++) {
      const p = i === 0 ? b.x0 : i === 1 ? b.y0 : b.z0;
      const q = i === 0 ? b.x1 + 1 : i === 1 ? b.y1 + 1 : b.z1 + 1;
      if (p < lo[i]) lo[i] = p;
      if (q > hi[i]) hi[i] = q;
    }
  return { lo, hi };
}

const rgbOf = c => [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255];

/** Rampa de pixel art: cada color base del modelo × cada multiplicador de banda. */
export function rampPalette(cuboids, bands, mulOf) {
  const set = new Map();
  for (const b of cuboids) {
    const base = rgbOf(b.c);
    for (let s = 0; s < bands; s++) {
      const m = mulOf(s);
      const key = base.map(v => Math.round(Math.min(1, Math.max(0, v * m)) * 255));
      set.set(key.join(','), key.map(v => v / 255));
    }
  }
  return [...set.values()];
}

/**
 * @param cuboids salida de buildCuboids(): {x0,x1,y0,y1,z0,z1,c}
 * @param opts res, elev, yaw, bands, lightAz, lightElev, dither, ditherMat, outline, ink, palette
 */
export function renderCuboids(cuboids, opts = {}) {
  const res = opts.res ?? 128;
  const elev = ((opts.elev ?? 12) * Math.PI) / 180;
  const yaw = ((opts.yaw ?? 0) * Math.PI) / 180;
  const bands = opts.bands ?? 4;
  const laz = (((opts.lightAz ?? -40) + (opts.yaw ?? 0)) * Math.PI) / 180;
  const lel = ((opts.lightElev ?? 45) * Math.PI) / 180;
  const dither = opts.dither ?? 0.35;
  const ditherMat = opts.ditherMat ?? 4;
  const outline = opts.outline ?? 2;
  const ink = opts.ink ?? [0, 0, 0];
  const mulOf = s => (bands > 1 ? 0.55 + 0.7 * (s / (bands - 1)) : 1);

  const { lo, hi } = boundsOfCuboids(cuboids);
  const center = lo.map((v, i) => (v + hi[i]) / 2);
  const radius = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 * 1.1;
  const scale = res / (2 * radius);

  const ca = Math.cos(yaw), sa = Math.sin(yaw);
  const ce = Math.cos(elev), se = Math.sin(elev);
  const R = [ca, 0, -sa];
  const U = [-sa * se, ce, -ca * se];
  const D = [sa * ce, se, ca * ce];
  const L = [Math.cos(lel) * Math.sin(laz), Math.sin(lel), Math.cos(lel) * Math.cos(laz)];

  const depth = new Float32Array(res * res).fill(-Infinity);
  const face = new Uint8Array(res * res);
  const base = new Float32Array(res * res * 3);

  const proj = p => {
    const q = [p[0] - center[0], p[1] - center[1], p[2] - center[2]];
    return [
      (q[0] * R[0] + q[1] * R[1] + q[2] * R[2]) * scale + res / 2,
      res / 2 - (q[0] * U[0] + q[1] * U[1] + q[2] * U[2]) * scale,
      q[0] * D[0] + q[1] * D[1] + q[2] * D[2],
    ];
  };

  for (const b of cuboids) {
    const span = [[b.x0 - 0.5, b.x1 + 0.5], [b.y0 - 0.5, b.y1 + 0.5], [b.z0 - 0.5, b.z1 + 0.5]];
    const rgb = rgbOf(b.c);
    for (let f = 1; f <= 6; f++) {
      const [nAxis, nSign] = FACE_DEF[f];
      if (nSign * D[nAxis] <= 0) continue;
      const free = nAxis === 0 ? [1, 2] : nAxis === 1 ? [0, 2] : [0, 1];
      const [a1, a2] = free;
      const P0 = [0, 0, 0];
      P0[nAxis] = nSign > 0 ? span[nAxis][1] : span[nAxis][0];
      P0[a1] = span[a1][0];
      P0[a2] = span[a2][0];
      const E1 = [0, 0, 0]; E1[a1] = span[a1][1] - span[a1][0];
      const E2 = [0, 0, 0]; E2[a2] = span[a2][1] - span[a2][0];

      const s0 = proj(P0);
      const s1 = proj(P0.map((v, i) => v + E1[i]));
      const s2 = proj(P0.map((v, i) => v + E2[i]));
      const m11 = s1[0] - s0[0], m12 = s2[0] - s0[0];
      const m21 = s1[1] - s0[1], m22 = s2[1] - s0[1];
      const det = m11 * m22 - m12 * m21;
      if (Math.abs(det) < 1e-6) continue;
      const d0 = s0[2], da = s1[2] - s0[2], db = s2[2] - s0[2];

      let minx = Math.floor(Math.min(s0[0], s1[0], s2[0], s1[0] + m12));
      let maxx = Math.ceil(Math.max(s0[0], s1[0], s2[0], s1[0] + m12));
      let miny = Math.floor(Math.min(s0[1], s1[1], s2[1], s1[1] + m22));
      let maxy = Math.ceil(Math.max(s0[1], s1[1], s2[1], s1[1] + m22));
      minx = Math.max(0, minx); miny = Math.max(0, miny);
      maxx = Math.min(res - 1, maxx); maxy = Math.min(res - 1, maxy);

      for (let py = miny; py <= maxy; py++) {
        const vy0 = py + 0.5 - s0[1];
        for (let px = minx; px <= maxx; px++) {
          const vx = px + 0.5 - s0[0];
          const a = (vx * m22 - vy0 * m12) / det;
          const bt = (vy0 * m11 - vx * m21) / det;
          if (a < 0 || a > 1 || bt < 0 || bt > 1) continue;
          const idx = py * res + px;
          const dz = d0 + a * da + bt * db;
          if (dz <= depth[idx]) continue;
          depth[idx] = dz;
          face[idx] = f;
          base[idx * 3] = rgb[0];
          base[idx * 3 + 1] = rgb[1];
          base[idx * 3 + 2] = rgb[2];
        }
      }
    }
  }

  const tOf = f => {
    const n = normalOf(f);
    return Math.max(0, Math.min(1, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) * 0.5 + 0.5));
  };
  const bandBuf = new Uint8Array(res * res);
  const cov = new Uint8Array(res * res);
  for (let i = 0; i < res * res; i++)
    if (face[i]) {
      cov[i] = 1;
      bandBuf[i] = Math.max(0, Math.min(bands - 1, Math.floor(tOf(face[i]) * (bands - 1) + 0.5)));
    }

  const pal = opts.palette ?? rampPalette(cuboids, bands, mulOf);
  const rgba = new Uint8Array(res * res * 4);

  for (let py = 0; py < res; py++) {
    for (let px = 0; px < res; px++) {
      const idx = py * res + px;
      const o = idx * 4;
      if (!cov[idx]) {
        if (outline < 0.5) continue;
        let near = 0;
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            if (dx * dx + dy * dy > outline * outline + 0.25) continue;
            const qx = px + dx, qy = py + dy;
            if (qx < 0 || qy < 0 || qx >= res || qy >= res) continue;
            near += cov[qy * res + qx];
          }
        if (near > 0.5) {
          rgba[o] = ink[0] * 255; rgba[o + 1] = ink[1] * 255; rgba[o + 2] = ink[2] * 255; rgba[o + 3] = 255;
        }
        continue;
      }

      const lvl0 = tOf(face[idx]) * (bands - 1);
      const sh0 = bandBuf[idx];
      let seam = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const qx = px + dx, qy = py + dy;
        if (qx < 0 || qy < 0 || qx >= res || qy >= res) continue;
        const q = qy * res + qx;
        if (cov[q] && bandBuf[q] !== sh0) seam++;
      }
      // gl_FragCoord.y crece hacia arriba: renglón invertido = mismo patrón de Bayer
      const fy = res - 1 - py;
      const lvl = lvl0 + (seam > 0.5 ? (bayerAt(px, fy, ditherMat) - 0.5) * dither : 0);
      const m = mulOf(Math.max(0, Math.min(bands - 1, Math.floor(lvl + 0.5))));
      const c = [
        Math.min(1, Math.max(0, base[idx * 3] * m)),
        Math.min(1, Math.max(0, base[idx * 3 + 1] * m)),
        Math.min(1, Math.max(0, base[idx * 3 + 2] * m)),
      ];
      const q = nearestPalette(c, pal);
      rgba[o] = Math.round(q[0] * 255);
      rgba[o + 1] = Math.round(q[1] * 255);
      rgba[o + 2] = Math.round(q[2] * 255);
      rgba[o + 3] = 255;
    }
  }

  const colors = new Set();
  let covered = 0, bx0 = res, by0 = res, bx1 = -1, by1 = -1;
  for (let py = 0; py < res; py++)
    for (let px = 0; px < res; px++) {
      const o = (py * res + px) * 4;
      if (!rgba[o + 3]) continue;
      covered++;
      colors.add(rgba[o] + ',' + rgba[o + 1] + ',' + rgba[o + 2]);
      if (px < bx0) bx0 = px; if (px > bx1) bx1 = px;
      if (py < by0) by0 = py; if (py > by1) by1 = py;
    }

  return { res, rgba, meta: { covered, colors: colors.size, paletteSize: pal.length,
    silhouette: [bx1 - bx0 + 1, by1 - by0 + 1], bbox: [bx0, by0, bx1, by1] } };
}

/* ---------------------------------- PNG ---------------------------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** RGBA 8-bit, filtro 0 por renglón, zlib level 9. Determinista byte a byte. */
export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, rowStart + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
