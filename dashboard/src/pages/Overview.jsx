import { Link } from "react-router-dom";
import { getContractSignal } from "../lib/contracts";
import { normalizeStatus, getJobId, getSourceLabel } from "../lib/jobs";

export default function Overview({ jobs, session }) {
  const active = jobs.filter((job) =>
    ["applied", "screening", "interviewing"].includes(
      normalizeStatus(job.Status),
    ),
  );
  const confirmed = jobs.filter((job) => getContractSignal(job).key === "c2c");
  const interview = jobs.filter(
    (job) => normalizeStatus(job.Status) === "interviewing",
  );
  const recent = [...jobs]
    .sort(
      (a, b) => new Date(b["Date Found"] || 0) - new Date(a["Date Found"] || 0),
    )
    .slice(0, 5);
  return (
    <section className="overview-page">
      <header className="workspace-heading">
        <div>
          <span className="eyebrow">YOUR WORKSPACE</span>
          <h1>Let’s find your next contract.</h1>
          <p>
            Welcome back,{" "}
            {(session.full_name || session.username).split(" ")[0]}. Here’s
            where your search stands.
          </p>
        </div>
        <Link className="workspace-primary" to="/job-scraper">
          Find new opportunities <span>↗</span>
        </Link>
      </header>
      <div className="overview-metrics">
        {[
          [jobs.length, "Opportunities", "/jobs"],
          [confirmed.length, "C2C mentioned", "/jobs"],
          [active.length, "Active applications", "/pipeline"],
          [interview.length, "Interviews", "/pipeline"],
        ].map(([value, label, path]) => (
          <Link to={path} key={label}>
            <span>{label}</span>
            <strong>
              {value}
              <small>↗</small>
            </strong>
          </Link>
        ))}
      </div>
      <div className="overview-columns">
        <div>
          <div className="section-heading">
            <div>
              <span className="eyebrow">DISCOVERY</span>
              <h2>Latest opportunities</h2>
            </div>
            <Link to="/jobs">View all →</Link>
          </div>
          <div className="opportunity-list">
            {recent.length ? (
              recent.map((job) => (
                <Link
                  to={`/jobs?q=${encodeURIComponent(job.Title || "")}`}
                  key={getJobId(job)}
                  className="opportunity-row"
                >
                  <span className="company-letter">
                    {(job.Company || "J")[0]}
                  </span>
                  <div>
                    <strong>{job.Title}</strong>
                    <p>
                      {job.Company} · {job.Location || "Location not listed"}
                    </p>
                    <span
                      className={`contract-tag ${getContractSignal(job).key}`}
                    >
                      {getContractSignal(job).label}
                    </span>
                  </div>
                  <span className="opportunity-source">
                    {getSourceLabel(job)} ↗
                  </span>
                </Link>
              ))
            ) : (
              <div className="workspace-empty">
                <h3>Your search starts here</h3>
                <p>
                  Run a portal search or save a job with the browser companion.
                </p>
                <Link to="/job-scraper">Open Job Scraper →</Link>
              </div>
            )}
          </div>
        </div>
        <aside className="search-agenda">
          <span className="eyebrow">NEXT STEPS</span>
          <h2>A focused search.</h2>
          <Link to="/jobs">
            <span>01</span>
            <div>
              <strong>Review contract terms</strong>
              <p>Check C2C eligibility, rate, and location before applying.</p>
            </div>
            ↗
          </Link>
          <Link to="/pipeline">
            <span>02</span>
            <div>
              <strong>Move your applications forward</strong>
              <p>
                {active.length} active opportunities to review and follow up on.
              </p>
            </div>
            ↗
          </Link>
          <Link to="/resume-check">
            <span>03</span>
            <div>
              <strong>Prepare for the role</strong>
              <p>Compare your resume with the job’s requirements.</p>
            </div>
            ↗
          </Link>
          <div className="companion-callout">
            <span className="eyebrow">TAKE YOUR WORKSPACE WITH YOU</span>
            <h3>Found a role elsewhere?</h3>
            <p>
              Save it from your browser and keep it with the rest of your
              search.
            </p>
            <Link to="/extension">Explore browser companion →</Link>
          </div>
        </aside>
      </div>
    </section>
  );
}
