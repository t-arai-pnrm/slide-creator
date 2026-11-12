/**
 * PR を作る前の検査を順に実行し、結果を検証の記録（.claude/logs/receipts/<ブランチ名>.json）に書く（pnpm verify）。
 * レビュー係は、会話ではなくこの記録を根拠にする。記録のコミットのハッシュを HEAD と照らし合わせて、
 * どの差分で検査が通ったかを確かめるので、未コミットの変更があるときの記録は無効（clean: false）にする
 */
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// test:html と test:e2e は build が作った dist を試すので、build の後に置く
const STEPS = ['test', 'build', 'test:html', 'test:e2e'] as const

type Step = { script: string; exitCode: number | null; durationMs: number }

const run = (...args: string[]) => spawnSync('git', args, { encoding: 'utf8' })

const git = (...args: string[]): string => {
	const result = run(...args)
	if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
	return result.stdout.trim()
}

// コミットが 1 つもないリポジトリでは HEAD が解決できない。そのときも検査は実行し、記録を無効にして残す
const head = (): string | null => {
	const result = run('rev-parse', '--verify', '--quiet', 'HEAD')
	return result.status === 0 ? result.stdout.trim() : null
}

const isClean = (): boolean => git('status', '--porcelain') === ''

const root = git('rev-parse', '--show-toplevel')
// rev-parse --abbrev-ref HEAD はコミットがないと失敗するので、HEAD が指すブランチの名前を読む
const branch = git('symbolic-ref', '--short', 'HEAD')
const commit = head()
const cleanBefore = commit !== null && isClean()
if (commit === null)
	console.warn('コミットがないので、この記録は PR の前の確認に使えません。コミットしてから実行し直してください。')
else if (!cleanBefore)
	console.warn(
		'未コミットの変更があるので、この記録は PR の前の確認に使えません。コミットしてから実行し直してください。',
	)

const startedAt = new Date().toISOString()
const steps: Step[] = []
for (const script of STEPS) {
	const start = performance.now()
	const result = spawnSync('pnpm', ['run', script], { stdio: 'inherit' })
	steps.push({ script, exitCode: result.status, durationMs: Math.round(performance.now() - start) })
	if (result.status !== 0) break
}

// 検査がファイルを書き換えた（整形やコード生成）ときも、記録したコミットと検査した中身が一致しなくなる
const clean = cleanBefore && isClean() && head() === commit
const ok = steps.length === STEPS.length && steps.every((step) => step.exitCode === 0)
const receipt = { branch, commit, clean, ok, startedAt, finishedAt: new Date().toISOString(), steps }

// .claude/logs/ は Git の管理から外す前提（.gitignore）
const dir = join(root, '.claude', 'logs', 'receipts')
const file = join(dir, `${branch.replaceAll('/', '-')}.json`)
await mkdir(dir, { recursive: true })
await writeFile(file, `${JSON.stringify(receipt, null, '\t')}\n`)

console.log(`\n検証の記録: ${file}`)
for (const step of steps)
	console.log(`  ${step.exitCode === 0 ? '成功' : '失敗'}  ${step.script}（${step.durationMs} ms）`)
for (const script of STEPS.slice(steps.length)) console.log(`  未実行  ${script}`)
if (commit === null) console.log('  無効: コミットがありません')
else if (!clean) console.log('  無効: 未コミットの変更があるか、検査の途中でファイルかコミットが変わりました')
process.exitCode = ok && clean ? 0 : 1
