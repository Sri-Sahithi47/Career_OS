import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { getApiErrorMessage } from '../lib/errors'

// Retain upstream controls and apply the workspace theme, routing requests through the
// authenticated parent. The sandbox cannot access the app's cookies or storage.
const bridge = `<script>
(() => {
  let nextId = 0;
  const pending = new Map();
  window.addEventListener('message', event => {
    if (event.source !== parent || event.data?.type !== 'scraper-response') return;
    const entry = pending.get(event.data.id);
    if (!entry) return;
    pending.delete(event.data.id);
    clearTimeout(entry.timer);
    entry.resolve(new Response(JSON.stringify(event.data.body), {status: event.data.status, headers: {'Content-Type': 'application/json'}}));
  });
  window.fetch = (path, options = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Dashboard request timed out')); }, 1800000);
    pending.set(id, {resolve, timer});
    parent.postMessage({type: 'scraper-request', id, path, method: options.method || 'GET', body: options.body}, '*');
  });
})();
</script>`

export default function LegacyScraper({ original = false }) {
  const base = original ? '/api/legacy-scraper' : '/api/scraper-workspace'
  const frame = useRef(null)
  const [html, setHtml] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api.get(base + '/ui').then(response => {
      if (active) setHtml(response.data.html.replace('</head>', bridge + '</head>'))
    }).catch(err => { if (active) setError(getApiErrorMessage(err, 'Unable to load the scraper dashboard.')) })
    const receive = async (event) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== 'scraper-request') return
      const { id, method, body } = event.data
      const path = typeof event.data.path === 'string' ? event.data.path.replace('http://127.0.0.1:8766', '') : ''
      if (path === '/api/workspace-save' && method === 'POST' && !original) {
        try {
          await api.post('/api/jobs', { ...JSON.parse(body), special_interest: true })
          if (active) event.source.postMessage({ type: 'scraper-response', id, status: 200, body: { ok: true } }, '*')
        } catch (err) {
          if (active) event.source.postMessage({ type: 'scraper-response', id, status: 500, body: { error: getApiErrorMessage(err, 'Unable to save job') } }, '*')
        }
        return
      }
      if (typeof path !== 'string' || !/^\/api\/(config|status|jobs(?:\/ai-clean|\/ai-reset|\/open-urls)?|scrape(?:\/stop)?|open(?:\/stop)?|stop|open-job|open-new-jobs|applied|judge-apply)(\?|$)/.test(path) || !['GET', 'POST'].includes(method)) return
      let status, result
      try {
        const response = await api.request({ url: base + path, timeout: 1800000, method, data: body ? JSON.parse(body) : undefined })
        status = response.status
        result = response.data
      } catch (err) {
        status = err.response?.status || 500
        result = { error: getApiErrorMessage(err, 'Dashboard request failed.') }
      }
      if (active) event.source.postMessage({ type: 'scraper-response', id, status, body: result }, '*')
    }
    window.addEventListener('message', receive)
    return () => { active = false; window.removeEventListener('message', receive) }
  }, [base, original])

  if (error) return <p role="alert">{error}</p>
  if (!html) return <p role="status">Loading Job Scraper…</p>
  return <iframe className="scraper-frame" ref={frame} title={original ? "Original Job Scraper dashboard" : "Job Scraper workspace"} srcDoc={html} sandbox="allow-scripts allow-popups" />
}
