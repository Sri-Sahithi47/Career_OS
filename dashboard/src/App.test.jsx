import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { api } from './lib/api'

vi.mock('./lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() }, storeToken: vi.fn() }))
vi.mock('./pages/AuthPage', () => ({ default: () => <h1>Sign in</h1> }))
vi.mock('./pages/AllJobs', () => ({ default: ({ jobs, onNotesChange }) => <div><span>{jobs[0]?.Notes}</span><button onClick={() => onNotesChange(jobs[0], 'New notes')}>Save test notes</button></div> }))

const job = { id: 'one', Notes: 'Original notes', Status: 'not_applied' }

beforeEach(() => {
  vi.resetAllMocks()
  api.get.mockImplementation(async (path) => {
    if (path.endsWith('/auth/me')) return { data: { user: { id: 'user-one', username: 'test' } } }
    if (path === '/api/onboarding') return { data: { profile: { onboarding_completed: true }, search_presets: [] } }
    return { data: { jobs: [job], stats: {} } }
  })
  api.post.mockResolvedValue({ data: {} })
})
afterEach(() => vi.useRealTimers())

it.each(['/today', '/tailor', '/opportunities', '/tracker', '/applied'])('redirects removed route %s to All Jobs', async (route) => {
  render(<MemoryRouter initialEntries={[route]}><App /></MemoryRouter>)
  await screen.findByText('Original notes')
  for (const name of ['Today Feed', 'AI Resume Tailor', 'Opportunity Inbox', 'Tracker', 'Applied Jobs']) {
    expect(screen.queryByRole('link', { name })).not.toBeInTheDocument()
  }
  expect(screen.getAllByRole('link', { name: /All Jobs/ })[0]).toHaveAttribute('aria-current', 'page')
})

it('does not show failed note changes as persisted', async () => {
  api.patch.mockRejectedValue(new Error('Offline'))
  render(<MemoryRouter initialEntries={['/jobs']}><App /></MemoryRouter>)
  await screen.findByText('Original notes')
  fireEvent.click(screen.getByText('Save test notes'))
  expect(await screen.findByText('Could not save notes')).toBeInTheDocument()
  expect(screen.getByText('Original notes')).toBeInTheDocument()
  expect(screen.queryByText('New notes')).not.toBeInTheDocument()
})

it('ignores a background jobs response after logout', async () => {
  vi.useFakeTimers()
  await act(async () => { render(<MemoryRouter initialEntries={['/jobs']}><App /></MemoryRouter>) })
  expect(screen.getByText('Original notes')).toBeInTheDocument()
  let resolveRefresh
  api.get.mockReturnValueOnce(new Promise(resolve => { resolveRefresh = resolve }))
  await act(async () => { vi.advanceTimersByTime(12000) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Log out' })) })
  await act(async () => { resolveRefresh({ data: { jobs: [{ ...job, Notes: 'Stale private notes' }] } }) })
  vi.useRealTimers()
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument())
  expect(screen.queryByText('Stale private notes')).not.toBeInTheDocument()
})
