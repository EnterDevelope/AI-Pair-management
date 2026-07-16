#!/usr/bin/env node

import { execFileSync } from 'node:child_process'

const cachedOnly = process.argv.includes('--cached')

function git(args, encoding = 'buffer') {
  return execFileSync('git', args, {
    encoding: encoding === 'buffer' ? null : 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function stagedPaths() {
  const args = cachedOnly
    ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']
    : ['ls-files', '-z']
  const output = git(args)
  return output.toString('utf8').split('\0').filter(Boolean)
}

function forbiddenPathRule(file) {
  const normalized = file.replaceAll('\\', '/')
  const basename = normalized.split('/').at(-1) ?? normalized

  if (/^(?:\.planning|research|test-project|harness|\.agents|\.omx)(?:\/|$)/.test(normalized)) return 'local-only path'
  if (/^\.codex(?:\/|$|[^/])/.test(normalized)) return 'local Codex state'
  if (/^(?:AGENTS|CLAUDE)\.md$/.test(normalized)) return 'local agent instructions'
  if (/^\.aipm(?:\/|$)/.test(normalized)) return 'local queue or history'
  if (/^(?:node_modules|\.next|dist|out|output|\.playwright-cli)(?:\/|$)/.test(normalized)) return 'generated artifact'
  if (normalized.startsWith('.claude/') && !/^\.claude\/commands\/aipm-[^/]+\.md$/.test(normalized)) {
    return 'non-product Claude harness'
  }
  if (basename !== '.env.example' && /^\.env(?:\.|$)/.test(basename)) return 'environment file'
  if (['.envrc', '.npmrc', '.netrc'].includes(basename)) return 'credential-bearing config'
  if (/^(?:credentials?|secrets?|service-account|auth)(?:[._-].*)?\.json$/i.test(basename)) return 'credential file'
  if (/\.(?:pem|key|p12|pfx)$/i.test(basename) || /^(?:id_rsa|id_ed25519)$/.test(basename)) return 'private key file'
  return null
}

const secretRules = [
  ['private key header', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['GitHub token', /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
  ['OpenAI-style secret key', /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Slack token', /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/],
  ['npm access token', /\bnpm_[A-Za-z0-9]{20,}\b/],
]

let blocked = false

for (const file of stagedPaths()) {
  const pathRule = forbiddenPathRule(file)
  if (pathRule != null) {
    console.error(`공개 경계 위반: ${file} (${pathRule})`)
    blocked = true
    continue
  }

  let content
  try {
    content = git(['show', `:0:${file}`]).toString('utf8')
  } catch {
    console.error(`공개 경계 검사 실패: ${file} (staged blob을 읽을 수 없음)`)
    blocked = true
    continue
  }
  if (content.includes('\0')) continue

  for (const [label, pattern] of secretRules) {
    if (pattern.test(content)) {
      console.error(`비밀정보 의심 파일 차단: ${file} (${label})`)
      blocked = true
      break
    }
  }
}

if (blocked) process.exit(1)
console.log(`공개 경계 검사 통과 (${cachedOnly ? 'staged' : 'tracked'} files)`)
