# Datos externos

## OpenAlex

- URL: https://api.openalex.org/works
- Licencia: CC0 para los datos de OpenAlex.
- Fecha de consulta: 2026-10-26.
- Consultas: las cuatro consultas fijadas en `scripts/crawl_external.py`;
  una página de hasta 25 trabajos por consulta.
- Datos crudos: `data/external/raw/openalex_works.jsonl`, excluido de Git.
- Datos procesados: `data/external/processed/literature_signals.json`.
- Se conservan identificadores OpenAlex, DOI, título, año, citas, acceso
  abierto, nombre de la fuente y resumen; los resúmenes se limpian de correos
  y URL.

## OpenPsychometrics

- URL consultada: https://openpsychometrics.org/_rawdata/
- Enlace BIG5 encontrado: http://openpsychometrics.org/_rawdata/BIG5.zip.
- Licencia: la página consultada no mostró una declaración explícita de licencia
  que permita reutilizar y transformar los datos; no se encontró una línea de
  licencia que pueda citarse literalmente. Por ello el archivo no se descargó.
- Fecha de consulta: 2026-10-26.
- Resultado procesado: `data/external/processed/big5_norms.json` registra el
  estado `skipped` y la razón.
- No se guardaron respuestas ni columnas demográficas.

## Reproducción y exclusiones

```sh
python3 scripts/crawl_external.py openalex
python3 scripts/crawl_external.py openpsychometrics
python3 scripts/extract_signals.py
```

Las solicitudes usan el User-Agent `ZooMatch-research/0.1
(mailto:enorastrokes@gmail.com)`, revisan `robots.txt`, aplican pausas,
timeouts y reintentos. Si `robots.txt` no existe, el script lo registra y
continúa. Los archivos bajo `data/external/raw/` están ignorados por Git; sólo
se versionan los resultados procesados. No se recolectan foros, redes sociales,
sitios de citas ni perfiles personales.
