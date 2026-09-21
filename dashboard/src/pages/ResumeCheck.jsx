import { useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import './ResumeCheck.css'

function ScoreRing({ score }) {
  const tone = score >= 80 ? 'good' : score >= 60 ? 'warn' : 'bad'
  return (
    <div className={`rc-score-ring rc-score-ring--${tone}`}>
      <span className="rc-score-value">{score}%</span>
      <span className="rc-score-label">ATS match</span>
    </div>
  )
}

function RemovableKeyword({ keyword, tone, count, priority, onRemove }) {
  return (
    <span className={`rc-keyword rc-keyword--${tone} ${priority === 'required' ? 'rc-keyword--required' : ''}`}>
      {keyword}
      {priority === 'required' && <span className="rc-priority-dot">Required</span>}
      {priority === 'preferred' && <span className="rc-priority-dot rc-priority-dot--soft">Preferred</span>}
      {count > 0 && <span className="rc-keyword-count" title={`Mentioned ${count} time${count === 1 ? '' : 's'} in your resume`}>×{count}</span>}
      <button
        type="button"
        className="rc-keyword-remove"
        onClick={() => onRemove(keyword)}
        title={`Not relevant — remove "${keyword}" from this check`}
        aria-label={`Remove ${keyword}`}
      >
        ×
      </button>
    </span>
  )
}

function ClientEnvironmentCheck({ blocks }) {
  if (!blocks || blocks.length === 0) return null
  return (
    <div className="rc-env-check">
      <div className="rc-keyword-group-title">Environment vs. Responsibilities</div>
      <p className="rc-muted rc-env-intro">
        For each role, technologies listed in your Environment line but never mentioned in the Responsibilities bullets above it are flagged here.
      </p>
      <div className="rc-env-blocks">
        {blocks.map((block, i) => (
          <div key={`${block.client}-${i}`} className="rc-env-block">
            <div className="rc-env-client">{block.client}</div>
            {block.not_in_responsibilities.length === 0 ? (
              <span className="rc-muted">Every Environment technology is backed up in the bullets.</span>
            ) : (
              <div className="rc-keyword-list">
                {block.not_in_responsibilities.map((kw) => (
                  <span key={kw} className="rc-keyword rc-keyword--missing">{kw}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function BreakdownCard({ item }) {
  const tone = item.score >= 80 ? 'good' : item.score >= 60 ? 'warn' : 'bad'
  return (
    <div className="rc-breakdown-card">
      <div className="rc-breakdown-top">
        <strong>{item.label}</strong>
        <span className={`rc-breakdown-score rc-breakdown-score--${tone}`}>{item.score}%</span>
      </div>
      <div className="rc-meter" aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(100, item.score))}%` }} />
      </div>
      <p>{item.detail}</p>
      <small>{item.weight}% of score</small>
    </div>
  )
}

function ResumeCheck() {
  const [resumeText, setResumeText] = useState('')
  const [jdText, setJdText] = useState('')
  const [resumeFileName, setResumeFileName] = useState('')
  const [techStack, setTechStack] = useState(null)
  const [ats, setAts] = useState(null)
  const [envGaps, setEnvGaps] = useState(null)
  const [removed, setRemoved] = useState(() => new Set())
  const [checking, setChecking] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  const canExtract = jdText.trim().length > 20 && resumeText.trim().length > 20
  const hasJd = jdText.trim().length > 20
  const hasResume = resumeText.trim().length > 20

  async function handleResumeUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post('/api/resume-check/extract', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResumeText(res.data.text || '')
      setResumeFileName(res.data.filename || file.name)
      setTechStack(null)
      setAts(null)
      setEnvGaps(null)
      setRemoved(new Set())
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not read this resume file. Try DOCX, PDF, TXT, or paste the text.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleCheck() {
    setChecking(true)
    setError(null)
    try {
      const res = await api.post('/api/resume-check/analyze', {
        resume_text: resumeText,
        jd_text: jdText,
      })
      setTechStack(res.data.keywords || [])
      setAts(res.data.ats || null)
      setEnvGaps(res.data.client_environment_gaps || [])
      setRemoved(new Set())
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not analyze this resume and job description.')
    } finally {
      setChecking(false)
    }
  }

  function removeKeyword(keyword) {
    setRemoved((prev) => new Set(prev).add(keyword))
  }

  function restoreKeyword(keyword) {
    setRemoved((prev) => {
      const next = new Set(prev)
      next.delete(keyword)
      return next
    })
  }

  const visible = useMemo(
    () => (techStack || []).filter((k) => !removed.has(k.keyword)),
    [techStack, removed]
  )
  const matched = visible.filter((k) => k.in_resume)
  const missing = visible.filter((k) => !k.in_resume)
  const requiredMissing = missing.filter((k) => k.priority === 'required')
  const fallbackScore = visible.length > 0 ? Math.round((matched.length / visible.length) * 100) : 0
  const score = ats?.score ?? fallbackScore
  const removedList = [...removed].sort()

  return (
    <div className="rc-page">
      <div className="rc-header">
        <div>
          <p className="rc-kicker">Resume Intelligence</p>
          <h1 className="rc-title">Resume Check</h1>
          <p className="rc-subtitle">
            Upload your resume, paste the job description, and get a weighted ATS score with required-skill gaps and exact next steps.
          </p>
        </div>
        <button type="button" className="rc-check-btn" onClick={handleCheck} disabled={!canExtract || checking || uploading}>
          {checking ? 'Scoring…' : 'Run ATS Match'}
        </button>
      </div>

      <div className="rc-columns">
        <div className="rc-column">
          <div className="rc-column-head rc-column-head--stacked">
            <div>
              <strong>Resume</strong>
              <span className="rc-muted">{resumeText.trim().length} chars{resumeFileName ? ` · ${resumeFileName}` : ''}</span>
            </div>
            <div className="rc-upload-actions">
              <input
                ref={fileRef}
                type="file"
                accept=".doc,.docx,.pdf,.txt,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,text/plain"
                className="rc-file-input"
                onChange={handleResumeUpload}
                aria-label="Upload resume file"
              />
              <button type="button" className="rc-upload-btn" onClick={() => fileRef.current?.click()} disabled={uploading || checking}>
                {uploading ? 'Reading…' : 'Upload DOC/PDF'}
              </button>
            </div>
          </div>
          <textarea
            className="rc-textarea"
            value={resumeText}
            onChange={(e) => {
              setResumeText(e.target.value)
              setResumeFileName('')
            }}
            placeholder="Upload your resume or paste the resume text here…"
          />
        </div>

        <div className="rc-column">
          <div className="rc-column-head">
            <strong>Job Description</strong>
            <span className="rc-muted">{jdText.trim().length} chars</span>
          </div>
          <textarea
            className="rc-textarea"
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            placeholder="Paste the target job description here…"
          />
        </div>
      </div>

      {!canExtract && (jdText.length > 0 || resumeText.length > 0) && (
        <p className="rc-hint">Add both a resume and a job description with at least 20 characters to run the ATS check.</p>
      )}

      {error && <p className="rc-hint rc-hint--error">{error}</p>}

      {(techStack || envGaps || ats) && (
        <div className="rc-results">
          {hasJd && hasResume && ats && (
            <>
              <div className="rc-results-summary rc-results-summary--ats">
                <ScoreRing score={score} />
                <div className="rc-summary-copy">
                  <span className="rc-grade">{ats.grade}</span>
                  <strong>{matched.length} of {visible.length} ATS terms found</strong>
                  <p className="rc-muted">{ats.summary}</p>
                </div>
              </div>

              {ats.breakdown?.length > 0 && (
                <div className="rc-breakdown-grid">
                  {ats.breakdown.map((item) => <BreakdownCard key={item.label} item={item} />)}
                </div>
              )}

              {ats.next_actions?.length > 0 && (
                <div className="rc-next-actions">
                  <div className="rc-keyword-group-title">Best next edits</div>
                  <ol>
                    {ats.next_actions.map((action) => <li key={action}>{action}</li>)}
                  </ol>
                </div>
              )}
            </>
          )}

          {hasJd && visible.length === 0 && (
            <p className="rc-muted">
              {techStack.length === 0
                ? 'No ATS terms detected in this job description.'
                : 'All detected terms have been removed. Restore one below to see the list.'}
            </p>
          )}

          {hasJd && visible.length > 0 && (!hasResume ? (
            <>
              <div className="rc-keyword-group">
                <div className="rc-keyword-group-title">Detected ATS terms ({visible.length})</div>
                <div className="rc-keyword-list">
                  {visible.map(({ keyword, priority }) => (
                    <RemovableKeyword key={keyword} keyword={keyword} tone="neutral" priority={priority} onRemove={removeKeyword} />
                  ))}
                </div>
              </div>
              <p className="rc-hint">Upload or paste your resume on the left to see which terms you already cover.</p>
            </>
          ) : (
            <div className="rc-keyword-groups">
              <div className="rc-keyword-group rc-keyword-group--span">
                <div className="rc-keyword-group-title rc-keyword-group-title--missing">Required gaps ({requiredMissing.length})</div>
                <div className="rc-keyword-list">
                  {requiredMissing.length > 0
                    ? requiredMissing.map(({ keyword, priority }) => (
                        <RemovableKeyword key={keyword} keyword={keyword} tone="missing" priority={priority} onRemove={removeKeyword} />
                      ))
                    : <span className="rc-muted">No required-context gaps detected.</span>}
                </div>
              </div>

              <div className="rc-keyword-group">
                <div className="rc-keyword-group-title rc-keyword-group-title--good">Matched ({matched.length})</div>
                <div className="rc-keyword-list">
                  {matched.length > 0
                    ? matched.map(({ keyword, resume_count, priority }) => (
                        <RemovableKeyword key={keyword} keyword={keyword} tone="good" count={resume_count} priority={priority} onRemove={removeKeyword} />
                      ))
                    : <span className="rc-muted">No matches found.</span>}
                </div>
              </div>

              <div className="rc-keyword-group">
                <div className="rc-keyword-group-title rc-keyword-group-title--missing">Missing ({missing.length})</div>
                <div className="rc-keyword-list">
                  {missing.length > 0
                    ? missing.map(({ keyword, priority }) => (
                        <RemovableKeyword key={keyword} keyword={keyword} tone="missing" priority={priority} onRemove={removeKeyword} />
                      ))
                    : <span className="rc-muted">Nothing missing — great coverage.</span>}
                </div>
              </div>
            </div>
          ))}

          {hasResume && <ClientEnvironmentCheck blocks={envGaps} />}

          {removedList.length > 0 && (
            <div className="rc-removed-bar">
              <span className="rc-removed-label">Ignored ({removedList.length})</span>
              <div className="rc-removed-chips">
                {removedList.map((keyword) => (
                  <button
                    key={keyword}
                    type="button"
                    className="rc-removed-chip"
                    onClick={() => restoreKeyword(keyword)}
                    title={`Restore "${keyword}"`}
                  >
                    {keyword}
                    <span className="rc-removed-restore">+</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ResumeCheck
