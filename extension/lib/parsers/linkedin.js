/**
 * LinkedIn job page parser.
 * Works on /jobs/view/<id>/ URLs.
 */
export function parse() {
  const title =
    document.querySelector(".job-details-jobs-unified-top-card__job-title h1")?.innerText?.trim() ||
    document.querySelector(".jobs-unified-top-card__job-title h1")?.innerText?.trim() ||
    document.querySelector("h1.t-24")?.innerText?.trim() ||
    "";

  const company =
    document.querySelector(".job-details-jobs-unified-top-card__company-name a")?.innerText?.trim() ||
    document.querySelector(".jobs-unified-top-card__company-name a")?.innerText?.trim() ||
    document.querySelector(".topcard__org-name-link")?.innerText?.trim() ||
    "";

  const location =
    document.querySelector(".job-details-jobs-unified-top-card__bullet")?.innerText?.trim() ||
    document.querySelector(".jobs-unified-top-card__bullet")?.innerText?.trim() ||
    "";

  const description = linkedInDescription();

  const jobType =
    document.querySelector(".job-details-jobs-unified-top-card__job-insight span")?.innerText?.trim() || "";

  if (!title || !company) return null;

  return {
    title,
    company,
    location,
    description: description.slice(0, 8000),
    job_type: jobType,
    url: window.location.href,
    source: "linkedin",
  };
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanLinkedInDescription(value) {
  const lines = String(value || "")
    .split(/\n+/)
    .map((line) => cleanText(line))
    .filter(Boolean)
    .filter((line) => !/^(about\s+the\s+job|about\s+the\s+role|job\s+description|show\s+more|show\s+less)$/i.test(line));
  const text = cleanText(lines.join("\n"));
  if (/^(about\s+the\s+job|about\s+the\s+role|job\s+description)$/i.test(text)) return "";
  return text;
}

function linkedInDescription() {
  const selectors = [
    "#job-details",
    ".jobs-box__html-content",
    ".jobs-description-content__text",
    ".jobs-description__content",
    ".description__text",
  ];
  let best = "";
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const text = cleanLinkedInDescription(el?.innerText || el?.textContent || "");
    if (text.length > best.length) best = text;
  }
  return best;
}
