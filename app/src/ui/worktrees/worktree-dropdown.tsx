import * as React from 'react'
import * as Path from 'path'
import classNames from 'classnames'

import { FoldoutType, IRepositoryState } from '../../lib/app-state'
import { Repository } from '../../models/repository'
import { IWorktree } from '../../models/worktree'
import { Dispatcher } from '../dispatcher'
import { Button } from '../lib/button'
import { Octicon, OcticonSymbol } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { PopupType } from '../../models/popup'
import { ToolbarDropdown, DropdownState } from '../toolbar/dropdown'

interface IWorktreeDropdownProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly repositoryState: IRepositoryState
  readonly isOpen: boolean
  readonly onDropDownStateChanged: (state: DropdownState) => void
  readonly enableFocusTrap: boolean
}

function getBaseName(path: string): string {
  const baseName = Path.basename(path)
  return baseName.length > 0 ? baseName : path
}

function getWorktreeTitle(worktree: IWorktree | undefined): string {
  if (worktree === undefined) {
    return 'Worktree'
  }

  return worktree.branchName ?? getBaseName(worktree.path)
}

function getWorktreeSubtitle(worktree: IWorktree): string {
  if (worktree.isPrunable) {
    return 'Prunable'
  }

  if (worktree.isLocked) {
    return worktree.lockReason ? `Locked: ${worktree.lockReason}` : 'Locked'
  }

  if (worktree.isDetached) {
    return 'Detached HEAD'
  }

  return worktree.path
}

function getWorktreeIcon(worktree: IWorktree): OcticonSymbol {
  if (worktree.isCurrent) {
    return octicons.check
  }

  if (worktree.isMain) {
    return octicons.repo
  }

  return octicons.versions
}

interface IWorktreeGroup {
  readonly title: string
  readonly worktrees: ReadonlyArray<IWorktree>
}

function getWorktreeGroups(
  worktrees: ReadonlyArray<IWorktree>
): ReadonlyArray<IWorktreeGroup> {
  const current = worktrees.filter(worktree => worktree.isCurrent)
  const main = worktrees.filter(
    worktree => worktree.isMain && !worktree.isCurrent
  )
  const other = worktrees.filter(
    worktree => !worktree.isCurrent && !worktree.isMain
  )

  return [
    { title: 'Current worktree', worktrees: current },
    { title: 'Main worktree', worktrees: main },
    { title: 'Other worktrees', worktrees: other },
  ].filter(group => group.worktrees.length > 0)
}

/** A toolbar dropdown for selecting and managing Git worktrees. */
export class WorktreeDropdown extends React.Component<IWorktreeDropdownProps> {
  private renderWorktreeFoldout = (): JSX.Element => {
    const { worktreesState } = this.props.repositoryState

    return (
      <div className="worktree-dropdown">
        <div className="worktree-actions">
          <Button onClick={this.onCreateWorktree}>
            <Octicon className="icon" symbol={octicons.plus} />
            New worktree
          </Button>
        </div>

        {this.renderWorktreeContent(worktreesState.worktrees)}
      </div>
    )
  }

  private renderWorktreeContent(worktrees: ReadonlyArray<IWorktree>) {
    const { worktreesState } = this.props.repositoryState

    if (worktreesState.isLoadingWorktrees && worktrees.length === 0) {
      return <div className="worktree-message">Loading worktrees...</div>
    }

    if (worktreesState.lastError !== null && worktrees.length === 0) {
      return (
        <div className="worktree-message error">Unable to load worktrees.</div>
      )
    }

    if (worktrees.length === 0) {
      return <div className="worktree-message">No worktrees found.</div>
    }

    return getWorktreeGroups(worktrees).map(group => (
      <div className="worktree-group" key={group.title}>
        <div className="worktree-group-header">{group.title}</div>
        {group.worktrees.map(this.renderWorktree)}
      </div>
    ))
  }

  private renderWorktree = (worktree: IWorktree) => {
    const canSelect = !worktree.isCurrent && !worktree.isPrunable
    const canRemove =
      !worktree.isCurrent &&
      !worktree.isMain &&
      !worktree.isLocked &&
      !worktree.isPrunable
    const removeTooltip = worktree.isCurrent
      ? 'Current worktree cannot be removed'
      : worktree.isMain
      ? 'Main worktree cannot be removed'
      : worktree.isLocked
      ? 'Locked worktree cannot be removed'
      : worktree.isPrunable
      ? 'Prunable worktree cannot be removed'
      : 'Remove worktree'

    return (
      <div
        key={worktree.path}
        className={classNames('worktree-list-item', {
          current: worktree.isCurrent,
          prunable: worktree.isPrunable,
        })}
      >
        <button
          className="worktree-list-item-main"
          onClick={() => this.onSelectWorktree(worktree)}
          disabled={!canSelect}
          title={worktree.path}
        >
          <Octicon className="icon" symbol={getWorktreeIcon(worktree)} />
          <div className="worktree-info">
            <div className="name">{getWorktreeTitle(worktree)}</div>
            <div className="description">{getWorktreeSubtitle(worktree)}</div>
          </div>
        </button>
        <Button
          className="worktree-remove-button"
          onClick={event => this.onRemoveWorktree(event, worktree)}
          disabled={!canRemove}
          tooltip={removeTooltip}
          ariaLabel={removeTooltip}
        >
          <Octicon symbol={octicons.trash} />
        </Button>
      </div>
    )
  }

  private onDropDownStateChanged = (state: DropdownState) => {
    if (state === 'open') {
      this.props.dispatcher.loadWorktrees(this.props.repository)
    }

    this.props.onDropDownStateChanged(state)
  }

  public render() {
    const { worktrees } = this.props.repositoryState.worktreesState
    const currentWorktree =
      worktrees.find(worktree => worktree.isCurrent) ?? worktrees[0]
    const currentState: DropdownState = this.props.isOpen ? 'open' : 'closed'

    return (
      <ToolbarDropdown
        className="worktree-button"
        buttonClassName="worktree-toolbar-button"
        icon={octicons.versions}
        title={getWorktreeTitle(currentWorktree)}
        description="Current worktree"
        tooltip={this.props.isOpen ? undefined : currentWorktree?.path}
        onDropdownStateChanged={this.onDropDownStateChanged}
        dropdownContentRenderer={this.renderWorktreeFoldout}
        dropdownState={currentState}
        foldoutStyleOverrides={{ width: 365, minWidth: 365 }}
        onlyShowTooltipWhenOverflowed={true}
        enableFocusTrap={this.props.enableFocusTrap}
      />
    )
  }

  private onCreateWorktree = () => {
    const { dispatcher, repository } = this.props

    dispatcher.closeFoldout(FoldoutType.Worktree)
    dispatcher.showPopup({
      type: PopupType.CreateWorktree,
      repository,
    })
  }

  private onSelectWorktree = (worktree: IWorktree) => {
    if (worktree.isCurrent || worktree.isPrunable) {
      return
    }

    const { dispatcher, repository } = this.props
    dispatcher.closeFoldout(FoldoutType.Worktree)
    dispatcher.selectWorktree(repository, worktree)
  }

  private onRemoveWorktree = (
    event: React.MouseEvent<HTMLButtonElement>,
    worktree: IWorktree
  ) => {
    event.stopPropagation()

    this.props.dispatcher.removeWorktree(this.props.repository, worktree)
  }
}
