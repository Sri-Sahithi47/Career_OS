import { Link } from "react-router-dom";
export default function ExtensionPage() {
  return (
    <section className="overview-page extension-page">
      <header className="workspace-heading">
        <div>
          <span className="eyebrow">BROWSER COMPANION</span>
          <h1>Your search goes with you.</h1>
          <p>
            Capture opportunities and reuse your profile on supported
            application forms.
          </p>
        </div>
      </header>
      <div className="extension-intro">
        <div>
          <h2>
            From a browser tab
            <br />
            to your shortlist.
          </h2>
          <p>
            Save job details while you browse. Return to CareerOS to review
            contract terms, prepare your resume, and track the next step.
          </p>
          <ol className="install-steps">
            <li>
              <strong>Load the extension</strong>
              <p>
                Open Chrome’s Extensions page, enable Developer mode, choose
                Load unpacked, and select this project’s <code>extension</code>{" "}
                folder.
              </p>
            </li>
            <li>
              <strong>Sign in to CareerOS</strong>
              <p>
                Use the same account as your workspace. Pin the extension for
                quick access.
              </p>
            </li>
            <li>
              <strong>Save, prepare, and track</strong>
              <p>
                Open a job posting and select Save this job. Review autofilled
                details before submitting an application.
              </p>
            </li>
          </ol>
          <Link className="workspace-primary" to="/settings">
            Manage your profile →
          </Link>
        </div>
        <div
          className="companion-preview"
          aria-label="Browser companion preview"
        >
          <div className="preview-brand">
            ◈ CareerOS <span>COMPANION</span>
          </div>
          <span className="eyebrow">ON YOUR NEXT JOB POSTING</span>
          <h3>
            Keep the opportunity.
            <br />
            Skip the copy-paste.
          </h3>
          <div className="preview-action">＋ Save this job</div>
          <div className="preview-action secondary">
            ↗ Autofill application
          </div>
          <div className="preview-action secondary">
            ≡ Generate cover letter
          </div>
          <p>One account. One organized search.</p>
          <small>Preview · Install locally using the steps shown</small>
        </div>
      </div>
    </section>
  );
}
