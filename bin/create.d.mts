export interface ScaffoldOptions {
  force?: boolean;
}

export interface ScaffoldResult {
  targetDir: string;
  pkgName: string;
  created: string[];
}

export function scaffoldProject(
  targetName?: string,
  cwd?: string,
  options?: ScaffoldOptions,
): ScaffoldResult;
