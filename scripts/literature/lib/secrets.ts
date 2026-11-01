/**
 * Secret patterns for `npm run secrets:check`. Findings report the rule and
 * location only; the matched text is masked so the scanner never re-leaks it.
 */

export interface SecretRule {
  readonly name: string;
  readonly regex: RegExp;
}

export const SECRET_RULES: readonly SecretRule[] = [
  { name: "firecrawl-key", regex: /\bfc-[A-Za-z0-9]{20,}\b/ },
  { name: "supabase-secret-key", regex: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: "supabase-access-token", regex: /\bsbp_[A-Za-z0-9]{20,}\b/ },
  { name: "jwt", regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: "openai-style-key", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "github-token", regex: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: "private-key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  {
    name: "env-assignment",
    regex: /^\s*(?:FIRECRAWL_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|MATRICULA_HMAC_SECRET|UPSTASH_REDIS_REST_TOKEN)\s*=\s*["']?[A-Za-z0-9_\-.]{16,}/,
  },
];

export interface SecretFinding {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly masked: string;
}

export function maskSecret(text: string): string {
  if (text.length <= 8) return "*".repeat(text.length);
  return `${text.slice(0, 4)}${"*".repeat(Math.min(12, text.length - 4))}`;
}

export function scanText(file: string, text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((content, index) => {
    for (const rule of SECRET_RULES) {
      const match = rule.regex.exec(content);
      if (match) findings.push({ file, line: index + 1, rule: rule.name, masked: maskSecret(match[0]) });
    }
  });
  return findings;
}

const BINARY_EXTENSIONS = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|gz|db|sqlite3?)$/i;

export function isScannable(path: string): boolean {
  return !BINARY_EXTENSIONS.test(path);
}
