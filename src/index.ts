import * as os from 'os';
import cp from "child_process";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";

type Environment = { [key: string]: string };
type ActualExpandConfig = { ignoreProcessEnv?: boolean, parsed: Environment }

const DEFAULT_DOT_ENV = path.resolve(".env");

export function parse(content: string, env: Environment, readonlyKeys: Set<string>, debug = false) {
  const parsed = dotenv.parse(content, { debug });
  const combined = { ...env };
  for (const key in parsed) {
    if (!readonlyKeys.has(key)) {
      combined[key] = parsed[key];
    }
  }
  // Expand the dotenv (updates to process.env as a side-effect)
  dotenvExpand({ parsed: combined, ignoreProcessEnv: true } as ActualExpandConfig);
  return combined;
}

const flags = ['--home'];

export function parseArguments(args: string[]) {
  const dotEnvPaths = [];
  const rest = [];
  let startFromHome = !!args.find(arg => arg === flags[0]);

  for (const arg of args) {
	const pathToEnv = startFromHome ?  path.join(os.homedir(), arg) : arg;
    if (arg === "--") {
      break;
    } else if (fs.existsSync(pathToEnv) && fs.statSync(pathToEnv).isFile()) {
      const dotEnvPath = path.resolve(pathToEnv);
      dotEnvPaths.push(dotEnvPath);
    } else if (flags.includes(arg)) {
		continue;
	} else {
      rest.push(arg);
    }
  }

  if (dotEnvPaths.length > 0) {
    return {
      dotEnvPaths,
      rest,
    };
  } else if (fs.existsSync(DEFAULT_DOT_ENV) && fs.statSync(DEFAULT_DOT_ENV).isFile()) {
    return {
      dotEnvPaths: [DEFAULT_DOT_ENV],
      rest: args,
    }
  }

  throw new Error("Failed to load a .env file");
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
  // Execute the "npm run-script" command, which forks with the updated process.env
  return cp.spawnSync("npm", ["run-script", ...parsedArgs.rest], { stdio: "inherit", env }).status;
}
