import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

export interface ProjectInfo {
  slug: string;
  name: string;
  root: string;
  gitRemote?: string;
}

function tryGit(args: string[], cwd: string): string | undefined {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 8);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';
}

/**
 * Resolves cwd to the git repo root when inside one, else falls back to cwd itself.
 * The slug is folder name + a short hash of the absolute root path, so two repos
 * named e.g. "api" on different machines/paths never collide.
 */
export function resolveProject(cwd: string = process.cwd()): ProjectInfo {
  const gitRoot = tryGit(['rev-parse', '--show-toplevel'], cwd);
  const root = gitRoot ? path.resolve(gitRoot) : path.resolve(cwd);
  const name = path.basename(root);
  const slug = `${slugify(name)}-${shortHash(root)}`;
  const gitRemote = gitRoot ? tryGit(['remote', 'get-url', 'origin'], root) : undefined;
  return { slug, name, root, gitRemote };
}
