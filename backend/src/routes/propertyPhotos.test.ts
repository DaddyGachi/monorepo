import { describe, it, expect, vi } from 'vitest'
import { createPropertyPhotosRouter } from './propertyPhotos.js'

vi.mock('../middleware/auth.js', () => ({
  authenticateToken: (req: any, res: any, next: any) => next()
}))
describe('PropertyPhotos Router', () => {
  it('should be defined', () => {
    expect(createPropertyPhotosRouter()).toBeDefined()
  })
})
