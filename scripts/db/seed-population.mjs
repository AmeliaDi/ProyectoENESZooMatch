/**
 * Siembra una población sintética determinista en una base local (PGlite).
 *
 * Solo para bases desechables: `db:perf` necesita filas reales para que un
 * presupuesto de tiempo signifique algo, y producir esas filas en producción
 * está fuera de discusión. Todo sale de una semilla fija y nada se escribe
 * fuera de la base en memoria.
 *
 * Cumple a propósito las restricciones del esquema vigente (vectores de 26 y
 * 16, identidad coherente con sus partes, alias único, similitud en (0,1]):
 * una siembra que violara un CHECK estaría midiendo un escenario imposible.
 */
import { mulberry32 } from "./random.mjs";

const CONSONANTS = "BCDFGHJKLMNPQRSTVWXYZ";
const ROMANCE_VECTOR = 26;
const FRIENDSHIP_VECTOR = 16;
const CHUNK = 200;

/** Base-21 sobre cuatro posiciones: sufijos únicos para i < 194 481. */
export function sufijo(i) {
  let n = i;
  let out = "";
  for (let p = 0; p < 4; p += 1) {
    out = CONSONANTS[n % 21] + out;
    n = Math.floor(n / 21);
  }
  return out;
}

/** UUID determinista y válido (versión 4, variante 10) a partir de un entero. */
export function uuid(i) {
  return `00000000-0000-4000-8000-${i.toString(16).padStart(12, "0")}`;
}

const hex64 = (i) => (i.toString(16).padStart(4, "0").repeat(16)).slice(0, 64);
const vector = (random, n) => Array.from({ length: n }, () => +random().toFixed(4));

/** Inserta por lotes: 600 perfiles en un solo statement es más lento de depurar que de escribir. */
async function insertRows(db, prefix, columns, rows) {
  for (let start = 0; start < rows.length; start += CHUNK) {
    const batch = rows.slice(start, start + CHUNK);
    const values = batch.map((_, index) => `(${Array.from({ length: columns }, (__, c) => `$${index * columns + c + 1}`).join(",")})`).join(",");
    const params = [];
    // push(...row) mete cada valor como un parámetro; un flat() destruiría los
    // vectores, que son arrays dentro de la fila.
    for (const row of batch) params.push(...row);
    await db.query(`${prefix} values ${values}`, params);
  }
}

/**
 * Catálogo sembrado, filtrado a los nombres que caben en el formato de alias
 * (`^[a-záéíóúüñ]+( [a-záéíóúüñ]+)* · [BCDF…]{4}$`). Se comparte con `db:perf`:
 * si la siembra y la medición eligieran nombres con criterios distintos, la
 * medición eclosionaría un alias que la siembra jamás produjo.
 */
export async function catálogo(db) {
  const animals = (
    await db.query(
      `select id, lower(diminutivo_es) as diminutivo from public.animals
       where lower(diminutivo_es) ~ '^[a-záéíóúüñ]+( [a-záéíóúüñ]+)*$' order by id`,
    )
  ).rows;
  const colors = (
    await db.query(
      `select id, lower(nombre) as nombre from public.colors
       where lower(nombre) ~ '^[a-záéíóúüñ]+( [a-záéíóúüñ]+)*$' order by id`,
    )
  ).rows;
  if (animals.length === 0 || colors.length === 0) {
    throw new Error("el catálogo local está vacío: aplica supabase/seed.sql antes de sembrar población");
  }
  return { animals, colors };
}

/**
 * @param db instancia PGlite con el esquema ya aplicado y el catálogo sembrado.
 * @param config población declarada en `data/db-perf.json`.
 */
export async function seedPopulation(db, config) {
  const random = mulberry32(config.semilla);
  const { animals, colors } = await catálogo(db);

  const eclosionados = Math.round(config.perfiles * config.ratio_eclosionados);
  const completados = eclosionados + config.huevos_completos;

  const now = new Date();

  // `profiles.user_id` apunta a `auth.users`, y en producción esa fila la crea
  // GoTrue. Aquí la crea la siembra: sin ella el primer perfil falla por FK y la
  // medición no llegaría a empezar.
  await insertRows(db, "insert into auth.users (id)", 1, Array.from({ length: config.perfiles }, (_, i) => [uuid(i)]));

  const profileRows = [];
  for (let i = 0; i < config.perfiles; i += 1) {
    const baja = i >= config.perfiles - config.bajas;
    const hatch = i < eclosionados;
    const done = i < completados;
    const animal = hatch ? animals[Math.floor(random() * animals.length)] : null;
    const color = hatch ? colors[Math.floor(random() * colors.length)] : null;
    profileRows.push([
      uuid(i),
      hex64(i),
      hatch ? animal.id : null,
      hatch ? color.id : null,
      hatch ? `${animal.diminutivo} ${color.nombre} · ${sufijo(i)}` : null,
      hatch ? animal.diminutivo : null,
      hatch ? color.nombre : null,
      hatch ? sufijo(i) : null,
      hatch ? "eclosionado" : "huevo",
      hatch ? now : null,
      done ? now : null,
      vector(random, ROMANCE_VECTOR),
      vector(random, FRIENDSHIP_VECTOR),
      { honestidad_emocionalidad: +random().toFixed(3), sensibilidad_estetica: +random().toFixed(3) },
      config.etiqueta_version,
      baja ? now : null,
    ]);
  }
  await insertRows(db,
    `insert into public.profiles (user_id, matricula_hash, animal_id, color_id, alias_completo, alias_animal, alias_color, alias_sufijo,
       estado_identidad, eclosionado_en, quiz_completed_at, romance_vector, amistad_vector, dimension_scores, params_version, eliminado_en)`,
    16,
    profileRows);

  // Los pares se generan igual que en la app: un top-k por persona, deduplicado
  // por pareja y track, con la similitud dentro del rango que exige el CHECK.
  const pairs = [];
  const seen = new Set();
  for (let i = 0; i < eclosionados; i += 1) {
    for (let k = 0; k < config.top_k; k += 1) {
      const j = Math.floor(random() * eclosionados);
      if (j === i) continue;
      const [a, b] = i < j ? [i, j] : [j, i];
      for (const track of ["romance", "amistad"]) {
        const id = `${track}:${a}:${b}`;
        if (seen.has(id)) continue;
        seen.add(id);
        pairs.push({ a, b, user_a: uuid(a), user_b: uuid(b), track, similarity: +(0.3 + random() * 0.7).toFixed(4), badges: [] });
      }
    }
  }
  await insertRows(db, "insert into public.matches (user_a, user_b, track, similarity, badges)", 5,
    pairs.map((p) => [p.user_a, p.user_b, p.track, p.similarity, p.badges]));

  // Un solo «welcome» y un solo «identity» por persona: los índices únicos
  // parciales lo exigen, así que los demás tipos se repiten round-robin.
  const types = ["chat", "no_match", "match_romance", "match_amistad"];
  const notifications = [];
  for (let i = 0; i < completados; i += 1) {
    notifications.push([uuid(i), "welcome", "bienvenida", "cuerpo de prueba", {}, false]);
    for (let n = 0; n < config.notificaciones_por_perfil; n += 1) {
      notifications.push([
        uuid(i),
        types[n % types.length],
        "título de prueba",
        "cuerpo de prueba",
        {},
        n % 3 === 0 ? false : true,
      ]);
    }
  }
  await insertRows(db, "insert into public.notifications (user_id, type, title, body, metadata, read)", 6, notifications);

  // Las conversaciones se abren SOBRE PARES QUE EXISTEN EN `matches`, no sobre
  // duplas al azar. `db:audit` mide la conservación («cero conversaciones cuyo
  // par ya no está en matches»): si la siembra inventara conversaciones
  // huérfanas, el invariante nacería roto y la auditoría sería ruido permanente.
  const parejas = new Map();
  for (const p of pairs) {
    for (const i of [p.a, p.b]) {
      const lista = parejas.get(i);
      if (lista) lista.push(p);
      else parejas.set(i, [p]);
    }
  }

  const conversationRows = [];
  const opened = new Set();
  for (let i = 0; i < eclosionados; i += 1) {
    const candidatos = parejas.get(i) ?? [];
    for (let c = 0; c < config.conversaciones_por_perfil && c < candidatos.length; c += 1) {
      const p = candidatos[c];
      const id = `${p.user_a}:${p.user_b}`;
      if (opened.has(id)) continue;
      opened.add(id);
      conversationRows.push([p.track, p.user_a, p.user_b]);
    }
  }
  await insertRows(db, "insert into public.conversations (track, user_a, user_b)", 3, conversationRows);

  const live = (await db.query("select id, user_a, user_b from public.conversations order by created_at")).rows;
  const messageRows = [];
  for (const c of live) {
    for (let m = 0; m < config.mensajes_por_conversacion; m += 1) {
      messageRows.push([c.id, m % 2 === 0 ? c.user_a : c.user_b, `mensaje de prueba ${m}`]);
    }
  }
  if (messageRows.length > 0) {
    await insertRows(db, "insert into public.conversation_messages (conversation_id, author, body)", 3, messageRows);
  }

  // Rompehielos: `rondas_por_conversacion` rondas por conversación, con su
  // respuesta de cada parte y la reacción de quien recibió. Sin estas filas, los
  // renglones de `readonly-audit/07_chat.sql` serían verdes por vacío — y justo
  // ahí viven los tres CHECK declarados NOT VALID, que la base no revisa.
  const roundRows = [];
  const answerRows = [];
  const reactionRows = [];
  for (const c of live) {
    for (let idx = 0; idx < config.rondas_por_conversacion; idx += 1) {
      const asker = idx % 2 === 0 ? c.user_a : c.user_b;
      const receptor = idx % 2 === 0 ? c.user_b : c.user_a;
      // La ronda intermedia se escribe a mano y las demás salen del banco de
      // prompts: así la siembra ejercita las dos ramas de
      // `conversation_rounds_one_question` en vez de una sola.
      const prompt = idx === 1 ? null : `p00${idx + 1}`;
      const texto = idx === 1 ? `pregunta propia ${idx + 1}` : null;
      roundRows.push([c.id, idx, asker, prompt, texto]);
      for (const autor of [c.user_a, c.user_b]) {
        answerRows.push([c.id, autor, idx, `respuesta de prueba ${idx + 1}`]);
      }
      reactionRows.push([c.id, idx, receptor, "me gusta"]);
    }
  }
  await insertRows(db, "insert into public.conversation_rounds (conversation_id, idx, asker, prompt_id, custom_text)", 5, roundRows);
  await insertRows(db, "insert into public.conversation_answers (conversation_id, author, round, body)", 4, answerRows);
  await insertRows(db, "insert into public.conversation_reactions (conversation_id, idx, author, emoji)", 4, reactionRows);

  return {
    perfiles: config.perfiles,
    eclosionados,
    completados,
    bajas: config.bajas,
    pares: pairs.length,
    notificaciones: notifications.length,
    conversaciones: live.length,
    mensajes: messageRows.length,
    rondas: roundRows.length,
    respuestas_de_ronda: answerRows.length,
    reacciones: reactionRows.length,
  };
}
