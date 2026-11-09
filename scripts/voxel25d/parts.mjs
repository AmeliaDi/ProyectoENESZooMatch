/**
 * Kit de partes para el RETRATO 2.5D.
 *
 * Convenciones, iguales para todos los animales:
 *   +X = derecha del espectador · +Y = arriba · +Z = hacia la cámara
 *   El animal mira DE FRENTE: lo que se ve es la proyección sobre XY.
 *   Por eso la señal de cada especie tiene que ir ARRIBA o A LOS LADOS
 *   (orejas, cresta, cuernos, alas, pinzas, bigotes) o COLGAR DE LA CARA
 *   (pico, hocico). Un apéndice que apunte a +Z desaparece en el 2.5D.
 *
 * Regla de anclaje: todo apéndice nace DENTRO de la masa (x0 = radio − 1), así
 * el modelo queda en un solo componente conexo sin depender de la talla exacta
 * de la superelipsoide.
 *
 * Orden de dibujo: masas → apéndices → patrones → cara/rubor al final, porque
 * cara() usa paintFront() y la cara tiene que ganarle al apéndice que la cruza.
 */

import { box, ellipsoid, put, paintFront, recolor } from './voxel.mjs';

const rx = (side, a, b) => (side > 0 ? [a, b] : [-b, -a]);
export const mirror = fn => { fn(1); fn(-1); };

/**
 * Fila con puente: dibuja [lo,hi] en la fila y y, si la fila anterior no toca
 * su rango en x, prolonga la anterior hasta tocarla. Una escalera diagonal de a
 * un vóxel (punta de oreja, ramita de cuerna, pluma de cresta) NO es 4-conexa
 * en la huella frontal y la silueta sale con una manchita suelta.
 */
function fila(m, c, prev, lo, hi, y, z0, z1) {
  if (prev && Math.abs(prev.y - y) === 1) {
    if (lo > prev.hi) box(m, prev.hi + 1, lo, prev.y, prev.y, z0, z1, c);
    else if (hi < prev.lo) box(m, hi, prev.lo - 1, prev.y, prev.y, z0, z1, c);
  }
  box(m, lo, hi, y, y, z0, z1, c);
  return { y, lo, hi };
}

/** Trazo de un vóxel encadenado (bigote, antena, pata de insecto): rellena la L. */
function trazar(m, c, prev, x, y, z) {
  if (prev) {
    for (let xx = Math.min(x, prev[0]); xx <= Math.max(x, prev[0]); xx++) put(m, xx, prev[1], z, c);
    for (let yy = Math.min(y, prev[1]); yy <= Math.max(y, prev[1]); yy++) put(m, x, yy, z, c);
  }
  put(m, x, y, z, c);
  return [x, y];
}

/** Masa: torso/cabeza como superelipsoide. */
export function masa(m, c, { cy = 0, cz = 0, rx: a = 3, ry: b = 3, rz: d = 3, p = 3, cx = 0 } = {}) {
  return ellipsoid(m, cx, cy, cz, a, b, d, c, p);
}

/**
 * Núcleo de retrato chibi: cabeza grande arriba, cuerpo pequeño abajo y atrás.
 * El cuerpo se dibuja primero; en la proyección frontal la cabeza lo tapa, que
 * es justo lo que hacen las plantillas 16×16 del repo (filas 3-11 cabeza,
 * 12-14 cuerpo, 15 pies).
 */
export function retrato(m, P, C) {
  const s = P.s ?? 1;
  const cab = {
    cy: (P.cabezaY ?? 3.0) * s,
    cz: (P.cabezaZ ?? 1.0) * s,
    rx: (P.cabezaRx ?? 5.0) * s,
    ry: (P.cabezaRy ?? 4.2) * s,
    rz: (P.cabezaRz ?? 4.0) * s,
  };
  const tor = {
    cy: (P.cuerpoY ?? -5.4) * s,
    cz: (P.cuerpoZ ?? -1.4) * s,
    rx: (P.cuerpoRx ?? 3.6) * s,
    ry: (P.cuerpoRy ?? 3.2) * s,
    rz: (P.cuerpoRz ?? 3.4) * s,
  };
  masa(m, C.cuerpo, { ...tor, p: P.cuerpoP ?? 3 });
  masa(m, C.cabeza ?? C.cuerpo, { ...cab, p: P.cabezaP ?? 3 });

  // PUENTE CERVICAL. Con p=3 las filas extremas de una superelipsoide se encogen
  // muchísimo: dos masas que en la cuenta exacta "se tocan" quedan en realidad a
  // un vóxel de distancia, y el retrato sale con la cabeza flotando. Los bordes
  // REALES de cada masa son floor(cy+ry) arriba y ceil(cy-ry) abajo, no el round
  // del radio; con esos valores exigimos solape de filas y, si falta, unimos
  // torso y cráneo con una columna de 3 vóxeles en el z del torso. En la
  // proyección frontal queda tapada por la cabeza; si no, se lee como cuello.
  const yTorsoArriba = Math.floor(tor.cy + tor.ry);
  const yCabezaAbajo = Math.ceil(cab.cy - cab.ry);
  if (yTorsoArriba < yCabezaAbajo - 1) {
    const g = Math.max(0, Math.round((P.cuelloAncho ?? 1.0) * s));
    const zc = Math.round(tor.cz + tor.rz * 0.6);
    box(m, -g, g, yTorsoArriba, yCabezaAbajo, zc - 1, zc + 1, C.cuello ?? C.cuerpo);
  }

  const ySuelo = P.ySuelo !== undefined
    ? Math.round(P.ySuelo * s)
    : Math.round(tor.cy - tor.ry - (P.piernas ?? 2.2) * s);
  return { s, cab, tor, ySuelo };
}

/**
 * Cuello: interpola del borde superior del torso al borde inferior de la
 * cabeza. Ambos extremos caen dentro de la masa, así nunca islas. `curva`
 * desplaza el cuello hacia adelante (garza) o lo deja recto (jirafa, llama).
 */
export function cuello(m, c, { tor, cab, s = 1, largo = 4, g = 1, curva = 0 }) {
  const n = Math.max(1, Math.round(largo * s));
  const y0 = tor.cy + tor.ry * 0.5, y1 = cab.cy - cab.ry * 0.5;
  let prev = null;
  for (let t = 0; t <= n; t++) {
    const k = t / n;
    const yy = Math.round(y0 + (y1 - y0) * k);
    const zz = Math.round(tor.cz + (cab.cz - tor.cz) * k + curva * s * k);
    const yLo = prev === null ? yy : Math.min(yy, prev.yy);
    const yHi = prev === null ? yy : Math.max(yy, prev.yy);
    const zLo = prev === null ? zz : Math.min(zz, prev.zz);
    const zHi = prev === null ? zz : Math.max(zz, prev.zz);
    box(m, -g, g, yLo, yHi, zLo, zHi + g, c);
    prev = { yy, zz };
  }
  return m;
}

/**
 * Cara del retrato: par de ojos simétricos coplanares, brillo y boca.
 * `x` = columna del ojo más cercano al eje · `y` = fila del borde superior.
 */
export function cara(m, c, { y, x = 2, w = 2, h = 2, brillo, boca, bocaY, nariz, ceja }) {
  mirror(side => {
    for (let dx = 0; dx < w; dx++)
      for (let dy = 0; dy < h; dy++) paintFront(m, side * (x + dx), y + dy, c);
    if (brillo) paintFront(m, side * (x + w - 1), y + h - 1, brillo);
    if (ceja) for (let dx = 0; dx < w; dx++) paintFront(m, side * (x + dx), y + h, ceja);
  });
  const by = bocaY ?? y - h - 1;
  if (boca) {
    paintFront(m, -1, by, boca);
    paintFront(m, 0, by - 1, boca);
    paintFront(m, 1, by, boca);
  }
  if (nariz !== undefined) paintFront(m, 0, by, nariz);
  return m;
}

/** Rubor kawaii en las mejillas. */
export function rubor(m, c, { y, x }) {
  mirror(side => paintFront(m, side * x, y, c));
  return m;
}

/**
 * Pico / hocico que COLGA de la cara: avanza en +Z y baja en Y, así el 2.5D lo
 * ve como una cuña de color bajo los ojos en vez de un punto.
 */
export function colgar(m, c, { y, z, len = 3, w = 3, h = 2, curva = 0.6, avance = 0.7, afilado = 0.55, color2 }) {
  for (let t = 0; t < len; t++) {
    const k = len === 1 ? 0 : t / (len - 1);
    const hw = Math.max(0, Math.round(w * (1 - k * afilado)));
    const hh = Math.max(0, Math.round(h * (1 - k * 0.45)));
    const dy = -Math.round(curva * t);
    const zz = z + Math.round(avance * t);
    box(m, -hw, hw, y + dy - hh, y + dy + hh, zz, zz, t > len * 0.72 && color2 ? color2 : c);
  }
  return m;
}

/** Nariz negra coplanar, en la fila que se le indique. */
export function morro(m, c, { y, w = 1 }) {
  for (let x = -w; x <= w; x++) paintFront(m, x, y, c);
  return m;
}

/**
 * Oreja. `forma`: redonda (osos, roedores) · puntiaguda (gatos, zorros) ·
 * larga (conejos) · plana (elefante, murciélago) · mechón (búhos) ·
 * caida (caninos). Nace en x0, dentro del cráneo.
 */
export function oreja(m, c, { side, x0, y, z = 0, w = 2, h = 3, forma = 'redonda', incl = 1, relleno }) {
  if (forma === 'larga') {
    let prev = null;
    for (let t = 0; t <= h; t++) {
      const off = Math.round(incl * t * 0.3);
      prev = fila(m, c, prev, ...rx(side, x0 + off, x0 + off + w - 1).concat([y + t, z, z + 1]));
    }
    if (relleno) for (let t = 1; t < h; t++) {
      const off = Math.round(incl * t * 0.3);
      box(m, ...rx(side, x0 + off, x0 + off), y + t, y + t, z + 1, z + 1, relleno);
    }
  } else if (forma === 'puntiaguda') {
    let prev = null;
    for (let t = 0; t <= h; t++) {
      const ww = Math.max(0, Math.round((w - 1) * (1 - t / h)));
      const off = Math.round(incl * t * 0.45);
      const [lo, hi] = rx(side, x0 + off - ww, x0 + off + ww);
      prev = fila(m, c, prev, lo, hi, y + t, z, z + Math.max(1, 2 - Math.round(t / 2)));
    }
    if (relleno) for (let t = 0; t < h; t++) {
      const ww = Math.max(0, Math.round((w - 2) * (1 - t / h)));
      const off = Math.round(incl * t * 0.45);
      box(m, ...rx(side, x0 + off - ww, x0 + off + ww), y + t, y + t, z + 2, z + 2, relleno);
    }
  } else if (forma === 'plana') {
    ellipsoid(m, side * (x0 + w / 2 + 0.5), y + h / 2, z, w / 2 + 1.6, h / 2 + 0.8, 0.9, c, 2);
    if (relleno) ellipsoid(m, side * (x0 + w / 2 + 0.5), y + h / 2, z + 0.8, w / 2, h / 2, 0.6, relleno, 2);
  } else if (forma === 'mechon') {
    let prev = null;
    for (let t = 0; t <= h; t++)
      prev = fila(m, c, prev, ...rx(side, x0, x0 + Math.max(0, w - 1 - t)).concat([y + t, z - Math.round(t * 0.4), z + 1]));
  } else if (forma === 'caida') {
    let prev = null;
    for (let t = 0; t <= h; t++) {
      const off = Math.round(incl * t * 0.3);
      const ww = Math.max(0, Math.round(w - 1 - t * 0.2));
      const [lo, hi] = rx(side, x0 + off, x0 + off + ww);
      prev = fila(m, c, prev, lo, hi, y - t, z, z + 1);
      box(m, lo, hi, y - t, y - t + 1, z, z + 1, c);
    }
    if (relleno) for (let t = 0; t < h; t++) {
      const off = Math.round(incl * t * 0.3);
      box(m, ...rx(side, x0 + off, x0 + off), y - t, y - t, z + 2, z + 2, relleno);
    }
  } else {
    ellipsoid(m, side * (x0 + (w - 1) / 2 + 0.5), y + h / 2, z, (w + 1) / 2 + 0.5, (h + 1) / 2 + 0.5, 1.2, c, 2);
    if (relleno)
      ellipsoid(m, side * (x0 + (w - 1) / 2 + 0.5), y + h / 2, z + 1.0, (w - 1) / 2 + 0.6, (h - 1) / 2 + 0.6, 0.7, relleno, 2);
  }
  return m;
}

/** Plumas de cresta / mechones hacia arriba desde la coronilla. */
export function cresta(m, c, { y, z = 0, n = 3, alto = 3, w = 1, paso = 2, color2, lado = 0 }) {
  let base = null;
  for (let t = 0; t < n; t++) {
    const x = Math.round(lado * (t - (n - 1) / 2) * paso);
    const ww0 = Math.max(0, Math.round((w - 1) / 2));
    base = fila(m, c, base, x - ww0, x + ww0, y, z, z + 1);
    for (let k = 1; k <= alto; k++) {
      const ww = Math.max(0, ww0 - Math.round(k * 0.3));
      box(m, x - ww, x + ww, y + k, y + k, z - Math.round(k * 0.25), z - Math.round(k * 0.25) + 1, k >= alto && color2 ? color2 : c);
    }
  }
  return m;
}

/** Filas de espinas a lo largo de la coronilla y el lomo. */
export function espinas(m, c, { y, z = 0, xs = [-4, -2, 0, 2, 4], h = 2, w = 1, baje = 0 }) {
  for (const x of xs) {
    const yy = y - Math.round(Math.abs(x) * baje);
    for (let t = 0; t <= h; t++) {
      const ww = Math.max(0, w - 1 - Math.round(t / 2));
      box(m, x - ww, x + ww, yy + t, yy + t, z - Math.round(t / 2), z, c);
    }
  }
  return m;
}

/** Cornamenta que ramifica hacia arriba y afuera (ciervo, alce, cabra). */
export function cuernos(m, c, { x0, y, z = 0, h = 5, incl = 1, g = 1, ramas = 2, color2 }) {
  mirror(side => {
    let prev = null;
    for (let t = 0; t <= h; t++) {
      const px = side * (x0 + Math.round(t * incl * 0.5));
      const lo = Math.min(px, px + side * (g - 1)), hi = Math.max(px, px + side * (g - 1));
      prev = fila(m, t > h - ramas ? color2 ?? c : c, prev, lo, hi, y + t, z, z + g - 1);
      for (let r = 1; r <= ramas; r++) {
        if (t !== Math.round(h * (0.4 + 0.3 * r))) continue;
        const q = side * (x0 + Math.round(t * incl * 0.5) + r);
        box(m, Math.min(px, q), Math.max(px, q), y + t, y + t + 1, z, z + g - 1, color2 ?? c);
      }
    }
  });
  return m;
}

/** Ala / aleta como placa vertical pegada al flanco (ave sentada, pingüino). */
export function chapeton(m, c, { side, x0, y, z0, z1, h, w = 1, punta, abajo = 0 }) {
  const [a, b] = rx(side, x0, x0 + w - 1);
  box(m, a, b, y - h - abajo, y, z0, z1, c);
  if (punta) box(m, a, b, y - h - abajo, y - h - abajo + 1, z0 - 1, z0 + 1, punta);
  return m;
}

/** Ala extendida hacia afuera (mariposa, murciélago, vuelo). */
export function ala(m, c, { side, x0, y, z = 0, w = 4, h = 3, forma = 'ovalada', veta, d = 1 }) {
  if (forma === 'ovalada')
    ellipsoid(m, side * (x0 + w / 2), y, z, w / 2 + 0.7, h / 2 + 0.7, d / 2 + 0.4, c, 2);
  else if (forma === 'triangular')
    for (let t = 0; t < w; t++) {
      const hh = Math.max(0, Math.round(h * (1 - t / w)));
      box(m, ...rx(side, x0 + t, x0 + t), y - hh, y + hh, z - Math.round(d / 2), z + Math.round(d / 2), c);
    }
  else
    box(m, ...rx(side, x0, x0 + w - 1), y - h, y + h, z - Math.round(d / 2), z + Math.round(d / 2), c);
  if (veta) box(m, ...rx(side, x0, x0 + w - 1), y, y, z - Math.round(d / 2), z + Math.round(d / 2), veta);
  return m;
}

/** Cola que SE VE desde el frente: sale del costado y cuelga, o se abre abajo. */
export function cola(m, c, { tipo, x0, y, z = -2, len = 5, w = 2, h = 2, color2, lado = 1, curva = 0.8 }) {
  if (tipo === 'esponjosa') {
    ellipsoid(m, lado * (x0 + len / 2), y - Math.round(len * curva / 2), z, len / 2 + 1, w, h, c, 2);
    if (color2) ellipsoid(m, lado * (x0 + len + 1), y - Math.round(len * curva), z, w, Math.max(1, h - 1), Math.max(1, h - 1), color2, 2);
  } else if (tipo === 'larga') {
    for (let t = 0; t < len; t++) {
      const s = Math.max(0, Math.round(w * (1 - t / (len * 1.15))));
      const px = lado * (x0 + Math.round(t * 0.6));
      const py = y - Math.round(t * curva);
      box(m, px - s, px + s, py, py + s, z - Math.round(t * 0.15), z - Math.round(t * 0.15) + h - 1, t > len * 0.75 && color2 ? color2 : c);
    }
  } else if (tipo === 'plumas') {
    for (let t = 0; t < len; t++) {
      const ww = Math.round(w * (0.5 + 0.5 * (t / len)));
      box(m, -ww, ww, y - t, y - t, z - Math.round(t * 0.3), z - Math.round(t * 0.3) + h - 1, t % 2 && color2 ? color2 : c);
    }
  } else if (tipo === 'abanico') {
    for (let t = 0; t < len; t++) {
      const ww = Math.round(w * (0.3 + 0.7 * (t / len)));
      box(m, -ww, ww, y - t - 1, y - t + 1, z - Math.round(t * 0.2), z - Math.round(t * 0.2) + h - 1, t > len * 0.7 && color2 ? color2 : c);
    }
  } else if (tipo === 'pene') {
    box(m, -Math.round(w / 2), Math.round(w / 2), y - Math.round(h / 2), y + Math.round(h / 2), z - len, z + 1, c);
  } else if (tipo === 'rizada') {
    let prev = null;
    for (let t = 0; t < len; t++) {
      const px = lado * (x0 + Math.round(t * 0.6));
      const py = y - Math.round(t * curva) + Math.round(Math.sin(t * 0.9) * 1.2);
      put(m, px, py, z - Math.round(t * 0.2), c);
      put(m, px - lado, py, z - Math.round(t * 0.2), c);
      if (prev !== null) for (let yy = Math.min(py, prev); yy <= Math.max(py, prev); yy++) put(m, px, yy, z - Math.round(t * 0.2), c);
      prev = py;
    }
  } else if (tipo) {
    box(m, -Math.round(w / 2), Math.round(w / 2), y - h, y + h, z - len, z, c);
  }
  return m;
}

/** Patas del retrato: nacen dentro del torso y llegan al suelo. */
export function patas(m, c, { tor, ySuelo, n = 2, g = 2, x0, pezuña, dedo }) {
  const xa = x0 ?? Math.max(1, Math.round(tor.rx * 0.42));
  const top = Math.round(tor.cy - tor.ry * 0.15);
  const zz = Math.round(tor.cz + tor.rz) - 2;
  mirror(side => {
    for (const off of n === 2 ? [0] : [0, 2]) {
      const a = xa + off;
      box(m, ...rx(side, a, a + g - 1), ySuelo, top, zz, zz + 1, c);
      if (pezuña) box(m, ...rx(side, a, a + g - 1), ySuelo, ySuelo, zz, zz + 2, pezuña);
      if (dedo) for (let d = 0; d < dedo; d++) box(m, ...rx(side, a + d, a + d), ySuelo, ySuelo, zz, zz + 2, c);
    }
  });
  return m;
}

/** Pata de ave: caña delgada de 1 voxel con dedos hacia adelante. */
export function pataAve(m, c, { x0, y, ySuelo, z, dedo = 2, n = 2 }) {
  mirror(side => {
    for (const off of n === 2 ? [0] : [0, 2]) {
      const px = side * (x0 + off);
      box(m, px, px, ySuelo, y, z, z, c);
      box(m, px, px, ySuelo, ySuelo, z, z + dedo, c);
    }
  });
  return m;
}

/** Aleta: dorsal arriba, caudal abajo abriéndose, pectoral a los lados. */
export function aleta(m, c, { parte, x0 = 4, y, z, s = 3, color2, lado = 1 }) {
  if (parte === 'dorsal') {
    // Vela LATERAL. En el retrato vertical la cresta dorsal cae justo detrás del
    // torso: la proyección frontal se queda con el vientre del pez y la aleta
    // desaparece por completo. Se dibuja asomando por un flanco —base ancha
    // pegada al cuerpo, punta arriba—, que es como cualquier sprite 2D resuelve
    // un tiburón visto de frente.
    box(m, ...rx(lado, x0 - 1, x0 + 1), y - 1, y, z - 1, z + 1, c);
    for (let t = 0; t <= s; t++) {
      const xB = x0 + Math.max(0, s - t);
      box(m, ...rx(lado, x0, xB), y + t, y + t, z - 1, z + 1, t === s && color2 ? color2 : c);
    }
  } else if (parte === 'caudal') {
    let prev = null;
    for (let t = 0; t <= s; t++) {
      const zz = z - t;
      box(m, -t - 1, t + 1, y - Math.round(t * 0.8), y + Math.round(t * 0.8), zz, prev === null ? zz : Math.min(zz, prev), t === s && color2 ? color2 : c);
      prev = zz;
    }
  } else if (parte === 'pectoral') {
    mirror(side => box(m, ...rx(side, x0, x0 + s), y - Math.round(s / 2), y, z, z + 1, c));
  }
  return m;
}

/** Caparazón / concha: domo ancho con borde oscuro abajo. */
export function caparazon(m, c, { y, z, rx: a = 5, ry: b = 3, rz: d = 4, borde }) {
  ellipsoid(m, 0, y, z, a, b, d, c, 2);
  if (borde) recolor(m, (x, yy, zz, cur) => cur === c && yy <= y - b + 2, borde);
  return m;
}

/** Antena: tallo que sube curvándose hacia afuera, con knob si `bola`. */
export function antena(m, c, { side, x0, y, z = 0, len = 4, curva = 1, bola = false }) {
  let prev = null;
  for (let t = 0; t <= len; t++) {
    const px = side * (x0 + Math.round(curva * t * 0.55));
    const py = y + t;
    prev = trazar(m, c, prev, px, py, z);
    if (bola && t === len) box(m, px - 1, px + 1, py, py + 1, z, z, c);
  }
  return m;
}

/** Pata de insecto: sale del flanco, se quiebra y baja hasta el suelo. */
export function pataInsecto(m, c, { x0, y, z, largo = 3, bajada = 3 }) {
  mirror(side => {
    let prev = null;
    for (let t = 0; t <= largo; t++)
      prev = trazar(m, c, prev, side * (x0 + t), y - Math.round(t * 0.4), z);
    for (let t = 1; t <= bajada; t++)
      prev = trazar(m, c, prev, side * (x0 + largo), y - Math.round(largo * 0.4) - t, z);
  });
  return m;
}

/** Tentáculo: cadena que cuelga del manto curvándose hacia afuera. */
export function tentaculo(m, c, { side, x0, y, z, len = 5, deriva = 0.5, g = 1 }) {
  let prev = null;
  for (let t = 0; t < len; t++) {
    const px = side * (x0 + Math.round(deriva * t));
    const py = y - t;
    const zz = z - Math.round(t * 0.2);
    for (let dx = 0; dx < g; dx++) {
      const q = px + side * dx;
      put(m, q, py, zz, c);
      if (prev !== null) for (let yy = Math.min(py, prev); yy <= Math.max(py, prev); yy++) put(m, q, yy, zz, c);
    }
    prev = py;
  }
  return m;
}

/**
 * Lengua bífida: tallo que nace en el centro del cráneo (invisible, tapado por
 * la propia cabeza) y desciende avanzando en +Z, de modo que al salir bajo la
 * barbilla ya es el vóxel más cercano de su columna y el 2.5D lo muestra. La
 * rampa rellena el tramo Z de cada fila para conservar la vecindad de 6.
 */
export function lengua(m, c, { y0, y1, z0, z1, ancho = 2 }) {
  const n = Math.max(1, y0 - y1);
  let prevZ = null;
  for (let t = 0; t <= n; t++) {
    const y = y0 - t;
    const z = Math.round(z0 + (z1 - z0) * (t / n));
    const lo = prevZ === null ? z : Math.min(z, prevZ);
    const hi = prevZ === null ? z : Math.max(z, prevZ);
    for (let zz = lo; zz <= hi; zz++) put(m, 0, y, zz, c);
    prevZ = z;
  }
  for (const dx of [-1, 1]) {
    put(m, dx, y1, prevZ, c);
    put(m, dx, y1 - 1, prevZ, c);
    put(m, dx * ancho, y1 - 1, prevZ, c);
  }
  return m;
}

/** Bigotes: hilos que salen de las mejillas. Se leen perfecto de frente. */
export function bigotes(m, c, { y, x0, z, n = 3, largo = 3 }) {
  mirror(side => {
    for (let i = 0; i < n; i++) {
      const dy = i - Math.floor(n / 2);
      let prev = null;
      for (let t = 0; t <= largo; t++)
        prev = trazar(m, c, prev, side * (x0 + t), y + dy + Math.round(dy * t * 0.25), z);
    }
  });
  return m;
}

/** Ojos saltones de rana o cangrejo: esfera sobre el cráneo + pupila coplanar. */
export function ojosSaltones(m, c, { y, z, x0, r = 1.6, pupila, brillo }) {
  mirror(side => {
    ellipsoid(m, side * x0, y, z, r, r, r, c, 2);
    if (pupila !== undefined) {
      paintFront(m, side * x0, y, pupila);
      paintFront(m, side * (x0 + 1), y, pupila);
      if (brillo) paintFront(m, side * (x0 + 1), y + 1, brillo);
    }
  });
  return m;
}

/** Manchas: recolorea voxels dentro de discos (pelaje, atigrado). */
export function manchas(m, c, lista) {
  for (const s of lista) {
    const [cx, cy, r] = Array.isArray(s) ? s : [s.x, s.y, s.r];
    recolor(m, (x, y, z, cur) => cur !== c && (x - cx) ** 2 + (y - cy) ** 2 <= r * r, c);
  }
  return m;
}

/** Franjas: bandas verticales pintadas en el plano frontal. */
export function franjas(m, c, { y0, y1, xs }) {
  for (const x of xs) for (let y = y0; y <= y1; y++) paintFront(m, x, y, c);
  return m;
}

/** Bandas horizontales de cuerpo completo (abeja, anguila, mapache). */
export function bandas(m, c, { y0, y1, ancho = 2, paso = 4 }) {
  recolor(m, (x, y) => y >= y0 && y <= y1 && ((y - y0) % paso) < ancho, c);
  return m;
}

export { box, ellipsoid, put, paintFront, recolor, rx };
