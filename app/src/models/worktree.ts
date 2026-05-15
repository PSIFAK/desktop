/** A Git worktree linked to a repository. */
export interface IWorktree {
  readonly path: string
  readonly head: string | null
  readonly branchName: string | null
  readonly isCurrent: boolean
  readonly isMain: boolean
  readonly isDetached: boolean
  readonly isBare: boolean
  readonly isLocked: boolean
  readonly lockReason?: string
  readonly isPrunable: boolean
}
