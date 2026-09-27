import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const detectorSource = readFileSync('../extension/content/detector.js', 'utf8')
  .replace('  await run();\n  observeSpaNav(run);', '')
  .replace(/\}\)\(\);\s*$/, 'window.__detector = { detectJob, saveCurrentJob }; })();')

beforeEach(async () => {
  document.body.innerHTML = ''
  window.history.replaceState({}, '', '/jobs/123')
  vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true, created: true }) } })
  await window.eval(detectorSource)
})
afterEach(() => { delete window.__detector; vi.unstubAllGlobals() })

function posting(description, title = 'Python Developer') {
  document.body.innerHTML = '<script type="application/ld+json"></script>'
  document.querySelector('script').textContent = JSON.stringify({ '@type': 'JobPosting', title, description, hiringOrganization: { name: 'Agency' } })
}

test('retains full structured description past old 8000-character boundary', async () => {
  const description = 'Responsibilities ' + 'Python systems. '.repeat(900) + 'END-MARKER'
  posting(description)
  const job = await window.__detector.detectJob()
  await window.__detector.saveCurrentJob(job)
  expect(window.chrome.runtime.sendMessage.mock.calls[0][0].job.description).toBe(description)
})

test('does not save the stale displayed role after SPA navigation', async () => {
  posting('First description')
  const displayed = await window.__detector.detectJob()
  window.history.replaceState({}, '', '/jobs/456')
  posting('Second description', 'Data Engineer')
  const response = await window.__detector.saveCurrentJob(displayed)
  expect(response.ok).toBe(false)
  expect(window.chrome.runtime.sendMessage).not.toHaveBeenCalled()
})

test('extension reload or messaging failure returns a retryable error', async () => {
  posting('Complete description')
  const job = await window.__detector.detectJob()
  window.chrome.runtime.sendMessage.mockRejectedValue(new Error('Extension context invalidated'))
  const response = await window.__detector.saveCurrentJob(job)
  expect(response.ok).toBe(false)
  expect(response.error).toContain('Reload this page')
})

test('missing posting after navigation never falls back to the old job', async () => {
  posting('Complete description')
  const job = await window.__detector.detectJob()
  document.body.innerHTML = ''
  document.title = ''
  const response = await window.__detector.saveCurrentJob(job)
  expect(response.ok).toBe(false)
  expect(window.chrome.runtime.sendMessage).not.toHaveBeenCalled()
})
