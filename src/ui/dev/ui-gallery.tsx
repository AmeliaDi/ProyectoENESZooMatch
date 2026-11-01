"use client";

/**
 * Dev-only gallery of the Atlas design system: every kit component in every
 * state, the four theme modes, the 32-icon atlas at integer scales and a live
 * WCAG contrast table computed from the validated tokens.
 */

import { useId, useState, type ReactNode } from "react";

import { DESIGN_TOKENS, THEME_MODES, type ThemeMode } from "@/config";
import { contrastRatio } from "@/ui/design/contrast";
import { ICON_NAMES } from "@/ui/design/icons";
import { useThemeMode } from "@/ui/design/theme";
import { Button, IconButton } from "@/ui/kit/button";
import { Dialog } from "@/ui/kit/dialog";
import { Field } from "@/ui/kit/field";
import { Icon, IconAtlas } from "@/ui/kit/icon";
import { Likert } from "@/ui/kit/likert";
import { PixelSky } from "@/ui/kit/pixel-sky";
import { ConstellationProgress } from "@/ui/kit/progress";
import { EmptyState, ErrorState, LoadingState } from "@/ui/kit/states";
import { Chip, Frame, Tooltip } from "@/ui/kit/surfaces";
import { Tabs } from "@/ui/kit/tabs";
import { ToastStack, type ToastData } from "@/ui/kit/toast";

const MODE_LABEL: Record<ThemeMode, string> = {
  night: "Noche",
  day: "Día",
  "night-hc": "Noche · alto contraste",
  "day-hc": "Día · alto contraste",
};

const LIKERT_OPTIONS = [
  { value: 1, label: "Nada que ver conmigo" },
  { value: 2, label: "Poco" },
  { value: 3, label: "A veces" },
  { value: 4, label: "Bastante" },
  { value: 5, label: "Muy yo" },
] as const;

const SAMPLE_TOASTS: readonly ToastData[] = [
  { id: "t1", tone: "romance", title: "Hay química cerca", body: "Una afinidad romántica estimada apareció en tu cielo." },
  { id: "t2", tone: "amistad", title: "Nueva vibra amiga", body: "Alguien del campus resonó con tu energía." },
  { id: "t3", tone: "neutral", title: "Tu perfil ya brilla", body: "Te avisamos cuando alguien compatible llegue." },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4">
      <h2 className="font-pixel text-xl text-atlas-gold">{title}</h2>
      {children}
    </section>
  );
}

function ContrastTable({ mode }: { mode: ThemeMode }) {
  const { colors, highContrast } = DESIGN_TOKENS.modes[mode];
  const { contrast } = DESIGN_TOKENS;
  const rows = DESIGN_TOKENS.contrastPairs.flatMap((pair) =>
    pair.bg.map((bg) => {
      const min =
        pair.kind === "text"
          ? highContrast ? contrast.textHighContrast : contrast.text
          : highContrast ? contrast.uiHighContrast : contrast.ui;
      const ratio = contrastRatio(colors[pair.fg], colors[bg]);
      return { key: `${pair.fg}/${bg}`, fg: pair.fg, bg, kind: pair.kind, min, ratio, ok: ratio >= min };
    }),
  );
  return (
    <div className="overflow-x-auto">
      <table className="zm-contrast-table">
        <caption className="zm-sr-only">Contraste WCAG del modo {MODE_LABEL[mode]}</caption>
        <thead>
          <tr>
            <th scope="col">Texto / UI</th>
            <th scope="col">Fondo</th>
            <th scope="col">Muestra</th>
            <th scope="col">Razón</th>
            <th scope="col">Mínimo</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.fg}</td>
              <td>{row.bg}</td>
              <td>
                <span
                  className="zm-swatch"
                  style={{ color: colors[row.fg], background: colors[row.bg] }}
                >
                  {row.kind === "text" ? "Ñandú áéí" : "■■■"}
                </span>
              </td>
              <td>{row.ratio.toFixed(2)}</td>
              <td>{row.min}</td>
              <td>
                <Chip tone={row.ok ? "amistad" : "romance"} icon={row.ok ? "check" : "alert"}>
                  {row.ok ? "pasa" : "falla"}
                </Chip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UiGallery() {
  const [mode, setMode] = useThemeMode();
  const activeMode: ThemeMode = mode ?? "night";
  const [track, setTrack] = useState<"romance" | "amistad">("romance");
  const [likert, setLikert] = useState<number | null>(null);
  const [answered, setAnswered] = useState(12);
  const [dialog, setDialog] = useState<"sheet" | "modal" | null>(null);
  const [toasts, setToasts] = useState<readonly ToastData[]>(SAMPLE_TOASTS);
  const likertLabel = useId();

  return (
    <div className="zm-root relative min-h-dvh">
      <IconAtlas />
      <PixelSky className="fixed inset-0 -z-10" />
      <main className="relative mx-auto grid max-w-5xl gap-12 px-4 py-10">
        <header className="grid gap-3">
          <p className="font-pixel text-sm text-atlas-muted">dev · sistema de diseño</p>
          <h1 className="font-pixel text-3xl text-atlas-fg">Atlas de bolsillo</h1>
          <p className="max-w-prose text-atlas-muted">
            Todos los componentes del kit en sus estados, sobre el cielo real. Píxel lógico de{" "}
            {DESIGN_TOKENS.pixel.logicalPx} px; nada se escala con fracciones.
          </p>
          <Tabs
            label="Modo de color"
            idPrefix="gallery-mode"
            items={THEME_MODES.map((key) => ({ key, label: MODE_LABEL[key] }))}
            value={activeMode}
            onChange={(next) => setMode(next)}
          />
          <div>
            <Button variant="ghost" onClick={() => setMode(null)} icon="theme">
              Seguir al sistema
            </Button>
          </div>
        </header>

        <Section title="Botones">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" icon="quiz">Empezar el test</Button>
            <Button variant="secondary" iconAfter="next">Continuar</Button>
            <Button variant="ghost">Saltar</Button>
            <Button variant="danger" icon="delete">Borrar mis datos</Button>
            <Button variant="primary" disabled>Deshabilitado</Button>
            <Button variant="primary" busy>Guardando</Button>
            <IconButton icon="help" label="¿Cómo funciona?" />
            <IconButton icon="recenter" label="Recentrar" variant="secondary" />
          </div>
        </Section>

        <Section title="Chips y tooltip">
          <div className="flex flex-wrap items-center gap-3">
            <Chip>Neutral</Chip>
            <Chip tone="romance" icon="romance">Romance</Chip>
            <Chip tone="amistad" icon="amistad">Amistad</Chip>
            <Chip tone="gold" icon="confidence">Mismo humor</Chip>
            <Tooltip id="tip-demo" text="Afinidad estimada, no destino.">
              <IconButton icon="info" label="Qué significa" aria-describedby="tip-demo" />
            </Tooltip>
          </div>
        </Section>

        <Section title="Pestañas de pista">
          <Tabs
            label="Pista"
            idPrefix="gallery-track"
            items={[
              { key: "romance", label: "Romance", icon: "romance", tone: "romance" },
              { key: "amistad", label: "Amistad", icon: "amistad", tone: "amistad" },
            ]}
            value={track}
            onChange={setTrack}
          />
        </Section>

        <Section title="Marcos de atlas">
          <div className="grid gap-4 md:grid-cols-2">
            <Frame title="Lo que más conecta" coord="AR 04h · DEC +12°">
              <p className="text-atlas-muted">Marco base con escalón doble y marcas de graduación.</p>
            </Frame>
            <Frame title="Tensión sana" coord="AR 11h · DEC −03°" raised>
              <p className="text-atlas-muted">Variante elevada para paneles de detalle.</p>
            </Frame>
          </div>
        </Section>

        <Section title="Campos">
          <div className="grid max-w-md gap-4">
            <Field label="Matrícula" hint="Nunca se guarda ni se muestra: solo un resumen cifrado que no se puede revertir." />
            <Field label="Matrícula" error="Usa solo letras y números (de 4 a 32)." defaultValue="AB-" />
          </div>
        </Section>

        <Section title="Escala Likert">
          <Frame>
            <p id={likertLabel} className="mb-4 text-atlas-fg">
              Disfruto explorar ideas nuevas aunque no sirvan para nada práctico.
            </p>
            <Likert labelledBy={likertLabel} options={LIKERT_OPTIONS} value={likert} onChange={setLikert} />
          </Frame>
        </Section>

        <Section title="Progreso en constelación">
          <ConstellationProgress total={56} answered={answered} current={answered} />
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setAnswered((n) => Math.max(0, n - 1))}>Una menos</Button>
            <Button variant="secondary" onClick={() => setAnswered((n) => Math.min(56, n + 1))}>Una más</Button>
          </div>
        </Section>

        <Section title="Diálogos">
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setDialog("sheet")}>Abrir hoja inferior</Button>
            <Button variant="secondary" onClick={() => setDialog("modal")}>Abrir modal</Button>
          </div>
          <Dialog
            open={dialog !== null}
            kind={dialog ?? "sheet"}
            title={dialog === "modal" ? "¿Cómo se calcula?" : "Ajolotito esmeralda"}
            onClose={() => setDialog(null)}
          >
            <p className="text-atlas-muted">
              Contenido de ejemplo. Escape, el botón de cerrar o tocar fuera lo cierran; el foco regresa a donde estaba.
            </p>
          </Dialog>
        </Section>

        <Section title="Avisos">
          <ToastStack toasts={toasts} onDismiss={(id) => setToasts((list) => list.filter((t) => t.id !== id))} />
          <div>
            <Button variant="ghost" onClick={() => setToasts(SAMPLE_TOASTS)}>Restaurar avisos</Button>
          </div>
        </Section>

        <Section title="Estados">
          <div className="grid gap-4 md:grid-cols-3">
            <LoadingState />
            <EmptyState
              title="Tu cielo está tranquilo"
              body="Aún no llega alguien compatible. Tu nodo sigue brillando."
            />
            <ErrorState
              title="Se nubló la conexión"
              body="No pudimos cargar tu constelación. Intenta de nuevo en un momento."
              action={<Button variant="secondary" icon="recenter">Reintentar</Button>}
            />
          </div>
        </Section>

        <Section title={`Iconos (${ICON_NAMES.length})`}>
          {([1, 2, 3] as const).map((scale) => (
            <div key={scale} className="grid gap-2">
              <p className="font-pixel text-sm text-atlas-muted">×{scale}</p>
              <ul className="flex flex-wrap gap-3">
                {ICON_NAMES.map((name) => (
                  <li key={name} className="grid justify-items-center gap-1" title={name}>
                    <Icon name={name} scale={scale} filled />
                    {scale === 2 ? <span className="text-xs text-atlas-muted">{name}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Section>

        <Section title={`Contraste · ${MODE_LABEL[activeMode]}`}>
          <ContrastTable mode={activeMode} />
        </Section>
      </main>
    </div>
  );
}
