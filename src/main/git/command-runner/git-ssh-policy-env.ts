import { addWslEnvKeys } from '../../wsl-env'
import { buildOpenSshBatchModeCommand } from '../../../shared/git-ssh-batch-mode'
import { execFileCapture } from './exec-file-capture'
import { resolveGitCommand } from './git-command-resolution'
import { DEFAULT_GIT_MAX_BUFFER, type GitExecOptions } from './git-exec-options'
import { promptGuardGitEnv } from './git-process-env'
import { acquireGitAdmission } from './git-subprocess-admission'

export type GitSshPolicyMode =
  | 'default'
  | 'explicit-env'
  | 'fallback'
  | 'configured-openssh'
  | 'configured-wrapper-passthrough'

const CORE_SSH_COMMAND_PROBE_TIMEOUT_MS = 2500

export async function buildNetworkSshPolicyEnv(options: GitExecOptions): Promise<{
  env: NodeJS.ProcessEnv
  mode: GitSshPolicyMode
}> {
  const promptEnv = promptGuardGitEnv(options.env)
  if (promptEnv.GIT_SSH_COMMAND) {
    return { env: promptEnv, mode: 'explicit-env' }
  }

  // Why fenced: a login-shell banner here reads as a user-configured sshCommand,
  // which skips the BatchMode fallback below and disarms the no-prompt guard.
  const resolved = resolveGitCommand(['config', '--get', 'core.sshCommand'], options, true, true)
  const probeArgs = ['config', '--get', 'core.sshCommand']
  const grant = await acquireGitAdmission({
    args: probeArgs,
    cwd: options.cwd,
    wslDistro: options.wslDistro,
    tier: options.admissionTier,
    signal: options.signal
  })
  let reportTerminated: () => void = () => {}
  const terminated = new Promise<void>((resolve) => {
    reportTerminated = resolve
  })
  let configuredCommand = ''
  try {
    const { stdout } = await execFileCapture(resolved.binary, resolved.args, {
      cwd: resolved.cwd,
      encoding: 'utf-8',
      maxBuffer: DEFAULT_GIT_MAX_BUFFER,
      timeout: CORE_SSH_COMMAND_PROBE_TIMEOUT_MS,
      env: promptEnv,
      signal: options.signal,
      onChildTerminated: reportTerminated
    })
    const payload = resolved.captured?.readStdout(String(stdout)) ?? String(stdout)
    configuredCommand = payload.trim()
  } catch {
    configuredCommand = ''
  } finally {
    void terminated.then(grant.release)
  }

  if (!configuredCommand) {
    const env = { ...promptEnv, GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' }
    // Why: WSL routing can come from either an explicit distro or a UNC cwd.
    if (resolved.wsl) {
      addWslEnvKeys(env, ['GIT_SSH_COMMAND'])
    }
    return { env, mode: 'fallback' }
  }

  const batchModeCommand = buildOpenSshBatchModeCommand(configuredCommand)
  if (!batchModeCommand) {
    // Why: custom SSH wrappers are user policy; rewriting their argv is riskier than relying on prompt guards + timeout.
    return { env: promptEnv, mode: 'configured-wrapper-passthrough' }
  }

  const env = { ...promptEnv, GIT_SSH_COMMAND: batchModeCommand }
  if (resolved.wsl) {
    addWslEnvKeys(env, ['GIT_SSH_COMMAND'])
  }
  return { env, mode: 'configured-openssh' }
}
