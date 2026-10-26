---
kind: design
name: Generate animal/color archetypes combinatorially from a catalog rather than deriving them from quiz answers
source: session
category: adr
---

# Generate animal/color archetypes combinatorially from a catalog rather than deriving them from quiz answers

_Source: coding plans from commit period a39d0b8 → 6e849fa — records intent at planning time; the implementation may lag or differ._

**Status:** accepted

## Context
The old system used 16 MBTI-derived archetypes. The redesign wants 50+ animals × 50+ colors = 2,500+ unique visual profiles, each with a generated Spanish-language narrative paragraph. Deriving both animal and color deterministically from quiz answers risks producing awkward or non-existent combinations.

## Decision drivers
- rich visual variety (2,500+ combos)
- positive/poetic tone for user-facing narratives
- separation of identity (animal) from aesthetic (color)
- maintainable catalog of fauna and palettes

## Considered options
- **Derive animal and color directly from top quiz dimensions** _(rejected)_ — pros: fully deterministic from answers; cons: combinatorial explosion of mappings; hard to curate poetic narratives; risk of mismatched animal-color semantics
- **Catalog-driven selection: animal from personality affinities, color from cultural/intimacy affinity** — pros: curatable mapping tables, independent tuning of animal palette vs. color palette, narrative templates can reference both independently; cons: requires maintaining `catalogo_arquetipos_v2.json` and the Python generator script

## Decision
Run `scripts/generar_catalogo_v2.py` to produce `data/catalogo_arquetipos_v2.json` containing 55+ animals and 55+ colors with metadata (diminutivo_es, hex, textura, temperatura, categoria_fauna). At quiz completion, `profile-generator.ts` picks an animal based on dominant personality dimensions and a color based on cultural + intimacy affinity, then composes a narrative from ~200 combinable phrases. Catalog entries land in `animals` and `colors` tables referenced by `profiles_v2.animal_id` / `color_id`.

## Consequences
Animal and color selection are tunable without changing scoring code. The catalog is a data artifact regenerated from curated lists, decoupling content from algorithm. Narrative generation adds a small amount of CPU at quiz submit time but produces richer UI copy.