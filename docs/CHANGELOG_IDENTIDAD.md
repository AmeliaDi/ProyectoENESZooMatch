# Changelog de identidad

Registro de los cambios que escribieron o corrigieron una identidad congelada en
producción. Lo alimenta `scripts/identity-backfill.mts` cuando se ejecuta con
`--apply --confirm`; nunca corre sin respaldo verificado (Fase 0,
`.backups/pre-identidad-fija/`).

Reglas que hacen posible este archivo:

- La identidad se calcula **una sola vez** (`hatchIdentity`) y desde entonces se
  lee del registro; nada la recalcula.
- Una persona con `eclosionado_en` escrito es intocable: si aparece aquí es que
  su nombre se congeló en esta ejecución, no en una anterior.
- Los identificadores son seudónimos deterministas `P-###-TAG`, con
  `TAG = HMAC(secreto, "pseudo:" + user_id)`. Sin matrículas, sin respuestas,
  sin vectores latentes.

Un `alias antes` en blanco (`—`) significa que la persona no tenía nombre
guardado: estrena identidad, no la pierde.

## Ejecuciones

Una: la del 2026-11-06 15:32 (APPLIED), más abajo. Antes de esa corrida se verificaron el
respaldo (`--dry-run` sobre las 20 tablas de `.backups/pre-identidad-fija`) y un dry-run
`BEGIN … ROLLBACK` del propio script, que reportó los mismos 121 cambios sin escribir nada.

Estado medido antes de esa corrida (2026-11-06, solo lectura, 164 filas en `profiles`):

| Grupo | Conteo |
|---|---:|
| Activas con test principal completo (eclosionan) | 121 |
| — de ellas, con el alias desincronizado respecto al animal guardado | 40 |
| — de ellas, con el alias desincronizado respecto al color guardado | 88 |
| — de ellas, desincronizadas en ambos | 33 |
| Activas sin test completo (pasan a huevo, conservan respuestas parciales) | 28 |
| Bajas lógicas, fuera de todo cálculo | 15 |
| Cumplen la condición de núcleo (53 ítems Likert no sensibles) | 121 de 121 |

Ninguna de las 121 vuelve a `huevo` por la condición de eclosión: el backfill calcula la
identidad canónica sobre el perfil latente guardado y escribe ese resultado. Lo que sí cambia
es la etiqueta, y hay que decirlo sin eufemismos. El `--check` del 2026-11-06 clasifica las
121 alias reescritas así:

| Cambio en el alias | Conteo | Por qué |
|---|---:|---|
| Solo el sufijo | 24 | animal y color ya eran los canónicos |
| Solo el color | 57 | `pickAmbiguousColor` recalculado con la semilla canónica |
| Solo el animal | 3 | el alias nombraba un animal distinto del calculado |
| Animal y color | 37 | el alias venía del cálculo viejo, no del perfil latente |
| **Cualquier cambio de sufijo** | **121 de 121** | el `CHECK` de `alias_sufijo` exige 4 consonantes sin vocales; 108 sufijos heredados llevan dígitos o vocales y los otros 13 se recalculan igual, porque el sufijo es `HMAC(SECRETO, user_id)` + asignación anti-colisión |

Ninguna de estas 121 filas tenía `eclosionado_en` escrito (`frozenUntouched = 0`): la columna la
introduce este mismo backfill. Quien ya tenga identidad canónica no aparecerá aquí en futuras
corridas, porque la regla de oro protege esas filas. El texto nuevo es el que produce
`hatchIdentity` sobre el perfil latente, así que el nombre pasa a coincidir con lo que el
cálculo de compatibilidad ya usaba; nadie pierde su identidad psicométrica.

## 2026-11-06 15:32 — identity-backfill (APPLIED)

- Eclosionadas: 121 · nombre corregido: 121 · devueltas a huevo: 0 · ya congeladas intocadas: 0

| seudónimo | alias antes | alias después |
| --- | --- | --- |
| P-001-BF0717 | tortuguita gris neblina · DRRS | mariquita azul cobalto · VTMJ |
| P-002-282BA4 | ardillita gris neblina · UDAE | ardillita naranja mandarina · LSYT |
| P-003-6BDF7B | ajolote celestial gris neblina · PLLH | ajolote celestial rosa orquídea profundo · KKBV |
| P-004-455831 | mapachito gris neblina · L3HR | mapachito rojo carmín profundo · NKWT |
| P-005-6ED289 | jirafita gris neblina · GVM1 | jirafita naranja mandarina profundo · GFHL |
| P-006-0CA3D6 | polarito gris neblina · SRN3 | polarito verde bosque · WKJF |
| P-007-0C4B86 | garcita gris neblina · TJTK | garcita naranja mandarina · ZVBX |
| P-008-F6EF61 | mantisita oro viejo profundo · C2KC | mantisita oro viejo profundo · TZHM |
| P-009-ECF25A | garcita gris neblina · VJUK | garcita verde bosque profundo · BVTL |
| P-010-E06566 | ardillita rosa orquídea claro · 4OYX | ardillita rosa orquídea claro · YNDP |
| P-011-B258F1 | murcielaguito gris neblina · WWAN | camaleoncito azul cobalto profundo · XYWY |
| P-012-44CC50 | buhito oro viejo · HM93 | buhito oro viejo · BMZJ |
| P-013-EE2E6C | serpientita azul cobalto claro · 8FF3 | serpientita azul cobalto claro · QSNY |
| P-014-55CEF6 | zorrito gris neblina · 3F1W | zorrito turquesa marino claro · FVTR |
| P-015-F4A5F9 | llamita rojo carmín · CE4N | llamita roja carmín · HWRF |
| P-016-3C651C | cangurito gris neblina · WPEY | cangurito oro viejo profundo · YWRT |
| P-017-6E8870 | pelicanito verde bosque profundo · 8S21 | castorcito azul cobalto · YBXR |
| P-018-3A5E40 | buhito turquesa marino claro · TKN4 | buhito turquesa marino claro · CNRX |
| P-019-7641B3 | potrillo gris neblina · 220F | potrillo naranja mandarina profundo · MQZK |
| P-020-89DB38 | nahualito gris neblina · 1ZAK | serpientita verde olivo · QTSX |
| P-021-D91973 | zorrito gris neblina · CE2A | zorrito turquesa marino profundo · DMXJ |
| P-022-F00E95 | ajolote celestial gris neblina · VYBN | ajolote celestial azul cobalto claro · CDXV |
| P-023-88C10E | sapito gris neblina · X8BW | sapito violeta amatista claro · HXSC |
| P-024-AA4C87 | serpientita gris neblina · 1S7U | serpientita roja carmín · SJPH |
| P-025-37A179 | pangolincito gris neblina · OLI1 | pangolincito turquesa marino claro · YBXY |
| P-026-EA6348 | garcita gris neblina · 4AKO | garcita naranja mandarina profundo · LBMN |
| P-027-549FBF | ornitorrincocito turquesa marino · XVOO | quetzalito turquesa marino · YQWZ |
| P-028-F4AA91 | mantisita gris neblina · C193 | mantisita roja carmín claro · MCLR |
| P-029-1A0F66 | erizito verde bosque profundo · A7HE | murcielaguito verde bosque profundo · JNFC |
| P-030-77C223 | ajolote celestial verde bosque · C45M | ajolote celestial verde bosque · NDQH |
| P-031-A9B7AF | alcito gris neblina · V01I | alcito violeta amatista claro · QCXD |
| P-032-23466B | focita gris neblina · 9V2X | focita azul cobalto · GWRK |
| P-033-54867A | osito oro viejo claro · QA68 | colibrito verde olivo claro · SGPM |
| P-034-6CB560 | fenixito gris neblina · AYXX | fenixito rojo carmín profundo · NZJG |
| P-035-B39189 | llamita gris neblina · NT6M | llamita roja carmín claro · ZWYY |
| P-036-0E0922 | garcita gris neblina · TPYV | garcita azul cobalto profundo · DQTN |
| P-037-281F8F | pandita turquesa marino · IUOS | cangurito verde bosque · WDRH |
| P-038-D07B25 | polarito gris neblina · PW9O | nahualito naranja mandarina · LZGV |
| P-039-FA1DB7 | lobito gris neblina · X6LA | lobito verde bosque · DGVD |
| P-040-322153 | caballito azul cobalto claro · OE78 | nahualito oro viejo · ZJNN |
| P-041-04370D | ajolote celestial verde bosque profundo · E6PM | ballenita turquesa marino claro · XVYD |
| P-042-A3CDA3 | sapito naranja mandarina · 7JG2 | sapito naranja mandarina · BTDW |
| P-043-1B6957 | mariquita verde bosque profundo · POCI | cangurito verde bosque profundo · NWYX |
| P-044-33E01B | mantisita gris neblina · LON0 | cisnecito rosa orquídea profundo · QZXP |
| P-045-C51B63 | buhito azul cobalto · 37MK | alcito azul cobalto profundo · DSZM |
| P-046-750E8B | cisnecito gris neblina · 9YAL | cisnecito verde bosque claro · SLWV |
| P-047-6F448D | camaleoncito turquesa marino · AX5W | camaleoncito azul cobalto · WNFX |
| P-048-08C1E2 | ballenita gris neblina · UMN2 | garcita violeta amatista · ZXSL |
| P-049-3AA30E | dragoncito gris neblina · JJ8V | dragoncito rosa orquídea profundo · HKLD |
| P-050-AD365F | garcita gris neblina · 9G3J | garcita verde bosque profundo · GJVM |
| P-051-D64360 | ballenita gris neblina · R9YA | buhito azul cobalto · WBFF |
| P-052-7DBA47 | caballito verde bosque · 2RS9 | caballito verde bosque · HDFF |
| P-053-4F610A | osito gris neblina · YDBP | venadito rojo carmín claro · RYSN |
| P-054-C8B6BF | llamita gris neblina · LGTF | llamita verde bosque · PGFS |
| P-055-8D1370 | lobito verde bosque claro · JODY | avispita roja carmín claro · BHJH |
| P-056-5B4926 | llamita gris neblina · 4HHW | nahualito violeta amatista profundo · DMCY |
| P-057-B66F7C | ballenita rosa orquídea profundo · RH5D | osito rosa orquídea · MPBC |
| P-058-37CF13 | fenixito gris neblina · RQPP | fenixito azul cobalto · JQZB |
| P-059-E7BF03 | chinchillita turquesa marino claro · 8KEB | conejito turquesa marino profundo · BTLS |
| P-060-5EDC4D | ballenita gris neblina · 7M1A | ballenita gris neblina · BLFJ |
| P-061-73B063 | tortuguita oro viejo · B34A | focita rosa orquídea claro · HKPL |
| P-062-8532DD | pangolincito gris neblina · ZNXI | pangolincito rojo carmín claro · TMNG |
| P-063-633D2C | tucancito gris neblina · 22EP | tucancito verde bosque profundo · RDRM |
| P-064-A2BA27 | conejito verde bosque · T16A | conejito verde bosque · SVSF |
| P-065-CCB6FA | pandita gris neblina · 5K5B | pandita verde bosque · KSRW |
| P-066-C238D9 | caracolito verde bosque · WTUP | caracolito oro viejo · JXCP |
| P-067-EB9073 | huroncito gris neblina · 9CIR | huroncito azul cobalto · WFBR |
| P-068-D83FBD | ciervito gris neblina · 8O7P | ciervito turquesa marino · JKPS |
| P-069-EEA217 | osito azul cobalto profundo · 1EE4 | osito azul cobalto profundo · BNSN |
| P-070-CAA905 | venadito gris neblina · TR97 | venadito verde bosque · YPKQ |
| P-071-D22353 | abejita verde bosque · 3QKR | fenixito verde bosque profundo · ZPCZ |
| P-072-ED66B8 | osito gris neblina · LFR7 | pinguinito naranja mandarina · CSWZ |
| P-073-6F8324 | buhito gris neblina · BCFA | buhito rosa orquídea profundo · XFTK |
| P-074-5A75F5 | cisnecito gris neblina · VGPV | cisnecito rosa orquídea claro · DNZM |
| P-075-A0B85B | buhito gris neblina · Q6RL | alcito rosa orquídea profundo · HGDB |
| P-076-09FF88 | mapachito rojo carmín profundo · 4TJE | libélula roja carmín · DJHD |
| P-077-5DEA9D | fenixito rosa orquídea · LNT0 | fenixito rosa orquídea profundo · KNWG |
| P-078-A87729 | armadillito gris neblina · 642I | armadillito verde olivo · XKQW |
| P-079-6F002A | polarito gris neblina · EE4W | polarito rosa orquídea · JPYK |
| P-080-3758FA | mariposita verde bosque · Y32T | mariposita verde bosque · JWFC |
| P-081-158D42 | cangurito rojo carmín claro · P9DV | cangurito rojo carmín claro · WDJS |
| P-082-561E8B | cisnecito naranja mandarina · IYX7 | avispita naranja mandarina profundo · HHLT |
| P-083-61AB7C | focita gris neblina · M8KF | zorrito rosa orquídea · HWDG |
| P-084-DC3658 | ballenita gris neblina · Y62L | mantisita roja carmín · LLLV |
| P-085-AD7215 | kitsune verde bosque claro · 6ZHE | camaleoncito azul cobalto · SJKW |
| P-086-D27756 | zorrito gris neblina · B1FA | zorrito oro viejo · KHJP |
| P-087-6CAC2C | pangolincito rojo carmín · Q020 | pangolincito rojo carmín · VPNK |
| P-088-58A383 | ajolotito gris neblina · A6C3 | ajolotito azul cobalto claro · ZMRG |
| P-089-DB1992 | tortuguita gris neblina · VRTR | tortuguita azul cobalto · VXMH |
| P-090-4F0936 | lobito naranja mandarina · 1DK8 | lobito verde bosque claro · MYBT |
| P-091-7EDD1D | cisnecito gris neblina · 5KM6 | nahualito rosa orquídea claro · BWKQ |
| P-092-EEA0A0 | osito de anteojos turquesa marino claro · 6OQJ | ciervito azul cobalto · HDWD |
| P-093-220C48 | focita naranja mandarina claro · 622Y | focita naranja mandarina claro · NVVF |
| P-094-C41074 | ballenita gris neblina · SE56 | ballenita roja carmín profundo · PXYJ |
| P-095-7544B1 | libélula naranja mandarina claro · PGPJ | libélula naranja mandarina claro · XTWY |
| P-096-9E4C05 | kitsune gris neblina · 5953 | kitsune turquesa marino claro · CTSR |
| P-097-0CAC8B | polarito gris neblina · XB99 | polarito rosa orquídea claro · ZYMS |
| P-098-30F698 | caballito gris neblina · W95J | focita azul cobalto · KPYX |
| P-099-F1DE69 | venadito gris neblina · 8DBI | venadito verde olivo · MJQN |
| P-100-DA1B87 | suricatita gris neblina · 7XEX | suricatita turquesa marino · ZRPW |
| P-101-076573 | ajolotito rojo carmín profundo · K7AH | ajolotito rojo carmín profundo · VCVK |
| P-102-DFA5A0 | zorrito gris neblina · UTW4 | fenixito verde olivo profundo · JXTP |
| P-103-C78F9A | delfincito violeta amatista · S78A | jirafita violeta amatista profundo · JTZF |
| P-104-EF0ADD | caracolito azul cobalto claro · U3ZT | caracolito azul cobalto claro · FLCT |
| P-105-00BBB7 | cisnecito gris neblina · DN83 | cisnecito verde olivo profundo · BTVH |
| P-106-B3DC7B | fenixito gris neblina · BHFF | fenixito gris neblina · LRFB |
| P-107-D66A81 | tucancito gris neblina · W38A | tucancito azul cobalto · KZBN |
| P-108-562F89 | fenixito verde bosque profundo · HB46 | fenixito verde bosque profundo · YLJF |
| P-109-066A71 | caballito gris neblina · WMBK | focita rosa orquídea claro · CHWY |
| P-110-964808 | focita verde olivo · 332O | ajolotito rosa orquídea profundo · RJVB |
| P-111-A28A7F | osito verde bosque · 59JU | osito verde bosque · HRSB |
| P-112-457C4F | armadillito gris neblina · R7L6 | alcito azul cobalto profundo · CPBX |
| P-113-6003FC | langostita gris neblina · S2UU | erizito rosa orquídea claro · NSLZ |
| P-114-D9936E | ranita gris neblina · 2OR6 | ranita verde bosque · VTVS |
| P-115-D437B2 | koalita gris neblina · 4IN3 | koalita azul cobalto claro · WVFQ |
| P-116-B53F5F | tortuguita gris neblina · E9O4 | fenixito rojo carmín · PLCH |
| P-117-4B764E | focita gris neblina · 5HD4 | focita oro viejo profundo · JWHV |
| P-118-3190F4 | nutria turquesa marino profundo · JC29 | nutria turquesa marino profundo · CXWL |
| P-119-701C6B | delfincito gris neblina · Y0B8 | delfincito oro viejo claro · ZSRZ |
| P-120-B2C7C0 | koalita rojo carmín profundo · C6TG | koalita oro viejo · YVPK |
| P-121-E06902 | jaguarito rojo carmín · VHT3 | jaguarito rojo carmín · PHKY |

### Verificación después de la ejecución (solo lectura, misma fecha)

| Invariante | Resultado |
|---|---|
| `eclosionado` con `eclosionado_en` escrito y las 4 partes de identidad pobladas | 121 de 121 |
| `huevo` sin ninguna columna de identidad | 28 de 28 |
| `alias_completo = alias_animal ‖ ' ' ‖ alias_color ‖ ' · ' ‖ alias_sufijo` | 0 filas fuera de la invariante |
| Alias duplicadas entre vivos | 0 |
| `alias` heredada ≠ `alias_completo` | 0 de 149 |
| Formato `^[a-záéíóúüñ]+( [a-záéíóúüñ]+)* · [BCDFGHJKLMNPQRSTVWXYZ]{4}$` | 0 fuera; longitud máxima real 47 (máximo 64) |
| Avisos `type='identity'` | 121, uno por persona, 0 leídos todavía |
| Matches que apuntan a un huevo vivo | 0 |
| Bajas lógicas intactas (`eclosionado_en` sigue NULL) | 15 de 15 |
| Distribución de color después | 28 colores distintos; máx. `Azul cobalto` y `Verde bosque` con 12 de 121 (9.92 %); `Gris neblina` baja a 2 (1.65 %) |

**Efecto sobre los matches guardados (medido, no asumido).** Se recalculó el pool vivo con el
motor de la app en modo lectura y se comparó contra las 735 filas guardadas:

- 679 pares comunes con |Δ similitud| medio 2.6·10⁻¹⁶ y máximo 8.9·10⁻¹⁶ — ruido de punto
  flotante, no señal. **0 pares cambian el porcentaje redondeado que ve la persona.**
- 56 filas guardadas que el recálculo ya no produce y 30 que produciría de más: todas las 56
  incluyen una de las **3 personas con `eliminado_en` escrito**; el pool actual las excluye.
- Causa: la proyección del pool (`loadCompletedPool`) lleva `romance_vector`, `amistad_vector`,
  `dimension_scores`, `orientacion_sexual`, `identidad_genero`, `tipo_relacion_busca`,
  `mbti_code` y `latent_profile`, pero **no** `animal_id` ni `color_id`. Ninguna categoría de
  `data/matching-config.json` lee la identidad visual. Por eso corregir el nombre no mueve la
  compatibilidad.

Consecuencia operativa: el botón «Recomputar» del observatorio sigue siendo lo que hay que pulsar
después de un backfill, pero ahora se sabe que su efecto aquí es **limpiar a las personas dadas
de baja y completar el top-k**, no recalcular porcentajes.

