/**
 * Tabla de especies: { plano, P = parámetros morfológicos, C = colores de campo }.
 *
 * Reglas que gobiernan esta tabla:
 *
 * 1. El color es el del animal REAL, no el color psicométrico del atlas. Un
 *    cuervo es negro aunque su carta sea violeta.
 * 2. La silueta manda. El 2.5D es la proyección sobre XY, así que cada especie
 *    recibe su señal donde el frente la capta: arriba (orejas, cresta, cuernos,
 *    antenas), a los lados (alas, pinzas, bigotes, branquias) o colgando de la
 *    cara (pico, hocico, lengua).
 * 3. `s` es la talla relativa real: un chihuahua 0.70, un alce 1.18.
 *
 * Las plantillas 16×16 de src/domain/avatars/pixel-sprites.ts son la referencia
 * de qué señala a qué familia; aquí no se toca nada de eso.
 */

import { buildAjolotito } from './ajolotito.mjs';

const NEGRO = 0x1b1b22, VIENTRE = 0xf7f3e6, HUESO = 0xf2ead8;
const PICO_NEGRO = 0x2a2730;
const OJOS = { ojo: 0x2b1f2c, brillo: 0xffffff };

export const SPECIES = {
  /* ================================================================== AVES ==
     Pico colgando en el centro, ala pegada al flanco, cola de plumas abajo y
     cresta o mechones arriba. Lo que distingue a cada ave es la FORMA del pico
     (largo, ancho, ganchudo) y la largura de la cola. */
  cuervito: {
    plano: 'ave',
    P: { s: 1.0, pico: 3, picoAncho: 2, picoAlto: 1.6, colaTipo: 'plumas', colaLargo: 4, colaAncho: 2.6 },
    C: { cuerpo: 0x26262e, cabeza: 0x2d2d36, alas: 0x1a1a21, acento: 0x3a3a46, pico: 0x33333c, cola: 0x1e1e26, patas: PICO_NEGRO, ...OJOS },
  },
  colibri_obsidiana: {
    plano: 'ave',
    P: { s: 0.72, pico: 5.5, picoAncho: 1.1, picoAlto: 1, picoCurva: 0.25, alasExtendidas: true, alasAncho: 5, alasAlto: 1.6, alasForma: 'triangular', colaTipo: 'abanico', colaLargo: 3, garganta: true },
    C: { cuerpo: 0x1e3a52, cabeza: 0x24485f, garganta: 0x6b2f8f, alas: 0x16283a, acento: 0x2f6b7a, pico: 0x22222a, cola: 0x1a2f42, patas: 0x2a2a33, ...OJOS },
  },
  colibrito: {
    plano: 'ave',
    P: { s: 0.72, pico: 5.5, picoAncho: 1.1, picoAlto: 1, picoCurva: 0.25, alasExtendidas: true, alasAncho: 5, alasAlto: 1.6, alasForma: 'triangular', colaTipo: 'abanico', colaLargo: 3, garganta: true },
    C: { cuerpo: 0x2f9e6b, cabeza: 0x38b87d, garganta: 0xd2415f, alas: 0x227a52, acento: 0x7fd6a8, pico: 0x2a2a33, cola: 0x2f8b62, patas: 0x3a3a44, ...OJOS },
  },
  buhito: {
    plano: 'ave',
    P: {
      s: 1.08, cabezaRx: 4.8, cabezaRy: 4.4, cabezaP: 3.2, mechones: { h: 3 }, ojeras: true,
      ojoW: 3, ojoH: 3, ojoDX: 0.34, pico: 1.8, picoAncho: 1.8, picoAlto: 1.8, picoCurva: 0.9,
      colaTipo: 'plumas', colaLargo: 2, colaAncho: 2.6, pecho: true, garganta: true,
    },
    C: { cuerpo: 0x7a5c40, cabeza: 0x8f6d4c, ojera: 0xe3d3b2, acento: 0x55402c, alas: 0x68502f, mechon: 0x4a3624, pico: 0xd8b25c, pecho: 0xdcc7a0, garganta: 0xefe3c8, cola: 0x68502f, patas: 0xc9a35a, ojo: 0x2b1f2c, brillo: 0xffdf7a },
  },
  guacamayito: {
    plano: 'ave',
    P: { s: 1.1, cabezaRx: 4.2, pico: 2.6, picoAncho: 2.8, picoAlto: 2.2, picoCurva: 1.15, picoAfilado: 0.85, ojeras: true, colaTipo: 'plumas', colaLargo: 7, colaAncho: 2.2, cabezaP: 3 },
    C: { cuerpo: 0xc8342c, cabeza: 0xd8433a, ojera: 0xf2e6cf, acento: 0x2f5fa8, alas: 0x2a56a0, pico: PICO_NEGRO, picoPunta: 0x3a3742, cola: 0x2f5fa8, patas: 0x4a4550, ...OJOS },
  },
  tucancito: {
    plano: 'ave',
    P: { s: 1.0, cabezaRx: 4.2, cabezaRy: 3.8, pico: 5.5, picoAncho: 3, picoAlto: 2.6, picoCurva: 0.75, picoAfilado: 0.35, colaTipo: 'plumas', colaLargo: 3.5, pecho: true, garganta: true },
    C: { cuerpo: 0x22222a, cabeza: 0x28282f, garganta: 0xf6efdd, pecho: 0xf6efdd, alas: 0x1a1a21, acento: 0xd2415f, pico: 0xef8a2c, picoPunta: PICO_NEGRO, cola: 0x28282f, patas: 0x4a4a55, ...OJOS },
  },
  quetzalito: {
    plano: 'ave',
    P: { s: 0.95, cabezaRx: 4.0, cresta: { n: 3, alto: 2, paso: 1 }, pico: 1.8, picoAncho: 1.8, picoAlto: 1.2, colaTipo: 'plumas', colaLargo: 8, colaAncho: 1.6, garganta: true },
    C: { cuerpo: 0x1f8f76, cabeza: 0x27a88a, cresta: 0x2fcfa6, garganta: 0xd8354a, alas: 0x18705e, acento: 0x36d3ab, pico: 0x2f3a44, cola: 0x1f8f76, patas: 0x3a4a44, ...OJOS },
  },
  pelicanito: {
    plano: 'ave',
    P: { s: 1.15, cabezaRx: 4.4, cabezaRy: 3.8, pico: 6, picoAncho: 3.2, picoAlto: 2, picoCurva: 0.18, picoAfilado: 0.2, colaTipo: 'plumas', colaLargo: 3, cuello: 2, cuelloGrueso: 2, pecho: true },
    C: { cuerpo: 0xe8e2d2, cabeza: 0xf2ecdd, cuello: 0xf2ecdd, alas: 0xcfc7b4, acento: 0xb8ae98, pico: 0xe8a94a, picoPunta: 0xd98a3a, pecho: VIENTRE, cola: 0xd6cfbd, patas: 0xe08a4a, ...OJOS },
  },
  garcita: {
    plano: 'ave',
    P: { s: 1.0, cabezaRx: 3.6, cabezaRy: 3.4, cuello: 5, cuelloCurva: 3, pico: 4.5, picoAncho: 1.6, picoAlto: 1.4, picoCurva: 0.35, mechones: { h: 3 }, colaTipo: 'plumas', colaLargo: 3, patasLargas: 5 },
    C: { cuerpo: 0xeef0ee, cabeza: 0xf4f5f3, cuello: 0xf4f5f3, mechon: 0x2f3a44, alas: 0xd6dade, acento: 0x2f3a44, pico: 0xe8c24a, cola: 0xdfe3e6, patas: 0x3a4a52, ojo: 0xefb63c, brillo: 0xffffff },
  },
  patito: {
    plano: 'ave',
    P: { s: 0.86, cabezaRx: 4.2, cabezaRy: 4.0, pico: 2.6, picoAncho: 3.6, picoAlto: 1.1, picoCurva: 0.2, picoAfilado: 0.1, colaTipo: 'plumas', colaLargo: 2, colaAncho: 2.4, dedos: 3 },
    C: { cuerpo: 0xf6d94f, cabeza: 0xfbe469, alas: 0xe8c53a, acento: 0xd8ae28, pico: 0xe8963a, cola: 0xe8c53a, patas: 0xe88a2e, ...OJOS },
  },
  cisnecito: {
    plano: 'ave',
    P: { s: 1.06, cabezaRx: 3.6, cabezaRy: 3.4, cuello: 6, cuelloCurva: 4, pico: 2.6, picoAncho: 2, picoAlto: 1.4, picoCurva: 0.4, colaTipo: 'plumas', colaLargo: 3, colaAncho: 3, patasLargas: 2 },
    C: { cuerpo: 0xf7f6f2, cabeza: 0xffffff, cuello: 0xffffff, alas: 0xe4e2da, acento: 0xd8d5cb, pico: 0xe87a2e, picoPunta: PICO_NEGRO, cola: 0xf2f0e8, patas: 0x4a4a52, ...OJOS },
  },
  pinguino: {
    plano: 'ave',
    P: { s: 1.05, cabezaRx: 4.2, cabezaRy: 4.2, cuerpoRy: 4.8, flipper: true, colaTipo: null, pico: 2, picoAncho: 1.8, picoAlto: 1.2, picoCurva: 0.6, pecho: true, garganta: true, dedos: 3 },
    C: { cuerpo: 0x1c2230, cabeza: 0x212837, alas: 0x141a26, acento: 0x0f141d, pico: 0xe08a2e, pecho: 0xf2f0e8, garganta: 0xf2f0e8, patas: 0xe08a2e, ojo: 0x0d1118, brillo: 0xffffff },
  },
  halconcito: {
    plano: 'ave',
    P: { s: 1.05, cabezaRx: 4.0, cabezaRy: 3.6, ojeras: true, pico: 2.2, picoAncho: 2, picoAlto: 1.8, picoCurva: 1.1, picoAfilado: 0.8, alasExtendidas: true, alasAncho: 7, alasAlto: 2, colaTipo: 'abanico', colaLargo: 4, colaAncho: 2.6, pecho: true },
    C: { cuerpo: 0x6a7285, cabeza: 0x3c4252, ojera: 0x2a2f3c, alas: 0x545c70, acento: 0x2a2f3c, pico: 0xf0d24a, picoPunta: 0x2c2a30, pecho: 0xe8dcc0, cola: 0x7a8296, patas: 0xe0c24a, ...OJOS },
  },
  fenixito: {
    plano: 'ave',
    P: { s: 1.15, cabezaRx: 4.2, cresta: { n: 5, alto: 4, paso: 1, w: 2 }, alasExtendidas: true, alasAncho: 7, alasAlto: 3, pico: 2.4, picoAncho: 2.2, picoAlto: 1.6, picoCurva: 0.9, colaTipo: 'plumas', colaLargo: 7, colaAncho: 2.6, garganta: true },
    C: { cuerpo: 0xe0562a, cabeza: 0xf07a34, cresta: 0xf6b23a, garganta: 0xf6d23a, alas: 0xc8391f, veta: 0xf6b23a, acento: 0xf6c446, pico: 0x8a4a1e, cola: 0xe0562a, colaPunta: 0xf6c446, patas: 0x8a4a1e, ojo: 0x2b1f2c, brillo: 0xffe9a8 },
  },
  kiwito: {
    plano: 'ave',
    P: { s: 0.9, cabezaRx: 4.4, cabezaRy: 4.4, alas: false, pico: 5.5, picoAncho: 1.6, picoAlto: 1.4, picoCurva: 0.9, colaTipo: null, patasLargas: 1, dedos: 3 },
    C: { cuerpo: 0x8a6a4a, cabeza: 0x7a5c40, alas: 0x6f5238, acento: 0x5c422c, pico: 0x4a3a2c, patas: 0x6b5540, ...OJOS },
  },

  /* ============================================================== GATOS == */
  gatito: {
    plano: 'felino',
    P: { s: 0.88, hocico: 1.5, franjas: { y0: 4, y1: 6, xs: [-1, 0, 1] }, manchas: [[-2, 4, 1.4], [2, 4, 1.4]] },
    C: { cuerpo: 0xa9a2b6, cabeza: 0xb6afbf, hocico: 0xededf5, nariz: 0xef8fa4, mancha: 0x837c91, franja: 0x6f6880, orejas: 0x9d95aa, orejaInt: 0xf2b8c6, cola: 0x9d95aa, colaPunta: 0x6f6880, patas: 0xb6afbf, ...OJOS },
  },
  leoncito: {
    plano: 'felino',
    P: { s: 1.12, hocico: 2.2, hocicoAncho: 2.6, melena: 1, orejas: { forma: 'redonda', h: 2.4, w: 3, relleno: true }, cola: { tipo: 'larga', len: 7, ancho: 1.4, curva: 0.5 } },
    C: { cuerpo: 0xc89a54, cabeza: 0xd6aa66, melena: 0x8a5a28, hocico: 0xe4c78a, nariz: 0x5a3a22, orejas: 0x9a6a34, orejaInt: 0x6f4620, cola: 0xc89a54, colaPunta: 0x6f4620, patas: 0xb0844a, ...OJOS },
  },
  tigrito: {
    plano: 'felino',
    P: { s: 1.08, hocico: 2, hocicoAncho: 2.4, franjas: { y0: 0, y1: 6, xs: [-4, -2, 0, 2, 4] }, pecho: true, cola: { tipo: 'larga', len: 7, ancho: 1.6 } },
    C: { cuerpo: 0xe08a34, cabeza: 0xea9a44, franja: 0x2c2620, mancha: 0x2c2620, hocico: 0xf7e6cf, nariz: 0x3a3038, pecho: 0xf7e6cf, orejas: 0xd67f2e, orejaInt: 0xf7e6cf, cola: 0xe08a34, patas: 0xc9762a, ...OJOS },
  },
  jaguarito: {
    plano: 'felino',
    P: { s: 1.06, hocico: 2, hocicoAncho: 2.6, manchas: [[-3, 1, 1.4], [3, 1, 1.4], [-2, -5, 1.6], [2, -5, 1.6], [0, 2, 1.2]], cola: { tipo: 'larga', len: 6, ancho: 1.6 } },
    C: { cuerpo: 0xe0b862, cabeza: 0xecC470, mancha: 0x2f2618, hocico: 0xf6e3b8, nariz: 0x2f2618, orejas: 0xd0a856, orejaInt: 0x2f2618, cola: 0xe0b862, patas: 0xd0a856, ...OJOS },
  },
  pumita: {
    plano: 'felino',
    P: { s: 1.02, hocico: 1.8, orejas: { forma: 'redonda', h: 2.6, w: 2.4, relleno: true }, cola: { tipo: 'larga', len: 8, ancho: 1.4, curva: 0.4 } },
    C: { cuerpo: 0xc79a6a, cabeza: 0xd2a876, hocico: 0xf0e2cc, nariz: 0x4a3a30, orejas: 0xbb8d5e, orejaInt: 0x3f3028, cola: 0xc79a6a, colaPunta: 0x50402f, patas: 0xb78b5c, ...OJOS },
  },
  ocelotito: {
    plano: 'felino',
    P: { s: 0.9, hocico: 1.6, orejas: { forma: 'redonda', h: 3, w: 3, relleno: true }, manchas: [[-3, 0, 1.1], [3, 0, 1.1], [-2, -5, 1.3], [2, -5, 1.3]] },
    C: { cuerpo: 0xd9b276, cabeza: 0xe4c086, mancha: 0x4f3b26, hocico: 0xf2e6cf, nariz: 0x3a2c22, orejas: 0xc9a268, orejaInt: 0x2f2418, cola: 0xd9b276, colaPunta: 0x4f3b26, patas: 0xc09a60, ...OJOS },
  },
  guepardito: {
    plano: 'felino',
    P: { s: 1.0, hocico: 1.6, orejas: { forma: 'redonda', h: 2.4, w: 2.4, relleno: true }, manchas: [[-2, 4, 1], [2, 4, 1], [-3, -4, 1.2], [3, -4, 1.2], [0, -6, 1.2]], cola: { tipo: 'larga', len: 8, ancho: 1.5, curva: 0.4 } },
    C: { cuerpo: 0xdcbb7e, cabeza: 0xe8ca90, mancha: 0x2f2a26, hocico: 0xf5ead6, nariz: 0x2f2a26, orejas: 0xd0af70, orejaInt: 0x2f2a26, cola: 0xdcbb7e, colaPunta: 0x2f2a26, patas: 0xd0af70, ...OJOS },
  },

  /* ============================================================= CANIDOS == */
  lobito: {
    plano: 'canino',
    P: { s: 1.08, hocico: 2.8, pecho: true, cola: { tipo: 'esponjosa', len: 5, ancho: 2.2 } },
    C: { cuerpo: 0x858b99, cabeza: 0x949aa8, hocico: 0xbdc2cc, nariz: NEGRO, orejas: 0x6f7582, pecho: VIENTRE, cola: 0x767c8a, colaPunta: 0xcdd2da, patas: 0x666c7a, ojo: 0x2b1f2c, brillo: 0xffd47a },
  },
  zorrito: {
    plano: 'canino',
    P: { s: 0.94, hocico: 2.6, hocicoAncho: 1.8, cola: { tipo: 'esponjosa', len: 6, ancho: 2.4, curva: 0.4 } },
    C: { cuerpo: 0xdc7a2e, cabeza: 0xe88a3c, hocico: 0xf7e6cf, nariz: NEGRO, orejas: 0xb85a1e, orejaInt: 0x2f2018, pecho: 0xf7e6cf, cola: 0xdc7a2e, colaPunta: VIENTRE, patas: 0x4a3526, ...OJOS },
  },
  perrito: {
    plano: 'canino',
    P: { s: 0.92, hocico: 2.6, orejas: { forma: 'caida', h: 3.4, w: 2, incl: 1.2, relleno: true }, cola: { tipo: 'rizada', len: 4, ancho: 1.6, curva: 0.7 }, pecho: true },
    C: { cuerpo: 0xc08a46, cabeza: 0xcf9854, hocico: 0xe8cfa0, nariz: 0x3a2c24, orejas: 0x9a6a30, orejaInt: 0x8a5c28, pecho: 0xe0bd82, cola: 0xc08a46, patas: 0xa87838, ...OJOS },
  },
  chihuahuita: {
    plano: 'canino',
    P: { s: 0.7, cabezaRx: 4.6, cabezaRy: 4.2, hocico: 1.4, hocicoAncho: 1.6, ojoW: 3, ojoH: 3, ojoDX: 0.36, orejas: { forma: 'puntiaguda', h: 5, w: 3.4, incl: 0.35, relleno: true }, cola: { tipo: 'rizada', len: 3, ancho: 1.2 } },
    C: { cuerpo: 0xd2a878, cabeza: 0xe0b888, hocico: 0xf0dcbc, nariz: 0x3a2c24, orejas: 0xc4986a, orejaInt: 0xf2c8d0, cola: 0xd2a878, patas: 0xbc9060, ...OJOS },
  },
  coyotito: {
    plano: 'canino',
    P: { s: 1.0, hocico: 2.8, hocicoAncho: 1.8, orejas: { forma: 'puntiaguda', h: 4.2, w: 2.2, incl: 0.3 }, cola: { tipo: 'esponjosa', len: 5, ancho: 2 }, pecho: true },
    C: { cuerpo: 0xb09a78, cabeza: 0xbfa886, hocico: 0xe0d2b8, nariz: 0x3a3028, orejas: 0x8f7a5a, pecho: VIENTRE, cola: 0x9f8a6a, colaPunta: 0x4a3c2a, patas: 0x8a7456, ojo: 0x2b1f2c, brillo: 0xffe3a8 },
  },
  huskito: {
    plano: 'canino',
    P: { s: 1.04, hocico: 2.4, manchas: [[-2, 4, 1.6], [2, 4, 1.6]], pecho: true, cola: { tipo: 'esponjosa', len: 4, ancho: 2.2, curva: 0.2 } },
    C: { cuerpo: 0x6f7684, cabeza: 0x3f4552, mancha: 0x2c3240, hocico: VIENTRE, nariz: NEGRO, orejas: 0x4a5060, pecho: VIENTRE, cola: 0xdfe4ea, colaPunta: VIENTRE, patas: 0x59606f, ojo: 0x2b1f2c, brillo: 0x9fd8f0 },
  },
  dinguito: {
    plano: 'canino',
    P: { s: 0.98, hocico: 2.6, cola: { tipo: 'esponjosa', len: 5, ancho: 1.8 } },
    C: { cuerpo: 0xcf9f66, cabeza: 0xdcae74, hocico: 0xeeddc0, nariz: 0x4a3a2a, orejas: 0xc08f56, cola: 0xcf9f66, colaPunta: VIENTRE, patas: 0xb0834e, ...OJOS },
  },
  mapachito: {
    plano: 'canino',
    P: { s: 0.94, cabezaRx: 4.6, hocico: 2.2, hocicoAncho: 2.2, orejas: { forma: 'redonda', h: 2.6, w: 3, relleno: true }, manchas: [[-2, 4, 1.7], [2, 4, 1.7]], cola: { tipo: 'esponjosa', len: 5, ancho: 2.2 } },
    C: { cuerpo: 0x9a948a, cabeza: 0xb6b0a6, mancha: 0x2f2c2a, hocico: 0xe6e1d8, nariz: 0x2f2c2a, orejas: 0x6f6a62, orejaInt: 0xdcd6cc, cola: 0x8a8478, colaPunta: 0x2f2c2a, patas: 0x565049, ...OJOS },
  },
  kitsune: {
    plano: 'canino',
    P: { s: 1.0, hocico: 2.4, cola: { tipo: 'esponjosa', len: 7, ancho: 2.6, curva: 0.1 }, pecho: true },
    C: { cuerpo: 0xf2ece2, cabeza: 0xf8f4ec, hocico: 0xfdfbf6, nariz: 0x3a3038, orejas: 0xe8ddd0, orejaInt: 0xf0a0a8, pecho: 0xfdfbf6, cola: 0xf2ece2, colaPunta: 0xe0564a, patas: 0xdbcfc0, ojo: 0x2b1f2c, brillo: 0xffd9a0 },
  },
  nahualito: {
    plano: 'canino',
    P: { s: 1.06, hocico: 2.6, hocicoAncho: 2.4, manchas: [[-3, 1, 1.1], [3, 1, 1.1], [-2, -5, 1.3], [2, -5, 1.3], [0, -3, 1]], cola: { tipo: 'larga', len: 6, ancho: 1.6 } },
    C: { cuerpo: 0x2a2730, cabeza: 0x322e38, mancha: 0xf0c25a, hocico: 0x4a4552, nariz: 0x121218, orejas: 0x2a2730, orejaInt: 0xf0c25a, cola: 0x2a2730, colaPunta: 0x121218, patas: 0x221f28, ojo: 0x1a1a20, brillo: 0xf0c25a },
  },
  suricatita: {
    plano: 'canino',
    P: { s: 0.8, cabezaRx: 3.8, cabezaRy: 3.6, hocico: 2, hocicoAncho: 1.6, manchas: [[-2, 4, 1.5], [2, 4, 1.5]], orejas: { forma: 'redonda', h: 1.8, w: 2 }, cola: { tipo: 'larga', len: 5, ancho: 1.4, curva: 0.3 } },
    C: { cuerpo: 0xc4a878, cabeza: 0xd6bc8c, mancha: 0x4a3a26, hocico: 0xeadcae, nariz: 0x3a2c1e, orejas: 0x9f8860, cola: 0xbfa274, colaPunta: 0x6f5a38, patas: 0x8f7a56, ...OJOS },
  },

  /* ================================================================= OSOS == */
  osito: {
    plano: 'oso',
    P: { s: 1.1, hocico: 2, pecho: true },
    C: { cuerpo: 0x8a5f3d, cabeza: 0x9a6c46, hocico: 0xc9a071, nariz: NEGRO, orejas: 0x7a5234, orejaInt: 0xc9a071, pecho: 0xc9a071, patas: 0x6f482c, ...OJOS },
  },
  pandita: {
    plano: 'oso',
    P: { s: 1.1, hocico: 1.8, hocicoAncho: 2.4, manchas: [[-2.4, 4, 1.9], [2.4, 4, 1.9]] },
    C: { cuerpo: 0xf4f1e8, cabeza: 0xfaf8f2, mancha: 0x1f1f26, hocico: 0xfaf8f2, nariz: 0x1f1f26, orejas: 0x1f1f26, patas: 0x2a2a32, ...OJOS },
  },
  polarito: {
    plano: 'oso',
    P: { s: 1.16, hocico: 2.4, hocicoAncho: 2.2, orejas: { forma: 'redonda', h: 2.2, w: 2.6, relleno: true } },
    C: { cuerpo: 0xf3efe2, cabeza: 0xfaf7ee, hocico: 0xe8e2d2, nariz: 0x2a2a30, orejas: 0xeae4d6, orejaInt: 0xdcd4c2, patas: 0xe6dfcf, ...OJOS },
  },
  koalita: {
    plano: 'oso',
    P: { s: 0.94, cabezaRx: 4.8, hocico: 1.8, hocicoAncho: 2.6, hocicoAlto: 1.8, orejas: { forma: 'redonda', h: 4.2, w: 4, relleno: true } },
    C: { cuerpo: 0x9aa0a8, cabeza: 0xa8aeb6, hocico: 0x8f959d, nariz: 0x3a3f46, orejas: 0x9aa0a8, orejaInt: 0xe8e2d8, patas: 0x868c94, ...OJOS },
  },
  perezosito: {
    plano: 'oso',
    P: { s: 1.0, cabezaRx: 4.6, cabezaRy: 4.0, hocico: 1.6, hocicoAncho: 2.4, manchas: [[-2.6, 3.6, 1.6], [2.6, 3.6, 1.6]], orejas: { forma: 'redonda', h: 2, w: 2.4 } },
    C: { cuerpo: 0x9c8a70, cabeza: 0xd0c1a6, mancha: 0x6b5a42, hocico: 0xe2d6bf, nariz: 0x4a3d2c, orejas: 0x9c8a70, patas: 0x8a7860, ...OJOS },
  },
  wombatito: {
    plano: 'oso',
    P: { s: 1.0, cabezaRx: 5.2, cabezaRy: 4.2, cuerpoRx: 4.8, cuerpoRy: 3.8, hocico: 1.8, hocicoAncho: 3, hocicoAlto: 1.8, orejas: { forma: 'redonda', h: 1.6, w: 2 }, pataGruesa: true },
    C: { cuerpo: 0x8f7350, cabeza: 0xa08260, hocico: 0xc4a67f, nariz: 0x3f3226, orejas: 0x7f6546, patas: 0x6f583c, ...OJOS },
  },
  osito_anteojos: {
    plano: 'oso',
    P: { s: 1.02, hocico: 1.8, hocicoAncho: 2.4, manchas: [[-2.4, 4.2, 1.5], [2.4, 4.2, 1.5]], pecho: true },
    C: { cuerpo: 0x3f352c, cabeza: 0x4a3f34, mancha: 0xd9a76a, hocico: 0xd9a76a, nariz: 0x241f1a, orejas: 0x4a3f34, orejaInt: 0xb98a54, pecho: 0x8f6a42, patas: 0x352c24, ojo: 0x1f1b18, brillo: 0xffe3b0 },
  },

  /* ============================================================= ROEDORES == */
  conejito: {
    plano: 'roedor',
    P: { s: 0.88, hocico: 1.2, hocicoAncho: 1.8, orejas: { forma: 'larga', h: 6, w: 2, incl: 0.6, relleno: true }, cola: { tipo: 'pene', len: 1, ancho: 2 } },
    C: { cuerpo: 0xf2eee8, cabeza: 0xf8f5f0, orejas: 0xf2eee8, orejaInt: 0xffb7c5, hocico: 0xfdfbf6, nariz: 0xff9aa8, cola: 0xffffff, patas: 0xe2dcd2, ...OJOS },
  },
  ardillita: {
    plano: 'roedor',
    P: { s: 0.86, hocico: 1.4, orejas: { forma: 'larga', h: 3, w: 2, incl: 0.3, relleno: true }, cola: { tipo: 'esponjosa', len: 6, ancho: 3, curva: -0.45 }, dientes: 1 },
    C: { cuerpo: 0xc8703a, cabeza: 0xd8804a, hocico: 0xf0d9b8, nariz: 0x3a2a22, orejas: 0xb5622f, orejaInt: 0xf0d9b8, cola: 0xd8804a, colaPunta: 0xf0cfa0, patas: 0xa85a2c, ...OJOS },
  },
  castorcito: {
    plano: 'roedor',
    P: { s: 1.0, cabezaRx: 4.6, hocico: 1.6, hocicoAncho: 2.2, orejas: { forma: 'redonda', h: 1.8, w: 2 }, cola: { tipo: 'pene', len: 4, ancho: 4, altovox: 1 }, dientes: 1 },
    C: { cuerpo: 0x7d5a3a, cabeza: 0x8c6844, hocico: 0xc4a27a, nariz: 0x3a2a1e, orejas: 0x6b4c30, cola: 0x4f3a26, colaPunta: 0x6b4c30, patas: 0x6b4c30, diente: 0xd9b878, ...OJOS },
  },
  capibarita: {
    plano: 'roedor',
    P: { s: 1.1, cabezaRx: 5.0, cabezaRy: 3.8, cabezaP: 3.6, cuerpoRx: 4.6, cuerpoRy: 3.6, hocico: 2.2, hocicoAncho: 2.8, hocicoAlto: 1.8, orejas: { forma: 'redonda', h: 1.4, w: 1.8 }, cola: null },
    C: { cuerpo: 0xa8845a, cabeza: 0xb8946a, hocico: 0x6f5638, nariz: 0x3a2c20, orejas: 0x96754e, patas: 0x8f7050, ...OJOS },
  },
  erizito: {
    plano: 'roedor',
    P: { s: 0.86, cabezaRx: 4.2, hocico: 1.6, hocicoAncho: 1.8, espinas: [-4, -2, 0, 2, 4], espinaAlto: 3, espinaAncho: 2, cola: null },
    C: { cuerpo: 0x8a7a5e, cabeza: 0xd6c3a4, espina: 0x574a34, acento: 0x3f3626, hocico: 0xe6d5ba, nariz: 0x3a2c22, patas: 0xc0ad8e, ...OJOS },
  },
  huroncito: {
    plano: 'roedor',
    P: { s: 0.84, cabezaRx: 4.0, cuerpoRx: 3.2, cuerpoRy: 4.4, hocico: 1.6, orejas: { forma: 'redonda', h: 1.8, w: 2 }, manchas: [[-2, 4, 1.4], [2, 4, 1.4]], cola: { tipo: 'larga', len: 5, ancho: 1.6 } },
    C: { cuerpo: 0xd9c9a8, cabeza: 0xe6dac0, mancha: 0x4a3f32, hocico: 0xefe6d2, nariz: 0x3a2f26, orejas: 0xcbbda0, cola: 0x8f7f60, patas: 0xbfae8c, ...OJOS },
  },
  chinchillita: {
    plano: 'roedor',
    P: { s: 0.9, cabezaRx: 4.4, hocico: 1.2, hocicoAncho: 1.8, orejas: { forma: 'redonda', h: 5, w: 3.4, relleno: true }, cola: { tipo: 'esponjosa', len: 3, ancho: 2 }, dientes: 1 },
    C: { cuerpo: 0xa9adb8, cabeza: 0xbcc0ca, hocico: 0xdfe2e8, nariz: 0x4a4e58, orejas: 0x9fa3ae, orejaInt: 0xf0e6ea, cola: 0x8b8f9a, patas: 0xc8ccd4, ...OJOS },
  },
  tlacuachito: {
    plano: 'roedor',
    P: { s: 0.94, cabezaRx: 4.2, hocico: 2.6, hocicoAncho: 1.8, hocicoAfilado: 0.7, orejas: { forma: 'redonda', h: 2.6, w: 2.6 }, cola: { tipo: 'larga', len: 6, ancho: 1, curva: 0.6 } },
    C: { cuerpo: 0xa8a29c, cabeza: 0xded8d2, hocico: 0xe8e2dc, nariz: 0x4a423e, orejas: 0x6f6763, orejaInt: 0x4a423e, cola: 0x8f8781, patas: 0x7a736e, ...OJOS },
  },
  armadillito: {
    plano: 'roedor',
    P: { s: 0.94, cabezaRx: 4.0, cabezaRy: 3.4, cuerpoRx: 4.2, cuerpoRy: 3.6, hocico: 2.4, hocicoAncho: 1.6, hocicoAfilado: 0.7, orejas: { forma: 'redonda', h: 1.4, w: 1.8 }, bandas: { ancho: 1, paso: 2 }, cola: { tipo: 'larga', len: 4, ancho: 1.4 } },
    C: { cuerpo: 0xb0a08a, banda: 0x8a7862, cabeza: 0xc4b69f, hocico: 0xa89478, nariz: 0x4a3f32, orejas: 0x9a8a74, cola: 0x9a8a74, patas: 0x8a7a64, ...OJOS },
  },

  /* =========================================================== UNGULADOS == */
  venadito: {
    plano: 'ungulado',
    P: { s: 0.98, cuernos: { h: 4, incl: 1.1, g: 1, ramas: 2 }, manchas: [[-3, 1, 1.2], [3, 1, 1.2], [-2, -1, 1]], cola: { tipo: 'pene', len: 1, ancho: 2 }, pecho: true },
    C: { cuerpo: 0xb5793f, cabeza: 0xa86f38, mancha: 0xf0e2cc, hocico: 0xd8b28a, nariz: NEGRO, cuernos: 0x8a6a3f, cuernosPunta: 0xa8845a, pecho: 0xf0e2cc, orejas: 0xa86f38, orejaInt: 0x8a5c2e, cola: 0xa86f38, colaPunta: VIENTRE, patas: 0x8a5c2e, ...OJOS },
  },
  ciervito: {
    plano: 'ungulado',
    P: { s: 1.06, cuernos: { h: 5, incl: 1.2, g: 1, ramas: 3 }, manchas: [[-3, 0, 1.2], [3, 0, 1.2]], cola: { tipo: 'pene', len: 1, ancho: 2 } },
    C: { cuerpo: 0x9d6a34, cabeza: 0x8f5f2c, mancha: 0xe8d5b4, hocico: 0xc99a62, nariz: 0x2a2018, cuernos: 0x7d5c34, cuernosPunta: 0xa88a5e, orejas: 0x8f5f2c, cola: 0xe8d5b4, patas: 0x6f4a22, ...OJOS },
  },
  alcito: {
    plano: 'ungulado',
    P: { s: 1.18, cabezaRx: 3.8, cabezaRy: 4.6, hocico: 3.6, hocicoAncho: 2.8, hocicoAlto: 1.8, cuernos: { h: 5, incl: 1.6, g: 2, ramas: 3 }, orejas: { forma: 'redonda', h: 2, w: 3 }, cola: { tipo: 'pene', len: 1, ancho: 2 } },
    C: { cuerpo: 0x6b5334, cabeza: 0x5c4628, hocico: 0x8f7350, nariz: 0x2a2018, cuernos: 0xb09a72, cuernosPunta: 0xd0bb92, orejas: 0x5c4628, cola: 0x5c4628, patas: 0x4f3c24, ...OJOS },
  },
  jirafita: {
    plano: 'ungulado',
    P: { s: 1.12, cabezaRx: 3.4, cabezaRy: 3.8, cabezaY: 8.4, cuello: 6, ySuelo: -12, hocico: 2.8, hocicoAncho: 2.2, cuernos: { h: 2, incl: 0.4, g: 2, ramas: 0 }, manchas: [[-2, -4, 2], [2, -6, 2], [0, -1, 2]], cola: { tipo: 'larga', len: 4, ancho: 1 } },
    C: { cuerpo: 0xe8c078, cabeza: 0xf0cd8a, cuello: 0xe8c078, mancha: 0xa9713a, hocico: 0x6f5238, nariz: 0x3a2c1e, cuernos: 0xc49a5e, cuernosPunta: 0x6f5238, orejas: 0xf0cd8a, orejaInt: 0xd8a95e, cola: 0xe8c078, colaPunta: 0x6f5238, patas: 0xd4a860, ...OJOS },
  },
  llamita: {
    plano: 'ungulado',
    P: { s: 1.04, cabezaRx: 3.4, cabezaRy: 3.8, cabezaY: 7.4, cuello: 5, cuelloCurva: 1, ySuelo: -12, hocico: 2.6, hocicoAncho: 2, orejas: { forma: 'puntiaguda', h: 3, w: 2, incl: 0.3 }, cuerpoP: 2.6, cola: { tipo: 'pene', len: 1, ancho: 2 } },
    C: { cuerpo: 0xe0d2c0, cabeza: 0xefe6da, cuello: 0xe6dacb, hocico: 0xa8947c, nariz: 0x3f3528, orejas: 0xcbbca6, orejaInt: 0xe6dacb, cola: 0xd8cbb8, patas: 0xb8a88e, ...OJOS },
  },
  potrillo: {
    plano: 'ungulado',
    P: { s: 1.12, cabezaRx: 3.8, cabezaRy: 4.8, cabezaY: 5.6, hocico: 3.6, hocicoAncho: 2.2, hocicoAlto: 1.8, hocicoAfilado: 0.2, orejas: { forma: 'puntiaguda', h: 3, w: 2, incl: 0.4 }, espinas: [-2, 0, 2], espinaAlto: 2, espinaAncho: 2, ySuelo: -12, cola: { tipo: 'larga', len: 6, ancho: 2, curva: 0.5 } },
    C: { cuerpo: 0x9a6a44, cabeza: 0x8a5c3a, espina: 0x3a2a1c, acento: 0x3a2a1c, hocico: 0x6f4c30, nariz: 0x2f2418, orejas: 0x7a5236, cola: 0x3a2a1c, colaPunta: 0x2a1e14, patas: 0x8a5c3a, pezuña: 0x2f2418, ...OJOS },
  },
  cabrita: {
    plano: 'ungulado',
    P: { s: 0.92, cabezaRx: 3.6, cabezaRy: 4.0, hocico: 2.4, hocicoAncho: 2, cuernos: { h: 4, incl: -1.2, g: 1, ramas: 0 }, orejas: { forma: 'larga', h: 2, w: 2, incl: 1.4 }, pecho: true, cola: { tipo: 'pene', len: 1, ancho: 1 }, manchas: [[0, -3, 1.6]] },
    C: { cuerpo: 0xe6ded2, cabeza: 0xf0eae0, cuernos: 0x6f6252, cuernosPunta: 0x4a4034, hocico: 0xd0c6b8, nariz: 0x3f382e, orejas: 0xd8cec0, orejaInt: 0xf5efe5, mancha: 0x8f8578, pecho: 0xf5efe5, cola: 0xbfb5a8, patas: 0xcfc5b6, pezuña: 0x4a4034, ojo: 0x2b1f2c, brillo: 0xffe9c8 },
  },
  cangurito: {
    plano: 'ungulado',
    P: { s: 1.06, cabezaRx: 3.6, cabezaRy: 4.2, cabezaY: 3.6, hocico: 2, hocicoAncho: 2, orejas: { forma: 'larga', h: 4.4, w: 2, incl: 0.5 }, ySuelo: -12, pataGruesa: true, patasSaltadoras: true, cola: { tipo: 'larga', len: 6, ancho: 3.2, alto: -0.2, curva: 0.35 } },
    C: { cuerpo: 0xb08968, cabeza: 0xc09a78, hocico: 0xe0cdae, nariz: 0x3f3228, orejas: 0xa37f5f, orejaInt: 0xd9c3a6, cola: 0x9a7657, patas: 0xa37f5f, ...OJOS },
  },

  /* ============================================================= ANFIBIOS == */
  ranita: {
    plano: 'anfibio',
    P: { s: 0.96, cabezaRx: 4.8, cabezaRy: 3.6, ojosSaltones: true, ojosR: 1.9, bocaDY: -2.6, lomo: true, dedos: 3, cuerpoRx: 3.6 },
    C: { cuerpo: 0x6fbf5a, cabeza: 0x7ac966, lomo: 0x57a346, patas: 0x57a346, boca: 0x3f6b34, rubor: 0xff93ae, parpado: 0x7ac966, ojo: 0x2b1f2c, brillo: 0xffffff },
  },
  sapito: {
    plano: 'anfibio',
    P: { s: 1.0, cabezaRx: 5.0, cabezaRy: 3.6, cuerpoRx: 4.0, bocaDY: -2.4, lomo: true, manchas: [[-2.6, -3, 1.6], [2.6, -3, 1.6], [-1, 1, 1], [1, 1, 1]], dedos: 2 },
    C: { cuerpo: 0x8a7a4a, cabeza: 0x9c8a56, lomo: 0x6f6238, mancha: 0x6f6238, patas: 0x7a6b40, boca: 0x4a3f26, rubor: 0xe8a06a, ojo: 0x2b1f2c, brillo: 0xffe3a8 },
  },
  salamandrita: {
    plano: 'anfibio',
    P: { s: 0.9, cabezaRx: 4.0, cuerpoRx: 3.2, cuerpoRy: 4.2, branquias: 3, bocaDY: -2.4, manchas: [[-2, -3, 1.2], [2, -5, 1.2], [0, -1, 1]], dedos: 2 },
    C: { cuerpo: 0x2f2c38, cabeza: 0x3a3644, branquia: 0x8f5aa8, branquiaHi: 0xc88ad8, mancha: 0xf0b23a, patas: 0x2f2c38, boca: 0x6f4a7a, ojo: 0x14141a, brillo: 0xf0b23a },
  },
  tritoncito: {
    plano: 'anfibio',
    P: { s: 0.88, cabezaRx: 4.0, cabezaRy: 3.4, cuerpoRx: 3.2, cuerpoRy: 4.0, branquias: 4, lomo: true, bocaDY: -2.2, manchas: [[-2, -4, 1.2], [2, -2, 1.2]], dedos: 2 },
    C: { cuerpo: 0x3f6b4a, cabeza: 0x4a7a56, lomo: 0x2f5a3c, branquia: 0xe07a4a, branquiaHi: 0xf0a86a, mancha: 0xe8b23a, patas: 0x37604a, boca: 0x2f4a38, ...OJOS },
  },
  ajolote_celestial: {
    plano: 'anfibio',
    P: { s: 1.02, cabezaRx: 5.0, cabezaRy: 4.0, branquias: 6, bocaDY: -2.4, manchas: [[-2, -4, 1], [2, -2, 1], [0, -6, 1]], dedos: 3, rubor: true },
    C: { cuerpo: 0xf1a7c4, cabeza: 0xf6bcd6, branquia: 0xffffff, branquiaHi: 0xcfe4ff, mancha: 0xffe9a8, patas: 0xe794b8, boca: 0x5b3348, rubor: 0xff93ae, ojo: 0x24202f, brillo: 0xffffff },
  },

  /* =============================================================== REPTILES == */
  camaleoncito: {
    plano: 'reptil',
    P: { s: 0.9, cabezaRx: 4.4, ojosSaltones: true, ojosR: 1.8, ojosX: 0.5, casco: 3, cascoAncho: 1.4, hocico: 1.8, hocicoAncho: 2.6, cola: { tipo: 'rizada', len: 6, ancho: 1, curva: 0.6 }, manchas: [[-1, -4, 1.4], [2, -2, 1.4]] },
    C: { cuerpo: 0x59c26a, cabeza: 0x4fb060, casco: 0x3f9a52, parpado: 0x6fd87e, acento: 0xf0c04a, mancha: 0x3a8a4e, hocico: 0x4fb060, nariz: NEGRO, patas: 0x4a9a55, cola: 0x4a9a55, ...OJOS },
  },
  iguanita: {
    plano: 'reptil',
    P: { s: 1.06, hocico: 2.4, hocicoAncho: 3.2, espinas: [-4, -2, 0, 2, 4], espinaAlto: 3, espinaAncho: 2, cola: { tipo: 'larga', len: 8, ancho: 1.8, curva: 0.6 }, manchas: [[-2, -4, 1.4], [2, -2, 1.4]] },
    C: { cuerpo: 0x4e9b52, cabeza: 0x5cae60, espina: 0x3a7a44, acento: 0xd98a3a, mancha: 0x3a7a44, hocico: 0x6fbe72, nariz: 0x2b3a2c, patas: 0x3f8446, cola: 0x4e9b52, colaPunta: 0x377040, ...OJOS },
  },
  lagartijita: {
    plano: 'reptil',
    P: { s: 0.86, hocico: 2.2, hocicoAncho: 2.8, cola: { tipo: 'larga', len: 7, ancho: 1.4, curva: 0.7 }, escamas: true, manchas: [[-2, -3, 1.2], [2, -1, 1.2]] },
    C: { cuerpo: 0xc08a4a, cabeza: 0xd09a58, acento: 0x8a5a2c, mancha: 0x8a5a2c, hocico: 0xe0bc84, nariz: 0x3a2c1e, patas: 0xa8763c, cola: 0xc08a4a, ...OJOS },
  },
  geckito: {
    plano: 'reptil',
    P: { s: 0.8, cabezaRx: 4.6, cabezaRy: 3.4, ojosSaltones: true, ojosR: 2.1, ojoW: 3, ojoH: 3, hocico: 1.6, hocicoAncho: 2.6, cola: { tipo: 'larga', len: 4, ancho: 2, curva: 0.5 }, dedos: 3 },
    C: { cuerpo: 0x8fbf6a, cabeza: 0xa0cc7a, parpado: 0xb8d894, acento: 0x6f9a4e, mancha: 0xf0e2a0, hocico: 0xbcd894, nariz: 0x3a4a2c, patas: 0x7aa85a, cola: 0x8fbf6a, ojo: 0x2b1f2c, brillo: 0xffe9a8 },
  },
  pangolincito: {
    plano: 'reptil',
    P: { s: 0.94, cabezaRx: 3.8, cabezaRy: 3.2, cuerpoRx: 4.2, cuerpoRy: 4.0, casco: 2, cascoAncho: 2.4, hocico: 2.6, hocicoAncho: 1.2, hocicoAfilado: 0.8, bandas: { ancho: 1, paso: 2 }, cola: { tipo: 'larga', len: 4, ancho: 2.2, curva: 0.5 } },
    C: { cuerpo: 0xb99a62, cabeza: 0x8f7444, casco: 0xd0b478, banda: 0x9a7f4c, acento: 0x6f5a34, hocico: 0x4f3f26, nariz: 0x2f2418, patas: 0x8f7444, cola: 0xb99a62, ...OJOS },
  },
  tortuguita: {
    plano: 'tortuga',
    P: { s: 1.0, domos: true, manchas: [[-2, -3, 1.4], [2, -3, 1.4], [0, -1, 1.4]] },
    C: { caparazon: 0x4f8a5b, borde: 0x37604a, domos: 0x6aa576, cabeza: 0x8fbf7a, patas: 0x7aaa6a, mancha: 0xd8c47a, boca: 0x3f6b34, ...OJOS },
  },
  cocodrilito: {
    plano: 'cocodrilo',
    P: { s: 1.02 },
    C: { cuerpo: 0x4f7a4a, cabeza: 0x568a50, hocico: 0x4a7545, mandibula: 0xd8d2a8, espina: 0x3a5f38, cola: 0x456b40, patas: 0x3f6239, diente: HUESO, ojo: 0x2b1f2c, brillo: 0xfff0b0 },
  },
  serpientita: {
    plano: 'serpiente',
    P: { s: 1.0, anillos: 4, lengua: 3, hocico: 1.8, hocicoAncho: 2.6 },
    C: { cuerpo: 0x6fa05a, anillo: 0x57834a, cabeza: 0x79ae62, hocico: 0x84b86c, lengua: 0xd2415f, banda: 0x4a7040, ojo: 0x2b1f2c, brillo: 0xfff0b0 },
  },

  /* ============================================================== INSECTOS == */
  /* Antenas arriba, alas a los lados, patas colgando. La mariposa y la abeja se
     distinguen por la talla de las alas; la araña, por ocho patas. */
  mantisita: {
    plano: 'insecto',
    P: { s: 0.95, cabezaRx: 3.2, cabezaRy: 3.0, ojoW: 3, ojoH: 3, patasRapaces: true, rapazLargo: 3.4, cintura: true, antenas: 5, antenasCurva: 0.6, alas: [3.4], alasAlto: 2, alasForma: 'rect', patasPares: 3, patasPaso: 1.8 },
    C: { cuerpo: 0x6fbe5c, cabeza: 0x7ac966, acento: 0x4a9a4a, pala: 0x4a9a4a, alas: 0x9ad886, veta: 0x3f7a34, pata: 0x4a8a44, antena: 0x3f6b34, ...OJOS },
  },
  mariposita: {
    plano: 'insecto',
    P: { s: 0.82, alas: [6.4, 5], alasAlto: 3.2, alasPaso: 2.8, antenas: 4, antenasBola: true, patasInsecto: false, manchas: [[5, 1, 1.2], [-5, 1, 1.2]] },
    C: { cuerpo: 0x4a3f52, cabeza: 0x3f3548, alas: 0xf07fb0, veta: 0xb8548a, mancha: 0xffd9ec, acento: 0xffd9ec, antena: 0x3f3548, pata: 0x3f3548, ...OJOS },
  },
  polillita: {
    plano: 'insecto',
    P: { s: 0.86, alas: [5, 4], alasAlto: 2.6, alasForma: 'triangular', antenas: 4, antenasCurva: 0.4, patasInsecto: false },
    C: { cuerpo: 0x8f8478, cabeza: 0x7a7066, alas: 0xcfc4b2, veta: 0x9a8f7e, mancha: 0x6f6558, acento: 0xa89c8a, antena: 0x6f6558, pata: 0x6f6558, ...OJOS },
  },
  abejita: {
    plano: 'insecto',
    P: { s: 0.9, cabezaRx: 3.2, cuerpoRx: 3.4, cuerpoRy: 4.0, bandas: { ancho: 2, paso: 4 }, antenas: 3, alas: [4, 3], alasAlto: 2.2 },
    C: { cuerpo: 0xf3c531, cabeza: 0x3a3320, banda: 0x2b2410, mancha: 0x2b2410, alas: 0xdfeaf5, veta: 0xb9c8dc, pata: 0x2b2410, antena: 0x2b2410, acento: 0xe0a820, ...OJOS },
  },
  avispita: {
    plano: 'insecto',
    P: { s: 0.92, cabezaRx: 3.0, cuerpoRx: 2.8, cuerpoRy: 4.4, bandas: { ancho: 1, paso: 3 }, antenas: 4, alas: [4.6, 3.6], alasAlto: 1.8, alasForma: 'rect' },
    C: { cuerpo: 0xf0b422, cabeza: 0x2b2410, banda: 0x2b2410, mancha: 0x2b2410, alas: 0xe8f0f8, veta: 0xbcc8d6, pata: 0x2b2410, antena: 0x2b2410, acento: 0xd99a10, ojo: 0x14141a, brillo: 0xffffff },
  },
  hormiguita: {
    plano: 'insecto',
    P: { s: 0.8, cabezaRx: 3.4, cabezaRy: 3.2, cuerpoRx: 2.8, cuerpoRy: 3.8, antenas: 4, antenasCurva: 1.8, alas: false, patasPares: 3, patasLargo: 3, patasBajada: 2.6 },
    C: { cuerpo: 0x3f2f24, cabeza: 0x4a382c, acento: 0x2a1f18, pata: 0x2a1f18, antena: 0x2a1f18, ojo: 0x14141a, brillo: 0xd9c3a6 },
  },
  escarabajito: {
    plano: 'insecto',
    P: { s: 0.94, cabezaRx: 3.2, cuerpoRx: 3.6, cuerpoRy: 4.2, antenas: 3, antenasCurva: 0.8, alas: [4.6], alasAlto: 3, franjas: { y0: -8, y1: 0, xs: [0] } },
    C: { cuerpo: 0x2f3a52, cabeza: 0x252e44, alas: 0x3d5a7a, veta: 0x1b2233, franja: 0x1b2233, acento: 0x5a86ad, pata: 0x1b2233, antena: 0x1b2233, ojo: 0x14141a, brillo: 0xbcd8ef },
  },
  libelula: {
    plano: 'insecto',
    P: { s: 0.9, cabezaRx: 3.6, cabezaRy: 3.0, ojoW: 3, ojoH: 3, ojoDX: 0.3, alas: [7, 6.4], alasAlto: 1.2, alasPaso: 1.6, alasForma: 'rect', antenas: 1.5, patasPares: 3, patasLargo: 1.6 },
    C: { cuerpo: 0x2f8fb0, cabeza: 0x37a5c4, alas: 0xbfe6f2, veta: 0x7ac0d8, acento: 0x1e6f8a, pata: 0x1e6f8a, antena: 0x1e6f8a, ojo: 0x14141a, brillo: 0xdff4fb },
  },
  grillito: {
    plano: 'insecto',
    P: { s: 0.92, cabezaRx: 3.2, cuerpoRx: 3.4, cuerpoRy: 4.2, antenas: 6, antenasCurva: 0.5, alas: [4], alasAlto: 1.6, alasForma: 'rect', patasLargo: 3.4, patasBajada: 3 },
    C: { cuerpo: 0x6b4a2c, cabeza: 0x5a3e24, alas: 0x7a5636, veta: 0x4a3220, acento: 0x8a6440, pata: 0x4a3220, antena: 0x3f2a1a, ...OJOS },
  },
  saltamontes: {
    plano: 'insecto',
    P: { s: 0.94, cabezaRx: 3.2, cabezaRy: 3.4, cuerpoRx: 3.2, cuerpoRy: 4.4, antenas: 4, antenasCurva: 0.8, alas: [5], alasAlto: 1.8, alasForma: 'rect', patasLargo: 3.6, patasBajada: 3.4 },
    C: { cuerpo: 0x7fbe52, cabeza: 0x8ac966, alas: 0x6fa84a, veta: 0x4a8a3a, acento: 0x3f7a34, pata: 0x4a8a3a, antena: 0x3f7a34, ...OJOS },
  },
  mariquita: {
    plano: 'insecto',
    P: { s: 0.88, cabezaRx: 3.0, cabezaRy: 2.6, cuerpoRx: 4.0, cuerpoRy: 3.8, alas: false, antenas: 2, antenasCurva: 0.6, franjas: { y0: -8, y1: 0, xs: [0] }, manchas: [[-2, -4, 1.1], [2, -4, 1.1], [-2.4, -1, 1.1], [2.4, -1, 1.1]] },
    C: { cuerpo: 0xd8342c, cabeza: 0x22222a, franja: 0x22222a, mancha: 0x22222a, acento: 0x22222a, pata: 0x22222a, antena: 0x22222a, ojo: 0x14141a, brillo: 0xffffff },
  },
  luciernita: {
    plano: 'insecto',
    P: { s: 0.86, cabezaRx: 3.2, cuerpoRx: 3.4, cuerpoRy: 4.2, antenas: 3, alas: [4], alasAlto: 2, alasForma: 'rect', manchas: [[0, -7, 2], [-1.6, -6, 1.4], [1.6, -6, 1.4]] },
    C: { cuerpo: 0x3a3a2c, cabeza: 0x2b2b22, alas: 0x4a4a38, mancha: 0xfff3a8, acento: 0xffd24a, pata: 0x2b2b22, antena: 0x2b2b22, ojo: 0x14141a, brillo: 0xfff3a8 },
  },
  aranita: {
    plano: 'insecto',
    P: { s: 0.9, cabezaRx: 3.6, cabezaRy: 3.4, cuerpoRx: 4.0, cuerpoRy: 4.0, ojoW: 3, ojoH: 3, ojoDX: 0.28, patasPares: 4, patasPaso: 1.6, patasLargo: 3.4, patasBajada: 3, antenas: false, manchas: [[-2, -5, 1.2], [2, -5, 1.2]] },
    C: { cuerpo: 0x4a3f52, cabeza: 0x3a3040, mancha: 0xded4c4, acento: 0x6f6078, pata: 0x3a3040, ...OJOS },
  },

  /* ========================================================= MAR Y AGUA == */
  delfincito: {
    plano: 'marino',
    P: { s: 1.06, pico: 2.2, dorsalOscuro: true, ventre: true, rubor: true },
    C: { cuerpo: 0x7f93ad, dorso: 0x516686, ventre: 0xdfe7f0, aleta: 0x516686, hocico: 0x93a6bd, boca: 0x4a5a72, rubor: 0xff93ae, ...OJOS },
  },
  ballenita: {
    plano: 'marino',
    P: { s: 1.2, cabezaRx: 5.2, cuerpoRx: 4.6, cuerpoRy: 4.8, surtidor: 4, chnouk: true, ventre: true, pico: false },
    C: { cuerpo: 0x3f5f80, dorso: 0x2f4a68, ventre: 0xd8e4ee, aleta: 0x2f4a68, aletaPunta: 0x243a52, surtidor: 0xbfd8ea, boca: 0x243a52, ...OJOS },
  },
  caballito: {
    plano: 'acuatico',
    P: { s: 0.9, cabezaRx: 3.6, cabezaY: 4.2, cuerpoRx: 2.8, cuerpoRy: 4.4, hocicoLargo: 3.4, corona: true, colaRizada: true, ventosa: true, dorsal: false },
    C: { cuerpo: 0xe8a25c, cabeza: 0xf0b06c, acento: 0xd2854a, hocico: 0xc9763f, corona: 0xf3c531, ventre: 0xf6d9ae, ...OJOS },
  },
  tiburoncito: {
    plano: 'acuatico',
    P: { s: 1.14, cabezaRx: 4.2, cabezaRy: 3.6, cuerpoRx: 3.6, cuerpoRy: 4.6, hocicoLargo: 2.2, ventosa: true, franjas: { y0: -2, y1: 2, xs: [-3, -2, -1] } },
    C: { cuerpo: 0x64748c, acento: 0x46566e, dorso: 0x3c4c62, ventre: 0xe2e8ef, hocico: 0x64748c, franja: 0x46566e, ojo: 0x14141a, brillo: 0xffffff },
  },
  mantarrayita: {
    plano: 'acuatico',
    P: { s: 1.1, forma: 'manta' },
    C: { cuerpo: 0x4a5a78, acento: 0x2f3d58, mancha: 0xdfe7f0, ojo: 0x14141a, brillo: 0xffffff },
  },

  /* ======================================================= CRUSTACEOS ETC == */
  cangrejito: {
    plano: 'crustaceo',
    P: { s: 1.0, pinzas: true, patasLado: true, antenas: 3, ojosPedunculo: true },
    C: { caparazon: 0xd24b3b, cabeza: 0xc24436, pinzas: 0xe0654f, acento: 0xe0654f, borde: 0xa8382c, pata: 0x8f3529, antena: 0x8f3529, pedunculo: 0x8f3529, ojoBlanco: 0xf6efdd, ...OJOS },
  },
  langostita: {
    plano: 'crustaceo',
    P: { s: 1.08, pinzas: true, patasLado: true, antenas: 6, ojosPedunculo: true, manchas: [[-2, -2, 1.2], [2, -1, 1.2]] },
    C: { caparazon: 0xe0785a, cabeza: 0xcf6a4e, pinzas: 0xf0946e, acento: 0xc85a3f, borde: 0xa84a34, mancha: 0xd9c8b0, pata: 0xa84a34, antena: 0xa84a34, pedunculo: 0xa84a34, ojoBlanco: 0xf6efdd, ...OJOS },
  },
  pulpito: {
    plano: 'tentaculado',
    P: { s: 1.02, orejasDumbo: true, rubor: true, brazos: 5, ojoGrande: true },
    C: { cuerpo: 0xb07fb8, acento: 0x9a68a4, mejilla: 0xc99ad1, tentaculo: 0xc99ad1, rubor: 0xff93ae, ...OJOS },
  },
  medusita: {
    plano: 'tentaculado',
    P: { s: 1.0, forma: 'medusa', rubor: true },
    C: { cuerpo: 0xa9d6e8, domo: 0x7fbfe0, tentaculo: 0xcfe6f2, acento: 0x6fa8cc, rubor: 0xff93ae, ...OJOS },
  },
  nutria: {
    plano: 'pinnipedo',
    P: { s: 0.96, hocico: 1.8, hocicoAncho: 2.2, bigotes: true, rubor: true },
    C: { cuerpo: 0x6f563d, cabeza: 0x8a6c4c, hocico: 0xd8c3a0, nariz: 0x2b2018, bigote: 0xf2e8d4, aleta: 0x5a4530, rubor: 0xff93ae, ...OJOS },
  },
  focita: {
    plano: 'pinnipedo',
    P: { s: 1.06, cabezaRx: 4.8, hocico: 1.6, hocicoAncho: 2.6, bigotes: true, rubor: true, orejas: false },
    C: { cuerpo: 0x8f9aa8, cabeza: 0xa4adb9, hocico: 0xc8d0d8, nariz: 0x2b2f36, bigote: 0xf6f2ea, aleta: 0x6f7a88, rubor: 0xff93ae, ...OJOS },
  },
  morsita: {
    plano: 'pinnipedo',
    P: { s: 1.16, cabezaRx: 5.0, cuerpoRx: 4.4, hocico: 2.2, hocicoAncho: 3, bigotes: true, dientes: 1, dientesBaja: 3 },
    C: { cuerpo: 0x8a7a64, cabeza: 0x9c8c76, hocico: 0xb8a892, nariz: 0x3a3228, bigote: 0xf2ead8, aleta: 0x6f6250, diente: HUESO, ...OJOS },
  },
  murcielaguito: {
    plano: 'murcielago',
    P: { s: 0.92, dientes: true },
    C: { cuerpo: 0x4a4552, cabeza: 0x544e5c, oreja: 0x3a3542, orejaInt: 0x6f6678, alas: 0x2f2b36, diente: HUESO, ...OJOS },
  },
  estrellita: {
    plano: 'invertebrado',
    P: { s: 1.0, forma: 'estrella', manchas: [[0, 0, 1.6]] },
    C: { cuerpo: 0xf08a4a, centro: 0xf7b078, punta: 0xffd9b0, mancha: 0xd96a30, boca: 0x8f4520, ...OJOS },
  },
  caracolito: {
    plano: 'invertebrado',
    P: { s: 1.0 },
    C: { caparazon: 0xd9a76a, borde: 0xa87c44, espiral: 0x8f6a3a, cabeza: 0xe8cfae, cuerpo: 0xd8bb92, patas: 0xc9a878, ojoBlanco: 0xf6efdd, boca: 0x6f5638, ...OJOS },
  },

  /* ============================================================== EXOTICOS == */
  alebrijito: {
    plano: 'exotico',
    P: {
      s: 1.04, cuernos: { h: 5, incl: 1.4, g: 1, ramas: 2 }, cresta: { n: 4, alto: 3, w: 2, paso: 2 },
      alas: 4.4, manchas: [[-2, -4, 1.4], [2, -2, 1.4], [0, 2, 1.2]], cola: { tipo: 'larga', len: 6, ancho: 1.6 },
    },
    C: { cuerpo: 0x2f9ec4, cabeza: 0x38b0d6, cuernos: 0xf0b422, acento: 0xd2415f, cresta: 0x8ad05a, alas: 0xf07fb0, veta: 0xd2415f, mancha: 0xf6e04a, franja: 0x2b2410, cola: 0x2f9ec4, colaPunta: 0xf0b422, patas: 0x2580a4, ...OJOS },
  },
  dragoncito: {
    plano: 'exotico',
    P: {
      s: 1.08, cabezaRx: 4.4, cuernos: { h: 4.5, incl: 0.6, g: 1, ramas: 1 }, cresta: { n: 5, alto: 3, paso: 2 },
      escamas: true, alas: 5.4, cola: { tipo: 'larga', len: 7, ancho: 1.8, curva: 0.6 },
      manchas: [[-2, -4, 1.2], [2, -2, 1.2]],
    },
    C: { cuerpo: 0x2f8f6a, cabeza: 0x3aa478, cuernos: 0xe4e0d2, acento: 0x1f6b4e, cresta: 0x7fd8a8, alas: 0x27795c, veta: 0x7fd8a8, mancha: 0xd8c47a, lengua: 0xd2415f, cola: 0x2f8f6a, patas: 0x1f6b4e, ojo: 0x2b1f2c, brillo: 0xffe08a },
  },
  ornitorrincocito: {
    plano: 'exotico',
    P: { s: 1.0, cabezaRx: 4.4, cabezaRy: 3.6, pico: 2.4, picoAncho: 4.6, picoAlto: 1.6, picoCurva: 0.1, picoAfilado: 0.25, cola: { tipo: 'larga', len: 4, ancho: 3.4, curva: 0.15 } },
    C: { cuerpo: 0x5a6b4e, cabeza: 0x6b7d5c, pico: 0x3f4a58, picoPunta: 0x2f3844, cola: 0x4a5a42, patas: 0x4a5a42, acento: 0x8a9a6a, ...OJOS },
  },
  /* El flamenco está en exotico pero morfológicamente es ave zancuda. */
  flamenco: {
    plano: 'ave',
    P: {
      s: 1.05, cabezaRx: 3.6, cabezaRy: 3.4, cuello: 7, cuelloCurva: 5, cuelloGrueso: 1,
      pico: 3, picoAncho: 2, picoAlto: 1.6, picoCurva: 1.1, picoAfilado: 0.7,
      alasExtendidas: true, alasAncho: 5, alasAlto: 2.4, colaTipo: 'plumas', colaLargo: 3,
      patasLargas: 7, 
    },
    C: { cuerpo: 0xef8fb2, cabeza: 0xf7a8c4, cuello: 0xf4a0bc, alas: 0xe46a94, veta: 0xc2406f, acento: 0xd2415f, pico: 0xf2e6cf, picoPunta: 0x2a2730, cola: 0xef8fb2, patas: 0xe08aa0, ...OJOS },
  },

  /* =============================================================== HÉROE == */
  ajolotito: { plano: 'bespoke', build: buildAjolotito },
};
