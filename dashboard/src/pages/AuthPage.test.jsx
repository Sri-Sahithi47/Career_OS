import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AuthPage from './AuthPage'

vi.mock('../lib/api', () => ({
  api: { post: vi.fn() },
  storeToken: vi.fn(),
}))

import { api, storeToken } from '../lib/api'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AuthPage — login mode', () => {
  it('renders the CareerOS brand', () => {
    render(<AuthPage onAuthenticated={() => {}} />)
    expect(screen.getByText('CareerOS')).toBeInTheDocument()
  })

  it('shows the login form by default', () => {
    render(<AuthPage onAuthenticated={() => {}} />)
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Password/i)).toBeInTheDocument()
  })

  it('shows Log in / Create account toggle buttons', () => {
    render(<AuthPage onAuthenticated={() => {}} />)
    expect(screen.getAllByRole('button', { name: /^Log In$/i })[0]).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Sign Up$/i })).toBeInTheDocument()
  })

  it('does not show the full name field in login mode', () => {
    render(<AuthPage onAuthenticated={() => {}} />)
    expect(screen.queryByPlaceholderText(/Your name/i)).not.toBeInTheDocument()
  })

  it('submits login credentials to the correct endpoint', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValueOnce({ data: { token: 'tok', user: { username: 'sai' } } })

    render(<AuthPage onAuthenticated={() => {}} />)
    await user.type(screen.getByLabelText(/Email Address/i), 'sai')
    await user.type(screen.getByLabelText(/^Password/i), 'password123')
    await user.click(document.querySelector('button[type=submit]'))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/v1/auth/login', {
        username: 'sai',
        password: 'password123',
      })
    })
  })

  it('stores the returned token and calls onAuthenticated', async () => {
    const user = userEvent.setup()
    const onAuthenticated = vi.fn()
    api.post.mockResolvedValueOnce({ data: { token: 'tok', user: { username: 'sai' } } })

    render(<AuthPage onAuthenticated={onAuthenticated} />)
    await user.type(screen.getByLabelText(/Email Address/i), 'sai')
    await user.type(screen.getByLabelText(/^Password/i), 'pass')
    await user.click(document.querySelector('button[type=submit]'))

    await waitFor(() => {
      expect(storeToken).toHaveBeenCalledWith('tok')
      expect(onAuthenticated).toHaveBeenCalledWith({ username: 'sai' })
    })
  })

  it('shows an inline error when login fails', async () => {
    const user = userEvent.setup()
    api.post.mockRejectedValueOnce({ response: { data: { detail: 'Invalid credentials' } } })

    render(<AuthPage onAuthenticated={() => {}} />)
    await user.type(screen.getByLabelText(/Email Address/i), 'bad')
    await user.type(screen.getByLabelText(/^Password/i), 'wrong')
    await user.click(document.querySelector('button[type=submit]'))

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    })
  })

  it('disables the submit button while submitting', async () => {
    const user = userEvent.setup()
    api.post.mockReturnValueOnce(new Promise(() => {})) // never resolves

    render(<AuthPage onAuthenticated={() => {}} />)
    await user.type(screen.getByLabelText(/Email Address/i), 'sai')
    await user.type(screen.getByLabelText(/^Password/i), 'pass')
    await user.click(document.querySelector('button[type=submit]'))

    expect(screen.getByRole('button', { name: /Working/i })).toBeDisabled()
  })
})

describe('AuthPage — signup mode', () => {
  it('shows the full name field after switching to signup', async () => {
    const user = userEvent.setup()
    render(<AuthPage onAuthenticated={() => {}} />)

    await user.click(screen.getByRole('button', { name: /^Sign Up$/i }))
    expect(screen.getByPlaceholderText(/Your name/i)).toBeInTheDocument()
  })

  it('submits signup with full name, username, and password', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValueOnce({ data: { token: 'tok2', user: { username: 'newuser' } } })

    render(<AuthPage onAuthenticated={() => {}} />)
    await user.click(screen.getByRole('button', { name: /^Sign Up$/i }))

    await user.type(screen.getByPlaceholderText(/Your name/i), 'New User')
    await user.type(screen.getByLabelText(/Email Address/i), 'newuser')
    await user.type(screen.getByLabelText(/^Password/i), 'password123')

    // The submit button in signup mode says "Start onboarding"
    const submitBtn = screen.getAllByRole('button').find(
      (btn) => btn.type === 'submit' || btn.textContent?.match(/Start onboarding|Continue/),
    )
    await user.click(submitBtn)

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/v1/auth/signup', {
        full_name: 'New User',
        username: 'newuser',
        password: 'password123',
      })
    })
  })

  it('can toggle back to login from signup and hides the name field', async () => {
    const user = userEvent.setup()
    render(<AuthPage onAuthenticated={() => {}} />)

    await user.click(screen.getByRole('button', { name: /^Sign Up$/i }))
    expect(screen.getByPlaceholderText(/Your name/i)).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /^Log In$/i })[0])
    expect(screen.queryByPlaceholderText(/Your name/i)).not.toBeInTheDocument()
  })
})
