import { OpenbikaClient } from '@openbika/sdk'

import { getApiBaseUrl } from '#/auth-client'

export function getDashboardApiClient(): OpenbikaClient {
  return new OpenbikaClient({
    baseUrl: getApiBaseUrl(),
    credentials: 'include',
  })
}
