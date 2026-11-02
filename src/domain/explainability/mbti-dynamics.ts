/**
 * MBTI cognitive-function dynamics: narrative only ("lo que podrían
 * platicar"). The MBTI layer weighs almost nothing in the score (ADR-017);
 * nothing here feeds a number.
 */

export interface CompatibilidadMBTI {
  tipo1: string;
  tipo2: string;
  funcionesComplementarias: string;
  dinamicaNatural: string;
}

type CognitiveFunction = "Fi" | "Fe" | "Ti" | "Te" | "Ni" | "Ne" | "Si" | "Se";

const MBTI_COGNITIVE_FUNCTIONS: Record<string, readonly CognitiveFunction[]> = {
  INFP: ["Fi", "Ne", "Si", "Te"],
  INFJ: ["Ni", "Fe", "Ti", "Se"],
  INTP: ["Ti", "Ne", "Si", "Fe"],
  INTJ: ["Ni", "Te", "Fi", "Se"],
  ENFP: ["Ne", "Fi", "Te", "Si"],
  ENFJ: ["Fe", "Ni", "Se", "Ti"],
  ENTP: ["Ne", "Ti", "Fe", "Si"],
  ENTJ: ["Te", "Ni", "Se", "Fi"],
  ISFP: ["Fi", "Se", "Ni", "Te"],
  ISFJ: ["Si", "Fe", "Ti", "Ne"],
  ISTP: ["Ti", "Se", "Ni", "Fe"],
  ISTJ: ["Si", "Te", "Fi", "Ne"],
  ESFP: ["Se", "Fi", "Te", "Ni"],
  ESFJ: ["Fe", "Si", "Ne", "Ti"],
  ESTP: ["Se", "Ti", "Fe", "Ni"],
  ESTJ: ["Te", "Si", "Ne", "Fi"],
};

const COMPLEMENTARY_FUNCTION: Record<CognitiveFunction, CognitiveFunction> = {
  Ne: "Ni",
  Ni: "Ne",
  Se: "Si",
  Si: "Se",
  Te: "Fi",
  Fi: "Te",
  Ti: "Fe",
  Fe: "Ti",
};

/**
 * Returns the complementary cognitive-function pairs between two MBTI codes.
 * Only the dominant and auxiliary functions are compared, which keeps the
 * narrative focused on the two strongest ways each person meets the world.
 */
export function cognitiveComplementarity(
  userMbtiCode: string | null,
  matchMbtiCode: string | null,
): string[] {
  const userFunctions = MBTI_COGNITIVE_FUNCTIONS[userMbtiCode?.trim().toUpperCase() ?? ""] ?? [];
  const matchFunctions = MBTI_COGNITIVE_FUNCTIONS[matchMbtiCode?.trim().toUpperCase() ?? ""] ?? [];
  const pairs: string[] = [];

  for (const userFunction of userFunctions.slice(0, 2)) {
    const complement = COMPLEMENTARY_FUNCTION[userFunction];
    if (matchFunctions.slice(0, 2).includes(complement)) {
      const pair = `${userFunction} ↔ ${complement}`;
      if (!pairs.includes(pair)) pairs.push(pair);
    }
  }
  return pairs;
}

const FUNCTION_HUMAN_LABELS: Record<CognitiveFunction, string> = {
  Fe: "la empatía que cuida el vínculo",
  Fi: "la autenticidad que escucha los valores",
  Ne: "la imaginación que abre posibilidades",
  Ni: "la visión que encuentra significados",
  Se: "la presencia que disfruta el momento",
  Si: "la memoria que da continuidad",
  Te: "la estructura que vuelve reales los planes",
  Ti: "la lógica que ordena las preguntas",
};

const COGNITIVE_PAIR_COPY: Record<string, string> = {
  "Ne|Ni": "Ne ↔ Ni: une abre posibilidades y otre descubre el hilo profundo que las conecta.",
  "Se|Si": "Se ↔ Si: une disfruta el presente y otre aporta memoria y calma para darle continuidad.",
  "Fi|Te": "Fi ↔ Te: une cuida los valores y otre les da estructura para convertirlos en decisiones.",
  "Fe|Ti": "Fe ↔ Ti: une sintoniza con las emociones y otre aclara las ideas cuando hace falta.",
};

const DOMINANT_DYNAMICS: Record<string, string> = {
  "Fe|Fe": "Dúo de cuidado: ambes leen el clima emocional y crean un espacio donde pedir apoyo se siente natural.",
  "Fi|Fi": "Dúo auténtico: se reconocen en la honestidad emocional y respetan los tiempos del mundo interior.",
  "Ne|Ne": "Dúo de posibilidades: una idea enciende otra y la conversación siempre encuentra un camino nuevo.",
  "Ni|Ni": "Dúo visionario: comparten miradas profundas y disfrutan dar sentido a lo que otres pasan por alto.",
  "Se|Se": "Dúo del presente: conectan haciendo, explorando y convirtiendo los planes sencillos en recuerdos vivos.",
  "Si|Si": "Dúo de confianza: la constancia y los pequeños rituales construyen una relación predecible y tierna.",
  "Te|Te": "Dúo de impulso: se entienden al poner metas claras y celebrar lo que logran construir juntes.",
  "Ti|Ti": "Dúo curioso: disfrutan analizar sin prisa y respetan la necesidad de pensar antes de responder.",
  "Fe|Fi": "Mentor-Soñador: la guía empática de une ayuda a otre a confiar en su mundo interior; la ternura circula sin exigir que sean iguales.",
  "Fe|Ni": "Guía-Visionarie: el cuidado de une da aire a la visión de otre y las conversaciones encuentran un rumbo compasivo.",
  "Fe|Ne": "Guía-Exploradore: el entusiasmo se vuelve cercanía cuando une propone posibilidades y otre cuida el ritmo del vínculo.",
  "Fi|Ne": "Soñadore-Exploradore: imaginación y autenticidad se retroalimentan en conversaciones que se sienten libres y sinceras.",
  "Ne|Ni": "Exploradore-Visionarie: une multiplica caminos y otre encuentra su sentido; la diferencia enciende curiosidad, no competencia.",
  "Fi|Ni": "Soñadore-Visionarie: valores e intuiciones profundas crean un refugio para hablar de lo que de verdad importa.",
  "Fi|Te": "Corazón-Estratega: une pone los valores y otre la estructura; negociar ambos lenguajes vuelve el apoyo muy concreto.",
  "Ni|Te": "Visión-Estrategia: las ideas de largo alcance encuentran pasos posibles y cada une reconoce el talento del otre.",
  "Fe|Ti": "Cuidado-Análisis: une escucha el corazón y otre desenreda las preguntas; la paciencia convierte ambos dones en refugio.",
  "Se|Si": "Presente-Memoria: une trae espontaneidad y otre continuidad, creando un ritmo que disfruta lo nuevo sin perder raíces.",
};

function cognitivePairKey(first: CognitiveFunction, second: CognitiveFunction): string {
  return [first, second].sort().join("|");
}

function normalizedMbti(code: string | null): string | null {
  const normalized = code?.trim().toUpperCase() ?? "";
  return MBTI_COGNITIVE_FUNCTIONS[normalized] ? normalized : null;
}

function describeCognitivePairs(pairs: readonly string[]): string {
  return pairs
    .map((pair) => {
      const [first, second] = pair.split(" ↔ ") as [CognitiveFunction, CognitiveFunction];
      return COGNITIVE_PAIR_COPY[cognitivePairKey(first, second)] ?? pair;
    })
    .join(" ");
}

export function buildMbtiCompatibility(
  userMbtiCode: string | null,
  matchMbtiCode: string | null,
): CompatibilidadMBTI | null {
  const tipo1 = normalizedMbti(userMbtiCode);
  const tipo2 = normalizedMbti(matchMbtiCode);
  if (!tipo1 || !tipo2) return null;

  const userFunctions = MBTI_COGNITIVE_FUNCTIONS[tipo1]!;
  const matchFunctions = MBTI_COGNITIVE_FUNCTIONS[tipo2]!;
  const pairs = cognitiveComplementarity(tipo1, tipo2);
  const shared = userFunctions
    .slice(0, 2)
    .filter((fn) => matchFunctions.slice(0, 2).includes(fn));

  let funcionesComplementarias: string;
  if (pairs.length > 0) {
    funcionesComplementarias = describeCognitivePairs(pairs);
  } else if (shared.length > 0) {
    funcionesComplementarias = `Comparten ${shared.join(" y ")}: ${FUNCTION_HUMAN_LABELS[shared[0]!]}; ese terreno común facilita entenderse con naturalidad.`;
  } else {
    funcionesComplementarias =
      "Sus funciones principales siguen rutas distintas; la afinidad puede crecer al traducir esos estilos con curiosidad.";
  }

  const dominantKey = cognitivePairKey(userFunctions[0]!, matchFunctions[0]!);
  const dinamicaNatural =
    DOMINANT_DYNAMICS[dominantKey] ??
    `Dinámica ${userFunctions[0]}-${matchFunctions[0]}: combinan ${FUNCTION_HUMAN_LABELS[userFunctions[0]!]} con ${FUNCTION_HUMAN_LABELS[matchFunctions[0]!]}; escucharse las vuelve apoyo mutuo.`;

  return { tipo1, tipo2, funcionesComplementarias, dinamicaNatural };
}
