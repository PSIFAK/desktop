import { git } from './core'
import { Repository } from '../../models/repository'

const CheckAttrBatchSize = 512

interface ILFSTrackOutput {
  readonly patterns: ReadonlyArray<{
    readonly tracked: boolean
  }>
}

/** Install the global LFS filters. */
export async function installGlobalLFSFilters(force: boolean): Promise<void> {
  const args = ['lfs', 'install', '--skip-repo']
  if (force) {
    args.push('--force')
  }

  await git(args, __dirname, 'installGlobalLFSFilter')
}

/** Install LFS hooks in the repository. */
export async function installLFSHooks(
  repository: Repository,
  force: boolean
): Promise<void> {
  const args = ['lfs', 'install']
  if (force) {
    args.push('--force')
  }

  await git(args, repository.path, 'installLFSHooks')
}

/** Is the repository configured to track any paths with LFS? */
export async function isUsingLFS(repository: Repository): Promise<boolean> {
  const env = {
    GIT_LFS_TRACK_NO_INSTALL_HOOKS: '1',
  }
  const result = await git(
    ['lfs', 'track', '--json'],
    repository.path,
    'isUsingLFS',
    {
      env,
    }
  )

  try {
    const output = JSON.parse(result.stdout) as Partial<ILFSTrackOutput>

    if (!Array.isArray(output.patterns)) {
      return false
    }

    return output.patterns.some(pattern => pattern.tracked)
  } catch {
    return false
  }
}

/**
 * Check if a provided file path is being tracked by Git LFS
 *
 * This uses the Git plumbing to read the .gitattributes file
 * for any LFS-related rules that are set for the file
 *
 * @param repository repository with
 * @param path relative file path in the repository
 */
export async function isTrackedByLFS(
  repository: Repository,
  path: string
): Promise<boolean> {
  const { stdout } = await git(
    ['check-attr', 'filter', path],
    repository.path,
    'checkAttrForLFS'
  )

  // "git check-attr -a" will output every filter it can find in .gitattributes
  // and it looks like this:
  //
  // README.md: diff: lfs
  // README.md: merge: lfs
  // README.md: text: unset
  // README.md: filter: lfs
  //
  // To verify git-lfs this test will just focus on that last row, "filter",
  // and the value associated with it. If nothing is found in .gitattributes
  // the output will look like this
  //
  // README.md: filter: unspecified

  const lfsFilterRegex = /: filter: lfs/

  const match = lfsFilterRegex.exec(stdout)

  return match !== null
}

/**
 * Query a Git repository and filter the set of provided relative paths to see
 * which are not covered by the current Git LFS configuration.
 *
 * @param repository
 * @param filePaths List of relative paths in the repository
 */
export async function filesNotTrackedByLFS(
  repository: Repository,
  filePaths: ReadonlyArray<string>
): Promise<ReadonlyArray<string>> {
  const filesNotTrackedByGitLFS = new Array<string>()

  for (let i = 0; i < filePaths.length; i += CheckAttrBatchSize) {
    const batch = filePaths.slice(i, i + CheckAttrBatchSize)
    const { stdout } = await git(
      ['check-attr', 'filter', '--', ...batch],
      repository.path,
      'checkAttrForLFSBatch'
    )

    const trackedFiles = new Set<string>()
    for (const line of stdout.split(/\r?\n/)) {
      const separator = ': filter: '
      if (!line.endsWith('lfs')) {
        continue
      }

      const separatorIndex = line.lastIndexOf(separator)
      if (separatorIndex === -1) {
        continue
      }

      trackedFiles.add(line.substring(0, separatorIndex))
    }

    for (const file of batch) {
      if (!trackedFiles.has(file)) {
        filesNotTrackedByGitLFS.push(file)
      }
    }
  }

  return filesNotTrackedByGitLFS
}
