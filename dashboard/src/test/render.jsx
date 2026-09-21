import { render as renderUI } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

export function render(ui, options = {}) {
  return renderUI(ui, { wrapper: MemoryRouter, ...options })
}

export { screen, fireEvent, waitFor, within } from '@testing-library/react'
