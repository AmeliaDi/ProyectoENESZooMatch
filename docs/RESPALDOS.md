# Respaldos y restauración — ZooMatch

> Cómo se hace un respaldo, qué contiene realmente, cómo se verifica y qué
> significa restaurarlo. Escrito sobre lo que hacen los scripts, no sobre lo que
> deberían hacer: cada afirmación de esta página corresponde a una corrida.

## 1. Regla operativa

Antes de **cualquier** migración, backfill o recomputación que escriba sobre
`public.matches`, `public.profiles` o las tablas de chat, se toma un respaldo y
se verifica su manifiesto. Sin respaldo verificado, el paso se detiene. Esto no
es opcional en el evento: es la única reversión que existe, porque no hay CI ni
despliegue atómico que revierta la base.

## 2. Qué produce el script

```bash
node --no-warnings scripts/db-backup.mts --out .backups/pre-<fase>
```

`scripts/db-backup.mts` exporta a `.backups/<label>/`:

- un archivo `<esquema>.<tabla>.json` por tabla, con las filas en el orden de la
  **clave primaria viva** (resuelta desde `pg_constraint`, no desde una lista
  escrita a mano);
- `manifest.json` con `createdAt`, `projectRef`, el conteo y el `sha256` por
  tabla, el `orderBy` usado, y el bloque `cobertura`.

El inventario se lee del catálogo (`pg_class` + `pg_namespace` + `pg_attribute`)
sobre los esquemas `public` y `private`, más `auth.users`. **31 tablas y
33 072 filas** en la corrida del 2026-11-09. Diez de esas tablas no estaban en
la lista anterior del script y nunca se habían respaldado (`animals`, `colors`,
`quiz_items`, `quiz_answers`, `quiz_attempts`, `quiz_picante_consent`,
`quiz_sharing`, `user_roles`, `admin_counters`, `private.pool_state`); ver
DB-01 en `docs/QA_DB.md`.

Para mirar la cobertura sin exportar una sola fila:

```bash
node --no-warnings scripts/db-backup.mts --plan --out .qa/backup-plan
```

`--plan` solo corre `count(*)` por tabla y marca con «antes NO se respaldaba»
lo que aparece por primera vez.

## 3. Sensibilidad del artefacto

El respaldo es **JSON en texto plano, sin cifrar**. Contiene correo, matrícula
hasheada con su sal, respuestas de quiz, hashes y sales de PIN, cuerpos de
mensajes y avisos. `manifest.json` lo declara en el campo `contenido`.

- `.backups/` está fuera de git (verificable con `git check-ignore .backups`).
- El directorio vive en la máquina de quien opera; no se sube a ningún servicio
  por defecto.
- Cifrarlo (cifrado del directorio o `age`/`gpg` por archivo) está pendiente como
  paso manual M-11 en `docs/PENDIENTES_MANUALES.md`. Mientras no esté, la
  política es: no dejar respaldos en una máquina compartida ni en la nube sin
  cifrado previo.
- Un respaldo viejo conserva datos que la app ya purgó. Al restaurar, la purga
  se pierde: la retención es parte del dato.

## 4. Restaurar: dos caminos que no son lo mismo

### 4.1 Local, verificado por prueba (`npm run db:restore-drill`)

`scripts/db/restore-drill.mjs` construye un respaldo lógico de las 31 tablas
sobre una base desechable (PGlite), lo restaura y comprueba que cada tabla
devuelve el mismo conteo y el mismo digest. El archivo que genera
(`.qa/restore-drill/backup.sql`) lleva un sobre de guardas:

```sql
-- huella_esquema: <sha256 de 64>
-- tablas: 31
-- sentencias: 252
BEGIN;
--%%SENTENCIA%%-- …
COMMIT;
```

`abrirRespaldo()` rechaza —antes de ejecutar una sola sentencia— un archivo
truncado (sentencias declaradas ≠ sentencias presentes), una huella de esquema
distinta entre respaldo y destino, una sentencia sin `;`, y un sobre sin
`BEGIN;`/`COMMIT;`. El drill además daña a propósito dos filas y exige que el
verificador las detecte: si el digest no mordiera, el verde no diría nada.

**El respaldo desactiva los triggers de negocio por tabla:**

```sql
ALTER TABLE public.conversations DISABLE TRIGGER USER;
INSERT INTO public.conversations … VALUES …;
ALTER TABLE public.conversations ENABLE TRIGGER USER;
```

Medido: restaurar **sin** esas líneas deja `public.conversations.updated_at`
distinto en las 462 conversaciones del escenario, porque el trigger de toque
recalcula `now()` al insertar (DB-05). Y hay dos cosas que este mecanismo **no**
desactiva: la integridad referencial (los triggers internos `RI` siguen activos
con `DISABLE TRIGGER USER`), por lo que las inserciones van en orden de
dependencias; y las restricciones `CHECK`, incluidas las tres que están
`NOT VALID`. Por eso el respaldo también vacía cada tabla en orden inverso antes
de insertar: las migraciones ya siembran datos (`00000000000000_base.sql:284`
crea la fila de `private.pool_state`), y sin ese paso el restore choca contra la
llave primaria (DB-06).

En producción el equivalente es `pg_dump --disable-triggers` (o `pg_restore` con
`--disable-triggers`), que requiere superusuario.

### 4.2 Producción, manual

`scripts/db-restore.mts` existe y hace un `--dry-run` contra el proyecto real,
pero tiene dos defectos que hoy lo hacen inelegible para `--apply`:

1. inserta con `ON CONFLICT DO NOTHING` sobre tablas que ya tienen datos, así
   que descarta las filas del respaldo y aun así imprime `[OK] verified`
   (DB-16);
2. re-declara los tres CHECK del límite de 3 preguntas como `NOT VALID` y, para
   ensayar, ejecuta `DROP CONSTRAINT` / `ADD CONSTRAINT` sobre tablas de
   producción dentro de una transacción cerrada con `ROLLBACK` (DB-17, DB-18).

La restauración real de un respaldo de producción es el paso **M-04** de
`docs/PENDIENTES_MANUALES.md`: se hace con la consola de Supabase o con
`pg_restore` y credenciales de servicio, a mano, por una persona. Ningún agente
ejecuta escrituras sobre producción.

Dato medido que ayuda a confiar en el paso manual: la API de Management
**propaga** un error a mitad de una lista de sentencias (devuelve HTTP 400
aunque el último renglón de la lista sea correcto) y solo devuelve el último
conjunto de filas. Un fallo intermedio no se disfraza de verde.

## 5. Frecuencia y retención

| Momento | Qué se toma | Dónde |
|---|---|---|
| Antes de cada migración aplicada al proyecto | snapshot completo + `manifest.json` | `.backups/pre-<fase>` |
| Antes de un backfill o recomputación de `matches` | snapshot completo | `.backups/pre-<operación>` |
| Durante el evento, una vez por jornada | snapshot completo | `.backups/<fecha>-<orden>` |

Un snapshot pesa ~10 MB con la población actual (`10 420 400` bytes en el drill
local con población sintética). Con 244 perfiles no es un problema; con cinco
veces más, conviene respaldar `conversation_messages` por separado porque es la
tabla que crece con el uso.

## 6. Verificación rápida después de un respaldo

```bash
# con la ruta del snapshot en DIR
DIR=.backups/pre-fase1 node --no-warnings -e "
const m = JSON.parse(require('fs').readFileSync(process.env.DIR + '/manifest.json', 'utf8'));
console.log(m.cobertura.tablas, 'tablas', m.tables.reduce((t, x) => t + x.count, 0), 'filas');
"
```

`m.cobertura` solo existe en los manifiestos escritos desde esta versión; los 7
snapshots que hay hoy en `.backups/` trajeron `tables` con 21 entradas y ninguna
declaración de cobertura, que es justamente cómo DB-01 pasó desapercibido.

Tres cosas que hay que mirar en el manifiesto, no en la consola:

- `cobertura.tablas` coincide con el conteo del catálogo (`--plan` lo imprime);
- ninguna tabla aparece con `count: 0` salvo las que se saben vacías
  (`chat_blocks`, `chat_reports`, `chat_report_audit`, `quiz_sharing`);
- `ordenDesde` dice de dónde salió el orden de cada exportación.
