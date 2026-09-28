import { act, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import App from "./App.jsx";

vi.mock("thinking-orbs", () => ({
  ThinkingOrb: ({ state, paused }) => <span data-testid="thinking-orb" data-state={state} data-paused={String(Boolean(paused))} />
}));

const CONFIG = {
  posted_within_days: 4,
  open_limit: 8,
  start_at: 1,
  keep_open_minutes: 60,
  delay: 0.5,
  keywords: ["java developer", "spring boot developer"],
  ignore_titles: ["junior"]
};

const VENDORS = [
  { slug: "teksystems", label: "TEKsystems", active_today: false, latest_count: 0, latest_file: "", latest_modified: "", open_running: false },
  { slug: "judgegroup", label: "Judge Group", active_today: true, latest_count: 7, latest_file: "judgegroup.json", latest_modified: "2026-09-12 02:38", open_running: false },
  { slug: "beaconhill", label: "Beacon Hill", active_today: true, latest_count: 3, latest_file: "beaconhill.json", latest_modified: "2026-09-12 02:38", open_running: false }
];

const ROTATION = [
  { date: "2026-09-11", weekday: "Friday", vendors: ["Judge Group", "Beacon Hill"], slugs: ["judgegroup", "beaconhill"] },
  { date: "2026-09-14", weekday: "Monday", vendors: ["Akkodis", "Randstad"], slugs: ["akkodis", "randstad"] }
];

function jsonResponse(body, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: () => Promise.resolve(structuredClone(body))
  });
}

const JOBS = [
  {
    job_id: "j1",
    title: "Senior Full Stack Engineer, Java, AWS, React",
    location: "Whippany, NJ",
    employment_type: "Contract",
    salary: "$60 - $70/hr",
    posted_date: "2026-09-11",
    job_url: "https://example.com/jobs/j1",
    description_snippet: "We are looking for a senior full stack engineer with Java and AWS experience."
  },
  {
    job_id: "j2",
    title: "Backend Java Developer",
    location: "Remote",
    employment_type: "W2",
    salary: "",
    posted_date: "2026-09-10",
    job_url: "https://example.com/jobs/j2",
    description_snippet: "Backend role building microservices."
  }
];

function installFetchMock({ scrapeOk = true, openOk = true, jobsOk = true, stopOk = true, runs = [] } = {}) {
  const calls = [];
  const vendorState = VENDORS.map((v) => ({ ...v }));
  const fetchMock = vi.fn((url, options = {}) => {
    calls.push({ url, options });
    const method = options.method || "GET";
    if (url.endsWith("/api/config") && method === "GET") {
      return jsonResponse({ config: CONFIG, vendors: vendorState, rotation: ROTATION });
    }
    if (url.endsWith("/api/config") && method === "POST") {
      const next = JSON.parse(options.body);
      return jsonResponse({ ok: true, config: { ...CONFIG, ...next } });
    }
    if (url.endsWith("/api/status")) {
      return jsonResponse({ runs, scrape_stop_supported: true, teksystems_all_days_supported: true, vendors: vendorState, rotation: ROTATION });
    }
    if (url.endsWith("/api/scrape/stop")) {
      const run = runs.find((r) => r.id === JSON.parse(options.body).run_id);
      if (run) run.status = "stopped";
      return jsonResponse({ ok: true, status: "stopped" });
    }
    if (url.endsWith("/api/scrape")) {
      return scrapeOk
        ? jsonResponse({ ok: true, run_id: "abc123" })
        : jsonResponse({ ok: false, error: "A scrape is already running." }, false, 409);
    }
    if (url.endsWith("/api/jobs/open-urls")) {
      const { urls } = JSON.parse(options.body);
      return jsonResponse({ ok: true, opened: urls.length });
    }
    if (url.endsWith("/api/open/stop")) {
      const { vendor } = JSON.parse(options.body);
      const entry = vendorState.find((v) => v.slug === vendor);
      if (stopOk && entry) entry.open_running = false;
      return stopOk
        ? jsonResponse({ ok: true, status: "stopped", vendor: entry?.label || vendor })
        : jsonResponse({ ok: false, error: "No active browser session for this vendor." }, false, 400);
    }
    if (url.endsWith("/api/open")) {
      const { vendor } = JSON.parse(options.body);
      const entry = vendorState.find((v) => v.slug === vendor);
      if (openOk && entry) entry.open_running = true;
      return openOk
        ? jsonResponse({ ok: true, status: "started", vendor: entry?.label || vendor })
        : jsonResponse({ ok: false, error: "Unknown vendor." }, false, 400);
    }
    if (url.includes("/api/collected")) {
      return jsonResponse({ jobs: JOBS.map(j => ({ ...j, key: j.job_id, sourceSlug: "judgegroup", sourceLabel: "Judge Group", review_state: "new" })), total: JOBS.length, counts: { new: JOBS.length } });
    }
    if (url.includes("/api/jobs")) {
      return jobsOk
        ? jsonResponse({ ok: true, vendor: "Judge Group", jobs: JOBS })
        : jsonResponse({ ok: false, error: "Unknown vendor." }, false, 400);
    }
    return jsonResponse({});
  });
  global.fetch = fetchMock;
  return { fetchMock, calls, vendorState };
}

async function renderLoaded(options) {
  const mocks = installFetchMock(options);
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: /^Portals / }));
  await screen.findAllByRole("button", { name: "Jobs" });
  const table = screen.getByRole("table");
  return { table, ...mocks };
}

function rowFor(table, label) {
  return within(table).getByText(label).closest("tr");
}

describe("App", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("stops the active scrape and enables starting another run", async () => {
    const { fetchMock } = await renderLoaded({ runs: [{ id: "active-123", kind: "all", status: "running", steps: [] }] });
    const user = userEvent.setup();
    const stop = screen.getByRole("button", { name: "Stop Scrape" });
    await waitFor(() => expect(stop).toBeEnabled());
    expect(screen.getByRole("button", { name: 'Run selected scrape' })).toBeDisabled();
    await user.click(stop);
    const call = fetchMock.mock.calls.find(([url]) => url.endsWith("/api/scrape/stop"));
    expect(JSON.parse(call[1].body)).toEqual({ run_id: "active-123" });
    await waitFor(() => expect(stop).toBeDisabled());
    expect(screen.getByRole("button", { name: 'Run selected scrape' })).toBeEnabled();
  });

  it("disables Stop Scrape when idle", async () => {
    await renderLoaded();
    expect(screen.getByRole("button", { name: "Stop Scrape" })).toBeDisabled();
  });

  it("shows a disabled Stopping button while cancellation is pending", async () => {
    await renderLoaded({ runs: [{ id: "pending", status: "stopping", steps: [] }] });
    expect(await screen.findByRole("button", { name: "Stopping…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: 'Run selected scrape' })).toBeDisabled();
  });

  it("renders the header and loads vendor data from the API", async () => {
    const { table } = await renderLoaded();
    expect(screen.getByText("Job scraper")).toBeInTheDocument();
    expect(within(table).getByText("TEKsystems")).toBeInTheDocument();
    expect(within(table).getByText("Judge Group")).toBeInTheDocument();
    expect(within(table).getByText("Beacon Hill")).toBeInTheDocument();
  });

  it("does not render a 'Scrape Today's 2' button", async () => {
    await renderLoaded();
    expect(screen.queryByRole("button", { name: /Scrape Today's 2/i })).not.toBeInTheDocument();
  });

  it("does not render a 'Latest Output' column", async () => {
    await renderLoaded();
    expect(screen.queryByText(/Latest Output/i)).not.toBeInTheDocument();
  });

  it("keeps the scrape-all and scrape-checked buttons but removes the two-only scrape shortcut", async () => {
    await renderLoaded();
    expect(screen.getByRole("button", { name: 'Run selected scrape' })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run search for selected portals" })).toBeInTheDocument();
  });

  it("does not render a Weekday Rotation section", async () => {
    await renderLoaded();
    expect(screen.queryByText(/Weekday Rotation/i)).not.toBeInTheDocument();
  });

  it("does not render an Open Jobs panel", async () => {
    await renderLoaded();
    expect(screen.queryByText(/Open Jobs/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open Selected/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open Today's 2/i })).not.toBeInTheDocument();
  });

  it("pre-selects today's active vendors for the checked-scrape action", async () => {
    const { table } = await renderLoaded();
    expect(within(rowFor(table, "Judge Group")).getByRole("checkbox")).toBeChecked();
    expect(within(rowFor(table, "Beacon Hill")).getByRole("checkbox")).toBeChecked();
    expect(within(rowFor(table, "TEKsystems")).getByRole("checkbox")).not.toBeChecked();
  });

  it("lets the user uncheck all portals without the selection snapping back", async () => {
    const { table } = await renderLoaded();
    const user = userEvent.setup();

    await user.click(within(rowFor(table, "Judge Group")).getByRole("checkbox"));
    await user.click(within(rowFor(table, "Beacon Hill")).getByRole("checkbox"));

    expect(within(rowFor(table, "Judge Group")).getByRole("checkbox")).not.toBeChecked();
    expect(within(rowFor(table, "Beacon Hill")).getByRole("checkbox")).not.toBeChecked();
  });

  it("checking the header checkbox selects every portal, unchecking clears all", async () => {
    const { table } = await renderLoaded();
    const user = userEvent.setup();

    const headerCheckbox = within(table).getAllByRole("checkbox")[0];
    await user.click(headerCheckbox);
    for (const v of VENDORS) {
      expect(within(rowFor(table, v.label)).getByRole("checkbox")).toBeChecked();
    }

    await user.click(headerCheckbox);
    for (const v of VENDORS) {
      expect(within(rowFor(table, v.label)).getByRole("checkbox")).not.toBeChecked();
    }
  });

  it("sends a scrape request with mode 'all' when 'Scrape All 15' is clicked", async () => {
    const { fetchMock } = await renderLoaded();
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('Scrape scope'), 'all');
    await user.click(screen.getByRole("button", { name: 'Run selected scrape' }));

    await waitFor(() => {
      const scrapeCall = fetchMock.mock.calls.find(([url]) => url.endsWith("/api/scrape"));
      expect(scrapeCall).toBeTruthy();
      const body = JSON.parse(scrapeCall[1].body);
      expect(body.mode).toBe("all");
    });
  });

  it("sends a scrape request with the checked vendors when 'Scrape Checked' is clicked", async () => {
    const { fetchMock } = await renderLoaded();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Run search for selected portals" }));

    await waitFor(() => {
      const scrapeCall = fetchMock.mock.calls.find(([url]) => url.endsWith("/api/scrape"));
      expect(scrapeCall).toBeTruthy();
      const body = JSON.parse(scrapeCall[1].body);
      expect(body.mode).toBe("selected");
      expect([...body.vendors].sort()).toEqual(["beaconhill", "judgegroup"]);
    });
  });

  it("shows an error message in the log panel when the API call fails", async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error("Failed to fetch")));
    render(<App />);
  await userEvent.click(screen.getByRole("button", { name: /^Portals / }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to fetch");
  });

  it("surfaces a scrape conflict error without crashing", async () => {
    await renderLoaded({ scrapeOk: false });
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('Scrape scope'), 'all');
    await user.click(screen.getByRole("button", { name: 'Run selected scrape' }));

    expect(await screen.findByText(/A scrape is already running\./i)).toBeInTheDocument();
  });

  it("adds multi-word keyword chips with Enter", async () => {
    await renderLoaded();
    const user = userEvent.setup();

    const textarea = screen.getByLabelText("Keywords");
    await user.click(textarea);
    await user.keyboard(" senior ");
    expect(textarea).toHaveValue(" senior ");

    await user.keyboard("{Enter}");
    expect(textarea).toHaveValue("");
    expect(screen.getByRole("button", { name: "Remove senior from Keywords" })).toBeInTheDocument();

    await user.keyboard("qa engineer");
    expect(textarea).toHaveValue("qa engineer");
  });

  it("saves normalized keywords (trimmed, blank lines dropped) only on Save Controls", async () => {
    const { fetchMock } = await renderLoaded();
    const user = userEvent.setup();

    const textarea = screen.getByLabelText("Keywords");
    await user.click(textarea);
    await user.keyboard("{Enter}{Enter}qa engineer  ");

    await user.click(screen.getByRole("button", { name: "Save Controls" }));

    await waitFor(() => {
      const configCall = fetchMock.mock.calls.find(
        ([url, options]) => url.endsWith("/api/config") && options?.method === "POST"
      );
      expect(configCall).toBeTruthy();
      const body = JSON.parse(configCall[1].body);
      expect(body.keywords).toEqual(["java developer", "spring boot developer", "qa engineer"]);
    });
  });

  it("renders saved Ignore Titles as removable chips", async () => {
    await renderLoaded();
    const textarea = screen.getByLabelText("Ignore Titles");
    expect(textarea).toHaveValue("");
    expect(screen.getByRole("button", { name: "Remove junior from Ignore Titles" })).toBeInTheDocument();
  });

  it("saves normalized ignore titles alongside keywords on Save Controls", async () => {
    const { fetchMock } = await renderLoaded();
    const user = userEvent.setup();

    const textarea = screen.getByLabelText("Ignore Titles");
    await user.click(textarea);
    await user.keyboard("{Enter}entry level  ");

    await user.click(screen.getByRole("button", { name: "Save Controls" }));

    await waitFor(() => {
      const configCall = fetchMock.mock.calls.find(
        ([url, options]) => url.endsWith("/api/config") && options?.method === "POST"
      );
      expect(configCall).toBeTruthy();
      const body = JSON.parse(configCall[1].body);
      expect(body.ignore_titles).toEqual(["junior", "entry level"]);
    });
  });

  it("does not render a row-level Open button in Controls", async () => {
    const { table } = await renderLoaded();
    const row = rowFor(table, "Judge Group");
    expect(within(row).queryByRole("button", { name: "Open" })).not.toBeInTheDocument();
  });

  it("shows a Stop button while a vendor's browser session is running and can stop it", async () => {
    const { table, fetchMock } = await renderLoaded();
    const row = rowFor(table, "Judge Group");
    expect(within(row).queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(within(row).getByRole("button", { name: "Open Judge Group jobs" }));

    const stopBtn = await within(row).findByRole("button", { name: "Stop" });
    await user.click(stopBtn);

    await waitFor(() => {
      const stopCall = fetchMock.mock.calls.find(([url]) => url.endsWith("/api/open/stop"));
      expect(stopCall).toBeTruthy();
      expect(JSON.parse(stopCall[1].body).vendor).toBe("judgegroup");
    });
    await waitFor(() => {
      expect(within(row).queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
    });
  });

  it("opens the jobs sidebar with titles for the selected vendor and can close it", async () => {
    const { table } = await renderLoaded();
    const user = userEvent.setup();

    const row = rowFor(table, "Judge Group");
    await user.click(within(row).getByRole("button", { name: "Jobs" }));

    expect(await screen.findByText("Senior Full Stack Engineer, Java, AWS, React")).toBeInTheDocument();
    expect(screen.getByText("Backend Java Developer")).toBeInTheDocument();
    expect(screen.getByText("2 jobs")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close jobs panel/i }));
    await waitFor(() => {
      expect(document.querySelector(".jobs-panel.open")).not.toBeInTheDocument();
    });
  });

  it("expands a job title to reveal its description and collapses it again", async () => {
    const { table } = await renderLoaded();
    const user = userEvent.setup();

    const row = rowFor(table, "Judge Group");
    await user.click(within(row).getByRole("button", { name: "Jobs" }));

    const titleButton = await screen.findByText("Senior Full Stack Engineer, Java, AWS, React");
    expect(screen.queryByText(/senior full stack engineer with Java and AWS experience/i)).not.toBeInTheDocument();

    await user.click(titleButton);
    expect(await screen.findByText(/senior full stack engineer with Java and AWS experience/i)).toBeInTheDocument();

    await user.click(titleButton);
    expect(screen.queryByText(/senior full stack engineer with Java and AWS experience/i)).not.toBeInTheDocument();
  });

  it("disables the Jobs button for a vendor with zero latest jobs", async () => {
    const { table } = await renderLoaded();
    const row = rowFor(table, "TEKsystems");
    expect(within(row).getByRole("button", { name: "Jobs" })).toBeDisabled();
  });

  it("opens only the manually checked jobs when Open Selected is clicked", async () => {
    const { table, fetchMock } = await renderLoaded();
    const user = userEvent.setup();

    const row = rowFor(table, "Judge Group");
    await user.click(within(row).getByRole("button", { name: "Jobs" }));

    await screen.findByText("Senior Full Stack Engineer, Java, AWS, React");
    expect(screen.getByRole("button", { name: /Open Selected/i })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /select senior full stack engineer/i }));
    const openSelectedBtn = screen.getByRole("button", { name: /Open Selected/i });
    expect(openSelectedBtn).not.toBeDisabled();
    expect(openSelectedBtn).toHaveTextContent("Open Selected (1)");

    await user.click(openSelectedBtn);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => url.endsWith("/api/jobs/open-urls"));
      expect(call).toBeTruthy();
      expect(JSON.parse(call[1].body).urls).toEqual(["https://example.com/jobs/j1"]);
    });
  });

  it("sends every checked job to the opener, not just the first", async () => {
    const { table, fetchMock } = await renderLoaded();
    const user = userEvent.setup();

    const row = rowFor(table, "Judge Group");
    await user.click(within(row).getByRole("button", { name: "Jobs" }));
    await screen.findByText("Senior Full Stack Engineer, Java, AWS, React");

    await user.click(screen.getByRole("checkbox", { name: /select all/i }));
    await user.click(screen.getByRole("button", { name: /Open Selected/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => url.endsWith("/api/jobs/open-urls"));
      expect(call).toBeTruthy();
      expect(JSON.parse(call[1].body).urls.length).toBe(JOBS.length);
    });
  });

  it("selects and deselects all jobs via the select-all checkbox", async () => {
    const { table } = await renderLoaded();
    const user = userEvent.setup();
    vi.spyOn(window, "open").mockImplementation(() => {});

    const row = rowFor(table, "Judge Group");
    await user.click(within(row).getByRole("button", { name: "Jobs" }));
    await screen.findByText("Senior Full Stack Engineer, Java, AWS, React");

    await user.click(screen.getByRole("checkbox", { name: /select all/i }));
    expect(screen.getByRole("button", { name: /Open Selected/i })).toHaveTextContent("Open Selected (2)");
    expect(screen.getByRole("checkbox", { name: /select senior full stack engineer/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /select backend java developer/i })).toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: /select all/i }));
    expect(screen.getByRole("button", { name: /Open Selected/i })).toHaveTextContent("Open Selected (0)");
  });

  it("clears job selections when the panel is closed", async () => {
    const { table } = await renderLoaded();
    const user = userEvent.setup();

    const row = rowFor(table, "Judge Group");
    await user.click(within(row).getByRole("button", { name: "Jobs" }));
    await screen.findByText("Senior Full Stack Engineer, Java, AWS, React");

    await user.click(screen.getByRole("checkbox", { name: /select senior full stack engineer/i }));
    await user.click(screen.getByRole("button", { name: /close jobs panel/i }));

    await user.click(within(row).getByRole("button", { name: "Jobs" }));
    await screen.findByText("Senior Full Stack Engineer, Java, AWS, React");
    expect(screen.getByRole("checkbox", { name: /select senior full stack engineer/i })).not.toBeChecked();
  });
});

it("checks every portal with AI and continues after a portal fails", async () => {
  const { calls } = installFetchMock();
  const original = global.fetch;
  global.fetch = vi.fn((url, options = {}) => {
    if (url.endsWith('/api/jobs/ai-clean')) {
      calls.push({ url, options });
      const { vendor } = JSON.parse(options.body);
      return vendor === 'judgegroup'
        ? jsonResponse({ ok: false, error: 'Review unavailable' }, false, 500)
        : jsonResponse({ ok: true, jobs: [], reviewed_count: 2, removed_count: 1 });
    }
    return original(url, options);
  });
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: /^Portals / }));
  const button = await screen.findByRole('button', { name: 'Check All Portals with AI' });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  await screen.findByText(/AI check finished: 2\/3 portals, 4 jobs reviewed, 2 hidden/);
  expect(calls.filter(c => c.url.endsWith('/api/jobs/ai-clean')).map(c => JSON.parse(c.options.body).vendor))
    .toEqual(['teksystems', 'judgegroup', 'beaconhill']);
  expect(button).toBeEnabled();
});

it("offers All Days only for TEKsystems and submits its dedicated scrape mode", async () => {
  const { calls } = installFetchMock();
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: /^Portals / }));
  const button = await screen.findByRole('button', { name: 'All Days' });
  expect(screen.getAllByRole('button', { name: 'All Days' })).toHaveLength(1);
  expect(button.closest('tr')).toHaveTextContent('TEKsystems');
  await userEvent.click(button);
  await waitFor(() => expect(calls.some(c => c.url.endsWith('/api/scrape'))).toBe(true));
  const request = calls.find(c => c.url.endsWith('/api/scrape'));
  expect(JSON.parse(request.options.body).mode).toBe('teksystems_all_days');
});

it('filters the directory without losing selected portals in other views', async () => {
  const { table } = await renderLoaded();
  const user = userEvent.setup();
  await user.type(screen.getByRole('searchbox', { name: 'Search portals' }), 'Judge');
  expect(within(table).queryByText('TEKsystems')).not.toBeInTheDocument();
  await user.click(screen.getByRole('checkbox', { name: 'Select all visible portals' }));
  await user.clear(screen.getByRole('searchbox', { name: 'Search portals' }));
  expect(within(rowFor(table, 'Judge Group')).getByRole('checkbox')).not.toBeChecked();
  expect(within(rowFor(table, 'Beacon Hill')).getByRole('checkbox')).toBeChecked();
});

it('closes the jobs drawer with Escape and returns focus to its trigger', async () => {
  const { table } = await renderLoaded();
  const user = userEvent.setup();
  const trigger = within(rowFor(table, 'Judge Group')).getByRole('button', { name: 'Jobs' });
  await user.click(trigger);
  expect(await screen.findByRole('dialog', { name: 'Judge Group jobs' })).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});


it("reloads results on a new output version even when count and displayed minute stay unchanged", async () => {
  let poll;
  const timer = vi.spyOn(globalThis, "setInterval").mockImplementation((callback, delay) => { if (delay === 5000) poll = callback; return 123; });
  try {
    const { fetchMock, vendorState } = installFetchMock();
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /^Collected jobs/ }));
    await screen.findAllByRole("button", { name: JOBS[0].title });
    const jobCalls = () => fetchMock.mock.calls.filter(([url]) => url.includes("/api/collected")).length;
    const before = jobCalls();
    vendorState[1].results_version = "new-file:12345";
    await poll();
    await waitFor(() => expect(jobCalls()).toBeGreaterThan(before));
  } finally { timer.mockRestore(); }
});

it('organizes portals separately from job rows and saves both move directions', async () => {
  const { calls, table } = await renderLoaded();
  expect(within(table).queryByRole('combobox', { name: /category/i })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Organize portals' }));
  await userEvent.click(screen.getByRole('button', { name: 'Move TEKsystems to others' }));
  await screen.findByRole('button', { name: 'Move TEKsystems to prime' });
  const saved = calls.filter(call => call.url.endsWith('/api/config') && call.options.method === 'POST');
  expect(JSON.parse(saved[0].options.body)).toEqual({ portal_categories: { teksystems: 'optional' } });
  await userEvent.click(screen.getByRole('button', { name: 'Move TEKsystems to prime' }));
  await screen.findByRole('button', { name: 'Move TEKsystems to others' });
  await userEvent.click(screen.getByRole('button', { name: 'Done organizing' }));
  expect(screen.queryByRole('region', { name: 'Organize portals' })).not.toBeInTheDocument();
});

it('keeps a portal in place when saving its category fails', async () => {
  const { fetchMock } = await renderLoaded();
  await userEvent.click(screen.getByRole('button', { name: 'Organize portals' }));
  fetchMock.mockImplementationOnce(() => jsonResponse({ error: 'Storage unavailable' }, false, 500));
  await userEvent.click(screen.getByRole('button', { name: 'Move TEKsystems to others' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not move this portal');
  expect(screen.getByRole('button', { name: 'Move TEKsystems to others' })).toBeEnabled();
});


it('searches only optional portals using the saved category choices', async () => {
  const { calls } = await renderLoaded();
  await userEvent.selectOptions(screen.getByLabelText('Scrape scope'), 'optional');
  expect(screen.getByRole('button', { name: 'Run selected scrape' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Organize portals' }));
  await userEvent.click(screen.getByRole('button', { name: 'Move TEKsystems to others' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Run selected scrape' })).toBeEnabled());
  await userEvent.click(screen.getByRole('button', { name: 'Run selected scrape' }));
  await waitFor(() => expect(calls.some(call => call.url.endsWith('/api/scrape'))).toBe(true));
  const request = calls.find(call => call.url.endsWith('/api/scrape'));
  expect(JSON.parse(request.options.body)).toEqual({ mode: 'selected', vendors: ['teksystems'] });
});


it('toggles the small star between Prime and Others without changing saved category keys', async () => {
  const { calls } = await renderLoaded();
  expect(screen.getByLabelText('Portal category')).toHaveTextContent('Prime');
  await userEvent.click(screen.getByRole('button', { name: 'Remove TEKsystems from Prime' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove TEKsystems from Prime' })).not.toBeInTheDocument());
  await userEvent.click(screen.getByLabelText('Portal category'));
  await userEvent.click(screen.getByRole('option', { name: /Others/ }));
  const star = screen.getByRole('button', { name: 'Add TEKsystems to Prime' });
  expect(star).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(star);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Add TEKsystems to Prime' })).not.toBeInTheDocument());
  await userEvent.click(screen.getByLabelText('Portal category'));
  await userEvent.click(screen.getByRole('option', { name: /Prime/ }));
  expect(screen.getByRole('button', { name: 'Remove TEKsystems from Prime' })).toHaveAttribute('aria-pressed', 'true');
  const saved = calls.filter(call => call.url.endsWith('/api/config') && call.options.method === 'POST');
  expect(JSON.parse(saved.at(-1).options.body)).toEqual({ portal_categories: { teksystems: 'important' } });
});

it('saves individual days and applies the header value to every portal including hidden ones', async () => {
  const { calls } = installFetchMock();
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: /^Portals/ }));
  await userEvent.selectOptions(screen.getByLabelText('Days for TEKsystems'), '7');
  await waitFor(() => expect(screen.getByLabelText('Days for TEKsystems')).toHaveValue('7'));
  expect(screen.getByLabelText('Days for Judge Group')).toHaveValue('4');
  await userEvent.type(screen.getByPlaceholderText('Search portals…'), 'Judge');
  await userEvent.click(screen.getByLabelText('Days for all portals'));
  await userEvent.click(within(screen.getByRole('listbox', { name: 'Days for all portals' })).getByRole('option', { name: '14 days' }));
  await waitFor(() => expect(screen.getByLabelText('Days for Judge Group')).toHaveValue('14'));
  await userEvent.clear(screen.getByPlaceholderText('Search portals…'));
  expect(screen.getByLabelText('Days for TEKsystems')).toHaveValue('14');
  const saved = calls.filter(call => call.url.endsWith('/api/config') && call.options.method === 'POST');
  expect(JSON.parse(saved.at(-1).options.body)).toEqual({ posted_within_days: 14, portal_days: {} });
});

it('opens the chosen portal and disables open when it has no jobs', async () => {
  const { calls } = installFetchMock();
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: /^Portals/ }));
  expect(screen.getByRole('button', { name: 'Open TEKsystems jobs' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Open Judge Group jobs' }));
  await waitFor(() => expect(calls.some(call => call.url.endsWith('/api/open') && JSON.parse(call.options.body).vendor === 'judgegroup')).toBe(true));
});

it('filters portals with the status dropdown and restores all statuses', async () => {
  const { table } = await renderLoaded();
  const status = screen.getByRole('button', { name: 'Portal status' });
  await userEvent.click(status);
  expect(screen.queryByRole('option', { name: /No matches/i })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('option', { name: /Not searched yet/ }));
  expect(within(table).getByText('TEKsystems')).toBeInTheDocument();
  expect(within(table).queryByText('Judge Group')).not.toBeInTheDocument();
  await userEvent.click(status);
  await userEvent.click(screen.getByRole('option', { name: /All statuses/ }));
  expect(within(table).getByText('Judge Group')).toBeInTheDocument();
});

it('retries all failed portals in one batch regardless of the search filter, without saving settings', async () => {
  const runs = [{ id: 'old', status: 'failed', vendors: ['teksystems', 'judgegroup'], steps: [
    { slug: 'teksystems', status: 'failed' }, { slug: 'judgegroup', status: 'failed' },
  ] }];
  const { calls } = installFetchMock({ runs });
  render(<App />);
  await userEvent.type(await screen.findByPlaceholderText('Search portals…'), 'TEK');
  await userEvent.click(screen.getByRole('button', { name: 'Retry all failed (2)' }));
  await waitFor(() => expect(calls.filter(call => call.url.endsWith('/api/scrape'))).toHaveLength(1));
  expect(JSON.parse(calls.find(call => call.url.endsWith('/api/scrape')).options.body).vendors).toEqual(['teksystems', 'judgegroup']);
  expect(calls.filter(call => call.url.endsWith('/api/config') && call.options.method === 'POST')).toHaveLength(0);
});

it('keeps another failed portal retry usable while a search runs, with queued feedback', async () => {
  const runs = [
    { id: 'old', status: 'failed', vendors: ['judgegroup'], steps: [{ slug: 'judgegroup', status: 'failed' }] },
    { id: 'active', status: 'running', vendors: ['teksystems'], steps: [{ slug: 'teksystems', status: 'running' }] },
  ];
  const { calls } = installFetchMock({ runs });
  render(<App />);
  const retry = await screen.findByRole('button', { name: 'Retry Judge Group' });
  expect(retry).toBeEnabled();
  await userEvent.click(retry);
  expect(retry).toHaveTextContent('Queued');
  expect(retry).toBeDisabled();
  expect(screen.getByText(/1 portal queued/)).toBeInTheDocument();
  expect(calls.filter(call => call.url.endsWith('/api/scrape'))).toHaveLength(0);
  await userEvent.click(screen.getByRole('button', { name: 'Cancel queued retries' }));
  expect(retry).toBeEnabled();
});

it('animates during the real AI request and keeps a dismissible done message', async () => {
  installFetchMock();
  const original = global.fetch;
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  global.fetch = vi.fn((url, options = {}) =>
    url.endsWith('/api/jobs/ai-clean') ? pending : original(url, options));
  render(<App />);
  const button = screen.getByRole('button', { name: 'Check All Portals with AI' });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  await screen.findByText('Reviewing TEKsystems…');
  expect(screen.getByRole('progressbar', { name: 'Portals checked' })).toHaveAttribute('aria-valuenow', '0');
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('aria-busy', 'true');
  expect(screen.getAllByTestId('thinking-orb').some(orb => orb.dataset.state === 'solving')).toBe(true);
  expect(screen.queryByText('Done — portal check complete')).not.toBeInTheDocument();
  await act(async () => { finish(await jsonResponse({ jobs: [], reviewed_count: 2, removed_count: 0 })); });
  await screen.findByText('Done — portal check complete');
  expect(button).toBeEnabled();
  expect(button).toHaveAttribute('aria-busy', 'false');
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss AI check notification' }));
  expect(screen.queryByText('Done — portal check complete')).not.toBeInTheDocument();
});

it('shows a dismissible failure rather than done if AI setup fails', async () => {
  installFetchMock();
  const original = global.fetch;
  global.fetch = vi.fn((url, options = {}) =>
    url.endsWith('/api/config') && options.method === 'POST'
      ? jsonResponse({ error: 'Settings unavailable' }, false, 500)
      : original(url, options));
  render(<App />);
  const button = screen.getByRole('button', { name: 'Check All Portals with AI' });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  await screen.findByText('Portal check failed');
  expect(screen.queryByText('Done — portal check complete')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss AI check notification' }));
  expect(screen.queryByText('Portal check failed')).not.toBeInTheDocument();
  expect(button).toBeEnabled();
});

it('syncs scrape scope with every company filter without starting a scrape', async () => {
  const { calls } = await renderLoaded();
  for (const [label, scope] of [['Others', 'optional'], ['All companies', 'all'], ['Prime', 'important']]) {
    await userEvent.click(screen.getByLabelText('Portal category'));
    await userEvent.click(screen.getByRole('option', { name: new RegExp(label) }));
    expect(screen.getByLabelText('Scrape scope')).toHaveValue(scope);
  }
  expect(calls.filter(call => call.url.endsWith('/api/scrape'))).toHaveLength(0);
});

it('syncs scrape scope to all when clearing an empty company view', async () => {
  await renderLoaded();
  await userEvent.click(screen.getByLabelText('Portal category'));
  await userEvent.click(screen.getByRole('option', { name: /Others/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.getByLabelText('Scrape scope')).toHaveValue('all');
});

it('refreshes the selected group using a one-run day window without changing saved days', async () => {
  const { calls } = await renderLoaded();
  await userEvent.click(screen.getByRole('button', { name: /Refresh today/ }));
  const request = calls.find(call => call.url.endsWith('/api/scrape'));
  expect(JSON.parse(request.options.body)).toMatchObject({ mode: 'selected', refresh_today: true });
  expect(screen.getByLabelText('Posted within days')).toHaveValue(4);
 });
