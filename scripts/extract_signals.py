#!/usr/bin/env python3
"""Extract deterministic keyword signals from the sanitized OpenAlex corpus."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INPUT_PATH = ROOT / "data" / "external" / "raw" / "openalex_works.jsonl"
OUTPUT_PATH = ROOT / "data" / "external" / "processed" / "literature_signals.json"
QUERIES = [
    "Big Five personality relationship satisfaction meta-analysis",
    "neuroticism marital satisfaction longitudinal",
    "personality similarity couples satisfaction",
    "Myers-Briggs type indicator reliability validity",
]
TRAITS = {
    "neuroticism_stability": re.compile(
        r"\b(?:neuroticism|emotional stability|negative affectivity)\b", re.I
    ),
    "agreeableness": re.compile(r"\bagreeableness\b", re.I),
    "conscientiousness": re.compile(r"\bconscientiousness\b", re.I),
    "extraversion": re.compile(r"\bextraversion\b", re.I),
    "openness": re.compile(r"\bopenness\b", re.I),
    "similarity": re.compile(
        r"\b(?:similarity|congruence|matching|dyadic similarity)\b", re.I
    ),
    "mbti": re.compile(r"\b(?:MBTI|Myers[- ]Briggs)\b", re.I),
}
OUTCOMES = re.compile(
    r"\b(?:satisfaction|quality|divorce|dissolution|(?<!emotional )stability)\b",
    re.I,
)
WEAK_CUES = re.compile(
    r"\b(?:little|small|weak|negligible|no significant)\b",
    re.I,
)
NEGATIVE_CUES = re.compile(
    r"\b(?:negative(?:ly)?|lower|decrease|predict(?:s|ed|ing)?\s+"
    r"(?:the\s+)?(?:risk\s+of\s+)?(?:divorce|dissolution))\b",
    re.I,
)
POSITIVE_CUES = re.compile(r"\b(?:positive(?:ly)?|higher|increase)\b", re.I)
EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b")
URL_RE = re.compile(r"\b(?:https?://|www\.)\S+", re.I)
SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")


def sanitize_text(value: object) -> str:
    text = str(value or "")
    text = EMAIL_RE.sub("[email removed]", text)
    text = URL_RE.sub("[URL removed]", text)
    return re.sub(r"\s+", " ", text).strip()


def split_sentences(text: str) -> list[str]:
    return [sentence.strip() for sentence in SENTENCE_SPLIT.split(text) if sentence.strip()]


def outcome_present(sentence: str) -> bool:
    return OUTCOMES.search(sentence) is not None


def direction(sentence: str) -> str:
    if WEAK_CUES.search(sentence):
        return "weak"
    negative = NEGATIVE_CUES.search(sentence) is not None
    positive = POSITIVE_CUES.search(sentence) is not None
    if negative and not positive:
        return "neg"
    if positive and not negative:
        return "pos"
    if negative and positive:
        return "mixed"
    return "none"


def load_works() -> list[dict[str, object]]:
    if not INPUT_PATH.exists():
        raise FileNotFoundError(
            f"Missing {INPUT_PATH}; run `python3 scripts/crawl_external.py openalex` first."
        )
    works_by_id: dict[str, dict[str, object]] = {}
    with INPUT_PATH.open(encoding="utf-8") as input_file:
        for line in input_file:
            try:
                work = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(work, dict) and isinstance(work.get("id"), str):
                works_by_id[work["id"]] = work
    return [works_by_id[key] for key in sorted(works_by_id)]


def extract(works: list[dict[str, object]]) -> dict[str, object]:
    sentence_counts: defaultdict[tuple[str, bool, str], int] = defaultdict(int)
    works_by_trait: dict[str, dict[str, dict[str, object]]] = {
        trait: {} for trait in TRAITS
    }
    fetched_dates: list[str] = []
    for work in works:
        fetched_at = str(work.get("fetched_at") or "")
        if fetched_at:
            fetched_dates.append(fetched_at[:10])
        work_id = str(work.get("id") or "")
        work_summary = {
            "title": sanitize_text(work.get("title")),
            "year": work.get("publication_year"),
            "doi": sanitize_text(work.get("doi")),
            "cited_by_count": (
                work.get("cited_by_count")
                if isinstance(work.get("cited_by_count"), int)
                else 0
            ),
        }
        trait_sentences: dict[str, list[tuple[bool, str]]] = {
            trait: [] for trait in TRAITS
        }
        for sentence in split_sentences(sanitize_text(work.get("abstract"))):
            present_traits = [
                trait for trait, pattern in TRAITS.items() if pattern.search(sentence)
            ]
            if not present_traits:
                continue
            has_outcome = outcome_present(sentence)
            sentence_direction = direction(sentence)
            for trait in present_traits:
                trait_sentences[trait].append((has_outcome, sentence_direction))
                sentence_counts[(trait, has_outcome, sentence_direction)] += 1
        for trait, matches in trait_sentences.items():
            if matches:
                works_by_trait[trait][work_id] = {
                    **work_summary,
                    "has_outcome_sentence": any(
                        has_outcome for has_outcome, _ in matches
                    ),
                }

    trait_summaries: dict[str, dict[str, object]] = {}
    for trait, papers in works_by_trait.items():
        ranked_papers = sorted(
            papers.values(),
            key=lambda item: (
                -int(item["cited_by_count"]),
                -(int(item["year"]) if isinstance(item["year"], int) else 0),
                str(item["title"]).casefold(),
            ),
        )
        trait_summaries[trait] = {
            "distinct_works": len(papers),
            "distinct_works_with_outcomes": sum(
                bool(paper["has_outcome_sentence"]) for paper in papers.values()
            ),
            "top_works": [
                {
                    key: paper[key]
                    for key in ("title", "year", "doi", "cited_by_count")
                }
                for paper in ranked_papers[:5]
            ],
        }

    return {
        "fetch_date": (
            max(fetched_dates)
            if fetched_dates
            else datetime.now(timezone.utc).date().isoformat()
        ),
        "queries": QUERIES,
        "corpus_work_count": len(works),
        "counts": [
            {
                "trait": trait,
                "outcome_present": outcome,
                "direction": direction_label,
                "sentence_count": count,
            }
            for (trait, outcome, direction_label), count in sorted(sentence_counts.items())
        ],
        "traits": trait_summaries,
    }


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    result = extract(load_works())
    OUTPUT_PATH.write_text(
        json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"Processed works={result['corpus_work_count']} output={OUTPUT_PATH}")
    for trait, summary in result["traits"].items():
        print(
            f"{trait}: distinct_works={summary['distinct_works']} "
            f"outcome_works={summary['distinct_works_with_outcomes']}"
        )


if __name__ == "__main__":
    main()
