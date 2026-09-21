import { API_URL, api } from './api'

export function resolveExternalUrl(url) {
  if (!url || url === '#') return ''
  const value = String(url).trim()
  if (!value) return ''
  if (value.startsWith('/')) return `${API_URL}${value}`
  if (!/^https?:\/\//i.test(value)) return `https://${value.replace(/^\/+/, '')}`
  return value
}

export async function openInDefaultBrowser(url) {
  const target = resolveExternalUrl(url)
  if (!target) return false

  try {
    await api.post('/api/open-url', { url: target }, { headers: { 'X-CareerOS-Local-Open': '1' } })
    return true
  } catch {
    window.open(target, '_blank', 'noopener,noreferrer')
    return false
  }
}
