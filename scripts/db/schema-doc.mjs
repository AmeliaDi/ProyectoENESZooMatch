/**
 * Render de docs/DB_ESQUEMA.md a partir del catálogo vivo. Archivo generado:
 * no editar a mano. Solo metadatos de esquema y conteos agregados; ninguna fila
 * de persona, mensaje, respuesta, matrícula, hash ni PIN sale de aquí.
 */

/** Propósito de cada tabla, en una línea. Sin esto el catálogo es un dump. */
const TABLE_PURPOSE = {
  "private.access_guard": "Ventanas y bloqueos del guard de entrada por dirección de red (ADR-023/026).",
  "private.pool_state": "Singleton con la revisión del pool; guard de versión de replace_matches.",
  "public.admin_audit": "Bitácora de acciones de la consola con actor real; nunca se escribe con service_role.",
  "public.admin_counters": "Contadores agregados del observatorio (clave, valor, quién y cuándo).",
  "public.admin_credentials": "Credencial de la consola de administración: hash con pepper y revisión.",
  "public.animals": "Catálogo de arquetipos: nombre fuente, diminutivo en español, categoría de fauna y afinidad.",
  "public.chat_blocks": "Bloqueos entre personas; retiran la conversación de ambas bandejas.",
  "public.chat_closures": "Cierres de conversación por par y track.",
  "public.chat_feedback_daily": "Feedback agregado por día y track; sin texto libre.",
  "public.chat_interests": "Señales de interés de chat (from_user, to_user, track); apertura mutua.",
  "public.chat_pins": "PIN de 4 dígitos hasheado con pepper; candado del dispositivo, no cifra los mensajes.",
  "public.chat_report_audit": "Bitácora de revisión de reportes.",
  "public.chat_reports": "Reportes de seguridad de una conversación.",
  "public.chat_security_events": "Eventos de seguridad del chat (intentos de PIN, bloqueos).",
  "public.colors": "Catálogo de colores de la identidad: nombre, hex, textura y temperatura.",
  "public.conversation_answers": "Respuestas selladas de cada ronda guiada, por autor.",
  "public.conversation_messages": "Mensajes del chat libre con client_key para idempotencia.",
  "public.conversation_reactions": "Reacciones a mensajes o rondas, por autor y objetivo.",
  "public.conversation_rounds": "Las tres rondas guiadas de una conversación.",
  "public.conversations": "Conversaciones abiertas; referencian perfiles, nunca matches.",
  "public.matches": "Pares publicados por track con su similitud; se reemplazan en bloque bajo advisory lock.",
  "public.notifications": "Avisos de la persona; el tipo está restringido por un CHECK.",
  "public.profiles": "Persona: identidad fija, estado del quiz, pausa y baja lógica.",
  "public.quiz_answers": "Respuestas por quiz e ítem (persona_id, quiz_id, item_id, valor).",
  "public.quiz_attempts": "Intentos por quiz con revisión y fecha de completado.",
  "public.quiz_items": "Banco de ítems servido al cliente; lectura pública.",
  "public.quiz_picante_consent": "Consentimiento +18: mayoría de edad, fecha y track de romance activo.",
  "public.quiz_responses": "Respuestas Likert del microtest núcleo.",
  "public.quiz_sharing": "Nivel de visibilidad opt-in de cada quiz (capas compartidas).",
  "public.user_roles": "Roles por usuario (administración); lectura del propio rol.",
};

const FUNCTION_PURPOSE = {
  "private.admin_credentials_bump_revision": "Helper de trigger: sube la revisión de la credencial admin.",
  "private.admin_iso_date": "Helper: fecha ISO para los agregados del observatorio.",
  "private.assert_service_role": "Guardia: aborta si quien llama no es service_role.",
  "private.bump_pool_revision": "Sube la revisión del pool tras un cambio que afecta al matching.",
  "private.chat_pins_bump_revision": "Helper de trigger: sube la revisión de PINes.",
  "private.conversation_round_touch": "Trigger: marca actividad al responder una ronda.",
  "private.conversation_touch": "Trigger: marca actividad de la conversación.",
  "private.is_admin": "¿El uid actual tiene rol de administración? SECURITY DEFINER para leer user_roles.",
  "private.is_unit_vector": "Valida que un vector tenga norma 1.",
  "private.live_pairs": "Pares de perfiles vivos elegibles para el matching.",
  "private.pool_version": "Lee la revisión singleton del pool.",
  "private.reject_identity_mutation": "Trigger: la identidad fija no se puede mutar (ADR-038).",
  "private.touch_updated_at": "Trigger genérico de updated_at.",
  "public.access_guard_hit": "Registra un intento de entrada y devuelve si la dirección está bloqueada.",
  "public.admin_bump_counter": "Incrementa un contador del observatorio.",
  "public.admin_list_reports": "Lista reportes de chat para la consola.",
  "public.admin_list_users": "Lista personas para la consola (dos sobrecargas).",
  "public.admin_reset_quiz": "Reinicia el quiz de una persona desde la consola.",
  "public.admin_review_report": "Resuelve un reporte y deja bitácora.",
  "public.apply_retention_policy": "Purga de retención: bajas lógicas vencidas y huevos dados de baja.",
  "public.block_chat_user": "Bloquea a otra persona y retira la conversación de ambas bandejas.",
  "public.express_chat_interest": "Expresa interés de chat; la apertura ocurre solo si es mutuo.",
  "public.get_admin_dashboard": "Agregados del observatorio (dos sobrecargas). Cuenta todos los perfiles.",
  "public.get_my_notifications": "Notificaciones de la persona que llama.",
  "public.get_pool_version": "Revisión del pool para que el cliente sepa si hay matches nuevos.",
  "public.get_user_matches": "Matches publicados de la persona que llama.",
  "public.hatch_profile_identity": "Eclosión: asigna la identidad fija (animal, color, alias) una sola vez.",
  "public.leave_conversation": "Sale o pausa una conversación.",
  "public.mark_identity_revealed": "Marca que la identidad ya se reveló a la contraparte.",
  "public.mark_notifications_read": "Marca notificaciones como leídas.",
  "public.notify_matches": "Crea los avisos de match; idempotente por par y track.",
  "public.purge_chat": "Purga los datos de chat de una persona.",
  "public.quiz_coincidencias": "Coincidencias entre respuestas compartidas con otra persona.",
  "public.quiz_delete_answers": "Borra las respuestas de un quiz de la persona.",
  "public.quiz_mark_completed": "Marca un quiz como completado.",
  "public.quiz_picante_get_consent": "Lee el consentimiento +18 de la persona.",
  "public.quiz_picante_save_consent": "Guarda el consentimiento +18 (mayoría de edad y track).",
  "public.quiz_save_answer": "Guarda una respuesta de quiz.",
  "public.quiz_set_sharing": "Fija el nivel de visibilidad opt-in de un quiz.",
  "public.record_round_feedback": "Guarda el feedback de una ronda guiada.",
  "public.replace_matches": "Reemplaza el conjunto publicado bajo advisory lock y guard de versión de pool.",
  "public.report_conversation": "Reporta una conversación por seguridad.",
  "public.submit_quiz_result": "Entrega el resultado del microtest y sella params_version.",
};

const table = (head, rows) =>
  [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");

/** La API de Management devuelve los arrays de Postgres como texto `{a,b}`. */
export function pgArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  const inner = value.replace(/^\{/, "").replace(/\}$/, "").trim();
  if (inner.length === 0) return [];
  return inner.match(/"(?:[^"\\]|\\.)*"|[^,]+/g)?.map((part) => part.replace(/^"|"$/g, "").replace(/\\"/g, '"').trim()) ?? [];
}

const cell = (value) => String(value ?? "—").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const code = (value) => `\`${cell(value)}\``;

/** `public.matches` → `public_matches`, nombre válido en Mermaid. */
const entity = (schema, name) => `${schema}_${name}`.replace(/[^a-zA-Z0-9_]/g, "_");

function mermaid(catalog) {
  const lines = ["erDiagram"];
  const byName = new Map(catalog.tables.map((t) => [`${t.schema}.${t.name}`, t]));
  const pks = new Map(catalog.primaryKeys.map((k) => [`${k.schema}.${k.table_name}`, k.definition]));
  const columns = new Map();
  for (const c of catalog.columns) {
    const key = `${c.schema}.${c.table_name}`;
    if (!columns.has(key)) columns.set(key, []);
    columns.get(key).push(c);
  }

  for (const key of [...byName.keys()].sort()) {
    const t = byName.get(key);
    lines.push(`  ${entity(t.schema, t.name)} {`);
    const pk = /PRIMARY KEY \(([^)]+)\)/.exec(pks.get(key) ?? "")?.[1]?.split(/,\s*/) ?? [];
    const fks = new Set(
      catalog.foreignKeys
        .filter((f) => `${f.schema}.${f.table_name}` === key)
        .flatMap((f) => /FOREIGN KEY \(([^)]+)\)/.exec(f.definition)?.[1]?.split(/,\s*/) ?? []),
    );
    for (const column of columns.get(key) ?? []) {
      const mark = pk.includes(column.name) ? " PK" : fks.has(column.name) ? " FK" : "";
      if (!mark && column.name !== "id") continue;
      lines.push(`    ${column.data_type.replace(/[^a-zA-Z0-9_]/g, "_")} ${column.name}${mark}`);
    }
    lines.push("  }");
  }

  for (const fk of catalog.foreignKeys) {
    const from = `${fk.schema}.${fk.references_table}`;
    const to = `${fk.schema}.${fk.table_name}`;
    if (!byName.has(from) || !byName.has(to)) continue;
    const label = /FOREIGN KEY \(([^)]+)\)/.exec(fk.definition)?.[1] ?? fk.name;
    lines.push(`  ${entity(fk.schema, fk.references_table)} ||--o{ ${entity(fk.schema, fk.table_name)} : "${label}"`);
  }
  return ["```mermaid", ...lines, "```"].join("\n");
}

/** De `postgres=X/postgres | service_role=X/postgres` a una lista legible. */
function executors(acl) {
  if (!acl || acl.startsWith("PUBLIC")) return "PUBLIC (sin revocar)";
  const roles = [...acl.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)=X\//g)].map((m) => m[1]);
  return roles.length > 0 ? roles.join(", ") : "nadie (revocado)";
}

export function renderSchemaDoc(catalog, generatedAt) {
  const rowsOf = (key) => catalog.rowCounts.find((r) => `${r.schema}.${r.name}` === key)?.rows ?? "—";
  const tables = [...catalog.tables].sort((a, b) => `${a.schema}.${a.name}`.localeCompare(`${b.schema}.${b.name}`));
  const functions = [...catalog.functions].sort((a, b) => `${a.schema}.${a.name}`.localeCompare(`${b.schema}.${b.name}`) || a.args.localeCompare(b.args));
  const rlsOn = catalog.tables.filter((t) => t.rls_enabled).length;
  const policyTables = new Set(catalog.policies.map((p) => `${p.schema}.${p.table_name}`));
  const definer = catalog.functions.filter((f) => f.security_definer).length;

  return [
    "# Esquema de la base de datos",
    "",
    `> Generado por \`npm run db:schema\` el ${generatedAt} desde el catálogo vivo,`,
    "> en **solo lectura**. Contiene metadatos de esquema y conteos agregados:",
    "> ninguna fila de persona, mensaje, respuesta, matrícula, hash ni PIN.",
    "> No editar a mano: vuelve a generarlo después de cada migración.",
    "",
    "## Resumen",
    "",
    table(
      ["Objeto", "Cantidad"],
      [
        ["Tablas", String(catalog.tables.length)],
        ["Tablas con RLS activo", `${rlsOn} de ${catalog.tables.length}`],
        ["Tablas con alguna política RLS", String(policyTables.size)],
        ["Vistas", String(catalog.views.length)],
        ["Funciones / procedimientos", String(catalog.functions.length)],
        ["Funciones SECURITY DEFINER", String(definer)],
        ["Triggers", String(catalog.triggers.length)],
        ["Políticas RLS", String(catalog.policies.length)],
        ["Índices", String(catalog.indexes.length)],
        ["Extensiones", String(catalog.extensions.length)],
        ["Publicaciones Realtime", String(catalog.publications.length)],
        ["Trabajos Cron", catalog.unavailable?.cronJobs ? "no disponible (pg_cron no instalado)" : String(catalog.cronJobs?.length ?? 0)],
        ["Buckets de Storage", catalog.unavailable?.buckets ? "no disponible" : String(catalog.buckets?.length ?? 0)],
      ],
    ),
    "",
    "**Modelo de acceso.** PostgREST solo expone el esquema `public`; las funciones",
    "de `private` son invisibles para la API REST y solo las llaman otras funciones",
    "o el servidor. Casi todas las tablas tienen RLS activo **sin políticas**: eso",
    "niega todo acceso directo a `anon` y `authenticated`, y el paso obligado es una",
    "RPC `SECURITY DEFINER` o el servidor con `service_role`. Las cuatro políticas",
    "que existen son de lectura pública deliberada (catálogos y rol propio).",
    "",
    "## Diagrama entidad-relación",
    "",
    mermaid(catalog),
    "",
    "## Tablas",
    "",
    table(
      ["Tabla", "Propósito", "RLS", "Filas", "Propietario"],
      tables.map((t) => {
        const key = `${t.schema}.${t.name}`;
        return [code(key), cell(TABLE_PURPOSE[key] ?? "—"), t.rls_enabled ? (t.rls_forced ? "activo + forzado" : "activo") : "inactivo", String(rowsOf(key)), "postgres"];
      }),
    ),
    "",
    "### Columnas",
    "",
    ...tables.map((t) => {
      const key = `${t.schema}.${t.name}`;
      const cols = catalog.columns.filter((c) => `${c.schema}.${c.table_name}` === key);
      return [
        `#### ${key}`,
        "",
        table(
          ["Columna", "Tipo", "Nulo", "Default"],
          cols.map((c) => [code(c.name), code(c.data_type), c.is_nullable === "YES" ? "sí" : "no", c.column_default ? code(c.column_default) : "—"]),
        ),
        "",
      ].join("\n");
    }),
    "### Llaves foráneas",
    "",
    table(
      ["Tabla", "Constraint", "Referencia", "Definición"],
      catalog.foreignKeys.map((f) => [code(`${f.schema}.${f.table_name}`), code(f.name), code(f.references_table), code(f.definition)]),
    ),
    "",
    "**Conservación de conversaciones:** ninguna FK apunta a `public.matches`.",
    "`conversations` y `chat_interests` referencian `public.profiles`, así que el",
    "`DELETE` en bloque de `replace_matches` no puede cascadear hacia una",
    "conversación abierta. Es una garantía estructural, no una convención.",
    "",
    "### Checks",
    "",
    table(
      ["Tabla", "Constraint", "Definición"],
      catalog.checks.map((c) => [code(`${c.schema}.${c.table_name}`), code(c.name), code(c.definition)]),
    ),
    "",
    "## Vistas",
    "",
    catalog.views.length === 0
      ? "No hay vistas en `public` ni en `private`. Todos los agregados se calculan en las RPC."
      : table(["Vista", "Definición"], catalog.views.map((v) => [code(`${v.schema}.${v.name}`), code(v.definition)])),
    "",
    "## Funciones y procedimientos",
    "",
    "`SECURITY DEFINER` significa que la función corre con los privilegios de su",
    "propietario (`postgres`), no de quien la llama: por eso cada una valida",
    "adentro quién es la persona (`auth.uid()`) o exige `service_role`. La columna",
    "**Ejecuta** sale del ACL real, no de lo que la migración promete.",
    "",
    table(
      ["Función", "Argumentos", "Devuelve", "Definer", "Lenguaje", "Propietario", "Ejecuta", "Propósito"],
      functions.map((f) => {
        const key = `${f.schema}.${f.name}`;
        return [
          code(key),
          f.args ? code(f.args) : "()",
          code(f.returns),
          f.security_definer ? "sí" : "no",
          cell(f.language),
          cell(f.owner),
          cell(executors(f.acl)),
          cell(FUNCTION_PURPOSE[key] ?? "—"),
        ];
      }),
    ),
    "",
    "## Triggers",
    "",
    table(
      ["Tabla", "Trigger", "Definición"],
      catalog.triggers.map((t) => [code(`${t.schema}.${t.table_name}`), code(t.name), code(t.definition)]),
    ),
    "",
    "## Políticas RLS",
    "",
    table(
      ["Tabla", "Política", "Permisiva", "Roles", "Comando", "USING", "WITH CHECK"],
      catalog.policies.map((p) => [
        code(`${p.schema}.${p.table_name}`),
        code(p.name),
        p.permissive ? "sí" : "no",
        cell(pgArray(p.roles).join(", ")),
        cell(p.cmd),
        p.qual ? code(p.qual) : "—",
        p.with_check ? code(p.with_check) : "—",
      ]),
    ),
    "",
    `Las ${rlsOn - policyTables.size} tablas restantes con RLS activo y sin políticas son`,
    "deliberadamente inaccesibles por REST: solo el servidor con `service_role` o",
    "una RPC definer las toca. Si una tabla nueva aparece aquí sin política y sin",
    "RPC que la use, es un hallazgo, no un diseño.",
    "",
    "## Índices",
    "",
    table(
      ["Tabla", "Índice", "Definición"],
      catalog.indexes.map((i) => [code(`${i.schema}.${i.table_name}`), code(i.name), code(i.definition)]),
    ),
    "",
    "## Privilegios de esquema",
    "",
    "La ACL de `private` es el candado de adentro: si algún día lista `anon`,",
    "`authenticated` o `service_role`, cualquier rol de API podría llamar directo",
    "a `private.assert_service_role()` y a lo que haya dentro. No se hereda de los",
    "esquemas de plataforma (`auth`, `storage`, `vault`, `graphql`, `realtime`),",
    "que administra Supabase y este repo no crea.",
    "",
    table(
      ["Esquema", "Uso por rol de API", "ACL cruda"],
      (catalog.schemas ?? []).map((s) => [code(s.name), code(s.api_usage), code(s.acl)]),
    ),
    "",
    "## Privilegios de tabla",
    "",
    table(
      ["Tabla", "Rol", "Privilegio"],
      catalog.tableGrants.map((g) => [code(`${g.schema}.${g.name}`), cell(g.grantee), cell(g.privilege_type)]),
    ),
    "",
    "## Extensiones",
    "",
    table(
      ["Extensión", "Esquema", "Versión", "Para qué"],
      catalog.extensions.map((e) => [
        code(e.name),
        code(e.schema),
        cell(e.version),
        cell(
          {
            pg_stat_statements: "Presupuestos de consulta de `npm run db:perf`.",
            pgcrypto: "Hash de PIN y de matrícula con pepper.",
            plpgsql: "Lenguaje de las RPC.",
            supabase_vault: "Secretos gestionados por Supabase.",
            "uuid-ossp": "Generación de UUID.",
          }[e.name] ?? "—",
        ),
      ]),
    ),
    "",
    "## Publicaciones Realtime",
    "",
    table(
      ["Publicación", "Todas las tablas", "Insert", "Update", "Delete", "Tablas"],
      catalog.publications.map((p) => [
        code(p.name),
        p.all_tables ? "sí" : "no",
        p.inserts ? "sí" : "no",
        p.updates ? "sí" : "no",
        p.deletes ? "sí" : "no",
        pgArray(p.tables).length > 0 ? pgArray(p.tables).map((t) => code(t)).join(", ") : "**ninguna**",
      ]),
    ),
    "",
    "La publicación `supabase_realtime` existe pero **no incluye tablas**: el chat",
    "se entera por polling con wake en `focus` / `visibilitychange` / `online`, no",
    "por suscripción. Añadir una tabla aquí sin revisar sus políticas RLS expondría",
    "filas a cualquiera con la llave anon.",
    "",
    "## Trabajos Cron",
    "",
    catalog.unavailable?.cronJobs
      ? "`pg_cron` no está instalado en este proyecto: no hay trabajos programados en la base. La retención se aplica llamando `public.apply_retention_policy` desde el servidor (`docs/PENDIENTES_MANUALES.md` M-09)."
      : table(
          ["Job", "Schedule", "Comando", "Activo"],
          catalog.cronJobs.map((j) => [code(String(j.jobid)), code(j.schedule), code(j.command), j.active ? "sí" : "no"]),
        ),
    "",
    "## Buckets de Storage",
    "",
    catalog.unavailable?.buckets
      ? "El esquema `storage` no está disponible para lectura."
      : catalog.buckets.length === 0
        ? "No hay buckets: los sprites se sirven desde `public/` del despliegue, no desde Storage. No hay superficie de subida de archivos."
        : table(
            ["Bucket", "Nombre", "Público", "Límite de tamaño", "MIME permitidos"],
            catalog.buckets.map((b) => [code(b.id), cell(b.name), b.public ? "sí" : "no", cell(b.file_size_limit ?? "sin límite"), cell(pgArray(b.allowed_mime_types).join(", ") || "cualquiera")]),
          ),
    "",
    "## Cómo se regenera",
    "",
    "```bash",
    "npm run db:schema        # lee el catálogo vivo y escribe este archivo + el snapshot",
    "npm run db:drift         # compara el vivo contra supabase/schema-snapshot.json",
    "```",
    "",
    "`supabase/schema-snapshot.json` es la línea base documentada. `db:drift` falla",
    "ante cualquier diferencia no documentada; aceptarla es una decisión humana",
    "que se toma regenerando el snapshot después de revisar la diferencia.",
    "",
  ].join("\n");
}