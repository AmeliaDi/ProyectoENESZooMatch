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
| **Administrador** | Personal que consulta el panel de métricas | Correo administrativo + contraseña (sesión individual) | `/admin/login` |
| **Estudiante / participante** | Persona que responde el cuestionario y ve sus coincidencias | Solo su **matrícula** (sin nombre, sin correo, sin contraseña propia) | Pantalla principal (`/`) y reingreso (`/login`) |

Detalles importantes de cada rol:

- **Administrador.** No existe una "contraseña compartida" del panel: cada administrador tiene
  su propio correo y contraseña. Además de iniciar sesión, el sistema comprueba que la cuenta
  tenga asignado el **rol administrativo**; si no lo tiene, no lo deja pasar aunque la contraseña
  sea correcta. El panel está protegido en dos niveles: primero la sesión y después el rol.
- **Estudiante.** La matrícula **nunca se guarda ni se muestra tal cual**: se transforma en un
  valor irreversible antes de almacenarse. Por eso el estudiante **no tiene contraseña que
  recordar**; para volver a entrar solo escribe de nuevo su matrícula (ver [1.4](#14-reabrir-o-recuperar-la-sesión-del-estudiante)).

### 1.3 Cómo iniciar sesión en el panel de administración

1. Abre la dirección del panel: `/admin/login`.
2. En el formulario **Identificación**, escribe:
   - **Correo administrativo** (por ejemplo, el correo institucional del administrador).
   - **Contraseña**.
3. Pulsa el botón **"Abrir observatorio"**.
4. Si las credenciales son válidas **y** la cuenta tiene rol administrativo, entrarás al panel
   en `/admin`.

Consideraciones:

- **Límite de intentos.** El acceso está limitado a **5 intentos cada 15 minutos**. Si te pasas,
  verás el mensaje *"Demasiados intentos. Espera antes de volver a intentar."* Debes esperar a
  que pase la ventana antes de reintentar.
- **Mensajes de acceso fallido.** Si el correo o la contraseña no coinciden, o si la cuenta no
  tiene rol administrativo, verás *"No se pudo verificar el acceso administrativo."* (el sistema
  no revela cuál de las dos causas fue, por seguridad).
- Si el servicio de autenticación no está disponible en ese momento, aparecerá
  *"El servicio de acceso no está disponible en este momento."*

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

Para que la plataforma funcione y se pueda entrar, se necesita:

- **Supabase configurado.** La aplicación depende de un proyecto Supabase (base de datos +
  autenticación). Si las credenciales de Supabase no están configuradas, el panel **redirige a
  `/admin/login`** y las operaciones del estudiante responden como "no disponible".
- **Base de datos preparada.** Aplicar, en orden, las migraciones y las semillas de datos
  (`supabase/migrations/*.sql` → `seed.sql`). Esto crea las tablas, los
  catálogos de animales/colores y los cuestionarios.
- **Promoción del primer administrador.** No hay una pantalla para "dar de alta administradores".
  El alta se hace manualmente con el archivo `supabase/promote_admin.sql`:
  1. Crea al usuario (correo y contraseña) en el gestor de autenticación de Supabase
     (sección *Authentication → Users*).
  2. Edita el correo dentro de `promote_admin.sql` y ejecuta ese bloque en el *SQL Editor* de
     Supabase. El bloque asigna el **rol administrativo** a esa cuenta.
  - Si el correo no existe como usuario, el bloque falla con un aviso claro ("No existe un
    usuario de Auth con el correo …").
- **Variables de entorno.** Deben estar definidas en el archivo de entorno (ver
  [4.2](#42-variables-de-entorno-para-el-operador)). Sin ellas, el sistema degrada con gracia
  pero no permite operaciones reales.

---

## 2. Navegación Global y Dashboard

### 2.1 Cómo está protegida y organizada la zona de administración

- Toda la zona que empieza con `/admin` está **vigilada**: si no hay sesión válida con rol
  administrativo, el sistema **redirige a `/admin/login`**. Si ya iniciaste sesión y entras a
  `/admin/login`, te lleva directo al panel.
- El panel es una **única pantalla** ("Observatorio vivo · ZooMatch / Control de hábitat").
  **No hay un menú lateral ni varias secciones navegables**: todo lo visible son las métricas,
  agrupadas en tarjetas, más tres botones de acción en el encabezado.

### 2.2 Encabezado del panel y sus botones

En la parte superior del panel hay tres botones:

| Botón | Qué hace |
|---|---|
| **Refrescar** | Vuelve a leer las métricas en ese momento. Mientras trabaja muestra "Actualizando". |
| **Exportar CSV** | Descarga un archivo `.csv` con los agregados visibles. El archivo se llama `zoomatch-agregados-AAAA-MM-DD.csv`. |
| **Cerrar sesión** | Termina tu sesión de administrador y regresa a `/admin/login`. |

Debajo del encabezado hay una **barra de estado** que muestra:

- **"Última lectura · <fecha y hora> UTC"** — cuándo se midieron los datos por última vez.
- **"Polling visible · 60 s / umbral > X%"** — el panel **se actualiza solo cada 60 segundos**
  mientras la pestaña esté visible, y muestra el **umbral de compatibilidad activo** (en
  porcentaje) con el que se está midiendo.
- Si la lectura se interrumpe, la barra cambia a *"Lectura interrumpida; conserva el último
  agregado"* (es decir, sigue mostrando la última medición buena).

### 2.3 Qué significa cada tarjeta, gráfica o tabla del panel

> **Principio de privacidad:** el panel **solo muestra agregados** (conteos y porcentajes).
> **Nunca** muestra matrículas, nombres, correos, vectores ni respuestas individuales. Esto está
> reforzado en el pie de página del panel: *"Solo agregados · sin identificadores · sin vectores ·
> sin respuestas"* y *"Autorización doble: servidor + RPC"*.

| Elemento visible | Qué representa (en lenguaje de operador) |
|---|---|
| **Perfiles totales** | Cantidad de registros anónimos que existen en el sistema (cada estudiante que completó su registro/cuestionario). |
| **Usuarios con al menos un match** (`X%` + "N distintos") | Porcentaje y número de estudiantes distintos que tienen **al menos una coincidencia** por encima del umbral activo. La tarjeta aclara: *"Similitud estrictamente mayor al umbral activo."* |
| **Barra de progreso** debajo del porcentaje | Representación visual del porcentaje de usuarios con coincidencia. |
| **Distribución MBTI completa** ("Dieciséis señales", `n = total`) | Gráfica de barras con cuántos perfiles corresponden a cada uno de los **16 tipos MBTI**. `n` es la suma de todos. |
| **Conteo MBTI accesible** (tabla *Tipo / Perfiles*) | La misma distribución anterior en formato de tabla (fila por tipo, con su conteo), para lectura accesible. |
| **Top 5 animalitos** ("Taxonomía agregada", gráfica) | Los **cinco animalitos más frecuentes** entre los perfiles, por cantidad. |
| **Ranking accesible** (tabla *Animalito / Perfiles*) | El mismo top de animalitos en formato de tabla. |
| **Pie de página** | Recordatorio de que la vista solo expone agregados y de que la autorización se valida en dos capas. |

### 2.4 Estados especiales del panel

- **Hábitat vacío.** Si todavía no hay perfiles (`Perfiles totales = 0`), aparece un aviso:
  *"Hábitat sin perfiles todavía"* y las tablas/gráficas se muestran en cero, a la espera de la
  primera medición.
- **Sin especies asignadas.** Si aún no hay animalitos que rankear, el bloque del top muestra
  *"Sin especies asignadas"* / *"Sin datos agregados"*.

> **Sobre el umbral mostrado:** el umbral que ves en la barra de estado proviene de la
> configuración vigente (ver [4.3](#43-gestión-de-catálogos-umbrales-y-contenido)). No se edita
> desde el panel; se cambia en los archivos de datos del sistema.

---

## 3. Guía Módulo por Módulo

A continuación se describe cada módulo **real** del sistema. Para cada uno se indica: para qué
sirve, si permite crear registros (y con qué campos), cómo se edita/desactiva/elimina (borrado
lógico vs físico) y qué filtros o búsquedas ofrece.

> **Regla general e importante:** el sistema **no tiene pantallas administrativas de captura o
> edición de datos** (no hay "altas/bajas/cambios" de estudiantes, coincidencias ni catálogos
> desde el panel). El panel de administración es de **solo lectura** (métricas + exportar + salir).
> El contenido (catálogos, cuestionarios, umbrales) se administra **editando los archivos de datos
> del sistema y volviéndolos a cargar en la base**, no desde una pantalla. Cada módulo detalla su
> caso.

### 3.1 Módulo: Panel de métricas / analítica

- **¿Para qué sirve?** Mostrar, de un vistazo, el estado agregado del "hábitat": cuántos perfiles
  hay, qué porcentaje tiene al menos una coincidencia, cómo se distribuyen los 16 tipos MBTI y
  cuáles son los 5 animalitos más frecuentes.
- **¿Se pueden crear registros?** **No.** Este módulo es **de solo lectura**. No existe un
  formulario para crear, editar ni borrar métricas.
- **Acciones disponibles:** **Refrescar** (releer), **Exportar CSV** (descargar agregados) y
  **Cerrar sesión**.
- **Filtros y búsquedas:** **No hay.** Las tablas (MBTI y ranking de animalitos) son fijas y no
  permiten filtrar, ordenar ni buscar.
- **Contenido del CSV exportado:** columnas `section, label, value, percentage`, con filas de
  resumen (`total_profiles`, `users_with_match_above_threshold`, `active_threshold_exclusive`),
  la distribución MBTI y el top de animalitos. El archivo se genera protegido contra fórmulas de
  hoja de cálculo y en codificación compatible con Excel.

> **Transparencia sobre una capacidad interna no visible:** el sistema cuenta con un cálculo
> agregado **dual (romance + amistad)** que también contempla un **top de colores**, pero
> **no está expuesto en ninguna pantalla del panel**. Lo que el administrador ve hoy en `/admin`
> son los agregados descritos arriba (totales, % con match, MBTI y top de animalitos). La división
> romance/amistad sí la ve el **estudiante** en su propia pantalla de resultado
> (ver [3.6](#36-módulo-perfiles-y-resultados)).

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
  - **✨ Futuros Mejores Amigxs** (pista *amistad*): compatibilidad de amistad. **No** aplica esos
    filtros duros.
- **Cómo se presenta cada coincidencia:** una tarjeta con un **anillo de porcentaje de
  química**, el alias de la otra persona, su animalito y color, "insignias" (badges) de afinidad,
  una narrativa breve y un botón **"¿Por qué hicimos match?"** que despliega el desglose por
  categorías (Personalidad, Gustos culturales, Intimidad y afecto, Valores relacionales,
  Identidad y compromiso), un resumen de personalidad y un titular poético.
- **Cuando no hay coincidencias:** se muestra un mensaje tranquilizador predefinido (no se
  corrige su redacción ni sus emoticones; está fijado tal cual en el sistema).
- **Eliminación:** las coincidencias de una persona se eliminan **en cascada** si su cuenta llega
  a eliminarse en el gestor de autenticación (no hay botón de borrado dentro de la app).

### 3.3 Módulo: Notificaciones

- **¿Para qué sirve?** Avisar al estudiante, con mensajes cálidos, sobre su actividad: cuando
  aparece una coincidencia, cuando no la hay y como bienvenida al crear su perfil.
- **Tipos de notificación detectados:**

  | Tipo | Cuándo aparece | Ejemplo de título |
  |---|---|---|
  | `welcome` (bienvenida) | La primera vez que el estudiante completa su cuestionario | *"Tu perfil ya brilla en el hábitat 🌟"* |
  | `match_romance` | Cuando hay coincidencias en la pista romance | *"El universo conspiró a tu favor 💫"* |
  | `match_amistad` | Cuando hay coincidencias en la pista amistad | *"Tu vibra resonó con alguien ✨"* |
  | `no_match` | Cuando no hay coincidencias por encima del umbral | *"Tu momento llegará 🌱"* |

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
    coincidencias en **dos pestañas** (Almas Gemelas / Futuros Mejores Amigxs). Además puede
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

Notas para el operador:

- **Umbrales actuales de referencia:** romance usa `0.78` y amistad `0.65`; ambos viven en
  `data/matching-config.json`. Un umbral más alto = menos coincidencias; más bajo = más
  coincidencias. Romance es deliberadamente escaso (máx. 3 matches; `P(Sim ≥ 0.78) ≤ 6 %`
  de los pares, 0.46 % en la muestra sintética); amistad es más generosa (máx. 5, cobertura
  de calibración 35 %). `0.85` no es un umbral activo del motor canónico.
- **No hay pantalla para editar nada de esto.** Los cambios se hacen sobre los archivos y se
  recargan; después conviene verificar en el panel que el umbral mostrado cambió.
- Ciertos **textos fijos** (como el mensaje de "sin coincidencias") están **protegidos**: no deben
  modificarse porque el sistema los valida tal cual (ortografía y emoticones incluidos).

### 4.4 Gestión de permisos y accesos de otros administradores

- **No existe una pantalla de administración de roles.** No hay un menú para "listar
  administradores", "promover" ni "revocar" desde la interfaz.
- **Promover a un nuevo administrador** se hace de forma manual:
  1. Crea la cuenta (correo + contraseña) en el gestor de autenticación de Supabase.
  2. Ejecuta `supabase/promote_admin.sql` con ese correo (en el *SQL Editor* de Supabase). Esto
     registra el **rol administrativo** en la tabla de roles.
- **Revocar el acceso** de un administrador implica quitarle el rol en la base de datos (tarea de
  quien administra Supabase), fuera de la interfaz de la aplicación.
- La **doble validación** (sesión + rol) ocurre tanto al iniciar sesión como al consultar el
  panel: si a una cuenta se le quita el rol, perderá el acceso aunque conserve la sesión.

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

### 5.6 Administrador: "No se pudo verificar el acceso administrativo" (401/403)

- **Qué significa:** el correo o la contraseña no coinciden, **o** la cuenta no tiene rol
  administrativo (el mensaje no distingue la causa, por seguridad).
- **Qué hacer:**
  - Confirmar correo y contraseña.
  - Si las credenciales son correctas, verificar que la cuenta esté **promovida como
    administrador** (ver [4.4](#44-gestión-de-permisos-y-accesos-de-otros-administradores) y
    `supabase/promote_admin.sql`).
  - Si ya tenías sesión y te expulsó a `/admin/login`, vuelve a iniciar sesión.

### 5.7 Administrador: "Demasiados intentos. Espera antes de volver a intentar." (429)

- **Qué significa:** se alcanzó el **límite de 5 intentos en 15 minutos** para iniciar sesión.
- **Qué hacer:** esperar a que transcurra la ventana de 15 minutos y reintentar. Evitar múltiples
  intentos seguidos.

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

- **No hay** pantalla para **crear, editar, desactivar o eliminar estudiantes/usuarios** desde el
  panel. El panel es de **solo lectura** (métricas, exportar CSV y cerrar sesión).
- **No hay** buscadores, filtros ni ordenamiento en las tablas del panel (MBTI y top de
  animalitos son tablas fijas).
- **No hay** pantalla administrativa para **crear, enviar, editar o eliminar notificaciones**; son
  generadas automáticamente por el sistema.
- **No hay** pantalla para **administrar coincidencias** (crearlas, aprobarlas o borrarlas); se
  generan solas y solo las ve el propio estudiante.
- **No hay** pantalla para **gestionar catálogos** (animales, colores, arquetipos) ni el
  **cuestionario**; se editan archivos de datos y se recargan.
- **No hay** pantalla para **editar umbrales/pesos**; se cambian en los archivos de datos.
- **No hay** pantalla para **gestionar roles/permisos de administradores**; la promoción es manual
  mediante SQL (`promote_admin.sql`).
- **No hay** recuperación de contraseña para el estudiante (no usa contraseña; reingresa con su
  matrícula).
- **No se muestran** coincidencias, perfiles individuales, matrículas, vectores ni respuestas en el
  panel (solo agregados).
- La división de métricas **romance/amistad y el top de colores** existen como cálculo interno,
  pero **no están expuestos en la pantalla visible del panel**.
- El **borrador del cuestionario** se guarda solo en el dispositivo del estudiante, no en el
  servidor.
- Las rutas **`/dev/*`** no están disponibles en producción (devuelven 404).
