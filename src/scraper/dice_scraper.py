"""
DiceScraper Module
-----------------
Handles Dice.com job search automation using Playwright.
"""

import os
import time
import random
import hashlib
from urllib.parse import quote_plus
from typing import List, Optional
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page, BrowserContext
from .job_scraper import JobListing, build_job_id
from src.settings import settings

class DiceScraper:
    """
    Dice.com Job Scraper using Playwright.
    """

    def __init__(
        self,
        chrome_path: str = "",
        chrome_profile_path: str = "",
        blacklist_path: str = "",
        action_delay: float = 2.0,
        max_jobs: int = None,
        headless: bool = False
    ):
        self.chrome_path = chrome_path
        self.chrome_profile_path = chrome_profile_path
        self.action_delay = action_delay
        self.max_jobs = max_jobs or settings.MAX_JOBS_TO_COLLECT
        self.headless = headless
        self.blacklist_keywords = self._load_blacklist(blacklist_path)

        from .history_manager import HistoryManager
        self.history = HistoryManager()
        
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.playwright = None

    def _load_blacklist(self, blacklist_path: str) -> List[str]:
        keywords = []
        if os.path.exists(blacklist_path):
            with open(blacklist_path, 'r') as f:
                for line in f:
                    line = line.strip().lower()
                    if line and not line.startswith('#'):
                        keywords.append(line)
        return keywords

    def start_browser(self) -> bool:
        try:
            print("[INFO] Starting Chrome browser for Dice...")
            self.playwright = sync_playwright().start()
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            session_dir = os.path.join(base_dir, 'chrome_session_dice')
            os.makedirs(session_dir, exist_ok=True)

            self.context = self.playwright.chromium.launch_persistent_context(
                user_data_dir=session_dir,
                channel='chrome',
                headless=self.headless,
                slow_mo=50,
                args=['--disable-blink-features=AutomationControlled']
            )

            self.page = self.context.pages[0] if self.context.pages else self.context.new_page()
            return True
        except Exception as e:
            print(f"[ERROR] Failed to start browser: {e}")
            return False

    def close_browser(self):
        if self.context:
            self.context.close()
        if self.playwright:
            self.playwright.stop()

    def build_dice_url(self, keywords: str) -> str:
        encoded_keywords = quote_plus(keywords)
        # Filters: Remote, Posted in last 7 days
        return f"https://www.dice.com/jobs?q={encoded_keywords}&location=Remote&radius=30&radiusUnit=mi&page=1&pageSize=20&language=en"

    def collect_jobs(self, search_keywords: str) -> List[JobListing]:
        if not self.start_browser():
            return []

        jobs = []
        try:
            url = self.build_dice_url(search_keywords)
            print(f"[INFO] Navigating to Dice: {url}")
            self.page.goto(url, wait_until='domcontentloaded', timeout=60000)
            time.sleep(3)

            # Wait for job cards
            self.page.wait_for_selector('d-search-card', timeout=10000)
            cards = self.page.query_selector_all('d-search-card')
            print(f"[INFO] Found {len(cards)} job cards on Dice")

            for card in cards:
                if len(jobs) >= self.max_jobs:
                    break
                
                try:
                    title_elem = card.query_selector('a.card-title-link')
                    title = title_elem.inner_text().strip()
                    link = title_elem.get_attribute('href')
                    
                    company_elem = card.query_selector('a[data-cy="search-result-company-name"]')
                    company = company_elem.inner_text().strip() if company_elem else "Unknown"
                    
                    location_elem = card.query_selector('span[data-cy="search-result-location"]')
                    location = location_elem.inner_text().strip() if location_elem else "Remote"

                    if title and link:
                        job = JobListing(
                            company_name=company,
                            job_title=title,
                            job_link=link,
                            posting_date="Recent",
                            role_type="Entry-level",
                            location=location,
                            source="dice",
                            search_query=search_keywords
                        )
                        jobs.append(job)
                        print(f"[{len(jobs)}] {title} @ {company}")
                except Exception:
                    continue

            # Fetch descriptions
            for job in jobs:
                print(f"[INFO] Fetching Dice description for: {job.job_title}")
                self.page.goto(job.job_link, wait_until='domcontentloaded', timeout=30000)
                time.sleep(2)
                desc_elem = self.page.query_selector('#jobDescription') or self.page.query_selector('.job-details')
                if desc_elem:
                    job.job_description = desc_elem.inner_text().strip()
                
        except Exception as e:
            print(f"[ERROR] Dice collection failed: {e}")
        finally:
            self.close_browser()
            self.history.save_history()

        return jobs
