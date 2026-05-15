import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as Path from 'path'
import { exec } from 'dugite'

import { createTempDirectory } from '../../helpers/temp'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'
import {
  createWorktree,
  getWorktreeCheckedOutBranches,
  getWorktrees,
  parseWorktreeList,
  removeWorktree,
} from '../../../src/lib/git'

describe('git/worktree', () => {
  describe('getWorktreeCheckedOutBranches', () => {
    it('returns only main worktree branch when there are no linked worktrees', async t => {
      const repo = await setupEmptyRepository(t, 'main')
      await makeCommit(repo, {
        entries: [{ path: 'README', contents: 'hello' }],
      })

      const branches = await getWorktreeCheckedOutBranches(repo)
      assert.strictEqual(branches.size, 1)
      assert(branches.has('refs/heads/main'))
    })

    it('returns branches checked out in linked worktrees', async t => {
      const repo = await setupEmptyRepository(t, 'main')
      await makeCommit(repo, {
        entries: [{ path: 'README', contents: 'hello' }],
      })
      await exec(['branch', 'feature-a'], repo.path)
      await exec(
        ['worktree', 'add', repo.path + '-wt-a', 'feature-a'],
        repo.path
      )

      const branches = await getWorktreeCheckedOutBranches(repo)
      assert(branches.has('refs/heads/feature-a'))
      assert(branches.has('refs/heads/main'))
      assert.strictEqual(branches.size, 2)
    })

    it('handles multiple linked worktrees', async t => {
      const repo = await setupEmptyRepository(t, 'main')
      await makeCommit(repo, {
        entries: [{ path: 'README', contents: 'hello' }],
      })
      await exec(['branch', 'feature-a'], repo.path)
      await exec(['branch', 'feature-b'], repo.path)
      await exec(
        ['worktree', 'add', repo.path + '-wt-a', 'feature-a'],
        repo.path
      )
      await exec(
        ['worktree', 'add', repo.path + '-wt-b', 'feature-b'],
        repo.path
      )

      const branches = await getWorktreeCheckedOutBranches(repo)
      assert(branches.has('refs/heads/feature-a'))
      assert(branches.has('refs/heads/feature-b'))
      assert(branches.has('refs/heads/main'))
      assert.strictEqual(branches.size, 3)
    })

    it('handles detached HEAD worktrees', async t => {
      const repo = await setupEmptyRepository(t, 'main')
      await makeCommit(repo, {
        entries: [{ path: 'README', contents: 'hello' }],
      })

      const { stdout } = await exec(['rev-parse', 'HEAD'], repo.path)
      const sha = stdout.trim()
      await exec(
        ['worktree', 'add', '--detach', repo.path + '-wt-detached', sha],
        repo.path
      )

      const branches = await getWorktreeCheckedOutBranches(repo)
      // Detached worktrees have no branch line in porcelain output
      // but the main worktree branch is still included
      assert.strictEqual(branches.size, 1)
      assert(branches.has('refs/heads/main'))
    })
  })

  describe('parseWorktreeList', () => {
    it('parses porcelain worktree output', () => {
      const output = [
        'worktree /repo',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /repo feature',
        'HEAD def456',
        'branch refs/heads/feature/test',
        'locked dependency install',
        '',
        'worktree /repo detached',
        'HEAD 123abc',
        'detached',
        'prunable gitdir file points to non-existent location',
        '',
      ].join('\n')

      const worktrees = parseWorktreeList(output, '/repo')

      assert.equal(worktrees.length, 3)
      assert.equal(worktrees[0].isMain, true)
      assert.equal(worktrees[0].isCurrent, true)
      assert.equal(worktrees[0].branchName, 'main')
      assert.equal(worktrees[1].branchName, 'feature/test')
      assert.equal(worktrees[1].isLocked, true)
      assert.equal(worktrees[1].lockReason, 'dependency install')
      assert.equal(worktrees[2].isDetached, true)
      assert.equal(worktrees[2].isPrunable, true)
    })
  })

  it('creates, lists, and removes a worktree', async t => {
    const repository = await setupEmptyRepository(t, 'main')
    await makeCommit(repository, {
      entries: [{ path: 'README.md', contents: 'hello' }],
    })

    const parent = await createTempDirectory(t)
    const worktreePath = Path.join(parent, 'repo feature')

    await createWorktree(repository, worktreePath, 'feature/worktree', 'main')

    const worktrees = await getWorktrees(repository)
    const created = worktrees.find(
      worktree => Path.normalize(worktree.path) === Path.normalize(worktreePath)
    )

    assert.notEqual(created, undefined)
    assert.equal(created?.branchName, 'feature/worktree')
    assert.equal(created?.isCurrent, false)

    await removeWorktree(repository, worktreePath)

    const afterRemove = await getWorktrees(repository)
    assert.equal(
      afterRemove.some(
        worktree =>
          Path.normalize(worktree.path) === Path.normalize(worktreePath)
      ),
      false
    )
  })
})
