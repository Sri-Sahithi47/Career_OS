#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
SCRAPER_FRONTEND=services/job_scrapper/java-dashboard/frontend
npm ci --prefix "$SCRAPER_FRONTEND"
npm run build --prefix "$SCRAPER_FRONTEND"
SCRAPER_JAVA_HOME="$(java -XshowSettings:properties -version 2>&1 | sed -n 's/^[[:space:]]*java.home = //p')"
JAVA_HOME="$SCRAPER_JAVA_HOME" mvn -q -f services/job_scrapper/java-dashboard/backend/pom.xml package -DskipTests
