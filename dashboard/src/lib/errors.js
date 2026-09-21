export function getApiErrorMessage(error, fallback = 'Unable to complete this request.') {
  const detail = error?.response?.data?.detail || error?.response?.data?.error
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg).filter((message) => typeof message === 'string').join('; ') || fallback
  }
  if (error?.code === 'ECONNABORTED') return 'The request timed out. Please try again.'
  return fallback
}
