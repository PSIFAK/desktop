import * as React from 'react'
import * as Path from 'path'

import { Branch, BranchType } from '../../models/branch'
import { Repository } from '../../models/repository'
import { Tip, TipState } from '../../models/tip'
import { IWorktree } from '../../models/worktree'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogContent, DialogError, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Button } from '../lib/button'
import { Ref } from '../lib/ref'
import { RefNameTextBox } from '../lib/ref-name-text-box'
import { Row } from '../lib/row'
import { TextBox } from '../lib/text-box'
import { showOpenDialog } from '../main-process-proxy'
import { startTimer } from '../lib/timing'
import { renderBranchNameExistsOnRemoteWarning } from '../lib/branch-name-warnings'

interface ICreateWorktreeProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly tip: Tip
  readonly defaultBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
  readonly worktrees: ReadonlyArray<IWorktree>
  readonly initialBranchName?: string
  readonly initialPath?: string
  readonly onDismissed: () => void
}

interface ICreateWorktreeState {
  readonly branchName: string
  readonly path: string
  readonly pathManuallyChanged: boolean
  readonly isCreatingWorktree: boolean
}

function normalizePath(path: string): string {
  const normalized = Path.normalize(path)
  return __WIN32__ ? normalized.toLowerCase() : normalized
}

function sanitizeDirectoryName(name: string): string {
  const sanitized = name.replace(/[\\/:<>|"?!*]+/g, '-').replace(/\s+$/, '')
  return sanitized.length > 0 ? sanitized : 'worktree'
}

function getBranchBaseName(props: ICreateWorktreeProps): string {
  if (props.initialBranchName !== undefined) {
    return props.initialBranchName
  }

  if (props.tip.kind === TipState.Valid) {
    return `${props.tip.branch.name}-worktree`
  }

  if (props.defaultBranch !== null) {
    return `${props.defaultBranch.name}-worktree`
  }

  return 'worktree'
}

function getUniqueBranchName(
  baseName: string,
  branches: ReadonlyArray<Branch>
): string {
  const existingNames = new Set(
    branches.filter(b => b.type === BranchType.Local).map(b => b.name)
  )

  if (!existingNames.has(baseName)) {
    return baseName
  }

  for (let index = 2; ; index++) {
    const candidate = `${baseName}-${index}`
    if (!existingNames.has(candidate)) {
      return candidate
    }
  }
}

function getStartPoint(tip: Tip, defaultBranch: Branch | null): string {
  if (tip.kind === TipState.Valid) {
    return tip.branch.name
  }

  return defaultBranch?.name ?? 'HEAD'
}

function getSuggestedPath(
  repository: Repository,
  worktrees: ReadonlyArray<IWorktree>,
  branchName: string
): string {
  const mainWorktree = worktrees.find(worktree => worktree.isMain)
  const basePath = mainWorktree?.path ?? repository.path
  const directory = Path.dirname(basePath)
  const repoName = Path.basename(basePath)
  const worktreeName = `${repoName}-${sanitizeDirectoryName(branchName)}`

  return Path.join(directory, worktreeName)
}

/** The Create Worktree component. */
export class CreateWorktree extends React.Component<
  ICreateWorktreeProps,
  ICreateWorktreeState
> {
  public constructor(props: ICreateWorktreeProps) {
    super(props)

    const branchName = getUniqueBranchName(
      getBranchBaseName(props),
      props.allBranches
    )
    const path =
      props.initialPath ??
      getSuggestedPath(props.repository, props.worktrees, branchName)

    this.state = {
      branchName,
      path,
      pathManuallyChanged: props.initialPath !== undefined,
      isCreatingWorktree: false,
    }
  }

  public render() {
    const disabled =
      this.state.isCreatingWorktree ||
      this.state.branchName.length === 0 ||
      /^\s*$/.test(this.state.branchName) ||
      this.state.path.length === 0 ||
      this.getBranchExists() ||
      this.getPathExistsAsWorktree()

    return (
      <Dialog
        id="create-worktree"
        title="Create worktree"
        onSubmit={this.createWorktree}
        onDismissed={this.props.onDismissed}
        loading={this.state.isCreatingWorktree}
        disabled={this.state.isCreatingWorktree}
      >
        {this.renderPathError()}
        {this.renderBranchError()}

        <DialogContent>
          <Row>
            <RefNameTextBox
              label="Branch name"
              initialValue={this.state.branchName}
              onValueChange={this.onBranchNameChange}
              ariaDescribedBy="worktree-branch-error"
            />
          </Row>

          {renderBranchNameExistsOnRemoteWarning(
            this.state.branchName,
            this.props.allBranches
          )}

          <Row>
            <TextBox
              label="Path"
              value={this.state.path}
              placeholder="worktree path"
              onValueChanged={this.onPathChanged}
              ariaDescribedBy="worktree-path-error"
            />
            <Button onClick={this.showFilePicker}>Choose...</Button>
          </Row>

          <p>
            The new worktree will be based on{' '}
            <Ref>{getStartPoint(this.props.tip, this.props.defaultBranch)}</Ref>
            .
          </p>
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Create worktree"
            okButtonDisabled={disabled}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onBranchNameChange = (branchName: string) => {
    this.setState(state => ({
      branchName,
      path: state.pathManuallyChanged
        ? state.path
        : getSuggestedPath(
            this.props.repository,
            this.props.worktrees,
            branchName
          ),
    }))
  }

  private onPathChanged = (path: string) => {
    this.setState({ path, pathManuallyChanged: true })
  }

  private showFilePicker = async () => {
    const path = await showOpenDialog({
      properties: ['createDirectory', 'openDirectory'],
    })

    if (path === null) {
      return
    }

    this.setState({ path, pathManuallyChanged: true })
  }

  private getBranchExists() {
    return this.props.allBranches.some(
      branch =>
        branch.type === BranchType.Local &&
        branch.name === this.state.branchName
    )
  }

  private getPathExistsAsWorktree() {
    const normalizedPath = normalizePath(this.state.path)
    return this.props.worktrees.some(
      worktree => normalizePath(worktree.path) === normalizedPath
    )
  }

  private renderBranchError() {
    if (!this.getBranchExists()) {
      return null
    }

    return (
      <DialogError>
        A branch named <Ref>{this.state.branchName}</Ref> already exists.
      </DialogError>
    )
  }

  private renderPathError() {
    if (!this.getPathExistsAsWorktree()) {
      return null
    }

    return (
      <DialogError>
        A worktree already exists at <Ref>{this.state.path}</Ref>.
      </DialogError>
    )
  }

  private createWorktree = async () => {
    const { repository, dispatcher } = this.props
    const { branchName, path } = this.state

    if (branchName.length === 0 || path.length === 0) {
      return
    }

    this.setState({ isCreatingWorktree: true })

    const timer = startTimer('create worktree', repository)
    await dispatcher.createWorktree(
      repository,
      branchName,
      path,
      getStartPoint(this.props.tip, this.props.defaultBranch)
    )
    timer.done()

    this.props.onDismissed()
  }
}
