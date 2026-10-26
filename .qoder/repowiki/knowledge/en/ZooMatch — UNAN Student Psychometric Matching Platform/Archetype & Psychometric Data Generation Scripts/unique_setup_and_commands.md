Run from the repository root:
- `python scripts/generar_arquetipos.py [--offline] [-o data/arquetipos.json]` — fetches MBTI data from 16personalities.com unless `--offline` is given.
- `python scripts/generar_catalogo_v2.py` — generates `data/catalogo_arquetipos_v2.json` from embedded animal/color tables.
- `python scripts/recopilar_items.py --solo-validar` — validates `data/microtest_v1.json` without writing SQLite.
- `python scripts/recopilar_items.py --offline` — builds `data/preguntas.sqlite` using only approved local fallbacks.
- `python scripts/recopilar_items.py` — online mode that scrapes IPIP (Public Domain) and merges with local fallbacks.