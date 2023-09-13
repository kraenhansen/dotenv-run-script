import cp, { SpawnSyncOptions } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import dotenv from "dotenv";
import { expand } from "dotenv-expand";

type Environment = { [key: string]: string };

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

function getEnv(dotEnvPaths: string[], encoding: BufferEncoding): Environment {
  let result: Environment = { ...process.env as Environment };
  // Start with a copy of the current process environment
  const readonlyKeys = new Set(Object.keys(process.env));
  // Parse dotenv file (updating the combined env)
  for (const dotEnvPath of dotEnvPaths) {
    const content = fs.readFileSync(dotEnvPath, { encoding });
    result = parse(content, result, readonlyKeys);
  }
  return result;
}

function getSpawnCommand() {
  return os.platform() === 'win32' ? "npm.cmd" : "npm";
}

function getSpawnOptions(dotEnvPaths: string[], encoding: BufferEncoding): SpawnSyncOptions {
  return {
    stdio: "inherit",
    shell: os.platform() === 'win32' ? true : undefined,
    env: getEnv(dotEnvPaths, encoding),
  };
}

/**
 * Run a script from the package.json (read relative to CWD).
 * @returns Status code from the child process (null if it was terminated with a signal)
 */
export function run(argv: string[], encoding: BufferEncoding = "utf8"): number | null {
  const args = argv.slice(2);
  // Parse the arguments getting to the .dot files
  const parsedArgs = parseArguments(args);
  const cmd = getSpawnCommand();
  const options = getSpawnOptions(parsedArgs.dotEnvPaths, encoding);
  // Execute the "npm run-script" command, which forks with the updated process.env
  return cp.spawnSync(cmd, ["run-script", ...parsedArgs.rest], options).status;
}
