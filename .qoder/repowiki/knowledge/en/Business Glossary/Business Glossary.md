---
kind: business_term
name: Business Glossary
category: business_term
scope:
    - '**'
---

### arquetipos
- Definition：The curated dataset of 16 MBTI personality archetypes, each mapped to a Spanish diminutive animal name and a three-color palette; produced by `scripts/generar_arquetipos.py` and persisted at `data/arquetipos.json`. Each entry carries `codigo_mbti`, `sobrenombre`, `rol`, `rasgos`, `animal.diminutivo_es`, and `paleta`.
- Aliases：archetypes、MBTI arquetipos

### microtest
- Definition：The canonical 24-item psychometric questionnaire used by the project, split evenly across four categories (BigFive, MBTI, Relaciones, Genero), each item having a polarity and a single active weight vector over 19 dimensions. Stored at `data/microtest_v1.json` and validated by the data pipeline.
- Aliases：microtest_v1、cuestionario

### staging
- Definition：The intermediate SQLite table `staging_items` where raw scraped items land before curation; duplicates are linked via `duplicate_of`, and each row carries SHA-256 hashes of both raw and cleaned text plus provenance metadata.
- Aliases：tabla staging、staging_items

### items_curados
- Definition：The final curated items table in the SQLite staging database, keyed by stable `item_id`, holding normalized text, polarity, weights, source attribution, and a content hash that prevents re-insertion of identical items.
- Aliases：curated items、items_curados

### modo offline
- Definition：A pipeline execution mode (`--offline`) that skips all network calls and loads only the locally approved fallback items (original ZooMatch MBTI, Relaciones, and Genero items); contrasted with `online_con_fallback`, which attempts to download IPIP and falls back to local items on failure.
- Aliases：offline mode、--offline

### ZooMatch
- Definition：The internal product/project name (also the package name `enes-zoomatch`); refers to the MBTI-based student matching application whose data assets include the `arquetipos.json` archetype catalog and the original 24-item microtest.
- Aliases：ENES ZooMatch、enes-zoomatch
