"""Token-free collection and deterministic filtering for the research radar."""

from __future__ import annotations

import html
import json
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from pathlib import Path

import requests
import yaml


ROOT = Path(__file__).resolve().parents[1]
PROFILE_PATH = ROOT / "config" / "research-profile.yml"
CANDIDATES_PATH = ROOT / "data" / "candidates.json"
SEEN_PATH = ROOT / "data" / "seen.json"

ARXIV_ENDPOINT = "https://export.arxiv.org/api/query"
CROSSREF_ENDPOINT = "https://api.crossref.org/works"
USER_AGENT = "wahajayub.me research radar (mailto:wahaj.23.2.2000@gmail.com)"

ARXIV_QUERY = " OR ".join(
    [
        "cat:cond-mat.mtrl-sci",
        "cat:cond-mat.mes-hall",
        "cat:cond-mat.str-el",
        "cat:math-ph",
        "cat:physics.optics",
    ]
)

CROSSREF_QUERIES = [
    "shift current quantum geometry",
    "bulk photovoltaic topological",
    "noncentrosymmetric topological material",
    "Hopf insulator delicate topology",
    "ballistic photocurrent impurity",
]

KEY_PHRASES = {
    "shift current": 7,
    "bulk photovoltaic": 7,
    "photogalvanic": 5,
    "ballistic current": 7,
    "ballistic photocurrent": 7,
    "impurity-assisted": 7,
    "impurity induced": 5,
    "noncentrosymmetric": 5,
    "non-centrosymmetric": 5,
    "broken inversion": 4,
    "inversion symmetry": 3,
    "quantum metric": 7,
    "quantum geometry": 7,
    "berry curvature": 4,
    "nonlinear hall": 5,
    "nonlinear optical": 3,
    "hopf insulator": 9,
    "hopf invariant": 9,
    "hopf-euler": 9,
    "delicate topology": 9,
    "returning thouless": 8,
    "unstable topology": 7,
    "multigap topology": 7,
    "homotopy classification": 6,
    "characteristic class": 4,
    "stiefel-whitney": 6,
    "pontryagin": 7,
    "euler class": 6,
    "weyl semimetal": 4,
    "topological material": 3,
}


def clean_text(value: str | None) -> str:
    text = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def normalize_title(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def phrase_matches(item: dict) -> list[str]:
    text = f"{item.get('title', '')} {item.get('abstract', '')}".lower()
    return [phrase for phrase in KEY_PHRASES if phrase in text]


def score(item: dict) -> int:
    return sum(KEY_PHRASES[phrase] for phrase in phrase_matches(item))


def load_seen() -> set[str]:
    if not SEEN_PATH.exists():
        return set()
    data = json.loads(SEEN_PATH.read_text(encoding="utf-8"))
    return set(data.get("ids", []))


def parse_arxiv() -> list[dict]:
    response = requests.get(
        ARXIV_ENDPOINT,
        params={
            "search_query": ARXIV_QUERY,
            "start": 0,
            "max_results": 180,
            "sortBy": "submittedDate",
            "sortOrder": "descending",
        },
        timeout=45,
        headers={"User-Agent": USER_AGENT},
    )
    response.raise_for_status()
    root = ET.fromstring(response.text)
    atom = {"a": "http://www.w3.org/2005/Atom"}
    cutoff = datetime.now(timezone.utc) - timedelta(days=9)
    papers: list[dict] = []

    for entry in root.findall("a:entry", atom):
        raw_date = clean_text(entry.findtext("a:published", "", atom))
        try:
            published = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
        except ValueError:
            continue
        if published < cutoff:
            continue

        url = clean_text(entry.findtext("a:id", "", atom))
        paper = {
            "id": url,
            "source": "arXiv",
            "title": clean_text(entry.findtext("a:title", "", atom)),
            "authors": [clean_text(a.findtext("a:name", "", atom)) for a in entry.findall("a:author", atom)],
            "published": published.date().isoformat(),
            "url": url,
            "pdf_url": "",
            "abstract": clean_text(entry.findtext("a:summary", "", atom)),
            "source_categories": [c.attrib.get("term", "") for c in entry.findall("a:category", atom)],
        }
        for link in entry.findall("a:link", atom):
            if link.attrib.get("title") == "pdf":
                paper["pdf_url"] = link.attrib.get("href", "")
        papers.append(paper)
    return papers


def crossref_date(item: dict) -> str:
    for key in ("published-online", "published-print", "published", "issued"):
        parts = item.get(key, {}).get("date-parts", [])
        if parts and parts[0]:
            values = list(parts[0]) + [1, 1]
            try:
                return datetime(values[0], values[1], values[2], tzinfo=timezone.utc).date().isoformat()
            except (TypeError, ValueError):
                pass
    return ""


def parse_crossref(start: str, end: str) -> list[dict]:
    papers: list[dict] = []
    for query in CROSSREF_QUERIES:
        response = requests.get(
            CROSSREF_ENDPOINT,
            params={
                "query.bibliographic": query,
                "filter": f"from-pub-date:{start},until-pub-date:{end},type:journal-article",
                "rows": 20,
                "select": "DOI,title,author,published,published-online,published-print,issued,URL,container-title,abstract",
                "mailto": "wahaj.23.2.2000@gmail.com",
            },
            timeout=45,
            headers={"User-Agent": USER_AGENT},
        )
        response.raise_for_status()
        for item in response.json().get("message", {}).get("items", []):
            abstract = clean_text(item.get("abstract"))
            if not abstract:
                continue
            doi = item.get("DOI", "")
            authors = [
                clean_text(" ".join(filter(None, [author.get("given"), author.get("family")])))
                for author in item.get("author", [])
            ]
            title_values = item.get("title", [])
            venue_values = item.get("container-title", [])
            papers.append(
                {
                    "id": f"doi:{doi.lower()}",
                    "source": venue_values[0] if venue_values else "Journal",
                    "title": clean_text(title_values[0] if title_values else ""),
                    "authors": authors,
                    "published": crossref_date(item),
                    "url": item.get("URL", f"https://doi.org/{doi}"),
                    "pdf_url": "",
                    "abstract": abstract,
                    "source_categories": ["journal-article"],
                }
            )
    return papers


def deduplicate(items: list[dict]) -> list[dict]:
    unique: list[dict] = []
    ids: set[str] = set()
    normalized: list[str] = []
    for item in sorted(items, key=lambda p: p.get("published", ""), reverse=True):
        identifier = item.get("id", "")
        title = normalize_title(item.get("title", ""))
        if not identifier or not title or identifier in ids:
            continue
        if any(SequenceMatcher(None, title, prior).ratio() >= 0.94 for prior in normalized):
            continue
        ids.add(identifier)
        normalized.append(title)
        unique.append(item)
    return unique


def load_profile() -> dict:
    return yaml.safe_load(PROFILE_PATH.read_text(encoding="utf-8"))


def write_candidates(items: list[dict], profile: dict) -> None:
    now = datetime.now(timezone.utc)
    payload = {
        "collected_at": now.isoformat().replace("+00:00", "Z"),
        "window_days": 9,
        "candidate_count": len(items),
        "research_focus": profile["research_focus"],
        "candidates": items,
    }
    CANDIDATES_PATH.parent.mkdir(parents=True, exist_ok=True)
    CANDIDATES_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=9)).date().isoformat()
    end = now.date().isoformat()
    profile = load_profile()
    seen = load_seen()

    collected = parse_arxiv()
    try:
        collected.extend(parse_crossref(start, end))
    except requests.RequestException as exc:
        print(f"Crossref collection failed without blocking arXiv results: {exc}")

    candidates = []
    for item in deduplicate(collected):
        if item["id"] in seen:
            continue
        item["matched_terms"] = phrase_matches(item)
        item["local_score"] = score(item)
        if item["local_score"] >= 3:
            candidates.append(item)

    candidates.sort(key=lambda p: (p["local_score"], p["published"]), reverse=True)
    write_candidates(candidates[:20], profile)
    print(f"Wrote {min(len(candidates), 20)} candidates from {len(collected)} collected records.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
