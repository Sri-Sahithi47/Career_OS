import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '../test/render'
import userEvent from '@testing-library/user-event'
import TailorPage, { PreviewView } from './TailorPage'
import { api } from '../lib/api'
import { makeJob } from '../test/mocks'

vi.mock('../lib/api', () => ({ api: { post: vi.fn(), patch: vi.fn() }, API_URL: '' }))

const job = makeJob({ id: 'one', 'Job Description': 'Build Python systems' })
const workspace = { ats_score: 80, location: 'Remote', tech_stack: {}, suggested_tech_stack: {}, points: ['Built a service'] }
const onboarding = { resume: { original_text: 'Engineer with Python and SQL experience building reliable services.' } }

beforeEach(() => vi.resetAllMocks())

function Editor() {
  const [data, setData] = useState(workspace)
  return <PreviewView selectedJob={job} tailoredData={data} setTailoredData={setData} setView={() => {}} />
}

describe('Resume workspace persistence', () => {
  it('saves edited workspace content instead of overwriting job notes', async () => {
    api.patch.mockResolvedValue({ data: {} })
    const user = userEvent.setup()
    render(<Editor />)
    const location = screen.getByPlaceholderText(/San Francisco/)
    await user.clear(location)
    await user.type(location, 'Boston')
    await user.click(screen.getByRole('button', { name: 'Save to Job Card' }))
    expect(api.patch).toHaveBeenCalledWith('/api/jobs/one/analysis', { ...workspace, location: 'Boston' })
    expect(await screen.findByRole('button', { name: /Saved/ })).toBeDisabled()
    await user.type(location, ', MA')
    expect(screen.getByRole('button', { name: 'Save to Job Card' })).toBeEnabled()
  })

  it('keeps failed saves retryable', async () => {
    api.patch.mockRejectedValue(new Error('Offline'))
    render(<Editor />)
    await userEvent.click(screen.getByRole('button', { name: 'Save to Job Card' }))
    expect(await screen.findByText('Could not save resume changes.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save to Job Card' })).toBeEnabled()
  })

  it('waits for edited content to persist before compiling a PDF', async () => {
    let finishSave
    api.patch.mockReturnValue(new Promise(resolve => { finishSave = resolve }))
    api.post.mockResolvedValue({ data: { pdf_url: '/api/download-resume/resume.pdf' } })
    render(<Editor />)
    await userEvent.click(screen.getByRole('button', { name: 'Generate PDF' }))
    expect(api.post).not.toHaveBeenCalled()
    finishSave({ data: {} })
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/jobs/one/resume', null, { timeout: 180000 }))
    expect(await screen.findByRole('link', { name: /Open in new tab/ })).toHaveAttribute('href', '/api/download-resume/resume.pdf')
  })

  it('does not compile stale content after a failed save', async () => {
    api.patch.mockRejectedValue(new Error('Offline'))
    render(<Editor />)
    await userEvent.click(screen.getByRole('button', { name: 'Generate PDF' }))
    expect(await screen.findByText(/PDF generation failed/)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('clears the previous job preview when selecting an untailored job', async () => {
    const user = userEvent.setup()
    render(<TailorPage jobs={[{ ...job, 'Analysis Data': workspace }, makeJob({ id: 'two' })]} onboarding={onboarding} />)
    await user.selectOptions(screen.getByLabelText('Target Job'), 'one')
    expect(screen.getByRole('button', { name: /View Preview/ })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Target Job'), 'two')
    expect(screen.queryByRole('button', { name: /View Preview/ })).not.toBeInTheDocument()
  })
})
