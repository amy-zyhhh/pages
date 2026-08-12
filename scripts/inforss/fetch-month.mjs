import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const statePath = join(__dirname, "month-state.json");
const args = parseArgs(process.argv.slice(2));
const month = args.month || await nextMonth();
const range = monthRange(month);

await runNode(["scripts/inforss/fetch.mjs", "--from", range.from, "--to", range.to]);

if (!args.month && args.advance !== false) {
  await writeFile(statePath, `${JSON.stringify({ nextMonth: previousMonth(month), updatedAt: new Date().toISOString() }, null, 2)}\n`);
}

console.log(`Fetched InfoRSS month ${month} (${range.from}-${range.to}).`);

function parseArgs(values) {
  const options = { advance: true };
  for (let index = 0; index < values.length; index += 1) {
    const arg = values[index];
    if (arg === "--month") {
      options.month = normalizeMonth(values[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg === "--no-advance") {
      options.advance = false;
    }
  }
  return options;
}

async function nextMonth() {
  const state = await readJson(statePath).catch(() => null);
  return normalizeMonth(state?.nextMonth) || currentMonth();
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf-8"));
}

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeMonth(value) {
  const text = String(value || "").replace(/\D/g, "");
  return /^\d{6}$/.test(text) ? text : "";
}

function previousMonth(month) {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(4, 6)) - 1;
  const date = new Date(year, monthIndex - 1, 1);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(month) {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(4, 6)) - 1;
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);
  return {
    from: dateKey(first),
    to: dateKey(last),
  };
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function runNode(commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, commandArgs, {
      cwd: join(__dirname, "..", ".."),
      stdio: "inherit",
      shell: false,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with exit code ${code}.`));
    });
    child.on("error", reject);
  });
}
