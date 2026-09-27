// Posting evidence is a screening aid, never a guarantee of engagement eligibility.
export function getContractSignal(job) {
  const text = [
    job.Title,
    job["Employment Type"],
    job["Job Type"],
    job.Description,
    job.description,
    job["Job Description"],
  ]
    .filter(Boolean)
    .join(" ");
  const c2c = "(?:c2c|corp[ -]to[ -]corp|corp to corporation)";
  if (
    new RegExp(
      `(?:no|not|without)\\s+${c2c}|${c2c}\\s+(?:is\\s+)?(?:not\\s+(?:allowed|accepted|available)|unavailable)|w[ -]?2\\s+only|no\\s+(?:third[ -]part(?:y|ies)|subcontract(?:ing|ors))`,
      "i",
    ).test(text)
  ) {
    return {
      key: "restricted",
      label: "Restrictions found",
      detail:
        "The posting mentions W2-only or third-party restrictions. Confirm engagement terms with the recruiter.",
    };
  }
  if (new RegExp(`\\b${c2c}\\b`, "i").test(text))
    return {
      key: "c2c",
      label: "C2C mentioned",
      detail:
        "C2C appears in the posting. Confirm the rate, end client, and vendor arrangement before proceeding.",
    };
  return {
    key: "unknown",
    label: "Confirm C2C",
    detail:
      "C2C eligibility is not stated clearly. Ask the recruiter whether corp-to-corp engagements are accepted.",
  };
}
