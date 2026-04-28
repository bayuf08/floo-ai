export function getRequestErrorDetail(error: any, fallback = 'Something went wrong.'): string {
  const detail =
    error?.data?.statusMessage
    || error?.data?.message
    || error?.statusMessage
    || error?.message
    || fallback

  return typeof detail === 'string' && detail.trim() ? detail.trim() : fallback
}
