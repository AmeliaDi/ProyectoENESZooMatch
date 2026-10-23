"""Recopila y prepara ítems psicométricos con trazabilidad y licencias explícitas.

Ejecución desde la raíz del proyecto:
    # Valida el microtest sin red ni escritura de base de datos.
    python scripts/recopilar_items.py --solo-validar

    # Crea data/preguntas.sqlite usando únicamente fallbacks locales aprobados.
    python scripts/recopilar_items.py --offline

    # Consulta solamente IPIP (dominio público) y conserva el resultado en staging.
    python scripts/recopilar_items.py

OEJTS se registra como referencia CC BY-NC-SA, pero nunca se descarga ni se copia.
Los ítems de Relaciones, Genero y MBTI son originales y permanecen locales.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sqlite3
import sys
import unicodedata
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

RAIZ = Path(__file__).resolve().parents[1]
MICROTEST_PREDETERMINADO = RAIZ / "data" / "microtest_v1.json"
BASE_PREDETERMINADA = RAIZ / "data" / "preguntas.sqlite"

CATEGORIAS = ("BigFive", "MBTI", "Relaciones", "Genero")
POLARIDADES = ("positiva", "negativa")
DIMENSIONES = (
    "bigfive_apertura",
    "bigfive_responsabilidad",
    "bigfive_extraversion",
    "bigfive_amabilidad",
    "bigfive_neuroticismo",
    "mbti_extraversion",
    "mbti_intuicion",
    "mbti_pensamiento",
    "mbti_juicio",
    "relaciones_comunicacion",
    "relaciones_confianza",
    "relaciones_empatia",
    "relaciones_gestion_conflicto",
    "genero_igualdad",
    "genero_flexibilidad_roles",
    "genero_respeto_diversidad",
    "genero_corresponsabilidad",
)
IPIP_URL = "https://ipip.ori.org/new_ipip-50-item-scale.htm"
OEJTS_URL = "https://openpsychometrics.org/tests/OEJTS/development/"
TIMEOUT_PREDETERMINADO = (5.0, 20.0)

FUENTES_APROBADAS = {
    "ipip-50": {
        "nombre": "International Personality Item Pool: 50-item Sample Questionnaire",
        "url": IPIP_URL,
        "licencia": "Public Domain",
        "atribucion": "International Personality Item Pool (IPIP).",
        "automatizable": True,
        "politica": "Puede descargarse; los ítems y escalas IPIP son de dominio público.",
    },
    "oejts-referencia": {
        "nombre": "Open Extended Jungian Type Scales 1.2",
        "url": OEJTS_URL,
        "licencia": "CC BY-NC-SA",
        "atribucion": "Eric Jorgenson (2014), Development of the Open Extended Jungian Type Scales.",
        "automatizable": False,
        "politica": "Solo referencia metodológica; no descargar ni copiar ítems.",
    },
    "zoomatch-original-mbti": {
        "nombre": "Ítems MBTI originales de ZooMatch",
        "url": None,
        "licencia": "LicenseRef-ZooMatch-Original",
        "atribucion": "ZooMatch, 2026; redacción original, sin reproducir OEJTS.",
        "automatizable": False,
        "politica": "Fallback local original.",
    },
    "zoomatch-original-relaciones": {
        "nombre": "Ítems de relaciones originales de ZooMatch",
        "url": None,
        "licencia": "LicenseRef-ZooMatch-Original",
        "atribucion": "ZooMatch, 2026; redacción original, no derivada de escalas cerradas.",
        "automatizable": False,
        "politica": "Fallback local original.",
    },
    "zoomatch-original-genero": {
        "nombre": "Ítems de género originales de ZooMatch",
        "url": None,
        "licencia": "LicenseRef-ZooMatch-Original",
        "atribucion": "ZooMatch, 2026; redacción original e inclusiva.",
        "automatizable": False,
        "politica": "Fallback local original.",
    },
}


class ErrorPipeline(RuntimeError):
    """Error controlado de recopilación, licencia o persistencia."""


class ErrorValidacion(ValueError):
    """Error de contrato en el microtest estático."""


def ahora_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def crear_sesion() -> requests.Session:
    reintentos = Retry(
        total=4,
        connect=4,
        read=4,
        status=4,
        backoff_factor=0.8,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
        respect_retry_after_header=True,
        raise_on_status=False,
    )
    adaptador = HTTPAdapter(max_retries=reintentos, pool_connections=4, pool_maxsize=4)
    sesion = requests.Session()
    sesion.mount("https://", adaptador)
    sesion.mount("http://", adaptador)
    sesion.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.7",
            "Accept-Language": "es-MX,es;q=0.9,en-US;q=0.8,en;q=0.7",
            "Cache-Control": "no-cache",
            "DNT": "1",
        }
    )
    return sesion


def descargar_ipip(sesion: requests.Session, timeout_lectura: float) -> requests.Response:
    fuente = FUENTES_APROBADAS["ipip-50"]
    if not fuente["automatizable"] or fuente["licencia"] != "Public Domain":
        raise ErrorPipeline("La política de licencia actual no permite automatizar IPIP")
    try:
        respuesta = sesion.get(IPIP_URL, timeout=(TIMEOUT_PREDETERMINADO[0], timeout_lectura))
        respuesta.raise_for_status()
    except requests.RequestException as exc:
        raise ErrorPipeline(f"No se pudo descargar IPIP: {exc}") from exc
    tipo = respuesta.headers.get("Content-Type", "").lower()
    if "text/html" not in tipo and "application/xhtml+xml" not in tipo:
        raise ErrorPipeline(f"IPIP devolvió un tipo de contenido inesperado: {tipo or 'ausente'}")
    if len(respuesta.content) < 1_000:
        raise ErrorPipeline("IPIP devolvió una respuesta demasiado corta")
    return respuesta


def limpiar_texto(valor: str) -> str:
    sin_html = BeautifulSoup(html.unescape(valor), "html.parser").get_text(" ", strip=True)
    normalizado = unicodedata.normalize("NFC", sin_html)
    normalizado = re.sub(r"[\u200b-\u200d\ufeff]", "", normalizado)
    normalizado = re.sub(r"\s+", " ", normalizado).strip()
    return re.sub(r"^\d+[.)]\s*", "", normalizado)


def hash_texto(valor: str) -> str:
    material = limpiar_texto(valor).casefold().encode("utf-8")
    return hashlib.sha256(material).hexdigest()


def extraer_items_ipip(respuesta: requests.Response) -> list[dict[str, Any]]:
    if not respuesta.encoding or respuesta.encoding.lower() == "iso-8859-1":
        respuesta.encoding = respuesta.apparent_encoding or "windows-1252"
    soup = BeautifulSoup(respuesta.text, "html.parser")
    encontrados: list[dict[str, Any]] = []
    vistos: set[str] = set()

    for fila in soup.find_all("tr"):
        celdas = [limpiar_texto(celda.get_text(" ", strip=True)) for celda in fila.find_all(["td", "th"])]
        numero = next((re.sub(r"\D", "", c) for c in celdas if re.fullmatch(r"\d{1,3}[.)]?", c)), "")
        candidatos = [
            c
            for c in celdas
            if 5 <= len(c) <= 180
            and re.search(r"[A-Za-z]", c)
            and not re.fullmatch(r"(?:Very|Moderately|Neither|Accurate|Inaccurate|Factor|Item).*", c, re.I)
        ]
        if not numero or not candidatos:
            continue
        texto = max(candidatos, key=len)
        clave = next((c for c in reversed(celdas) if re.fullmatch(r"\(?[1-5][+-]\)?", c)), "")
        digest = hash_texto(texto)
        if digest in vistos:
            continue
        vistos.add(digest)
        encontrados.append(
            {
                "source_id": "ipip-50",
                "source_item_key": numero,
                "raw_text": texto,
                "category": "BigFive",
                "polarity": "negativa" if "-" in clave else "positiva",
                "weights": {},
                "retrieval_mode": "red_aprobada",
                "source_metadata": {"clave_ipip": clave or None},
            }
        )

    if len(encontrados) < 40:
        raise ErrorPipeline(
            f"La estructura HTML de IPIP no produjo suficientes ítems: {len(encontrados)} encontrados"
        )
    return encontrados


def cargar_microtest(ruta: Path) -> dict[str, Any]:
    try:
        with ruta.open("r", encoding="utf-8") as archivo:
            documento = json.load(archivo)
    except (OSError, json.JSONDecodeError) as exc:
        raise ErrorValidacion(f"No se pudo leer {ruta}: {exc}") from exc
    if not isinstance(documento, dict):
        raise ErrorValidacion("La raíz del microtest debe ser un objeto JSON")
    return documento


def validar_microtest(documento: dict[str, Any]) -> None:
    metadatos = documento.get("metadatos")
    escala = documento.get("escala_likert")
    dimensiones = documento.get("dimensiones")
    fuentes = documento.get("fuentes")
    items = documento.get("items")

    if not isinstance(metadatos, dict) or metadatos.get("total_items") != 24:
        raise ErrorValidacion("metadatos.total_items debe ser 24")
    if metadatos.get("items_por_categoria") != 6 or metadatos.get("categorias") != list(CATEGORIAS):
        raise ErrorValidacion("Las categorías deben ser exactamente BigFive, MBTI, Relaciones y Genero")
    if (
        not isinstance(escala, list)
        or not all(isinstance(opcion, dict) for opcion in escala)
        or [opcion.get("valor") for opcion in escala] != [1, 2, 3, 4]
    ):
        raise ErrorValidacion("La escala Likert debe contener exactamente los valores 1, 2, 3 y 4")
    if (
        not isinstance(dimensiones, list)
        or dimensiones != list(DIMENSIONES)
        or len(set(dimensiones)) != len(DIMENSIONES)
    ):
        raise ErrorValidacion("El catálogo de dimensiones no coincide con el contrato completo")
    if not isinstance(fuentes, list):
        raise ErrorValidacion("fuentes debe ser una lista")

    fuentes_por_id = {fuente.get("id"): fuente for fuente in fuentes if isinstance(fuente, dict)}
    if set(fuentes_por_id) != set(FUENTES_APROBADAS):
        raise ErrorValidacion("El microtest no declara exactamente las fuentes aprobadas")
    if fuentes_por_id["ipip-50"].get("licencia") != "Public Domain":
        raise ErrorValidacion("IPIP debe conservar su declaración de dominio público")
    oejts = fuentes_por_id["oejts-referencia"]
    if oejts.get("licencia") != "CC BY-NC-SA" or "sin copiar" not in oejts.get("automatizacion", ""):
        raise ErrorValidacion("OEJTS debe ser solo referencia CC BY-NC-SA sin copia automática")

    if not isinstance(items, list) or len(items) != 24:
        raise ErrorValidacion("El microtest debe contener exactamente 24 ítems")
    conteos = Counter(item.get("categoria") for item in items if isinstance(item, dict))
    if conteos != Counter({categoria: 6 for categoria in CATEGORIAS}):
        raise ErrorValidacion(f"Cada categoría debe contener seis ítems; conteo actual: {dict(conteos)}")

    ids: set[str] = set()
    hashes: set[str] = set()
    for indice, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            raise ErrorValidacion(f"El ítem {indice} no es un objeto")
        item_id = item.get("id")
        categoria = item.get("categoria")
        texto = item.get("texto")
        polaridad = item.get("polaridad")
        pesos = item.get("pesos")
        fuente_id = item.get("fuente_id")
        if not isinstance(item_id, str) or not re.fullmatch(r"(?:BF|MB|RE|GE)\d{2}", item_id):
            raise ErrorValidacion(f"ID inválido en el ítem {indice}: {item_id}")
        if item_id in ids:
            raise ErrorValidacion(f"ID duplicado: {item_id}")
        if categoria not in CATEGORIAS:
            raise ErrorValidacion(f"Categoría inválida en {item_id}: {categoria}")
        if not isinstance(texto, str) or len(limpiar_texto(texto)) < 12:
            raise ErrorValidacion(f"Texto vacío o demasiado corto en {item_id}")
        digest = hash_texto(texto)
        if digest in hashes:
            raise ErrorValidacion(f"Texto duplicado detectado en {item_id}")
        if polaridad not in POLARIDADES:
            raise ErrorValidacion(f"Polaridad inválida en {item_id}: {polaridad}")
        if not isinstance(pesos, dict) or list(pesos) != list(DIMENSIONES):
            raise ErrorValidacion(f"El vector de {item_id} no contiene todas las dimensiones en orden")
        if any(type(valor) not in (int, float) or valor < -1 or valor > 1 for valor in pesos.values()):
            raise ErrorValidacion(f"Pesos fuera del intervalo [-1, 1] en {item_id}")
        activos = [valor for valor in pesos.values() if valor != 0]
        if len(activos) != 1 or activos[0] not in (-1, 1):
            raise ErrorValidacion(f"{item_id} debe tener exactamente un peso activo de -1 o 1")
        if (polaridad == "positiva" and activos[0] != 1) or (polaridad == "negativa" and activos[0] != -1):
            raise ErrorValidacion(f"La polaridad y el peso activo no coinciden en {item_id}")
        if fuente_id not in fuentes_por_id or fuente_id == "oejts-referencia":
            raise ErrorValidacion(f"Fuente ausente o no utilizable en {item_id}: {fuente_id}")
        ids.add(item_id)
        hashes.add(digest)


def items_locales(documento: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "source_id": item["fuente_id"],
            "source_item_key": item["id"],
            "raw_text": item["texto"],
            "category": item["categoria"],
            "polarity": item["polaridad"],
            "weights": item["pesos"],
            "retrieval_mode": "fallback_local_aprobado",
            "source_metadata": {"microtest_version": documento["metadatos"]["version"]},
        }
        for item in documento["items"]
    ]


ESQUEMA_SQL = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS fuentes (
    source_id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    url TEXT,
    licencia TEXT NOT NULL,
    atribucion TEXT NOT NULL,
    automatizable INTEGER NOT NULL CHECK (automatizable IN (0, 1)),
    politica TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ejecuciones (
    run_id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    mode TEXT NOT NULL CHECK (mode IN ('online_con_fallback', 'offline')),
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
    network_error TEXT,
    staged_count INTEGER NOT NULL DEFAULT 0,
    curated_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS staging_items (
    staging_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES ejecuciones(run_id),
    source_id TEXT NOT NULL REFERENCES fuentes(source_id),
    source_item_key TEXT NOT NULL,
    source_url TEXT,
    license_id TEXT NOT NULL,
    attribution TEXT NOT NULL,
    retrieval_mode TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('BigFive', 'MBTI', 'Relaciones', 'Genero')),
    polarity TEXT NOT NULL CHECK (polarity IN ('positiva', 'negativa')),
    raw_text TEXT NOT NULL,
    cleaned_text TEXT NOT NULL,
    raw_sha256 TEXT NOT NULL,
    cleaned_sha256 TEXT NOT NULL,
    weights_json TEXT NOT NULL,
    source_metadata_json TEXT NOT NULL,
    duplicate_of INTEGER REFERENCES staging_items(staging_id)
);
CREATE INDEX IF NOT EXISTS idx_staging_run_hash ON staging_items(run_id, cleaned_sha256);
CREATE VIEW IF NOT EXISTS staging_items_unicos AS
    SELECT * FROM staging_items WHERE duplicate_of IS NULL;
CREATE TABLE IF NOT EXISTS items_curados (
    item_id TEXT PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('BigFive', 'MBTI', 'Relaciones', 'Genero')),
    text TEXT NOT NULL,
    polarity TEXT NOT NULL CHECK (polarity IN ('positiva', 'negativa')),
    weights_json TEXT NOT NULL,
    source_id TEXT NOT NULL REFERENCES fuentes(source_id),
    content_sha256 TEXT NOT NULL UNIQUE,
    microtest_version TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def abrir_base(ruta: Path) -> sqlite3.Connection:
    ruta = ruta.expanduser().resolve()
    ruta.parent.mkdir(parents=True, exist_ok=True)
    conexion = sqlite3.connect(ruta, timeout=30)
    conexion.row_factory = sqlite3.Row
    conexion.execute("PRAGMA busy_timeout = 30000")
    conexion.execute("PRAGMA journal_mode = WAL")
    conexion.executescript(ESQUEMA_SQL)
    return conexion


def registrar_fuentes(conexion: sqlite3.Connection) -> None:
    for source_id, fuente in FUENTES_APROBADAS.items():
        conexion.execute(
            """
            INSERT INTO fuentes(source_id, nombre, url, licencia, atribucion, automatizable, politica)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_id) DO UPDATE SET
                nombre=excluded.nombre, url=excluded.url, licencia=excluded.licencia,
                atribucion=excluded.atribucion, automatizable=excluded.automatizable,
                politica=excluded.politica
            """,
            (
                source_id,
                fuente["nombre"],
                fuente["url"],
                fuente["licencia"],
                fuente["atribucion"],
                int(fuente["automatizable"]),
                fuente["politica"],
            ),
        )


def guardar_staging(
    conexion: sqlite3.Connection,
    run_id: str,
    registros: Iterable[dict[str, Any]],
) -> int:
    hashes_vistos: dict[str, int] = {}
    cantidad = 0
    for registro in registros:
        fuente = FUENTES_APROBADAS[registro["source_id"]]
        texto_crudo = str(registro["raw_text"])
        texto_limpio = limpiar_texto(texto_crudo)
        hash_limpio = hash_texto(texto_limpio)
        cursor = conexion.execute(
            """
            INSERT INTO staging_items(
                run_id, source_id, source_item_key, source_url, license_id, attribution,
                retrieval_mode, fetched_at, category, polarity, raw_text, cleaned_text,
                raw_sha256, cleaned_sha256, weights_json, source_metadata_json, duplicate_of
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                registro["source_id"],
                str(registro["source_item_key"]),
                fuente["url"],
                fuente["licencia"],
                fuente["atribucion"],
                registro["retrieval_mode"],
                ahora_iso(),
                registro["category"],
                registro["polarity"],
                texto_crudo,
                texto_limpio,
                hashlib.sha256(texto_crudo.encode("utf-8")).hexdigest(),
                hash_limpio,
                json.dumps(registro["weights"], ensure_ascii=False, sort_keys=True),
                json.dumps(registro["source_metadata"], ensure_ascii=False, sort_keys=True),
                hashes_vistos.get(hash_limpio),
            ),
        )
        staging_id = int(cursor.lastrowid)
        hashes_vistos.setdefault(hash_limpio, staging_id)
        cantidad += 1
    return cantidad


def guardar_curados(conexion: sqlite3.Connection, documento: dict[str, Any]) -> int:
    marca = ahora_iso()
    version = documento["metadatos"]["version"]
    for item in documento["items"]:
        conexion.execute(
            """
            INSERT INTO items_curados(
                item_id, category, text, polarity, weights_json, source_id,
                content_sha256, microtest_version, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(item_id) DO UPDATE SET
                category=excluded.category, text=excluded.text, polarity=excluded.polarity,
                weights_json=excluded.weights_json, source_id=excluded.source_id,
                content_sha256=excluded.content_sha256,
                microtest_version=excluded.microtest_version, updated_at=excluded.updated_at
            """,
            (
                item["id"],
                item["categoria"],
                limpiar_texto(item["texto"]),
                item["polaridad"],
                json.dumps(item["pesos"], ensure_ascii=False),
                item["fuente_id"],
                hash_texto(item["texto"]),
                version,
                marca,
            ),
        )
    return len(documento["items"])


def ejecutar_pipeline(
    documento: dict[str, Any],
    ruta_db: Path,
    offline: bool,
    timeout_lectura: float,
) -> tuple[int, int, str | None]:
    run_id = str(uuid.uuid4())
    modo = "offline" if offline else "online_con_fallback"
    registros = items_locales(documento)
    error_red: str | None = None

    if not offline:
        sesion = crear_sesion()
        try:
            registros = extraer_items_ipip(descargar_ipip(sesion, timeout_lectura)) + registros
        except ErrorPipeline as exc:
            error_red = str(exc)
            print(f"Aviso: {exc}. Se conservarán los fallbacks locales.", file=sys.stderr)
        finally:
            sesion.close()

    conexion = abrir_base(ruta_db)
    try:
        with conexion:
            registrar_fuentes(conexion)
            conexion.execute(
                "INSERT INTO ejecuciones(run_id, started_at, mode, status) VALUES (?, ?, ?, 'running')",
                (run_id, ahora_iso(), modo),
            )
            staged = guardar_staging(conexion, run_id, registros)
            curated = guardar_curados(conexion, documento)
            conexion.execute(
                """
                UPDATE ejecuciones
                SET finished_at=?, status='completed', network_error=?, staged_count=?, curated_count=?
                WHERE run_id=?
                """,
                (ahora_iso(), error_red, staged, curated, run_id),
            )
    except Exception:
        try:
            with conexion:
                conexion.execute(
                    """
                    UPDATE ejecuciones SET finished_at=?, status='failed', network_error=?
                    WHERE run_id=?
                    """,
                    (ahora_iso(), "Error de persistencia", run_id),
                )
        except sqlite3.Error:
            pass
        raise
    finally:
        conexion.close()
    return staged, curated, error_red


def crear_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Recopila ítems aprobados, conserva staging trazable y genera preguntas.sqlite.",
        epilog=(
            "Ejemplos: --solo-validar | --offline | "
            "--db data/preguntas.sqlite --microtest data/microtest_v1.json"
        ),
    )
    parser.add_argument(
        "--microtest",
        type=Path,
        default=MICROTEST_PREDETERMINADO,
        help="JSON canónico de 24 ítems usado también como fallback local.",
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=BASE_PREDETERMINADA,
        help="Ruta de la base SQLite de staging y datos curados.",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="No usa red; carga exclusivamente los fallbacks originales/aprobados.",
    )
    parser.add_argument(
        "--solo-validar",
        action="store_true",
        help="Valida JSON, IDs, conteos, pesos y unicidad sin escribir SQLite.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=TIMEOUT_PREDETERMINADO[1],
        help="Timeout de lectura HTTP en segundos (predeterminado: 20).",
    )
    return parser


def main() -> int:
    parser = crear_parser()
    args = parser.parse_args()
    if args.timeout <= 0 or args.timeout > 120:
        parser.error("--timeout debe estar entre 0 y 120 segundos")
    try:
        documento = cargar_microtest(args.microtest)
        validar_microtest(documento)
        if args.solo_validar:
            print("Validación correcta: 24 ítems únicos, seis por categoría y vectores completos.")
            return 0
        staged, curated, error_red = ejecutar_pipeline(documento, args.db, args.offline, args.timeout)
    except (ErrorPipeline, ErrorValidacion, OSError, sqlite3.Error) as exc:
        parser.exit(1, f"Error: {exc}\n")
    estado_red = "fallback por error de red" if error_red else ("offline" if args.offline else "IPIP recopilado")
    print(f"Pipeline completado: {staged} en staging, {curated} curados, modo {estado_red}.")
    print(f"SQLite: {args.db}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
