import { useEffect, useMemo, useState } from 'react';

export function engagement(job) {
  const text = [job.title, job.raw_text, job.description, job.description_snippet, job.employment_type].filter(Boolean).join(' ');
  if (/\b(no|not)\s+(c2c|corp.to.corp)|w.?2\s+only|no\s+third.party|c2c\s+(?:is\s+)?not/i.test(text)) return 'Restrictions found';
  return /\bc2c\b|corp.to.corp/i.test(text) ? 'C2C mentioned' : 'Not specified';
}
const safeUrl = job => /^https?:\/\//i.test(job.job_url || job.apply_url || '') ? (job.job_url || job.apply_url) : '';

export default function Results({ vendors, loaded, api, refreshKey, onReview }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [signal, setSignal] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState('');
  const [saved, setSaved] = useState([]);
  const [saving, setSaving] = useState('');
  useEffect(() => {
    if (!loaded) return;
    let active = true;
    setLoading(true);
    Promise.allSettled(vendors.filter(v => v.latest_count > 0 || v.error).map(async v => {
      const data = await api(`/api/jobs?vendor=${encodeURIComponent(v.slug)}`);
      return (data.jobs || []).map((job, index) => ({ ...job, sourceLabel: v.label, sourceSlug: v.slug, key: `${v.slug}:${job.job_url || job.job_id || index}` }));
    })).then(results => {
      if (!active) return;
      const rows = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
      rows.sort((a,b) => (Date.parse(b.posted_date) || 0) - (Date.parse(a.posted_date) || 0));
      setJobs(rows);
      setError(results.some(r => r.status === 'rejected') ? 'Some portal results could not be loaded. Use Refresh to retry.' : '');
      setLoading(false);
    });
    return () => { active = false; };
  }, [loaded, refreshKey]);
  const filtered = useMemo(() => jobs.filter(job => `${job.title} ${job.sourceLabel}`.toLowerCase().includes(query.toLowerCase()) && (!location || job.location === location) && (!signal || engagement(job) === signal)), [jobs, query, location, signal]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 8) - 1));
  const visible = filtered.slice(currentPage * 8, currentPage * 8 + 8);
  const chosen = filtered.find(job => job.key === selected) || visible[0];
  async function save(job) {
    setSaving(job.key); setError('');
    try {
      await api('/api/workspace-save', { method: 'POST', body: JSON.stringify({ title: job.title, company: job.company || job.sourceLabel, url: safeUrl(job), description: job.raw_text || job.description || job.description_snippet, location: job.location, employment_type: job.employment_type, source: job.sourceSlug, salary: job.salary }) });
      setSaved(previous => [...previous, job.key]);
    } catch (e) { setError(e.message); }
    finally { setSaving(''); }
  }
  return <section className="results-view" aria-label="Job results">
    <div className="results-tools">
      <label className="portal-search"><span className="sr-only">Search results</span><input type="search" placeholder="Search jobs…" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label>
      <select aria-label="Filter by location" value={location} onChange={e => { setLocation(e.target.value); setPage(0); }}><option value="">All locations</option>{[...new Set(jobs.map(j => j.location).filter(Boolean))].sort().map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="Filter by engagement" value={signal} onChange={e => { setSignal(e.target.value); setPage(0); }}><option value="">Engagement</option>{['C2C mentioned', 'Not specified', 'Restrictions found'].map(value => <option key={value}>{value}</option>)}</select>
    </div>
    <p className="results-count" role="status">{loading ? 'Loading portal results…' : `${filtered.length} results`} <span>· C2C terms require review</span></p>
    {error && <p className="notice error-notice" role="alert">{error}</p>}
    <div className="results-table-wrap"><table className="results-table"><thead><tr><th>Role</th><th>Source</th><th>Location</th><th>Engagement</th><th>Posted</th><th><span className="sr-only">Save job</span></th></tr></thead><tbody>{visible.map(job => <tr key={job.key} className={chosen?.key === job.key ? 'result-selected' : ''}>
      <td><button className="result-title" onClick={() => setSelected(job.key)}>{job.title || 'Untitled role'}</button><small>{job.employment_type || 'Contract terms not provided'}</small></td><td>{job.sourceLabel}</td><td>{job.location || 'Not listed'}</td><td><span className={engagement(job) === 'C2C mentioned' ? 'engagement-tag' : 'engagement-unknown'}>{engagement(job)}</span></td><td>{job.posted_date ? job.posted_date.slice(0,10) : 'Not listed'}</td><td><button className="bookmark-action" aria-label={`${saved.includes(job.key) ? 'Saved' : 'Save'} ${job.title}`} disabled={Boolean(saving) || saved.includes(job.key)} onClick={() => save(job)}>{saved.includes(job.key) ? '✓' : <svg width="17" height="20" viewBox="0 0 20 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 3h12v18l-6-4-6 4z" /></svg>}</button></td>
    </tr>)}</tbody></table></div>
    {!loading && !filtered.length && <div className="directory-empty"><h3>{jobs.length ? 'No matching results' : 'Your next opportunity starts here'}</h3><p>{jobs.length ? 'Try another keyword or clear your filters.' : 'Choose your portals and run a search to find roles.'}</p></div>}
    {chosen && <div className="result-preview"><div><h2>{chosen.title}</h2><p>{chosen.sourceLabel} · {chosen.location || 'Location not listed'}</p><p className="preview-description">{chosen.description_snippet || 'Open the posting to review the full role and engagement terms.'}</p></div><div className="buttons">{safeUrl(chosen) && <a className="posting-action" href={safeUrl(chosen)} target="_blank" rel="noreferrer">Open posting ↗</a>}<button onClick={e => onReview(chosen.sourceSlug, chosen.sourceLabel, e)}>Review portal jobs</button><button className="save-job" disabled={Boolean(saving) || saved.includes(chosen.key)} onClick={() => save(chosen)}>{saved.includes(chosen.key) ? 'Saved to shortlist' : saving === chosen.key ? 'Saving…' : 'Save job'}</button></div></div>}
    <footer className="results-pagination"><span>{filtered.length ? `Showing ${currentPage * 8 + 1}–${Math.min((currentPage + 1) * 8, filtered.length)} of ${filtered.length}` : '0 results'}</span><div className="buttons"><button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Previous</button><button disabled={(currentPage + 1) * 8 >= filtered.length} onClick={() => setPage(currentPage + 1)}>Next →</button></div></footer>
  </section>;
}
