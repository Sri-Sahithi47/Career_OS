import { ThinkingOrb } from "thinking-orbs";
import useRetryQueue from "./useRetryQueue";
import PortalDropdown from "./PortalDropdown";
import Results from "./Results";
import PhraseChips from "./PhraseChips";
import { STATUS, portalState, PortalLogo, PortalProgress, storedPanel, portalCategory } from "./PortalPresentation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

const API = "http://127.0.0.1:8766";

function formatPostedDate(value) {
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return text;
  const date = new Date(text.slice(0, 10) + 'T12:00:00');
  return Number.isNaN(date.getTime()) ? text : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function DaysSelect({ value, label, disabled, onChange }) {
  const options = [...new Set([0, 1, 3, 4, 7, 14, 30, 60, 90, Number(value)])].sort((a, b) => a - b);
  return <select className="days-select" aria-label={label} disabled={disabled} value={value} onChange={event => onChange(Number(event.target.value))}>{value === "" && <option value="" disabled>Set all…</option>}{options.map(days => <option key={days} value={days}>{days === 0 ? 'Any date' : `${days} ${days === 1 ? 'day' : 'days'}`}</option>)}</select>;
}

function Icon({ name, size = 16 }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    play: <path d="m9 5 10 7-10 7z" />,
    filter: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2" fill="currentColor" /><circle cx="15" cy="17" r="2" fill="currentColor" /></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    check: <path d="m5 12 4 4L19 6" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="1" />,
    chevron: <path d="m9 5 7 7-7 7" />,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function App() {
  const [resultsVersion, setResultsVersion] = useState(0);
  const portalTable = useRef(null);
  useEffect(() => {
    const table = portalTable.current;
    if (!table) return;
    const resize = () => {
      const footer = table.nextElementSibling;
      const available = window.innerHeight - table.getBoundingClientRect().top - (footer?.getBoundingClientRect().height || 48) - 12;
      table.style.setProperty('--available-table-height', `${Math.max(180, available)}px`);
    };
    if (typeof ResizeObserver === 'undefined') { resize(); return; }
    const observer = new ResizeObserver(resize);
    observer.observe(table.parentElement);
    observer.observe(document.body);
    window.addEventListener('resize', resize);
    resize();
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); };
  }, []);
  const [view, setView] = useState("portals");
  const [scrapeScope, setScrapeScope] = useState("important");
  const [category, setCategory] = useState("important");
  const [organizing, setOrganizing] = useState(false);
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState("");
  const [portalQuery, setPortalQuery] = useState("");
  const [portalFilter, setPortalFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("jobs");
  const [loaded, setLoaded] = useState(false);
  const [criteriaOpen, setCriteriaOpen] = useState(() => storedPanel().open);
  const [panelWidth, setPanelWidth] = useState(() => storedPanel().width);
  useEffect(() => {
    if (window.parent !== window) window.parent.postMessage({ type: 'scraper-panel', width: panelWidth, open: criteriaOpen }, '*');
    try { localStorage.setItem('careeros.scraper.panel', JSON.stringify({ width: panelWidth, open: criteriaOpen })); } catch { /* Storage may be unavailable. */ }
  }, [panelWidth, criteriaOpen]);
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
  const [aiProgress, setAiProgress] = useState({ checked: 0, total: 0 });
  const [aiAllPhase, setAiAllPhase] = useState("idle");

  const defaultsApplied = useRef(false);
  const keywordsInitialized = useRef(false);
  const ignoreTitlesInitialized = useRef(false);

  const activeScrape = runs.find((run) => ["running", "stopping"].includes(run.status));
  const retries = useRetryQueue({ runs, api, onStarted: refreshStatus, ready: loaded && !busy && !categorySaving });
  const retryPending = [...retries.queue, ...(retries.submitted?.slugs || [])];
  const failedPortals = vendors.filter(v => portalState(v, runs) === 'attention' && !retryPending.includes(v.slug));
  const categoryVendors = vendors.filter(v => category === "all" || portalCategory(v.slug, config.portal_categories) === category);
  const visibleVendors = useMemo(() => {
    const rows = vendors.filter(v => (category === "all" || portalCategory(v.slug, config.portal_categories) === category) && v.label.toLowerCase().includes(portalQuery.toLowerCase())
      && (portalFilter !== "results" || v.latest_count > 0)
      && (portalFilter !== "rotation" || v.active_today)
      && (!STATUS[portalFilter] || portalState(v, runs) === portalFilter));
    if (sortOrder === "jobs") rows.sort((a, b) => b.latest_count - a.latest_count);
    if (sortOrder === "name") rows.sort((a, b) => a.label.localeCompare(b.label));
    const order = Object.keys(STATUS);
    return rows.sort((a, b) => portalCategory(a.slug, config.portal_categories).localeCompare(portalCategory(b.slug, config.portal_categories)) || order.indexOf(portalState(a, runs)) - order.indexOf(portalState(b, runs)));
  }, [vendors, portalQuery, portalFilter, sortOrder, runs, category, config.portal_categories]);
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

  async function movePortal(slug, destination) {
    setCategorySaving(true);
    setCategoryError('');
    const categories = { ...config.portal_categories, [slug]: destination };
    try {
      await api('/api/config', { method: 'POST', body: JSON.stringify({ portal_categories: categories }) });
      setConfig(previous => ({ ...previous, portal_categories: categories }));
    } catch (error) {
      setCategoryError(`Could not move this portal: ${error.message}`);
    } finally { setCategorySaving(false); }
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

  async function scrape(mode, selected = [], forceRefresh = false, refreshToday = false) {
    setBusy(true);
    try {
      setError("");
      await saveConfig();
      await api("/api/scrape", { method: "POST", body: JSON.stringify({ mode, vendors: selected, ...(forceRefresh ? { force_refresh: true } : {}), ...(refreshToday ? { refresh_today: true } : {}) }) });
      setSelected([]);
      setMessage(refreshToday ? "Checking for new jobs in the past day. Saved Days settings are unchanged." : "Fresh scrape started. Old counts remain visible until new output finishes.");
      await refreshStatus();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeDays(slug, days) {
    const patch = slug
      ? { portal_days: { ...config.portal_days, [slug]: days } }
      : { posted_within_days: days, portal_days: {} };
    setCategorySaving(true);
    setError("");
    try {
      await api("/api/config", { method: "POST", body: JSON.stringify(patch) });
      setConfig(previous => ({ ...previous, ...patch }));
      setMessage(slug ? "Portal date range saved. Run search to fetch matching jobs." : "Date range applied to every portal. Run search to fetch matching jobs.");
      await refreshStatus();
      setResultsVersion(version => version + 1);
    } catch (error) { setError(error.message); }
    finally { setCategorySaving(false); }
  }

  async function openVendor(slug) {
    setBusy(true);
    setError("");
    try {
      await saveConfig();
      await api("/api/open", { method: "POST", body: JSON.stringify({ vendor: slug }) });
      setMessage("Opening saved jobs in your browser.");
      await refreshStatus();
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }

  async function stopScrape() {
    if (!activeScrape) return;
    retries.cancel();
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
    setAiAllPhase("working");
    setAiProgress({ checked: 0, total: vendors.length });
    setAiAllStatus("Preparing your portal check…");
    setBusy(true);
    const failures = [];
    let reviewed = 0;
    let removed = 0;
    let completed = 0;
    try {
      await saveConfig();
      for (const [index, vendor] of vendors.entries()) {
        setAiAllStatus(`Reviewing ${vendor.label}…`);
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
        } finally {
          setAiProgress({ checked: index + 1, total: vendors.length });
        }
      }
      setSelectedJobIds([]);
      await refreshStatus();
      setAiAllPhase(failures.length ? "warning" : "done");
      setAiAllStatus(`AI check finished: ${completed}/${vendors.length} portals, ${reviewed} jobs reviewed, ${removed} hidden.`
        + (failures.length ? ` Failed: ${failures.join("; ")}` : ""));
    } catch (e) {
      setAiAllPhase("error");
      setAiAllStatus(`AI check could not complete: ${e.message}`);
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

  return (
    <div className="page">
      <div aria-hidden={jobsPanel.open || undefined} inert={jobsPanel.open ? "" : undefined}>
      <header className="page-header">
        <div className="page-title">
          <h1>Job scraper</h1>

        </div>
      <nav className="workspace-tabs" aria-label="Scraper views">
        <button aria-pressed={view === "portals"} onClick={() => setView("portals")}>Portals <span>{vendors.length}</span></button>
        <button aria-pressed={view === "results"} onClick={() => setView("results")}>Collected jobs</button>
      </nav>
        <div className="buttons header-actions">
          {view === "portals" && <button title="Search the selected company group for new postings in the past day" disabled={!loaded || busy || categorySaving || aiCleaning || Boolean(activeScrape) || !vendors.some(v => category === 'all' || portalCategory(v.slug, config.portal_categories) === category)} onClick={() => scrape(category === 'all' ? 'all' : 'selected', vendors.filter(v => category === 'all' || portalCategory(v.slug, config.portal_categories) === category).map(v => v.slug), false, true)}>↻ Refresh today</button>}
          {view === "portals" && <span className="header-job-count">{jobsCount.toLocaleString()} matching jobs</span>}
      <div className="search-summary"><button aria-expanded={criteriaOpen} onClick={() => setCriteriaOpen(!criteriaOpen)}>{criteriaOpen ? 'Hide search setup' : 'Show search setup'}</button></div>
          <button className="stop-action" disabled={busy || !scrapeStopSupported || !activeScrape || activeScrape.status === "stopping"} onClick={stopScrape}>
            <Icon name="stop" />{activeScrape?.status === "stopping" ? "Stopping…" : "Stop Scrape"}
          </button>
          <div className="scrape-dropdown">
            <select aria-label="Scrape scope" value={scrapeScope} disabled={!loaded || busy || categorySaving || Boolean(activeScrape)} onChange={event => setScrapeScope(event.target.value)}><option value="important">Scrape prime</option><option value="optional">Scrape others</option><option value="all">Scrape all</option></select>
            <button aria-label="Run selected scrape" title="Run selected scrape" disabled={!loaded || busy || categorySaving || Boolean(activeScrape) || !vendors.some(v => scrapeScope === 'all' || portalCategory(v.slug, config.portal_categories) === scrapeScope)} onClick={() => scrapeScope === 'all' ? scrape('all') : scrape('selected', vendors.filter(v => portalCategory(v.slug, config.portal_categories) === scrapeScope).map(v => v.slug))}><Icon name="play" /></button>
          </div>
        </div>
      </header>
      {error && <div className="notice error-notice" role="alert">{error}</div>}
      {aiAllStatus && <div className="ai-check-notification" data-phase={aiAllPhase}>
        <span className="ai-check-visual" aria-hidden="true">
          {aiAllPhase === "working" ? <ThinkingOrb state="solving" size={64} dark color="#b5caff" /> : <span className="ai-check-result">{aiAllPhase === "done" ? <Icon name="check" size={22} /> : "!"}</span>}
        </span>
        <div className="ai-check-copy" role="status" aria-live="polite">
          <strong>{aiAllPhase === "working" ? "Checking your portals…" : aiAllPhase === "done" ? "Done — portal check complete" : aiAllPhase === "warning" ? "Check finished with some failures" : "Portal check failed"}</strong>
          <span>{aiAllStatus}</span>
        </div>
        {aiAllPhase === "working" && <span className="ai-check-count">{aiProgress.checked}<span> / {aiProgress.total} checked</span></span>}
        {aiAllPhase === "working" && <div className="ai-check-track" role="progressbar" aria-label="Portals checked" aria-valuemin={0} aria-valuemax={aiProgress.total} aria-valuenow={aiProgress.checked}><span style={{ width: `${aiProgress.total ? aiProgress.checked / aiProgress.total * 100 : 0}%` }} /></div>}
        <button className="ai-check-close" aria-label="Dismiss AI check notification" title="Close message" onClick={() => setAiAllStatus("")}>×</button>
      </div>}
      <main className={`sourcing-layout ${criteriaOpen ? 'panel-open' : 'panel-closed'}`} style={{ '--panel-width': `${panelWidth}px` }}>
        {view === "results" && <Results vendors={vendors} loaded={loaded} api={api} refreshKey={resultsVersion + JSON.stringify(vendors.map(v => [v.slug, v.results_version, v.latest_modified, v.latest_count, v.error]))} onReview={openJobsPanel} onRefresh={slug => scrape("selected", [slug], true)} refreshing={busy || Boolean(activeScrape)} />}
        <section hidden={view !== "portals"} className="directory" aria-label="Staffing portal directory">
          {categoryError && <p role="alert" className="notice error-notice">{categoryError}</p>}

          <div className="directory-tools compact-directory-tools">
            <label className="portal-search"><span className="sr-only">Search portals</span><Icon name="search" /><input type="search" placeholder="Search portals…" value={portalQuery} onChange={e => setPortalQuery(e.target.value)} /></label>
<PortalDropdown label="Portal category" value={category} onChange={value => { setCategory(value); setScrapeScope(value); setPortalFilter('all'); }} options={['important', 'optional', 'all'].map(value => ({ value, tone: value === 'important' ? 'prime' : 'slate', marker: value === 'important' ? '★' : undefined, label: value === 'important' ? 'Prime' : value === 'optional' ? 'Others' : 'All companies', count: vendors.filter(v => value === 'all' || portalCategory(v.slug, config.portal_categories) === value).length }))} /><PortalDropdown label="Portal status" value={portalFilter} onChange={setPortalFilter} options={[{ value: 'all', tone: 'blue', label: 'All statuses', count: categoryVendors.length }, ...Object.entries(STATUS).filter(([key]) => key !== 'empty').map(([value, status]) => ({ value, tone: value === 'running' ? 'blue' : value === 'attention' ? 'amber' : value === 'ready' ? 'green' : 'slate', label: status.label, count: categoryVendors.filter(v => portalState(v, runs) === value).length }))]} />
            <label className="sort-control"><span className="sr-only">Sort portals</span><select aria-label="Sort portals" value={sortOrder} onChange={e => setSortOrder(e.target.value)}><option value="directory">Directory order</option><option value="jobs">Most jobs first</option><option value="name">Name A–Z</option></select></label>
{selected.length > 0 && <div className={`selection-bar ${selected.length ? "has-selection" : ""}`}>
            <span>{selected.length ? `${selected.length} selected` : `${jobsCount.toLocaleString()} matching jobs across ${vendors.length} portals`}</span>
            <button className="primary selected-run-search" aria-label="Run search for selected portals" disabled={!selected.length || busy || categorySaving || Boolean(activeScrape)} onClick={() => scrape("selected", selected)}><Icon name="search" size={14} />Run search</button>
          </div>}
<button className="organize-trigger" aria-expanded={organizing} aria-controls="portal-organizer" onClick={() => setOrganizing(!organizing)}>{organizing ? "Done organizing" : "Organize portals"}</button>
          </div>
          {(failedPortals.length > 0 || retries.queue.length > 0 || retries.error) && <div className="retry-toolbar">
            <button className="retry-action retry-all" disabled={!loaded || !failedPortals.length} onClick={() => retries.enqueue(failedPortals.map(v => v.slug))}>Retry all failed{failedPortals.length ? ` (${failedPortals.length})` : ''}</button>
            {retries.queue.length > 0 && <span role="status">{retries.starting ? 'Starting retries…' : `${retries.queue.length} ${retries.queue.length === 1 ? 'portal' : 'portals'} queued · Keep this tab open`}</span>}
            {retries.queue.length > 0 && <button className="text-action" disabled={retries.starting} onClick={retries.cancel}>Cancel queued retries</button>}
            {retries.error && <span role="alert">Retries paused: {retries.error} <button className="retry-action" onClick={retries.resume}>Resume retries</button></span>}
          </div>}
          {organizing && <section id="portal-organizer" className="portal-organizer" aria-label="Organize portals">
            <p>Move companies between groups. Changes save automatically.</p>
            <div className="organizer-columns">{['important', 'optional'].map(group => <section key={group} aria-label={`${group === 'important' ? 'prime' : 'others'} companies`}><h3>{group === 'important' ? 'Prime' : 'Others'} <span>{vendors.filter(v => portalCategory(v.slug, config.portal_categories) === group).length}</span></h3><ul>{vendors.filter(v => portalCategory(v.slug, config.portal_categories) === group).map(v => <li key={v.slug}><span><PortalLogo slug={v.slug} label={v.label} />{v.label}</span><button disabled={categorySaving || busy} aria-label={`Move ${v.label} to ${group === 'important' ? 'others' : 'prime'}`} onClick={() => movePortal(v.slug, group === 'important' ? 'optional' : 'important')}>{group === 'important' ? 'Others →' : '← Prime'}</button></li>)}</ul></section>)}</div>
          </section>}
          <div className="table-wrap" ref={portalTable}>
            <table>
              <thead><tr>
                <th className="pick-cell"><input type="checkbox" aria-label="Select all visible portals" checked={allChecked} onChange={e => setSelected(e.target.checked ? [...new Set([...selected, ...visibleVendors.map(v => v.slug)])] : selected.filter(slug => !visibleVendors.some(v => v.slug === slug)))} /></th>
                <th scope="col">Portal</th><th scope="col" className="numeric">Latest Jobs</th><th scope="col" className="prime-column" title="Star a company to add it to Prime">Prime</th><th scope="col" className="numeric today-column" title="Matching jobs with a known posting date of today">Posted Today</th><th scope="col" className="updated-column"><span title="Times shown in UTC">Last scrape</span></th><th scope="col" className="days-column"><PortalDropdown floating tone="teal" label="Days for all portals" caption="Apply to every portal" triggerText={Object.keys(config.portal_days || {}).length ? 'Days · Mixed' : `Days · ${config.posted_within_days === 0 ? 'Any' : (config.posted_within_days ?? 4)}`} value={Object.keys(config.portal_days || {}).length ? '' : (config.posted_within_days ?? 4)} options={[...new Set([0, 1, 3, 4, 7, 14, 30, 60, 90, config.posted_within_days ?? 4])].sort((a, b) => a - b).map(days => ({ value: days, label: days === 0 ? 'Any date' : `${days} ${days === 1 ? 'day' : 'days'}` }))} disabled={busy || categorySaving || Boolean(activeScrape)} onChange={days => changeDays(null, days)} /></th><th scope="col">Open</th><th scope="col" className="controls-heading"><span className="sr-only">Controls</span></th>
              </tr></thead>
              <tbody>{visibleVendors.map((v, index) => (
                <Fragment key={v.slug}>
                {portalState(v, runs) !== 'empty' && (index === 0 || portalState(visibleVendors[index - 1], runs) !== portalState(v, runs) || portalCategory(visibleVendors[index - 1].slug, config.portal_categories) !== portalCategory(v.slug, config.portal_categories)) && <tr className={`portal-group state-${portalState(v, runs)}`}><th colSpan="9" scope="colgroup">{category === 'all' ? `${portalCategory(v.slug, config.portal_categories) === 'important' ? 'Prime' : 'Others'} · ` : ''}{STATUS[portalState(v, runs)].icon} {STATUS[portalState(v, runs)].label}<span>{visibleVendors.filter(item => portalCategory(item.slug, config.portal_categories) === portalCategory(v.slug, config.portal_categories) && portalState(item, runs) === portalState(v, runs)).length} portals</span></th></tr>}
                <tr key={v.slug} className={selected.includes(v.slug) ? "row-selected" : ""}>
                  <td className="pick-cell"><input type="checkbox" aria-label={`Select ${v.label}`} checked={selected.includes(v.slug)} onChange={e => toggleSelected(v.slug, e.target.checked)} /></td>
                  <td className="portal-cell"><div className="portal-identity"><PortalLogo slug={v.slug} label={v.label} /><div><div className="portal-name-line"><strong>{v.label}</strong><PortalProgress vendor={v} runs={runs} /></div><span className={`portal-caption ${v.active_today ? "rotation-label" : ""}`}>{v.error ? "Results unavailable · Retry search" : portalState(v, runs) === "attention" ? "Last search interrupted or failed" : v.active_today ? "In today’s rotation" : STATUS[portalState(v, runs)].label}</span></div></div></td>
                  <td className={`numeric count-cell ${v.latest_count ? "has-jobs" : "zero"}`}><span>{v.latest_count ?? "—"}</span></td>
                  <td className="prime-column"><button className="prime-star" aria-pressed={portalCategory(v.slug, config.portal_categories) === 'important'} aria-label={`${portalCategory(v.slug, config.portal_categories) === 'important' ? 'Remove' : 'Add'} ${v.label} ${portalCategory(v.slug, config.portal_categories) === 'important' ? 'from' : 'to'} Prime`} title={portalCategory(v.slug, config.portal_categories) === 'important' ? 'Move to Others' : 'Move to Prime'} disabled={categorySaving || busy} onClick={() => movePortal(v.slug, portalCategory(v.slug, config.portal_categories) === 'important' ? 'optional' : 'important')}><svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14"><path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1 6.2-5.6-3-5.6 3 1-6.2L1.9 9.6l6.3-.9Z" /></svg></button></td>
                  <td className="numeric today-column">{v.today_count ?? "—"}</td>
                  <td className="updated-column"><span>{v.latest_modified ? formatPostedDate(v.latest_modified.split(" ")[0]) : "Not run yet"}</span>{v.latest_modified && <small>{v.latest_modified.split(" ")[1]}</small>}</td>
                  <td className="days-column"><DaysSelect label={`Days for ${v.label}`} value={config.portal_days?.[v.slug] ?? config.posted_within_days ?? 4} disabled={busy || categorySaving || Boolean(activeScrape)} onChange={days => changeDays(v.slug, days)} /></td>
                  <td><button className="portal-open" aria-label={`Open ${v.label} jobs`} disabled={!v.latest_count || v.open_running || busy || categorySaving} onClick={() => openVendor(v.slug)}>Open ↗</button></td>
                  <td className="controls-cell">
                    {v.open_running && <button className="warn" disabled={busy} onClick={() => stopOpenVendor(v.slug)}>Stop</button>}
                    {v.slug === "teksystems" && <button className="text-action all-days" disabled={busy || categorySaving || aiCleaning || Boolean(activeScrape) || !allDaysSupported} title="Scrape TEKsystems across all posting dates, keeping your keywords and ignored titles" onClick={() => scrape("teksystems_all_days")}>All Days</button>}
                    {(portalState(v, runs) === 'attention' || retryPending.includes(v.slug)) && <button className="retry-action" aria-label={`Retry ${v.label}`} disabled={!loaded || retryPending.includes(v.slug)} onClick={() => retries.enqueue([v.slug])}>{retries.queue.includes(v.slug) ? 'Queued' : retries.submitted?.slugs.includes(v.slug) ? 'Retrying…' : 'Retry'}</button>}
                    <button className="jobs-action" disabled={!v.latest_count} onClick={event => openJobsPanel(v.slug, v.label, event)}>Jobs<Icon name="chevron" size={13} /></button>
                  </td>
                </tr>
                </Fragment>
              ))}</tbody>
            </table>
            {!loaded && !error && <div className="directory-empty" role="status">Loading your portals…</div>}
            {loaded && !visibleVendors.length && <div className="directory-empty"><h3>No portals in this view</h3><p>Try a different name or return to all portals.</p><button onClick={() => { setPortalQuery(""); setPortalFilter("all"); setCategory("all"); setScrapeScope("all"); }}>Clear filters</button></div>}
          </div>
          <div className="directory-footer"><span>Matching results still need C2C confirmation.</span><button className="ai-check-button" aria-busy={aiAllPhase === "working"} disabled={busy || categorySaving || aiCleaning || Boolean(activeScrape) || !vendors.length} onClick={aiCleanAllPortals}><span aria-hidden="true"><ThinkingOrb state="searching" size={20} dark paused={aiAllPhase !== "working"} /></span>{aiAllPhase === "working" ? "Checking portals…" : "Check All Portals with AI"}</button></div>
        </section>
        <aside className={`criteria ${criteriaOpen ? "expanded" : ""}`} aria-label="Search criteria">
          <div className="panel-resizer" role="separator" aria-label="Resize search setup" aria-orientation="vertical" aria-valuemin={260} aria-valuemax={460} aria-valuenow={panelWidth} tabIndex={0}
            onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); setPanelWidth(width => event.key === 'Home' ? 260 : event.key === 'End' ? 460 : Math.max(260, Math.min(460, width + (event.key === 'ArrowLeft' ? 20 : -20)))); } }}
            onPointerDown={event => { event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { const edge = event.currentTarget.parentElement.getBoundingClientRect().right; setPanelWidth(Math.max(260, Math.min(460, edge - event.clientX))); } }}
            onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} />
          <button className="criteria-toggle" aria-expanded={criteriaOpen} onClick={() => setCriteriaOpen(!criteriaOpen)}>Search criteria{dirty ? " · Unsaved" : ""} <span>{criteriaOpen ? "Hide" : "Edit"}</span></button>
          <div className="criteria-content">
            <div className="criteria-heading"><h2>Search setup</h2><button className="collapse-setup" aria-label="Collapse search setup" onClick={() => setCriteriaOpen(false)}>→</button><span className={dirty ? "unsaved" : ""}>{!dirty && <Icon name="check" size={12} />}{dirty ? "Unsaved" : "Saved"}</span></div>


            <PhraseChips label="Keywords" value={keywordsText} onDraft={() => setDirty(true)} onChange={value => { setKeywordsText(value); setDirty(true); }} hint="Press Enter to add. You can paste multiple lines." />
            <PhraseChips label="Ignore Titles" value={ignoreTitlesText} onDraft={() => setDirty(true)} onChange={value => { setIgnoreTitlesText(value); setDirty(true); }} hint="Jobs with these phrases in their title are skipped." />
            <label>Posted within days<input aria-label="Posted within days" type="number" min="0" step="1" value={config.posted_within_days ?? 4} onChange={e => setConfigValue("posted_within_days", Number(e.target.value || 0))} /><small>Use 0 for any date.</small></label>
            <section className="selected-portals"><div><h2>Portals</h2><button className="text-action" onClick={() => setView("portals")}>Manage</button></div><p>{selected.length} of {vendors.length} selected</p>{vendors.filter(v => selected.includes(v.slug)).map(v => <label key={v.slug}><input type="checkbox" checked onChange={() => toggleSelected(v.slug, false)} />{v.label}</label>)}{!selected.length && <p>Select portals in the Portals tab.</p>}</section>
            <details className="opening-settings">
              <summary>Advanced options<span>Browser opening settings</span></summary>
              <div className="form-grid">
                <label>Open limit<input type="number" min="0" step="1" value={config.open_limit ?? 8} onChange={e => setConfigValue("open_limit", Number(e.target.value || 0))} /></label>
                <label>Start at<input type="number" min="1" step="1" value={config.start_at ?? 1} onChange={e => setConfigValue("start_at", Number(e.target.value || 1))} /></label>
                <label className="full-field">Keep open minutes<input type="number" min="1" step="1" value={config.keep_open_minutes ?? 60} onChange={e => setConfigValue("keep_open_minutes", Number(e.target.value || 60))} /></label>
              </div>
            </details>
            <button className="save-controls" disabled={!dirty || busy || categorySaving} onClick={() => saveConfig().catch(e => setError(e.message))}>Save Controls<Icon name="check" size={15} /></button><button className="primary run-search" disabled={!loaded || !selected.length || busy || categorySaving || Boolean(activeScrape)} onClick={() => scrape("selected", selected)}><Icon name="search" />Run search</button><p className="criteria-footnote">Filters apply to portals that support them. C2C eligibility needs confirmation in each posting.</p>
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
