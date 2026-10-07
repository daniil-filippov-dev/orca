import { runProcess } from '../shared/child-process/run-process'
import { MAX_GIT_BUFFER } from './git-handler-command-termination'

export const GIT_BLOB_READ_TIMEOUT_MS = 120_000

export async function runGitBlobCommand(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  stdin?: string,
  timeoutMs = GIT_BLOB_READ_TIMEOUT_MS
): Promise<Buffer> {
  const result = await runProcess({
    program: 'git',
    args,
    cwd,
    env,
    timeoutMs,
    maxOutputBytes: MAX_GIT_BUFFER,
    captureStdoutBuffer: true,
    stopOnOutputLimit: true,
    terminationBarrier: true,
    forceTerminationOnStop: true,
    ...(stdin === undefined ? {} : { input: stdin })
  })
  if (result.outputTruncated) {
    throw Object.assign(new Error('Git blob output exceeded maxBuffer'), { code: 'ENOBUFS' })
  }
  if (result.timedOut || result.code !== 0) {
    throw new Error(result.timedOut ? 'Git blob read timed out' : 'Git blob read failed')
  }
  if (!Buffer.isBuffer(result.stdoutBuffer)) {
    throw new Error('Git blob output is not a buffer')
  }
  return result.stdoutBuffer
}
