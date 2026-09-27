import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../test/render'
import userEvent from '@testing-library/user-event'
import AllJobs from './AllJobs'
import { makeJob } from '../test/mocks'

const jobs = [
  makeJob({ id: 1, job_id: 'match_1', Title: 'AI Engineer', Location: 'Remote', 'Fit Score': 92 }),
  makeJob({ id: 2, job_id: 'match_2', Title: 'ML Engineer', Location: 'Remote', 'Fit Score': 75 }),
  makeJob({ id: 3, job_id: 'match_3', Title: 'Data Scientist', Location: 'Chicago', 'Job Type': 'On-site' }),
].map(job => ({ ...job, 'Date Found': new Date().toISOString() }))

describe('All Jobs', () => {
  it('shows all collected roles without a remote filter', () => {
    render(<AllJobs jobs={jobs} />)
    expect(screen.getByRole('heading', { name: 'Find your next contract' })).toBeInTheDocument()
    expect(document.querySelector('.alljobs-subtitle')).toHaveTextContent('3 opportunities')
    expect(screen.getByRole('button', { name: 'All Time', exact: true })).toHaveClass('active')
    expect(screen.getAllByText('AI Engineer').length).toBeGreaterThan(0)
    expect(screen.getByText('Data Scientist')).toBeInTheDocument()
    expect(screen.queryByText(/Product Designer/)).not.toBeInTheDocument()
  })

  it('filters jobs by search text', async () => {
    render(<AllJobs jobs={jobs} />)
    await userEvent.type(screen.getByPlaceholderText(/Job title, keywords/), 'ML Engineer')
    expect(screen.getAllByText('ML Engineer').length).toBeGreaterThan(0)
    expect(screen.queryByText('AI Engineer')).not.toBeInTheDocument()
  })

  it('can opt into the remote filter', async () => {
    render(<AllJobs jobs={jobs} />)
    await userEvent.click(screen.getByRole('button', { name: /Location: Remote/ }))
    expect(screen.queryByText('Data Scientist')).not.toBeInTheDocument()
  })

  it('shows an empty state for unmatched searches', async () => {
    render(<AllJobs jobs={jobs} />)
    await userEvent.type(screen.getByPlaceholderText(/Job title, keywords/), 'no-such-role')
    expect(screen.getByText('No matching jobs')).toBeInTheDocument()
  })

  it('can narrow the collected feed to today', async () => {
    render(<AllJobs jobs={[...jobs, makeJob({ id: 4, job_id: 'old', Title: 'Older job' })]} />)
    expect(screen.getByText('Older job')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Tailor Resume/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(screen.queryByText('Older job')).not.toBeInTheDocument()
  })
})


it('filters explicit C2C mentions without including a negated mention', async () => {
  render(<AllJobs jobs={[
    makeJob({ id: 101, job_id: 'c2c', Title: 'C2C candidate', Description: 'C2C accepted' }),
    makeJob({ id: 102, job_id: 'w2', Title: 'Restricted candidate', Description: 'No C2C. W2 only.' }),
  ]} />)
  await userEvent.click(screen.getByRole('button', { name: 'Contract terms' }))
  await userEvent.click(screen.getByRole('button', { name: 'C2C mentioned', exact: true }))
  expect(screen.getAllByText('C2C candidate').length).toBeGreaterThan(0)
  expect(screen.queryByText('Restricted candidate')).not.toBeInTheDocument()
})

it('sends a stage change for the selected opportunity', async () => {
  const onStatusChange = vi.fn()
  render(<AllJobs jobs={jobs} onStatusChange={onStatusChange} />)
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Pipeline stage' }), 'screening')
  expect(onStatusChange).toHaveBeenCalledWith(jobs[0], 'screening')
})
