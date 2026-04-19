#!/usr/bin/env bun
import { execSync } from "child_process"
import { readFileSync, mkdirSync, copyFileSync, rmSync, statSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

const pkg = JSON.parse(readFileSync("package.json", "utf-8"))
const distName = `${pkg.name}-dist-${pkg.version}`
const distArchive = `${distName}.tar.gz`

function run(cmd: string, label: string, cwd?: string): void {
  console.log(`\n▶ ${label}`)
  execSync(cmd, { stdio: "inherit", cwd })
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`
}

// --- 1. Checks ---
run("bun run typecheck", "Type check")
run("bun run test:run", "Tests")

// --- 2. Pack plugin ---
console.log("\n▶ Packing plugin")
const [{ filename: pluginTarball, files: pluginFiles, unpackedSize }] = JSON.parse(
  execSync("npm pack --json", { encoding: "utf-8" })
)
console.log(`   ${pluginTarball} — ${kb(statSync(pluginTarball).size)} packed, ${kb(unpackedSize)} unpacked`)

// --- 3. Pack runtime dependencies ---
console.log("\n▶ Packing dependencies")
const depsDir = join(tmpdir(), `${distName}-deps`)
mkdirSync(depsDir, { recursive: true })

const depTarballs: string[] = []
for (const [dep] of Object.entries(pkg.dependencies ?? {})) {
  const depVersion = JSON.parse(
    readFileSync(join("node_modules", dep, "package.json"), "utf-8")
  ).version
  const [{ filename: depTarball }] = JSON.parse(
    execSync(`npm pack ${dep}@${depVersion} --json`, { encoding: "utf-8", cwd: depsDir })
  )
  depTarballs.push(depTarball)
  console.log(`   ${depTarball} — ${kb(statSync(join(depsDir, depTarball)).size)}`)
}

// --- 4. Assemble staging directory ---
console.log("\n▶ Assembling distribution")
const stagingDir = join(tmpdir(), distName)
const stagingDepsDir = join(stagingDir, "deps")
mkdirSync(stagingDepsDir, { recursive: true })

copyFileSync(pluginTarball, join(stagingDir, pluginTarball))
copyFileSync("opencode.json.example", join(stagingDir, "opencode.json.example"))
copyFileSync("INSTALL.md", join(stagingDir, "INSTALL.md"))
for (const t of depTarballs) {
  copyFileSync(join(depsDir, t), join(stagingDepsDir, t))
}

// --- 5. Create final archive ---
execSync(`tar -czf "${distArchive}" -C "${tmpdir()}" "${distName}"`)

// --- 6. Cleanup ---
rmSync(stagingDir, { recursive: true })
rmSync(depsDir, { recursive: true })
rmSync(pluginTarball)

// --- 7. Summary ---
console.log(`\n✓ ${distArchive} — ${kb(statSync(distArchive).size)}`)
console.log(`\n  plugin`)
pluginFiles.forEach((f: { path: string }) => console.log(`    ${f.path}`))
console.log(`  deps`)
depTarballs.forEach((t) => console.log(`    ${t}`))
console.log(`  opencode.json.example`)
console.log(`  INSTALL.md`)
