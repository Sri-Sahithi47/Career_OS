import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddJobDialog from './AddJobDialog'
import { api } from '../lib/api'

vi.mock('../lib/api', () => ({ api: { post: vi.fn() } }))
beforeEach(() => {
  vi.resetAllMocks()
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
})

it('saves a pasted description without requiring a URL', async () => {
  const job = { id: 'new-job', Title: 'Engineer' }
  api.post.mockResolvedValue({ data: { job } })
  const onSaved = vi.fn()
  render(<AddJobDialog onClose={vi.fn()} onSaved={onSaved} />)
  await userEvent.type(screen.getByLabelText('Job title'), 'Engineer')
  await userEvent.type(screen.getByLabelText('Job description'), 'Build reliable services.')
  await userEvent.click(screen.getByRole('button', { name: 'Save Job' }))
  expect(api.post).toHaveBeenCalledWith('/api/jobs', expect.objectContaining({ title: 'Engineer', description: 'Build reliable services.', url: '', source: 'manual' }))
  expect(onSaved).toHaveBeenCalledWith(job)
})

it('preserves the description and allows retry after a save failure', async () => {
  api.post.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ data: { job: { id: 'retry' } } })
  const onSaved = vi.fn()
  render(<AddJobDialog onClose={vi.fn()} onSaved={onSaved} />)
  await userEvent.type(screen.getByLabelText('Job title'), 'Engineer')
  await userEvent.type(screen.getByLabelText('Job description'), 'My pasted description')
  await userEvent.click(screen.getByRole('button', { name: 'Save Job' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')
  expect(screen.getByLabelText('Job description')).toHaveValue('My pasted description')
  await userEvent.click(screen.getByRole('button', { name: 'Save Job' }))
  expect(onSaved).toHaveBeenCalledWith({ id: 'retry' })
})
