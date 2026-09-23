import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { getApiErrorMessage } from '../lib/errors'

// Keep the upstream HTML/CSS intact, while routing its requests through the
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Dashboard request timed out')); }, 35000);
    pending.set(id, {resolve, timer});
    parent.postMessage({type: 'scraper-request', id, path, method: options.method || 'GET', body: options.body}, '*');
  });
})();
</script>`

export default function LegacyScraper() {
  const frame = useRef(null)
  const [html, setHtml] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api.get('/api/legacy-scraper/ui').then(response => {
      if (active) setHtml(response.data.html.replace('<script>', bridge + '<script>'))
    }).catch(err => { if (active) setError(getApiErrorMessage(err, 'Unable to load the scraper dashboard.')) })
    const receive = async (event) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== 'scraper-request') return
      const { id, path, method, body } = event.data
      if (typeof path !== 'string' || !/^\/api\/(config|status|jobs|scrape|open|stop|open-job|open-new-jobs|applied|judge-apply)(\?|$)/.test(path) || !['GET', 'POST'].includes(method)) return
      let status, result
      try {
        const response = await api.request({ url: '/api/legacy-scraper' + path, method, data: body ? JSON.parse(body) : undefined })
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
  }, [])

  if (error) return <p role="alert">{error}</p>
  if (!html) return <p role="status">Loading Job Scraper…</p>
  return <iframe ref={frame} title="Original Job Scraper dashboard" srcDoc={html} sandbox="allow-scripts allow-popups" style={{ width: '100%', height: 'calc(100vh - 48px)', minHeight: 720, border: 0, borderRadius: 12, background: '#fff' }} />
}
