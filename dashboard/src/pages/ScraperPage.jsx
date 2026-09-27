import { useState } from 'react'
import LegacyScraper from './LegacyScraper'

export default function ScraperPage() {
  const [original, setOriginal] = useState(false)
  return <div className="scraper-page">
    <div className="scraper-workspace-bar">
      <div className="scraper-breadcrumb">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V21H3Z"/><path d="M9 21v-7h6v7"/></svg>
        <span>Sourcing</span><span aria-hidden="true">/</span><strong>Job Scraper</strong>
      </div>
      <nav className="scraper-page-tabs" aria-label="Scraper tools">
        <button aria-pressed={!original} onClick={() => setOriginal(false)}>Portal workspace</button>
        <button aria-pressed={original} onClick={() => setOriginal(true)}>Application controls</button>
      </nav>
    </div>
    <LegacyScraper key={String(original)} original={original} />
  </div>
}
