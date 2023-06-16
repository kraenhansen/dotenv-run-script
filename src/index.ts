import cp, { SpawnSyncOptions } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import dotenv from "dotenv";
import { expand } from "dotenv-expand";

type Environment = { [key: string]: string };
type ActualExpandConfig = { ignoreProcessEnv?: boolean, parsed: Environment }

const DEFAULT_DOT_ENV = path.resolve(".env");

export function parse(content: string, env: Environment, readonlyKeys: Set<string>) {
  const parsed = dotenv.parse(content);
  const combined = { ...env };
  for (const key in parsed) {
    if (!readonlyKeys.has(key)) {
      combined[key] = parsed[key];
    }
  }
  // Expand the dotenv (updates to process.env as a side-effect)
  expand({ parsed: combined, ignoreProcessEnv: true });
  return combined;
}

export function parseArguments(args: string[]) {
  const dotEnvPaths = [];
  for (const arg of args) {
    if (arg === "--") {
      break;
    } else if (fs.existsSync(arg) && fs.statSync(arg).isFile()) {
      const dotEnvPath = path.resolve(arg);
      dotEnvPaths.push(dotEnvPath);
    } else {
      break;
    }
  }
  if (dotEnvPaths.length > 0) {
    return {
      dotEnvPaths,
      rest: args.slice(dotEnvPaths.length),
    };
  } else if (fs.existsSync(DEFAULT_DOT_ENV) && fs.statSync(DEFAULT_DOT_ENV).isFile()) {
    return {
      dotEnvPaths: [DEFAULT_DOT_ENV],
      rest: args,
    }
  } else {
    throw new Error("Failed to load a .env file");
  }
}

/**
 * Run a script from the package.json (read relative to CWD).
 * @returns Status code from the child process (null if it was terminated with a signal)
 */
export function run(argv: string[], encoding: BufferEncoding = "utf8"): number | null {
  const args = argv.slice(2);
  // Start with a copy of the current process environment
  const readonlyKeys = new Set(Object.keys(process.env));
  let env = { ...process.env as Environment };
  // Parse the arguments getting to the .dot files
  const parsedArgs = parseArguments(args);
  // Parse dotenv file (updating the combined env)
  for (const dotEnvPath of parsedArgs.dotEnvPaths) {
    const content = fs.readFileSync(dotEnvPath, { encoding });
    env = parse(content, env, readonlyKeys);
  }
  let options: SpawnSyncOptions = { stdio: "inherit", env };
  if (os.platform() === 'win32') {
    options = { ...options, shell: true };
  }
  // Execute the "npm run-script" command, which forks with the updated process.env
  return cp.spawnSync("npm", ["run-script", ...parsedArgs.rest], options).status;
}
