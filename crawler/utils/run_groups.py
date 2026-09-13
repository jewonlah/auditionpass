"""Split slow discovery from core sources without changing the local all-source run."""
GROUPS = ("all", "core", "cafe", "web", "backtrace")

def select_group(scrapers, group):
    if group not in GROUPS:
        raise ValueError(f"Unknown crawler group: {group}")
    discovery = {"NaverCafeScraper": "cafe", "NaverWebScraper": "web", "BacktraceScraper": "backtrace"}
    return [scraper for scraper in scrapers if group == "all" or discovery.get(type(scraper).__name__, "core") == group]
