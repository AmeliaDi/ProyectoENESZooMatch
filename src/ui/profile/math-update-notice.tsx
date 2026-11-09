"use client";

/**
 * Aviso de la nueva matemática (B9, ADR-052). T1 cambió solo el puntaje: se
 * recalcula en silencio y avisa con una línea, recordada por firma para que
 * nadie la vea dos veces ni la vea al llegar. T2/T3 cambió la medición: ahí sí
 * hay una afinación pendiente, opcional, y el perfil sigue en el pool sin ella.
 */
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

import { MATCHING_CONFIG } from "@/config";
import type { ProfileDto } from "@/contracts/profile";
import { scoringFirm } from "@/domain/matching/math-stamp";
import { Button } from "@/ui/kit/button";
import { Frame } from "@/ui/kit/surfaces";

const SCORING_KEY = "zm-math-scoring-firm";
const DISMISS_KEY = "zm-math-refine-seal";

export const MATH_NOTICE_COPY = {
  recomputed: "Tus cálculos se actualizaron con la nueva versión. No tienes que hacer nada.",
  refineTitle: "Actualizamos la matemática",
  refineBody:
    "Algunas preguntas cambiaron de redacción o de escala, así que puedes volver a responderlas. Tu perfil se sigue calculando con lo que ya contestaste.",
  refineCta: "Afinar mi perfil",
  dismiss: "Ahora no",
} as const;

export type MathNotice = "refine" | "recomputed" | null;

export function noticeFor(input: {
  firm: string;
  seenFirm: string | null;
  dismissedSeal: string | null;
  measurement: ProfileDto["measurement"];
}): MathNotice {
  const { stamped, current, seal } = input.measurement;
  if (stamped && !current && input.dismissedSeal !== seal) return "refine";
  // Sin firma vista aún no hay versión anterior que comparar: el aviso calla.
  if (input.seenFirm !== null && input.seenFirm !== input.firm) return "recomputed";
  return null;
}

const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento: el aviso vuelve la próxima vez, que es el modo seguro.
  }
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function MathUpdateNotice({ measurement }: { measurement: ProfileDto["measurement"] }) {
  const firm = scoringFirm(MATCHING_CONFIG);
  // En el servidor la firma "ya vista" es la vigente: nada de parpadeos en hidratación.
  const seenFirm = useSyncExternalStore(subscribe, () => read(SCORING_KEY), () => firm);
  const dismissedSeal = useSyncExternalStore(subscribe, () => read(DISMISS_KEY), () => measurement.seal);
  const notice = noticeFor({ firm, seenFirm, dismissedSeal, measurement });

  useEffect(() => {
    if (seenFirm === null) write(SCORING_KEY, firm);
  }, [seenFirm, firm]);

  if (notice === null) return null;

  if (notice === "recomputed") {
    return (
      <p className="zm-result__fine" role="status">
        {MATH_NOTICE_COPY.recomputed}
      </p>
    );
  }

  return (
    <Frame title={MATH_NOTICE_COPY.refineTitle}>
      <p className="zm-detail__muted">{MATH_NOTICE_COPY.refineBody}</p>
      <div className="zm-math__actions">
        <Link href="/afinar" className="zm-box zm-btn zm-btn--primary">
          {MATH_NOTICE_COPY.refineCta}
        </Link>
        <Button variant="ghost" onClick={() => write(DISMISS_KEY, measurement.seal)}>
          {MATH_NOTICE_COPY.dismiss}
        </Button>
      </div>
    </Frame>
  );
}
