# Comunicado para personas usuarias

**Canal:** WhatsApp / grupo de la universidad
**Tono:** cálido, breve, sin tecnicismos
**Fecha sugerida de envío:** después del deploy exitoso

---

## Mensaje

Hola 🌱 (sin emojis en la app, pero aquí en WhatsApp sí se vale)

Les contamos qué cambió en ZooMatch:

• Si tu animalito todavía es un huevito, ahora te dice exactamente cuántas preguntas te faltan para eclosionar. Nada de porcentajes confusos.

• Corregimos un bug visual donde algunas palabras se veían raras (como "aAnidades" en vez de "afinidades"). Ya se lee bien en todos lados.

• Si ya terminaste el test pero tu perfil seguía como huevo, el sistema ahora lo revisa cada 30 minutos y lo eclosiona solito. No tienes que hacer nada.

• Las personas que eligen "solo amistad" siguen sin aparecer en romance — eso no es un error, es tu elección respetada. Ahora el mensaje lo explica mejor.

• Ajustamos los números que comparan perfiles entre sí. Se recalcularon solos, con las respuestas que ya habías dado: no hay ninguna pregunta nueva que responder.

Tu nombre y tu animalito se quedan igual. Lo que sí cambia es la lista: a algunas personas aparecerá gente que antes no alcanzaba el mínimo, y a otras se les quitará alguno. Nadie dejó de estar en ZooMatch por este ajuste.

Si algo se ve raro, escríbanos por aquí. 💚

---

## Los dos avisos dentro de la app (B9, ADR-052)

El texto está en `src/ui/profile/math-update-notice.tsx` y es el mismo que ve la persona. Son dos casos distintos y no deben mezclarse.

**T1 — cambió la matemática del puntaje** (pesos, umbrales, ligaduras, tolerancias). Es el caso de hoy: se recalcula sobre lo guardado, no se pregunta nada de nuevo, y el aviso dura una línea y sale una sola vez por cambio real.

> Tus cálculos se actualizaron con la nueva versión. No tienes que hacer nada.

**T2/T3 — cambió la medición** (un enunciado, una escala, la covarianza latente o el método). Ahí sí existe una afinación pendiente, y es opcional: el perfil sigue en el pool aunque nadie la haga.

> **Actualizamos la matemática**
> Algunas preguntas cambiaron de redacción o de escala, así que puedes volver a responderlas. Tu perfil se sigue calculando con lo que ya contestaste.
> [Afinar mi perfil] · [Ahora no]

Reglas que sostienen ambos textos: no se vuelve a preguntar lo que sigue siendo válido, ningún perfil se excluye del pool por no afinar, y a quien llega por primera vez no le aparece ninguno de los dos avisos.

---

## Notas internas (no enviar)

- **Sí cambiaron pesos y umbral** (B7-REL, ADR-050): `relacional` de 0.20 a 0 en romance, el resto del core renormalizado en proporción (÷ 0.8), umbral 0.5769 → 0.5548 y techo de referencia 0.6316 → 0.6163. La frase que estaba aquí («no se cambiaron umbrales ni pesos») era falsa desde ese despliegue.
- Medido en el arnés, no prometido: AUC contra la forma generadora 0.786 → 0.803; Jaccard ante ruido 0.534 → 0.514 (costo conocido de la fragilidad del top-K). Detalles en `docs/DECISIONES.md` (ADR-050).
- Cuánto se mueve para perfiles reales: `docs/DIVERGENCIA_RESULTADOS.md` (N=500). En romance entran 0.06 % de los pares y salen 0.11 %; 2.51 % de los matches ya mostrados en el top-K dejarían de aparecer. En amistad el cambio no toca nada (Δ = 0.0000). «Dejar de aparecer» es del listado de esa persona, no del pool.
- El cambio de hoy es **T1**: nadie recibe un aviso invitándolo a volver a contestar. La variante T2/T3 está escrita y probada, pero solo se activa cuando cambie el banco de ítems o el modelo de medición, y eso todavía no pasó.
- Los perfiles anteriores al sello (`params_version` en NULL) se recalculan en silencio y se sellan al guardar; no se les ofrece la afinación.
- No se envió ni se enviará un push/correo obligatorio por este cambio: el aviso T1 es un banner que se recuerda por firma en el navegador.
- No se tocó a ningún huevo cohort (a) — son personas que nunca respondieron.
- El reconciler es preventivo: actualmente 0 huevos elegibles.
- Si alguien pregunta "por qué no tengo matches de romance": probablemente eligió solo_amistad o sus filtros no cruzan con nadie aún. El mensaje en la app ahora lo explica.
