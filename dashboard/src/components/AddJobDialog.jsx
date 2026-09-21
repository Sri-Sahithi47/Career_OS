import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { getApiErrorMessage } from '../lib/errors'
import './AddJobDialog.css'

export default function AddJobDialog({ onClose, onSaved }) {
  const dialog = useRef(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { dialog.current.showModal() }, [])

  const submit = async (event) => {
    event.preventDefault()
    if (saving) return
    const values = Object.fromEntries(new FormData(event.currentTarget))
    const payload = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()]))
    if (!payload.title || !payload.description) {
      setError('Enter a job title and description.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const response = await api.post('/api/jobs', { ...payload, source: 'manual' })
      onSaved(response.data.job)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not save the job. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog ref={dialog} className="add-job-dialog" aria-labelledby="add-job-title" onCancel={(event) => { event.preventDefault(); if (!saving) onClose() }}>
      <form onSubmit={submit}>
        <h2 id="add-job-title">Add Job</h2>
        <label>Job title<input name="title" required maxLength={300} autoFocus /></label>
        <label>Company<input name="company" maxLength={300} /></label>
        <label>Location<input name="location" maxLength={300} /></label>
        <label>Posting URL (optional)<input name="url" type="url" pattern="https?://.*" maxLength={2048} /></label>
        <label>Job description<textarea name="description" required maxLength={50000} rows={10} /></label>
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Job'}</button>
        </footer>
      </form>
    </dialog>
  )
}
