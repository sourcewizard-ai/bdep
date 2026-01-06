import { exec } from "child_process";
import { promisify } from "util";

export const execAsync = promisify(exec);

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export async function runCommand(
  command: string,
  cwd: string
): Promise<ExecResult> {
  return execAsync(command, { cwd, maxBuffer: 10 * 1024 * 1024 });
}
