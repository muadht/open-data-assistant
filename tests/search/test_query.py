from open_data_assistant.search.query import build_filters, build_lexical_query, parse_query


def test_extracts_single_year_and_strips_it_from_text():
    parsed = parse_query("population by province in 2015")
    assert parsed.start_year == 2015
    assert parsed.end_year == 2015
    assert "2015" not in parsed.text
    assert "population by province" in parsed.text


def test_extracts_year_range():
    parsed = parse_query("exports to the United States from 2010 to 2020")
    assert (parsed.start_year, parsed.end_year) == (2010, 2020)
    assert "2010" not in parsed.text and "2020" not in parsed.text
    assert parsed.text == "exports to the United States"


def test_extracts_frequency_and_strips_it():
    parsed = parse_query("monthly employment data")
    assert parsed.frequency_code == "6"
    assert "monthly" not in parsed.text.lower()
    assert "employment data" in parsed.text


def test_no_constraints_leaves_text_untouched():
    parsed = parse_query("unemployment rate in Ontario")
    assert parsed.start_year is None
    assert parsed.frequency_code is None
    assert parsed.text == "unemployment rate in Ontario"


def test_recognizes_product_id():
    parsed = parse_query("35100003")
    assert parsed.identifier == "35100003"
    assert parsed.text == ""


def test_recognizes_cansim_id():
    parsed = parse_query("251-0008")
    assert parsed.identifier == "251-0008"


def test_coverage_filter_is_an_overlap_test():
    filters = build_filters(parse_query("data for 2015"))
    assert {"range": {"coverage.start_date": {"lte": "2015-12-31"}}} in filters
    assert {"range": {"coverage.end_date": {"gte": "2015-01-01"}}} in filters


def test_archived_filter_only_when_excluded():
    assert {"term": {"archived": False}} in build_filters(
        parse_query("anything"), include_archived=False
    )
    assert {"term": {"archived": False}} not in build_filters(
        parse_query("anything"), include_archived=True
    )


def test_frequency_filter():
    assert {"term": {"frequency.code": "9"}} in build_filters(parse_query("quarterly gdp"))


def test_lexical_query_boosts_title():
    query = build_lexical_query(parse_query("consumer price index"))
    assert query["multi_match"]["fields"] == ["title.en^3", "search_text"]


def test_lexical_query_for_identifier_is_exact_term_lookup():
    query = build_lexical_query(parse_query("35100003"))
    assert {"term": {"product_id": "35100003"}} in query["bool"]["should"]


def test_lexical_query_matches_all_when_only_constraints_given():
    query = build_lexical_query(parse_query("2015"))
    assert query == {"match_all": {}}
