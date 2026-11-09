/**
 * Kernel voxel del pipeline 2.5D.
 *
 * Port literal del algoritmo verificado en el spike del navegador: la fusión
 * greedy es biyectiva (volumen de cuboides === nº de vóxeles) y el modelo debe
 * quedar en un solo componente conexo. Ambos invariantes se comprueban en run.mts.
 */

export const K = (x, y, z) => x + ',' + y + ',' + z;
export const parse = k => k.split(',').map(Number);

export function put(map, x, y, z, c) {
  map.set(K(x, y, z), c);
  return map;
}

export function box(map, x0, x1, y0, y1, z0, z1, c) {
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) put(map, x, y, z, c);
  return map;
}

/**
 * Superelipsoide |dx/rx|^p + |dy/ry|^p + |dz/rz|^p <= 1.
 * p=2 esfera suave; p=3 da caras frontales grandes y esquinas redondeadas,
 * que es lo que sobrevive la pixelación; p=4+ se vuelve caja y se astilla.
 */
export function ellipsoid(map, cx, cy, cz, rx, ry, rz, c, p = 3) {
  for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
        const d =
          Math.abs((x - cx) / rx) ** p +
          Math.abs((y - cy) / ry) ** p +
          Math.abs((z - cz) / rz) ** p;
        if (d <= 1) put(map, x, y, z, c);
      }
  return map;
}

/** Recolorea el vóxel con mayor z de la columna (x,y): el detalle queda coplanar al frente. */
export function paintFront(map, x, y, c) {
  let best = null;
  for (const k of map.keys()) {
    const p = parse(k);
    if (p[0] === x && p[1] === y && (best === null || p[2] > best)) best = p[2];
  }
  if (best !== null) map.set(K(x, y, best), c);
  return map;
}

/** Recolorea el vóxel con menor z de la columna (x,y): detalle en la nuca/lomo. */
export function paintBack(map, x, y, c) {
  let best = null;
  for (const k of map.keys()) {
    const p = parse(k);
    if (p[0] === x && p[1] === y && (best === null || p[2] < best)) best = p[2];
  }
  if (best !== null) map.set(K(x, y, best), c);
  return map;
}

/** Recolorea el vóxel con mayor x de la fila (y,z): detalle de perfil. */
export function paintRight(map, y, z, c) {
  let best = null;
  for (const k of map.keys()) {
    const p = parse(k);
    if (p[1] === y && p[2] === z && (best === null || p[0] > best)) best = p[0];
  }
  if (best !== null) map.set(K(best, y, z), c);
  return map;
}

export function recolor(map, pred, c) {
  for (const [k, v] of map) {
    const p = parse(k);
    if (pred(p[0], p[1], p[2], v)) map.set(k, c);
  }
  return map;
}

/** Greedy 2D por corte Y (extiende en X, luego en Z) y fusión en Y por huella identical. */
export function buildCuboids(map) {
  const ys = [...new Set([...map.keys()].map(k => +k.split(',')[1]))].sort((a, b) => a - b);
  const out = [];
  for (const y of ys) {
    const slice = new Map();
    for (const [k, c] of map) {
      const p = parse(k);
      if (p[1] === y) slice.set(p[0] + ',' + p[2], c);
    }
    const xs = [...new Set([...slice.keys()].map(k => +k.split(',')[0]))].sort((a, b) => a - b);
    const zs = [...new Set([...slice.keys()].map(k => +k.split(',')[1]))].sort((a, b) => a - b);
    for (const x of xs)
      for (const z of zs) {
        const c = slice.get(x + ',' + z);
        if (c === undefined) continue;
        let x1 = x;
        while (slice.get(x1 + 1 + ',' + z) === c) x1++;
        let z1 = z;
        for (;;) {
          let ok = true;
          for (let xx = x; xx <= x1; xx++)
            if (slice.get(xx + ',' + (z1 + 1)) !== c) {
              ok = false;
              break;
            }
          if (!ok) break;
          z1++;
        }
        for (let xx = x; xx <= x1; xx++) for (let zz = z; zz <= z1; zz++) slice.delete(xx + ',' + zz);
        out.push({ x0: x, x1, y0: y, y1: y, z0: z, z1, c });
      }
  }
  const open = new Map();
  for (const b of out) {
    const k = [b.c, b.x0, b.x1, b.z0, b.z1].join('|');
    let list = open.get(k);
    if (!list) {
      list = [];
      open.set(k, list);
    }
    const prev = list.find(q => q.y1 === b.y0 - 1);
    if (prev) prev.y1 = b.y1;
    else list.push(b);
  }
  return [...open.values()].flat();
}

/**
 * 2.5D: proyección frontal = UN nivel de arte. Para cada columna (x,y) se toma el
 * color del vóxel más cercano y se extruye `depth` vóxeles hacia atrás.
 */
export function frontLayer(map, depth) {
  const front = new Map();
  for (const [k, c] of map) {
    const [x, y, z] = parse(k);
    const rk = x + ',' + y;
    const cur = front.get(rk);
    if (cur === undefined || z > cur.z) front.set(rk, { z, c });
  }
  const flat = new Map();
  for (const [rk, v] of front) {
    const [x, y] = rk.split(',').map(Number);
    for (let d = 0; d < depth; d++) flat.set(K(x, y, d), v.c);
  }
  return flat;
}

/** Huecos del plano frontal: componentes bajo vecindad de 4 sobre las columnas (x,y). */
export function frontComponents(layer) {
  const cols = new Set();
  for (const k of layer.keys()) {
    const [x, y, z] = parse(k);
    if (z === 0) cols.add(x + ',' + y);
  }
  const seen = new Set();
  const comps = [];
  for (const seed of cols) {
    if (seen.has(seed)) continue;
    const comp = [];
    const queue = [seed];
    seen.add(seed);
    while (queue.length) {
      const cur = queue.pop();
      comp.push(cur);
      const [x, y] = cur.split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = x + dx + ',' + (y + dy);
        if (cols.has(nk) && !seen.has(nk)) {
          seen.add(nk);
          queue.push(nk);
        }
      }
    }
    comps.push(comp);
  }
  comps.sort((a, b) => b.length - a.length);
  return comps;
}

/**
 * Costura de la huella frontal. El 2.5D sólo existe proyectado sobre XY, así que
 * la invariant que ve el usuario es que la SILUETA sea un cuerpo. Un apéndice que
 * flota en Z (un bigote por delante de la cara) es inofensivo: la proyección lo
 * aplasta contra la cabeza. Lo que sí se ve roto es el escalón diagonal de un
 * vóxel —puntas de oreja, ramitas de cuerna, nervios de ala—, que parte la silueta
 * en dos manchas. Aquí se rellena el L más corto entre la componente suelta y la
 * masa principal, con el color de la pieza suelta.
 *
 * Devuelve el nº de columnas añadidas. Es un parche de redondeo, no un permiso:
 * si un animal necesita muchas costuras, el defecto está en su plano y se corrige
 * allí. run.mjs lo reporta por separado.
 */
export function stitchFront(layer, depth) {
  let añadidas = 0;
  for (let guard = 0; guard < 64; guard++) {
    const comps = frontComponents(layer);
    if (comps.length < 2) break;
    const suelta = comps[comps.length - 1];
    const masa = new Set(comps[0]);
    let mejor = null;
    for (const a of suelta) {
      const [ax, ay] = a.split(',').map(Number);
      for (const b of masa) {
        const [bx, by] = b.split(',').map(Number);
        const d = Math.abs(ax - bx) + Math.abs(ay - by);
        if (d > 0 && (mejor === null || d < mejor.d)) mejor = { d, a: [ax, ay], b: [bx, by] };
      }
    }
    if (!mejor) break;
    const c = layer.get(K(mejor.a[0], mejor.a[1], 0));
    let x = mejor.a[0], y = mejor.a[1];
    const poner = (xx, yy) => {
      if (layer.has(K(xx, yy, 0))) return;
      for (let d = 0; d < depth; d++) layer.set(K(xx, yy, d), c);
      añadidas++;
    };
    while (x !== mejor.b[0]) {
      x += Math.sign(mejor.b[0] - x);
      poner(x, y);
    }
    while (y !== mejor.b[1]) {
      y += Math.sign(mejor.b[1] - y);
      poner(x, y);
    }
  }
  return añadidas;
}

/** Componentes conexos bajo vecindad de 6. Más de uno = hay piezas flotando. */
export function components(map) {
  const seen = new Set();
  const comps = [];
  for (const seed of map.keys()) {
    if (seen.has(seed)) continue;
    const comp = [];
    const queue = [seed];
    seen.add(seed);
    while (queue.length) {
      const cur = queue.pop();
      comp.push(cur);
      const [x, y, z] = parse(cur);
      for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
        const nk = K(x + dx, y + dy, z + dz);
        if (map.has(nk) && !seen.has(nk)) {
          seen.add(nk);
          queue.push(nk);
        }
      }
    }
    comps.push(comp);
  }
  comps.sort((a, b) => b.length - a.length);
  return comps;
}

export function bounds(map) {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const k of map.keys()) {
    const [x, y, z] = parse(k);
    if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x;
    if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
    if (z < b.z0) b.z0 = z; if (z > b.z1) b.z1 = z;
  }
  return b;
}

export function volumeOf(cuboids) {
  let v = 0;
  for (const b of cuboids) v += (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) * (b.z1 - b.z0 + 1);
  return v;
}

/** Silueta frontal como texto, tomando el vóxel de mayor z por celda. */
export function asciiFront(map, glyphs) {
  const front = new Map();
  for (const [k, c] of map) {
    const [x, y, z] = parse(k);
    const rk = x + ',' + y;
    const cur = front.get(rk);
    if (cur === undefined || z > cur.z) front.set(rk, c);
  }
  const b = bounds(map);
  const rows = [];
  for (let y = b.y1; y >= b.y0; y--) {
    let row = '';
    for (let x = b.x0; x <= b.x1; x++) {
      const c = front.get(x + ',' + y);
      row += c === undefined ? ' ' : (glyphs[c] ?? '?');
    }
    rows.push(row);
  }
  return rows.join('\n');
}
