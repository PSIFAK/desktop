import * as Path from 'path'

import { Repository } from '../../models/repository'
import { IWorktree } from '../../models/worktree'
import { git } from './core'

interface IParsedWorktree {
  readonly path: string
  readonly head: string | null
  readonly branchName: string | null
  readonly isDetached: boolean
  readonly isBare: boolean
  readonly isLocked: boolean
  readonly lockReason?: string
  readonly isPrunable: boolean
}

function normalizePath(path: string): string {
  const normalized = Path.normalize(path)
  return __WIN32__ ? normalized.toLowerCase() : normalized
}

function branchNameFromRef(ref: string): string {
  return ref.startsWith('refs/heads/')
    ? ref.substring('refs/heads/'.length)
    : ref
}

function parseWorktreeRecord(
  lines: ReadonlyArray<string>
): IParsedWorktree | null {
  let path: string | null = null
  let head: string | null = null
  let branchName: string | null = null
  let isDetached = false
  let isBare = false
  let isLocked = false
  let lockReason: string | undefined
  let isPrunable = false

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      path = line.substring('worktree '.length)
    } else if (line.startsWith('HEAD ')) {
      head = line.substring('HEAD '.length)
    } else if (line.startsWith('branch ')) {
      branchName = branchNameFromRef(line.substring('branch '.length))
    } else if (line === 'detached') {
      isDetached = true
    } else if (line === 'bare') {
      isBare = true
    } else if (line === 'locked') {
      isLocked = true
    } else if (line.startsWith('locked ')) {
      isLocked = true
      lockReason = line.substring('locked '.length)
    } else if (line === 'prunable' || line.startsWith('prunable ')) {
      isPrunable = true
    }
  }

  if (path === null) {
    return null
  }

  return {
    path,
    head,
    branchName,
    isDetached,
    isBare,
    isLocked,
    lockReason,
    isPrunable,
  }
}

export function parseWorktreeList(
  output: string,
  currentPath: string
): ReadonlyArray<IWorktree> {
  const records = new Array<IParsedWorktree>()
  let currentRecord = new Array<string>()

  for (const line of output.split(/\r?\n/)) {
    if (line.length === 0) {
      const parsed = parseWorktreeRecord(currentRecord)
      if (parsed !== null) {
        records.push(parsed)
      }
      currentRecord = []
      continue
    }

    currentRecord.push(line)
  }

  const parsed = parseWorktreeRecord(currentRecord)
  if (parsed !== null) {
    records.push(parsed)
  }

  const normalizedCurrentPath = normalizePath(currentPath)

  return records.map((worktree, index) => ({
    ...worktree,
    isCurrent: normalizePath(worktree.path) === normalizedCurrentPath,
    isMain: index === 0,
  }))
}

export async function getWorktrees(
  repository: Repository
): Promise<ReadonlyArray<IWorktree>> {
  const result = await git(
    ['worktree', 'list', '--porcelain'],
    repository.path,
    'getWorktrees'
  )

  return parseWorktreeList(result.stdout, repository.path)
}

/**
 * Get the set of canonical branch refs (e.g. `refs/heads/feature`)
 * checked out in any worktree (main or linked).
 */
export async function getWorktreeCheckedOutBranches(
  repository: Repository
): Promise<ReadonlySet<string>> {
  const result = await git(
    ['worktree', 'list', '--porcelain', '-z'],
    repository.path,
    'getWorktreeCheckedOutBranches'
  )

  const branches = new Set<string>()

  for (const line of result.stdout.split('\0')) {
    if (line.startsWith('branch ')) {
      branches.add(line.substring('branch '.length))
    }
  }

  return branches
}

export async function createWorktree(
  repository: Repository,
  path: string,
  branchName: string,
  startPoint: string
): Promise<void> {
  await git(
    ['worktree', 'add', '-b', branchName, path, startPoint],
    repository.path,
    'createWorktree'
  )
}

export async function removeWorktree(
  repository: Repository,
  path: string
): Promise<void> {
  await git(['worktree', 'remove', path], repository.path, 'removeWorktree')
}
