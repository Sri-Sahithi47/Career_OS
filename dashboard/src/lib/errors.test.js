import { expect, it } from 'vitest'
import { getApiErrorMessage } from './errors'

it('formats validation errors as text React can render', () => {
  expect(getApiErrorMessage({ response: { data: { detail: [{ msg: 'Password is too short' }] } } })).toBe('Password is too short')
})
it('handles unstructured failures', () => {
  expect(getApiErrorMessage({ response: { data: { detail: {} } } }, 'Try again')).toBe('Try again')
  expect(getApiErrorMessage({ code: 'ECONNABORTED' })).toContain('timed out')
})
