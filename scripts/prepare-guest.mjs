import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";

// Type checking and bundling share the guest's separately locked dependencies.
export const guestRuntimeDir = ".cache/pi-runtime";
await mkdir(guestRuntimeDir, { recursive: true });
const lock = await readFile("guest/package-lock.json");
const digest = createHash("sha256").update(lock).digest("hex");

let installed = false;

try {
  installed =
    (await readFile(`${guestRuntimeDir}/.lock-digest`, "utf8")) === digest;
} catch {}

await copyFile("guest/package.json", `${guestRuntimeDir}/package.json`);
await copyFile(
  "guest/package-lock.json",
  `${guestRuntimeDir}/package-lock.json`,
);

if (!installed) {
  execFileSync(
    "npm",
    ["ci", "--prefix", guestRuntimeDir, "--omit=optional", "--ignore-scripts"],
    { stdio: "inherit" },
  );
  await writeFile(`${guestRuntimeDir}/.lock-digest`, digest);
}
