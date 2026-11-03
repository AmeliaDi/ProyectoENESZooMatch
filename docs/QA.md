# QA general (cierre)

Fecha: 2026-11-02 · commit probado: `356c807` (producción READY en Vercel).
Todas las pruebas usan **matrículas falsas** (`42614489x`) y borran lo que
crean. Al terminar, Supabase quedó como estaba: 3 cuentas de Auth y 2 perfiles.

Scripts reproducibles:

| Script | Qué hace |
|---|---|
| `scripts/qa/qa-api.mjs` | Rutas, autenticación, validación, origen, flujo completo (entrar → test → resultado → pausar → borrar) y fugas en JSON. Con `BASE=` corre contra dev o producción |
| `scripts/qa/qa-ui.mjs` + `qa-ui-probe.js` | Edge headless (CDP) contra `next dev -p 3124`: 9 pantallas × móvil/desktop × noche/día, contraste, foco, objetivos táctiles, scroll horizontal, fugas en el DOM, movimiento reducido y teclado |
| `npm run check` y `next build` | Tipos, lint, 616 tests y build de producción |

## 1. API y flujo (producción, `https://zooenes.vercel.app`)

| Comprobación | Resultado | Estado |
|---|---|---|
| `/`, `/cuestionario`, `/resultado`, `/perfil`, `/ajustes`, `/afinar`, `/evidencia`, `/admin/login` | 200 | OK |
| Ruta inexistente | 404 (página ilustrada) | OK |
| `/dev/avatars`, `/dev/ui`, `/dev/physics` en producción | 404 | OK |
| `profile`, `result`, `privacy`, `notifications` y `admin/metrics` sin sesión | 401 | OK |
| Matrícula con formato imposible (`12`, `ab`, `!!!!!`, vacía) | 400 | OK |
| `POST /api/enter` con `Origin` ajeno | 403 | OK |
| Matrícula nueva y reingreso con la misma | 200 y 200 (retoma) | OK |
| Test incompleto | 400 | OK |
| Test completo (2 personas) | 200 | OK |
| `GET /api/result` | 200, matches romance 1 y amistad 2 | OK |
| Fugas en `result` (θ, SE, latente, vectores, respuestas, matrícula, hash, ids) | ninguna | OK |
| Fugas en `profile` | ninguna | OK |
| Pausar perfil | 200; la otra persona deja de verlo | OK |
| Notificaciones | 200 | OK |
| Borrar mis datos | 200; después, `profile` → 401 | OK |

**39/39 OK** (las mismas 39 en local).

> No hay padrón de matrículas: cualquier matrícula de exactamente 9 dígitos
> puede registrarse. Desde ADR-026 la matrícula es la única credencial (sin
> clave personal) y el guardia de Postgres limita intentos por dirección.
> `qa-api.mjs` prueba formatos inválidos, campos extra rechazados (400),
> Origin ajeno (403), alias fijo y `/api/exit`.

## 2. UI: 9 pantallas × 2 vistas × 2 modos (local, dev)

Móvil 390×844 y desktop 1280×900, modos noche y día. Umbrales: texto ≥ 4.5:1
(≥ 3:1 si es grande), objetivos táctiles de al menos 44 px de alto, foco
visible al navegar con teclado y cero scroll horizontal.

**Antes de las correcciones**

| Hallazgo | Dónde | Gravedad |
|---|---|---|
| El enlace «ZooMatch» de la cabecera medía 30 px de alto | Todas las pantallas | Media (táctil) |
| Sin foco visible en elementos **seleccionados** (pestaña activa Romance/Amistad, tema y modo elegidos en Ajustes): la regla de selección pisaba el borde de foco | Resultado, Ajustes | Media (teclado) |
| La sonda leía como contraste 1.00 el texto de los botones pixel, porque su fondo vive en `::before` | Botones `.zm-box` | Falso positivo: se corrigió la sonda, no la UI |

**Después** (`356c807`)

| Pantalla | Móvil noche | Móvil día | Desktop noche | Desktop día |
|---|---|---|---|---|
| Entrada | 0 | 0 | 0 | 0 |
| Test | 0 | 0 | 0 | 0 |
| Resultado (cielo) | 0 | 0 | 0 | 0 |
| Tu carta | 0 | 0 | 0 | 0 |
| Afinar | 0 | 0 | 0 | 0 |
| Evidencia | 0 | 0 | 0 | 0 |
| Ajustes | 0 | 0 | 0 | 0 |
| Admin (login) | 0 | 0 | 0 | 0 |
| 404 | 0 | 0 | 0 | 0 |

Cada 0 cubre, juntos: scroll horizontal, objetivos táctiles bajo 44 px,
texto bajo AA, foco invisible, fugas en el DOM (θ, `"se"`, `latent_profile`,
`matricula_hash`, `user_id` y la matrícula) y excepciones en consola.

## 3. Interacción y accesibilidad

| Comprobación | Resultado |
|---|---|
| Nodo del cielo | `role="button"`, `tabindex=0`, etiqueta «Ornitorrincocito rosa orquídea, 64 % de afinidad estimada en romance» |
| Enter sobre el nodo | Abre el panel (`<dialog>`) con el foco dentro, «afinidad estimada» y nivel de confianza |
| Cerrar el panel | Se cierra y el foco **vuelve al nodo** |
| «Ver lista» → «Ver por qué» | 1 fila, 5 dimensiones con aporte real, sin scroll horizontal |
| Tu carta | 62 escalas; secciones «Tus virtudes», «Tus afinidades», «¿Quieres afinar tu perfil?» y «Tus lecturas» |
| `prefers-reduced-motion: reduce` en el cielo | Lienzo **estático** (dos capturas idénticas con 1.5 s de diferencia) |

## 4. Sprites (revisión de diseño)

Se revisaron las 103 matrices en ASCII. El cisne y otras seis especies usaban
la plantilla genérica de su familia y no se reconocían; ahora tienen silueta
propia (detalle en `docs/AVATARES.md` §5). Cisne a tamaño real (B: cuerpo,
S: sombra, H: luz, E: ojos, p: rubor):

```
................
................
................
.....BBBBBB.....
...BBSSSSSSBB...
...BBBBBBBBBB...
H..BEEBBBBEEB..H
HH.BEEBBBBEEB.HH
HSS.ppHHHHpp.SSH
HSS...BHHB...SSH
.HSS..BBBB..SSH.
.HSS..BBBB..SSH.
.BHSS.BBBB.SSHB.
..BHSSBBBBSSHBSS
..BBBBBBBBBBBB..
.S.SS.S..S.SS.S.
```

| Comprobación | Resultado |
|---|---|
| Sprites (77 especies × 28 colores × 4 marcas) | 8 624, **8 624 distintos** |
| Regresión detectada en el camino | Con las siluetas nuevas, 112 combinaciones colisionaban: la marca de subtipo «so» caía en una celda vacía. Se corrigió, y el test ahora recorre las 77 especies (antes solo una por pool) |
| Contrato del motor (ojos, rubor, corazones, simetría, esquinas) | 258 tests de avatares y UI en verde |

## 4.1 Chat, dorado y física (2026-11-04, `97a1a97`)

| Comprobación | Resultado |
|---|---|
| `npm run check` (tests, lint, typecheck, secretos) | 822 tests en verde |
| QA de API contra producción (`scripts/qa/qa-api.mjs`) | **80/80 OK** (16 nuevas del chat: señal invisible, apertura mutua, candado, rondas ocultas, sin chat libre antes, retirada, aviso sin contenido) |
| Base tras el QA | 71 perfiles; 0 filas en `chat_interests`, `conversations`, `conversation_*`, `chat_pins` |
| LCP / CLS (Edge headless, sesión QA) | `/resultado` 868 ms / 0.000; `/chats` 896 ms / 0.006 |
| Física móvil 120 estrellas, paso medio | 3.39 → 1.52 ms (40.7 → 18.3 % del cuadro) |
| Dorado con afinidades reales | romance 5/90, amistad 4/237 (antes 0) |

## 4.2 Cierre de pendientes (2026-11-04, `af2ea0d`, ADR-034)

| Comprobación | Resultado |
|---|---|
| `npm run check` y build | 820 tests en verde (salen los del operador Φ eliminado y entran tap, toast con destino y colisión de alias) |
| QA de API contra producción | **80/80 OK**, alias fijo al rehacer incluido |
| Colisión de alias en la base real (bloque revertido, `.qa/alias-probe.mjs`) | 1.ª persona `… · ZZZZ`; 2.ª `… · ZZZZ-D8F`; al rehacer conserva `-D8F`. Perfiles antes y después: 71 |
| LCP / CLS | `/resultado` 876 ms / 0.000; `/chats` 876 ms / 0.006 |

## 5. Pendiente (fuera de lo que se puede automatizar aquí)

- **Chat en dos teléfonos reales**: el flujo se probó por API y con tests de componentes;
  falta recorrerlo a mano con dos personas (rondas, invitación, chat libre, retirarse).

- **Teléfono real de gama media.** Los FPS medidos son de Chromium con CPU
  ×4 (`docs/FISICA.md`). Falta abrir `/resultado` en un teléfono y anotar la
  fluidez.
- **Lector de pantalla real** (TalkBack/VoiceOver). Aquí solo se verificaron
  roles, etiquetas y el orden del foco.
- **Panel de admin con sesión.** Solo se probó el login y el 401 de las
  métricas; no hay cuenta admin de prueba.
