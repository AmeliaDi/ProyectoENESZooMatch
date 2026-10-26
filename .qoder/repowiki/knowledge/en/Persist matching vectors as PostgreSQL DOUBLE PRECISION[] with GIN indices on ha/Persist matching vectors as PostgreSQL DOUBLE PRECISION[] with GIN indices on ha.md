---
kind: design
name: Persist matching vectors as PostgreSQL DOUBLE PRECISION[] with GIN indices on hard-filter arrays
source: session
category: adr
---

# Persist matching vectors as PostgreSQL DOUBLE PRECISION[] with GIN indices on hard-filter arrays

_Source: coding plans from commit period a39d0b8 → 6e849fa — records intent at planning time; the implementation may lag or differ._

**Status:** accepted

## Context
With up to 300 concurrent users the system must compute ~44,850 pairs per track without latency. Storing raw Likert answers and recomputing vectors on each match query would be too slow; storing only MBTI codes loses the multidimensional signal needed for badges and narrative generation.

## Decision drivers
- sub-200ms match computation at 300 users
- fast hard-filter overlap queries
- dimension-level badge generation from normalized scores
- no runtime recomputation of vectors

## Considered options
- **Store JSONB vectors and compute cosine in application layer** _(rejected)_ — pros: flexible schema evolution; cons: N+1 queries, no DB-side index support for array math, slower at scale
- **Precompute a single flat similarity score table** _(rejected)_ — pros: simple reads; cons: cannot regenerate badges or reweight categories without full recompute; brittle if config changes
- **DOUBLE PRECISION[] vectors + GIN indexes on TEXT[] hard filters** — pros: vector math in SQL via unnest, GIN supports `&&` overlap for fast hard-filter pre-candidates, constraints enforce fixed lengths (22/18); cons: schema less flexible if dimensions change; migration cost to add/remove columns

## Decision
Create `profiles_v2` with `romance_vector DOUBLE PRECISION[]` and `amistad_vector DOUBLE PRECISION[]` constrained to lengths 22 and 18 respectively, plus `orientacion_sexual`, `identidad_genero`, `tipo_relacion_busca` TEXT[] columns indexed with GIN. Matching runs inside a Postgres function `public.compute_dual_matches` that uses CTEs and `unnest` for cosine similarity, keeping the whole dual-match computation in one RPC call.

## Consequences
Reads are O(1) after the initial pair scan; hard-filter pre-candidate reduction drops to <5ms via GIN. Changing the number of dimensions requires a migration and a constraint update rather than runtime schema drift. Vector storage trades write size for read speed and badge fidelity.