"""Query understanding: natural-language question -> structured constraints
plus residual lexical text, then into OpenSearch clauses.

Deliberately crude regex/keyword extraction. This is the seam where a real
query-understanding layer (LLM extraction, geography resolution, reranking
signals) will eventually sit - it exists now because leaving years in the
lexical query actively *harms* results: the token "2010" matches the literal
text of titles like "Enterprises that applied for patents in 2010", which
swamped the actual trade tables for "exports to the United States from 2010
to 2020".
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

_YEAR = re.compile(r"\b(19\d{2}|20\d{2})\b")
_PRODUCT_ID = re.compile(r"\b\d{8}\b")
_CANSIM_ID = re.compile(r"\b\d{3}-\d{4}\b")

# Only the unambiguous frequencies. "Occasional Monthly" (20), "Every 2
# years" (13) etc. are deliberately not mapped - a wrong hard filter costs
# more than a missing one.
_FREQUENCY_TERMS = {
    "daily": "1",
    "weekly": "2",
    "monthly": "6",
    "quarterly": "9",
    "annual": "12",
    "annually": "12",
    "yearly": "12",
}

_CONNECTIVES = "from|to|in|for|during|between|and|of"

_TITLE_BOOST = 3


@dataclass(frozen=True)
class ParsedQuery:
    """Constraints pulled out of the raw question, plus what's left of it."""

    text: str
    start_year: int | None = None
    end_year: int | None = None
    frequency_code: str | None = None
    identifier: str | None = None

    @property
    def has_constraints(self) -> bool:
        return any((self.start_year, self.frequency_code, self.identifier))


def parse_query(raw: str) -> ParsedQuery:
    identifier = None
    match = _CANSIM_ID.search(raw) or _PRODUCT_ID.search(raw)
    if match:
        identifier = match.group(0)

    years = [int(y) for y in _YEAR.findall(raw)]
    # A CANSIM id like "251-0008" contains no year; an 8-digit product id
    # can't match _YEAR either, so no need to exclude identifier digits here.
    start_year = min(years) if years else None
    end_year = max(years) if years else None

    text = raw
    frequency_code = None
    for term, code in _FREQUENCY_TERMS.items():
        pattern = re.compile(rf"\b{term}\b", re.IGNORECASE)
        if pattern.search(text):
            frequency_code = code
            text = pattern.sub(" ", text)
            break

    text = _YEAR.sub(" ", text)
    if identifier:
        text = text.replace(identifier, " ")
    text = re.sub(r"\s+", " ", text).strip()
    # Connectives stranded by the removals: "from 2010 to 2020" -> "from to",
    # "between 2015 and 2020" -> "between and". A lone connective is left
    # alone ("exports *to* the United States"); only orphaned runs and
    # trailing ones go. BM25 would drop these as stopwords anyway, but they
    # also feed the embedding text, which isn't analyzed.
    text = re.sub(rf"\b(?:{_CONNECTIVES})\b(?:\s+\b(?:{_CONNECTIVES})\b)+", " ", text)
    text = re.sub(rf"(?:\b(?:{_CONNECTIVES})\b\s*)+$", "", text)
    text = re.sub(r"\s+", " ", text).strip()

    return ParsedQuery(
        text=text,
        start_year=start_year,
        end_year=end_year,
        frequency_code=frequency_code,
        identifier=identifier,
    )


def build_filters(parsed: ParsedQuery, *, include_archived: bool = True) -> list[dict[str, Any]]:
    """Structured constraints as OpenSearch filter clauses (no scoring impact).

    Temporal coverage is an *overlap* test: a product spanning 1978-2018 is
    eligible for a 2015 request. Expressed as two range clauses so both ends
    use the indexed `date` fields directly.
    """
    filters: list[dict[str, Any]] = []

    if parsed.start_year is not None and parsed.end_year is not None:
        filters.append({"range": {"coverage.start_date": {"lte": f"{parsed.end_year}-12-31"}}})
        filters.append({"range": {"coverage.end_date": {"gte": f"{parsed.start_year}-01-01"}}})

    if parsed.frequency_code is not None:
        filters.append({"term": {"frequency.code": parsed.frequency_code}})

    if not include_archived:
        filters.append({"term": {"archived": False}})

    return filters


def build_lexical_query(parsed: ParsedQuery) -> dict[str, Any]:
    """BM25 clause. Title is boosted because `search_text` otherwise scores a
    title term identically to the 18,000th dimension value of a census table.
    """
    if parsed.identifier:
        # An explicit table number is an exact lookup, not a ranking problem.
        return {
            "bool": {
                "should": [
                    {"term": {"product_id": parsed.identifier}},
                    {"term": {"cansim_id": parsed.identifier}},
                ],
                "minimum_should_match": 1,
            }
        }

    if not parsed.text:
        return {"match_all": {}}

    return {
        "multi_match": {
            "query": parsed.text,
            "fields": [f"title.en^{_TITLE_BOOST}", "search_text"],
            "type": "best_fields",
        }
    }
