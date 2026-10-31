import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

// ─── Layer boundaries (docs/ARQUITECTURA.md §3) ─────────────────────────────
// domain ← application ← infrastructure ← app;  ui ← app.
// Only `src/config` may read data/*.json; everything else imports `@/config`.

const dataJson = {
  group: ["**/data/*.json"],
  message: "Lee los datos validados desde `@/config`, nunca el JSON crudo.",
};
const framework = {
  group: ["react", "react-dom", "next", "next/*", "framer-motion", "recharts"],
  message: "El dominio y la aplicación no dependen del framework de UI.",
};
const supabase = {
  group: ["@supabase/*"],
  message: "Solo `src/infrastructure` habla con Supabase.",
};
const layer = (name, message) => ({ group: [`@/${name}`, `@/${name}/*`], message });

const infrastructureLayer = layer("infrastructure", "Las capas internas no conocen adaptadores.");
const applicationLayer = layer(
  "application",
  "Esta capa no depende de casos de uso; comparte tipos vía `@/contracts`.",
);
const uiLayer = layer("ui", "El núcleo no importa componentes.");

function restrict(files, patterns) {
  return { files, rules: { "no-restricted-imports": ["error", { patterns }] } };
}

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([".next/**", "coverage/**", "next-env.d.ts"]),

  restrict(["src/**/*.{ts,tsx}"], [dataJson]),
  restrict(["src/domain/**/*.ts"], [
    dataJson, framework, supabase, applicationLayer, infrastructureLayer, uiLayer,
  ]),
  restrict(["src/contracts/**/*.ts"], [
    dataJson, framework, supabase, applicationLayer, infrastructureLayer, uiLayer,
  ]),
  restrict(["src/application/**/*.ts"], [
    dataJson, framework, supabase, infrastructureLayer, uiLayer,
  ]),
  restrict(["src/ui/**/*.{ts,tsx}"], [
    dataJson, supabase, applicationLayer, infrastructureLayer,
  ]),

  // The loader itself (and its tests, which corrupt raw fixtures on purpose).
  {
    files: ["src/config/*.ts"],
    rules: { "no-restricted-imports": "off" },
  },
]);
