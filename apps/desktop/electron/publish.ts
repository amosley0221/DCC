/**
 * Publishing a snapshot so the phone can read the dynasty from anywhere.
 *
 * The relay in `relay.ts` only works when both devices are on the same network.
 * Away from home there has to be something in the middle, and the options are a
 * server to run, a tunnel to install, or a store that already exists. This uses
 * the last of those: the user's own GitHub, which they already have, which is
 * free, which can be private, and which needs nothing running anywhere.
 *
 * The snapshot goes up as a release asset rather than a file in a repository or
 * a gist, because assets are meant for binaries, are not size-limited in any way
 * that matters here, and replacing one does not grow a git history. It is gzipped
 * first: six megabytes of JSON compresses to well under one.
 *
 * The token is the user's own and is stored with their settings on their machine.
 * It needs only `repo` scope on the repository they name.
 */
import { gzipSync } from 'node:zlib'
import { net } from 'electron'

const API = 'https://api.github.com'
const UPLOADS = 'https://uploads.github.com'
/** One release, reused forever, holding the current snapshot. */
export const RELEASE_TAG = 'dynasty-snapshot'
export const ASSET_NAME = 'dcc-snapshot.json.gz'

export interface PublishTarget {
  /** "owner/name" of a repository the token can write to. Private is fine. */
  repo: string
  token: string
}

export interface PublishResult {
  ok: boolean
  message: string
  /** What the phone needs: the asset's API URL, which works with the same token. */
  assetUrl?: string
  bytes?: number
}

async function gh(target: PublishTarget, url: string, init: RequestInit = {}): Promise<Response> {
  return net.fetch(url, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${target.token}`,
      'x-github-api-version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  })
}

/**
 * A release has to hang off a commit, and a repository made through the "new
 * repository" button has none at all — no commit, no default branch. Creating a
 * release there fails with a message about an invalid target that says nothing
 * about the real cause, so the first publish writes a README and lets GitHub
 * make the default branch as a side effect.
 */
async function ensureInitialised(target: PublishTarget): Promise<string | null> {
  const commits = await gh(target, `${API}/repos/${target.repo}/commits?per_page=1`)
  if (commits.status === 200) return null
  if (commits.status === 404) return `No repository called ${target.repo}, or the token cannot see it.`
  if (commits.status === 401 || commits.status === 403) {
    return 'GitHub refused the token. It needs repo access to that repository.'
  }
  // 409 is GitHub's way of saying the repository is empty.
  if (commits.status !== 409) return `GitHub returned ${commits.status} checking the repository.`

  const readme = [
    '# Dynasty snapshots',
    '',
    'Written by Dynasty Command Center so the phone can read the dynasty away',
    'from home. The current snapshot is the release asset, not a file here.',
    '',
  ].join('\n')
  const made = await gh(target, `${API}/repos/${target.repo}/contents/README.md`, {
    method: 'PUT',
    body: JSON.stringify({
      message: 'Start the repository so snapshots have somewhere to hang off',
      content: Buffer.from(readme, 'utf8').toString('base64'),
    }),
  })
  if (made.status === 201) return null
  return `Could not start the empty repository (${made.status}). ${await made.text().catch(() => '')}`.trim()
}

/** Finds the reusable release, creating it the first time. */
async function releaseId(target: PublishTarget): Promise<{ id: number } | { error: string }> {
  const got = await gh(target, `${API}/repos/${target.repo}/releases/tags/${RELEASE_TAG}`)
  if (got.status === 200) return { id: (await got.json() as { id: number }).id }
  if (got.status === 404) {
    // A 404 here means either the release does not exist yet or the repository
    // does not. Creating it settles which, and says so in its own error.
    const made = await gh(target, `${API}/repos/${target.repo}/releases`, {
      method: 'POST',
      body: JSON.stringify({
        tag_name: RELEASE_TAG,
        name: 'Dynasty snapshot',
        body: 'The current dynasty, published by DCC for the phone. Replaced on every publish.',
        prerelease: true,
      }),
    })
    if (made.status === 201) return { id: (await made.json() as { id: number }).id }
    if (made.status === 404) return { error: `No repository called ${target.repo}, or the token cannot see it.` }
    return { error: `Could not create the release (${made.status}). ${await made.text().catch(() => '')}`.trim() }
  }
  if (got.status === 401 || got.status === 403) return { error: 'GitHub refused the token. It needs repo access to that repository.' }
  return { error: `GitHub returned ${got.status} looking for the release.` }
}

/**
 * Uploads the snapshot, replacing whatever was there. The old asset is deleted
 * first because GitHub refuses a second asset with the same name.
 */
export async function publishSnapshot(target: PublishTarget, snapshot: unknown): Promise<PublishResult> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(target.repo)) {
    return { ok: false, message: 'The repository should look like owner/name.' }
  }
  if (!target.token.trim()) return { ok: false, message: 'No GitHub token set.' }

  const notReady = await ensureInitialised(target)
  if (notReady) return { ok: false, message: notReady }

  const rel = await releaseId(target)
  if ('error' in rel) return { ok: false, message: rel.error }

  const assets = await gh(target, `${API}/repos/${target.repo}/releases/${rel.id}/assets`)
  if (assets.status === 200) {
    for (const a of await assets.json() as { id: number; name: string }[]) {
      if (a.name === ASSET_NAME) {
        await gh(target, `${API}/repos/${target.repo}/releases/assets/${a.id}`, { method: 'DELETE' })
      }
    }
  }

  const body = gzipSync(Buffer.from(JSON.stringify(snapshot), 'utf8'))
  const up = await gh(target, `${UPLOADS}/repos/${target.repo}/releases/${rel.id}/assets?name=${ASSET_NAME}`, {
    method: 'POST',
    headers: { 'content-type': 'application/gzip' },
    body,
  })
  if (up.status !== 201) {
    return { ok: false, message: `Upload failed (${up.status}). ${await up.text().catch(() => '')}`.trim() }
  }
  const asset = await up.json() as { url: string }
  return {
    ok: true,
    message: `Published ${(body.length / 1024 / 1024).toFixed(1)} MB. The phone can fetch it from anywhere.`,
    assetUrl: asset.url,
    bytes: body.length,
  }
}
