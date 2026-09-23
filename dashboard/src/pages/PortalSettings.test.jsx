import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import PortalSettings from './PortalSettings'
import { api } from '../lib/api'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))
const catalog = { vendors: [{ slug: 'teksystems', label: 'TEKsystems', supports_keywords: true }], runs: [], today: ['teksystems'], busy: false }
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ data: catalog }) })
describe('PortalSettings', () => {
  it('starts the selected search and displays its progress', async () => {
    api.post.mockResolvedValue({ data: { run_ids: ['run'] } })
    render(<PortalSettings />)
    await screen.findByLabelText('TEKsystems')
    fireEvent.click(screen.getByRole('button', { name: 'Search selected portals' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/portals/scrape', {
      vendors: ['teksystems'], keywords: ['python developer', 'data engineer'], posted_within_days: 4,
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('Search started')
  })
  it('disables duplicate searches and displays portal failures', async () => {
    api.get.mockResolvedValue({ data: { ...catalog, busy: true, runs: [{ id: '1', vendor: 'teksystems', status: 'failed', started_at: '2026-09-22T12:00:00', error: 'No fresh output' }] } })
    render(<PortalSettings />)
    expect(await screen.findByRole('button', { name: 'Search in progress…' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('No fresh output')
  })
})
