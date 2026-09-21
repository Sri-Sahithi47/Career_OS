import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import JobCard from './JobCard'
import { makeJob } from '../test/mocks'

describe('JobCard', () => {
  it('renders the job title and company', () => {
    render(<JobCard job={makeJob()} onClick={() => {}} />)
    expect(screen.getByRole('heading', { name: /AI Engineer/i })).toBeInTheDocument()
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })

  it('renders the match score badge', () => {
    render(<JobCard job={makeJob({ 'Fit Score': 87 })} onClick={() => {}} />)
    expect(screen.getByText('Strong fit')).toBeInTheDocument()
  })

  it('renders location in the meta row', () => {
    render(<JobCard job={makeJob({ Location: 'Chicago' })} onClick={() => {}} />)
    expect(screen.getByText('Chicago')).toBeInTheDocument()
  })

  it('does not render a status badge when status is not_applied', () => {
    render(<JobCard job={makeJob({ Status: 'not_applied' })} onClick={() => {}} />)
    expect(screen.queryByText('Applied')).not.toBeInTheDocument()
  })

  it('exposes the selected card state accessibly', () => {
    render(<JobCard job={makeJob()} selected onClick={() => {}} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens from the keyboard', async () => {
    const onClick = vi.fn()
    const job = makeJob()
    render(<JobCard job={job} onClick={onClick} />)
    screen.getByRole('button').focus()
    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledWith(job)
  })

  it('renders the actual description', () => {
    const job = makeJob({ Description: 'Build Python services.' })
    render(<JobCard job={job} onClick={() => {}} />)
    expect(screen.getByText('Build Python services.')).toBeInTheDocument()
  })

  it('renders salary when provided', () => {
    const job = makeJob({ Salary: '$100,000' })
    render(<JobCard job={job} onClick={() => {}} />)
    expect(screen.getByText('$100,000')).toBeInTheDocument()
  })

  it('renders the company monogram (first letter)', () => {
    render(<JobCard job={makeJob({ Company: 'Zenith AI' })} onClick={() => {}} />)
    // getAllByText since monogram 'Z' is aria-hidden but still in DOM
    expect(screen.getAllByText('Z').length).toBeGreaterThan(0)
  })

  it('shows "Untitled role" when Title is missing', () => {
    render(<JobCard job={makeJob({ Title: undefined })} onClick={() => {}} />)
    expect(screen.getByText('Untitled role')).toBeInTheDocument()
  })

  it('calls onClick with the job when clicked', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    const job = makeJob()
    render(<JobCard job={job} onClick={handleClick} />)
    await user.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledWith(job)
  })

  it('renders source as a chip', () => {
    render(<JobCard job={makeJob({ Source: 'Indeed' })} onClick={() => {}} />)
    expect(screen.getByText('Indeed')).toBeInTheDocument()
  })
})
