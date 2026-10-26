#!/usr/bin/env python3
"""Collect permitted OpenAlex literature metadata and OpenPsychometrics norms."""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import time
import zipfile
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import requests


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "external" / "raw"
PROCESSED_DIR = ROOT / "data" / "external" / "processed"
USER_AGENT = "ZooMatch-research/0.1 (mailto:enorastrokes@gmail.com)"
OPENALEX_URL = "https://api.openalex.org/works"
OPENALEX_QUERIES = (
    "Big Five personality relationship satisfaction meta-analysis",
    "neuroticism marital satisfaction longitudinal",
    "personality similarity couples satisfaction",
    "Myers-Briggs type indicator reliability validity",
)
OPENALEX_SELECT = (
    "id,doi,title,publication_year,cited_by_count,open_access,"
    "primary_location,abstract_inverted_index"
)
OPENPSYCHOMETRICS_URL = "https://openpsychometrics.org/_rawdata/"
TIMEOUT = (5, 30)
MIN_REQUEST_INTERVAL = 1.0
MAX_RETRIES = 1
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def sanitize_text(value: object) -> str:
    text = str(value or "")
    text = re.sub(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b", "[email removed]", text)
    text = re.sub(r"\b(?:https?://|www\.)\S+", "[URL removed]", text, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", text).strip()


class PoliteClient:
    def __init__(self, max_requests: int | None = None) -> None:
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})
        self.max_requests = max_requests
        self.request_count = 0
        self.last_request_at: float | None = None

    def _wait_for_slot(self) -> None:
        if self.last_request_at is None:
            return
        remaining = MIN_REQUEST_INTERVAL - (time.monotonic() - self.last_request_at)
        if remaining > 0:
            time.sleep(remaining)

    def get(
        self,
        url: str,
        *,
        params: dict[str, object] | None = None,
        stream: bool = False,
        allow_missing: bool = False,
    ) -> requests.Response:
        last_error: Exception | None = None
        for attempt in range(MAX_RETRIES + 1):
            self._wait_for_slot()
            if self.max_requests is not None and self.request_count >= self.max_requests:
                raise RuntimeError(f"Request budget exhausted before {urlparse(url).netloc}")
            self.request_count += 1
            try:
                response = self.session.get(
                    url,
                    params=params,
                    stream=stream,
                    timeout=TIMEOUT,
                )
                self.last_request_at = time.monotonic()
                if allow_missing and response.status_code == 404:
                    return response
                if response.status_code in RETRYABLE_STATUS_CODES and attempt < MAX_RETRIES:
                    retry_after = response.headers.get("Retry-After", "")
                    try:
                        delay = max(float(2**attempt), min(30.0, float(retry_after)))
                    except ValueError:
                        delay = float(2**attempt)
                    time.sleep(delay)
                    continue
                response.raise_for_status()
                return response
            except requests.RequestException as error:
                last_error = error
                if attempt >= MAX_RETRIES:
                    raise
                time.sleep(float(2**attempt))
        if last_error is not None:
            raise last_error
        raise RuntimeError("Request failed without an HTTP response")

    def check_robots(self, target_url: str) -> None:
        parsed = urlparse(target_url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        response = self.get(robots_url, allow_missing=True)
        if response.status_code == 404:
            print(f"robots.txt missing; allowed: {robots_url}")
            return
        parser = RobotFileParser(robots_url)
        parser.parse(response.text.splitlines())
        if not parser.can_fetch(USER_AGENT, target_url):
            raise PermissionError(f"robots.txt disallows the requested URL: {target_url}")
        print(f"robots.txt allows: {target_url}")


def reconstruct_abstract(index: object) -> str:
    if not isinstance(index, dict):
        return ""
    words: list[str] = []
    for word, positions in index.items():
        if isinstance(positions, list):
            for position in positions:
                if isinstance(position, int) and position >= 0:
                    while len(words) <= position:
                        words.append("")
                    words[position] = str(word)
    return sanitize_text(" ".join(words))


def normalize_doi(value: object) -> str:
    doi = str(value or "").strip()
    doi = re.sub(r"^https?://(?:dx\.)?doi\.org/", "", doi, flags=re.IGNORECASE)
    return sanitize_text(doi)


def normalize_openalex_id(value: object) -> str:
    identifier = str(value or "").strip().rstrip("/")
    return identifier.rsplit("/", 1)[-1]


def safe_open_access(value: object) -> dict[str, object] | None:
    if not isinstance(value, dict):
        return None
    return {
        key: item
        for key, item in value.items()
        if key in {"is_oa", "oa_status", "any_repository_has_fulltext"}
    }


def safe_primary_location(value: object) -> dict[str, object] | None:
    if not isinstance(value, dict):
        return None
    source = value.get("source")
    source_name = source.get("display_name") if isinstance(source, dict) else None
    return {"source_name": sanitize_text(source_name)} if source_name else None


def safe_work(work: dict[str, object], query: str, fetched_at: str) -> dict[str, object]:
    return {
        "id": normalize_openalex_id(work.get("id")),
        "doi": normalize_doi(work.get("doi")),
        "title": sanitize_text(work.get("title")),
        "publication_year": work.get("publication_year"),
        "cited_by_count": work.get("cited_by_count"),
        "open_access": safe_open_access(work.get("open_access")),
        "primary_location": safe_primary_location(work.get("primary_location")),
        "abstract": reconstruct_abstract(work.get("abstract_inverted_index")),
        "queries": [query],
        "fetched_at": fetched_at,
    }


def fill_missing_work_metadata(
    work: dict[str, object], previous: dict[str, object] | None
) -> dict[str, object]:
    if previous is None:
        return work
    for field in (
        "doi",
        "title",
        "publication_year",
        "cited_by_count",
        "open_access",
        "primary_location",
        "abstract",
    ):
        if work.get(field) in (None, "") and previous.get(field) not in (None, ""):
            work[field] = previous[field]
    return work


def load_jsonl_by_id(path: Path) -> dict[str, dict[str, object]]:
    existing: dict[str, dict[str, object]] = {}
    if not path.exists():
        return existing
    with path.open(encoding="utf-8") as input_file:
        for line in input_file:
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(item, dict) and isinstance(item.get("id"), str):
                item["id"] = normalize_openalex_id(item["id"])
                item["title"] = sanitize_text(item.get("title"))
                item["abstract"] = sanitize_text(item.get("abstract"))
                item["doi"] = normalize_doi(item.get("doi"))
                existing[item["id"]] = item
    return existing


def run_openalex() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    client = PoliteClient(max_requests=12)
    client.check_robots(OPENALEX_URL)
    output_path = RAW_DIR / "openalex_works.jsonl"
    previous_works_by_id = load_jsonl_by_id(output_path)
    works_by_id: dict[str, dict[str, object]] = {}
    fetched_at = utc_now()
    for query in OPENALEX_QUERIES:
        response = client.get(
            OPENALEX_URL,
            params={
                "search": query,
                "per-page": 25,
                "select": OPENALEX_SELECT,
            },
        )
        results = response.json().get("results", [])
        if not isinstance(results, list):
            raise ValueError("OpenAlex response has no results list")
        for work in results:
            if not isinstance(work, dict) or not isinstance(work.get("id"), str):
                continue
            item = safe_work(work, query, fetched_at)
            work_id = str(item["id"])
            item = fill_missing_work_metadata(item, previous_works_by_id.get(work_id))
            current_queries = works_by_id.get(work_id, {}).get("queries", [])
            if not isinstance(current_queries, list):
                current_queries = []
            item["queries"] = sorted(set(current_queries) | {query})
            works_by_id[work_id] = item
        print(f"OpenAlex query complete: results={len(results)}")
    temporary_path = output_path.with_suffix(output_path.suffix + ".tmp")
    with temporary_path.open("w", encoding="utf-8") as output_file:
        for work_id in sorted(works_by_id):
            output_file.write(json.dumps(works_by_id[work_id], ensure_ascii=False, sort_keys=True))
            output_file.write("\n")
    temporary_path.replace(output_path)
    print(
        f"OpenAlex unique works={len(works_by_id)} "
        f"requests={client.request_count} raw={output_path}"
    )


class PageCollector(HTMLParser):
    BLOCK_TAGS = {"br", "div", "li", "p", "section", "tr"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.text_parts: list[str] = []
        self.links: list[tuple[str, str]] = []
        self.current_link: dict[str, str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self.BLOCK_TAGS:
            self.text_parts.append("\n")
        if tag == "a":
            self.current_link = {"href": dict(attrs).get("href") or "", "text": ""}

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self.current_link is not None:
            self.links.append((self.current_link["text"], self.current_link["href"]))
            self.current_link = None
        if tag in self.BLOCK_TAGS:
            self.text_parts.append("\n")

    def handle_data(self, data: str) -> None:
        self.text_parts.append(data)
        if self.current_link is not None:
            self.current_link["text"] += data


def extract_license_lines(page_text: str) -> list[str]:
    lines = []
    for line in page_text.splitlines():
        candidate = sanitize_text(line)
        if candidate and re.search(
            r"\b(?:licen[cs]e|licensed|creative commons|cc\s*0|cc\s*by)\b",
            candidate,
            re.I,
        ):
            lines.append(candidate)
    return lines


def license_permits_derivatives(lines: list[str]) -> bool:
    for line in lines:
        if re.search(r"\bCC\s*0\b", line, re.I):
            return True
        has_attribution = bool(
            re.search(r"\bCC\s*BY(?:-NC)?(?:-SA)?\b", line, re.I)
            or (
                re.search(r"creative commons", line, re.I)
                and re.search(r"\battribution\b", line, re.I)
            )
        )
        if has_attribution and not re.search(
            r"\b(?:ND|no derivatives)\b",
            line,
            re.I,
        ):
            return True
    return False


def find_big5_zip_link(links: list[tuple[str, str]], page_url: str) -> str | None:
    for anchor_text, href in links:
        candidate = f"{anchor_text} {href}"
        if re.search(r"big\s*5|bigfive", candidate, re.I) and re.search(
            r"\.zip(?:$|[?#])",
            href,
            re.I,
        ):
            return urljoin(page_url, href)
    return None


def write_big5_skip(reason: str, *, license_line: str | None, dataset_url: str | None) -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    output = {
        "status": "skipped",
        "reason": sanitize_text(reason),
        "source_url": OPENPSYCHOMETRICS_URL,
        "license_line": sanitize_text(license_line) if license_line else None,
        "dataset_url": dataset_url,
        "fetch_date": utc_now()[:10],
    }
    path = PROCESSED_DIR / "big5_norms.json"
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OpenPsychometrics skipped: {output['reason']}")


def codebook_from_archive(archive: zipfile.ZipFile) -> tuple[str | None, str | None]:
    candidates = [
        name
        for name in archive.namelist()
        if re.search(r"(?:codebook|readme|data[_ -]?dictionary|dictionary)", name, re.I)
        and Path(name).suffix.lower() in {".txt", ".md", ".csv", ".tsv", ".html"}
    ]
    for name in sorted(candidates):
        info = archive.getinfo(name)
        if info.file_size > 5_000_000:
            continue
        try:
            text = archive.read(name).decode("utf-8-sig", errors="replace")
        except (KeyError, OSError, RuntimeError):
            continue
        return name, text
    return None, None


def codebook_scoring_map(text: str) -> dict[str, dict[str, object]] | None:
    """Parse only explicit CSV/TSV item-to-trait and reverse-key documentation."""
    for delimiter in (",", "\t", ";"):
        reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
        if not reader.fieldnames:
            continue
        normalized_headers = {
            re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_"): name
            for name in reader.fieldnames
            if name
        }
        key_header = next(
            (
                normalized_headers[name]
                for name in ("key", "item", "variable", "column")
                if name in normalized_headers
            ),
            None,
        )
        trait_header = next(
            (
                normalized_headers[name]
                for name in ("trait", "domain", "scale")
                if name in normalized_headers
            ),
            None,
        )
        reverse_header = next(
            (
                normalized_headers[name]
                for name in ("reverse", "reverse_scored", "reverse_keyed")
                if name in normalized_headers
            ),
            None,
        )
        if not key_header or not trait_header or not reverse_header:
            continue
        mapped: dict[str, dict[str, object]] = {}
        for row in reader:
            key = (row.get(key_header) or "").strip()
            trait = (row.get(trait_header) or "").strip().lower()
            reverse_value = (row.get(reverse_header) or "").strip().lower()
            if not key or trait not in {
                "openness",
                "conscientiousness",
                "extraversion",
                "agreeableness",
                "neuroticism",
            }:
                continue
            if reverse_value not in {"true", "false", "yes", "no", "1", "0"}:
                continue
            mapped[key] = {
                "trait": trait,
                "reverse": reverse_value in {"true", "yes", "1"},
            }
        if mapped and len(mapped) >= 10:
            return mapped
    return None


def process_big5_archive(
    archive: zipfile.ZipFile,
    *,
    license_line: str,
    dataset_url: str,
    codebook_name: str,
    codebook_text: str,
) -> dict[str, object] | None:
    scoring_map = codebook_scoring_map(codebook_text)
    if not scoring_map:
        return None
    data_files = [
        name
        for name in archive.namelist()
        if Path(name).suffix.lower() in {".csv", ".tsv"} and name != codebook_name
    ]
    if not data_files:
        return None

    traits = {
        trait: {"n": 0, "sum": 0.0, "sum_squares": 0.0, "histogram": {}}
        for trait in (
            "openness",
            "conscientiousness",
            "extraversion",
            "agreeableness",
            "neuroticism",
        )
    }
    for name in sorted(data_files):
        with archive.open(name) as binary_file:
            text_file = io.TextIOWrapper(
                binary_file,
                encoding="utf-8-sig",
                errors="replace",
                newline="",
            )
            sample = text_file.read(4096)
            text_file.seek(0)
            delimiter = "\t" if sample.count("\t") > sample.count(",") else ","
            reader = csv.DictReader(text_file, delimiter=delimiter)
            headers = set(reader.fieldnames or [])
            documented_keys = [key for key in scoring_map if key in headers]
            if not documented_keys:
                continue
            grouped: dict[str, list[tuple[str, bool]]] = {}
            for key in documented_keys:
                mapping = scoring_map[key]
                grouped.setdefault(str(mapping["trait"]), []).append(
                    (key, bool(mapping["reverse"]))
                )
            for row in reader:
                for trait, keys in grouped.items():
                    responses: list[int] = []
                    for key, reverse in keys:
                        try:
                            response = int(row.get(key, ""))
                        except (TypeError, ValueError):
                            responses = []
                            break
                        if response < 1 or response > 5:
                            responses = []
                            break
                        responses.append(6 - response if reverse else response)
                    if len(responses) != len(keys) or not responses:
                        continue
                    score = sum(responses) / len(responses)
                    state = traits[trait]
                    state["n"] = int(state["n"]) + 1
                    state["sum"] = float(state["sum"]) + score
                    state["sum_squares"] = float(state["sum_squares"]) + score * score
                    histogram = state["histogram"]
                    score_key = f"{score:.6f}"
                    histogram[score_key] = int(histogram.get(score_key, 0)) + 1

    aggregates: dict[str, dict[str, object]] = {}
    for trait, state in traits.items():
        n = int(state["n"])
        if n == 0:
            continue
        mean = float(state["sum"]) / n
        variance = (
            max(0.0, (float(state["sum_squares"]) - n * mean * mean) / (n - 1))
            if n > 1
            else 0.0
        )
        histogram = state["histogram"]
        ordered_values = sorted(
            (float(value), int(count)) for value, count in histogram.items()
        )

        def value_at(rank: int) -> float:
            cumulative = 0
            for value, count in ordered_values:
                cumulative += count
                if cumulative > rank:
                    return value
            return ordered_values[-1][0]

        percentiles: dict[str, float] = {}
        for percentile in range(10, 100, 10):
            target_rank = (n - 1) * percentile / 100
            lower_rank = int(target_rank)
            upper_rank = min(n - 1, lower_rank + 1)
            lower_value = value_at(lower_rank)
            upper_value = value_at(upper_rank)
            fraction = target_rank - lower_rank
            percentiles[f"p{percentile}"] = lower_value + (
                upper_value - lower_value
            ) * fraction
        aggregates[trait] = {
            "n": n,
            "mean": mean,
            "sd": variance**0.5,
            **percentiles,
        }

    if not aggregates:
        return None
    return {
        "status": "processed",
        "source_url": OPENPSYCHOMETRICS_URL,
        "dataset_url": dataset_url,
        "license_line": sanitize_text(license_line),
        "codebook_file": Path(codebook_name).name,
        "fetch_date": utc_now()[:10],
        "scale": "Mean of documented 1-5 IPIP item responses after documented reverse-scoring.",
        "informational_only": True,
        "demographics_included": False,
        "traits": aggregates,
    }


def run_openpsychometrics() -> None:
    client = PoliteClient()
    client.check_robots(OPENPSYCHOMETRICS_URL)
    page_response = client.get(OPENPSYCHOMETRICS_URL)
    collector = PageCollector()
    collector.feed(page_response.text)
    page_text = "".join(collector.text_parts)
    license_lines = extract_license_lines(page_text)
    license_line = next(
        (line for line in license_lines if license_permits_derivatives([line])),
        None,
    )
    dataset_url = find_big5_zip_link(collector.links, OPENPSYCHOMETRICS_URL)
    print(f"OpenPsychometrics license candidates={json.dumps(license_lines, ensure_ascii=False)}")
    print(f"OpenPsychometrics BIG5 link={'found' if dataset_url else 'not found'}")
    if not license_line:
        write_big5_skip(
            "No clear license permitting derivative aggregate analysis was found on the raw-data page.",
            license_line=license_lines[0] if license_lines else None,
            dataset_url=dataset_url,
        )
        return
    if not dataset_url:
        write_big5_skip(
            "No BIG5 ZIP link was found on the raw-data page.",
            license_line=license_line,
            dataset_url=None,
        )
        return

    client.check_robots(dataset_url)
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = RAW_DIR / "BIG5.zip"
    response = client.get(dataset_url, stream=True)
    with zip_path.open("wb") as output_file:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            if chunk:
                output_file.write(chunk)
    print(f"OpenPsychometrics archive downloaded: bytes={zip_path.stat().st_size}")

    with zipfile.ZipFile(zip_path) as archive:
        codebook_name, codebook_text = codebook_from_archive(archive)
        if codebook_name is None or codebook_text is None:
            write_big5_skip(
                "The archive contains no identifiable codebook documenting the IPIP item keys.",
                license_line=license_line,
                dataset_url=dataset_url,
            )
            return
        result = process_big5_archive(
            archive,
            license_line=license_line,
            dataset_url=dataset_url,
            codebook_name=codebook_name,
            codebook_text=codebook_text,
        )
    if result is None:
        write_big5_skip(
            "The codebook does not document a parseable trait, item-key, and reverse-scoring map.",
            license_line=license_line,
            dataset_url=dataset_url,
        )
        return
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    output_path = PROCESSED_DIR / "big5_norms.json"
    output_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"OpenPsychometrics processed traits={len(result['traits'])} output={output_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("openalex", help="Fetch literature metadata from OpenAlex")
    subparsers.add_parser(
        "openpsychometrics",
        help="Check the OpenPsychometrics raw-data license and norms",
    )
    args = parser.parse_args()
    try:
        if args.command == "openalex":
            run_openalex()
        else:
            run_openpsychometrics()
    except (
        PermissionError,
        RuntimeError,
        requests.RequestException,
        ValueError,
        zipfile.BadZipFile,
    ) as error:
        print(f"crawl failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
