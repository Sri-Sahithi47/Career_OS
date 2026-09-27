import Results from "./Results";
import { useEffect, useMemo, useRef, useState } from "react";

const API = "http://127.0.0.1:8766";

function formatPostedDate(value) {
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return text;
  const date = new Date(text.slice(0, 10) + 'T12:00:00');
  return Number.isNaN(date.getTime()) ? text : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Icon({ name, size = 16 }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 18 17" /></>,
    play: <path d="m9 5 10 7-10 7z" />,
    filter: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2" fill="currentColor" /><circle cx="15" cy="17" r="2" fill="currentColor" /></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    check: <path d="m5 12 4 4L19 6" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="1" />,
    chevron: <path d="m9 5 7 7-7 7" />,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function portalInitials(label) {
  const words = label.replace(/[^a-zA-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  return words.length > 1 ? words.slice(0, 2).map(word => word[0]).join("") : label.slice(0, 2).toUpperCase();
}

export default function App() {
  const [resultsVersion, setResultsVersion] = useState(0);
  const [view, setView] = useState("results");
  const [portalQuery, setPortalQuery] = useState("");
  const [portalFilter, setPortalFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("jobs");
  const [loaded, setLoaded] = useState(false);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const drawer = useRef(null);
  const pointerOpening = useRef(false);
  const [config, setConfig] = useState({});
  const [vendors, setVendors] = useState([]);
  const [selected, setSelected] = useState([]);
  const [runs, setRuns] = useState([]);
  const [scrapeStopSupported, setScrapeStopSupported] = useState(false);
  const [allDaysSupported, setAllDaysSupported] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Ready.");
  const [error, setError] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  const [ignoreTitlesText, setIgnoreTitlesText] = useState("");
  const [jobsPanel, setJobsPanel] = useState({ open: false, vendor: "", slug: "", jobs: [], loading: false, error: "" });
  const [expandedJobId, setExpandedJobId] = useState(null);
  const [selectedJobIds, setSelectedJobIds] = useState([]);
  const [aiCleaning, setAiCleaning] = useState(false);
  const [aiAllStatus, setAiAllStatus] = useState("");
  useEffect(() => {
    if (!aiAllStatus || aiCleaning) return;
    const timeout = setTimeout(() => setAiAllStatus(""), 8000);
    return () => clearTimeout(timeout);
  }, [aiAllStatus, aiCleaning]);

  const defaultsApplied = useRef(false);
  const keywordsInitialized = useRef(false);
  const ignoreTitlesInitialized = useRef(false);

  const latestRun = useMemo(() => runs[runs.length - 1], [runs]);
  const activeScrape = runs.find((run) => ["running", "stopping"].includes(run.status));
  const visibleVendors = useMemo(() => {
    const rows = vendors.filter(v => v.label.toLowerCase().includes(portalQuery.toLowerCase())
      && (portalFilter !== "results" || v.latest_count > 0)
      && (portalFilter !== "rotation" || v.active_today));
    if (sortOrder === "jobs") rows.sort((a, b) => b.latest_count - a.latest_count);
    if (sortOrder === "name") rows.sort((a, b) => a.label.localeCompare(b.label));
    return rows;
  }, [vendors, portalQuery, portalFilter, sortOrder]);
  const allChecked = visibleVendors.length > 0 && visibleVendors.every((v) => selected.includes(v.slug));
  const jobsCount = vendors.reduce((total, v) => total + (v.latest_count || 0), 0);

  useEffect(() => {
    if (!jobsPanel.open) return;
    const previous = document.activeElement;
    drawer.current?.querySelector('button')?.focus({ preventScroll: true });
    function onKey(event) {
      if (event.key === "Escape") setJobsPanel(prev => ({ ...prev, open: false }));
      if (event.key !== "Tab") return;
      const nodes = [...drawer.current.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href]')];
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previous?.focus({ preventScroll: true }); };
  }, [jobsPanel.open]);

  function stripQuotes(s) {
    while (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) {
      s = s.slice(1, -1).trim();
    }
    return s;
  }

  function parseKeywords(text) {
    return text.split(/\n+/).map((x) => stripQuotes(x.trim())).filter(Boolean);
  }

  async function api(path, options = {}) {
    const r = await fetch(`${API}${path}`, { headers: { "Content-Type": "application/json" }, ...options });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) throw new Error(data.error || r.statusText);
    return data;
  }

  async function refresh() {
    try {
      const c = await api("/api/config");
      setConfig(c.config || {});
      setLoaded(true);
      setVendors(c.vendors || []);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }

  async function refreshStatus() {
    try {
      const s = await api("/api/status");
      setRuns(s.runs || []);
      setScrapeStopSupported(s.scrape_stop_supported === true);
      setAllDaysSupported(s.teksystems_all_days_supported === true);
      setVendors(s.vendors || []);
      setError(s.last_error || "");
    } catch (e) {
      setError(e.message);
    }
  }

  async function saveConfig() {
    const next = { ...config, keywords: parseKeywords(keywordsText), ignore_titles: parseKeywords(ignoreTitlesText) };
    const r = await api("/api/config", { method: "POST", body: JSON.stringify(next) });
    const saved = r.config || next;
    setConfig(saved);
    setKeywordsText((saved.keywords || []).join("\n"));
    setIgnoreTitlesText((saved.ignore_titles || []).join("\n"));
    setDirty(false);
    await refreshStatus();
    setResultsVersion(version => version + 1);
    if (jobsPanel.open && jobsPanel.slug) await openJobsPanel(jobsPanel.slug, jobsPanel.vendor);
  }

  async function scrape(mode, selected = []) {
    setBusy(true);
    try {
      setError("");
      await saveConfig();
      await api("/api/scrape", { method: "POST", body: JSON.stringify({ mode, vendors: selected }) });
      setSelected([]);
      setMessage("Fresh scrape started. Old counts remain visible until new output finishes.");
      await refreshStatus();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function stopScrape() {
    if (!activeScrape) return;
    setBusy(true);
    try {
      await api("/api/scrape/stop", { method: "POST", body: JSON.stringify({ run_id: activeScrape.id }) });
      setMessage("Stopping scrape. Completed results are kept.");
      await refreshStatus();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function stopOpenVendor(slug) {
    setBusy(true);
    try {
      setError("");
      await api("/api/open/stop", { method: "POST", body: JSON.stringify({ vendor: slug }) });
      setMessage(`Stopped opening ${slug} jobs.`);
      await refreshStatus();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function openJobsPanel(slug, label, event) {
    if (event) pointerOpening.current = event.detail > 0;
    setExpandedJobId(null);
    setSelectedJobIds([]);
    setJobsPanel({ open: true, vendor: label, slug, jobs: [], loading: true, error: "" });
    try {
      const r = await api(`/api/jobs?vendor=${encodeURIComponent(slug)}`);
      setJobsPanel(prev => prev.slug === slug ? { ...prev, jobs: r.jobs || [], loading: false, error: "", hiddenCount: r.hidden_count || 0 } : prev);
    } catch (e) {
      setJobsPanel(prev => prev.slug === slug ? { ...prev, jobs: [], loading: false, error: e.message } : prev);
    }
  }

  function closeJobsPanel() {
    setJobsPanel((prev) => ({ ...prev, open: false }));
    setExpandedJobId(null);
    setSelectedJobIds([]);
  }

  function toggleExpandedJob(jobId) {
    setExpandedJobId((prev) => (prev === jobId ? null : jobId));
  }

  function jobIdFor(job, i) {
    return job.job_id || job.job_url || String(i);
  }

  function toggleJobSelected(jobId, checked) {
    setSelectedJobIds((prev) => {
      if (checked) return prev.includes(jobId) ? prev : [...prev, jobId];
      return prev.filter((x) => x !== jobId);
    });
  }

  function toggleSelectAllJobs(checked) {
    if (!checked) {
      setSelectedJobIds([]);
      return;
    }
    setSelectedJobIds(jobsPanel.jobs.map((job, i) => jobIdFor(job, i)));
  }

  async function aiCleanAllPortals() {
    if (aiCleaning) return;
    setAiCleaning(true);
    setBusy(true);
    const failures = [];
    let reviewed = 0;
    let removed = 0;
    let completed = 0;
    try {
      await saveConfig();
      for (const [index, vendor] of vendors.entries()) {
        setAiAllStatus(`AI check ${index + 1}/${vendors.length}: ${vendor.label}…`);
        try {
          const result = await api("/api/jobs/ai-clean", {
            method: "POST", body: JSON.stringify({ vendor: vendor.slug })
          });
          reviewed += result.reviewed_count || 0;
          removed += result.removed_count || 0;
          completed++;
          setJobsPanel((previous) => previous.slug === vendor.slug
            ? { ...previous, jobs: result.jobs || [], hiddenCount: result.hidden_count || 0,
                aiError: "", aiNote: "AI check completed." }
            : previous);
        } catch (e) {
          failures.push(`${vendor.label}: ${e.message}`);
        }
      }
      setSelectedJobIds([]);
      await refreshStatus();
      setAiAllStatus(`AI check finished: ${completed}/${vendors.length} portals, ${reviewed} jobs reviewed, ${removed} hidden.`
        + (failures.length ? ` Failed: ${failures.join("; ")}` : ""));
    } catch (e) {
      setAiAllStatus(`AI check could not start: ${e.message}`);
    } finally {
      setAiCleaning(false);
      setBusy(false);
    }
  }

  async function aiCleanJobsPanel() {
    if (!jobsPanel.slug) return;
    setAiCleaning(true);
    setJobsPanel((prev) => ({ ...prev, aiError: "", aiNote: "" }));
    try {
      setError("");
      const r = await api("/api/jobs/ai-clean", { method: "POST", body: JSON.stringify({ vendor: jobsPanel.slug }) });
      const keptIds = new Set((r.jobs || []).map((job, i) => jobIdFor(job, i)));
      const cost = r.cost_usd ? ` (~$${r.cost_usd.toFixed(2)})` : "";
      const note = r.removed_count
        ? `AI reviewed ${r.reviewed_count ?? "?"} titles and removed ${r.removed_count}.${cost}`
        : `AI reviewed ${r.reviewed_count ?? "?"} titles — none were clearly irrelevant, so nothing was removed.${cost}`;
      setJobsPanel((prev) => ({ ...prev, jobs: r.jobs || [], aiError: "", aiNote: note, hiddenCount: r.hidden_count || 0 }));
      setSelectedJobIds((prev) => prev.filter((id) => keptIds.has(id)));
      setMessage(note);
      await refreshStatus();
    } catch (e) {
      console.error("AI cleanup failed:", e);
      setError(e.message);
      setJobsPanel((prev) => ({ ...prev, aiError: e.message }));
    } finally {
      setAiCleaning(false);
    }
  }

  async function undoAiCleanup() {
    if (!jobsPanel.slug) return;
    setAiCleaning(true);
    try {
      setError("");
      const r = await api("/api/jobs/ai-reset", { method: "POST", body: JSON.stringify({ vendor: jobsPanel.slug }) });
      setJobsPanel((prev) => ({ ...prev, jobs: r.jobs || [], aiError: "", aiNote: "AI cleanup undone — all postings restored.", hiddenCount: 0 }));
      setMessage("AI cleanup undone — all postings restored.");
      await refreshStatus();
    } catch (e) {
      console.error("AI undo failed:", e);
      setError(e.message);
      setJobsPanel((prev) => ({ ...prev, aiError: e.message }));
    } finally {
      setAiCleaning(false);
    }
  }

  async function openSelectedJobs() {
    const jobsById = new Map(jobsPanel.jobs.map((job, i) => [jobIdFor(job, i), job]));
    const urls = selectedJobIds
      .map((id) => jobsById.get(id))
      .map((job) => job?.job_url || job?.apply_url)
      .filter(Boolean);
    if (!urls.length) return;
    try {
      setError("");
      const r = await api("/api/jobs/open-urls", { method: "POST", body: JSON.stringify({ urls }) });
      setMessage(`Opened ${r.opened} job${r.opened === 1 ? "" : "s"} in your browser.`);
    } catch (e) {
      console.error("Open selected failed:", e);
      setError(e.message);
      setJobsPanel((prev) => ({ ...prev, aiError: e.message }));
    }
  }

  useEffect(() => {
    refresh();
    refreshStatus();
    const id = setInterval(() => refreshStatus(), 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!vendors.length) return;
    if (!defaultsApplied.current) {
      setSelected(vendors.filter((v) => v.active_today).map((v) => v.slug));
      defaultsApplied.current = true;
    }
  }, [vendors]);

  useEffect(() => {
    if (!keywordsInitialized.current && config.keywords) {
      setKeywordsText((config.keywords || []).join("\n"));
      keywordsInitialized.current = true;
    }
  }, [config.keywords]);

  useEffect(() => {
    if (!ignoreTitlesInitialized.current && config.ignore_titles) {
      setIgnoreTitlesText((config.ignore_titles || []).join("\n"));
      ignoreTitlesInitialized.current = true;
    }
  }, [config.ignore_titles]);

  function toggleSelected(slug, checked) {
    if (checked) {
      if (!selected.includes(slug)) setSelected([...selected, slug]);
      return;
    }
    setSelected(selected.filter((x) => x !== slug));
  }

  function setConfigValue(key, value) {
    setConfig({ ...config, [key]: value });
    setDirty(true);
  }

  function renderRunLog() {
    if (!latestRun) return message;
    const lines = [`Run ${latestRun.id} - ${latestRun.kind} - ${latestRun.status}`, "Fresh scrape run"];
    for (const step of latestRun.steps || []) {
      const countText = step.status === "running" ? "scraping..." : step.status === "queued" ? "waiting for a worker..." : `${step.count ?? 0} jobs`;
      lines.push(`${String(step.status || "").padEnd(7)} ${step.vendor}: ${countText}`);
      if (step.status === "failed" && step.output) lines.push(step.output);
    }
    return lines.join("\n");
  }

  return (
    <div className="page">
      <div aria-hidden={jobsPanel.open || undefined} inert={jobsPanel.open ? "" : undefined}>
      <header className="page-header">
        <div className="page-title">
          <h1>Job scraper</h1>
          <p>Search staffing portals. Review relevant roles.</p>
        </div>
        <div className="buttons header-actions">
          <button onClick={() => setView("activity")}>Run history</button>
          <button className="refresh-action" disabled={busy} onClick={() => { refreshStatus(); setResultsVersion(version => version + 1); }}><Icon name="refresh" />Refresh</button>
          <button className="stop-action" disabled={busy || !scrapeStopSupported || !activeScrape || activeScrape.status === "stopping"} onClick={stopScrape}>
            <Icon name="stop" />{activeScrape?.status === "stopping" ? "Stopping…" : "Stop Scrape"}
          </button>
          <button className="scrape-all" disabled={!loaded || busy || Boolean(activeScrape)} onClick={() => scrape("all")}><Icon name="play" />Scrape All {vendors.length || 33}</button>
        </div>
      </header>
      {error && <div className="notice error-notice" role="alert">{error}</div>}
      {aiAllStatus && <div className="notice ai-status" role="status">
        <span>{aiAllStatus}</span>
        {!aiCleaning && <button aria-label="Dismiss AI check notification" onClick={() => setAiAllStatus("")}>Dismiss</button>}
      </div>}
      <nav className="workspace-tabs" aria-label="Scraper views">
        <button aria-pressed={view === "results"} onClick={() => setView("results")}>Results <span>{jobsCount}</span></button>
        <button aria-pressed={view === "portals"} onClick={() => setView("portals")}>Portals <span>{vendors.length}</span></button>
        <button aria-pressed={view === "activity"} onClick={() => setView("activity")}>Activity</button>
      </nav>
      <main className="sourcing-layout">
        {view === "results" && <Results vendors={vendors} loaded={loaded} api={api} refreshKey={resultsVersion + JSON.stringify(vendors.map(v => [v.slug, v.latest_modified, v.latest_count]))} onReview={openJobsPanel} />}
        {view === "activity" && <section className="activity-view"><h2>Run activity</h2><p>Latest scraper output</p><pre className="log">{renderRunLog()}</pre>{runs.length > 0 && <div className="run-history">{[...runs].reverse().map(run => <details key={run.id}><summary>{run.kind} · {run.status}</summary><pre className="log">{JSON.stringify(run.steps, null, 2)}</pre></details>)}</div>}</section>}
        <section hidden={view !== "portals"} className="directory" aria-label="Staffing portal directory">
          <div className="directory-heading"><div><h2>Staffing portals</h2><p>Choose where to search, then review the results.</p></div><span className="source-total">{vendors.length} sources</span></div>
          <div className="directory-tabs" aria-label="Portal views">
            <button className={portalFilter === "all" ? "selected" : ""} aria-pressed={portalFilter === "all"} onClick={() => setPortalFilter("all")}>All portals <span>{vendors.length}</span></button>
            <button className={portalFilter === "results" ? "selected" : ""} aria-pressed={portalFilter === "results"} onClick={() => setPortalFilter("results")}>With jobs <span>{vendors.filter(v => v.latest_count > 0).length}</span></button>
            <button className={portalFilter === "rotation" ? "selected" : ""} aria-pressed={portalFilter === "rotation"} onClick={() => setPortalFilter("rotation")}>Today’s rotation <span>{vendors.filter(v => v.active_today).length}</span></button>
          </div>
          <div className="directory-tools">
            <label className="portal-search"><span className="sr-only">Search portals</span><Icon name="search" /><input type="search" placeholder="Search portals…" value={portalQuery} onChange={e => setPortalQuery(e.target.value)} /></label>
            <label className="sort-control"><span className="sr-only">Sort portals</span><select aria-label="Sort portals" value={sortOrder} onChange={e => setSortOrder(e.target.value)}><option value="directory">Directory order</option><option value="jobs">Most jobs first</option><option value="name">Name A–Z</option></select></label>
          </div>
          <div className={`selection-bar ${selected.length ? "has-selection" : ""}`}>
            <span>{selected.length ? `${selected.length} selected` : `${jobsCount.toLocaleString()} matching jobs across ${vendors.length} portals`}</span>
            <button className="text-action" disabled={!selected.length || busy || Boolean(activeScrape)} onClick={() => scrape("selected", selected)}>Scrape Checked<Icon name="arrow" size={14} /></button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th className="pick-cell"><input type="checkbox" aria-label="Select all visible portals" checked={allChecked} onChange={e => setSelected(e.target.checked ? [...new Set([...selected, ...visibleVendors.map(v => v.slug)])] : selected.filter(slug => !visibleVendors.some(v => v.slug === slug)))} /></th>
                <th scope="col">Portal</th><th scope="col" className="numeric">Latest Jobs</th><th scope="col" className="numeric today-column" title="Matching jobs with a known posting date of today">Posted Today</th><th scope="col" className="updated-column">Last scrape <span className="utc-label">UTC</span></th><th scope="col" className="controls-heading"><span className="sr-only">Controls</span></th>
              </tr></thead>
              <tbody>{visibleVendors.map(v => (
                <tr key={v.slug} className={selected.includes(v.slug) ? "row-selected" : ""}>
                  <td className="pick-cell"><input type="checkbox" aria-label={`Select ${v.label}`} checked={selected.includes(v.slug)} onChange={e => toggleSelected(v.slug, e.target.checked)} /></td>
                  <td className="portal-cell"><div className="portal-identity"><span className={`portal-mark tone-${v.slug.length % 4}`} aria-hidden="true">{portalInitials(v.label)}</span><div><strong>{v.label}</strong><span className={`portal-caption ${v.active_today ? "rotation-label" : ""}`}>{v.active_today ? "In today’s rotation" : "Staffing portal"}</span></div></div></td>
                  <td className={`numeric count-cell ${v.latest_count ? "has-jobs" : "zero"}`}><span>{v.latest_count ?? "—"}</span></td>
                  <td className="numeric today-column">{v.today_count ?? "—"}</td>
                  <td className="updated-column"><span>{v.latest_modified ? formatPostedDate(v.latest_modified.split(" ")[0]) : "Not run yet"}</span>{v.latest_modified && <small>{v.latest_modified.split(" ")[1]}</small>}</td>
                  <td className="controls-cell">
                    {v.open_running && <button className="warn" disabled={busy} onClick={() => stopOpenVendor(v.slug)}>Stop</button>}
                    {v.slug === "teksystems" && <button className="text-action all-days" disabled={busy || aiCleaning || Boolean(activeScrape) || !allDaysSupported} title="Scrape TEKsystems across all posting dates, keeping your keywords and ignored titles" onClick={() => scrape("teksystems_all_days")}>All Days</button>}
                    <button className="jobs-action" disabled={!v.latest_count} onClick={event => openJobsPanel(v.slug, v.label, event)}>Jobs<Icon name="chevron" size={13} /></button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
            {!loaded && !error && <div className="directory-empty" role="status">Loading your portals…</div>}
            {loaded && !visibleVendors.length && <div className="directory-empty"><h3>No portals in this view</h3><p>Try a different name or return to all portals.</p><button onClick={() => { setPortalQuery(""); setPortalFilter("all"); }}>Clear filters</button></div>}
          </div>
          <div className="directory-footer"><span>Matching results still need C2C confirmation.</span><button className="text-action" disabled={busy || aiCleaning || Boolean(activeScrape) || !vendors.length} onClick={aiCleanAllPortals}>Check All Portals with AI</button></div>
          <details className="run-activity" open={Boolean(activeScrape) || undefined}>
            <summary><span className={`status-dot ${activeScrape ? "running" : ""}`} />{activeScrape ? "Scrape in progress" : latestRun ? `Last run: ${latestRun.status}` : "Run activity"}<span className="activity-hint">{activeScrape ? "Live output" : "View log"}</span></summary>
            <pre className="log">{renderRunLog()}</pre>
          </details>
        </section>
        <aside className={`criteria ${criteriaOpen ? "expanded" : ""}`} aria-label="Search criteria">
          <button className="criteria-toggle" aria-expanded={criteriaOpen} onClick={() => setCriteriaOpen(!criteriaOpen)}>Search criteria{dirty ? " · Unsaved" : ""} <span>{criteriaOpen ? "Hide" : "Edit"}</span></button>
          <div className="criteria-content">
            <div className="criteria-heading"><h2>Search setup</h2><span className={dirty ? "unsaved" : ""}>{!dirty && <Icon name="check" size={12} />}{dirty ? "Unsaved" : "Saved"}</span></div>


            <label>Keywords<textarea aria-label="Keywords" spellCheck="false" value={keywordsText} onChange={e => { setKeywordsText(e.target.value); setDirty(true); }} /><small>One search phrase per line.</small></label>
            <label>Ignore Titles<textarea aria-label="Ignore Titles" spellCheck="false" placeholder="e.g. junior, project manager" value={ignoreTitlesText} onChange={e => { setIgnoreTitlesText(e.target.value); setDirty(true); }} /><small>Titles containing these phrases are skipped.</small></label>
            <label>Posted within days<input aria-label="Posted within days" type="number" min="0" step="1" value={config.posted_within_days ?? 4} onChange={e => setConfigValue("posted_within_days", Number(e.target.value || 0))} /><small>Use 0 for any date.</small></label>
            <section className="selected-portals"><div><h2>Portals</h2><button className="text-action" onClick={() => setView("portals")}>Manage</button></div><p>{selected.length} of {vendors.length} selected</p>{vendors.filter(v => selected.includes(v.slug)).map(v => <label key={v.slug}><input type="checkbox" checked onChange={() => toggleSelected(v.slug, false)} />{v.label}</label>)}{!selected.length && <p>Select portals in the Portals tab.</p>}</section>
            <details className="opening-settings">
              <summary>Advanced options · Browser opening settings</summary>
              <div className="form-grid">
                <label>Open limit<input type="number" min="0" step="1" value={config.open_limit ?? 8} onChange={e => setConfigValue("open_limit", Number(e.target.value || 0))} /></label>
                <label>Start at<input type="number" min="1" step="1" value={config.start_at ?? 1} onChange={e => setConfigValue("start_at", Number(e.target.value || 1))} /></label>
                <label className="full-field">Keep open minutes<input type="number" min="1" step="1" value={config.keep_open_minutes ?? 60} onChange={e => setConfigValue("keep_open_minutes", Number(e.target.value || 60))} /></label>
              </div>
            </details>
            <button className="save-controls" disabled={!dirty || busy} onClick={() => saveConfig().catch(e => setError(e.message))}>Save Controls<Icon name="check" size={15} /></button><button className="primary run-search" disabled={!loaded || !selected.length || busy || Boolean(activeScrape)} onClick={() => scrape("selected", selected)}><Icon name="search" />Run search</button><p className="criteria-footnote">Filters apply to portals that support them. C2C eligibility needs confirmation in each posting.</p>
          </div>
        </aside>
      </main>

      </div>
      {jobsPanel.open && <div className="jobs-backdrop" onClick={closeJobsPanel} />}
      <aside ref={drawer} role="dialog" aria-modal="true" aria-label={`${jobsPanel.vendor || "Portal"} jobs`} aria-hidden={!jobsPanel.open} className={`jobs-panel ${jobsPanel.open ? "open" : ""} ${pointerOpening.current ? "" : "no-motion"}`}>
        <div className="jobs-panel-header">
          <h2>{jobsPanel.vendor || "Jobs"}</h2>
          <button className="jobs-panel-close" onClick={closeJobsPanel} aria-label="Close jobs panel">Close</button>
        </div>
        <div className="jobs-panel-sub">{jobsPanel.loading ? "Loading..." : jobsPanel.error ? `Error: ${jobsPanel.error}` : `${jobsPanel.jobs.length} job${jobsPanel.jobs.length === 1 ? "" : "s"}`}</div>
        {!jobsPanel.loading && !jobsPanel.error && jobsPanel.jobs.length > 0 && (
          <div className="jobs-panel-actions">
            <label className="jobs-select-all">
              <input
                type="checkbox"
                checked={selectedJobIds.length > 0 && selectedJobIds.length === jobsPanel.jobs.length}
                onChange={(e) => toggleSelectAllJobs(e.target.checked)}
              />
              Select all
            </label>
            <button disabled={aiCleaning} onClick={aiCleanJobsPanel} title="Uses the local Claude Code Sonnet model to remove clearly irrelevant postings; keeps anything even plausibly relevant.">
              {aiCleaning ? "Reviewing with AI..." : "Clean Up with AI"}
            </button>
            {jobsPanel.hiddenCount > 0 && (
              <button disabled={aiCleaning} onClick={undoAiCleanup} title="Restore every posting the AI cleanup hid for this portal.">
                Undo ({jobsPanel.hiddenCount})
              </button>
            )}
            <button className="primary" disabled={!selectedJobIds.length} onClick={openSelectedJobs}>
              Open Selected ({selectedJobIds.length})
            </button>
          </div>
        )}
        {jobsPanel.aiError && <div className="jobs-panel-ai-error">AI cleanup failed: {jobsPanel.aiError}</div>}
        {!jobsPanel.aiError && jobsPanel.aiNote && <div className="jobs-panel-ai-note">{jobsPanel.aiNote}</div>}
        <div className="jobs-panel-list">
          {jobsPanel.jobs.map((job, i) => {
            const jobId = jobIdFor(job, i);
            const isExpanded = expandedJobId === jobId;
            const isSelected = selectedJobIds.includes(jobId);
            return (
              <div className={`job-item ${isExpanded ? "expanded" : ""}`} key={jobId}>
                <div className="job-title-row">
                  <input
                    type="checkbox"
                    className="job-select-checkbox"
                    checked={isSelected}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => toggleJobSelected(jobId, e.target.checked)}
                    aria-label={`Select ${job.title || "job"}`}
                  />
                  <button className="job-title-btn" aria-expanded={isExpanded} onClick={() => toggleExpandedJob(jobId)}>
                    <span className="job-title">{job.title || "(untitled)"}</span>
                    <span className="job-chevron">{isExpanded ? "Hide" : "Details"}</span>
                  </button>
                </div>
                {isExpanded && (
                  <div className="job-detail">
                    <div className="job-meta">
                      {job.location && <span>{job.location}</span>}
                      {job.employment_type && <span>{job.employment_type}</span>}
                      {job.salary && <span>{job.salary}</span>}
                      {job.posted_date && <span>{formatPostedDate(job.posted_date)}</span>}
                    </div>
                    <p className="job-description">{job.description_snippet || "No description available."}</p>
                    {job.job_url && (
                      <a className="job-link" href={job.job_url} target="_blank" rel="noreferrer">Open posting</a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!jobsPanel.loading && !jobsPanel.error && jobsPanel.jobs.length === 0 && (
            <div className="jobs-panel-empty">No jobs found for this portal yet.</div>
          )}
        </div>
      </aside>
    </div>
  );
}
