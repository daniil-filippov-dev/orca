import { describe, expect, it } from 'vitest'
import { runProcess } from './run-process'

describe('binary process output', () => {
  it('returns exact bytes instead of decoding invalid UTF-8', async () => {
    const result = await runProcess({
      program: process.execPath,
      args: ['-e', 'process.stdout.write(Buffer.from([0,255,137,195,128]))'],
      captureStdoutBuffer: true
    })
    expect(result.stdout).toBe('')
    expect(result.stdoutBuffer).toEqual(Buffer.from([0, 255, 137, 195, 128]))
    expect(result.code).toBe(0)
  })

  it('stops overflowing output and reports truncation instead of success', async () => {
    const result = await runProcess({
      program: process.execPath,
      args: ['-e', 'setInterval(()=>process.stdout.write(Buffer.alloc(1024,255)),5)'],
      captureStdoutBuffer: true,
      stopOnOutputLimit: true,
      maxOutputBytes: 16,
      terminationBarrier: true,
      forceTerminationOnStop: true,
      timeoutMs: 5_000
    })
    expect(result.stdoutBuffer).toEqual(Buffer.alloc(16, 255))
    expect(result.outputTruncated).toBe(true)
    expect(result.timedOut).toBe(false)
  })
})
