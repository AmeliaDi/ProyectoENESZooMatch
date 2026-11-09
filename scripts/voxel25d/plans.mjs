/**
 * Planos corporales, uno por familia_sprite de data/arquetipos.json.
 *
 * Todos comparten el NÚCLEO DE RETRATO (parts.mjs): cabeza grande de frente,
 * cuerpo pequeño debajo y atrás. La razón es geométrica — el 2.5D es la
 * proyección sobre XY, así que ningún detalle que apunte hacia la cámara se ve.
 * Cada familia pone su señal donde el ojo la capta: arriba, a los lados, o
 * colgando de la cara.
 *
 * P = parámetros de la especie · C = colores de campo.
 */

import { put, box, ellipsoid, recolor, paintFront, parse } from './voxel.mjs';
import {
  masa, retrato, cara, rubor, colgar, morro, oreja, cresta, espinas, cuernos,
  chapeton, ala, cola, patas, pataAve, aleta, caparazon, antena, pataInsecto,
  tentaculo, bigotes, ojosSaltones, manchas, franjas, bandas, cuello, lengua,
  mirror, rx,
} from './parts.mjs';

const M = () => new Map();
const OJO = 0x24202f, BOCA = 0x5b3348, BRILLO = 0xffffff, TINTA = 0x2b1f2c;

/** Luminancia relativa Rec.709, en [0,1]. */
function lum(c) {
  return (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255;
}

function mezclar(a, b, k) {
  const ch = (v, s) => (v >> s) & 255;
  const q = s => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * k);
  return (q(16) << 16) | (q(8) << 8) | q(0);
}

/**
 * Contraste mínimo entre una pieza y el fondo sobre el que se proyecta. El 2.5D
 * aplasta la profundidad: un pico negro sobre cabeza negra no es un pico, es una
 * mancha. Si la luminancia difiere menos de `umbral` movemos la pieza al lado
 * opuesto del fondo respecto del gris medio (plumaje oscuro → pico de queratina
 * pálido; plumaje pálido → pico oscuro), que es la relación que da la naturaleza.
 */
function separar(c, base, umbral = 0.16) {
  if (c === undefined || base === undefined) return c;
  const lb = lum(base);
  const meta = lb <= 0.5 ? 0xffffff : 0x000000;
  let out = c, n = 0;
  while (Math.abs(lum(out) - lb) < umbral && n++ < 40) out = mezclar(out, meta, 1 / 12);
  return out;
}

/** Retrato base + cara canónica + rubor. Devuelve el marco para colgar piezas. */
function faz(P, C) {
  const m = M();
  const { s, cab, tor, ySuelo } = retrato(m, P, C);
  const marco = {
    m, s, cab, tor, ySuelo,
    arriba: Math.round(cab.cy + cab.ry),
    frente: Math.round(cab.cz + cab.rz),
    bocaY: Math.round(cab.cy + (P.bocaDY ?? -2.6) * s),
    ojoY: Math.round(cab.cy + (P.ojoDY ?? 1.1) * s),
    ojoX: Math.round(cab.rx * (P.ojoDX ?? 0.42)),
  };
  return marco;
}

/** Ojos, brillo, boca y rubor en las filas canónicas. Siempre al final. */
function rostro(F, P, C) {
  cara(F.m, C.ojo ?? OJO, {
    y: F.ojoY, x: F.ojoX, w: P.ojoW ?? 2, h: P.ojoH ?? 2,
    brillo: C.brillo ?? BRILLO,
    boca: C.boca ?? (P.boca === false ? null : BOCA),
    bocaY: P.bocaY !== undefined ? Math.round(P.bocaY * F.s) : F.bocaY,
    nariz: C.nariz, ceja: C.ceja,
  });
  if (P.rubor) rubor(F.m, C.rubor ?? 0xff93ae, { y: Math.round(F.cab.cy - 2.8 * F.s), x: Math.round(F.cab.rx * 0.86) });
  return F.m;
}

/* ============================== AVES ============================== */
/* Pico colgando del centro de la cara, alas como chapetones en el flanco del
   cuerpo, cola de plumas cerrando abajo y crestas arriba. Eso es lo que hace
   "ave" a un ave desde el frente. */
function ave(P, C) {
  const F = faz({ cabezaRx: 4.4, cabezaRy: 4.0, cuerpoRx: 3.4, ...P }, C);
  const { m, s, cab, tor, ySuelo } = F;

  if (P.cresta) cresta(m, C.cresta ?? C.acento ?? C.cuerpo, {
    y: F.arriba - 1, z: Math.round(cab.cz + 1), n: P.cresta.n, alto: Math.round((P.cresta.alto ?? 3) * s),
    w: P.cresta.w ?? 1, lado: P.cresta.lado ?? 0, paso: P.cresta.paso ?? 2, color2: C.punta,
  });
  if (P.mechones) mirror(side => oreja(m, C.mechon ?? C.acento ?? C.cuerpo, {
    side, x0: Math.round(cab.rx * 0.62), y: Math.round(cab.cy + cab.ry * 0.5), z: Math.round(cab.cz),
    w: 3, h: Math.round((P.mechones.h ?? 3) * s), forma: 'mechon',
  }));
  if (P.ojeras) mirror(side => {
    const cx = F.ojoX + (P.ojoW ?? 2) / 2, cy = F.ojoY + (P.ojoH ?? 2) / 2;
    ellipsoid(m, side * cx, cy, Math.round(cab.cz + cab.rz * 0.55), (P.ojoW ?? 2) * 1.4, (P.ojoH ?? 2) * 1.4, 1.2, C.ojera ?? C.acento, 2);
  });

  // El pico nace dentro de la cara y cuelga: len largo + curva alta = tucán.
  // Cuelga UN VÓXEL POR DELANTE de la superficie del cráneo: la proyección
  // frontal conserva el z máximo de cada columna, así que un pico dibujado a
  // z = frente-2 queda tapado por la propia cara y el ave sale sin boca.
  const fondo = C.cabeza ?? C.cuerpo;
  const picoC = separar(C.pico ?? C.acento ?? fondo, fondo);
  colgar(m, picoC, {
    y: F.bocaY + 1, z: F.frente + 1,
    len: Math.round((P.pico ?? 2.2) * s), w: Math.round((P.picoAncho ?? 2.4) * s),
    h: Math.round((P.picoAlto ?? 1.2) * s), curva: P.picoCurva ?? 0.45,
    afilado: P.picoAfilado ?? 0.6, color2: C.picoPunta,
  });
  if (P.picoBajo) morro(m, C.picoPunta ?? picoC ?? C.acento ?? TINTA, { y: F.bocaY - Math.round((P.pico ?? 2) * s * (P.picoCurva ?? 0.45)), w: 0 });

  const xAla = Math.round(tor.rx) - 1;
  const zAla = Math.round(tor.cz + tor.rz) + 1;
  if (P.flipper) mirror(side => chapeton(m, separar(C.alas ?? C.acento ?? C.cuerpo, C.cuerpo, 0.12), {
    side, x0: xAla, y: Math.round(tor.cy + tor.ry * 0.7), z0: Math.round(tor.cz) - 1, z1: zAla,
    h: Math.round(3.4 * s), w: 2, abajo: Math.round(1 * s), punta: C.punta,
  }));
  else if (P.alas !== false) mirror(side => chapeton(m, separar(C.alas ?? C.acento ?? C.cuerpo, C.cuerpo, 0.12), {
    side, x0: xAla, y: Math.round(tor.cy + tor.ry * 0.8), z0: Math.round(tor.cz - tor.rz) + 1, z1: zAla,
    h: Math.round(3.2 * s), w: 2, punta: C.punta,
  }));
  if (P.alasExtendidas) mirror(side => ala(m, C.alas ?? C.acento ?? C.cuerpo, {
    side, x0: xAla, y: Math.round(tor.cy + tor.ry * 0.3), z: Math.round(tor.cz), w: Math.round((P.alasAncho ?? 5) * s),
    h: Math.round((P.alasAlto ?? 2) * s), forma: P.alasForma ?? 'ovalada', d: 2,
    veta: C.veta ?? separar(C.alas ?? C.acento ?? C.cuerpo, C.cuerpo, 0.2),
  }));

  if (P.colaTipo !== null) cola(m, separar(C.cola ?? C.alas ?? C.acento ?? C.cuerpo, C.cuerpo, 0.12), {
    tipo: P.colaTipo ?? 'plumas', x0: 0, y: Math.round(tor.cy - tor.ry * 0.5),
    z: Math.round(tor.cz + tor.rz) + 1,
    len: Math.round((P.colaLargo ?? 3) * s), w: Math.round((P.colaAncho ?? 2.4) * s), h: 2, color2: C.punta,
  });

  if (P.cuello) cuello(m, C.cuello ?? C.cuerpo, { tor, cab, s, largo: P.cuello, g: P.cuelloGrueso ?? 1, curva: P.cuelloCurva ?? 0 });

  const zPata = Math.round(tor.cz + tor.rz) - 1;
  if (P.patasLargas) mirror(side => pataAve(m, C.patas ?? C.acento ?? TINTA, {
    x0: Math.round(tor.rx * 0.45), y: Math.round(tor.cy - tor.ry * 0.4), ySuelo: Math.round(ySuelo - (P.patasLargas * s)),
    z: zPata, dedo: 2,
  }));
  else if (P.patas !== false) mirror(side => pataAve(m, C.patas ?? C.acento ?? TINTA, {
    x0: Math.round(tor.rx * 0.4), y: Math.round(tor.cy - tor.ry * 0.4), ySuelo, z: zPata, dedo: P.dedos ?? 2,
  }));

  if (P.pecho) recolor(m, (x, y, z, cur) => cur === C.cuerpo && y <= Math.round(tor.cy + tor.ry * 0.6) && z >= Math.round(tor.cz), C.pecho);
  if (P.garganta) recolor(m, (x, y, z, cur) => cur === (C.cabeza ?? C.cuerpo) && y <= Math.round(cab.cy - cab.ry * 0.45) && z >= Math.round(cab.cz + cab.rz * 0.4), C.garganta ?? C.pecho);
  if (P.manchas) manchas(m, C.mancha ?? C.acento, P.manchas);
  // Un ave no sonríe: la boquita canónica se comería el pico. Salvo que la
  // especie pida boca explícitamente (pingüino con garganta, garza con grito).
  return rostro(F, { boca: false, ...P }, C);
}

/* ============================ MAMÍFEROS =========================== */
/* Hocico colgando del centro, orejas arriba-afuera, cola colgando de un lado.
   Lo que separa felino de canino de oso es la forma de la oreja y la talla del
   hocico, igual que en las plantillas 16×16. */
function mamifero(P, C) {
  const F = faz(P, C);
  const { m, s, cab, tor, ySuelo } = F;

  if (P.orejas) mirror(side => oreja(m, C.orejas ?? C.cuerpo, {
    side, x0: Math.round(cab.rx) - Math.round((P.orejas.w ?? 2) / 2) - 1,
    y: Math.round(cab.cy + cab.ry * (P.orejas.dentro ?? 0.55)), z: Math.round(cab.cz) - 1,
    w: P.orejas.w ?? 2, h: Math.round((P.orejas.h ?? 3) * s), forma: P.orejas.forma ?? 'redonda',
    incl: P.orejas.incl ?? 1, relleno: P.orejas.relleno ? C.orejaInt : undefined,
  }));
  if (P.cuernos) cuernos(m, C.cuernos ?? 0xb9a17a, {
    x0: Math.round(cab.rx * 0.5), y: Math.round(cab.cy + cab.ry * 0.75), z: Math.round(cab.cz),
    h: Math.round(P.cuernos.h * s), incl: P.cuernos.incl ?? 1, g: P.cuernos.g ?? 1,
    ramas: P.cuernos.ramas ?? 2, color2: C.cuernosPunta,
  });
  if (P.casco) {
    const xw = Math.round((P.cascoAncho ?? 1.4) * s);
    for (let t = 0; t <= Math.round(P.casco * s); t++)
      box(m, -xw, xw, Math.round(cab.cy + cab.ry * 0.75) + t, Math.round(cab.cy + cab.ry * 0.75) + t,
        Math.round(cab.cz - cab.rz * 0.4) - t, Math.round(cab.cz - cab.rz * 0.4) - t + 1, C.casco ?? C.cabeza ?? C.cuerpo);
  }
  if (P.espinas) espinas(m, C.espina ?? C.acento ?? C.cuerpo, {
    y: F.arriba, z: Math.round(cab.cz - cab.rz * 0.5), xs: P.espinas, h: Math.round((P.espinaAlto ?? 2) * s), w: P.espinaAncho ?? 1,
  });

  if (P.cuello) cuello(m, C.cuello ?? C.cabeza ?? C.cuerpo, {
    tor, cab, s, largo: P.cuello, g: P.cuelloGrueso ?? 1, curva: P.cuelloCurva ?? 0,
  });

  // La melena es un anillo MÁS ANCHO que la cabeza pero MÁS BAJO en Z: en la
  // proyección frontal tapa el halo exterior y deja la cara limpia.
  if (P.melena) masa(m, C.melena ?? C.acento ?? C.cuerpo, {
    cy: cab.cy - 0.2 * s, cz: cab.cz - 0.9 * s,
    rx: cab.rx + 1.9 * P.melena * s, ry: cab.ry + 1.5 * P.melena * s,
    rz: Math.max(1.2, cab.rz - 0.9 * s), p: 2,
  });

  if (P.hocico) {
    // Hocico UN VÓXEL POR DELANTE del plano frontal del cráneo: la proyección
    // conserva el z máximo de cada columna, así que dibujado a frente-2 quedaba
    // tapado por la propia cara y todos los mamíferos salían sin morro.
    colgar(m, separar(C.hocico ?? C.cabeza ?? C.cuerpo, C.cabeza ?? C.cuerpo), {
      y: F.bocaY + 1, z: F.frente + 1,
      len: Math.round(P.hocico * s), w: Math.round((P.hocicoAncho ?? 2.2) * s),
      h: Math.round((P.hocicoAlto ?? 1.4) * s), curva: P.hocicoCurva ?? 0.5,
      afilado: P.hocicoAfilado ?? 0.45, color2: C.hocicoPunta,
    });
    if (P.dientes) for (const dx of [-1, 1])
      box(m, dx * P.dientes, dx * P.dientes, F.bocaY - Math.round(P.dientesBaja ?? 1), F.bocaY - Math.round(P.dientesBaja ?? 1),
        F.frente, F.frente + 1, C.diente ?? 0xf5f0e6);
  }
  if (P.bigotes) bigotes(m, C.bigote ?? 0xf6efdd, {
    y: F.bocaY, x0: Math.round(cab.rx * 0.8), z: F.frente + 1,
    n: P.bigotes.n ?? 3, largo: Math.round((P.bigotes.largo ?? 3) * s),
  });

  const xCola = Math.round(tor.rx) - 1;
  if (P.cola) cola(m, C.cola ?? C.cuerpo, {
    tipo: P.cola.tipo, x0: xCola, y: Math.round(tor.cy + tor.ry * (P.cola.alto ?? 0.5)),
    z: Math.round(tor.cz - tor.rz) + 1, len: Math.round(P.cola.len * s),
    w: Math.round((P.cola.ancho ?? 1.8) * s), h: P.cola.altovox ?? 2,
    color2: C.colaPunta, lado: P.cola.lado ?? 1, curva: P.cola.curva ?? 0.8,
  });

  patas(m, C.patas ?? C.cuerpo, {
    tor, ySuelo, n: P.patas ?? 4, g: P.pataGruesa ? 3 : 2,
    pezuña: C.pezuña ?? (P.pezuñas ? C.nariz ?? TINTA : undefined), dedo: P.dedos,
  });

  // Patas saltadoras (canguro, liebre): dos palancas en la fila del suelo, más
  // anchas que la caña y por delante de ella. Sin ese bloque el saltador es un
  // roedor de pie fino.
  if (P.patasSaltadoras) {
    const zf = Math.round(tor.cz + tor.rz) + 1;
    const g = P.pataGruesa ? 3 : 2;
    const a = Math.max(1, Math.round(tor.rx * 0.42));
    const c = C.patas ?? C.cuerpo;
    mirror(side => box(m, ...rx(side, a - 1, a + g + 1), ySuelo, ySuelo + Math.max(1, Math.round(1.2 * s)), zf - 1, zf + 1, c));
  }

  if (P.ventral) recolor(m, (x, y, z, cur) => cur === C.cuerpo && z >= Math.round(tor.cz + tor.rz * 0.45) && y <= Math.round(tor.cy + tor.ry * 0.4), C.ventral);
  if (P.pecho) recolor(m, (x, y, z, cur) => cur === C.cuerpo && y <= Math.round(tor.cy + tor.ry * 0.5) && z >= Math.round(tor.cz), C.pecho);
  if (P.manchas) manchas(m, C.mancha ?? C.acento, P.manchas);
  if (P.franjas) franjas(m, C.franja ?? C.mancha ?? TINTA, P.franjas);
  if (P.bandas) bandas(m, C.banda ?? C.mancha ?? TINTA, { y0: Math.round(tor.cy - tor.ry), y1: Math.round(tor.cy + tor.ry), ...P.bandas });
  return rostro(F, P, C);
}

const felino = (P, C) => mamifero({
  cabezaRx: 4.5, cabezaRy: 4.0, hocico: 1.8, hocicoAncho: 2.0, hocicoAlto: 1.2, hocicoCurva: 0.35,
  orejas: { forma: 'puntiaguda', h: 3, w: 3, relleno: true }, cola: { tipo: 'larga', len: 6, ancho: 1.6 },
  patas: 4, rubor: true, boca: false, ...P,
}, C);

const canino = (P, C) => mamifero({
  cabezaRx: 4.4, cabezaRy: 4.0, hocico: 3.0, hocicoAncho: 2.0, hocicoAlto: 1.4, hocicoCurva: 0.4, hocicoAfilado: 0.7,
  orejas: { forma: 'puntiaguda', h: 3.4, w: 2, incl: 0.6 }, cola: { tipo: 'larga', len: 5, ancho: 2.2 },
  patas: 4, rubor: true, boca: false, ...P,
}, C);

const oso = (P, C) => mamifero({
  cabezaRx: 5.0, cabezaRy: 4.2, cuerpoRx: 4.4, cuerpoRy: 3.8, hocico: 2.0, hocicoAncho: 2.6, hocicoAlto: 1.6, hocicoCurva: 0.3,
  orejas: { forma: 'redonda', h: 3, w: 3, relleno: true, dentro: 0.7 }, pataGruesa: true,
  cola: { tipo: 'pene', len: 1, ancho: 2, altovox: 2 }, patas: 4, rubor: true, boca: false, ...P,
}, C);

const roedor = (P, C) => mamifero({
  cabezaRx: 4.4, cabezaRy: 4.2, hocico: 1.6, hocicoAncho: 1.8, hocicoAlto: 1.2, hocicoCurva: 0.3,
  orejas: { forma: 'redonda', h: 3, w: 3, relleno: true }, cola: { tipo: 'esponjosa', len: 4, ancho: 2 },
  patas: 4, dientes: 1, dientesBaja: 1, rubor: true, boca: false, ...P,
}, C);

const ungulado = (P, C) => mamifero({
  cabezaRx: 3.8, cabezaRy: 4.4, cabezaY: 3.6, hocico: 3.4, hocicoAncho: 2.0, hocicoAlto: 1.6, hocicoCurva: 0.75, hocicoAfilado: 0.3,
  orejas: { forma: 'puntiaguda', h: 2.6, w: 2, incl: 2.2 }, cola: { tipo: 'larga', len: 4, ancho: 1.2 },
  patas: 4, pataGruesa: false, pezuñas: true, ySuelo: -11, cuerpoRx: 3.6, rubor: false, boca: false, ...P,
}, C);

/* ============================= ANFIBIOS =========================== */
/* El ajolote: branquias en abanico a los lados (se ven de frente, son la señal).
   La rana: ojos saltones sobre el cráneo y sonrisa anchoa. */
function branquias(m, C, F, P) {
  const n = P.branquias ?? 5;
  const z0 = Math.round(F.cab.cz);
  mirror(side => {
    for (const st of [{ dy: 1, dz: 2 }, { dy: 0, dz: 0 }, { dy: -1, dz: -2 }]) {
      let prev = null;
      for (let t = 0; t < n; t++) {
        const x = Math.round(F.cab.rx) - 1 + t;
        const y = Math.round(F.cab.cy + st.dy * 1.4) + Math.round((st.dy * t) / Math.max(1, n - 1));
        const zz = z0 + st.dz;
        const lo = prev === null ? y : Math.min(y, prev), hi = prev === null ? y : Math.max(y, prev);
        for (let yy = lo; yy <= hi; yy++) put(m, side * x, yy, zz, t === n - 1 ? C.branquiaHi ?? C.branquia : C.branquia);
        prev = y;
      }
    }
  });
}

function anfibio(P, C) {
  const F = faz({ cabezaRx: 5.0, cabezaRy: 3.8, cabezaY: 3.2, cuerpoRx: 3.4, bocaDY: -2.2, ...P }, C);
  const { m, s, cab, tor } = F;
  if (P.branquias) branquias(m, C, F, P);
  if (P.ojosSaltones) ojosSaltones(m, C.parpado ?? C.cabeza ?? C.cuerpo, {
    y: Math.round(cab.cy + cab.ry * 0.72), z: Math.round(cab.cz + cab.rz * 0.3),
    x0: Math.round(cab.rx * 0.5), r: (P.ojosR ?? 1.8) * s, pupila: C.ojo ?? OJO, brillo: C.brillo ?? BRILLO,
  });
  if (P.lomo) recolor(m, (x, y, z, cur) => cur === C.cuerpo && z <= Math.round(tor.cz - tor.rz * 0.4), C.lomo);
  if (P.manchas) manchas(m, C.mancha ?? C.branquia, P.manchas);
  patas(m, C.patas ?? C.hocico ?? C.cuerpo, { tor, ySuelo: F.ySuelo, n: 4, g: 2, dedo: P.dedos });
  return rostro(F, { boca: true, ojoW: P.ojoW ?? 2, ...P }, { ...C, boca: C.boca ?? BOCA });
}

/* ============================= REPTILES =========================== */
/* Cabeza triangular ancha,crestas de escamas arriba y hocico ancho y corto. */
function reptil(P, C) {
  const F = faz({ cabezaRx: 4.8, cabezaRy: 3.6, cabezaP: 3, cuerpoRx: 3.6, bocaDY: -2.2, ...P }, C);
  const { m, s, cab, tor } = F;
  if (P.espinas) espinas(m, C.espina ?? C.acento ?? C.cuerpo, {
    y: Math.round(cab.cy + cab.ry * 0.8), z: Math.round(cab.cz - cab.rz * 0.5),
    xs: P.espinas, h: Math.round((P.espinaAlto ?? 2) * s), w: P.espinaAncho ?? 2,
  });
  if (P.casco) {
    const xw = Math.round((P.cascoAncho ?? 1.6) * s);
    for (let t = 0; t <= Math.round(P.casco * s); t++)
      box(m, -xw, xw, Math.round(cab.cy + cab.ry * 0.7) + t, Math.round(cab.cy + cab.ry * 0.7) + t,
        Math.round(cab.cz - cab.rz * 0.5) - t, Math.round(cab.cz - cab.rz * 0.5) - t + 1, C.casco ?? C.cabeza ?? C.cuerpo);
  }
  if (P.ojosSaltones) ojosSaltones(m, C.parpado ?? C.cabeza ?? C.cuerpo, {
    y: Math.round(cab.cy + cab.ry * 0.62), z: Math.round(cab.cz + cab.rz * 0.35),
    x0: Math.round(cab.rx * (P.ojosX ?? 0.48)), r: (P.ojosR ?? 1.7) * s,
    pupila: C.ojo ?? OJO, brillo: C.brillo ?? BRILLO,
  });
  if (P.hocico) colgar(m, separar(C.hocico ?? C.cabeza ?? C.cuerpo, C.cabeza ?? C.cuerpo), {
    y: F.bocaY + 1, z: F.frente + 1, len: Math.round(P.hocico * s),
    w: Math.round((P.hocicoAncho ?? 3.2) * s), h: Math.round((P.hocicoAlto ?? 1.4) * s),
    curva: P.hocicoCurva ?? 0.35, afilado: P.hocicoAfilado ?? 0.25, color2: C.hocicoPunta,
  });
  if (P.lengua) lengua(m, C.lengua ?? 0xd2415f, {
    y0: Math.round(cab.cy), y1: F.bocaY - Math.round(P.lengua * s) - 1,
    z0: Math.round(cab.cz), z1: F.frente + 2,
  });
  if (P.dientes) for (let i = 0; i < P.dientes; i++)
    box(m, -P.dientes + i * 2, -P.dientes + i * 2, F.bocaY - 2, F.bocaY - 1, F.frente, F.frente + 1, C.diente ?? 0xf5f0e6);
  if (P.cola) cola(m, C.cola ?? C.cuerpo, {
    tipo: P.cola.tipo ?? 'larga', x0: Math.round(tor.rx) - 1, y: Math.round(tor.cy - tor.ry * 0.3),
    z: Math.round(tor.cz - tor.rz) + 1, len: Math.round(P.cola.len * s), w: P.cola.ancho ?? 1.8,
    h: 2, lado: P.cola.lado ?? 1, curva: P.cola.curva ?? 0.9, color2: C.colaPunta,
  });
  if (P.escamas) recolor(m, (x, y, z, cur) => cur === C.cuerpo && ((x + y * 2) % 3 === 0), C.mancha ?? C.acento);
  if (P.manchas) manchas(m, C.mancha ?? C.acento, P.manchas);
  patas(m, C.patas ?? C.cuerpo, { tor, ySuelo: F.ySuelo, n: 4, g: 2, dedo: P.dedos });
  return rostro(F, { ojoW: 2, ojoH: 2, boca: true, ...P }, C);
}

/* Tortuga: el caparazón manda en la silueta; cabeza arriba, 4 patas alrededor. */
function tortuga(P, C) {
  const m = M();
  const s = P.s ?? 1;
  const a = Math.round(5.2 * s), b = Math.round(3.2 * s);
  caparazon(m, C.caparazon, { y: Math.round(-3.4 * s), z: Math.round(-1 * s), rx: a, ry: b, rz: Math.round(4.2 * s), borde: C.borde });
  if (P.domos) {
    for (const [dx, dy] of [[-2, 0], [0, 0], [2, 0], [-1, 1], [1, 1]])
      masa(m, C.domos ?? C.caparazon, { cx: dx * 2, cy: Math.round(-3.4 * s) + b - 1 + dy, cz: Math.round(-1 * s), rx: 1.6, ry: 1.2, rz: 1.8, p: 2 });
    recolor(m, (x, y, z, cur) => cur === C.domos && z >= Math.round(-1 * s), C.domos);
  }
  const cabY = Math.round(1.4 * s);
  masa(m, C.cabeza, { cy: cabY, cz: Math.round(2.4 * s), rx: 2.4 * s, ry: 2.4 * s, rz: 2.4 * s, p: 3 });
  colgar(m, C.cabeza, { y: cabY - 1, z: Math.round(4 * s), len: Math.round(1.8 * s), w: Math.round(1.6 * s), h: 1, curva: 0.4, afilado: 0.5 });
  mirror(side => {
    for (const zz of [1, -1])
      ellipsoid(m, side * Math.round(4 * s), Math.round(-5.6 * s), zz * Math.round(2 * s), 1.8 * s, 1.4 * s, 1.6 * s, C.patas ?? C.cabeza, 2);
  });
  cara(m, C.ojo ?? OJO, { y: cabY + 1, x: Math.round(1.2 * s), w: 1, h: 1, brillo: C.brillo ?? BRILLO });
  if (P.manchas) manchas(m, C.mancha ?? C.borde, P.manchas);
  return m;
}

/* Cocodrilo: morro largo que cuelga con dientes, ojos arriba del todo. */
function cocodrilo(P, C) {
  const m = M();
  const s = P.s ?? 1;
  const cabY = Math.round(1.6 * s);
  masa(m, C.cabeza ?? C.cuerpo, { cy: cabY, cz: Math.round(1.6 * s), rx: 4.4 * s, ry: 3.0 * s, rz: 3.2 * s, p: 3 });
  masa(m, C.cuerpo, { cy: Math.round(-6 * s), cz: Math.round(-1.4 * s), rx: 3.8 * s, ry: 3.6 * s, rz: 3.4 * s, p: 3 });
  // maxilar superior y mandíbula: dos placas que cuelgan del frente
  colgar(m, C.hocico ?? C.cabeza ?? C.cuerpo, { y: cabY - 1, z: Math.round(4 * s), len: Math.round(4.4 * s), w: Math.round(2.6 * s), h: 2, curva: 0.5, afilado: 0.2 });
  colgar(m, C.mandibula ?? 0xd8d2a8, { y: cabY - 3, z: Math.round(3.6 * s), len: Math.round(3.6 * s), w: Math.round(2.2 * s), h: 1, curva: 0.5, afilado: 0.2 });
  for (let t = 0; t < 4; t++) {
    const y = cabY - 2 - Math.round(t * 0.5);
    box(m, -2, 2, y, y, Math.round(4 * s) + t, Math.round(4 * s) + t, C.diente ?? 0xf5f0e6);
  }
  espinas(m, C.espina ?? 0xb9a17a, { y: Math.round(cabY + 2.4 * s), z: Math.round(0 * s), xs: [-3, -1, 1, 3], h: 2, w: 2 });
  ojosSaltones(m, C.cabeza ?? C.cuerpo, { y: Math.round(cabY + 2.6 * s), z: Math.round(3 * s), x0: Math.round(2.4 * s), r: 1.5 * s, pupila: C.ojo ?? OJO, brillo: C.brillo ?? BRILLO });
  mirror(side => ellipsoid(m, side * Math.round(4.4 * s), Math.round(-6.5 * s), Math.round(1.4 * s), 1.6 * s, 1.3 * s, 1.5 * s, C.patas ?? C.cuerpo, 2));
  cola(m, C.cola ?? C.cuerpo, { tipo: 'larga', x0: Math.round(3.4 * s), y: Math.round(-6 * s), z: Math.round(-4 * s), len: 5, w: 2, lado: 1, curva: 0.7 });
  cara(m, C.ojo ?? OJO, { y: Math.round(cabY + 2.2 * s), x: Math.round(2.4 * s), w: 1, h: 1, brillo: C.brillo ?? BRILLO, boca: null });
  return m;
}

/* ============================== MARINOS ============================ */
/* Delfín/ballena de frente: melón arriba, cuerpo abajo, aleta dorsal asomando
   al lado, aletas pectorales a los lados y caudal abierto abajo. El surtidor
   remata la coronilla. */
function marino(P, C) {
  const F = faz({ cabezaRx: 4.6, cabezaRy: 4.0, cuerpoRx: 3.4, cuerpoRy: 4.4, ojoDY: 0.8, bocaDY: -2.4, ...P }, C);
  const { m, s, cab, tor, ySuelo } = F;
  if (P.pico) colgar(m, separar(C.hocico ?? C.acento ?? C.cuerpo, C.cabeza ?? C.cuerpo), {
    y: F.bocaY + 2, z: F.frente + 1, len: Math.round(P.pico * s), w: Math.round(2.6 * s), h: Math.round(1.6 * s),
    curva: 0.3, avance: 0.8, afilado: 0.6, color2: C.picoPunta,
  });
  if (P.chnouk) recolor(m, (x, y, z, cur) => cur === C.cuerpo && y <= Math.round(cab.cy - cab.ry * 0.5) && z >= Math.round(cab.cz + cab.rz * 0.5), C.boca ?? 0xfff0d6);
  if (P.surtidor) {
    const x0 = Math.round(0.5 * s);
    for (let t = 0; t <= Math.round((P.surtidor * s)); t++)
      box(m, x0 - Math.round(t * 0.3), x0 + 1 + Math.round(t * 0.3), F.arriba + t, F.arriba + t, Math.round(cab.cz), Math.round(cab.cz) + 1, C.surtidor ?? 0xbfd8ea);
  }
  aleta(m, separar(C.aleta ?? C.dorso ?? C.acento, C.cuerpo, 0.14), {
    parte: 'dorsal', x0: Math.round(tor.rx) - 1, y: Math.round(tor.cy + tor.ry * 0.6),
    z: Math.round(tor.cz + tor.rz) + 1, s: Math.round(2.4 * s),
  });
  mirror(side => aleta(m, separar(C.aleta ?? C.dorso ?? C.cuerpo, C.cuerpo, 0.14), { parte: 'pectoral', x0: Math.round(tor.rx) - 1, y: Math.round(tor.cy + tor.ry * 0.2), z: Math.round(tor.cz + tor.rz) + 1, s: Math.round(2.2 * s) }));
  if (P.caudal !== false) aleta(m, C.aleta ?? C.dorso ?? C.cuerpo, { parte: 'caudal', y: ySuelo + 1, z: Math.round(tor.cz - tor.rz) + 2, s: Math.round(2.6 * s), color2: C.aletaPunta });
  if (P.dorsalOscuro) recolor(m, (x, y, z, cur) => cur === C.cuerpo && z <= Math.round(tor.cz - tor.rz * 0.35), C.dorso ?? C.cuerpo);
  if (P.ventre) recolor(m, (x, y, z, cur) => cur === C.cuerpo && z >= Math.round(tor.cz + tor.rz * 0.35) && y <= Math.round(tor.cy + tor.ry * 0.3), C.ventre);
  if (P.manchas) manchas(m, C.mancha ?? 0xfff0d6, P.manchas);
  return rostro(F, { boca: true, ojoW: 2, ...P }, C);
}

/* ============================ ACUÁTICOS ============================ */
/* Pez de frente: cuerpo vertical, dorsal arriba, pectorales a los lados,
   caudal abierto abajo. Caballito: hocico tubular + corona + cola rizada.
   Manta: dos alas horizontales enormes. */
function acuatico(P, C) {
  if (P.forma === 'manta') {
    const m = M();
    const s = P.s ?? 1;
    mirror(side => {
      for (let t = 0; t <= Math.round(6 * s); t++) {
        const x = side * (Math.round(1 * s) + t);
        const h = Math.max(0, Math.round(2.6 * s - t * 0.35));
        box(m, x, x, -h, h, Math.round(-1.6 * s), Math.round(0.4 * s), C.cuerpo);
      }
      box(m, side * Math.round(7 * s), side * Math.round(7 * s), Math.round(-3 * s), Math.round(-1 * s), Math.round(-1 * s), Math.round(0 * s), C.acento);
    });
    masa(m, C.cuerpo, { cy: 0, cz: Math.round(1.4 * s), rx: 2.4 * s, ry: 2 * s, rz: 1.8 * s, p: 2 });
    box(m, -1, 1, Math.round(-4.5 * s), Math.round(-2 * s), Math.round(-1 * s), Math.round(0 * s), C.acento);
    cara(m, C.ojo ?? OJO, { y: Math.round(0.6 * s), x: Math.round(1.4 * s), w: 1, h: 1, brillo: C.brillo ?? BRILLO, boca: null });
    if (P.manchas) manchas(m, C.mancha ?? 0xfff0d6, P.manchas);
    return m;
  }
  const F = faz({ cabezaRx: 4.0, cabezaRy: 3.4, cuerpoRx: 3.2, cuerpoRy: 4.2, ojoDY: 0.9, bocaDY: -2.2, ...P }, C);
  const { m, s, cab, tor, ySuelo } = F;
  if (P.hocicoLargo) colgar(m, separar(C.hocico ?? C.acento ?? C.cuerpo, C.cabeza ?? C.cuerpo), {
    y: F.bocaY + 1, z: F.frente + 1, len: Math.round((P.hocicoLargo ?? 3) * s), w: Math.round(1.6 * s), h: Math.round(1 * s),
    curva: 0.15, avance: 0.9, afilado: 0.2,
  });
  if (P.corona) cresta(m, C.corona ?? C.acento, { y: F.arriba - 1, z: Math.round(cab.cz), n: 3, alto: Math.round(2 * s), w: 2, paso: 1 });
  if (P.dorsal !== false) aleta(m, separar(C.acento, C.cuerpo, 0.14), {
    parte: 'dorsal', x0: Math.round(tor.rx) - 1, y: Math.round(tor.cy + tor.ry * 0.7),
    z: Math.round(tor.cz + tor.rz) + 1, s: Math.round(2 * s),
  });
  mirror(side => aleta(m, C.acento, { parte: 'pectoral', x0: Math.round(tor.rx) - 1, y: Math.round(tor.cy), z: Math.round(tor.cz + tor.rz) + 1, s: Math.round(1.8 * s) }));
  if (P.caudal !== false) aleta(m, C.acento, { parte: 'caudal', y: ySuelo + 1, z: Math.round(tor.cz - tor.rz) + 1, s: Math.round(2.4 * s) });
  if (P.colaRizada) cola(m, C.acento ?? C.cuerpo, { tipo: 'rizada', x0: Math.round(tor.rx), y: ySuelo + 2, z: Math.round(tor.cz - tor.rz), len: 5, lado: 1, curva: 0.6 });
  if (P.ventosa) recolor(m, (x, y, z, cur) => cur === C.cuerpo && z >= Math.round(tor.cz + tor.rz * 0.4) && y <= Math.round(tor.cy + tor.ry * 0.2), C.ventre ?? 0xfff0d6);
  if (P.escamas) recolor(m, (x, y, z, cur) => cur === C.cuerpo && ((x + y) % 3 === 0) && z <= Math.round(tor.cz + tor.rz * 0.5), C.mancha ?? C.acento);
  if (P.franjas) franjas(m, C.franja ?? C.dorso ?? C.acento ?? C.mancha, P.franjas);
  if (P.manchas) manchas(m, C.mancha ?? C.acento, P.manchas);
  return rostro(F, { boca: true, ojoW: 2, ...P }, C);
}

/* ============================== INSECTOS =========================== */
/* Antenas arriba, alas a los lados (la señal más fuerte: mariposa = alas
   grandes, abeja = dos pares chicas), seis patas colgando y abdomen abajo. */
function insecto(P, C) {
  // Pedíolo de himenóptero: con `cintura` el puente cervical se estrecha a un
  // vóxel y se oscurece, y se recorta la banda entre cráneo y abdomen. Cabeza-
  // tórax-abdomen es lo que separa una hormiga o una avispa de un escarabajo
  // pintado del mismo color.
  const cc = P.cintura ? { ...C, cuello: C.cuello ?? C.acento ?? TINTA } : C;
  const F = faz({
    cabezaRx: 3.4, cabezaRy: 3.2, cabezaY: 4.2, cuerpoRx: 3.0, cuerpoRy: 4.0, cuerpoY: -4.6,
    ojoDY: 0.6, ojoDX: 0.46, bocaDY: -2.2, cuelloAncho: P.cintura ? 0.3 : 1.0, ...P,
  }, cc);
  const { m, s, cab, tor, ySuelo } = F;
  if (P.cintura) {
    const g = Math.max(0, Math.round(0.3 * s));
    const yA = Math.floor(tor.cy + tor.ry), yB = Math.ceil(cab.cy - cab.ry);
    const lo = Math.min(yA, yB), hi = Math.max(yA, yB);
    for (const k of [...m.keys()]) {
      const [x, y] = parse(k);
      if (y >= lo && y <= hi && Math.abs(x) > g) m.delete(k);
    }
  }
  if (P.palas) mirror(side => masa(m, C.pala ?? C.acento ?? C.cuerpo, {
    cx: side * Math.round(3 * s), cy: Math.round(cab.cy - cab.ry * 0.4), cz: Math.round(cab.cz + cab.rz * 0.4),
    rx: 1.6 * s, ry: 2.2 * s, rz: 1.2 * s, p: 2,
  }));
  if (P.antenas) mirror(side => antena(m, C.antena ?? TINTA, {
    side, x0: Math.round(cab.rx * 0.4), y: Math.round(cab.cy + cab.ry * 0.8), z: Math.round(cab.cz + 1),
    len: Math.round(P.antenas * s), curva: P.antenasCurva ?? 1.4, bola: P.antenasBola,
  }));
  const xAla = Math.round(tor.rx) - 1;
  if (P.alas) {
    const pares = Array.isArray(P.alas) ? P.alas : [P.alas];
    pares.forEach((w, i) => mirror(side => ala(m, C.alas ?? 0xffc9dd, {
      side, x0: xAla, y: Math.round(tor.cy + tor.ry * 0.6 - i * (P.alasPaso ?? 2.4) * s),
      z: Math.round(tor.cz) - i, w: Math.round(w * s), h: Math.round((P.alasAlto ?? 2.6) * s),
      forma: P.alasForma ?? 'ovalada', d: 1, veta: C.veta,
    })));
  }
  if (P.patasInsecto !== false)
    for (let t = 0; t < (P.patasPares ?? 3); t++)
      pataInsecto(m, C.pata ?? TINTA, {
        x0: Math.round(tor.rx) - 1, y: Math.round(tor.cy + tor.ry * 0.2 - t * (P.patasPaso ?? 1.4) * s),
        z: Math.round(tor.cz + tor.rz) - 2, largo: Math.round((P.patasLargo ?? 2.4) * s),
        bajada: Math.round((P.patasBajada ?? 2) * s),
      });
  // Pata rapadora de mantis: coxa que abre más allá del flanco, fémur que sube
  // enmarcando la cabeza y tibia que dobla hacia abajo y afuera, formando la
  // zeta del rezo. Dibujada sobre el abdomen se leía como dos rayas, porque ahí
  // competía con el propio cuerpo; por fuera de la silueta se lee como brazo.
  if (P.patasRapaces) {
    const c = C.pala ?? C.acento ?? C.pata ?? TINTA;
    const zf = Math.round(tor.cz + tor.rz) + 2;
    mirror(side => {
      const xH = Math.round(tor.rx * 0.85), yH = Math.round(tor.cy + tor.ry * 0.85);
      const xC = xH + Math.max(1, Math.round((P.rapazAncho ?? 1.4) * s));
      const L = Math.max(2, Math.round((P.rapazLargo ?? 3.4) * s));
      let px = xH, py = yH;
      const cel = (x, y) => box(m, side * x, side * x, y, y, zf - 1, zf + 1, c);
      const ir = (nx, ny) => {
        for (let x = Math.min(px, nx); x <= Math.max(px, nx); x++) cel(x, py);
        for (let y = Math.min(py, ny); y <= Math.max(py, ny); y++) cel(nx, y);
        px = nx; py = ny;
      };
      cel(px, py);
      ir(xC, yH);
      ir(xC, yH + L);
      ir(xC + Math.max(1, Math.round(L * 0.5)), yH + L - Math.max(1, Math.round(L * 0.6)));
    });
  }

  // Fémur saltador de ortóptero (grillo, saltamontes): muslo grueso doblado
  // sobre el abdomen y tibia fina que baja al suelo. Sin ese bulto lateral los
  // dos bichos verdes son el mismo insecto.
  if (P.femures) {
    const c = C.femur ?? C.acento ?? C.pata ?? TINTA;
    const zf = Math.round(tor.cz + tor.rz) + 2;
    mirror(side => {
      const x0 = Math.round(tor.rx * 0.55);
      const y = Math.round(tor.cy + tor.ry * 0.1);
      const g = Math.max(1, Math.round(1.1 * s));
      const L = Math.max(2, Math.round((P.femurLargo ?? 2.8) * s));
      box(m, ...rx(side, x0, x0 + L), y - g, y + g, zf - 1, zf + 1, c);
      const xPata = side * (x0 + L);
      for (let t = 1; t <= g * 2 + 1; t++) put(m, xPata, y - g - t, zf, c);
    });
  }

  if (P.franjas) franjas(m, C.mancha ?? TINTA, P.franjas);
  if (P.bandas) bandas(m, C.mancha ?? TINTA, { y0: Math.round(tor.cy - tor.ry), y1: Math.round(tor.cy + tor.ry), ...P.bandas });
  if (P.manchas) manchas(m, C.mancha ?? TINTA, P.manchas);
  return rostro(F, { ojoW: 2, ojoH: 2, boca: false, ...P }, C);
}

/* ============================ CRUSTÁCEOS =========================== */
/* Pinzas levantadas a los lados (la señal), caparazón ancho, patas laterales y
   ojos sobre pedúnculos. */
function crustaceo(P, C) {
  const m = M();
  const s = P.s ?? 1;
  const capY = Math.round(-2 * s), capZ = Math.round(-0.5 * s);
  masa(m, C.caparazon ?? C.cuerpo, { cy: capY, cz: capZ, rx: 5.0 * s, ry: 3.2 * s, rz: 3.4 * s, p: 3 });
  masa(m, C.cabeza ?? C.caparazon ?? C.cuerpo, { cy: Math.round(2.4 * s), cz: Math.round(1.6 * s), rx: 3.2 * s, ry: 2.4 * s, rz: 2.6 * s, p: 3 });
  if (P.pinzas) mirror(side => {
    const x0 = Math.round(4 * s);
    const tMax = Math.round(3 * s), yBase = Math.round(-1 * s);
    for (let t = 0; t <= tMax; t++)
      box(m, ...rx(side, x0 + t, x0 + t + 1), yBase + t, yBase + t + 1, Math.round(1.5 * s), Math.round(2.5 * s), C.pinzas ?? C.acento);
    // la garra: dos valvas con la boca abierta, apoyadas en la última fila del brazo
    const gx = side * (x0 + tMax + 1), gy = yBase + tMax + 2;
    box(m, Math.min(gx, gx + side * 2), Math.max(gx, gx + side * 2), gy, gy + 1, Math.round(1.5 * s), Math.round(2.5 * s), C.pinzas ?? C.acento);
    box(m, Math.min(gx, gx + side), Math.max(gx, gx + side), gy + 2, gy + 3, Math.round(1.5 * s), Math.round(2.5 * s), C.pinzas ?? C.acento);
  });
  if (P.patasLado) for (const t of [0, 1, 2])
    pataInsecto(m, C.pata ?? TINTA, {
      x0: Math.round(4 * s) - 1, y: Math.round(-2.6 * s) - t, z: Math.round(2 * s),
      largo: Math.round((P.patasLargo ?? 2.2) * s), bajada: Math.round((P.patasBajada ?? 1.6) * s),
    });
  if (P.ojosPedunculo) mirror(side => {
    for (let t = 0; t <= Math.round(2 * s); t++)
      box(m, ...rx(side, Math.round(1.4 * s) + t, Math.round(1.6 * s) + t), Math.round(4 * s) + t, Math.round(4 * s) + t, Math.round(2.4 * s), Math.round(2.8 * s), C.pedunculo ?? C.pata ?? TINTA);
    ellipsoid(m, side * Math.round(1.6 * s + 2 * s + 1), Math.round(4 * s) + Math.round(2 * s) + 1, Math.round(2.6 * s), 1.2 * s, 1.2 * s, 1.0 * s, C.ojoBlanco ?? 0xf6efdd, 2);
  });
  if (P.antenas) mirror(side => antena(m, C.antena ?? TINTA, {
    side, x0: Math.round(2 * s), y: Math.round(4 * s), z: Math.round(3 * s),
    len: Math.round(P.antenas * s), curva: 1.6,
  }));
  if (P.manchas) manchas(m, C.mancha ?? C.borde, P.manchas);
  cara(m, C.ojo ?? OJO, {
    y: Math.round(2.4 * s), x: Math.round(1.4 * s), w: P.ojosPedunculo ? 1 : 2, h: P.ojosPedunculo ? 1 : 2,
    brillo: C.brillo ?? BRILLO, boca: C.boca ?? BOCA, bocaY: Math.round(0.4 * s),
  });
  return m;
}

/* ========================= TENTACULADOS ============================ */
/* Manto en domo arriba y brazos colgando hacia afuera: la silueta radial es lo
   que hace pulpo a un pulpo. */
function tentaculado(P, C) {
  const m = M();
  const s = P.s ?? 1;
  if (P.forma === 'medusa') {
    ellipsoid(m, 0, Math.round(2 * s), 0, Math.round(5 * s), Math.round(3.4 * s), Math.round(4.4 * s), C.cuerpo, 2);
    recolor(m, (x, y, z, cur) => cur === C.cuerpo && y > Math.round(2.4 * s), C.domo ?? C.cuerpo);
    for (const t of [-3, -1.5, 0, 1.5, 3])
      tentaculo(m, C.tentaculo ?? C.acento, {
        side: Math.sign(t) || 1, x0: Math.abs(Math.round(t * s)), y: Math.round(-1 * s),
        z: Math.round(0.6 * s), len: Math.round(5 * s), deriva: 0.6,
      });
    cara(m, C.ojo ?? OJO, { y: Math.round(0 * s), x: Math.round(2.4 * s), w: 2, h: 2, brillo: C.brillo ?? BRILLO, boca: C.boca ?? BOCA, bocaY: Math.round(-2 * s) });
    if (P.rubor) rubor(m, C.rubor ?? 0xff93ae, { y: Math.round(-1 * s), x: Math.round(4 * s) });
    return m;
  }
  const domoY = Math.round(3.4 * s);
  masa(m, C.cuerpo, { cy: domoY, cz: Math.round(0.4 * s), rx: 4.4 * s, ry: 4.0 * s, rz: 3.8 * s, p: P.mantoCuadrado ? 3 : 2.4 });
  if (P.orejasDumbo) mirror(side => masa(m, C.acento ?? C.cuerpo, {
    cx: side * Math.round(4.4 * s), cy: domoY + Math.round(0.6 * s), cz: Math.round(0.4 * s),
    rx: 1.6 * s, ry: 1.9 * s, rz: 1.0 * s, p: 2,
  }));
  for (const t of [-3, -2, -1, 0, 1, 2, 3])
    tentaculo(m, C.tentaculo ?? C.acento ?? C.cuerpo, {
      side: Math.sign(t) || 1, x0: Math.abs(Math.round(t * s * 0.9)), y: Math.round(-2 * s),
      z: Math.round(1.2 * s) + (t % 2), len: Math.round((P.brazos ?? 5) * s) - Math.abs(t), deriva: 0.55, g: 2,
    });
  recolor(m, (x, y, z, cur) => cur === C.cuerpo && y <= Math.round(0.4 * s) && z >= Math.round(1.6 * s), C.mejilla ?? C.cuerpo);
  cara(m, C.ojo ?? OJO, {
    y: Math.round(domoY - 0.4 * s), x: Math.round(1.8 * s), w: P.ojoGrande ? 3 : 2, h: P.ojoGrande ? 3 : 2,
    brillo: C.brillo ?? BRILLO, boca: C.boca ?? BOCA, bocaY: Math.round(domoY - 3 * s),
  });
  if (P.rubor) rubor(m, C.rubor ?? 0xff93ae, { y: Math.round(domoY - 1.6 * s), x: Math.round(3.6 * s) });
  if (P.manchas) manchas(m, C.mancha ?? C.acento, P.manchas);
  return m;
}

/* =========================== INVERTEBRADOS ========================= */
function invertebrado(P, C) {
  const m = M();
  const s = P.s ?? 1;
  if (P.forma === 'estrella') {
    for (let b = 0; b < 5; b++) {
      const ang = Math.PI / 2 + (b * 2 * Math.PI) / 5;
      for (let t = 0; t <= Math.round(6 * s); t++) {
        const x = Math.round(Math.cos(ang) * t), y = Math.round(Math.sin(ang) * t);
        const ww = Math.max(0, Math.round(1.6 * s - t * 0.18));
        box(m, x - ww, x + ww, y - ww, y + ww, Math.round(-0.8 * s), Math.round(0.8 * s), t > Math.round(4.6 * s) ? C.punta ?? C.cuerpo : C.cuerpo);
      }
    }
    masa(m, C.centro ?? C.cuerpo, { cy: 0, cz: 0, rx: 2.2 * s, ry: 2.2 * s, rz: 1.2 * s, p: 2 });
    cara(m, C.ojo ?? OJO, { y: Math.round(0.4 * s), x: Math.round(0.8 * s), w: 1, h: 1, brillo: C.brillo ?? BRILLO, boca: C.boca ?? BOCA, bocaY: Math.round(-1 * s) });
    if (P.manchas) manchas(m, C.mancha ?? 0xfff0d6, P.manchas);
    return m;
  }
  // caracol: concha en espiral arriba, pie abajo, pedúnculos con ojo
  caparazon(m, C.caparazon, { y: Math.round(2.6 * s), z: Math.round(-1 * s), rx: 4.4 * s, ry: 3.6 * s, rz: 3.6 * s, borde: C.borde });
  for (let t = 0; t < 4; t++)
    box(m, Math.round(2 * s) - t, Math.round(2 * s) + t, Math.round(2.6 * s) + t, Math.round(2.6 * s) + t, Math.round(-1 * s) - t, Math.round(-1 * s) + t, C.espiral ?? C.borde);
  masa(m, C.cuerpo, { cy: Math.round(-4.4 * s), cz: Math.round(1.2 * s), rx: 3.6 * s, ry: 1.8 * s, rz: 2.6 * s, p: 3 });
  masa(m, C.cabeza ?? C.cuerpo, { cy: Math.round(-3 * s), cz: Math.round(3.2 * s), rx: 2.2 * s, ry: 2.0 * s, rz: 1.8 * s, p: 3 });
  mirror(side => {
    for (let t = 0; t <= Math.round(3 * s); t++)
      box(m, ...rx(side, Math.round(0.8 * s) + t, Math.round(1 * s) + t), Math.round(-1.6 * s) + t, Math.round(-1.6 * s) + t, Math.round(3.6 * s), Math.round(3.6 * s), C.cuerpo);
    ellipsoid(m, side * Math.round(1 * s + 3 * s + 1), Math.round(-1.6 * s) + Math.round(3 * s) + 1, Math.round(3.8 * s), 1.1 * s, 1.1 * s, 0.8 * s, C.ojoBlanco ?? 0xf6efdd, 2);
  });
  cara(m, C.ojo ?? OJO, { y: Math.round(-2.6 * s), x: Math.round(1 * s), w: 1, h: 1, brillo: C.brillo ?? BRILLO, boca: C.boca ?? BOCA, bocaY: Math.round(-4 * s) });
  return m;
}

/* ============================ PINNÍPEDOS =========================== */
function pinnipedo(P, C) {
  const F = faz({ cabezaRx: 4.6, cabezaRy: 4.4, cabezaY: 3.4, cuerpoRx: 3.6, cuerpoRy: 4.2, bocaDY: -2.4, ...P }, C);
  const { m, s, cab, tor, ySuelo } = F;
  if (P.hocico) colgar(m, separar(C.hocico ?? C.cabeza ?? C.cuerpo, C.cabeza ?? C.cuerpo), {
    y: F.bocaY + 1, z: F.frente + 1, len: Math.round(P.hocico * s), w: Math.round((P.hocicoAncho ?? 2) * s),
    h: Math.round(1.2 * s), curva: 0.3, afilado: 0.5,
  });
  if (P.dientes) for (const dx of [-1, 1])
    box(m, dx * P.dientes, dx * P.dientes, F.bocaY - Math.round((P.dientesBaja ?? 2.4) * s), F.bocaY + 1,
      F.frente, F.frente + 1, C.diente ?? 0xf2ead8);
  if (P.bigotes) bigotes(m, C.bigote ?? 0xf6efdd, { y: F.bocaY, x0: Math.round(cab.rx * 0.72), z: F.frente + 1, n: 3, largo: Math.round(3 * s) });
  if (P.orejas) mirror(side => masa(m, C.orejas ?? C.cuerpo, {
    cx: side * Math.round(cab.rx * 0.9), cy: Math.round(cab.cy + cab.ry * 0.5), cz: Math.round(cab.cz), rx: 1, ry: 1, rz: 0.8, p: 2,
  }));
  mirror(side => chapeton(m, C.aleta ?? C.cuerpo, {
    side, x0: Math.round(tor.rx) - 1, y: Math.round(tor.cy + tor.ry * 0.5), z0: Math.round(tor.cz), z1: Math.round(tor.cz + tor.rz) - 1,
    h: Math.round(3 * s), w: 2, abajo: Math.round(1 * s),
  }));
  aleta(m, C.aleta ?? C.cuerpo, { parte: 'caudal', y: ySuelo + 1, z: Math.round(tor.cz - tor.rz) + 2, s: Math.round(2 * s) });
  if (P.manchas) manchas(m, C.mancha ?? C.ventre, P.manchas);
  return rostro(F, { boca: false, ...P }, C);
}

/* =========================== MURCIÉLAGOS =========================== */
function murcielago(P, C) {
  const F = faz({ cabezaRx: 4.0, cabezaRy: 3.6, cuerpoRx: 3.0, cuerpoRy: 3.8, bocaDY: -2.6, ...P }, C);
  const { m, s, cab, tor } = F;
  mirror(side => oreja(m, C.oreja ?? C.cuerpo, {
    side, x0: Math.round(cab.rx) - 2, y: Math.round(cab.cy + cab.ry * 0.5), z: Math.round(cab.cz) - 1,
    w: Math.round(3 * s), h: Math.round(4.4 * s), forma: P.orejaForma ?? 'plana', relleno: C.orejaInt,
  }));
  const xAla = Math.round(tor.rx) - 1;
  mirror(side => {
    for (let t = 0; t <= Math.round(5 * s); t++) {
      const x = side * (xAla + t);
      const yTop = Math.round(tor.cy + tor.ry * 0.7 - t * 0.25);
      const yBot = Math.round(tor.cy - tor.ry * 0.9 - t * 0.4 + Math.round(Math.sin(t) * 1));
      box(m, x, x, yBot, yTop, Math.round(tor.cz) - 1, Math.round(tor.cz), C.alas ?? 0x3d4457);
    }
  });
  if (P.dientes) for (const dx of [-1, 1]) box(m, dx, dx, F.bocaY - 1, F.bocaY, F.frente, F.frente + 1, C.diente ?? 0xf5f0e6);
  return rostro(F, { boca: false, ojoW: 2, ...P }, C);
}

/* ============================== EXÓTICOS =========================== */
/* Alebrijes, dragones, ornitorrinco, flamencos: cuernos + cresta encendida y
   alitas. Se compone con las mismas piezas que el resto. */
function exotico(P, C) {
  const F = faz({ cabezaRx: 4.6, cabezaRy: 4.0, cuerpoRx: 3.4, bocaDY: -2.4, ...P }, C);
  const { m, s, cab, tor } = F;
  if (P.cuernos) cuernos(m, C.cuernos ?? C.acento, {
    x0: Math.round(cab.rx) - 2, y: Math.round(cab.cy + cab.ry * 0.6), z: Math.round(cab.cz),
    h: Math.round(P.cuernos.h * s), incl: P.cuernos.incl ?? 1.4, g: P.cuernos.g ?? 1, ramas: P.cuernos.ramas ?? 1, color2: C.acento,
  });
  if (P.cresta) cresta(m, C.cresta ?? C.acento, {
    y: F.arriba - 1, z: Math.round(cab.cz - 1), n: P.cresta.n ?? 4, alto: Math.round((P.cresta.alto ?? 2) * s),
    w: P.cresta.w ?? 2, paso: P.cresta.paso ?? 2, lado: P.cresta.lado ?? 0, color2: C.brillo ?? BRILLO,
  });
  if (P.escamas) espinas(m, C.acento, { y: Math.round(tor.cy + tor.ry * 0.8), z: Math.round(tor.cz - tor.rz) + 1, xs: [-3, -1, 1, 3], h: 2, w: 2 });
  if (P.alas) mirror(side => ala(m, C.alas ?? C.acento, {
    side, x0: Math.round(tor.rx) - 1, y: Math.round(tor.cy + tor.ry * 0.4), z: Math.round(tor.cz) - 1,
    w: Math.round(P.alas * s), h: Math.round(2.2 * s), forma: P.alasForma ?? 'triangular', d: 1,
  }));
  if (P.pico) colgar(m, separar(C.pico ?? C.acento ?? C.cuerpo, C.cabeza ?? C.cuerpo), {
    y: F.bocaY + 1, z: F.frente + 1, len: Math.round(P.pico * s), w: Math.round((P.picoAncho ?? 2) * s),
    h: Math.round(1.2 * s), curva: P.picoCurva ?? 0.6, afilado: 0.6, color2: C.picoPunta,
  });
  if (P.cola) cola(m, C.cola ?? C.cuerpo, {
    tipo: P.cola.tipo ?? 'larga', x0: Math.round(tor.rx) - 1, y: Math.round(tor.cy - tor.ry * 0.4),
    z: Math.round(tor.cz - tor.rz) + 1, len: Math.round(P.cola.len * s), w: P.cola.ancho ?? 1.8, curva: P.cola.curva ?? 0.8, color2: C.colaPunta,
  });
  if (P.manchas) manchas(m, C.mancha ?? C.acento, P.manchas);
  if (P.franjas) franjas(m, C.franja ?? C.mancha, P.franjas);
  patas(m, C.patas ?? C.cuerpo, { tor, ySuelo: F.ySuelo, n: 4, g: 2 });
  return rostro(F, { boca: false, ...P }, C);
}

/* Serpiente: de frente es una pila de anillos que se ensancha hacia abajo, la
   cabeza triangular arriba y la lengua bífida colgando. Sin patas, y eso ya la
   separa de cualquier lagarto. */
function serpiente(P, C) {
  const m = M();
  const s = P.s ?? 1;
  const n = P.anillos ?? 4;
  const paso = Math.max(2, Math.round(2.4 * s));
  const yB = -Math.round(((n - 1) * paso) / 2);
  for (let i = 0; i < n; i++)
    masa(m, i % 2 ? C.anillo ?? C.cuerpo : C.cuerpo, {
      cy: yB + i * paso, cz: Math.round(-0.4 * s),
      rx: (2.0 + (n - 1 - i) * 0.9) * s, ry: Math.max(1.2, 1.5 * s),
      rz: Math.max(1, Math.round(1.5 * s)), p: 2,
    });
  const cabY = yB + (n - 1) * paso + Math.round(1.8 * s);
  const cab = {
    cy: cabY, cz: Math.round(1.2 * s),
    rx: (P.cabezaRx ?? 2.7) * s, ry: (P.cabezaRy ?? 2.1) * s, rz: (P.cabezaRz ?? 2.5) * s,
  };
  masa(m, C.cabeza ?? C.cuerpo, { ...cab, p: 3 });
  const frente = Math.round(cab.cz + cab.rz);
  if (P.hocico !== false) colgar(m, separar(C.hocico ?? C.cabeza ?? C.cuerpo, C.cabeza ?? C.cuerpo), {
    y: cabY - 1, z: frente + 1, len: Math.round((P.hocico ?? 1.8) * s),
    w: Math.round((P.hocicoAncho ?? 2.4) * s), h: Math.max(1, Math.round(1.1 * s)),
    curva: P.hocicoCurva ?? 0.35, afilado: 0.35,
  });
  // La lengua va DOS vóxeles por delante del cráneo: si no, el hocico (o el
  // propio lóbulo de la cabeza) le gana la columna en la proyección y la
  // serpiente sale sin bifida, que es su única señal inequívoca de frente.
  lengua(m, C.lengua ?? 0xd2415f, {
    y0: cabY - 1, y1: cabY - 1 - Math.round((P.lengua ?? 3) * s),
    z0: Math.round(cab.cz), z1: frente + 2,
  });
  if (P.manchas) manchas(m, C.mancha ?? C.acento ?? C.anillo, P.manchas);
  else bandas(m, C.banda ?? C.mancha ?? C.anillo ?? C.acento, {
    y0: yB - 2, y1: yB + (n - 1) * paso, ancho: 1, paso: 2,
  });
  cara(m, C.ojo ?? OJO, { y: cabY + 1, x: Math.max(1, Math.round(1.6 * s)), w: 2, h: 1, brillo: C.brillo ?? BRILLO, boca: null });
  return m;
}

/* ============================= REGISTRO ============================ */
/* ave es un plano aparte; reptil/anfibio/mamíferos comparten el suyo. */
export const PLANS = {
  ave, mamifero, felino, canino, oso, roedor, ungulado, anfibio, reptil,
  insecto, marino, acuatico, pinnipedo, crustaceo, invertebrado, tentaculado,
  murcielago, exotico, tortuga, cocodrilo, serpiente,
};

export function buildPlan(plano, P, C) {
  const fn = PLANS[plano];
  if (!fn) throw new Error('plano inexistente: ' + plano);
  return fn(P ?? {}, C);
}
