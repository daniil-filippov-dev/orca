import { describe, expect, it, vi } from 'vitest'
import { resolveGitLfsPreview } from './git-lfs-preview'

const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0xff, 0x0a])
const pointer = Buffer.from(
  `version https://git-lfs.github.com/spec/v1\noid sha256:${'a'.repeat(64)}\nsize 7\n`
)

describe('Git LFS image preview resolution', () => {
  it('keeps ordinary binary bytes without invoking a filter', async () => {
    const smudge = vi.fn().mockResolvedValue(pointer)
    expect(await resolveGitLfsPreview(image, 'image.png', smudge)).toBe(image)
    expect(smudge).not.toHaveBeenCalled()
  })

  it('resolves a historical pointer through stdin independently of current attributes', async () => {
    const smudge = vi.fn().mockResolvedValue(image)
    const result = await resolveGitLfsPreview(pointer, 'assets/image with spaces.png', smudge)
    expect(result).toEqual(image)
    expect(smudge).toHaveBeenCalledWith(
      [
        '-c',
        'lfs.fetchinclude=',
        '-c',
        'lfs.fetchexclude=',
        'lfs',
        'smudge',
        '--',
        'assets/image with spaces.png'
      ],
      pointer.toString('utf8')
    )
  })

  it('accepts CRLF pointers and the original Git LFS specification URL', async () => {
    const historical = Buffer.from(
      pointer
        .toString('utf8')
        .replace('git-lfs.github.com', 'hawser.github.com')
        .replaceAll('\n', '\r\n')
    )
    expect(await resolveGitLfsPreview(historical, 'image.png', async () => image)).toEqual(image)
  })

  it('rejects successful skip-smudge responses that still contain a pointer', async () => {
    await expect(resolveGitLfsPreview(pointer, 'image.png', async () => pointer)).rejects.toThrow(
      'Git LFS preview could not be resolved'
    )
  })

  it('preserves authentication and transport failures instead of returning an empty image', async () => {
    const error = new Error('Synthetic LFS HTTP 403')
    await expect(
      resolveGitLfsPreview(pointer, 'image.png', async () => {
        throw error
      })
    ).rejects.toBe(error)
  })

  it('does not run a smudge command for invalid or oversized pointer-like content', async () => {
    const smudge = vi.fn().mockResolvedValue(image)
    for (const value of [
      Buffer.from(pointer.toString('utf8').replace('a'.repeat(64), 'invalid')),
      Buffer.from(`${pointer.toString('utf8')}${'x'.repeat(1024)}`)
    ]) {
      expect(await resolveGitLfsPreview(value, 'image.png', smudge)).toBe(value)
    }
    expect(smudge).not.toHaveBeenCalled()
  })
})
