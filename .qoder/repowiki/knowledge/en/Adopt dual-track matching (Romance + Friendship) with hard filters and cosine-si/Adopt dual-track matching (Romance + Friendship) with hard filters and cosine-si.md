---
kind: design
name: Adopt dual-track matching (Romance + Friendship) with hard filters and cosine-similarity vectors
source: session
category: adr
---

# Adopt dual-track matching (Romance + Friendship) with hard filters and cosine-similarity vectors

_Source: coding plans from commit period a39d0b8 → 6e849fa — records intent at planning time; the implementation may lag or differ._

**Status:** accepted

## Context
ZooMatch was a single-track matcher over 24 MBTI items. The redesign expands the questionnaire to ~60 items across six categories and needs to serve two distinct use cases: romantic pairing (with strict orientation/gender/relationship-type compatibility) and friendship pairing (pure chemistry). A single similarity vector cannot express different category weights for romance vs. friendship.

## Decision drivers
- separate semantics of romance vs. friendship
- hard-filter correctness for orientation/gender/relationship type
- configurable category weights per track
- cosine similarity on fixed-length arrays

## Considered options
- **Single similarity vector with a `track` flag** _(rejected)_ — pros: simpler schema, one scoring pass; cons: cannot apply different category weights or hard filters per track; requires branching logic in every query
- **Two separate questionnaires (one romance, one friendship)** _(rejected)_ — pros: clean separation; cons: doubles user effort (~120 items), breaks data sharing between tracks
- **Dual vectors stored alongside hard-filter arrays** — pros: single submission populates both tracks; romance pre-filters reduce candidate set before cosine; friendship scans all candidates; weights live in `matching-config-v2.json`; cons: larger profile row, more complex scoring code

## Decision
Store two fixed-length double-precision arrays per profile (`romance_vector`, length 22; `amistad_vector`, length 18) plus three TEXT[] hard-filter columns. Romance applies hard filters then cosine over personality+cultural+intimacy+values (weights 25/20/30/25); friendship skips hard filters and uses personality+cultural+values (40/35/25). Thresholds and dimension lists are externalized in `data/matching-config-v2.json`.

## Consequences
Scoring is split into two passes but remains a single RPC call (`compute_dual_matches`). Hard-filter compatibility (orientation, gender, relationship type) lives in typed TS functions (`isOrientationCompatible`, `isRelationshipCompatible`) and is also enforced via GIN indices on the TEXT[] columns. Adding a new track means adding a new vector column, a new weight map, and a new threshold — not a code path rewrite.