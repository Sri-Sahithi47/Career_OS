import { useEffect, useId, useRef, useState } from 'react';

function DropdownMarker({ tone, marker }) {
  return <span className="dropdown-marker" aria-hidden="true">{marker ?? (tone === 'teal' ? <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="2" y="3.5" width="12" height="10.5" rx="2" /><path d="M5 2v3M11 2v3M2 7h12" /></svg> : '●')}</span>;
}

export default function PortalDropdown({ label, value, options, onChange, disabled = false, caption, triggerText, floating = false, tone }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const id = useId();
  const selected = options.find(option => option.value === value) || options[0];
  const selectedTone = tone ?? selected.tone ?? 'slate';
  useEffect(() => {
    if (!open) return;
    const dismiss = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    const onScroll = event => { if (!(event.target instanceof Node) || !root.current?.contains(event.target)) setOpen(false); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    root.current?.querySelector('[aria-selected="true"]')?.focus();
    return () => { document.removeEventListener('pointerdown', dismiss); window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll); };
  }, [open]);
  function choose(next) {
    onChange(next);
    setOpen(false);
    trigger.current?.focus();
  }
  function onKeyDown(event) {
    if (disabled) return;
    if (event.key === 'Escape') {
      event.preventDefault(); setOpen(false); trigger.current?.focus(); return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (!open) { setOpen(true); return; }
    const items = [...root.current.querySelectorAll('[role="option"]')];
    const index = items.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }
  const bounds = open && floating ? trigger.current?.getBoundingClientRect() : null;
  const menuStyle = bounds ? { position: "fixed", top: bounds.bottom + 7, left: Math.max(8, Math.min(bounds.left, window.innerWidth - 200)), maxHeight: Math.max(100, Math.min(320, window.innerHeight - bounds.bottom - 20)) } : undefined;
  return <div className="portal-dropdown" data-tone={selectedTone} ref={root} onKeyDown={onKeyDown} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" disabled={disabled} className="portal-dropdown-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>
      <DropdownMarker tone={selectedTone} marker={selected.marker} /><span>{triggerText ?? selected.label}</span>{selected.count != null && <span className="dropdown-count">{selected.count}</span>}
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="m5 8 5 5 5-5" stroke="currentColor" strokeWidth="1.5" /></svg>
    </button>
    {open && <div id={id} role="listbox" aria-label={label} className="portal-dropdown-menu" style={menuStyle}>
      <div className="dropdown-caption" aria-hidden="true">{caption ?? (label === 'Portal category' ? 'Company group' : 'Search status')}</div>
      {options.map(option => <button type="button" role="option" tabIndex={-1} aria-selected={option.value === value} className="portal-dropdown-option" data-tone={tone ?? option.tone ?? 'slate'} key={option.value} onClick={() => choose(option.value)}>
        <DropdownMarker tone={tone ?? option.tone} marker={option.marker} /><span>{option.label}</span>{option.count != null && <span className="dropdown-count">{option.count}</span>}<span className="dropdown-check" aria-hidden="true">{option.value === value ? '✓' : ''}</span>
      </button>)}
    </div>}
  </div>;
}
