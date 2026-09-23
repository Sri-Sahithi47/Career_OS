import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { getApiErrorMessage } from '../lib/errors'
import './PortalSettings.css'

export default function PortalSettings() {
  const [data, setData] = useState({ vendors: [], runs: [], today: [], busy: false })
  const [selected, setSelected] = useState(['teksystems'])
  const [keywords, setKeywords] = useState('python developer, data engineer')
  const [days, setDays] = useState(4)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const response = await api.get('/api/portals')
        if (active) { setData(response.data); setError('') }
      } catch (err) {
        if (active) setError(getApiErrorMessage(err, 'Unable to load portals.'))
      }
    }
    refresh()
    const timer = setInterval(refresh, 4000)
    return () => { active = false; clearInterval(timer) }
  }, [])

  const start = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await api.post('/api/portals/scrape', {
        vendors: selected, keywords: keywords.split(',').map(s => s.trim()).filter(Boolean),
        posted_within_days: Number(days),
      })
      setMessage('Search started. Results will appear in your job feed as each portal finishes.')
      const response = await api.get('/api/portals')
      setData(response.data)
    } catch (err) { setError(getApiErrorMessage(err, 'Unable to start search.')) }
    finally { setSubmitting(false) }
  }

  return (
    <div className="portal-settings">
      <p>Search {data.vendors.length || 33} staffing-company portals and bring the results into your Career OS job feed.</p>
      <div className="portal-note">These scrapers target senior software and data contract roles and exclude W2 and junior roles. Your Career OS matching filters still apply. To see staffing results, allow staffing agencies and recruiter posts, and enable all sources in Search config.</div>
      {error && <p role="alert" className="settings-banner error">{error}</p>}
      {message && <p role="status" className="settings-banner success">{message}</p>}
      <form onSubmit={start}>
        <label className="portal-field">Search keywords, separated by commas
          <input value={keywords} onChange={e => setKeywords(e.target.value)} required maxLength={3000} />
        </label>
        <label className="portal-field">Posted within days · 0 for any date
          <input type="number" min="0" max="90" value={days} onChange={e => setDays(e.target.value)} required />
        </label>
        <div className="portal-controls">
          <button type="button" className="secondary-action" onClick={() => setSelected(data.vendors.map(v => v.slug))}>Select all</button>
          <button type="button" className="secondary-action" onClick={() => setSelected(data.today)}>Today’s rotation</button>
          <button type="button" className="secondary-action" onClick={() => setSelected([])}>Clear</button>
          <span>{selected.length} selected</span>
        </div>
        <fieldset className="portal-grid"><legend>Job portals</legend>
          {data.vendors.map(vendor => (
            <label key={vendor.slug} className={selected.includes(vendor.slug) ? 'portal-option selected' : 'portal-option'}>
              <input type="checkbox" checked={selected.includes(vendor.slug)} onChange={e => setSelected(current => e.target.checked ? [...current, vendor.slug] : current.filter(s => s !== vendor.slug))} />
              <span>{vendor.label}{!vendor.supports_keywords && <small>Uses portal’s built-in search</small>}</span>
            </label>
          ))}
        </fieldset>
        <button className="primary-action" disabled={submitting || data.busy || !selected.length}>
          {submitting ? 'Starting…' : data.busy ? 'Search in progress…' : 'Search selected portals'}
        </button>
      </form>
      <h3>Recent searches</h3>
      {data.runs.length === 0 ? <p>No searches yet. Choose a portal above to get started.</p> : (
        <div className="portal-runs" aria-live="polite">
          {data.runs.map(run => (
            <div className="portal-run" key={run.id}>
              <div><strong>{data.vendors.find(v => v.slug === run.vendor)?.label || run.vendor}</strong><small>{new Date(run.started_at + (run.started_at.endsWith('Z') ? '' : 'Z')).toLocaleString()}</small></div>
              <span>{run.status === 'done' ? `${run.jobs_found} jobs imported` : run.status}</span>
              {run.error && <p role="alert">{run.error}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
