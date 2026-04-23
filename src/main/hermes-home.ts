import fs from "node:fs/promises";
import path from "node:path";

export async function resolveActiveHermesHome(baseHome: string) {
  const activeProfile = (await fs.readFile(path.join(baseHome, "active_profile"), "utf8").catch(() => "")).trim();
  if (!activeProfile || /[\\/]/.test(activeProfile)) {
    return baseHome;
  }
  const candidate = path.join(baseHome, "profiles", activeProfile);
  const stat = await fs.stat(candidate).catch(() => undefined);
  return stat?.isDirectory() ? candidate : baseHome;
}

export async function ensureHermesHomeLayout(baseHome: string) {
  await fs.mkdir(baseHome, { recursive: true });
  await fs.mkdir(path.join(baseHome, "skills"), { recursive: true });
  await fs.mkdir(path.join(baseHome, "memories"), { recursive: true });
  await fs.mkdir(path.join(baseHome, "cron"), { recursive: true });
  await fs.mkdir(path.join(baseHome, "profiles"), { recursive: true });
  await migrateLegacyMemoryFile(baseHome, "USER.md", "# USER\n\n");
  await migrateLegacyMemoryFile(baseHome, "MEMORY.md", "# MEMORY\n\n");
}

async function migrateLegacyMemoryFile(baseHome: string, fileName: "USER.md" | "MEMORY.md", defaultContent: string) {
  const modernPath = path.join(baseHome, "memories", fileName);
  const legacyPath = path.join(baseHome, fileName);
  const modernExists = await fs.stat(modernPath).then((stat) => stat.isFile()).catch(() => false);
  if (!modernExists) {
    const legacyContent = await fs.readFile(legacyPath, "utf8").catch(() => "");
    await fs.writeFile(modernPath, legacyContent || defaultContent, "utf8");
  }
}
