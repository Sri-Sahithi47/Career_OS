import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../test/render'
import userEvent from '@testing-library/user-event'
import TodaysJobs from './TodaysJobs'
import { makeJob } from '../test/mocks'

vi.mock('../lib/api', () => ({ api: { get: vi.fn().mockResolvedValue({ data: { events: [], resumes: [], match: null } }) }, API_URL: '' }))

const jobs = [
  makeJob({ id: 1, job_id: 'match_1', Title: 'AI Engineer', 'Fit Score': 90 }),
  makeJob({ id: 2, job_id: 'match_2', Title: 'ML Engineer', 'Fit Score': 75 }),
  makeJob({ id: 3, job_id: 'match_3', Title: 'Data Scientist', 'Fit Score': 50 }),
]

describe('Today Feed', () => {
  it('renders authenticated workspace jobs and actual scores', () => {
    render(<TodaysJobs jobs={jobs} />)
    expect(screen.getByRole('heading', { name: "Today's Focus" })).toBeInTheDocument()
    for (const job of jobs) expect(screen.getByText(job.Title)).toBeInTheDocument()
    expect(screen.getByText('90% Match')).toBeInTheDocument()
    expect(screen.getByText('50% Match')).toBeInTheDocument()
    expect(screen.queryByText('$120k-$150k')).not.toBeInTheDocument()
  })

  it('shows a real empty state', () => {
    render(<TodaysJobs jobs={[]} />)
    expect(screen.getByText('No recommendations currently found.')).toBeInTheDocument()
  })

  it('omits archived recommendations', () => {
    render(<TodaysJobs jobs={[{ ...jobs[0], Status: 'skipped' }]} />)
    expect(screen.queryByText('AI Engineer')).not.toBeInTheDocument()
  })

  it('saves the selected recommendation', async () => {
    const onStatusChange = vi.fn()
    render(<TodaysJobs jobs={jobs} onStatusChange={onStatusChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save AI Engineer' }))
    expect(onStatusChange).toHaveBeenCalledWith(jobs[0], 'not_applied')
  })

  it('opens job details', async () => {
    render(<TodaysJobs jobs={jobs} />)
    await userEvent.click(screen.getByText('AI Engineer'))
    expect(screen.getAllByText('AI Engineer').length).toBeGreaterThan(1)
  })

  it('handles string dates when building follow-ups', () => {
    render(<TodaysJobs jobs={[{ ...jobs[0], Status: 'applied', applied_at: new Date(Date.now() - 9 * 86400000).toISOString() }]} />)
    expect(screen.getByRole('button', { name: /Follow up/ })).toBeInTheDocument()
  })
})
