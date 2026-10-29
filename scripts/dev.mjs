import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const children = [];

function run(label, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...options.env },
    shell: false,
  });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) console.error(`[${label}] exited with code ${code}`);
    shutdown(code ?? 0);
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
    }
  }
  setTimeout(() => process.exit(code), 150);
}

run("api", process.execPath, ["server/index.mjs"], { env: { NODE_ENV: "development" } });
run("vite", process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js")]);

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
