import { formatCompactDate, getDisplayMatchScore, getJobId, getSourceLabel } from '../lib/jobs'
import './JobCard.css'

const COMPANY_THEMES = ['purple', 'black', 'violet', 'coral', 'black', 'indigo', 'blue', 'ink']

function getCompanyTheme(company = '') {
  const input = company || 'job'
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33 + input.charCodeAt(index)) % COMPANY_THEMES.length
  }
  return COMPANY_THEMES[Math.abs(hash)]
}

/** Human-readable match label instead of raw % */
function getMatchLabel(score) {
  if (!score) return { label: 'Not scored', cls: 'score-warm' }
  if (score >= 90) return { label: 'Top match', cls: 'score-great' }
  if (score >= 75) return { label: 'Strong fit', cls: 'score-good' }
  return { label: 'Good fit', cls: 'score-warm' }
}

function truncatePreview(text = '', length = 140) {
  if (!text) return ''
  const t = text.trim()
  if (t.length <= length) return t
  return t.substring(0, length).trim() + '…'
}

function JobCard({ job, onClick, compact = false, selected = false }) {
  const companyInitial = (job.Company || 'J').trim().charAt(0).toUpperCase()
  const score         = getDisplayMatchScore(job)
  const source        = getSourceLabel(job)
  const location      = job.Location || 'Location not listed'
  const posted        = formatCompactDate(job['Date Found'])
  const jobType       = job['Job Type'] || job['Employment Type'] || job.remote || 'Type not listed'
  const salary        = job.Salary || job.salary || ''

  const preview = truncatePreview(job.Description || job.description || job['Job Description'] || '')

  const timeSignal = posted ? `Posted ${posted}` : ''

  return (
    <article
      className={`job-card animate-reveal ${compact ? 'job-card-compact' : ''} ${selected ? 'job-card-selected' : ''}`}
      onClick={() => onClick?.(job)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(job) } }}
      data-job-id={getJobId(job)}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
    >
      <div className="job-card-main">
        {/* Company logo */}
        <span
          className={`company-monogram company-${getCompanyTheme(job.Company)}`}
          aria-hidden="true"
        >
          {companyInitial}
        </span>

        {/* Content */}
        <div className="job-card-copy">
          {/* Row 1: Title + Match Badge */}
          <div className="job-card-title-row">
            <h3 className="job-card-title">{job.Title || 'Untitled role'}</h3>
            {(() => { const m = getMatchLabel(score); return <span className={`jc-match-badge ${m.cls}`}>{m.label}</span> })()}
          </div>

          {!compact && (
            <>
              {/* Row 2: Company + Location */}
              <p className="job-card-company">
                <span>{job.Company || 'Discovery'}</span>
                <span className="jc-sep">·</span>
                <span>{location}</span>
              </p>

              {/* Row 3: Salary (PRIORITIZED) */}
              {salary && (
                <p className="job-card-salary">{salary}</p>
              )}

              {/* Row 4: 1-Line Summary */}
              {preview && (
                <p className="job-card-summary">{preview}</p>
              )}

              {/* Row 5: Metadata Footer (Time Signal + Source) */}
              <div className="job-card-footer-row">
                <div className="jc-metadata">
                  {timeSignal && <span className="jc-time-point">{timeSignal}</span>}
                  <span className="jc-sep">·</span>
                  <span>{jobType}</span>
                </div>
                {source && <span className="jc-source-tag">{source}</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  )
}

export default JobCard
