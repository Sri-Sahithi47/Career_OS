import { useState } from "react";

export default function PhraseChips({ label, value, onChange, onDraft, hint }) {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const phrases = value.split("\n").map(phrase => phrase.trim()).filter(Boolean);
  function add(text) {
    const additions = text.split(/[\n\r]+/).map(phrase => phrase.trim()).filter(Boolean);
    if (additions.length) onChange([...new Set([...phrases, ...additions])].join("\n"));
    setDraft("");
  }
  return <section className={`phrase-field ${label === "Keywords" ? "phrase-include" : "phrase-exclude"}`} aria-label={`${label} phrases`}>
    <div className="phrase-heading"><span>{label}</span><span className="phrase-count">{phrases.length}</span>{phrases.length > 5 && <button type="button" className="phrase-expand" aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Collapse ↑" : "Expand ↓"}</button>}</div>
    <div className={`phrase-list ${expanded ? "is-expanded" : ""}`}>
      {(expanded ? phrases : phrases.slice(0, 5)).map((phrase, index) => <span className="phrase-chip" key={`${phrase}-${index}`}>
        <span>{phrase}</span><button type="button" aria-label={`Remove ${phrase} from ${label}`} onClick={() => onChange(phrases.filter((_, i) => i !== index).join("\n"))}>×</button>
      </span>)}
      {!expanded && phrases.length > 5 && <span className="phrase-hidden-count">+{phrases.length - 5} more</span>}
    </div>
    <div className="phrase-entry"><input aria-label={label} placeholder={label === "Keywords" ? "Add a job title or keyword…" : "Add a title to skip…"} value={draft} onChange={event => { setDraft(event.target.value); onDraft(); }} onBlur={() => add(draft)} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); add(draft); } }} onPaste={event => { const text = event.clipboardData.getData("text"); if (/[\r\n]/.test(text)) { event.preventDefault(); add(draft + text); } }} /><button type="button" aria-label={`Add to ${label}`} disabled={!draft.trim()} onMouseDown={event => event.preventDefault()} onClick={() => add(draft)}>+</button></div>
    <small>{hint}</small>
  </section>;
}
