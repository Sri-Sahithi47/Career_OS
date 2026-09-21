import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OnboardingPage from './OnboardingPage'
import { api } from '../lib/api'

vi.mock('../lib/api', () => ({ api: { post: vi.fn(), put: vi.fn() } }))
const resumeText = 'Engineer with Python and SQL experience building reliable production services.'
const base = { user: {}, profile: { target_roles: [], parsed_skills: [], seniority: '', work_modes: [] }, resume: null, search_presets: [] }
const uploaded = { ...base, resume: { filename: 'resume.txt', original_text: resumeText }, profile: { ...base.profile, target_roles: ['Engineer'], seniority: 'Entry level' } }

function setup(step = 'welcome', extra = {}) {
  const onUpdated = vi.fn()
  const onCompleted = vi.fn()
  render(<OnboardingPage onboarding={{ ...base, ...extra, profile: { ...base.profile, ...extra.profile, onboarding_step: step } }} onUpdated={onUpdated} onCompleted={onCompleted} />)
  return { user: userEvent.setup(), onUpdated, onCompleted }
}

beforeEach(() => {
  vi.resetAllMocks()
  api.post.mockResolvedValue({ data: uploaded })
  api.put.mockResolvedValue({ data: uploaded })
})

describe('Onboarding', () => {
  it('starts at welcome and advances to resume intake', async () => {
    const { user } = setup()
    expect(screen.getByRole('heading', { name: /Your career/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Start Setup/ }))
    expect(screen.getByRole('heading', { name: /Upload your resume/ })).toBeInTheDocument()
  })

  it('requires a resume and consent before continuing', async () => {
    const { user } = setup('resume')
    expect(screen.getByRole('button', { name: /Next Step/ })).toBeDisabled()
    await user.upload(document.querySelector('input[type=file]'), new File([resumeText], 'resume.txt', { type: 'text/plain' }))
    expect(screen.getByRole('button', { name: /Next Step/ })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /I agree/ }))
    expect(screen.getByRole('button', { name: /Next Step/ })).toBeEnabled()
  })

  it('uploads the selected file and propagates parsed state', async () => {
    const { user, onUpdated } = setup('resume')
    const file = new File([resumeText], 'resume.txt', { type: 'text/plain' })
    await user.upload(document.querySelector('input[type=file]'), file)
    await user.click(screen.getByRole('checkbox', { name: /I agree/ }))
    await user.click(screen.getByRole('button', { name: /Next Step/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].get('file')).toBe(file)
    expect(onUpdated).toHaveBeenCalledWith(uploaded)
    expect(await screen.findByRole('heading', { name: /Define your targets/ })).toBeInTheDocument()
  })

  it('persists pasted text instead of silently skipping upload', async () => {
    const { user, onUpdated } = setup('resume')
    await user.click(screen.getByRole('button', { name: /Paste resume text/ }))
    await user.type(screen.getByPlaceholderText(/Paste your resume contents/), resumeText)
    await user.click(screen.getByRole('checkbox', { name: /I agree/ }))
    await user.click(screen.getByRole('button', { name: /Next Step/ }))
    expect(api.post).toHaveBeenCalledWith('/api/onboarding/resume', { resume_text: resumeText, filename: 'resume.txt', content_type: 'text/plain' })
    expect(onUpdated).toHaveBeenCalledWith(uploaded)
  })

  it('stays on intake and shows upload failures', async () => {
    api.post.mockRejectedValue({ response: { data: { detail: 'Unreadable PDF' } } })
    const { user, onUpdated } = setup('resume')
    await user.upload(document.querySelector('input[type=file]'), new File(['bad'], 'resume.pdf', { type: 'application/pdf' }))
    await user.click(screen.getByRole('checkbox', { name: /I agree/ }))
    await user.click(screen.getByRole('button', { name: /Next Step/ }))
    expect(await screen.findByText('Unreadable PDF')).toBeInTheDocument()
    expect(onUpdated).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: /Upload your resume/ })).toBeInTheDocument()
  })

  it('adds a custom role with Enter', async () => {
    const { user } = setup('roles')
    await user.type(screen.getByPlaceholderText(/Type a job title/), 'Data Engineer{Enter}')
    expect(screen.getAllByText('Data Engineer').length).toBeGreaterThan(0)
  })

  it('switches work preferences without leaving multiple modes selected', async () => {
    const { user } = setup('preferences')
    await user.click(screen.getByRole('radio', { name: 'Remote' }))
    expect(screen.getByRole('radio', { name: 'Remote' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Any' }))
    expect(screen.getByRole('radio', { name: 'Any' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Remote' })).not.toBeChecked()
  })
})
