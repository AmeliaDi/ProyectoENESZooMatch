/**
 * El héroe del spike, tal cual quedó validado en el navegador.
 * Vive aparte porque es el único modelo dibujado a mano pieza por pieza.
 */

import { put, box, ellipsoid, paintFront, recolor } from './voxel.mjs';

export const V = {
  skin: 0xf1a7c4, deep: 0xd3789d, gill: 0xff7ba6, gillHi: 0xffc2da,
  belly: 0xfff0d6, eye: 0x24202f, shine: 0xffffff, blush: 0xff93ae,
  mouth: 0x5b3348, fin: 0xfbd3e2,
};

export function buildAjolotito() {
  const m = new Map();
  ellipsoid(m, 0, 1.6, 0.5, 5.0, 4.2, 4.2, V.skin, 3);
  ellipsoid(m, 0, -3.0, -4.0, 3.3, 2.4, 3.6, V.skin, 3);
  ellipsoid(m, 0, -3.2, -7.6, 1.4, 1.3, 2.4, V.deep, 2.6);
  for (let z = -8; z >= -12; z--) {
    const h = 3 - Math.round((-7 - z) * 0.7);
    box(m, 0, 0, -3 - h, -3 + Math.max(1, h), z, z, V.fin);
  }
  // abanicos branquiales: en cada x se rellena el tramo vertical entre el peldaño
  // anterior y el actual, si no la escalera queda en diagonal y el modelo se parte.
  for (let s = -1; s <= 1; s += 2) {
    for (const st of [{ y: 4, dy: 1, n: 6, z: 1 }, { y: 3, dy: 0, n: 6, z: 0 }, { y: 2, dy: -1, n: 6, z: -1 }]) {
      let prev = null;
      for (let t = 0; t < st.n; t++) {
        const x = 3 + t;
        const y = st.y + Math.round((st.dy * t) / (st.n - 1));
        const lo = prev === null ? y : Math.min(y, prev);
        const hi = prev === null ? y : Math.max(y, prev);
        for (let yy = lo; yy <= hi; yy++) put(m, s * x, yy, st.z, t === st.n - 1 ? V.gillHi : V.gill);
        prev = y;
      }
    }
  }
  box(m, 2, 3, -6, -5, -3, -2, V.deep); box(m, -3, -2, -6, -5, -3, -2, V.deep);
  box(m, 2, 3, -6, -5, -5, -4, V.deep); box(m, -3, -2, -6, -5, -5, -4, V.deep);
  recolor(m, (x, y, z, c) => c === V.skin && y <= -4 && z > -7, V.belly);
  for (const sx of [1, -1]) {
    paintFront(m, 2 * sx, 1, V.eye); paintFront(m, 3 * sx, 1, V.eye);
    paintFront(m, 2 * sx, 2, V.eye); paintFront(m, 3 * sx, 2, V.shine);
    paintFront(m, 4 * sx, 0, V.blush);
  }
  paintFront(m, -1, 0, V.mouth); paintFront(m, 0, -1, V.mouth); paintFront(m, 1, 0, V.mouth);
  return m;
}
