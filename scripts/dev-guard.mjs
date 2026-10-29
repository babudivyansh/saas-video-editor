#!/usr/bin/env node
// Runs before `npm run dev` (predev), and as `npm run dev:stop` with --stop.
//
// `next dev` records itself in .next/dev/lock ({ pid, appUrl, … }) and a
// second `next dev` in the same folder refuses to start ("Another next dev
// server is already running") and exits. On Windows, stopping the terminal
// command — an IDE's Stop button, closing its terminal tab, Ctrl+C reaching
// only npm — often leaves that node process running, so the next
// `npm run dev` exits straight away and the server looks like it never
// comes up.
//
// Before starting: a lock whose process is gone is removed. A server that
// answers, or that started under STARTING_GRACE_MS ago (Turbopack can take a
// minute to set up on Windows before it answers anything), is reported — open
// it, or `npm run dev:stop`. Only an older one that doesn't answer is treated
// as a leftover and stopped. A process is only ever stopped when its command
// line shows it is this project's `next dev`, so a PID reused by something
// else is never touched.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const LOCK = path.join(process.cwd(), ".next", "dev", "lock");
const stopOnly = process.argv.includes("--stop");
const STARTING_GRACE_MS = 3 * 60 * 1000;

function readLock() {
  if (!existsSync(LOCK)) return null;
  try {
    const lock = JSON.parse(readFileSync(LOCK, "utf8"));
    return Number.isInteger(lock.pid) ? lock : null;
  } catch {
    return null;
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

/** The process's command line, or null if it can't be read. */
function commandLine(pid) {
  try {
    if (process.platform === "win32") {
      return execFileSync(
        "powershell.exe",
        ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim() || null;
    }
    return execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * True for this project's own dev server: `next dev`, or the server child
 * Next spawns for it (`node …/next/dist/server/lib/start-server.js`), which
 * is the PID the lock records — but only from this folder's node_modules.
 */
function isNextDev(cmd) {
  if (!cmd) return false;
  const norm = (s) => s.replace(/\\/g, "/").toLowerCase();
  const c = norm(cmd);
  if (!c.includes(norm(path.join(process.cwd(), "node_modules", "next")))) return false;
  return /\bdev\b/.test(c) || c.includes("/dist/server/lib/start-server.js");
}

async function answers(url) {
  try {
    // The first hit compiles the route, which takes a few seconds.
    const res = await fetch(new URL("/api/health", url), { signal: AbortSignal.timeout(10_000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

function stop(pid) {
  if (process.platform === "win32") {
    // /T takes the worker processes Next spawned along with it.
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    process.kill(pid, "SIGTERM");
  }
}

function clearLock() {
  rmSync(LOCK, { force: true });
}

/** What to do about the lock; returns the exit code. */
async function main() {
  const lock = readLock();
  if (!lock) {
    if (stopOnly) console.log("No dev server is running for this project.");
    return 0;
  }

  if (!isAlive(lock.pid)) {
    clearLock();
    if (stopOnly) console.log("No dev server is running for this project (removed a stale lock).");
    return 0;
  }

  const cmd = commandLine(lock.pid);
  if (!isNextDev(cmd)) {
    // The PID was reused by something else: the lock is stale, the process
    // is not ours. If its command line can't be read, touch nothing.
    if (cmd) {
      clearLock();
      if (stopOnly) console.log("No dev server is running for this project (removed a stale lock).");
      return 0;
    }
    console.error(
      `A dev server may still be running (PID ${lock.pid}), but its command line couldn't be read to confirm it.\n` +
        `If ${lock.appUrl} doesn't load, end process ${lock.pid} in Task Manager, then run npm run dev again.`,
    );
    return 1;
  }

  if (stopOnly) {
    stop(lock.pid);
    clearLock();
    console.log(`Stopped the dev server (PID ${lock.pid}).`);
    return 0;
  }

  const up = await answers(lock.appUrl);
  const starting = !up && Date.now() - (Number(lock.startedAt) || 0) < STARTING_GRACE_MS;
  if (up || starting) {
    console.error(
      `\nThis project's dev server is already ${up ? "running" : "starting"} at ${lock.appUrl} (PID ${lock.pid}).\n` +
        "Open that, or run  npm run dev:stop  and then  npm run dev  to start a fresh one.\n",
    );
    return 1;
  }

  stop(lock.pid);
  clearLock();
  console.log(`Stopped a leftover dev server (PID ${lock.pid}) that was no longer answering. Starting a fresh one…`);
  return 0;
}

// exitCode, not process.exit(): on Windows, exiting while fetch's socket is
// still closing aborts Node with a libuv assertion (src\win\async.c).
process.exitCode = await main();
