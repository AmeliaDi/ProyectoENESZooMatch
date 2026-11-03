# Dossier de evidencia — ZooMatch

> Fase 0 del análisis psicométrico. Este documento **no modifica código**:
> establece qué respaldo empírico tiene (o no tiene) cada decisión del
> instrumento y del modelo de matching, para que las fases 1–5 puedan
> citarlo por id (`EV-xx`).

## 0. Método de verificación y reglas

- **Verificación bibliográfica (2026-10-31).** Cada referencia se buscó en
  Crossref (`api.crossref.org/works`) y, cuando estaba disponible, se leyó
  el abstract en OpenAlex o Semantic Scholar.
  - `VERIFICADA`: autores, año, título y revista coinciden con Crossref.
  - `PARCIAL`: existe, pero difiere en algún dato (se indica cuál).
  - `[VERIFICAR]`: no se pudo confirmar en línea.
- **Tamaños de efecto.** Solo se reportan cifras que aparecen
  **literalmente en el abstract**. Si el abstract no da números, la celda
  dice "no reportado en abstract". No se han leído los textos completos;
  ninguna cifra procede de memoria.
- **Fuerza de la evidencia:**
  - **Fuerte:** metaanálisis o múltiples muestras grandes y replicadas.
  - **Moderada:** estudios longitudinales o diádicos sólidos con
    resultados no del todo convergentes.
  - **Débil:** evidencia escasa, mixta o con validez discutida.
  - **Heurística:** decisión de diseño propia, sin respaldo empírico
    directo.
- **Etiqueta de parámetro** (usada en las fases 3 y 5):
  - `prior`: proviene de la literatura.
  - `estimado`: proviene de datos sintéticos; valida el código, no el
    mundo real.
  - `supuesto`: decisión de diseño.

---

## 1. Hallazgo central (léase primero)

| id | Afirmación | Respaldo | Fuerza |
|---|---|---|---|
| EV-01 | La **similitud de personalidad** explica una fracción muy pequeña de la satisfacción relacional. Los efectos del propio rasgo (actor) son mucho mayores. | Dyrenforth et al. 2010: similitud **< .5 %** de la varianza tras controlar actor y pareja; actor ≈ 6 %; pareja 1–3 %. Weidmann et al. 2016 (revisión) llega a la misma conclusión. | Fuerte |
| EV-02 | La **atracción inicial** específica de la díada (quién le gusta a quién en particular) **no se pudo predecir** con más de 100 medidas de autoinforme. | Joel, Eastwick & Finkel 2017: se predijo 4–18 % de la varianza de actor y 7–27 % de la de pareja, pero **no** la varianza relacional. | Fuerte (2 estudios, ML) |
| EV-03 | Los mejores predictores de la calidad relacional son **variables de la propia relación** (compromiso, apreciación, conflicto percibido), que no existen antes de conocerse. | Joel et al. 2020 (43 estudios): lo relacional explica hasta 45 % al inicio; las diferencias individuales, 21 %. El cambio en la calidad fue en gran medida impredecible. | Fuerte |

**Consecuencia de diseño (obligatoria):** ZooMatch no puede afirmar que
predice buenas relaciones. Lo honesto y defendible es **filtrar por
compatibilidad declarada** (filtros duros, valores y estilo de vida),
**facilitar encuentros entre personas parecidas en lo que la evidencia
indica que importa** (sobre todo valores y actitudes) y presentar el
porcentaje como **"afinidad estimada"**, nunca como pronóstico. Así debe
decirse en la UI (fase 5) y en `docs/VALIDACION.md` (fase 4).

---

## 2. Matriz de evidencia

Columnas: afirmación/decisión | estudio | diseño y muestra | tamaño de
efecto (literal del abstract) | fuerza | límite | verificación.

### 2.1 Big Five e IPIP

| id | Afirmación / decisión | Estudio | Diseño y muestra | Efecto | Fuerza | Límite | Verif. |
|---|---|---|---|---|---|---|---|
| EV-10 | El modelo de cinco factores tiene marcadores estables. | Goldberg 1992, *Psychol. Assess.* 4:26–42, doi:10.1037/1040-3590.4.1.26 | Desarrollo de marcadores léxicos | no reportado en abstract (abstract no disponible) | Fuerte (literatura acumulada) | Basado en muestras angloparlantes | VERIFICADA |
| EV-11 | Los ítems IPIP son **de dominio público** y pueden usarse, traducirse y adaptarse. | Goldberg et al. 2006, *J. Res. Pers.* 40:84–96, doi:10.1016/j.jrp.2005.08.007 | Artículo sobre el IPIP | El propio título lo declara: "public-domain personality measures" | Fuerte (estatus legal) | La traducción propia exige validarse (EV-13) | VERIFICADA; los términos exactos en ipip.ori.org no pudieron consultarse `[VERIFICAR]` |
| EV-12 | Con **4 ítems por rasgo** (Mini-IPIP, 20 ítems) se obtiene una medida útil, aunque de fiabilidad modesta. | Donnellan et al. 2006, *Psychol. Assess.* 18:192–203, doi:10.1037/1040-3590.18.2.192 | 5 estudios | Consistencia interna "at or well above .60"; test-retest similar a la versión de 50 ítems | Fuerte | α ≈ .60–.70 es bajo para decisiones individuales: implica una **incertidumbre alta por persona** (fase 2) | VERIFICADA |
| EV-13 | Existe una versión del Mini-IPIP en **español**, con invariancia aceptable respecto al inglés. | Martínez-Molina & Arias 2018, *PeerJ* 6:e5542, doi:10.7717/peerj.5542 | Hispanohablantes nativos e inglés; N = 940; ESEM e invariancia multigrupo | N = 940; invariancia "acceptable" (sin índices en abstract) | Moderada | No es una muestra mexicana; según material suplementario, posiblemente Chile y EE. UU. `[VERIFICAR]` | VERIFICADA |
| EV-14 | Hay inventarios IPIP alternativos desarrollados en población hispanohablante. | Cupani & Lorenzo-Seva 2016, *Pers. Individ. Dif.* 91:40–46, doi:10.1016/j.paid.2015.11.051 | Muestra argentina | no reportado en abstract (abstract no disponible) | Moderada | No es una traducción directa del Mini-IPIP | VERIFICADA |
| EV-15 | La estructura de cinco factores se replica entre regiones del mundo. | Schmitt et al. 2007, *J. Cross-Cult. Psychol.* 38:173–212, doi:10.1177/0022022106297299 | BFI en 28 idiomas; N = 17 837; 56 naciones | Estructura "robust across major regions" | Fuerte | Usa el BFI (no el IPIP); las medias difieren entre regiones | VERIFICADA |
| EV-16 | Las diferencias de género en Big Five son **pequeñas** comparadas con la variación dentro de cada género. | Costa, Terracciano & McCrae 2001, *JPSP* 81:322–331, doi:10.1037/0022-3514.81.2.322 | NEO-PI-R; 26 culturas; N = 23 031 | "small relative to within-gender variation" | Fuerte | Usa un binario de género; no informa sobre personas no binarias | VERIFICADA |
| EV-17 | En los primeros meses de la universidad, la **amistad se forma por similitud** en Amabilidad, Extraversión y Apertura. | Selfhout et al. 2010, *J. Pers.* 78:509–538, doi:10.1111/j.1467-6494.2010.00625.x | 205 estudiantes de 19 años; 5 olas durante el primer año; SIENA | Selección por similitud en A, E y O (sin tamaños de efecto en abstract) | Moderada | Muestra pequeña y neerlandesa; describe **selección**, no satisfacción | VERIFICADA |
| EV-18 | Las díadas que se forman libremente son similares en la mayoría de las variables. | Bahns et al. 2017, *JPSP* 112:329–355, doi:10.1037/pspp0000088 | 11 muestras de campo; 1 523 pares + 2 estudios longitudinales | Similitud significativa en el 86 % de las variables | Fuerte (descriptiva) | Mide similitud **observada**; no prueba que la similitud cause bienestar | VERIFICADA |
| EV-19 | Metaanálisis de los cinco rasgos y la satisfacción en pareja. | Malouff et al. 2010, *J. Res. Pers.* 44:124–127, doi:10.1016/j.jrp.2009.09.004 | Metaanálisis | no reportado en abstract (abstract no disponible) | — | **No usar cifras** hasta leer el texto completo | VERIFICADA (solo metadatos) `[VERIFICAR efectos]` |

**Conclusión 2.1.**
- Big Five (con ítems IPIP) es el **núcleo legítimo**.
- Los 10 ítems actuales atribuidos a `big-five-inventory` deben **sustituirse** por ítems IPIP: el BFI no es de dominio público. Sus condiciones de uso no académico están `[VERIFICAR]`.
- Con 2 ítems por rasgo, como ahora, no se puede estimar la fiabilidad. El objetivo es **4 ítems por rasgo**, como el Mini-IPIP (EV-12), con al menos 1 inverso.
- Para **amistad**, la similitud en A, E y O tiene respaldo de selección en población universitaria (EV-17). Es el uso mejor justificado de la similitud en todo el sistema.

### 2.2 Similitud vs complementariedad

| id | Afirmación / decisión | Estudio | Diseño y muestra | Efecto | Fuerza | Límite | Verif. |
|---|---|---|---|---|---|---|---|
| EV-20 | La similitud **real** predice la atracción en laboratorio, pero **no** en relaciones ya existentes. | Montoya, Horton & **Kirchner** 2008, *JSPR* 25:889–922, doi:10.1177/0265407508096700 | Metaanálisis; 313 estudios; 460 efectos | Similitud real r = .47; percibida r = .39; la real **no** fue significativa en relaciones existentes | Fuerte | La atracción en laboratorio no equivale a satisfacción | VERIFICADA (el 3.er autor es **Kirchner**, no Kirkpatrick) |
| EV-21 | La relación similitud–atracción está mediada por procesos como el agrado anticipado y la validación. | Montoya & Horton 2013, *JSPR* 30:64–94, doi:10.1177/0265407512452989 | Metaanálisis; 240 estudios de laboratorio | no reportado en abstract | Fuerte (procesos) | Laboratorio | VERIFICADA |
| EV-22 | Las parejas se parecen mucho en **actitudes** y poco en **personalidad**. La similitud de **perfil** de personalidad sí predijo la calidad marital. | Luo & Klohnen 2005, *JPSP* 88:304–326, doi:10.1037/0022-3514.88.2.304 | 291 parejas recién casadas | Cualitativo en abstract | Moderada | Contradice parcialmente EV-01: depende del método (perfil vs rasgo a rasgo) | VERIFICADA |
| EV-23 | Una mayor similitud se asocia a mayor satisfacción, **más en personalidad y valores** que en actitudes o religiosidad. | Gaunt 2006, *J. Pers.* 74:1401–1420, doi:10.1111/j.1467-6494.2006.00414.x | 248 matrimonios; similitud de perfil vs puntuaciones de diferencia | Cualitativo en abstract | Moderada | Transversal; no separa efectos de actor | VERIFICADA |
| EV-24 | La similitud en **rasgos** no se relaciona con la satisfacción; la similitud en **valores de autodirección y actitudes políticas** sí. Se evaluó con análisis de superficie de respuesta. | Leikas et al. 2018, *Pers. Individ. Dif.* 123:191–198, doi:10.1016/j.paid.2017.11.024 | 624 personas en parejas heterosexuales que esperaban un hijo; RSA | Cualitativo en abstract | Moderada | Población específica; finlandesa `[VERIFICAR país]` | VERIFICADA |
| EV-25 | Hay emparejamiento selectivo pero no convergencia; la similitud predijo la satisfacción posterior. | Gonzaga, Carter & Buckwalter 2010, *Pers. Relatsh.* 17:634–644, doi:10.1111/j.1475-6811.2010.01309.x | Matrimonios con medición previa a conocerse | Cualitativo en abstract | Moderada | Muestra de una plataforma de citas (posible sesgo) `[VERIFICAR]` | VERIFICADA |
| EV-26 | Las preferencias ideales declaradas predicen débilmente las elecciones reales. | Eastwick et al. 2014, *Psychol. Bull.* 140:623–665, doi:10.1037/a0032432 | Revisión + metaanálisis; k = 97 | Atractivo físico r ≈ .40; ingresos r ≈ .10; diferencia por sexo r = .03 (n.s.) | Fuerte | Trata sobre preferencias, no sobre similitud | VERIFICADA |
| EV-27 | Para analizar la congruencia de dos personas se recomienda **regresión polinómica / superficie de respuesta** en lugar de puntuaciones de diferencia. | Edwards & Parry 1993, *Acad. Manage. J.* 36:1577–1613, doi:10.2307/256822 | Metodológico | — | Fuerte (método) | — | VERIFICADA |
| EV-28 | La similitud entre perfiles se descompone en **elevación, dispersión y forma**. | Cronbach & Gleser 1953, *Psychol. Bull.* 50:456–473, doi:10.1037/h0057173 | Metodológico | — | Fuerte (método) | — | VERIFICADA |

**Conclusión 2.2.**
- **No hay evidencia sólida de complementariedad** en ningún rasgo Big Five. Por eso el modelo **no** debe premiar diferencias en Extraversión ni en ninguna otra dimensión. La única excepción posible es una "ventana de tolerancia" (no penalizar diferencias pequeñas), que se etiqueta `supuesto`.
- La similitud con mejor respaldo para la satisfacción está en **valores y actitudes** (EV-22, EV-23, EV-24). En rasgos de personalidad la evidencia es mixta y, una vez controlado el efecto actor, casi nula (EV-01).
- **Implicación para los pesos (prior):** valores > estilo de vida/actitudes > Big Five > MBTI > Eneagrama.
- La fase 3 debe usar superficie de respuesta (EV-27) sobre datos sintéticos para comprobar que el modelo recupera la forma que se supone, y la descomposición de Cronbach-Gleser (EV-28) para la explicabilidad.

### 2.3 MBTI

| id | Afirmación / decisión | Estudio | Diseño y muestra | Efecto | Fuerza | Límite | Verif. |
|---|---|---|---|---|---|---|---|
| EV-30 | **No hay apoyo para tipos dicotómicos.** Los 4 índices MBTI miden aspectos de 4 de los 5 factores. | McCrae & Costa 1989, *J. Pers.* 57:17–40, doi:10.1111/j.1467-6494.1989.tb00759.x | NEO-PI, autoinforme y pares; 267 hombres y 201 mujeres de 19 a 93 años | "no support" para tipos | Fuerte | — | VERIFICADA |
| EV-31 | Las distribuciones del MBTI **no son bimodales**: se concentran en el centro, y la supuesta bimodalidad era un artefacto. | Bess & Harvey 2002, *J. Pers. Assess.* 78:176–186, doi:10.1207/s15327752jpa7801_11 | TRI (BILOG); N ≈ 12 000 | "strongly center-weighted"; θ con r > .996 entre configuraciones de cuadratura | Fuerte | Muestra de programas de liderazgo | VERIFICADA |
| EV-32 | La evidencia es insuficiente para sostener los principios del MBTI y su utilidad. | Pittenger 1993, *Rev. Educ. Res.* 63:467–488, doi:10.3102/00346543063004467 | Revisión | "insufficient evidence" | Moderada | Revisión antigua | VERIFICADA |
| EV-33 | La fiabilidad de las puntuaciones MBTI (continuas) es aceptable, pero variable entre estudios. | Capraro & Capraro 2002, *Educ. Psychol. Meas.* 62:590–602, doi:10.1177/0013164402062004004 | Generalización de fiabilidad | Fiabilidad "strong" con "variation" (sin cifras en abstract) | Moderada | Se refiere a puntuaciones continuas, no a la estabilidad del tipo | VERIFICADA |
| EV-34 | MBTI y NEO-PI se relacionan ("big four"). | Furnham 1996, *Pers. Individ. Dif.* 21:303–307, doi:10.1016/0191-8869(96)00033-5 | — | abstract no disponible | — | No usar cifras | VERIFICADA (solo metadatos) |
| EV-35 | Las "funciones cognitivas" jungianas (Fi-Ne, espejos Ti-Fe, etc.) y su complementariedad en pareja. | — | — | — | **Heurística** | No se encontró ningún estudio que las respalde para la compatibilidad | Sin fuente |

**Conclusión 2.3.**
- El MBTI se mide como **4 ejes continuos**, con incertidumbre. El código de 4 letras se usa **solo para mostrar** y para el avatar (EV-30, EV-31). Como sus ejes son prácticamente redundantes con E, O, A y C (EV-30), sumarlo al Big Five **cuenta dos veces** los mismos rasgos. Las opciones son dos: un peso numérico ≈ 0, o descorrelacionarlo con Mahalanobis (fase 3).
- El código de la auditoría inicial daba **40 % de Φ** a `functionAffinity`, con valores de 0.6, 0.7, 0.9 y 1.0 elegidos a mano. Eso era **heurística sin respaldo** (EV-35). **Resuelto (ADR-034):** el operador Φ (`functionAffinity`, `mbtiCompatibility`, `enneagramCompatibility`, `attachmentCompatibility`, `operator_weights`) se eliminó del código; el matching usa el modelo por capas y MBTI/Eneagrama quedan como identidad y narrativa.

### 2.4 Eneagrama

| id | Afirmación / decisión | Estudio | Diseño y muestra | Efecto | Fuerza | Límite | Verif. |
|---|---|---|---|---|---|---|---|
| EV-40 | La fiabilidad y la validez del Eneagrama son **mixtas**. Los análisis factoriales encuentran **menos de 9 factores**, y ningún estudio ha derivado los 9 tipos por agrupamiento. | Hook et al. 2021, *J. Clin. Psychol.* 77:865–883, doi:10.1002/jclp.23097 | Revisión sistemática; 104 muestras independientes | "mixed" | Moderada (revisión sistemática) | — | VERIFICADA |
| EV-41 | El RHETI tiene una consistencia interna adecuada y una validez de constructo mixta. | Newgent, Parr, Newman & **Wiggins** 2004, *Meas. Eval. Couns. Dev.* 36:226–237, doi:10.1080/07481756.2004.11909744 | Correlacional y canónico; N ilegible en la fuente | Sin coeficientes en abstract | Débil | Instrumento propietario: **no copiar sus ítems** | PARCIAL (el 4.º autor es Wiggins, no Higgins) |
| EV-42 | Alas, líneas de integración y desintegración, y "matrices de compatibilidad" entre tipos. | — | — | — | **Heurística** | No se encontró evidencia empírica | Sin fuente |

**Conclusión 2.4.**
- El Eneagrama no puede sostener la existencia de 9 tipos discretos (EV-40), y menos aún las alas o las compatibilidades entre tipos (EV-42).
- **Uso legítimo:** narrativa e identidad visual (accesorio del avatar), presentado como "lectura simbólica".
- **Peso en el puntaje (propuesta):** 0, o como máximo un `supuesto` ≤ 5 % que tendrá que sobrevivir a la ablación. Hoy Φ le da el **35 %** (con `integration` = 1.0), lo que no es defendible.
- La estimación de tipo debe exponer su **entropía** y no forzar un tipo cuando sea ambigua.

### 2.5 Valores, apego, conflicto y "lenguajes del amor"

| id | Afirmación / decisión | Estudio | Diseño y muestra | Efecto | Fuerza | Límite | Verif. |
|---|---|---|---|---|---|---|---|
| EV-50 | Los valores tienen una estructura circular universal (10 valores básicos). | Schwartz 1992, *Adv. Exp. Soc. Psychol.* 25:1–65, doi:10.1016/s0065-2601(08)60281-6 | 20 países | abstract no disponible | Fuerte (replicada) | — | VERIFICADA (solo metadatos) |
| EV-51 | El modelo refinado distingue 19 valores. | Schwartz et al. 2012, *JPSP* 103:663–688, doi:10.1037/a0029393 | 15 muestras de 10 países; N = 6 059; CFA y MDS | Apoyo a 19 valores | Fuerte | Los instrumentos (PVQ) tienen condiciones de uso `[VERIFICAR licencia]`, así que los ítems propios deben ser **originales** | VERIFICADA |
| EV-52 | El amor romántico puede entenderse como un proceso de apego. | Hazan & Shaver 1987, *JPSP* 52:511–524, doi:10.1037/0022-3514.52.3.511 | — | abstract no disponible | Fuerte (fundacional) | Origen del enfoque categorial; hoy se usan dimensiones | VERIFICADA (solo metadatos) |
| EV-53 | El apego adulto se mide mejor en **dimensiones continuas** (ansiedad y evitación) analizadas con TRI. Las escalas comunes son mejorables. | Fraley, Waller & Brennan 2000, *JPSP* 78:350–365, doi:10.1037/0022-3514.78.2.350 | GRM de Samejima sobre 4 inventarios; N = 1 085 | Cualitativo | Fuerte | — | VERIFICADA |
| EV-54 | La ansiedad y la evitación se asocian negativamente con la satisfacción; el efecto **actor** es mayor que el efecto pareja. | Candel & Turliuc 2019, *Pers. Individ. Dif.* 147:190–199, doi:10.1016/j.paid.2019.04.037 | Metaanálisis; 132 estudios | Sin efecto agregado en abstract | Fuerte | Lo que predice es el nivel de cada persona, no la combinación de la pareja | VERIFICADA |
| EV-55 | No hubo parejas ansioso–ansioso ni evitativo–evitativo. Las parejas hombre evitativo–mujer ansiosa fueron "sorprendentemente estables". | Kirkpatrick & Davis 1994, *JPSP* 66:502–512, doi:10.1037/0022-3514.66.3.502 | 354 parejas heterosexuales; 3 años | Cualitativo | Moderada | Estabilidad ≠ satisfacción; solo parejas heterosexuales | VERIFICADA |
| EV-56 | Ciertos procesos de interacción (afecto negativo, actitud defensiva, retirada) predicen la disolución. | Gottman & Levenson 1992, *JPSP* 63:221–233, doi:10.1037/0022-3514.63.2.221 | 73 parejas; 1983–1987 | Cualitativo | Moderada | Muestra pequeña; observacional; requiere interacción real | VERIFICADA |
| EV-57 | Las interacciones de recién casados predicen felicidad y estabilidad. | Gottman et al. 1998, *J. Marriage Fam.* 60:5–22, doi:10.2307/353438 | — | abstract no disponible | — | Cifras sin verificar; existen críticas metodológicas `[VERIFICAR]` | VERIFICADA (solo metadatos) |
| EV-58 | Que la comunicación directa en un conflicto ayude o dañe **depende del contexto**: gravedad del problema y seguridad de la pareja. | Overall & McNulty 2017, *Curr. Opin. Psychol.* 13:1–5, doi:10.1016/j.copsyc.2016.03.002 | Revisión | Cualitativo | Moderada | No hay un "estilo bueno" universal | VERIFICADA |
| EV-59 | Se pueden medir 5 estilos de manejo de conflicto. | Rahim 1983, *Acad. Manage. J.* 26:368–376, doi:10.2307/255985 | 7 muestras + una muestra nacional | Fiabilidad "satisfactory" | Moderada | Contexto organizacional | VERIFICADA |
| EV-60 | Los "lenguajes del amor" **no tienen apoyo empírico fuerte** en ninguno de sus 3 supuestos centrales. | Impett, Park & Muise 2024, *Curr. Dir. Psychol. Sci.* 33:87–92, doi:10.1177/09637214231217663 | Revisión narrativa | "not provide strong empirical support" | Moderada | — | PARCIAL (el subtítulo real es "Evaluating Love Languages From a Relationship Science Perspective") |

**Conclusión 2.5.**
- **Valores:** la evidencia más favorable a la similitud (EV-24, EV-23) respalda el **mayor peso a priori**. Los ítems serán **originales**, inspirados en el circumplejo de Schwartz.
- **Apego:** debe **medirse directamente** en 2 dimensiones (EV-53). El código actual (`attachmentProfileFor`) lo **infiere** de E, A, S y otras dimensiones, lo cual no está justificado.
  - Para el matching, la evidencia apunta a efectos actor (EV-54). La "matriz de compatibilidad de apego" (`ATTACHMENT_MATRIX`) es **heurística** y la evidencia de combinaciones es escasa y ambigua (EV-55).
  - Penalizar a alguien por su nivel de ansiedad o evitación sería discriminatorio y no es el objetivo de la app. **Propuesta:** usar el apego solo para la explicación y para recomendaciones de comunicación. En el puntaje, como mucho un `supuesto` de bajo peso.
- **Conflicto:** no existe un estilo universalmente bueno (EV-58). La penalización actual por diferencia de estilo (`conflict_tolerance` 0.35, λ = 4.0) es un `supuesto` y debe declararse como tal. Se puede defender una **ventana de tolerancia** (diferencias moderadas no penalizan), pero no números presentados como si vinieran de la literatura.
- **Lenguajes del amor:** hoy hay 7 ítems con `fuente_id: love-languages` y 5 dimensiones dentro del 25 % de "intimidad" en romance. **No tienen respaldo** (EV-60) y deben **salir del puntaje**. A lo sumo pueden quedar como 1 ítem de preferencia narrativa ("qué te hace sentir querida/o/e"), sin peso.

### 2.6 Medición: sesgos, fiabilidad, ajuste, invariancia y calidad de respuesta

| id | Afirmación / decisión | Estudio | Efecto / recomendación literal | Fuerza | Verif. |
|---|---|---|---|---|---|
| EV-70 | Usar **ω** (omega total) en lugar de α como fiabilidad principal. | Revelle & Zinbarg 2009, *Psychometrika* 74:145–154, doi:10.1007/s11336-008-9102-z; McNeish 2018, *Psychol. Methods* 23:412–433, doi:10.1037/met0000144 | "recommend ω_t"; alternativas "justifiably higher" que α | Fuerte | VERIFICADAS |
| EV-71 | Criterios de ajuste orientativos: CFI/TLI ≈ .95, RMSEA ≈ .06, SRMR ≈ .08. | Hu & Bentler 1999, *SEM* 6:1–55, doi:10.1080/10705519909540118 | Cifras literales del abstract | Fuerte (con matices: no son reglas de oro) | VERIFICADA |
| EV-72 | Con ítems ordinales, usar correlaciones **policóricas** y WLS robusto. | Flora & Curran 2004, *Psychol. Methods* 9:466–491, doi:10.1037/1082-989x.9.4.466 | Policóricas "robust to modest violations"; WLS robusto "performed well across all conditions" | Fuerte | VERIFICADA |
| EV-73 | Número de factores: análisis paralelo de Horn y MAP de Velicer. | Horn 1965, doi:10.1007/bf02289447; Velicer 1976, doi:10.1007/bf02293557 | Variables aleatorias para estimar el sesgo de muestreo; detenerse en el mínimo de la correlación parcial cuadrática media | Fuerte | VERIFICADAS |
| EV-74 | Modelo de respuesta graduada para ítems Likert. | Samejima 1969, *Psychometrika* 34:1–97, doi:10.1007/bf03372160 | — | Fuerte | VERIFICADA |
| EV-75 | Estimación **EAP** del rasgo; con buena precisión es casi lineal respecto al rasgo verdadero, con pendiente igual a la fiabilidad (contracción). | Bock & Mislevy 1982, *Appl. Psychol. Meas.* 6:431–444, doi:10.1177/014662168200600405 | "virtually linear with slope equal to the reliability" | Fuerte | VERIFICADA |
| EV-76 | Entre el **10 y el 12 %** de los universitarios responden con descuido las encuestas largas. Se recomiendan índices de consistencia y de valores atípicos. | Meade & Craig 2012, *Psychol. Methods* 17:437–455, doi:10.1037/a0028085 | Cifra literal | Fuerte | VERIFICADA |
| EV-77 | Índice de ajuste de persona (ℓz) estandarizado para modelos politómicos. | Drasgow, Levine & Williams 1985, *Br. J. Math. Stat. Psychol.* 38:67–86, doi:10.1111/j.2044-8317.1985.tb00817.x | La estandarización reduce la interacción con la habilidad | Fuerte | VERIFICADA |
| EV-78 | Los ítems inversos introducen sesgo por aquiescencia, descuido y confirmación. | Weijters, Baumgartner & Schillewaert 2013, *Psychol. Methods* 18:320–334, doi:10.1037/a0032121 | Las 3 fuentes, literales | Fuerte | VERIFICADA |
| EV-79 | La aquiescencia varía entre personas y distorsiona la estructura, sobre todo en jóvenes. | Soto et al. 2008, *JPSP* 94:718–737, doi:10.1037/0022-3514.94.4.718 | "pronounced effects" a edades tempranas | Fuerte | VERIFICADA |
| EV-80 | La deseabilidad social tiene dos componentes (autoengaño y manejo de impresión). | Paulhus 1984, *JPSP* 46:598–609, doi:10.1037/0022-3514.46.3.598 | abstract no disponible | Fuerte | VERIFICADA (solo metadatos) |
| EV-81 | Sesgos de método común y remedios procedimentales (anonimato, separación, redacción). | Podsakoff et al. 2003, *J. Appl. Psychol.* 88:879–903, doi:10.1037/0021-9010.88.5.879 | Remedios procedimentales y estadísticos | Fuerte | VERIFICADA |
| EV-82 | La **invariancia de medición** es requisito previo para comparar grupos. | Vandenberg & Lance 2000, *Organ. Res. Methods* 3:4–70, doi:10.1177/109442810031002; Putnick & Bornstein 2016, *Dev. Rev.* 41:71–90, doi:10.1016/j.dr.2016.06.004 | "logical prerequisite" | Fuerte | VERIFICADAS (puntos de corte de ΔCFI de Putnick & Bornstein `[VERIFICAR]`) |
| EV-83 | Para detectar **DIF**, la regresión logística es más potente que Mantel-Haenszel en el DIF no uniforme. | Swaminathan & Rogers 1990, *J. Educ. Meas.* 27:361–370, doi:10.1111/j.1745-3984.1990.tb00754.x | Cita literal | Fuerte | VERIFICADA |
| EV-84 | Para modelar la interdependencia en díadas (actor y pareja) se usa el modelo APIM. | Kenny, Kashy & Cook 2006, *Dyadic Data Analysis* (Guilford) | Libro | Fuerte | Existencia confirmada solo por reseñas `[VERIFICAR]` |

**Conclusión 2.6.**
- **Fiabilidad:** el informe debe reportar ω (EV-70); α solo como referencia.
- **Dimensionalidad:** análisis paralelo y MAP sobre policóricas (EV-72, EV-73), seguidos de un GRM (EV-74).
- **Puntuación:** estimación EAP, cuya contracción está justificada (EV-75).
- **Calidad de respuesta:** el `qualityScore` está respaldado. Se espera alrededor de un 10 % de personas descuidadas (EV-76), se detectan con ℓz (EV-77) y se comunican **sin culpar** a la persona.
- **Ítems inversos:** mantener al menos 1 inverso por rasgo para controlar la aquiescencia (EV-79), sabiendo que también introducen sesgo (EV-78). La aquiescencia se modelará como factor de método en el generador sintético.
- **Equidad:** probar invariancia y DIF por identidad de género, orientación y otras subpoblaciones (EV-82, EV-83). Las diferencias de género pequeñas (EV-16) desaconsejan usar el género en cualquier prior.

### 2.7 Métodos matemáticos del motor (soporte de las fases 3 y 4)

| id | Uso | Referencia | Verif. |
|---|---|---|---|
| EV-90 | Distancia de Mahalanobis | Mahalanobis 1936, *Proc. Natl. Inst. Sci. India*; reimpresión en *Sankhya A* 80:1–7 (2018), doi:10.1007/s13171-019-00164-5 | PARCIAL (original no indexado) |
| EV-91 | Coeficiente de Bhattacharyya | Bhattacharyya 1943, *Bull. Calcutta Math. Soc.* | `[VERIFICAR]`: no indexado. La fórmula es estándar; no depende de la cita |
| EV-92 | Sensibilidad global (índices de Sobol, efecto total) | Saltelli et al. 2010, *Comput. Phys. Commun.* 181:259–270, doi:10.1016/j.cpc.2009.09.018 | VERIFICADA |
| EV-93 | Cribado de efectos elementales (Morris) | Morris 1991, *Technometrics* 33:161–174, doi:10.1080/00401706.1991.10484804 | VERIFICADA |
| EV-94 | Control de FDR | Benjamini & Hochberg 1995, *JRSS B* 57:289–300, doi:10.1111/j.2517-6161.1995.tb02031.x | VERIFICADA |
| EV-95 | Emparejamiento estable | Gale & Shapley 1962, *Am. Math. Mon.* 69:9–15, doi:10.1080/00029890.1962.11989827 | VERIFICADA |
| EV-96 | Análisis de potencia (estudio piloto) | Faul et al. 2007, *Behav. Res. Methods* 39:175–191, doi:10.3758/bf03193146 | VERIFICADA |

### 2.8 HEXACO y capas candidatas (afinado, Fase 2; verificado en Crossref el 2026-11-01)

Solo se citan cifras literales del abstract. El detalle y la decisión por capa
están en `docs/CAPAS_EVIDENCIA.md`.

| id | Afirmación | Referencia | Cifra literal | Fuerza | Verif. |
|---|---|---|---|---|---|
| EV-100 | El modelo HEXACO (6 factores, incluye Honestidad-Humildad) se replica entre culturas. | Ashton & Lee 2007, *PSPR* 11:150–166, doi:10.1177/1088868306294907 | "cross-culturally replicated" | Fuerte | VERIFICADA |
| EV-101 | Las escalas del HEXACO-100 tienen intercorrelaciones bajas; solo H–A supera \|.20\|. | Lee & Ashton 2016, *Assessment* 25:543–556, doi:10.1177/1073191116659134 | N = 100 318 autoinformes | Fuerte | VERIFICADA |
| EV-102 | Existen escalas IPIP **de dominio público** para los constructos HEXACO. | Ashton, Lee & Goldberg 2007, *Pers. Individ. Dif.* 42:1515–1526, doi:10.1016/j.paid.2006.10.027; ipip.ori.org/newHEXACO_PI_key.htm | α por faceta de .69 a .88 (página IPIP) | Fuerte (estatus legal) | VERIFICADA |
| EV-103 | Forma corta de 24 ítems (4 por factor) para los seis factores: Mini-IPIP6. | Milojev et al. 2013, *J. Res. Pers.* 47:936–944, doi:10.1016/j.jrp.2013.09.004; Jones et al. 2025, doi:10.1002/casp.70076 | H-H "sole personality dimension associated with cooperative behaviour" (N = 979) | Moderada | VERIFICADA |
| EV-104 | Las personas solteras prefieren parejas similares en todos los factores HEXACO, sobre todo en H-H y Apertura. | Liu et al. 2018, *Eur. J. Pers.* 32:443–458, doi:10.1002/per.2159 | N > 900; 4 países | Moderada (preferencia ideal, no satisfacción) | VERIFICADA |
| EV-105 | La similitud en metas de vida, valores y personalidad tiene efectos positivos **pequeños**; los niveles individuales predicen mejor. | Arránz Becker 2013, *Pers. Relatsh.* 20:443–461, doi:10.1111/j.1475-6811.2012.01417.x | n = 3 674 parejas; "significant yet small" | Fuerte | VERIFICADA |
| EV-106 | La autotrascendencia predice la calidad relacional **propia**, no la de la pareja. | van der Wal et al. 2023, *PSPB* 50:1066–1079, doi:10.1177/01461672231156975 | 5 estudios | Moderada | VERIFICADA |
| EV-107 | La similitud de apego **no** predice el bienestar; solo los niveles (actor y pareja). | Weidmann, Yang, Purol & Chopik 2024, *JSPR* 42:591–612, doi:10.1177/02654075241298710 | 1 602 parejas; "no evidence for any similarity effects" | Fuerte | VERIFICADA |
| EV-108 | En parejas españolas, los efectos actor del apego son más frecuentes; la evitación daña más. | Molero et al. 2017, *Eur. J. Soc. Psychol.* 47:337–347, doi:10.1002/ejsp.2276 | 174 parejas | Moderada | VERIFICADA |
| EV-109 | La similitud de personalidad (real o percibida) no se relaciona con la atracción inicial. | Humberg et al. 2023, *Pers. Sci.* 4, doi:10.5964/ps.7551 | 397 personas; 940 citas rápidas | Moderada | VERIFICADA |
| EV-110 | La comunicación y la satisfacción se influyen en ambas direcciones, pero ninguna vía es robusta. | Lavner, Karney & Bradbury 2016, *J. Marriage Fam.* 78:680–694, doi:10.1111/jomf.12301 | "neither pathway was particularly robust" | Moderada | VERIFICADA |
| EV-111 | Las parejas se parecen poco en estilos de humor; predice el humor **percibido** de la pareja. | Cann, Davis & Zapata 2011, *Humor* 24:1–20, doi:10.1515/humr.2011.001 | 82 parejas | Débil | VERIFICADA |
| EV-112 | La empatía precisa no se asocia a la satisfacción al controlar la similitud; la percibida sí. | Cramer & Jowett 2010, *JSPR* 27:327–349, doi:10.1177/0265407509348384 | 149 parejas | Moderada | VERIFICADA |
| EV-113 | La homogamia explica poco los estilos de vida compartidos; pesa el ciclo vital. | Kalmijn & Bernasco 2001, *J. Marriage Fam.* 63:639–654, doi:10.1111/j.1741-3737.2001.00639.x | 1 523 parejas; "modest" | Débil | VERIFICADA |
| EV-114 | Versión española breve del ECR (ECR-12) con invariancia por género. | Guzmán-González et al. 2020, *Psicol. Reflex. Crít.* 33, doi:10.1186/s41155-020-00145-w; Lafontaine et al. 2016, doi:10.1027/1015-5759/a000243 | 3 703 adultos chilenos | Fuerte (medición) | VERIFICADA |
| EV-115 | Versión española del Inventario de Sexismo Ambivalente. | Expósito, Moya & Glick 1998, *Rev. Psicol. Soc.* 13:159–169, doi:10.1174/021347498760350641 | 1 110 varones | Moderada (medición) | VERIFICADA |
| EV-116 | El PVQ mide los 10 valores de Schwartz con un método menos abstracto. | Schwartz et al. 2001, *J. Cross-Cult. Psychol.* 32:519–542, doi:10.1177/0022022101032005001 | 4 muestras | Fuerte (medición) | VERIFICADA |

---

## 3. Auditoría del modelo vigente contra la evidencia

| Elemento actual (código o datos) | Valor | Respaldo | Etiqueta | Acción propuesta |
|---|---|---|---|---|
| 10 ítems `fuente_id: big-five-inventory` | 2 por rasgo | Atribución incorrecta: el BFI no es de dominio público. 2 ítems no permiten estimar ω | — | Sustituir por IPIP, 4 por rasgo y ≥ 1 inverso (EV-11, EV-12) |
| 7 ítems `love-languages` y 5 dimensiones de intimidad en romance | 25 % del peso de romance (compartido) | EV-60: sin apoyo fuerte | — | Sacarlos del puntaje |
| `psychometric_mix` 0.15 · Φ = MBTI 40 % + Eneagrama 35 % + apego 25 % | — | EV-35, EV-42: heurística; EV-30: redundante con Big Five | `supuesto` | Reducir a ≈ 0 y decidir con ablación |
| `functionAffinity` (espejo = 1, eje = 0.9…) | — | Ninguno | `supuesto` | Eliminado (ADR-034) |
| `enneagramCompatibility` (integración = 1.0) | — | Ninguno | `supuesto` | Eliminado (ADR-034) |
| `attachmentProfileFor`, inferido de Big Five y otras dimensiones | — | No validado (EV-53 pide medirlo) | `supuesto` | Medir con ítems originales en 2 dimensiones |
| Coseno centrado sobre vectores en [0,1] | — | No tiene en cuenta la correlación entre rasgos (EV-90) ni la incertidumbre (EV-12) | `supuesto` | Mahalanobis/Bhattacharyya sobre θ̂ y Σ̂ (fase 3) |
| Umbral romance 0.78 · tope de cobertura 6 % | — | Ninguno | `supuesto` | Cuantil de la distribución nula por permutación + cobertura objetivo en config (fase 3) |
| `conflict_tolerance` 0.35 · λ = 4.0 | — | EV-58: no hay un estilo bueno universal | `supuesto` | Mantener como ventana con etiqueta explícita; incluir en el análisis de sensibilidad |
| Pesos por categoría en romance (25/5/20/25/25) | — | Parcial: EV-23 y EV-24 favorecen valores | `supuesto` | Prior: valores > estilo de vida > Big Five; luego Sobol (EV-92) |
| Pesos en amistad (40/35/25) | — | EV-17, EV-18 respaldan similitud de personalidad e intereses en amistad | `prior` débil | Mantener la estructura y recalibrar |
| Filtros duros declarados (orientación, género, vínculo) | — | Ético y de producto, no psicométrico | `supuesto` (de producto) | Mantener; no inferir nunca a partir de otras respuestas |

---

## 4. Lo que **no** podemos afirmar

1. Que un porcentaje alto prediga una relación satisfactoria o duradera
   (EV-01, EV-02, EV-03).
2. Que exista complementariedad de personalidad beneficiosa (sección 2.2).
3. Que el tipo MBTI o el tipo/ala de Eneagrama de una persona sean
   categorías reales, o que haya combinaciones de tipos compatibles
   (EV-30, EV-31, EV-40, EV-42).
4. Que los "lenguajes del amor" predigan compatibilidad (EV-60).
5. Que las traducciones propias de ítems IPIP sean invariantes en
   población ENES/UNAM. EV-13 es la evidencia más cercana, pero no
   sustituye una validación local.
6. Que los datos sintéticos validen algo más que el **código**: miden la
   recuperación de parámetros y la estabilidad, no la verdad del mundo.

## 5. Peso legítimo por instrumento (prior para la fase 3)

| Bloque | Peso relativo propuesto (romance) | Peso relativo propuesto (amistad) | Etiqueta | Base |
|---|---|---|---|---|
| Valores y actitudes (incluye perspectiva de género) | alto | medio | `prior` | EV-22, EV-23, EV-24 |
| Estilo de vida e intereses socioculturales | medio | alto | `prior` débil | EV-17, EV-18 |
| Big Five (similitud, ventana en E) | medio | medio-alto | `prior` débil | EV-01, EV-17, EV-22 |
| Comunicación y conflicto (ventana de tolerancia) | bajo-medio | bajo | `supuesto` | EV-56, EV-58 |
| Apego (2 dimensiones medidas) | bajo o solo narrativa | 0 | `supuesto` | EV-53, EV-54, EV-55 |
| MBTI (4 ejes) | ≈ 0 (redundante) | ≈ 0 | `supuesto` | EV-30 |
| Eneagrama | 0 (narrativa y avatar) | 0 | `supuesto` | EV-40, EV-42 |
| Lenguajes del amor | 0 | 0 | — | EV-60 |

Los niveles cualitativos se convertirán en números en la fase 3. Primero
se fijará el prior; luego el análisis de sensibilidad de Sobol (EV-92)
decidirá si los pesos se distinguen entre sí. Si no, se igualarán.

## 6. Pendientes `[VERIFICAR]`

- Términos exactos de la licencia de IPIP en ipip.ori.org (el sitio no fue accesible).
- Licencia del BFI y del PVQ (Schwartz) para uso no académico o en una app.
- Cifras del metaanálisis de Malouff et al. 2010 (EV-19) y de Gottman et al. 1998 (EV-57): solo se tienen los metadatos.
- Puntos de corte de ΔCFI y ΔRMSEA para invariancia (Putnick & Bornstein 2016).
- País y muestra exactos de Leikas et al. 2018, Martínez-Molina & Arias 2018 y Gonzaga et al. 2010.
- Bhattacharyya 1943 y el original de Mahalanobis 1936 (no indexados; las fórmulas no dependen de la cita).
- Kenny, Kashy & Cook 2006 (libro sin registro en Crossref).
