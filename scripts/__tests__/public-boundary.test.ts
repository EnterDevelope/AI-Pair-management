import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(new URL('.', import.meta.url).pathname, '../..')
const CHECKER = join(ROOT, 'scripts', 'check-public-boundary.mjs')
const tempDirs = [] as string[]

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'aipm-public-boundary-'))
  tempDirs.push(dir)
  execFileSync('git', ['init'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@aipm.local'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'AIPM Test'], { cwd: dir })
  return dir
}

function stage(dir: string, file: string, content: string) {
  const fullPath = join(dir, file)
  mkdirSync(resolve(fullPath, '..'), { recursive: true })
  writeFileSync(fullPath, content)
  execFileSync('git', ['add', '--', file], { cwd: dir })
  return fullPath
}

function check(dir: string) {
  return spawnSync('node', [CHECKER, '--cached'], { cwd: dir, encoding: 'utf8' })
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('check-public-boundary', () => {
  it('제품 명령과 placeholder .env.example은 허용한다', () => {
    const dir = repo()
    stage(dir, '.claude/commands/aipm-flow.md', '# product command')
    stage(dir, '.env.example', 'AIPM_PROJECT_DIR=/path/to/project')
    expect(check(dir).status).toBe(0)
  })

  it('로컬 계획과 실제 env 파일은 차단한다', () => {
    const dir = repo()
    stage(dir, '.planning/STATE.md', '# local')
    stage(dir, '.env.local', 'VALUE=placeholder')
    const result = check(dir)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('.planning/STATE.md')
    expect(result.stderr).toContain('.env.local')
  })

  it('credential 파일은 값 노출 없이 차단한다', () => {
    const dir = repo()
    const value = 'DO_NOT_PRINT_ME'
    stage(dir, 'config/service-account.prod.json', `{"private":"${value}"}`)
    const result = check(dir)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('credential file')
    expect(result.stderr).not.toContain(value)
  })

  it('private key header와 고신뢰 토큰 접두사를 값 노출 없이 차단한다', () => {
    const dir = repo()
    const privateHeader = ['-----BEGIN ', 'PRIVATE KEY-----'].join('')
    const token = ['ghp_', 'A'.repeat(24)].join('')
    stage(dir, 'fixtures/key.txt', `${privateHeader}\nplaceholder`)
    stage(dir, 'fixtures/token.txt', token)
    const result = check(dir)
    expect(result.status).toBe(1)
    expect(result.stderr).not.toContain(token)
    expect(result.stderr).toContain('fixtures/key.txt')
    expect(result.stderr).toContain('fixtures/token.txt')
  })

  it('working tree가 안전해 보여도 staged blob에 비밀 헤더가 남아 있으면 차단한다', () => {
    const dir = repo()
    const privateHeader = ['-----BEGIN ', 'OPENSSH PRIVATE KEY-----'].join('')
    const file = stage(dir, 'config.txt', privateHeader)
    writeFileSync(file, 'safe working tree')
    expect(check(dir).status).toBe(1)
  })
})
