import { useEffect, useState } from 'react';

export function engagement(job) {
  const text = [job.title, job.raw_text, job.description, job.description_snippet, job.employment_type].filter(Boolean).join(' ');
  if (/\b(no|not)\s+(c2c|corp.to.corp)|w.?2\s+only|no\s+third.party|c2c\s+(?:is\s+)?not/i.test(text)) return 'Restrictions found';
  return /\bc2c\b|corp.to.corp/i.test(text) ? 'C2C mentioned' : 'Not specified';
}
const safeUrl = job => /^https?:\/\//i.test(job.job_url || '') ? job.job_url : '';
const dateLabel = value => value ? new Date(value).toLocaleDateString() : 'Not listed';

export function dateBounds(preset, days, start, end, now = new Date()) {
  if (preset === 'all') return {};
  const from = new Date(now); from.setHours(0, 0, 0, 0);
  const until = new Date(from); until.setDate(until.getDate() + 1);
  if (preset === 'custom') {
    if (!start || !end) return {};
    const a = new Date(start + 'T00:00:00'), b = new Date(end + 'T00:00:00');
    b.setDate(b.getDate() + 1);
    return { from: a.toISOString(), until: b.toISOString() };
  }
  if (preset === 'yesterday') { until.setTime(from.getTime()); from.setDate(from.getDate() - 1); }
  else if (preset !== 'today') from.setDate(from.getDate() - Math.max(0, Number(preset === 'days' ? days : preset) - 1));
  return { from: from.toISOString(), until: until.toISOString() };
}

export default function Results({ vendors, loaded, api, refreshKey, onRefresh, refreshing }) {
  const [data, setData] = useState({ jobs: [], total: 0, counts: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState('new');
  const [portal, setPortal] = useState('');
  const [group, setGroup] = useState('all');
  const [location, setLocation] = useState('');
  const [signal, setSignal] = useState('');
  const [remote, setRemote] = useState(false);
  const [preset, setPreset] = useState('all');
  const [days, setDays] = useState(7);
  const [field, setField] = useState('first_seen');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [unknown, setUnknown] = useState(true);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState('');
  const [checked, setChecked] = useState([]);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const invalidRange = preset === 'custom' && (!start || !end || start > end);
  const invalidDays = preset === 'days' && (!Number.isInteger(Number(days)) || Number(days) < 1 || Number(days) > 3650);
  useEffect(() => {
    if (!loaded || invalidRange || invalidDays) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ view, portal, group, location, engagement: signal, remote: String(remote), q: query, page, limit: 25, date_field: field,
          include_unknown: String(unknown), ...dateBounds(preset, days, start, end) });
        const result = await api('/api/collected?' + params);
        if (active) {
          if (page > 1 && !result.jobs.length && result.total > 0) { setPage(1); return; }
          setData(result); setError(''); setChecked([]);
        }
      } catch (e) { if (active) setError(e.message); }
      finally { if (active) setLoading(false); }
    }, 180);
    return () => { active = false; clearTimeout(timer); };
  }, [loaded, refreshKey, revision, query, view, portal, group, location, signal, remote, page, preset, days, start, end, field, unknown, invalidRange, invalidDays]);
  const chosen = data.jobs.find(j => j.key === selected) || data.jobs[0];
  const filter = setter => event => { setter(event.target.value); setPage(1); };
  async function review(ids, state) {
    setSaving(true); setError('');
    try {
      await api('/api/collected/review', { method: 'POST', body: JSON.stringify({ ids, state }) });
      setNotice(state === 'dismissed' ? 'Moved to Dismissed. You can restore these jobs there.' : state === 'new' ? 'Restored to New to review.' : 'Marked as reviewed.');
      setRevision(v => v + 1);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }
  async function save(job) {
    setSaving(true); setError('');
    try {
      await api('/api/workspace-save', { method: 'POST', body: JSON.stringify({ title: job.title, company: job.company || job.sourceLabel, url: safeUrl(job), description: job.raw_text || job.description || job.description_snippet, location: job.location, employment_type: job.employment_type, source: job.sourceSlug, salary: job.salary }) });
      setData(previous => ({ ...previous, jobs: previous.jobs.map(row => row.key === job.key ? { ...row, saved: true } : row) }));
      setNotice('Saved to shortlist.');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }
  return <section className="results-view collected-view" aria-label="Collected jobs">
    <div className="collection-heading"><div><h2>Your collected jobs</h2><p>Only jobs that passed AI review. Your approved jobs stay available across searches.</p></div>
      <button disabled={loading} onClick={() => setRevision(v => v + 1)}>Reload collection</button></div>
    <nav className="collection-views" aria-label="Collection views">{[['new','New to review'],['all','All collected'],['updated','Updated'],['reviewed','Reviewed'],['dismissed','Dismissed']].map(([value,label]) => <button key={value} aria-pressed={view === value} onClick={() => { setView(value); setPage(1); }}>{label}{data.counts[value] !== undefined && <span>{data.counts[value]}</span>}</button>)}</nav>
    <div className="results-tools collection-filters">
      <label className="portal-search"><span className="sr-only">Search results</span><input type="search" placeholder="Search collected jobs…" value={query} onChange={filter(setQuery)} /></label>
      <select aria-label="Collected portal" value={portal} onChange={filter(setPortal)}><option value="">All portals</option>{vendors.map(v => <option key={v.slug} value={v.slug}>{v.label}</option>)}</select>
      <select aria-label="Collected company group" value={group} onChange={filter(setGroup)}><option value="all">All companies</option><option value="important">Prime</option><option value="optional">Others</option></select>
      <select aria-label="Filter by location" value={location} onChange={filter(setLocation)}><option value="">All locations</option>{(data.locations || []).map(v => <option key={v}>{v}</option>)}</select>
      <select aria-label="Filter by engagement" value={signal} onChange={filter(setSignal)}><option value="">All engagement terms</option>{['C2C mentioned','Restrictions found','Not specified'].map(v => <option key={v}>{v}</option>)}</select>
      <label className="collection-inline-label"><input type="checkbox" checked={remote} onChange={e => { setRemote(e.target.checked); setPage(1); }} />Remote</label>
      <select aria-label="Date field" value={field} onChange={filter(setField)}><option value="first_seen">Found on</option><option value="posted_at">Posted on</option><option value="last_seen">Last seen</option></select>
      <select aria-label="Date range" value={preset} onChange={filter(setPreset)}>{[['all','Any time'],['today','Today'],['yesterday','Yesterday'],['7','Last 7 days'],['30','Last 30 days'],['days','Last N days'],['custom','Custom dates']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select>
      {preset === 'days' && <label className="collection-inline-label">Days<input aria-label="Number of days" type="number" min="1" max="3650" value={days} onChange={filter(setDays)} /></label>}
      {preset === 'custom' && <><input aria-label="From date" type="date" value={start} onChange={filter(setStart)} /><input aria-label="Through date" type="date" value={end} onChange={filter(setEnd)} /></>}
      {field === 'posted_at' && <label className="collection-inline-label"><input type="checkbox" checked={unknown} onChange={e => { setUnknown(e.target.checked); setPage(1); }} />Include unknown dates</label>}
    </div>
    {(invalidRange || invalidDays) && <p role="alert">Choose a valid {invalidDays ? 'number of days (1–3650)' : 'start and end date'}.</p>}
    <div className="collection-meta"><span role="status">{loading ? 'Loading collected jobs…' : `${data.total} AI-approved jobs`}</span><span>Dates use your timezone · C2C terms require review</span></div>
    {data.run_summary && <p className="collection-run-summary">Last search · {data.run_summary.new} new · {data.run_summary.updated} updated · {data.run_summary.known} already known{data.run_summary.failed_portals > 0 ? ` · ${data.run_summary.failed_portals} portals need attention` : ''}{['running','stopping','interrupted'].includes(data.run_summary.status) ? ` · ${data.run_summary.status}` : ''}</p>}
    {notice && <div className="collection-notice" role="status">{notice}<button aria-label="Dismiss collection message" onClick={() => setNotice('')}>×</button></div>}
    {error && <p className="notice error-notice" role="alert">{error}</p>}
    {data.warnings?.length > 0 && <p role="status" className="notice">{[...new Set(data.warnings)].join('. ')}</p>}
    {checked.length > 0 && <div className="collection-bulk"><strong>{checked.length} selected</strong><button disabled={saving || loading} onClick={() => review(checked, 'reviewed')}>Mark reviewed</button><button disabled={saving || loading} onClick={() => review(checked, view === 'dismissed' ? 'new' : 'dismissed')}>{view === 'dismissed' ? 'Restore' : 'Dismiss'}</button></div>}
    <div className="results-table-wrap"><table className="results-table"><thead><tr><th><input type="checkbox" aria-label="Select this page" checked={data.jobs.length > 0 && checked.length === data.jobs.length} disabled={loading} onChange={e => setChecked(e.target.checked ? data.jobs.map(j => j.key) : [])} /></th><th>Role</th><th>Portal</th><th>Location</th><th>Found</th><th>Posted</th><th>Review</th><th>Save</th></tr></thead><tbody>{!invalidRange && !invalidDays && data.jobs.map(job => <tr key={job.key} className={chosen?.key === job.key ? 'result-selected' : ''}>
      <td><input type="checkbox" aria-label={`Select ${job.title}`} checked={checked.includes(job.key)} disabled={loading} onChange={e => setChecked(prev => e.target.checked ? [...prev,job.key] : prev.filter(k => k !== job.key))} /></td>
      <td><button className="result-title" onClick={() => setSelected(job.key)}>{job.title || 'Untitled role'}</button><small>{engagement(job)}{job.application_status === 'applied' ? ' · Applied' : ''}</small></td><td>{job.sourceLabel}</td><td>{job.location || 'Not listed'}</td><td>{dateLabel(job.first_seen)}</td><td>{job.posted_date ? String(job.posted_date).slice(0,10) : 'Unknown'}</td><td><span className="collection-state">{job.review_state === 'dismissed' ? 'Dismissed' : job.has_update ? 'Updated' : job.review_state === 'new' ? 'New' : 'Reviewed'}</span></td><td><button aria-label={`${job.saved ? 'Saved' : 'Save'} ${job.title}`} disabled={saving || loading || job.saved} onClick={() => save(job)}>{job.saved ? 'Saved ✓' : 'Save'}</button></td>
    </tr>)}</tbody></table></div>
    {!loading && !error && !data.total && <div className="directory-empty"><h3>{view === 'new' ? 'No AI-approved jobs to review' : 'No AI-approved jobs in this view'}</h3><p>Run “Check All Portals with AI” from Portals to review scraped jobs, or change these filters.</p></div>}
    {chosen && !invalidRange && !invalidDays && <div className="result-preview"><div><h2>{chosen.title}</h2><p>{chosen.sourceLabel} · {chosen.location || 'Location not listed'} · Last seen {dateLabel(chosen.last_seen)}</p><p className="preview-description">{chosen.raw_text || chosen.description || chosen.description_snippet || 'Description unavailable. Open the original posting for details.'}</p></div><div className="buttons">{safeUrl(chosen) && <a className="posting-action" href={safeUrl(chosen)} target="_blank" rel="noreferrer">Open posting ↗</a>}<button disabled={loading || refreshing || !onRefresh} title="Search this portal again, bypassing cached descriptions" onClick={() => onRefresh(chosen.sourceSlug)}>Refresh portal details</button><button disabled={saving || loading} onClick={() => review([chosen.key], 'reviewed')}>Mark reviewed</button><button disabled={saving || loading} onClick={() => review([chosen.key], chosen.review_state === 'dismissed' ? 'new' : 'dismissed')}>{chosen.review_state === 'dismissed' ? 'Restore' : 'Dismiss'}</button><button className="save-job" disabled={saving || loading || chosen.saved} onClick={() => save(chosen)}>{chosen.saved ? 'Saved to shortlist' : saving ? 'Saving…' : 'Save job'}</button></div></div>}
    <footer className="results-pagination"><span>{data.date_note}</span><div className="buttons"><span>Page {page} of {Math.max(1, Math.ceil(data.total / 25))}</span><button disabled={loading || page === 1} onClick={() => setPage(p => p - 1)}>Previous</button><button disabled={loading || page * 25 >= data.total} onClick={() => setPage(p => p + 1)}>Next →</button></div></footer>
  </section>;
}
