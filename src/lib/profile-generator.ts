/**
 * ZooMatch v2 — Profile Identity Generator
 * Selects animal + color based on quiz scores, generates unique empowering narrative.
 */

import type { DimensionScoresV2, ProfileIdentity } from "@/types/microtest-v2";
import { BIG_FIVE_DIMENSIONS } from "@/types/microtest-v2";
import catalogoData from "../../data/catalogo_arquetipos_v2.json";

// ─── Helper Types ─────────────────────────────────────────────────────────────

export interface CatalogAnimal {
  id: string;
  nombre_fuente: string;
  diminutivo_es: string;
  categoria_fauna: string;
  personality_affinity: Record<string, number>;
}

export interface CatalogColor {
  id: string;
  nombre: string;
  hex: string;
  textura: string;
  temperatura: string;
}

export interface DimensionAffinity {
  dimension: string;
  score: number;
  label: string;
}

// ─── Catalog Data ─────────────────────────────────────────────────────────────

const ANIMALES: CatalogAnimal[] = catalogoData.animales as CatalogAnimal[];
const COLORES: CatalogColor[] = catalogoData.colores as CatalogColor[];

// ─── Dimension Labels (human-readable) ────────────────────────────────────────

const DIMENSION_LABELS: Record<string, string> = {
  personalidad_apertura: "apertura a nuevas experiencias",
  personalidad_responsabilidad: "responsabilidad y compromiso",
  personalidad_extraversion: "energía social y vitalidad",
  personalidad_amabilidad: "amabilidad y ternura",
  personalidad_estabilidad_emocional: "estabilidad emocional",
  mbti_extraversion: "extraversión intuitiva",
  mbti_intuicion: "intuición profunda",
  mbti_pensamiento: "pensamiento analítico",
  mbti_juicio: "estructura y planificación",
  identidad_exclusividad: "exclusividad afectiva",
  identidad_comunicacion_afectiva: "comunicación afectiva",
  cultural_musica_exploracion: "exploración musical",
  cultural_estetica_visual: "sensibilidad estética",
  cultural_hobbies_creativos: "creatividad e hobbies",
  cultural_vida_universitaria: "vida universitaria",
  cultural_humor: "sentido del humor",
  intimidad_palabras_afirmacion: "palabras de afirmación",
  intimidad_tiempo_calidad: "tiempo de calidad",
  intimidad_regalos_detalle: "detalles significativos",
  intimidad_contacto_fisico: "contacto físico afectivo",
  intimidad_actos_servicio: "actos de servicio",
  intimidad_apertura_emocional: "apertura emocional",
  intimidad_comunicacion_deseos: "comunicación de deseos",
  intimidad_limites_respeto: "respeto de límites",
  valores_empatia: "empatía profunda",
  valores_confianza: "confianza y lealtad",
  valores_gestion_conflicto: "gestión amorosa del conflicto",
  valores_igualdad_genero: "igualdad de género",
  valores_corresponsabilidad: "corresponsabilidad",
  valores_respeto_diversidad: "respeto por la diversidad",
};

// ─── Animal Trait Metaphors ───────────────────────────────────────────────────

const ANIMAL_TRAITS: Record<string, string> = {
  Axolotl: "regeneración y adaptabilidad",
  Mantis: "paciencia y precisión",
  Crow: "inteligencia y curiosidad",
  Hummingbird: "vitalidad y alegría",
  Hedgehog: "ternura protegida y resiliencia",
  Butterfly: "transformación y belleza",
  Seahorse: "lealtad silenciosa y gracia",
  Dolphin: "inteligencia social y juego",
  Octopus: "ingenio y versatilidad",
  Owl: "sabiduría e intuición",
  Wolf: "lealtad y trabajo en equipo",
  Fox: "astucia y encanto",
  Cat: "independencia y misterio",
  Dog: "devoción incondicional",
  Lion: "coraje y liderazgo",
  Tiger: "fuerza interior y determinación",
  Bear: "protección y calma",
  Panda: "dulzura y serenidad",
  Koala: "tranquilidad y ternura",
  Meerkat: "vigilancia comunitaria y cooperación",
  Otter: "juego y conexión",
  Beaver: "laboriosidad y construcción",
  Squirrel: "previsión y energía",
  Rabbit: "sensibilidad y velocidad",
  Deer: "gentileza y presencia",
  Jaguar: "poder silencioso y misterio",
  Puma: "agilidad y determinación",
  Macaw: "expresión vibrante y libertad",
  Toucan: "color y comunicación",
  Quetzal: "belleza sagrada y libertad",
  Pelican: "generosidad y cuidado",
  Flamingo: "elegancia y comunidad",
  Heron: "paciencia y precisión",
  Duckling: "inocencia y compañerismo",
  Swan: "gracia y transformación",
  Seal: "adaptabilidad y juego",
  Walrus: "fuerza tranquila y protección",
  Whale: "profundidad emocional y sabiduría",
  Shark: "determinación y enfoque",
  Jellyfish: "fluidez y calma",
  Starfish: "regeneración y serenidad",
  Crab: "protección y tenacidad",
  Lobster: "crecimiento continuo y fortaleza",
  Snail: "constancia y autoconocimiento",
  Firefly: "luz propia y esperanza",
  Bee: "colaboración y dedicación",
  Wasp: "defensa y valentía",
  Ant: "perseverancia y comunidad",
  Beetle: "resistencia y transformación",
  Dragonfly: "cambio y perspectiva",
  Moth: "búsqueda de luz y sensibilidad",
  Cricket: "expresión y ritmo",
  Grasshopper: "salto y aventura",
  Chameleon: "adaptabilidad y autenticidad",
  Iguana: "calma y observación",
  Lizard: "agilidad y regeneración",
  Gecko: "curiosidad y simpatía",
  Turtle: "sabiduría y longevidad",
  Frog: "transformación y limpieza emocional",
  Toad: "introspección y resiliencia",
  Salamander: "regeneración y misterio",
};

// ─── Narrative Phrase Bank ────────────────────────────────────────────────────

const PHRASE_BANK: Record<string, string[]> = {
  // ── Big Five: Apertura ──
  personalidad_apertura: [
    "tu curiosidad inagotable te lleva a descubrir mundos que otros ni imaginan",
    "tu mente abierta es un jardín donde florecen ideas extraordinarias",
    "exploras la vida con una valentía que inspira a quienes te rodean",
    "cada día encuentras una nueva forma de maravillarte con el mundo",
    "tu espíritu explorador convierte lo desconocido en una aventura",
    "tienes la rareza preciosa de quien abraza lo diferente sin miedo",
    "tu creatividad no conoce fronteras y eso te hace magnéticx",
    "ves posibilidades donde otrxs ven paredes, y eso es un superpoder",
  ],
  // ── Big Five: Responsabilidad ──
  personalidad_responsabilidad: [
    "tu compromiso con lo que amas es inquebrantable y admirable",
    "las personas confían en ti porque cumples lo que prometes",
    "tu disciplina es una forma de amor hacia ti y hacia lxs demás",
    "construyes con paciencia todo lo que otros sueñan pero no materializan",
    "tu constancia es una roca donde lxs demás encuentran seguridad",
    "tienes el don de hacer que las cosas sucedan, paso a paso",
    "tu organización y dedicación son un regalo para cada proyecto",
    "cuando dices que estarás ahí, el mundo entero lo sabe",
  ],
  // ── Big Five: Extraversión ──
  personalidad_extraversion: [
    "tu energía ilumina cada espacio que habitas",
    "las personas gravitan hacia ti porque irradias una calidez magnética",
    "tu presencia convierte lo cotidiano en una celebración",
    "tienes el don de hacer que cualquiera se sienta incluidx",
    "tu entusiasmo es contagioso y transforma el ambiente",
    "eres la chispa que enciende conversaciones memorables",
    "tu risa es el soundtrack que le falta a cualquier reunión",
    "donde llegas, la energía sube y los corazones se abren",
  ],
  // ── Big Five: Amabilidad ──
  personalidad_amabilidad: [
    "tu bondad es un faro silencioso que guía a quienes te necesitan",
    "escuchas con todo el ser y eso es un regalo rarísimo",
    "tu ternura transforma los días grises de las personas",
    "tienes una generosidad que nace de lo más profundo de tu esencia",
    "tu compasión natural hace que el mundo sea un lugar más habitable",
    "cuidas de lxs demás con una delicadeza que conmueve",
    "tu corazón enorme es tu característica más hermosa",
    "donde hay dolor, tú llegas con calma y presencia genuina",
  ],
  // ── Big Five: Estabilidad emocional ──
  personalidad_estabilidad_emocional: [
    "tu calma interior es un ancla para quienes navegan tormentas",
    "tienes una paz que no se altera con facilidad, y eso da seguridad",
    "tu estabilidad emocional es un refugio para las personas que amas",
    "respiras profundo y encuentras claridad donde otrxs ven caos",
    "tu serenidad inspira a quienes te rodean a encontrar la suya",
    "eres como el mar en calma: profundx, sereno, inmenso",
    "tu fortaleza emocional no es dureza, es una dulzura que no se rompe",
    "tienes la capacidad rara de sostener sin quebrar",
  ],
  // ── Cultural: Música ──
  cultural_musica_exploracion: [
    "tu playlist es un mapa de tu alma: diversa, sorprendente, viva",
    "la música te atraviesa y tú la compartes como quien regala universos",
    "tienes un oído que descubre belleza en géneros que otrxs ni conocen",
    "cada canción que eliges cuenta algo profundo de quién eres",
    "tu curiosidad musical es un viaje sin fin que inspira",
  ],
  // ── Cultural: Estética visual ──
  cultural_estetica_visual: [
    "ves belleza en los detalles que el mundo pasa por alto",
    "tu sensibilidad estética transforma todo lo que tocas en algo hermoso",
    "tienes un ojo para lo bello que es verdaderamente extraordinario",
    "el arte te habla y tú lo traduces para quienes no saben escuchar",
    "tu sentido de la estética es una forma de poesía visual",
  ],
  // ── Cultural: Hobbies creativos ──
  cultural_hobbies_creativos: [
    "tus manos crean lo que tu imaginación sueña, y eso es magia pura",
    "cada hobby tuyo es una ventana a un universo creativo único",
    "tienes la capacidad de hacer arte de lo cotidiano",
    "tu creatividad desborda y contagia a quienes te rodean",
    "crear es tu forma de existir y de dejar huella en el mundo",
  ],
  // ── Cultural: Vida universitaria ──
  cultural_vida_universitaria: [
    "vives la universidad con una pasión que la convierte en tu hogar",
    "tu energía en el campus hace que cada día sea una aventura",
    "aprovechas cada rincón de la vida universitaria con entusiasmo",
    "eres de quienes hacen que la comunidad estudiantil florezca",
    "tu presencia activa en el campus inspira a otrxs a participar",
  ],
  // ── Cultural: Humor ──
  cultural_humor: [
    "tu risa es contagiosa y tu humor une a las personas",
    "encuentras la alegría en los rincones más inesperados",
    "tu sentido del humor es un bálsamo para los días difíciles",
    "haces reír sin esfuerzo y eso es un talento que sana",
    "tu humor inteligente convierte momentos ordinarios en memorables",
  ],
  // ── Intimidad: Palabras de afirmación ──
  intimidad_palabras_afirmacion: [
    "tus palabras tienen el poder de construir y sostener a quienes amas",
    "expresas tu cariño con una honestidad verbal que desarma",
    "sabes decir exactamente lo que el corazón de la otra persona necesita escuchar",
    "tu lenguaje de amor es verbal y eso hace que nunca quede duda de lo que sientes",
    "afirmas a lxs demás con una generosidad que transforma relaciones",
  ],
  // ── Intimidad: Tiempo de calidad ──
  intimidad_tiempo_calidad: [
    "cuando estás presente, estás presente de verdad, y eso es oro puro",
    "tu tiempo es el regalo más valioso que das y se nota en cada momento compartido",
    "sabes crear espacios de conexión genuina donde el tiempo se detiene",
    "tu presencia plena hace que la otra persona se sienta lo más importante del mundo",
    "valoras la calidad sobre la cantidad y eso define tus relaciones más hermosas",
  ],
  // ── Intimidad: Regalos y detalles ──
  intimidad_regalos_detalle: [
    "tienes un don para los detalles que hacen sentir especial a cualquier persona",
    "tus gestos pequeños cargan un amor enorme que no pasa desapercibido",
    "piensas en lxs demás incluso cuando no están cerca, y eso se refleja en cada detalle",
    "tu generosidad en lo pequeño revela la grandeza de tu corazón",
    "cada regalo tuyo cuenta una historia de cuánto conoces a la otra persona",
  ],
  // ── Intimidad: Contacto físico ──
  intimidad_contacto_fisico: [
    "tu abrazo es un hogar y tus manos comunican lo que las palabras no alcanzan",
    "el contacto físico contigo es una forma de decir 'estoy aquí, no te vayas'",
    "tu cercanía es un lenguaje de amor que trasciende las palabras",
    "sabes que un abrazo a tiempo puede salvar un día entero",
    "tu presencia física transmite una seguridad y calidez inigualables",
  ],
  // ── Intimidad: Actos de servicio ──
  intimidad_actos_servicio: [
    "demuestras tu amor haciendo, y cada acto tuyo es una carta de cariño silenciosa",
    "tu forma de cuidar es práctica, constante y profundamente conmovedora",
    "nunca esperas reconocimiento porque servir es tu naturaleza",
    "los actos de servicio que ofreces hablan más fuerte que cualquier promesa",
    "tu amor se manifiesta en lo que haces por lxs demás sin que lo pidan",
  ],
  // ── Intimidad: Apertura emocional ──
  intimidad_apertura_emocional: [
    "tu valentía emocional crea espacios seguros para quienes te aman",
    "te entregas con una honestidad que desarma y enamora",
    "tu vulnerabilidad no es debilidad: es la fuerza más hermosa que tienes",
    "abres tu corazón sin reservas y eso inspira a otrxs a hacer lo mismo",
    "tu transparencia emocional es un acto revolucionario en un mundo que se esconde",
  ],
  // ── Intimidad: Comunicación de deseos ──
  intimidad_comunicacion_deseos: [
    "sabes lo que quieres y lo comunicas con una claridad admirable",
    "tu honestidad sobre tus deseos es refrescante y crea conexiones reales",
    "hablar de lo que necesitas no te da miedo, y eso te hace madurx y atractivx",
    "tu comunicación directa de deseos elimina juegos y construye confianza",
    "expresas lo que sientes con una naturalidad que facilita todo",
  ],
  // ── Intimidad: Límites y respeto ──
  intimidad_limites_respeto: [
    "respetas los límites ajenos con una delicadeza que genera confianza profunda",
    "tu capacidad de honrar los espacios del otrx es una forma de amor elevada",
    "entiendes que el respeto mutuo es la base de toda conexión verdadera",
    "sabes cuándo acercarte y cuándo dar espacio, y eso es inteligencia emocional pura",
    "tu respeto por los límites crea relaciones donde ambas personas florecen",
  ],
  // ── Valores: Empatía ──
  valores_empatia: [
    "sientes con una profundidad que te hace extraordinariamente humanx",
    "tu empatía es un superpoder: puedes leer el corazón de quienes te rodean",
    "te pones en los zapatos del otrx con una facilidad que conmueve",
    "tu capacidad de comprender el dolor ajeno te convierte en un refugio",
    "la empatía que irradias hace que las personas se sientan vistas y validadas",
  ],
  // ── Valores: Confianza ──
  valores_confianza: [
    "tu lealtad es inquebrantable y quienes la reciben lo saben",
    "inspiras confianza con solo estar presente: hay algo en ti que transmite seguridad",
    "eres de esas personas con las que se puede contar a las tres de la mañana",
    "tu palabra vale más que cualquier contrato escrito",
    "construyes confianza con constancia, no con promesas vacías",
  ],
  // ── Valores: Gestión del conflicto ──
  valores_gestion_conflicto: [
    "enfrentas los conflictos con una madurez que transforma tensiones en crecimiento",
    "tu forma de resolver desacuerdos es un arte: escuchas, validas, construyes",
    "donde hay conflicto, tú traes la calma y la perspectiva que se necesita",
    "no huyes de las conversaciones difíciles y eso te hace una pareja increible",
    "tu gestión del conflicto es prueba de que el amor se construye, no se encuentra perfecto",
  ],
  // ── Valores: Igualdad de género ──
  valores_igualdad_genero: [
    "tu compromiso con la igualdad es una forma de amor hacia toda la humanidad",
    "crees en un mundo donde todas las personas valen lo mismo, y actúas en consecuencia",
    "tu visión de igualdad inspira a quienes te rodean a cuestionar y crecer",
    "defiendes la equidad con una convicción silenciosa pero poderosa",
    "tu perspectiva de género es progresista y eso te hace parte del cambio",
  ],
  // ── Valores: Corresponsabilidad ──
  valores_corresponsabilidad: [
    "entiendes que el amor se construye entre dos y asumes tu parte con gusto",
    "tu sentido de responsabilidad compartida es la base de relaciones equitativas",
    "no cargas todo solx ni esperas que otrx lo haga: el equipo es tu forma de amar",
    "la corresponsabilidad que practicas demuestra una madurez emocional admirable",
    "tu disposición a compartir el peso hace que las relaciones contigo sean justas y libres",
  ],
  // ── Valores: Respeto por la diversidad ──
  valores_respeto_diversidad: [
    "celebras la diferencia y eso te convierte en un espacio seguro para todxs",
    "tu respeto por la diversidad no es tolerancia pasiva: es celebración activa",
    "donde otrxs ven diferencias, tú ves riqueza y posibilidades de aprender",
    "tu apertura hacia todas las formas de ser es un regalo para la comunidad",
    "abrazas la diversidad con una naturalidad que hace que todxs se sientan bienvenidxs",
  ],
  // ── Identidad: Exclusividad ──
  identidad_exclusividad: [
    "tu devoción es exclusiva y eso genera una profundidad de conexión única",
    "cuando eliges a alguien, lo haces con todo tu ser y sin reservas",
    "tu compromiso exclusivo es una declaración de amor consciente",
    "valoras la profundidad sobre la amplitud en tus conexiones",
    "tu lealtad enfocada crea un espacio de intimidad incomparable",
  ],
  // ── Identidad: Comunicación afectiva ──
  identidad_comunicacion_afectiva: [
    "te comunicas desde el corazón y eso transforma cada conversación",
    "tu forma de expresar afecto verbalmente es natural, cálida y constante",
    "las palabras de cariño fluyen de ti sin esfuerzo y sin vergüenza",
    "tu comunicación afectiva crea un puente directo entre tu alma y la del otrx",
    "expresas lo que sientes con una claridad emocional que pocas personas tienen",
  ],
  // ── MBTI dimensions ──
  mbti_extraversion: [
    "tu energía hacia afuera es natural y magnética",
    "recargas tu espíritu conectando con el mundo exterior",
    "tu extroversión es una puerta abierta que invita a lxs demás a entrar",
  ],
  mbti_intuicion: [
    "tu intuición es una brújula interna que nunca falla",
    "percibes lo que no se dice y eso te da una profundidad única",
    "tu visión intuitiva te permite anticipar belleza donde aún no existe",
  ],
  mbti_pensamiento: [
    "tu mente analítica es una herramienta poderosa para entender el mundo",
    "piensas con claridad y eso te permite resolver lo que parece irresoluble",
    "tu capacidad de razonamiento es admirable y complementa tu sensibilidad",
  ],
  mbti_juicio: [
    "tu estructura interna te da una capacidad de realización envidiable",
    "planificas con sabiduría y ejecutas con precisión",
    "tu sentido del orden no es rigidez: es una forma de cuidar tu espacio y el de lxs demás",
  ],
};

// ─── Color Temperature Modifiers ──────────────────────────────────────────────

const COLOR_TEMPERATURE_MODIFIERS: Record<string, string[]> = {
  calido: [
    "Una calidez rara y preciosa te envuelve: eres fuego suave que no quema, sino que abraza.",
    "Tu energía cálida irradia una pasión tranquila que reconforta a quien se acerca.",
    "Llevas el calor del sol en tu forma de ser, y eso hace que la gente quiera quedarse.",
  ],
  frio: [
    "Hay en ti una profundidad serena, como aguas quietas que guardan universos enteros.",
    "Tu misterio tranquilo invita a conocerte despacio, y quien lo hace encuentra tesoros.",
    "Posees la serenidad de lo profundo: una calma que no es distancia, sino riqueza interior.",
  ],
  neutro: [
    "Tu equilibrio es armonía pura: puedes adaptarte sin perder tu esencia.",
    "Eres versatilidad y coherencia al mismo tiempo, un balance que pocas personas logran.",
    "Tu naturaleza equilibrada te permite conectar con todo tipo de personas sin perder tu centro.",
  ],
};

// ─── Community Value Phrases ──────────────────────────────────────────────────

const COMMUNITY_PHRASES: string[] = [
  "Tu energía regenerativa es un regalo para esta comunidad.",
  "El campus es un lugar mejor porque tú estás en él.",
  "Quienes te conozcan aquí encontrarán en ti algo que no sabían que necesitaban.",
  "Tu presencia en este hábitat universitario enriquece a todxs quienes te rodean.",
  "Eres exactamente el tipo de ser que esta comunidad necesita: auténticx, valiente, luminoso.",
  "Tu existencia aquí no es casualidad: es una aportación única al tejido de esta comunidad.",
  "Las personas que te encuentren en el campus se llevarán un pedazo de tu luz.",
  "Este hábitat te recibe con los brazos abiertos porque seres como tú lo hacen vibrar.",
];

// ─── Closing Affirmations ─────────────────────────────────────────────────────

const CLOSING_AFFIRMATIONS: string[] = [
  "Nunca dudes de lo que vales: eres extraordinarix.",
  "Recuerda: no hay nadie en el mundo con tu combinación exacta de luz.",
  "Tu forma de ser es válida, hermosa y necesaria.",
  "Sigue siendo exactamente quien eres — el mundo necesita esa versión de ti.",
  "Mereces conexiones que celebren todo lo que eres.",
  "Tu autenticidad es tu mayor regalo. Compártela sin miedo.",
];

// ─── Gender Article Helpers ───────────────────────────────────────────────────

/** Animals whose diminutive ends in feminine-sounding patterns */
const FEMININE_ANIMALS = new Set([
  "nutria", "mariposita", "libelula", "polillita", "estrellita", "medusita",
  "salamandrita", "langostita", "suricatita",
]);

function getArticle(diminutivo: string): string {
  return FEMININE_ANIMALS.has(diminutivo) ? "una" : "un";
}

// ─── Deterministic Hash ───────────────────────────────────────────────────────

function simpleHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// ─── Cosine Similarity ────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Animal Selection ─────────────────────────────────────────────────────────

/**
 * Selects the best-matching animal based on the user's normalized personality scores.
 * Algorithm:
 * 1. Extract the user's Big Five scores (5 dims, each 0-1)
 * 2. For each animal in the catalog, compute cosine similarity between
 *    the user's Big Five vector and the animal's personality_affinity vector
 * 3. Return the animal with highest similarity
 * 4. Tie-break: deterministic by animal id (alphabetical)
 */
export function selectAnimal(normalizedScores: DimensionScoresV2): CatalogAnimal {
  const userVector = BIG_FIVE_DIMENSIONS.map((dim) => normalizedScores[dim] ?? 0);

  let bestAnimal: CatalogAnimal | null = null;
  let bestScore = -1;

  for (const animal of ANIMALES) {
    const animalVector = BIG_FIVE_DIMENSIONS.map(
      (dim) => animal.personality_affinity[dim] ?? 0
    );
    const similarity = cosineSimilarity(userVector, animalVector);

    if (
      similarity > bestScore ||
      (similarity === bestScore && bestAnimal !== null && animal.id < bestAnimal.id)
    ) {
      bestScore = similarity;
      bestAnimal = animal;
    }
  }

  return bestAnimal ?? ANIMALES[0];
}

// ─── Color Selection ──────────────────────────────────────────────────────────

/**
 * Selects a color based on the user's cultural affinity + intimacy dimensions.
 * Algorithm:
 * 1. Compute an "emotional temperature" from cultural + intimacy scores
 * 2. Within the temperature group, select based on dominant aesthetic dimension
 * 3. Deterministic selection: hash(userId + scores) % candidates.length
 */
export function selectColor(normalizedScores: DimensionScoresV2, userId: string): CatalogColor {
  const extraversion = normalizedScores.personalidad_extraversion ?? 0;
  const openness = normalizedScores.personalidad_apertura ?? 0;
  const cultural = normalizedScores.cultural_estetica_visual ?? 0;
  const intimacy = normalizedScores.intimidad_apertura_emocional ?? 0;

  // Determine temperature
  let temperatura: string;
  if (extraversion > 0.6 && cultural > 0.5) {
    temperatura = "calido";
  } else if (openness > 0.6 && extraversion <= 0.4) {
    temperatura = "frio";
  } else {
    temperatura = "neutro";
  }

  // Determine preferred textures based on dominant cultural/intimacy dimension
  const hobbies = normalizedScores.cultural_hobbies_creativos ?? 0;
  const estetica = normalizedScores.cultural_estetica_visual ?? 0;

  let preferredTexturas: string[];
  if (estetica > hobbies && estetica > intimacy) {
    preferredTexturas = ["sedosa", "luminosa"];
  } else if (hobbies > estetica && hobbies > intimacy) {
    preferredTexturas = ["cristalina", "acuosa"];
  } else if (intimacy > estetica && intimacy > hobbies) {
    preferredTexturas = ["aterciopelada"];
  } else {
    preferredTexturas = ["mate", "terrosa"];
  }

  // Filter candidates by temperature
  let candidates = COLORES.filter((c) => c.temperatura === temperatura);

  // Try to narrow by preferred texture
  const textureMatch = candidates.filter((c) => preferredTexturas.includes(c.textura));
  if (textureMatch.length > 0) {
    candidates = textureMatch;
  }

  // If no candidates in this temperature, fall back to all colors
  if (candidates.length === 0) {
    candidates = COLORES;
  }

  // Deterministic selection using hash of userId + score fingerprint
  const scoreFingerprint = Object.values(normalizedScores)
    .slice(0, 10)
    .map((v) => Math.round((v ?? 0) * 100))
    .join("");
  const hash = simpleHash(userId + scoreFingerprint);
  const index = hash % candidates.length;

  return candidates[index];
}

// ─── Top Dimensions ───────────────────────────────────────────────────────────

/**
 * Returns the user's top N dimensions by score (for narrative generation).
 */
export function getTopDimensions(
  normalizedScores: DimensionScoresV2,
  limit: number = 3
): DimensionAffinity[] {
  const entries = Object.entries(normalizedScores)
    .filter(([, score]) => score !== undefined && score !== null)
    .map(([dimension, score]) => ({
      dimension,
      score,
      label: DIMENSION_LABELS[dimension] ?? dimension,
    }))
    .sort((a, b) => b.score - a.score);

  return entries.slice(0, limit);
}

// ─── Narrative Generation ─────────────────────────────────────────────────────

/**
 * Generates a unique, empowering, poetic paragraph describing the user's profile.
 * Combines animal traits + color symbolism + top personality dimensions.
 * Output is always positive, warm, and validates the user's uniqueness.
 */
export function generateProfileNarrative(
  animal: CatalogAnimal,
  color: CatalogColor,
  topDimensions: DimensionAffinity[]
): string {
  const article = getArticle(animal.diminutivo_es);
  const sentences: string[] = [];

  // 1. Opening sentence
  sentences.push(
    `Eres ${article} ${animal.diminutivo_es} ${color.nombre.toLowerCase()}.`
  );

  // 2. Core trait from animal metaphor
  const animalTrait = ANIMAL_TRAITS[animal.nombre_fuente] ?? "autenticidad y belleza";
  sentences.push(
    `Tu naturaleza de ${animal.nombre_fuente.toLowerCase()} te dota de ${animalTrait}, ` +
    `una cualidad que se siente en cada interacción contigo.`
  );

  // 3. Primary dimension phrase
  if (topDimensions.length > 0) {
    const primaryDim = topDimensions[0].dimension;
    const phrases = PHRASE_BANK[primaryDim];
    if (phrases && phrases.length > 0) {
      const idx = simpleHash(animal.id + color.id + primaryDim) % phrases.length;
      const phrase = phrases[idx];
      sentences.push(capitalize(phrase) + ".");
    }
  }

  // 4. Secondary dimension phrase
  if (topDimensions.length > 1) {
    const secondaryDim = topDimensions[1].dimension;
    const phrases = PHRASE_BANK[secondaryDim];
    if (phrases && phrases.length > 0) {
      const idx = simpleHash(color.id + secondaryDim + animal.id) % phrases.length;
      const phrase = phrases[idx];
      sentences.push(capitalize(phrase) + ".");
    }
  }

  // 5. Color temperature modifier
  const tempModifiers = COLOR_TEMPERATURE_MODIFIERS[color.temperatura];
  if (tempModifiers && tempModifiers.length > 0) {
    const idx = simpleHash(color.id + animal.id) % tempModifiers.length;
    sentences.push(tempModifiers[idx]);
  }

  // 6. Community value
  const communityIdx = simpleHash(animal.id + color.id + (topDimensions[0]?.dimension ?? "")) % COMMUNITY_PHRASES.length;
  sentences.push(COMMUNITY_PHRASES[communityIdx]);

  // 7. Closing affirmation (optional, included ~60% of the time based on hash)
  const closingIdx = simpleHash(animal.id + color.hex) % CLOSING_AFFIRMATIONS.length;
  if (simpleHash(color.id + animal.diminutivo_es) % 5 < 3) {
    sentences.push(CLOSING_AFFIRMATIONS[closingIdx]);
  }

  return sentences.join(" ");
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Alias Generation ─────────────────────────────────────────────────────────

/**
 * Generates a unique alias combining animal diminutive + color name + short hash.
 * Example: "ajolotito verde esmeralda · X7K2"
 */
export function generateAlias(animal: CatalogAnimal, color: CatalogColor, userId: string): string {
  const hash = simpleHash(userId + animal.id + color.id);
  const shortHash = hash.toString(36).toUpperCase().slice(0, 4).padEnd(4, "0");
  return `${animal.diminutivo_es} ${color.nombre.toLowerCase()} · ${shortHash}`;
}

// ─── Full Profile Generation ──────────────────────────────────────────────────

/**
 * Complete profile identity generation pipeline.
 * Called after quiz scoring to produce the user's public identity.
 */
export function generateProfileIdentity(
  normalizedScores: DimensionScoresV2,
  userId: string
): ProfileIdentity {
  const animal = selectAnimal(normalizedScores);
  const color = selectColor(normalizedScores, userId);
  const topDims = getTopDimensions(normalizedScores, 3);
  const narrative = generateProfileNarrative(animal, color, topDims);
  const alias = generateAlias(animal, color, userId);

  return {
    animalId: animal.id,
    animalDiminutivo: animal.diminutivo_es,
    colorId: color.id,
    colorNombre: color.nombre,
    colorHex: color.hex,
    alias,
    narrative,
  };
}
