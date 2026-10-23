from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
import unicodedata
from copy import deepcopy
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

PERSONALIDADES_URL = "https://www.16personalities.com/for-ai.json"
ANIMALES_URL = "https://pigment.is/blogs/blogs/mbti-test-animal-version"
CODIGOS_ESPERADOS = (
    "INTJ", "INTP", "ENTJ", "ENTP",
    "INFJ", "INFP", "ENFJ", "ENFP",
    "ISTJ", "ISFJ", "ESTJ", "ESFJ",
    "ISTP", "ISFP", "ESTP", "ESFP",
)
PATRON_HEX = re.compile(r"^#[0-9A-F]{6}$")

PERSONALIDADES_FALLBACK = [
    {"code": "INTJ", "nickname": "Architect", "role": "Analysts", "traits": ["Introverted", "Intuitive", "Thinking", "Judging"]},
    {"code": "INTP", "nickname": "Logician", "role": "Analysts", "traits": ["Introverted", "Intuitive", "Thinking", "Prospecting"]},
    {"code": "ENTJ", "nickname": "Commander", "role": "Analysts", "traits": ["Extraverted", "Intuitive", "Thinking", "Judging"]},
    {"code": "ENTP", "nickname": "Debater", "role": "Analysts", "traits": ["Extraverted", "Intuitive", "Thinking", "Prospecting"]},
    {"code": "INFJ", "nickname": "Advocate", "role": "Diplomats", "traits": ["Introverted", "Intuitive", "Feeling", "Judging"]},
    {"code": "INFP", "nickname": "Mediator", "role": "Diplomats", "traits": ["Introverted", "Intuitive", "Feeling", "Prospecting"]},
    {"code": "ENFJ", "nickname": "Protagonist", "role": "Diplomats", "traits": ["Extraverted", "Intuitive", "Feeling", "Judging"]},
    {"code": "ENFP", "nickname": "Campaigner", "role": "Diplomats", "traits": ["Extraverted", "Intuitive", "Feeling", "Prospecting"]},
    {"code": "ISTJ", "nickname": "Logistician", "role": "Sentinels", "traits": ["Introverted", "Observant", "Thinking", "Judging"]},
    {"code": "ISFJ", "nickname": "Defender", "role": "Sentinels", "traits": ["Introverted", "Observant", "Feeling", "Judging"]},
    {"code": "ESTJ", "nickname": "Executive", "role": "Sentinels", "traits": ["Extraverted", "Observant", "Thinking", "Judging"]},
    {"code": "ESFJ", "nickname": "Consul", "role": "Sentinels", "traits": ["Extraverted", "Observant", "Feeling", "Judging"]},
    {"code": "ISTP", "nickname": "Virtuoso", "role": "Explorers", "traits": ["Introverted", "Observant", "Thinking", "Prospecting"]},
    {"code": "ISFP", "nickname": "Adventurer", "role": "Explorers", "traits": ["Introverted", "Observant", "Feeling", "Prospecting"]},
    {"code": "ESTP", "nickname": "Entrepreneur", "role": "Explorers", "traits": ["Extraverted", "Observant", "Thinking", "Prospecting"]},
    {"code": "ESFP", "nickname": "Entertainer", "role": "Explorers", "traits": ["Extraverted", "Observant", "Feeling", "Prospecting"]},
]

ANIMALES_FALLBACK = {
    "INTJ": "Octopus", "INTP": "Owl", "ENTJ": "Lion", "ENTP": "Fox",
    "INFJ": "Wolf", "INFP": "Deer", "ENFJ": "Dog", "ENFP": "Dolphin",
    "ISTJ": "Ant", "ISFJ": "Elephant", "ESTJ": "Meerkat", "ESFJ": "Whale",
    "ISTP": "Cat", "ISFP": "Panda", "ESTP": "Cheetah", "ESFP": "Otter",
}

DIMINUTIVOS = {
    "INTJ": "pulpito", "INTP": "buhíto", "ENTJ": "leoncito", "ENTP": "zorrito",
    "INFJ": "lobito", "INFP": "venadito", "ENFJ": "perrito", "ENFP": "delfincito",
    "ISTJ": "hormiguita", "ISFJ": "elefantito", "ESTJ": "suricatita", "ESFJ": "ballenita",
    "ISTP": "gatito", "ISFP": "pandita", "ESTP": "guepardito", "ESFP": "nutriita",
}

PALETAS_CURADAS = {
    "INTJ": [("Azul abisal", "#123B5D"), ("Tinta marina", "#0B1F33"), ("Coral lúcido", "#FF7A59")],
    "INTP": [("Índigo nocturno", "#3943B7"), ("Niebla lavanda", "#C9C7F2"), ("Pergamino", "#F3E9D2")],
    "ENTJ": [("Granate imperial", "#7A1E2C"), ("Oro viejo", "#C89B3C"), ("Carbón", "#242124")],
    "ENTP": [("Mandarina eléctrica", "#F05D23"), ("Azul cobalto", "#2255A4"), ("Crema", "#FFF1D0")],
    "INFJ": [("Verde bosque", "#245C43"), ("Malva", "#9B7E9B"), ("Luz lunar", "#E8E4D9")],
    "INFP": [("Rosa brezo", "#B85C7A"), ("Salvia", "#8AA17B"), ("Marfil", "#FFF8E7")],
    "ENFJ": [("Frambuesa", "#C73558"), ("Ámbar cálido", "#E6A33D"), ("Azul abrazo", "#3E6B89")],
    "ENFP": [("Amarillo sol", "#F4C430"), ("Turquesa viva", "#1FA6A0"), ("Coral fiesta", "#F26B5B")],
    "ISTJ": [("Azul pizarra", "#40566B"), ("Gris acero", "#788896"), ("Blanco papel", "#F5F3EE")],
    "ISFJ": [("Verde eucalipto", "#5F7F6A"), ("Rosa arcilla", "#C98F83"), ("Avena", "#E8DCC4")],
    "ESTJ": [("Azul uniforme", "#214E78"), ("Rojo sello", "#A33A32"), ("Arena", "#D8C3A5")],
    "ESFJ": [("Coral amable", "#E76F51"), ("Azul cielo", "#63A4C5"), ("Miel", "#E9B44C")],
    "ISTP": [("Grafito", "#343A40"), ("Cobre", "#B66A3C"), ("Hielo", "#DCE6EA")],
    "ISFP": [("Jade suave", "#5B8E7D"), ("Melocotón", "#F2B5A7"), ("Ciruela", "#6D466B")],
    "ESTP": [("Rojo cinético", "#D62828"), ("Negro pista", "#1D1D1D"), ("Lima", "#A7C957")],
    "ESFP": [("Fucsia tropical", "#D1498B"), ("Aguamarina", "#2FB5A9"), ("Mango", "#FFB703")],
}


class ErrorFuente(RuntimeError):
    pass


class ErrorValidacion(ValueError):
    pass


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
    )
    adaptador = HTTPAdapter(max_retries=reintentos)
    sesion = requests.Session()
    sesion.mount("https://", adaptador)
    sesion.mount("http://", adaptador)
    sesion.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
        "Accept": "application/json,text/html,application/xhtml+xml;q=0.9,*/*;q=0.7",
        "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
    })
    return sesion


def descargar(sesion: requests.Session, url: str, tipo: str) -> requests.Response:
    try:
        respuesta = sesion.get(url, timeout=(5, 20))
        respuesta.raise_for_status()
    except requests.RequestException as exc:
        raise ErrorFuente(f"No se pudo descargar {url}: {exc}") from exc

    contenido = respuesta.content
    if len(contenido) < 100:
        raise ErrorFuente(f"La respuesta de {url} está vacía o es demasiado corta")

    content_type = respuesta.headers.get("Content-Type", "").lower()
    valido = (
        tipo == "json" and ("application/json" in content_type or "+json" in content_type)
    ) or (
        tipo == "html" and ("text/html" in content_type or "application/xhtml+xml" in content_type)
    )
    if not valido:
        raise ErrorFuente(f"Tipo de contenido inesperado en {url}: {content_type or 'ausente'}")
    return respuesta


def validar_personalidades(personalidades: list[dict[str, Any]]) -> None:
    if len(personalidades) != 16:
        raise ErrorValidacion(f"Se esperaban 16 personalidades y se recibieron {len(personalidades)}")
    codigos = [str(item.get("code", "")).upper() for item in personalidades]
    if set(codigos) != set(CODIGOS_ESPERADOS) or len(set(codigos)) != 16:
        raise ErrorValidacion("Los códigos de personalidad no coinciden con los 16 códigos esperados")
    for item in personalidades:
        if not isinstance(item.get("nickname"), str) or not item["nickname"].strip():
            raise ErrorValidacion(f"Sobrenombre inválido para {item.get('code', 'código desconocido')}")
        if not isinstance(item.get("role"), str) or not item["role"].strip():
            raise ErrorValidacion(f"Rol inválido para {item.get('code', 'código desconocido')}")
        rasgos = item.get("traits")
        if not isinstance(rasgos, list) or len(rasgos) != 4 or not all(isinstance(r, str) and r for r in rasgos):
            raise ErrorValidacion(f"Rasgos inválidos para {item.get('code', 'código desconocido')}")


def obtener_personalidades(sesion: requests.Session | None, offline: bool) -> tuple[list[dict[str, Any]], str]:
    if offline:
        return deepcopy(PERSONALIDADES_FALLBACK), "fallback_local_modo_offline"
    try:
        if sesion is None:
            raise ErrorFuente("No hay una sesión HTTP disponible")
        respuesta = descargar(sesion, PERSONALIDADES_URL, "json")
        documento = respuesta.json()
        if not isinstance(documento, dict) or not isinstance(documento.get("types"), list):
            raise ErrorFuente("El JSON de 16Personalities no contiene una lista 'types'")
        personalidades = documento["types"]
        validar_personalidades(personalidades)
        return personalidades, "extraido_en_red"
    except (ErrorFuente, ErrorValidacion, requests.JSONDecodeError, ValueError) as exc:
        print(f"Aviso: {exc}. Se usará el fallback local de personalidades.", file=sys.stderr)
        return deepcopy(PERSONALIDADES_FALLBACK), "fallback_local_por_error"


def normalizar_encabezado(valor: str) -> str:
    return re.sub(r"[^a-z]", "", unicodedata.normalize("NFKD", valor).encode("ascii", "ignore").decode().lower())


def extraer_animales_html(html: str) -> dict[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    for tabla in soup.find_all("table"):
        filas = tabla.find_all("tr")
        if not filas:
            continue
        encabezados = [normalizar_encabezado(c.get_text(" ", strip=True)) for c in filas[0].find_all(["th", "td"])]
        try:
            indice_tipo = encabezados.index("type")
            indice_animal = encabezados.index("animal")
        except ValueError:
            continue
        encontrados: dict[str, str] = {}
        for fila in filas[1:]:
            celdas = fila.find_all(["th", "td"])
            if max(indice_tipo, indice_animal) >= len(celdas):
                continue
            codigo = celdas[indice_tipo].get_text(" ", strip=True).upper()
            animal = celdas[indice_animal].get_text(" ", strip=True)
            if codigo in CODIGOS_ESPERADOS and animal:
                encontrados[codigo] = animal
        if set(encontrados) == set(CODIGOS_ESPERADOS):
            return encontrados
    raise ErrorFuente("No se encontró una tabla HTML completa con las columnas Type y Animal")


def obtener_animales(sesion: requests.Session | None, offline: bool) -> tuple[dict[str, str], str]:
    if offline:
        return dict(ANIMALES_FALLBACK), "fallback_local_modo_offline"
    try:
        if sesion is None:
            raise ErrorFuente("No hay una sesión HTTP disponible")
        respuesta = descargar(sesion, ANIMALES_URL, "html")
        return extraer_animales_html(respuesta.text), "extraido_de_tabla_html"
    except (ErrorFuente, ValueError) as exc:
        print(f"Aviso: {exc}. Se usará el fallback local de animales.", file=sys.stderr)
        return dict(ANIMALES_FALLBACK), "fallback_local_por_error"


def slugificar(valor: str) -> str:
    ascii_texto = unicodedata.normalize("NFKD", valor).encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "-", ascii_texto).strip("-") or "arquetipo"


def generar_identificador_unico(
    animal: str,
    color: str,
    usados: set[str],
    clave_estable: str,
) -> str:
    base = slugificar(f"{animal}-{color}")
    if base not in usados:
        usados.add(base)
        return base

    material = f"{animal.casefold()}|{color.casefold()}|{clave_estable.casefold()}"
    digest = hashlib.sha256(material.encode("utf-8")).hexdigest()
    for longitud in range(8, 65, 4):
        candidato = f"{base}-{digest[:longitud]}"
        if candidato not in usados:
            usados.add(candidato)
            return candidato

    contador = 1
    while True:
        digest_contador = hashlib.sha256(f"{material}|{contador}".encode("utf-8")).hexdigest()
        candidato = f"{base}-{digest_contador}-{contador:x}"
        if candidato not in usados:
            usados.add(candidato)
            return candidato
        contador += 1


def construir_documento(
    personalidades: list[dict[str, Any]],
    animales: dict[str, str],
    estado_personalidades: str,
    estado_animales: str,
    offline: bool,
) -> dict[str, Any]:
    validar_personalidades(personalidades)
    if set(animales) != set(CODIGOS_ESPERADOS):
        raise ErrorValidacion("El mapa de animales no contiene exactamente los 16 códigos esperados")

    por_codigo = {item["code"].upper(): item for item in personalidades}
    ids_usados: set[str] = set()
    arquetipos = []
    for codigo in CODIGOS_ESPERADOS:
        personalidad = por_codigo[codigo]
        diminutivo = DIMINUTIVOS[codigo]
        paleta = [{"nombre": nombre, "hex": hexadecimal} for nombre, hexadecimal in PALETAS_CURADAS[codigo]]
        color_principal = dict(paleta[0])
        combinacion = f"{diminutivo} {color_principal['nombre'].lower()}"
        identificador = generar_identificador_unico(
            diminutivo,
            color_principal["nombre"],
            ids_usados,
            codigo,
        )
        arquetipos.append({
            "id": identificador,
            "codigo_mbti": codigo,
            "sobrenombre": personalidad["nickname"],
            "rol": personalidad["role"],
            "rasgos": personalidad["traits"],
            "animal": {
                "nombre_fuente": animales[codigo],
                "diminutivo_es": diminutivo,
            },
            "paleta": paleta,
            "color_principal": color_principal,
            "combinacion_legible": combinacion,
        })

    documento = {
        "metadatos": {
            "version_esquema": "1.0",
            "total_arquetipos": len(arquetipos),
            "modo": "offline" if offline else "red_con_fallback",
            "fuentes": {
                "personalidades": {
                    "url": PERSONALIDADES_URL,
                    "estado": estado_personalidades,
                    "campos": ["codigo", "sobrenombre", "rol", "rasgos"],
                },
                "animales": {
                    "url": ANIMALES_URL,
                    "estado": estado_animales,
                    "metodo": "tabla HTML con fallback local completo",
                },
                "paletas": {
                    "origen": "curadas_localmente",
                    "extraidas": False,
                    "nota": "Paletas creadas para este proyecto; paletadecolores.org no fue consultado ni scrapeado.",
                },
            },
        },
        "arquetipos": arquetipos,
    }
    validar_documento(documento)
    return documento


def validar_documento(documento: dict[str, Any]) -> None:
    arquetipos = documento.get("arquetipos")
    if not isinstance(arquetipos, list) or len(arquetipos) != 16:
        raise ErrorValidacion("El documento debe contener exactamente 16 arquetipos")

    codigos: set[str] = set()
    ids: set[str] = set()
    combinaciones: set[str] = set()
    for registro in arquetipos:
        codigo = registro.get("codigo_mbti")
        identificador = registro.get("id")
        combinacion = registro.get("combinacion_legible")
        if codigo in codigos or codigo not in CODIGOS_ESPERADOS:
            raise ErrorValidacion(f"Código duplicado o inválido: {codigo}")
        if not isinstance(identificador, str) or not identificador or identificador in ids:
            raise ErrorValidacion(f"Identificador duplicado o inválido: {identificador}")
        clave_combinacion = str(combinacion).casefold()
        if not isinstance(combinacion, str) or not combinacion.strip() or clave_combinacion in combinaciones:
            raise ErrorValidacion(f"Combinación animal-color duplicada o inválida: {combinacion}")

        animal = registro.get("animal")
        if not isinstance(animal, dict) or not animal.get("diminutivo_es") or not animal.get("nombre_fuente"):
            raise ErrorValidacion(f"Animal inválido para {codigo}")
        paleta = registro.get("paleta")
        principal = registro.get("color_principal")
        if not isinstance(paleta, list) or not paleta or not isinstance(principal, dict) or principal not in paleta:
            raise ErrorValidacion(f"Paleta o color principal inválido para {codigo}")
        for color in paleta:
            if not isinstance(color, dict) or not isinstance(color.get("nombre"), str):
                raise ErrorValidacion(f"Color incompleto para {codigo}")
            hexadecimal = color.get("hex")
            if not isinstance(hexadecimal, str) or not PATRON_HEX.fullmatch(hexadecimal):
                raise ErrorValidacion(f"Código hexadecimal inválido para {codigo}: {hexadecimal}")

        codigos.add(codigo)
        ids.add(identificador)
        combinaciones.add(clave_combinacion)

    if codigos != set(CODIGOS_ESPERADOS):
        raise ErrorValidacion("Faltan códigos MBTI en el documento final")


def escribir_json_atomico(documento: dict[str, Any], destino: Path) -> None:
    destino = destino.expanduser().resolve()
    destino.parent.mkdir(parents=True, exist_ok=True)
    temporal: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            dir=destino.parent,
            prefix=f".{destino.name}.",
            suffix=".tmp",
            delete=False,
        ) as archivo:
            temporal = Path(archivo.name)
            json.dump(documento, archivo, ensure_ascii=False, indent=2)
            archivo.write("\n")
            archivo.flush()
            os.fsync(archivo.fileno())
        os.replace(temporal, destino)
    except OSError:
        if temporal is not None:
            temporal.unlink(missing_ok=True)
        raise


def crear_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Genera los 16 arquetipos MBTI con animales y paletas curadas.")
    parser.add_argument(
        "-o", "--output", "--salida",
        type=Path,
        default=Path("data/arquetipos.json"),
        help="Ruta del JSON de salida (predeterminado: data/arquetipos.json).",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="No realiza solicitudes de red y usa los fallbacks locales completos.",
    )
    return parser


def main() -> int:
    parser = crear_parser()
    argumentos = parser.parse_args()
    sesion = None if argumentos.offline else crear_sesion()
    try:
        personalidades, estado_personalidades = obtener_personalidades(sesion, argumentos.offline)
        animales, estado_animales = obtener_animales(sesion, argumentos.offline)
        documento = construir_documento(
            personalidades,
            animales,
            estado_personalidades,
            estado_animales,
            argumentos.offline,
        )
        escribir_json_atomico(documento, argumentos.output)
    except (ErrorFuente, ErrorValidacion, OSError) as exc:
        parser.exit(1, f"Error: {exc}\n")
    finally:
        if sesion is not None:
            sesion.close()
    print(f"Se escribieron 16 arquetipos en {argumentos.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
