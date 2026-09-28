import { useState } from 'react';
import logos from './portalLogoData.json';

export const STATUS = {
  running: { label: 'Searching', icon: '◉' },
  attention: { label: 'Needs attention', icon: '⚠' },
  ready: { label: 'Jobs ready', icon: '✓' },
  unsearched: { label: 'Not searched yet', icon: '○' },
  empty: { label: 'No matches', icon: '—' },
};
export function portalProgress(vendor, runs) {
  for (const run of [...runs].reverse()) {
    const step = (run.steps || []).find(item => item.slug === vendor.slug);
    if (!step && !(run.vendors || []).includes(vendor.slug)) continue;
    if (run.status === 'stopping' && (!step || ['running', 'queued'].includes(step.status))) return 'stopping';
    if (step && !['running', 'queued'].includes(step.status)) return step.status;
    // A finished run must never leave a spinner behind, even with incomplete steps.
    if (['failed', 'stopped', 'done'].includes(run.status)) return run.status;
    return step?.status || 'queued';
  }
  return null;
}
export function PortalProgress({ vendor, runs }) {
  const state = vendor.error ? 'failed' : portalProgress(vendor, runs);
  const labels = { queued: 'Queued', running: 'Searching…', stopping: 'Stopping…', done: 'Complete', failed: 'Failed', stopped: 'Stopped' };
  if (!labels[state]) return null;
  const loading = ['running', 'stopping'].includes(state);
  return <span className={`portal-progress progress-${state}`} role="status" aria-label={`${vendor.label}: ${labels[state]}`}>
    <span aria-hidden="true" className={loading ? 'portal-spinner' : 'progress-symbol'}>{loading ? '' : state === 'done' ? '✓' : state === 'failed' ? '!' : state === 'queued' ? '◷' : '—'}</span>
    {labels[state]}
  </span>;
}
export function portalState(vendor, runs) {
  const progress = portalProgress(vendor, runs);
  if (['running', 'queued', 'stopping'].includes(progress)) return 'running';
  if (vendor.error || ['failed', 'stopped'].includes(progress)) return 'attention';
  if (vendor.latest_count > 0) return 'ready';
  if (vendor.latest_file || vendor.latest_modified || progress === 'done') return 'empty';
  return 'unsearched';
}
export function PortalLogo({ slug, label }) {
  const [failed, setFailed] = useState(false);
  const initials = label.split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase();
  return <span className={`portal-mark ${slug === 'optomi' ? 'wide-logo' : ''}`} title={slug === 'ettaingroup' ? 'Ettain Group · now Experis' : label} aria-hidden="true">{logos[slug] && !failed
    ? <img src={logos[slug]} alt="" onError={() => setFailed(true)} /> : initials}</span>;
}
export function storedPanel() {
  try {
    const value = window.__scraperPanel || JSON.parse(localStorage.getItem('careeros.scraper.panel') || '{}');
    return { width: Math.max(260, Math.min(460, Number(value.width) || 300)), open: value.open !== false };
  } catch { return { width: 300, open: true }; }
}

export const IMPORTANT_PORTALS = ['apexsystems', 'teksystems', 'beaconhill', 'akkodis', 'randstad', 'eliassen', 'experis', 'brooksource', 'kellymitchell', 'mitchellmartin', 'cbts', 'roberthalf', 'kforce', 'insightglobal', 'artech', 'pyramidconsulting', 'judgegroup'];
export function portalCategory(slug, overrides = {}) {
  return ['important', 'optional'].includes(overrides?.[slug]) ? overrides[slug] : IMPORTANT_PORTALS.includes(slug) ? 'important' : 'optional';
}
