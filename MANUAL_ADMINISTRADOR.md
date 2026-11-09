# Manual del Administrador · ZooMatch

> Guía de operación para personas. Este documento describe **cómo usar el sistema completo**
> (panel de administración y experiencia del estudiante) tal como existe hoy en la aplicación.
> Todo lo que se documenta aquí se dedujo del comportamiento real del sistema; cuando una
> capacidad **no existe**, se indica de forma explícita en lugar de suponerla.

**Audiencia:** personal operativo y de administración de la plataforma.
**Idioma:** español (México).
**Alcance:** uso y operación. No es un documento técnico de programación.

---

## Índice

1. [Introducción y Acceso](#1-introducción-y-acceso)
2. [Navegación Global y Dashboard](#2-navegación-global-y-dashboard)
3. [Guía Módulo por Módulo](#3-guía-módulo-por-módulo)
4. [Configuraciones del Sistema y Mantenimiento](#4-configuraciones-del-sistema-y-mantenimiento)
5. [Solución de Problemas Comunes (FAQ)](#5-solución-de-problemas-comunes-faq)

---

## 1. Introducción y Acceso

### 1.1 ¿Para qué sirve ZooMatch?

ZooMatch es una aplicación web, pensada primero para usarse en el teléfono, que ayuda a
estudiantes de la **UNAM (ENES)** a descubrir afinidades entre sí. Cada estudiante se registra
con su **matrícula**, responde un **cuestionario anónimo** y el sistema le muestra personas con
quienes resulta compatible. Cada persona se identifica frente a las demás con un **alias
anónimo** y una identidad de **animalito + color**, nunca con su nombre ni su matrícula.

El flujo general del estudiante es:

```
Registro con matrícula  →  Cuestionario anónimo  →  Cálculo de compatibilidad  →
Resultado: alias + animalito + color + narrativa + coincidencias (lista o constelación)
```

La aplicación tiene un propósito **educativo y de entretenimiento**: en pantalla se aclara que
**no es un diagnóstico psicológico**.

### 1.2 Tipos de usuarios detectados

El sistema reconoce **dos roles**, y cada uno entra por una puerta distinta:

| Rol | Quién es | Cómo se autentica | Puerta de entrada |
|---|---|---|---|
| **Administrador** | Persona que opera el observatorio | Su **matrícula** + un **PIN administrativo** de 4 dígitos | `/admin/login` |
| **Estudiante / participante** | Persona que responde el cuestionario y ve sus coincidencias | Solo su **matrícula** (sin nombre, sin correo, sin contraseña propia) | Pantalla principal (`/`) |

Detalles importantes de cada rol:

- **Administrador.** Es una cuenta de participante normal (entra con matrícula) a la que se le
  asignó el **rol administrativo** y un **PIN administrativo**. El PIN se guarda solo como hash
  (scrypt + secreto del servidor); nunca en claro, ni en el repositorio ni en los logs. La
  sesión del observatorio es independiente de la sesión de estudiante.
- **Estudiante.** La matrícula **nunca se guarda ni se muestra tal cual**: se transforma en un
  valor irreversible antes de almacenarse. Por eso el estudiante **no tiene contraseña que
  recordar**; para volver a entrar solo escribe de nuevo su matrícula.

### 1.3 Cómo iniciar sesión en el panel de administración

1. Abre `/admin/login` (una ventana propia, separada de la experiencia de estudiante).
2. Escribe tu **matrícula / número de cuenta UNAM** y tu **PIN administrativo**.
3. Pulsa **"Entrar"**. Si la matrícula pertenece a una cuenta con rol administrativo **y** el PIN
   es correcto, entras a `/admin`.

Consideraciones:

- **Mensaje único de error.** Si la matrícula no existe, no es administrativa o el PIN no
  coincide, verás siempre *"No pudimos verificar el acceso administrativo."*: el sistema no
  revela cuál de las tres causas fue.
- **Pausas por intentos.** Tras 5 PIN incorrectos seguidos, la cuenta espera 1 minuto; luego 5,
  15 y 60 minutos (`data/admin-config.json`). Además, cada red tiene un tope de 20 intentos en
  15 minutos. Durante la pausa verás *"Demasiados intentos. Vuelve a intentar en N min."*
- **Sesión.** Dura hasta 4 horas y se cierra sola tras 30 minutos sin actividad. **"Salir"** la
  termina al instante. Si alguien retira el rol administrativo, la sesión deja de valer de
  inmediato.
- Cada entrada, salida y PIN incorrecto queda en la **auditoría** (sin la matrícula ni el PIN).

### 1.4 Entrada y recuperación de la sesión del estudiante

El estudiante **no recupera una contraseña** (no tiene). La entrada única es la pantalla
principal (`/`), donde escribe su matrícula. En la primera entrada se crea automáticamente
un perfil anónimo; no hay un paso separado de **"Crear mi perfil"**.

1. Escribe la matrícula en `/` y pulsa **"Entrar al hábitat"**.
2. El sistema abre o reabre la sesión de forma automática, **sin pedir contraseña**.
3. Según su avance, la aplicación lo lleva a `/cuestionario` si el cuestionario está
   pendiente o a `/resultado` si ya lo completó.

Mensajes posibles:

- *"El hábitat no está disponible ahora. Intenta más tarde."* → el servicio no responde en este
  momento.
- *"Algo salió mal. Intenta de nuevo."* → error genérico.

> **Nota de navegación real:** no existe una página pública de login separada. La pantalla
> principal es la entrada por matrícula; según el avance, dirige al cuestionario o al
> resultado (ver [3.5](#35-módulo-cuestionario)).

### 1.5 Requisitos de acceso (antes de que alguien pueda entrar)

- **Supabase configurado** y la migración base + semilla aplicadas
  (`supabase/migrations/00000000000000_base.sql` → `seed.sql`), más las incrementales.
- **Variables de entorno** del servidor, incluida `CHAT_PIN_PEPPER` (el PIN administrativo usa
  el mismo secreto, con un sujeto distinto). Sin ella, el observatorio responde "no disponible".
- **Alta de un administrador.** No hay pantalla para nombrar administradores (a propósito). La
  persona entra una vez con su matrícula en `/` y luego quien opera el servidor ejecuta, en su
  máquina, un script local que: calcula el HMAC de la matrícula, asigna el rol en
  `user_roles` y guarda el hash del PIN en `admin_credentials`. Ese script lee la matrícula y
  el PIN de variables de entorno y **no se sube al repositorio**.
- Para **retirar** a un administrador basta con borrar su fila de `user_roles` (y de
  `admin_credentials`); su sesión deja de valer en la siguiente petición.

---

## 2. Navegación Global y Dashboard

### 2.1 Cómo está protegida y organizada la zona de administración

- La página `/admin` no muestra nada hasta confirmar la sesión con `/api/admin/session`; sin
  sesión válida, regresa a `/admin/login`.
- Toda ruta `/api/admin/*` exige la cookie firmada del observatorio (`httpOnly`,
  `SameSite=Strict`, limitada a `/api/admin`) **y** que el rol siga existiendo. Además pasa por
  el filtro de origen y el límite de frecuencia de `withApiSecurity`.
- El observatorio tiene **cuatro pestañas**:

| Pestaña | Qué contiene |
|---|---|
| **Personas** | Lista paginada de cuentas registradas, búsqueda por alias y detalle con acciones |
| **Reportes** | Reportes de chat por estado (abiertos, revisados, cerrados) con su instantánea mínima |
| **Auditoría** | Registro de todas las acciones administrativas |
| **Agregados** | Métricas con k-anonimato, recálculo de afinidades y exportación CSV |

En el encabezado: tu alias de administrador y el botón **"Salir"**.

### 2.2 Pestaña Personas

- Cada fila muestra: alias, animalito y color, si completó el cuestionario, si está pausada,
  número de afinidades (romance / amistad), reportes recibidos y fecha de alta.
- **Nunca** se muestran la matrícula (no existe en claro), su hash, las respuestas, los
  vectores, la lectura latente (θ) ni los filtros duros (orientación, identidad, tipo de
  relación).
- **Búsqueda:** por alias (sin distinguir mayúsculas). No se puede buscar por matrícula.
- **"Ver detalle"** abre una ficha con más datos (MBTI, módulos extra, conversaciones, PIN de
  chats creado o no, mayoría de edad declarada) y las acciones:

| Acción | Qué hace | Confirmación |
|---|---|---|
| **Reiniciar cuestionario** | Borra respuestas, lectura, animalito, color y afinidades. **Conserva** el alias, los chats, el PIN y los reportes. La persona vuelve a `/cuestionario` al entrar. | Escribir `REINICIAR` |
| **Pausar / Reactivar perfil** | Saca o regresa a la persona del cálculo de afinidades. No borra nada. | Un clic |
| **Restablecer PIN de chats** | Borra su PIN de chats; creará uno nuevo al abrirlos. Los mensajes no se tocan. | Escribir `PIN` |
| **Borrar cuenta** | Elimina la cuenta y todo lo asociado en cascada (respuestas, afinidades, chats, reportes, PIN). Irreversible. No disponible para cuentas administrativas. | Escribir `BORRAR` |

- Reiniciar, pausar, reactivar y borrar **recalculan las afinidades** de todo el cielo al
  momento. Si el recálculo no se puede completar, la acción queda hecha igual y se avisa.

### 2.3 Pestaña Reportes

- Filtra por **Abiertos / Revisados / Cerrados**. Cada tarjeta muestra el motivo, la pista, los
  alias de quien reporta y de la persona reportada, y la **instantánea mínima** (los últimos
  mensajes y respuestas de esa conversación, etiquetados como "reporta" / "reportada").
- **"Marcar revisado"** y **"Cerrar reporte"** cambian el estado y lo registran tanto en
  `chat_report_audit` como en la auditoría general. La persona reportada nunca se entera.
- Si hace falta actuar sobre la cuenta reportada, búscala por alias en **Personas**.

### 2.4 Pestaña Auditoría

- Lista, de lo más reciente a lo más antiguo: fecha (UTC), alias del administrador, acción,
  alias de la cuenta afectada y detalle (por ejemplo, número de parejas recalculadas).
- Acciones registradas: entrar, salir, PIN incorrecto, borrar cuenta, reiniciar cuestionario,
  pausar, reactivar, restablecer PIN de chats, recalcular afinidades y revisar/cerrar reportes.
- El registro **sobrevive al borrado** de la cuenta afectada (guarda el alias, no depende de la
  cuenta). No guarda matrículas, PIN, direcciones IP ni contenido de chats.

### 2.5 Pestaña Agregados

- **Refrescar**, **Recalcular afinidades** (queda en la auditoría) y **Exportar CSV**.
- Perfiles activos, cobertura por pista (porcentaje de personas con al menos una afinidad y el
  umbral vigente), distribución MBTI y los animalitos y colores más frecuentes.
- Las celdas con menos de k personas (`admin.kAnonymity`) se muestran como "< k"; si el cielo
  tiene menos de k perfiles, los desgloses se ocultan.

---

## 3. Guía Módulo por Módulo

A continuación se describe cada módulo **real** del sistema. Para cada uno se indica: para qué
sirve, si permite crear registros (y con qué campos), cómo se edita/desactiva/elimina (borrado
lógico vs físico) y qué filtros o búsquedas ofrece.

> **Regla general e importante:** el observatorio permite **bajas, reinicios y pausas** de
> cuentas y la moderación de reportes (todo auditado), pero **no** la captura o edición de
> catálogos, cuestionario o umbrales. El contenido (catálogos, cuestionarios, umbrales) se administra **editando los archivos de datos
> del sistema y volviéndolos a cargar en la base**, no desde una pantalla. Cada módulo detalla su
> caso.

### 3.1 Módulo: Observatorio

Ver [sección 2](#2-navegación-global-y-dashboard): personas, reportes, auditoría y agregados.
Desde ahí sí se puede **borrar**, **reiniciar** y **pausar** cuentas (siempre auditado). Lo que
sigue sin pantalla: catálogos, cuestionario y umbrales (se editan en `data/*.json`).

### 3.2 Módulo: Coincidencias (matches)

- **¿Para qué sirve?** Mostrar a cada estudiante las personas con las que es compatible. El
  cálculo ocurre de forma automática cuando alguien completa su cuestionario.
- **¿El administrador crea o edita coincidencias?** **No.** Las coincidencias se **generan solas**
  a partir de las respuestas; no hay pantalla para crearlas, editarlas, aprobarlas ni borrarlas
  manualmente.
- **¿Dónde se ven?** Solo en la **pantalla de resultado del propio estudiante** (`/resultado`).
  El administrador **no** ve coincidencias individuales en el panel; solo el **porcentaje
  agregado** de usuarios con coincidencia.
- **Dos "pistas" de coincidencia:**
  - **💫 Almas Gemelas** (pista *romance*): compatibilidad romántica. Aplica **filtros duros**
    (orientación, identidad de género y tipo de relación buscada) además de la similitud.
  - **✨ Futuras amistades** (pista *amistad*): compatibilidad de amistad. **No** aplica esos
    filtros duros.
- **Cómo se presenta cada coincidencia:** una tarjeta con un **anillo de porcentaje de
  química**, el alias de la otra persona, su animalito y color, "insignias" (badges) de afinidad,
  una narrativa breve y un botón **"¿Por qué hicimos match?"** que despliega el desglose por
  categorías (Personalidad, Gustos culturales, Intimidad y afecto, Valores relacionales,
  Identidad y compromiso), un resumen de personalidad y un titular poético.
- **Cuando no hay coincidencias:** se muestra un mensaje tranquilizador predefinido (no se
  corrige su redacción ni sus emoticones; está fijado tal cual en el sistema).
- **Eliminación:** las coincidencias de una persona se eliminan **en cascada** al borrar su cuenta
  (desde Ajustes por la propia persona, o desde **Personas** en el observatorio).

### 3.3 Módulo: Notificaciones

- **¿Para qué sirve?** Avisar al estudiante, con mensajes cálidos, sobre su actividad: cuando
  aparece una coincidencia, cuando no la hay y como bienvenida al crear su perfil.
- **Tipos de notificación detectados:**

  | Tipo | Cuándo aparece | Ejemplo de título |
  |---|---|---|
  | `welcome` (bienvenida) | La primera vez que el estudiante completa su cuestionario | *"Tu perfil ya brilla en el hábitat"* |
  | `match_romance` | Cuando hay coincidencias en la pista romance | *"Tu energía resonó en el hábitat"* |
  | `match_amistad` | Cuando hay coincidencias en la pista amistad | *"Tu vibra resonó con alguien"* (una persona) / *"Tu vibra resonó con el campus"* (varias) |
  | `no_match` | Cuando no hay coincidencias por encima del umbral | *"Aún no hay resonancias en el hábitat"* |

  El cuerpo del aviso habla de **afinidad estimada** y de lo que falta por
  platicar; nunca promete que la relación vaya a formarse. Los redacta
  `src/domain/messages/notification-copy.ts` y `public.notify_matches` copia los
  mismos literales, así que cambiar uno sin el otro rompe un test.

- **¿El administrador crea/envía notificaciones?** **No.** Las notificaciones son **generadas por
  el sistema** de forma automática. No hay pantalla para redactar, enviar, editar ni eliminar
  notificaciones manualmente.
- **Cómo se muestran:** como un **aviso emergente (toast)** en la parte inferior de la pantalla.
  La aplicación las **revisa automáticamente cada 30 segundos**. Las de coincidencia incluyen un
  enlace **"Ver compatibilidad →"**.
- **Borrado lógico vs físico:**
  - Cuando el estudiante **cierra** un aviso (botón ×), la notificación se **marca como leída**
    (borrado **lógico**): deja de mostrarse como pendiente, pero **no se elimina** del registro.
  - Las **no leídas** anteriores pueden **eliminarse físicamente** cuando el sistema recalcula y
    vuelve a notificar (para evitar duplicados). Es decir, al reprocesar coincidencias se limpia
    lo pendiente no leído y se genera el aviso actualizado.
  - Si la cuenta del estudiante se elimina, sus notificaciones se eliminan **en cascada**.
- **Filtros y búsquedas:** el estudiante puede consultar solo las **no leídas** o **todas**; no
  hay buscador de texto.

### 3.4 Módulo: Catálogos de animales y colores

- **¿Para qué sirve?** Definir el "universo" de identidades visuales: los **animalitos** y los
  **colores/texturas** que se asignan a cada perfil.
- **Contenido real detectado:** catálogo de **103 animales en 13 familias morfológicas × 55
  colores/texturas** (archivo `data/arquetipos.json`). Cada animal incluye vector Big Five,
  afinidad MBTI primaria/secundaria, rasgos y plantillas narrativas inclusivas.
- **¿Se crean/editan desde el panel?** **No.** No existe ninguna pantalla administrativa para
  agregar, renombrar, desactivar o eliminar animalitos o colores.
- **Cómo se administran entonces:** editando los **archivos de datos** del catálogo y
  **volviéndolos a cargar** en la base de datos (semillas `seed.sql`). Estos
  catálogos se generan con utilidades del proyecto (no desde la interfaz). La asignación de
  animalito y color a cada perfil la hace el **sistema automáticamente**, no una persona.
- **Impacto operativo:** si cambias el catálogo, los cambios afectan a las **nuevas**
  asignaciones; no hay una herramienta en pantalla para reasignar identidades a perfiles ya
  creados.

### 3.5 Módulo: Cuestionario

El cuestionario canónico vive en `/cuestionario`:

| | Cuestionario canónico |
|---|---|
| **Cantidad de preguntas** | 60 ítems |
| **Escala de respuesta** | Likert de 5 opciones |
| **Tipos de pregunta** | Opción única **+ selección múltiple** (los "filtros duros") |
| **Resultado** | `/resultado` |

- **¿Para qué sirve?** Recopilar las respuestas anónimas que alimentan el cálculo de
  compatibilidad y la identidad (animalito + color + alias).
- **Cómo lo usa el estudiante:**
  - Se responde **una pregunta por pantalla**, con barra de progreso y botones **"Siguiente"** /
    **"Anterior"**.
  - El **avance se guarda solo en el dispositivo** (borrador local). Si el estudiante cierra y
    vuelve desde ese mismo dispositivo, retoma donde iba. **El borrador no se guarda en el
    servidor** hasta el envío final.
  - Al llegar al final y pulsar **"Descubrir resultado"**, se envía **una sola vez** y se limpia
    el borrador local.
  - Algunas preguntas piden **"selecciona todas las que apliquen"** (por ejemplo orientación,
    identidad de género o tipo de relación); esas respuestas alimentan los filtros duros de la
    pista romance.
- **¿El administrador crea o edita preguntas?** **No.** Las preguntas viven en
  `data/microtest.json`. Para cambiarlas se edita ese archivo y se recarga; no hay pantalla de
  edición de cuestionario.
- **Mensajes del cuestionario:**
  - Si la sesión caducó al enviar: *"Tu sesión ya no está disponible. Volver al acceso."*
  - Si falla el guardado: *"No pudimos guardar tus respuestas. Tu avance sigue en este
    dispositivo; inténtalo otra vez."*

### 3.6 Módulo: Perfiles y Resultados

- **¿Para qué sirve?** Mostrar al estudiante su identidad anónima y sus coincidencias.
- **Qué ve el estudiante en su resultado:**
  - Su **alias**, **animalito + color**, una **narrativa afectiva**, la **etiqueta MBTI**, y las
    coincidencias en **dos pestañas** (Almas Gemelas / Futuras amistades). Además puede
    alternar entre dos formas de ver sus conexiones:
    - **Lista:** tarjetas con detalle y desglose de afinidad.
    - **Constelación:** un "cielo" interactivo de animalitos en pixeles que se pueden arrastrar,
      con líneas entre personas compatibles y ficha de detalle por nodo.
  - Mientras se procesa, aparece una pantalla de espera ("Tu animalito está siguiendo el rastro…").
- **¿El administrador ve perfiles individuales?** **No.** El panel solo expone **agregados**; no
  hay un listado de perfiles, ni una ficha individual, ni buscador de estudiantes.
- **¿Se editan o eliminan perfiles desde la app?** **No** hay pantalla para editar o dar de baja
  un perfil. La eliminación de una cuenta (y de todo lo asociado: respuestas, coincidencias y
  notificaciones) ocurriría **en cascada** solo si se borra desde el gestor de autenticación de
  Supabase, fuera de la interfaz de la aplicación.
- **Filtros y búsquedas:** en el resultado, el estudiante **filtra por pestaña** (romance /
  amistad) y **alterna la vista** (lista / constelación). No hay buscador.

### 3.7 Módulo: Herramientas de desarrollo (`/dev/sprites` y `/dev/constellation`)

- **¿Para qué sirven?** Son pantallas **internas de apoyo** para revisar la parte visual con
  **datos de ejemplo** (sintéticos), sin tocar datos reales:
  - **`/dev/sprites`** — galería con **todos los animalitos pixeleados** generados por el sistema.
  - **`/dev/constellation`** — previsualización de la **constelación** con datos sintéticos,
    incluyendo un indicador de rendimiento (cuadros por segundo).
- **Disponibilidad:** **solo en entorno de desarrollo.** En **producción devuelven "página no
  encontrada" (404)** a propósito, para no exponer el catálogo interno.
- **¿Crean o modifican datos?** **No.** Son de **solo lectura/visualización** y usan datos de
  ejemplo; no afectan perfiles reales ni guardan información.

---

## 4. Configuraciones del Sistema y Mantenimiento

### 4.1 Ajustes globales y cómo se aplican los cambios

La filosofía del sistema es **"datos antes que lógica"**: los parámetros que definen el
comportamiento (umbrales, pesos, dimensiones, preguntas, catálogos) viven en **archivos de datos**,
no "dentro del código". Para el operador esto significa:

- **Cambiar un parámetro = editar el archivo de datos correspondiente y recargar el sistema.**
  No hay una pantalla de ajustes dentro del panel de administración.
- Si un archivo de configuración está incompleto o mal formado, el sistema **no se cae**: usa
  **valores de respaldo seguros** (por ejemplo, un umbral de compatibilidad predefinido) y sigue
  funcionando de forma degradada.

### 4.2 Variables de entorno (para el operador)

Estas variables se definen en el archivo de entorno del despliegue (la plantilla de referencia es
`.env.example`). **Nunca compartas ni publiques sus valores reales.** Aquí se explica **para qué
sirve cada una**, sin revelar secretos:

| Variable | Para qué sirve (en términos de operación) | Obligatoria |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Dirección del proyecto Supabase al que se conecta la aplicación. | Sí |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Llave pública de Supabase para que el navegador y el servidor se conecten. Si falta, el panel redirige a `/admin/login` y la app degrada. | Sí |
| `SUPABASE_SERVICE_ROLE_KEY` | Llave privilegiada que usa **solo el servidor** para operaciones de escritura (registro, guardado de cuestionarios, cálculo de coincidencias). Nunca se expone al navegador. | Sí |
| `MATRICULA_HMAC_SECRET` | Secreto usado para **transformar la matrícula en un valor irreversible**. Debe tener al menos 32 caracteres. Si este secreto cambia, las matrículas ya registradas dejarían de coincidir con su hash guardado. | Sí |
| `CORS_ALLOWED_ORIGINS` | Lista opcional de orígenes (sitios) adicionales autorizados a llamar a las interfaces. El propio origen siempre se permite. | Opcional |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Habilitan el **control de peticiones por frecuencia (rate limiting)** de forma distribuida. Sin ellas, el control opera en modo "abierto" (no bloquea por exceso). | Recomendado fuerte; **obligatorio para el evento** |

> **Advertencia de seguridad:** las variables que empiezan con `NEXT_PUBLIC_` quedan visibles en
> el navegador (es esperado). Las demás (`SUPABASE_SERVICE_ROLE_KEY`, `MATRICULA_HMAC_SECRET`) son
> **secretos de servidor** y no deben salir de ahí ni compartirse por chat, correo o capturas.

### 4.3 Gestión de catálogos, umbrales y contenido

| Qué quieres ajustar | Archivo / lugar | Cómo se aplica |
|---|---|---|
| Umbrales y pesos (romance 0.78 / amistad 0.65, top-3/top-5, factores de intimidad y conflicto, filtros duros, dimensiones) | `data/matching-config.json` | Editar y recargar. |
| Preguntas del cuestionario | `data/microtest.json` (60 ítems) | Editar y recargar. |
| Arquetipos / animalitos / colores | `data/arquetipos.json` | Editar/regenerar y **volver a sembrar** la base (`seed.sql`). |
| Eneagrama, alas y asignaciones | `data/enneagram.json`, `data/enneagram-assignments.json` | Editar y recargar; útil para ajustar arquetipos derivados. |

Notas para el operador:

- **Umbrales actuales de referencia:** romance usa `0.78` y amistad `0.65`; ambos viven en
  `data/matching-config.json`. Un umbral más alto = menos coincidencias; más bajo = más
  coincidencias. Romance es deliberadamente escaso (máx. 3 matches; `P(Sim ≥ 0.78) ≤ 6 %`
  de los pares, 0.184 % en la muestra sintética) y además una compuerta cuantil limita a
  **6 % de las personas** con match romántico. Amistad es más generosa (máx. 5, objetivo de
  calibración 35 %). `0.85` no es un umbral activo del motor canónico.
- **No hay pantalla para editar nada de esto.** Los cambios se hacen sobre los archivos y se
  recargan; después conviene verificar en el panel que el umbral mostrado cambió.
- Ciertos **textos fijos** (como el mensaje de "sin coincidencias") están **protegidos**: no deben
  modificarse porque el sistema los valida tal cual (ortografía y emoticones incluidos).

### 4.4 Gestión de permisos y accesos de otros administradores

- **No existe una pantalla para nombrar administradores** (a propósito: nadie puede escalar
  privilegios desde la interfaz).
- **Promover:** la persona entra una vez con su matrícula en `/`; luego quien opera el
  servidor ejecuta un script local (no versionado) que asigna el rol en `user_roles` y guarda el
  hash del PIN administrativo en `admin_credentials`. Ver [1.5](#15-requisitos-de-acceso-antes-de-que-alguien-pueda-entrar).
- **Revocar:** borrar su fila de `user_roles` (y de `admin_credentials`). Cada petición del
  observatorio vuelve a comprobar el rol, así que la sesión deja de valer de inmediato.
- Las cuentas administrativas **no se pueden borrar desde el observatorio**; primero se revoca
  el rol.

### 4.5 Mantenimiento y verificación

- **Comprobaciones recomendadas del sistema** (para quien da soporte técnico): existen comandos de
  verificación (`lint`, `typecheck`, `test`). No son acciones del panel, pero son la forma de
  confirmar que un cambio de configuración no rompió nada.
- **Cierre del evento:** exporta el CSV agregado desde el panel y después ejecuta la purga
  documentada en `DESPLIEGUE.md` (`supabase/purge_event.sql`). Borra participantes y sus datos en
  cascada, conserva administradores y exige una confirmación explícita.
- **Rate limiting:** sin Upstash configurado el sistema no bloquea por frecuencia. Para el evento
  real, configura las dos variables y verifica que las respuestas incluyan
  `X-RateLimit-Policy` distinto de `fail-open`.
- **Arranque del proyecto** (referencia rápida):
  - Instalar dependencias: `npm install`.
  - Copiar la plantilla de entorno: `cp .env.example .env.local` (en Windows,
    `copy .env.example .env.local`) y llenar los valores.
  - Desarrollo: `npm run dev` (abre `http://localhost:3000`).
  - Producción: `npm run build` y luego `npm run start`.
- **Caducidad de la sesión del estudiante:** el borrador del cuestionario vive solo en el
  dispositivo; si el estudiante cambia de equipo o borra los datos del navegador, pierde el
  avance no enviado (pero su matrícula sigue registrada).

---

## 5. Solución de Problemas Comunes (FAQ)

Los siguientes casos están tomados de los **mensajes y validaciones reales** del sistema.

### 5.1 Estudiante: "No se puede continuar con esta matrícula" (registro)

- **Qué significa:** la matrícula ya está registrada o no está disponible (el sistema responde
  igual para matrículas nuevas y repetidas, para no revelar cuáles existen). También aparece si la
  matrícula no cumple el formato.
- **Formato válido:** de **4 a 32 letras o números** (mayúsculas; se ignoran espacios, guiones y
  guiones bajos). El mensaje de formato es *"Escribe de 4 a 32 letras o números."*
- **Qué hacer:** si el estudiante ya se había registrado, debe usar **reingreso** (`/login`) con
  esa matrícula en lugar de volver a registrarse. Si es la primera vez y el formato es correcto,
  revisar que el servicio esté disponible e intentar de nuevo.

### 5.2 Estudiante: "No encontramos un perfil con esa matrícula" (reingreso)

- **Qué significa:** la matrícula escrita no corresponde a ningún perfil creado.
- **Qué hacer:** usar el enlace **"Crear mi perfil ahora"** para registrarse, o verificar que esté
  escribiendo la misma matrícula con la que se registró originalmente.

### 5.3 Estudiante: "Tu sesión ya no está disponible" / "Necesitas una sesión activa" (401)

- **Qué significa:** la sesión caducó (por ejemplo, al intentar ver el resultado o enviar el
  cuestionario después de un tiempo).
- **Qué hacer:** volver al acceso y **reingresar con la matrícula** en `/login`. El avance del
  cuestionario guardado en el dispositivo se conserva; no hay que repetirlo desde cero.

### 5.4 Estudiante: "No pudimos abrir tu resultado" / cuestionario no completado (404)

- **Qué significa:** se intentó ver el resultado sin haber completado el cuestionario.
- **Qué hacer:** completar el cuestionario (el sistema redirige al cuestionario cuando aún no está
  terminado). Si el error es otro ("Puede ser temporal…"), pulsar **"Reintentar"**.

### 5.5 Estudiante o administrador: "El hábitat no está disponible" / "Servicio no disponible" (503)

- **Qué significa:** el servicio de base de datos/autenticación (Supabase) no está configurado o
  no responde en este momento. En el panel se ve como *"Lectura interrumpida; conserva el último
  agregado"*.
- **Qué hacer:** verificar que las **variables de entorno de Supabase** estén correctamente
  configuradas y que el proyecto esté activo. Reintentar más tarde.

### 5.6 Administrador: "No pudimos verificar el acceso administrativo" (401)

- **Qué significa:** la matrícula no existe, no tiene rol administrativo **o** el PIN no coincide
  (el mensaje no distingue la causa, por seguridad).
- **Qué hacer:** confirmar matrícula y PIN; si son correctos, verificar que la cuenta esté
  promovida (ver [4.4](#44-gestión-de-permisos-y-accesos-de-otros-administradores)). Si el
  observatorio te regresó a `/admin/login`, la sesión expiró (30 min sin actividad o 4 h).

### 5.7 Administrador: "Demasiados intentos" (429)

- **Qué significa:** 5 PIN incorrectos seguidos (pausa de 1, 5, 15 y luego 60 min) o 20 intentos
  desde la misma red en 15 minutos.
- **Qué hacer:** esperar el tiempo indicado. Un PIN correcto reinicia el contador.

### 5.8 "Demasiadas peticiones" / límite de frecuencia en operaciones del estudiante

- **Qué significa:** las acciones del estudiante también tienen límites por seguridad (por
  ejemplo, el registro y el reingreso permiten pocos intentos por minuto). Si se exceden, la
  petición se rechaza temporalmente.
- **Qué hacer:** esperar unos instantes y reintentar. Si el control de frecuencia distribuido no
  está configurado, el sistema opera en modo "abierto" y no bloquea por este motivo.

### 5.9 "No pudimos guardar tus respuestas" al enviar el cuestionario

- **Qué significa:** el envío falló (problema temporal del servicio o sesión caducada).
- **Qué hacer:** el **avance sigue guardado en el dispositivo**; reintentar el envío. Si el mensaje
  indica sesión no disponible, reingresar por `/login` y retomar.

### 5.10 Las herramientas `/dev/sprites` o `/dev/constellation` no abren

- **Qué significa:** son rutas **exclusivas de desarrollo**; en **producción muestran "página no
  encontrada" (404)** por diseño.
- **Qué hacer:** para usarlas, accede desde un entorno de desarrollo (`npm run dev`).

---

### Resumen de capacidades AUSENTES (para no asumir de más)

Con base en el comportamiento real del sistema, **no existen** las siguientes capacidades (se
documentan para evitar suposiciones):

- **No hay** pantalla para **crear** estudiantes ni para **editar** sus respuestas o su alias;
  el observatorio sí permite **borrar**, **reiniciar el cuestionario** y **pausar** (auditado).
- **No hay** búsqueda por matrícula (solo por alias), porque la matrícula no existe en claro.
- **No hay** pantalla administrativa para **crear, enviar, editar o eliminar notificaciones**; son
  generadas automáticamente por el sistema.
- **No hay** pantalla para **administrar coincidencias** (crearlas, aprobarlas o borrarlas); se
  generan solas y solo las ve el propio estudiante.
- **No hay** pantalla para **gestionar catálogos** (animales, colores, arquetipos) ni el
  **cuestionario**; se editan archivos de datos y se recargan.
- **No hay** pantalla para **editar umbrales/pesos**; se cambian en los archivos de datos.
- **No hay** pantalla para **gestionar roles/permisos de administradores**; la promoción es manual
  con un script local (ver [4.4](#44-gestión-de-permisos-y-accesos-de-otros-administradores)).
- **No hay** recuperación de contraseña para el estudiante (no usa contraseña; reingresa con su
  matrícula).
- **No se muestran** matrículas, hashes, vectores, lectura latente, filtros duros ni respuestas
  individuales en ninguna pestaña del observatorio.
- El **borrador del cuestionario** se guarda solo en el dispositivo del estudiante, no en el
  servidor.
- Las rutas **`/dev/*`** no están disponibles en producción (devuelven 404).
