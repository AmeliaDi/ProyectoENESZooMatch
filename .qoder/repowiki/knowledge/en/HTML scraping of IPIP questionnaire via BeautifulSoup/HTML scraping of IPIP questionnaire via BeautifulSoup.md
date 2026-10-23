---
kind: external_dependency
name: HTML scraping of IPIP questionnaire via BeautifulSoup
slug: beautifulsoup4
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
---

### BeautifulSoup4
- Role: Parses the IPIP HTML page (`https://ipip.ori.org/new_ipip-50-item-scale.htm`) to extract psychometric items for the microtest pipeline.
- Stable behavior: only `text/html` / `application/xhtml+xml` responses are accepted; content shorter than 1 KB or fewer than 40 extracted rows raise `ErrorPipeline`. The script falls back to local approved items when network access fails — never hard-fails on the scrape.
- Note: Playwright was mentioned as an alternative in the conversation but is not present in requirements.txt; the current implementation uses BeautifulSoup + requests exclusively.