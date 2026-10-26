import { describe, expect, it } from 'vitest'
import { authErrorKey, loginUrl } from './auth'

describe('auth', () => {
  it('builds the login URL and error keys', () => {
    expect(loginUrl('/ping?target=x')).toBe('/api/v1/auth/login?next=%2Fping%3Ftarget%3Dx')
    expect(loginUrl('//evil.example')).toBe('/api/v1/auth/login?next=%2F')
    expect(authErrorKey('not_allowed')).toBe('auth.errors.not_allowed')
    expect(authErrorKey('<script>')).toBe('auth.errors.internal')
  })
})
