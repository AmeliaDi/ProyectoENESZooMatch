/**
 * Content fetched from the web is untrusted data. This detector never changes
 * what the crawler does: it only flags text that looks like instructions aimed
 * at an AI so the run log records it as an anomaly.
 */

export interface InjectionFinding {
  readonly pattern: string;
  readonly snippet: string;
}

const PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["ignore-instructions", /\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(previous|prior|above|all|earlier)\b[^.\n]{0,20}\b(instructions?|prompts?|rules)\b/i],
  ["ignora-instrucciones", /\b(ignora|olvida|omite)\b[^.\n]{0,40}\b(instrucciones|indicaciones|reglas)\b/i],
  ["role-override", /\byou are (now )?(an? )?(ai|assistant|chatgpt|language model|llm)\b/i],
  ["system-prompt", /\b(system prompt|developer message|<\|im_start\|>|\[\/?INST\])/i],
  ["agent-directive", /\b(ai|llm|language model|assistant|agent)s?\b[^.\n]{0,30}\b(must|should|shall)\b[^.\n]{0,30}\b(output|respond|reply|say|include|extract|return)\b/i],
  ["exfiltration", /\b(api[_ -]?key|password|secret|token)\b[^.\n]{0,40}\b(send|post|reveal|print|share)\b/i],
  ["hidden-markup", /<!--[^>]{0,200}\b(instruction|prompt|assistant|ai)\b/i],
];

const SNIPPET_RADIUS = 80;

export function detectInjection(text: string): InjectionFinding[] {
  const findings: InjectionFinding[] = [];
  for (const [name, regex] of PATTERNS) {
    const match = regex.exec(text);
    if (!match) continue;
    const start = Math.max(0, match.index - SNIPPET_RADIUS);
    const end = Math.min(text.length, match.index + match[0].length + SNIPPET_RADIUS);
    findings.push({ pattern: name, snippet: text.slice(start, end).replace(/\s+/g, " ").trim() });
  }
  return findings;
}
