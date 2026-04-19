import chokidar from "chokidar";
import { existsSync, promises as fs } from "node:fs";
import ignore from "ignore";
import path from "node:path";

const SOURCE_ROOT = process.cwd();
const PACKAGE_JSON_PATH = path.join(SOURCE_ROOT, "package.json");

function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function logInfo(message) {
  console.log(`[${timestamp()}] ${message}`);
}

function logError(message, detail) {
  if (detail) {
    console.error(`[${timestamp()}] ${message}`, detail);
    return;
  }

  console.error(`[${timestamp()}] ${message}`);
}

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const nextToken = argv[i + 1];
    if (nextToken && !nextToken.startsWith("--")) {
      args[key] = nextToken;
      i += 1;
    } else {
      args[key] = true;
    }
  }

  return args;
}

function normalizePathForMatcher(filePath) {
  return filePath.split(path.sep).join("/").replace(/^\.\//, "");
}

async function loadSyncConfig() {
  const defaultConfig = {
    includeGitignore: false,
    exclude: [],
  };

  try {
    const packageJsonRaw = await fs.readFile(PACKAGE_JSON_PATH, "utf8");
    const packageJson = JSON.parse(packageJsonRaw);
    const userConfig = packageJson.wowSync || {};

    const exclude = Array.isArray(userConfig.exclude)
      ? userConfig.exclude.filter((entry) => typeof entry === "string" && entry.trim() !== "")
      : [];

    return {
      includeGitignore: userConfig.includeGitignore === true,
      exclude,
    };
  } catch {
    return defaultConfig;
  }
}

async function createIgnoreMatcher(config) {
  const matcher = ignore();
  matcher.add(config.exclude);

  if (config.includeGitignore) {
    const gitignorePath = path.join(SOURCE_ROOT, ".gitignore");
    if (await pathExists(gitignorePath)) {
      const gitignoreContent = await fs.readFile(gitignorePath, "utf8");
      matcher.add(gitignoreContent);
    }
  }

  return matcher;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function detectAddonFolderName() {
  const entries = await fs.readdir(SOURCE_ROOT);
  const tocFile = entries.find((entry) => entry.toLowerCase().endsWith(".toc"));

  if (tocFile) {
    return path.basename(tocFile, path.extname(tocFile));
  }

  return path.basename(SOURCE_ROOT);
}

function getDefaultWowAddonsDir() {
  if (process.platform !== "win32") {
    return null;
  }

  const baseDirs = new Set();

  for (const envPath of [process.env["ProgramFiles(x86)"], process.env.ProgramFiles]) {
    if (envPath) {
      baseDirs.add(path.resolve(envPath));
    }
  }

  const driveLetters = [];
  for (let code = 67; code <= 90; code += 1) {
    const drive = `${String.fromCharCode(code)}:/`;
    if (existsSync(drive)) {
      driveLetters.push(drive);
    }
  }

  const commonInstallSubdirs = [
    "",
    "Program Files",
    "Program Files (x86)",
    "Games",
    "Blizzard",
    "Blizzard Games",
    "Battle.net",
  ];

  for (const drive of driveLetters) {
    for (const subdir of commonInstallSubdirs) {
      baseDirs.add(subdir ? path.join(drive, subdir) : drive);
    }
  }

  const wowFolderNames = ["World of Warcraft", "World_of_Warcraft"];

  const flavorOrder = ["_retail_", "_ptr_", "_classic_", "_classic_era_"];

  for (const baseDir of baseDirs) {
    for (const wowFolderName of wowFolderNames) {
      for (const flavor of flavorOrder) {
        const candidate = path.join(baseDir, wowFolderName, flavor, "Interface", "AddOns");
        // Use a sync check here since this helper runs before async setup.
        if (existsSync(candidate)) {
          return candidate;
        }
      }
    }
  }

  return null;
}

function toRelativePath(absolutePath) {
  const relativePath = path.relative(SOURCE_ROOT, absolutePath);
  return normalizePathForMatcher(relativePath);
}

function shouldIgnorePath(absolutePath, ignoreMatcher, isDirectory = false) {
  const relativePath = toRelativePath(absolutePath);
  if (!relativePath || relativePath === ".") {
    return false;
  }

  if (ignoreMatcher.ignores(relativePath)) {
    return true;
  }

  if (isDirectory) {
    return ignoreMatcher.ignores(`${relativePath}/`);
  }

  return false;
}

function getDestinationPath(absoluteSourcePath, addonTargetRoot) {
  const relativePath = toRelativePath(absoluteSourcePath);
  return path.join(addonTargetRoot, relativePath);
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function filesAreDifferent(sourcePath, destinationPath) {
  if (!(await pathExists(destinationPath))) {
    return true;
  }

  const [sourceStat, destinationStat] = await Promise.all([
    fs.stat(sourcePath),
    fs.stat(destinationPath),
  ]);

  if (sourceStat.size !== destinationStat.size) {
    return true;
  }

  const [sourceContent, destinationContent] = await Promise.all([
    fs.readFile(sourcePath),
    fs.readFile(destinationPath),
  ]);

  return !sourceContent.equals(destinationContent);
}

async function syncFile(sourcePath, addonTargetRoot) {
  const destinationPath = getDestinationPath(sourcePath, addonTargetRoot);
  await ensureParentDir(destinationPath);

  if (!(await filesAreDifferent(sourcePath, destinationPath))) {
    return false;
  }

  await fs.copyFile(sourcePath, destinationPath);
  logInfo(`Synced file: ${toRelativePath(sourcePath)}`);
  return true;
}

async function syncDirectory(sourcePath, addonTargetRoot) {
  const destinationPath = getDestinationPath(sourcePath, addonTargetRoot);
  await fs.mkdir(destinationPath, { recursive: true });
}

async function removePath(sourcePath, addonTargetRoot) {
  const destinationPath = getDestinationPath(sourcePath, addonTargetRoot);
  await fs.rm(destinationPath, { recursive: true, force: true });
  logInfo(`Removed: ${toRelativePath(sourcePath)}`);
}

async function initialSync(sourceDir, addonTargetRoot, ignoreMatcher) {
  let copiedCount = 0;

  async function walk(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        if (shouldIgnorePath(entryPath, ignoreMatcher, true)) {
          continue;
        }

        await walk(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (shouldIgnorePath(entryPath, ignoreMatcher, false)) {
        continue;
      }

      if (await syncFile(entryPath, addonTargetRoot)) {
        copiedCount += 1;
      }
    }
  }

  await walk(sourceDir);
  logInfo(`Initial sync complete. Updated ${copiedCount} file(s).`);
}

async function resolveAddOnsDir(cliArgs) {
  if (cliArgs.wowAddonsDir) {
    return path.resolve(cliArgs.wowAddonsDir);
  }

  if (process.env.WOW_ADDONS_DIR) {
    return path.resolve(process.env.WOW_ADDONS_DIR);
  }

  if (cliArgs.wowDir || process.env.WOW_DIR) {
    const wowDir = path.resolve(cliArgs.wowDir || process.env.WOW_DIR);
    const flavor = cliArgs.flavor || process.env.WOW_FLAVOR || "_retail_";
    return path.join(wowDir, flavor, "Interface", "AddOns");
  }

  const defaultDir = getDefaultWowAddonsDir();
  if (defaultDir) {
    return defaultDir;
  }

  throw new Error(
    "Could not determine WoW AddOns folder. Provide --wowAddonsDir, set WOW_ADDONS_DIR, or pass --wowDir with --flavor."
  );
}

async function run() {
  const cliArgs = parseArgs(process.argv.slice(2));
  const config = await loadSyncConfig();
  const ignoreMatcher = await createIgnoreMatcher(config);
  const addOnsDir = await resolveAddOnsDir(cliArgs);
  const addonFolderName = await detectAddonFolderName();
  const addonTargetRoot = path.join(addOnsDir, addonFolderName);
  const shouldClean = cliArgs.clean === true;
  const once = cliArgs.once === true;

  if (!(await pathExists(addOnsDir))) {
    throw new Error(`WoW AddOns directory does not exist: ${addOnsDir}`);
  }

  if (shouldClean) {
    logInfo(`Cleaning target addon folder: ${addonTargetRoot}`);
    await fs.rm(addonTargetRoot, { recursive: true, force: true });
  }

  await fs.mkdir(addonTargetRoot, { recursive: true });

  logInfo(`Source: ${SOURCE_ROOT}`);
  logInfo(`Target: ${addonTargetRoot}`);
  logInfo(`Using ${config.exclude.length} configured exclude pattern(s).`);

  if (config.includeGitignore) {
    logInfo("Using .gitignore patterns for sync exclusions.");
  }

  await initialSync(SOURCE_ROOT, addonTargetRoot, ignoreMatcher);

  if (once) {
    logInfo("One-time sync complete (--once). Exiting.");
    return;
  }

  logInfo("Watching for changes... Press Ctrl+C to stop.");

  const watcher = chokidar.watch(SOURCE_ROOT, {
    ignored: (watchPath) => shouldIgnorePath(path.resolve(watchPath), ignoreMatcher),
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 120,
      pollInterval: 50,
    },
  });

  watcher
    .on("add", (watchPath) => {
      syncFile(path.resolve(watchPath), addonTargetRoot).catch((error) => {
        logError(`Failed to sync file ${watchPath}:`, error.message);
      });
    })
    .on("change", (watchPath) => {
      syncFile(path.resolve(watchPath), addonTargetRoot).catch((error) => {
        logError(`Failed to sync file ${watchPath}:`, error.message);
      });
    })
    .on("addDir", (watchPath) => {
      const resolved = path.resolve(watchPath);
      if (shouldIgnorePath(resolved, ignoreMatcher, true)) {
        return;
      }
      syncDirectory(resolved, addonTargetRoot).catch((error) => {
        logError(`Failed to sync directory ${watchPath}:`, error.message);
      });
    })
    .on("unlink", (watchPath) => {
      removePath(path.resolve(watchPath), addonTargetRoot).catch((error) => {
        logError(`Failed to remove ${watchPath}:`, error.message);
      });
    })
    .on("unlinkDir", (watchPath) => {
      removePath(path.resolve(watchPath), addonTargetRoot).catch((error) => {
        logError(`Failed to remove directory ${watchPath}:`, error.message);
      });
    })
    .on("error", (error) => {
      logError("Watcher error:", error.message);
    });
}

run().catch((error) => {
  logError(error.message);
  process.exit(1);
});
