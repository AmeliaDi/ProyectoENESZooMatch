"use client";

import { motion, useReducedMotion } from "framer-motion";

interface FoundationHeroProps {
  supabaseConfigured: boolean;
}

const specimens = [
  { code: "INTJ", animal: "Octopus", color: "Abyss blue", swatch: "#123B5D" },
  { code: "ENFP", animal: "Dolphin", color: "Sunlit teal", swatch: "#188F8B" },
  { code: "ISFP", animal: "Panda", color: "Soft jade", swatch: "#6F9275" },
] as const;

export function FoundationHero({ supabaseConfigured }: FoundationHeroProps) {
  const reduceMotion = useReducedMotion();
  const initial = reduceMotion ? false : { opacity: 0, y: 24 };

  return (
    <section className="relative min-h-screen overflow-hidden px-5 py-6 sm:px-8 lg:px-12">
      <div className="grain" aria-hidden="true" />
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1440px] flex-col border border-ink/20">
        <header className="flex items-center justify-between border-b border-ink/20 px-5 py-4 text-[0.68rem] font-semibold uppercase tracking-[0.24em] sm:px-8">
          <span>ZooMatch / Field Note 001</span>
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${supabaseConfigured ? "bg-leaf" : "bg-clay"}`}
            />
            Foundation ready
          </span>
        </header>

        <div className="grid flex-1 lg:grid-cols-[1.15fr_0.85fr]">
          <motion.div
            initial={initial}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col justify-between border-b border-ink/20 p-6 sm:p-10 lg:border-r lg:border-b-0 lg:p-14"
          >
            <div className="max-w-3xl">
              <p className="mb-8 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-clay">
                <span className="h-px w-10 bg-clay" />
                Personality, observed in the wild
              </p>
              <h1 className="text-balance font-display text-[clamp(4.25rem,10vw,9.5rem)] leading-[0.78] tracking-[-0.065em]">
                Your nature
                <span className="block pl-[0.32em] italic text-leaf">has a pattern.</span>
              </h1>
            </div>

            <div className="mt-16 grid gap-8 sm:grid-cols-[1fr_auto] sm:items-end">
              <p className="max-w-md text-pretty text-base leading-7 text-ink/70">
                A playful field guide mapping personality to an animal instinct and a
                color language—built from sixteen carefully curated archetypes.
              </p>
              <a
                href="#foundation"
                className="group inline-flex items-center gap-4 justify-self-start border-b border-ink pb-2 text-sm font-bold uppercase tracking-[0.16em]"
              >
                Begin the observation
                <span className="transition-transform duration-300 group-hover:translate-x-2" aria-hidden="true">
                  →
                </span>
              </a>
            </div>
          </motion.div>

          <motion.aside
            id="foundation"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduceMotion ? 0 : 0.25, duration: 0.65 }}
            className="relative flex min-h-[38rem] flex-col justify-center bg-moss p-6 text-paper sm:p-10 lg:p-14"
          >
            <div className="absolute right-8 top-7 font-display text-7xl italic text-paper/10" aria-hidden="true">
              16
            </div>
            <p className="mb-9 text-xs font-bold uppercase tracking-[0.22em] text-paper/60">
              Selected specimens
            </p>

            <div className="space-y-4">
              {specimens.map((specimen, index) => (
                <motion.article
                  key={specimen.code}
                  initial={reduceMotion ? false : { opacity: 0, x: 28 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: reduceMotion ? 0 : 0.45 + index * 0.12, duration: 0.5 }}
                  className="specimen-card grid grid-cols-[auto_1fr_auto] items-center gap-4 border border-paper/20 p-4 sm:p-5"
                >
                  <span
                    className="h-11 w-11 rounded-full border-4 border-paper/20"
                    style={{ backgroundColor: specimen.swatch }}
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-display text-2xl leading-none">{specimen.animal}</p>
                    <p className="mt-1 text-[0.65rem] uppercase tracking-[0.18em] text-paper/55">
                      {specimen.color}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-paper/60">{specimen.code}</span>
                </motion.article>
              ))}
            </div>

            <div className="mt-9 flex items-center justify-between border-t border-paper/20 pt-5 text-[0.65rem] uppercase tracking-[0.18em] text-paper/55">
              <span>16 archetypes catalogued</span>
              <span>Schema v1.0</span>
            </div>
          </motion.aside>
        </div>
      </div>
    </section>
  );
}