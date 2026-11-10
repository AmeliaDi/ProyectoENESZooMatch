/**
 * Dominio de quizzes rompehielos.
 * No altera el modelo psicométrico: es una capa aparte de diversión,
 * coincidencias y conversación.
 */

import {
  OPT_OUT_LABEL,
  OPT_OUT_VALOR,
  type QuizCategory,
  type QuizDefinition,
  type QuizItem,
} from "@/config/quizzes";

export type { QuizCategory };
export type SharingLevel = "privado" | "compartir_coincidencias_con_matches";

export interface QuizAnswer {
  item_id: string;
  valor: string;
}

export interface QuizAttempt {
  quiz_id: string;
  revision: string;
  completado_en: Date;
}

export interface QuizSharing {
  quiz_id: string;
  nivel_visibilidad: SharingLevel;
  actualizado_en: Date;
}

export interface PicanteConsent {
  mayor_de_edad: boolean;
  consentimiento_en: Date;
  track_romance_activo: boolean;
}

export interface QuizCoincidencia {
  item_id: string;
  valor: string;
}

/**
 * Lo que nunca se comparte aunque coincida: el «no» dicho con o sin mayúscula y
 * cualquier forma del opt-out. `quiz_coincidencias` ya filtra `no` y
 * `prefiero_no_decir` en la base; aquí se filtra además la etiqueta visible y la
 * forma capitalizada de los ítems de acuerdo, porque `'No' !== 'no'`.
 */
const NO_COMPARTIBLES = new Set(["no", OPT_OUT_VALOR, OPT_OUT_LABEL.toLowerCase()]);

export function esOptOut(valor: string): boolean {
  return NO_COMPARTIBLES.has(valor.trim().toLowerCase());
}

/** Dos opciones de un ítem múltiple caben en un renglón en este orden. */
const SEPARADOR_MULTIPLE = "; ";

/**
 * Traduce lo que se eligió a lo que se puede guardar. El opt-out se guarda como
 * su centinela, que es lo que la base ya sabe filtrar; lo demás tiene que ser
 * una opción declarada del ítem o no se guarda. Una sola selección se guarda
 * sin separador, así que los renglones que ya existen siguen coincidiendo.
 */
export function valorGuardable(item: QuizItem, valores: readonly string[]): string | null {
  if (valores.length === 0) return null;
  if (valores.length > 1 && !item.multiple) return null;

  const elegidos: string[] = [];
  for (const valor of valores) {
    if (valor === OPT_OUT_LABEL || valor === OPT_OUT_VALOR) return OPT_OUT_VALOR;
    if (!item.opciones.includes(valor)) return null;
    elegidos.push(valor);
  }

  if (elegidos.length === 1) return elegidos[0]!;
  return [...new Set(elegidos)].sort().join(SEPARADOR_MULTIPLE);
}

/** Revalida un valor ya guardado contra las opciones declaradas del ítem. */
export function valorValido(item: QuizItem, valor: string): boolean {
  if (valor === OPT_OUT_VALOR) return true;
  const partes = valor.split(SEPARADOR_MULTIPLE);
  if (partes.length > 1 && !item.multiple) return false;
  return valorGuardable(item, partes) === valor;
}

/** Lo contrario de `valorGuardable`, para mostrar una coincidencia. */
export function opcionesDelValor(valor: string): string[] {
  return valor.split(SEPARADOR_MULTIPLE).map((parte) => parte.trim());
}

/** Ítem de acuerdo (Sí / Tal vez / No): su respuesta no es un tema, es un sí. */
function esEscalaDeAcuerdo(item: QuizItem): boolean {
  const cuerpo = item.opciones.slice(0, -1).map((o) => o.trim().toLowerCase());
  if (cuerpo.length === 0) return false;
  return cuerpo.every((o) => o === "sí" || o === "tal vez" || o === "no");
}

/**
 * Explica una coincidencia en lenguaje natural, sin respuestas crudas: los ítems
 * de acuerdo citan el enunciado (su valor es un «sí»), los demás citan la opción.
 */
export function explicarCoincidencia(
  quiz: QuizDefinition,
  coincidencia: QuizCoincidencia,
): string | null {
  if (esOptOut(coincidencia.valor)) return null;
  const item = quiz.items.find((i) => i.item_id === coincidencia.item_id);
  if (!item) return null;
  if (esEscalaDeAcuerdo(item)) return `Coinciden en: ${item.texto}`;
  return `Coinciden en: ${opcionesDelValor(coincidencia.valor).join(" y ")}`;
}

/**
 * Calcula las coincidencias entre dos personas para un quiz.
 * Solo devuelve ítems donde ambas respondieron lo mismo y ninguna prefirió no decir.
 */
export function calcularCoincidencias(
  respuestasA: readonly QuizAnswer[],
  respuestasB: readonly QuizAnswer[],
): QuizCoincidencia[] {
  const mapA = new Map(respuestasA.map((r) => [r.item_id, r.valor]));
  const coincidencias: QuizCoincidencia[] = [];

  for (const respuestaB of respuestasB) {
    const valorA = mapA.get(respuestaB.item_id);
    if (valorA === undefined || valorA !== respuestaB.valor) continue;
    if (esOptOut(valorA) || esOptOut(respuestaB.valor)) continue;
    coincidencias.push({ item_id: respuestaB.item_id, valor: respuestaB.valor });
  }

  return coincidencias;
}

/**
 * Verifica si una persona puede acceder a un quiz de Picante.
 * Requiere: mayoría de edad declarada y consentimiento.
 */
export function puedeAccederPicante(
  consent: PicanteConsent | null,
): boolean {
  if (!consent) return false;
  if (!consent.mayor_de_edad) return false;
  return true;
}

/**
 * Puerta de *compartir* Picante, más estricta que la de acceder:
 * `quiz_coincidencias` exige el rastro de romance de las dos personas, y quien
 * calcule coincidencias de `picante_dinamicas` fuera de la base debe pedirlo.
 * Aquí el rastro es el sello que quedó al dar el consentimiento.
 */
export function puedeCompartirPicante(consent: PicanteConsent | null): boolean {
  return puedeAccederPicante(consent) && consent?.track_romance_activo === true;
}

/**
 * Seguimiento sugerido por ítem, con la llave `quiz_id/item_id`. La llave larga
 * existe porque dos quizzes preguntan por «plataforma» y por «ritmo» y no son lo
 * mismo: sin ella el chat sugeriría la pregunta del quiz equivocado. Incluye las
 * llaves sintéticas que produce el motor de `picante_dinamicas`.
 */
const SEGUIMIENTOS: Record<string, string> = {
  // Gustos · música
  "gustos_musica/genero_favorito": "¿Qué artista de ese género le pondrías de ejemplo?",
  "gustos_musica/momento_escucha": "¿En qué momento del día te late compartir audífonos?",
  "gustos_musica/formato": "¿Qué playlist o álbum te sabes de memoria?",
  "gustos_musica/conciertos": "¿Qué concierto te urge tener en la lista?",
  "gustos_musica/comfort_song": "¿Qué letra te calma cuando el día se pone pesado?",
  "gustos_musica/playlist_estudio": "¿Qué pones cuando necesitas concentrarte de verdad?",
  "gustos_musica/descubrimiento": "¿Cómo te llegan los hallazgos que luego repites?",
  "gustos_musica/cantar": "¿Cuál es esa canción que cantas completo sin permiso?",

  // Gustos · cine
  "gustos_cine/genero_cine": "¿Qué título de ese género se recomiendan uno al otro?",
  "gustos_cine/plataforma": "¿Qué vale la pena pagar justo ahí?",
  "gustos_cine/maraton": "¿Cuál fue la última que no pudieron soltar?",
  "gustos_cine/comfort_movie": "¿Qué película te funciona igual un martes cualquiera?",
  "gustos_cine/compania": "¿Cómo te cae mejor un plan de película?",
  "gustos_cine/snacks": "¿Qué elegirían para una noche de película?",
  "gustos_cine/rewatch": "¿A qué regresas una y otra vez sin aburrirte?",
  "gustos_cine/spoilers": "¿De qué te enteraste sin querer y te arruinó algo?",

  // Gustos · comida
  "gustos_comida/cocina_favorita": "¿Qué lugar de esa cocina te ha salido buenísimo?",
  "gustos_comida/cocinar": "¿Qué platillo te sale bien sin esforzarte?",
  "gustos_comida/antojo": "¿Cuál es tu antojo de madrugada?",
  "gustos_comida/comer_fuera": "¿Qué pedirían si llegan sin plan?",
  "gustos_comida/picante_nivel": "¿Qué tan picante te gusta sin rendirte?",
  "gustos_comida/cafe_o_te": "¿Cuál te levanta en la mañana: café o té?",
  "gustos_comida/explorar": "¿Qué platillo raro vale la pena probar juntos?",
  "gustos_comida/compania_comida": "¿Con quién compartes mejor la comida?",

  // Gustos · viajes
  "gustos_viajes/destino": "¿Qué destino de ese tipo te urge conocer?",
  "gustos_viajes/ritmo": "¿Qué tan cargado te gusta un itinerario?",
  "gustos_viajes/planificar": "¿Qué reservarías primero para un viaje?",
  "gustos_viajes/fin_semana": "¿Qué plan de fin de semana te late repetir?",
  "gustos_viajes/viajar_solo": "¿Qué te da curiosidad de viajar sin compañía?",
  "gustos_viajes/recuerdos": "¿Cómo guardas los recuerdos de un viaje?",
  "gustos_viajes/presupuesto": "¿En qué vale la pena gastar más en un viaje?",
  "gustos_viajes/companion_viaje": "¿Qué hace que un viaje en compañía funcione?",

  // Gaming · plataformas
  "gaming_plataformas/plataforma": "¿Qué juego te tiene pegada ahí?",
  "gaming_plataformas/horario": "¿A qué hora te rinde la sesión?",
  "gaming_plataformas/duracion": "¿Cuánto dura tu partida típica?",
  "gaming_plataformas/frecuencia": "¿Qué día te guardas para jugar?",
  "gaming_plataformas/lugar": "¿Dónde te acomodas para jugar?",
  "gaming_plataformas/compania_gaming": "¿Te late jugar con micrófono o en silencio?",
  "gaming_plataformas/gasto": "¿Qué compra de gaming te ha salido buena?",
  "gaming_plataformas/plataforma_principal": "¿Qué te hizo quedarte con esa?",

  // Gaming · géneros
  "gaming_generos/genero": "¿Qué título de ese género le pondrías de ejemplo?",
  "gaming_generos/titulo_favorito": "¿Qué juego te volviste a pasar dos veces?",
  "gaming_generos/novedades": "¿Qué lanzamiento te tiene con ganas?",
  "gaming_generos/rejugabilidad": "¿Qué te late repetir en vez de estrenar?",
  "gaming_generos/historia_vs_gameplay": "¿Qué parte de un juego te engancha más?",
  "gaming_generos/dificultad": "¿Qué dificultad te resulta justa?",
  "gaming_generos/indie_vs_aa": "¿Qué indie te sorprendió?",
  "gaming_generos/genero_menos": "¿Qué género te aburre en dos minutos?",

  // Gaming · estilo
  "gaming_estilo/coop_vs_comp": "¿Qué partida en equipo recuerdas con risa?",
  "gaming_estilo/rol": "¿Qué rol te toca siempre en el equipo?",
  "gaming_estilo/ritmo": "¿Qué juego te pide ese ritmo?",
  "gaming_estilo/perfeccionismo": "¿Qué logro te tardó más de lo esperado?",
  "gaming_estilo/comunicacion": "¿Cómo avisas cuando necesitas un respiro en la partida?",
  "gaming_estilo/rage": "¿Qué te hace soltar una carcajada después de perder?",
  "gaming_estilo/logros": "¿Qué trofeo te costó y valió la pena?",
  "gaming_estilo/exploracion": "¿Qué rincón de un mapa te quedaste explorando?",

  // Gaming · mesa
  "gaming_mesa/mesa_frecuencia": "¿Qué noche te guardas para la mesa?",
  "gaming_mesa/mesa_tipo": "¿Qué juego de mesa les deja con ganas de otro?",
  "gaming_mesa/rol_experiencia": "¿Cuál fue tu primera partida de rol?",
  "gaming_mesa/rol_rol": "¿Qué personaje sueles armar?",
  "gaming_mesa/mesa_compania": "¿Con quién te sale mejor la partida?",
  "gaming_mesa/mesa_duracion": "¿Cuántas horas aguanta tu grupo?",
  "gaming_mesa/mesa_complejidad": "¿Qué reglas te gustan y cuáles te saltas?",
  "gaming_mesa/mesa_explorar": "¿Qué juego nuevo les toca probar?",

  // Picante · nivel 1: coqueteo y acuerdos, sin presión y sin detalles
  "picante_nivel1/coqueteo_poco_a_poco": "¿Cómo les late ir armando la confianza?",
  "picante_nivel1/coqueteo_humor": "¿Qué broma les funciona para romper el hielo?",
  "picante_nivel1/mensaje_atrevido": "¿Qué mensaje con estilo te ha gustado recibir?",
  "picante_nivel1/platicar_antes": "¿Qué te gustaría platicar antes que nada?",
  "picante_nivel1/preguntar_antes": "¿Cómo te late que te pregunten antes de un paso nuevo?",
  "picante_nivel1/ambiente_importa": "¿Qué detalle de ambiente te cambia el ánimo?",
  "picante_nivel1/cita_tension": "¿Qué plan te suena cómodo para una primera cita?",
  "picante_nivel1/hablar_intimidad": "¿Qué confianza necesitas antes de hablar de eso?",

  // Picante · nivel 2: curiosidad entre adultos, sin detalles
  "picante_nivel2/juegos_rol": "¿Qué ambiente les armaría para esa plática?",
  "picante_nivel2/juegos_seduccion": "¿Qué regla divertida les late poner?",
  "picante_nivel2/explorar_poco": "¿Qué les gustaría explorar sin prisa?",
  "picante_nivel2/respetar_limites": "¿Cómo les late marcar un límite?",
  "picante_nivel2/palabra_pausa": "¿Qué palabra de pausa elegirían?",
  "picante_nivel2/fantasias_general": "¿Qué tema les da curiosidad platicar en general?",
  "picante_nivel2/lista_si_maybe_no": "¿Qué pondrían en su lista de tal vez?",
  "picante_nivel2/cuidados_despues": "¿Qué cuidado te viene bien después de algo intenso?",

  // Picante · dinámicas: el motor devuelve llaves que no son ítems del quiz
  "picante_dinamicas/iniciativa_complementaria": "¿Quién propone el primer plan?",
  "picante_dinamicas/alternar_compatible": "¿Cómo les late turnarse la iniciativa?",
  "picante_dinamicas/juegos_control": "¿Qué acuerdo previo les daría calma?",
  "picante_dinamicas/restricciones_suaves": "¿Qué límite pondrían por nombre?",
  "picante_dinamicas/roles_apodos": "¿Qué apodo de juego les hace gracia?",

  // Vida · planes
  "vida_planes/fin_semana_ideal": "¿Qué plan de ese tipo te late armar este fin?",
  "vida_planes/ocio_preferido": "¿Qué harías si la tarde queda completamente libre?",
  "vida_planes/ahorro_vs_gasto": "¿En qué gastas sin pensarlo dos veces?",
  "vida_planes/vida_nocturna": "¿A qué hora se te va el día?",
  "vida_planes/plan_vs_improvisar": "¿Qué improvización te ha salido buenísima?",
  "vida_planes/ritmo_social": "¿Cuánta gente te sobra en un plan?",
  "vida_planes/hora_de_dormir": "¿Qué te deja despierta o despierto?",
  "vida_planes/tareas_de_casa": "¿Qué tarea de la casa toleras mejor?",
  "vida_planes/meta_tres_meses": "¿Qué te gustaría lograr en tres meses?",

  // Vida · campus
  "vida_campus/lugar_de_estudio": "¿Dónde estudias cuando necesitas silencio?",
  "vida_campus/estudio_solo_o_en_grupo": "¿Qué te funciona mejor para estudiar?",
  "vida_campus/transporte_al_campus": "¿Cómo vienes y qué escuchas en el camino?",
  "vida_campus/forma_del_dia": "¿Cómo te armas el día para que rinda?",
  "vida_campus/rincon_del_campus": "¿Dónde te refugias cuando el día pesa?",
  "vida_campus/eventos_escolares": "¿A qué evento del campus irías con gusto?",
  "vida_campus/comida_en_dias_intensos": "¿Qué comes en un día de exámenes?",
  "vida_campus/semana_de_examenes": "¿Cómo sobrevives una semana de finales?",
  "vida_campus/dia_siguiente_sin_dormir": "¿Qué sale mal cuando no duermes?",

  // Vida · humor
  "vida_humor/estilo_de_humor": "¿Qué chiste te representa?",
  "vida_humor/que_te_hace_reir": "¿Te acuerdas del chiste completo?",
  "vida_humor/tu_humor_contado": "¿Cómo describirías tu humor en tres palabras?",
  "vida_humor/referencias_que_usas": "¿Qué referencia citas todo el tiempo?",
  "vida_humor/chiste_ya_contado": "¿Cómo le haces cuando ya contaste ese chiste?",
  "vida_humor/donde_ries_mas": "¿Dónde te ríes más?",
  "vida_humor/humor_cuando_estas_de_malas": "¿Qué te saca del mal humor?",
  "vida_humor/reirte_de_tus_errores": "¿Qué error tuyo ya es anécdota?",
  "vida_humor/como_mandas_un_chiste": "¿Por mensaje o en persona?",

  // Conexión · autoexpansión
  "conexion_autoexpansion/probar_este_ano": "¿Cuál de esos dos harían primero?",
  "conexion_autoexpansion/ante_algo_que_no_sabes": "¿Qué fue lo último que aprendieron así?",
  "conexion_autoexpansion/que_te_presentaron": "¿De quién fue esa recomendación?",
  "conexion_autoexpansion/plan_de_ultima_hora": "¿Aceptarías una salida sin plan hoy?",
  "conexion_autoexpansion/primera_vez_con_alguien": "¿Qué lugar nuevo te gustaría conocer?",
  "conexion_autoexpansion/aprender_de_otras": "¿Qué le aprendiste a alguien últimamente?",
  "conexion_autoexpansion/cambio_reciente": "¿Qué cambió en ti este año?",
  "conexion_autoexpansion/lugar_conocido_o_nuevo": "¿A qué lugar repetirías sin dudarlo?",
  "conexion_autoexpansion/que_te_da_curiosidad": "¿Qué tema te gustaría dominar?",

  // Conexión · cuidado y afecto
  "conexion_cuidado/cuando_alguien_esta_mal": "¿Qué te ayuda cuando traes un día malo?",
  "conexion_cuidado/como_te_apoyan": "¿Cómo te gusta que te acompañen sin invadirte?",
  "conexion_cuidado/pedir_ayuda": "¿A quién le pides ayuda primero?",
  "conexion_cuidado/cuando_te_enfermas": "¿Qué te cuida cuando caes enferma o enfermo?",
  "conexion_cuidado/mensajes_de_como_estas": "¿Cada cuánto te late escribir sin motivo?",
  "conexion_cuidado/cuidado_propio": "¿Qué ritual te mantiene a flote?",
  "conexion_cuidado/cuando_te_cuentan_algo_serio": "¿Qué esperas cuando alguien te cuenta algo pesado?",
  "conexion_cuidado/espacio_o_compania": "¿Cuánta distancia te resulta cómoda?",
  "conexion_cuidado/balance_en_la_relacion": "¿Qué te hace sentir que el balance va bien?",

  // Conexión · valores en situaciones (dilemas ligeros, sin calificación)
  "conexion_valores_situaciones/favor_grande": "¿Qué favor te ha pesado devolver?",
  "conexion_valores_situaciones/cartera_encontrada": "¿Qué harías si nadie te ve?",
  "conexion_valores_situaciones/pagar_la_comida": "¿Cómo le haces cuando la cuenta queda en el aire?",
  "conexion_valores_situaciones/llegar_tarde_otra_vez": "¿Qué te hace perder la paciencia?",
  "conexion_valores_situaciones/chisme_que_es_mentira": "¿Qué haces cuando llega un chisme falso?",
  "conexion_valores_situaciones/plan_cancelado": "¿Cómo te tomas un plan caído?",
  "conexion_valores_situaciones/equipo_sin_su_parte": "¿Qué harías si alguien del equipo no avanza?",
  "conexion_valores_situaciones/deuda_pequena": "¿Qué te incomoda de deber algo chiquito?",
  "conexion_valores_situaciones/verdad_dolorosa": "¿Prefieres la verdad directa o la suave?",
};

/** Red de seguridad por categoría: ninguna coincidencia se queda sin pregunta. */
const SEGUIMIENTO_POR_CATEGORIA: Record<QuizCategory, string> = {
  gustos: "¿Qué te antojarías de eso?",
  gaming: "¿Qué partida pones de ejemplo?",
  picante: "¿Qué te gustaría platicar de eso?",
  vida: "¿Cómo te cae eso en el día a día?",
  conexion: "¿Qué te hizo pensar en eso?",
};

export const MAX_PREGUNTAS_SUGERIDAS = 3;

/**
 * Genera preguntas sugeridas para el chat y para el modo de tres rondas a partir
 * de las coincidencias de un quiz: sin repetir, sin exponer respuestas crudas y
 * con máximo tres por quiz. No duplica las preguntas del banco de chat-prompts.
 */
export function generarPreguntasSugeridas(
  quiz: QuizDefinition,
  coincidencias: readonly QuizCoincidencia[],
): string[] {
  const preguntas = new Set<string>();

  for (const coincidencia of coincidencias) {
    if (esOptOut(coincidencia.valor)) continue;
    const pregunta =
      SEGUIMIENTOS[`${quiz.quiz_id}/${coincidencia.item_id}`] ??
      SEGUIMIENTOS[coincidencia.item_id] ??
      SEGUIMIENTO_POR_CATEGORIA[quiz.categoria];
    preguntas.add(pregunta);
    if (preguntas.size >= MAX_PREGUNTAS_SUGERIDAS) break;
  }

  return [...preguntas];
}

/**
 * Quién es el par de una conversación para quien mira. Devuelve `null` si
 * `yo` no es parte: el llamador no puede averiguar coincidencias de terceros.
 */
export function otraPersonaDeConversacion(
  conversacion: { userA: string; userB: string },
  yo: string,
): string | null {
  if (conversacion.userA === yo) return conversacion.userB;
  if (conversacion.userB === yo) return conversacion.userA;
  return null;
}
