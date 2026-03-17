#!/usr/bin/env python3
"""
Greenhouse job scraper.
Usage: python greenhouse_scraper.py <url1> <url2> ...
Outputs a JSON array to stdout. All logs go to stderr so they
don't corrupt the JSON that Deno reads.
"""

import sys
import io
import json
import time
import logging
from datetime import datetime
from typing import Optional
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

import requests
from bs4 import BeautifulSoup

# All debug/warning output goes to stderr — never stdout
logging.basicConfig(stream=sys.stderr, level=logging.WARNING,
                    format="[scraper] %(levelname)s: %(message)s")
log = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

SESSION = requests.Session()
SESSION.headers.update(HEADERS)


def extract_company_from_url(url: str) -> str:
    """Pull company slug from boards.greenhouse.io/<company>/jobs/<id>"""
    try:
        parts = url.rstrip("/").split("/")
        # boards.greenhouse.io / <company> / jobs / <id>
        idx = parts.index("jobs") if "jobs" in parts else -1
        if idx > 0:
            return parts[idx - 1].replace("-", " ").title()
    except Exception:
        pass
    return "Unknown Company"


def scrape_job(url: str) -> Optional[dict]:
    """
    Scrape a single Greenhouse job posting URL.
    Returns a dict or None if scraping failed.
    """
    try:
        resp = SESSION.get(url, timeout=15)
        if not resp.ok:
            log.warning("HTTP %s for %s", resp.status_code, url)
            return None

        soup = BeautifulSoup(resp.text, "html.parser")

        # ── Title ──────────────────────────────────────────────────
        title = None
        for selector in [
            ("div", {"id": "header"}),   # boards.greenhouse.io
            ("h1", {"class": "app-title"}),
            ("h1", {}),
        ]:
            tag, attrs = selector
            el = soup.find(tag, attrs)
            if el:
                h1 = el.find("h1") if tag != "h1" else el
                if h1:
                    title = h1.get_text(strip=True)
                    break

        if not title:
            log.warning("No title found for %s", url)
            return None

        # ── Location ───────────────────────────────────────────────
        location = ""
        header_div = soup.find("div", id="header")
        if header_div:
            loc_div = header_div.find("div", class_=lambda c: c and "location" in c.lower())
            if not loc_div:
                # fallback: second div inside header
                divs = header_div.find_all("div", recursive=False)
                loc_div = divs[0] if divs else None
            if loc_div:
                location = loc_div.get_text(strip=True)

        # ── Date posted (from JSON-LD) ─────────────────────────────
        date_posted = ""
        script = soup.find("script", {"type": "application/ld+json"})
        if script:
            try:
                ld = json.loads(script.string or "")
                date_posted = ld.get("datePosted", "")
            except json.JSONDecodeError:
                pass

        # ── Full description ───────────────────────────────────────
        description = ""
        for sel in ["#content", ".job-description", "#job-description",
                    ".section-wrapper", "section"]:
            el = soup.select_one(sel)
            if el:
                description = el.get_text(separator="\n", strip=True)
                break
        if not description:
            # last resort: grab all <p> text
            description = "\n".join(p.get_text(strip=True) for p in soup.find_all("p"))

        # Trim to 5000 chars — enough for the LLM analyzer
        description = description[:5000]

        # ── Company ────────────────────────────────────────────────
        company = extract_company_from_url(url)

        # ── Apply URL ──────────────────────────────────────────────
        # Greenhouse apply links are typically the same URL with #app at the end
        apply_url = url if url.endswith("/") else url

        return {
            "title":       title,
            "company":     company,
            "url":         url,
            "apply_url":   apply_url,
            "location":    location,
            "date_posted": date_posted,
            "description": description,
            "source":      "greenhouse",
        }

    except requests.RequestException as e:
        log.warning("Request failed for %s: %s", url, e)
        return None
    except Exception as e:
        log.warning("Unexpected error for %s: %s", url, e)
        return None


def main():
    urls = sys.argv[1:]

    if not urls:
        # No URLs passed — output empty array so Deno doesn't crash
        print(json.dumps([]))
        sys.exit(0)

    results = []
    for i, url in enumerate(urls):
        log.warning("Scraping %d/%d: %s", i + 1, len(urls), url)
        job = scrape_job(url)
        if job:
            results.append(job)
        # Polite delay between requests
        if i < len(urls) - 1:
            time.sleep(0.8)

    # Print JSON to stdout — this is what Deno reads
    print(json.dumps(results, ensure_ascii=False))


if __name__ == "__main__":
    main()