import Link from "next/link";

/** Shared Framer Motion easing curve for the public pages. */
export const ease = [0.22, 1, 0.36, 1] as const;

/** Session key set when the quiz was saved but the global recompute failed. */
export const RECOMPUTE_PENDING_KEY = "zoomatch:recompute-pending";

export type ApiError = "generic" | "session" | null;

export function BrandHeader({ step }: { step: string }) {
  return (
    <header className="relative z-20 flex items-center justify-between border-b border-ink/15 px-5 py-4 sm:px-8">
      <Link
        href="/"
        className="font-display text-xl font-semibold tracking-[-0.03em] outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-4 focus-visible:ring-offset-paper"
      >
        ZooMatch
      </Link>
      <span className="font-mono text-[0.63rem] font-semibold uppercase tracking-[0.2em] text-ink/55">
        {step}
      </span>
    </header>
  );
}

export function FieldMarks() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <span className="absolute -right-20 top-24 h-56 w-56 rounded-full border border-ink/10" />
      <span className="absolute -right-8 top-36 h-36 w-36 rounded-full border border-ink/10" />
      <span className="absolute bottom-14 left-5 font-display text-[8rem] leading-none text-ink/[0.035] sm:text-[13rem]">
        ZM
      </span>
    </div>
  );
}

export function AnalysisCreature() {
  return (
    <div className="analysis-creature" aria-hidden="true">
      <span className="analysis-ear analysis-ear-left" />
      <span className="analysis-ear analysis-ear-right" />
      <span className="analysis-eye analysis-eye-left" />
      <span className="analysis-eye analysis-eye-right" />
      <span className="analysis-nose" />
      <span className="analysis-tail" />
    </div>
  );
}

export function LoadingFrame({ label }: { label: string }) {
  return (
    <main className="public-shell grid min-h-screen place-items-center px-5">
      <div className="grain" aria-hidden="true" />
      <div role="status" className="relative z-10 text-center">
        <span
          className="mb-5 block h-10 w-10 animate-spin rounded-full border-2 border-ink/15 border-t-clay motion-reduce:animate-none"
          aria-hidden="true"
        />
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink/60">{label}</p>
      </div>
    </main>
  );
}
