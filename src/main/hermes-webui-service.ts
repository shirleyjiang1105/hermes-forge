import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { shell } from "electron";
import type { AppPaths } from "./app-paths";
import { runCommand } from "../process/command-runner";
import type { RuntimeAdapterFactory } from "../runtime/runtime-adapter";
import { validateSkillId, validateProfileName, validateCronSchedule } from "../security";
import type {
  FilePreviewResult,
  FileBreadcrumbItem,
  HermesCronJob,
  HermesMemoryFile,
  HermesProfile,
  HermesSkill,
  HermesWebUiOverview,
  HermesWebUiSettings,
  ProjectGroup,
  SlashCommand,
  ThemePreference,
  WorkspaceSpace,
  RuntimeConfig,
} from "../shared/types";

const DEFAULT_SETTINGS: HermesWebUiSettings = {
  theme: "green-light",
  language: "zh",
  sendKey: "enter",
  showUsage: false,
  showCliSessions: true,
};

const SLASH_COMMANDS: SlashCommand[] = [
  { name: "/help", description: "显示可用命令", usage: "/help" },
  { name: "/clear", description: "清空当前会话", usage: "/clear" },
  { name: "/compact", description: "压缩当前上下文", usage: "/compact [重点]" },
  { name: "/model", description: "切换或查看模型", usage: "/model <模型名>" },
  { name: "/workspace", description: "切换工作区", usage: "/workspace <名称或路径>" },
  { name: "/new", description: "新建会话", usage: "/new" },
  { name: "/usage", description: "显示/隐藏用量", usage: "/usage" },
  { name: "/theme", description: "切换主题", usage: "/theme <green-light|light|slate|oled>" },
];

export class HermesWebUiService {
  constructor(
    private readonly appPaths: AppPaths,
    private readonly resolveHermesRoot: () => Promise<string>,
    private readonly runtimeAdapterFactory?: RuntimeAdapterFactory,
    private readonly readRuntimeConfig?: () => Promise<RuntimeConfig>,
  ) {}

  async overview(): Promise<HermesWebUiOverview> {
    const [settings, projects, spaces, skills, memory, crons, profiles] = await Promise.all([
      this.getSettings(),
      this.listProjects(),
      this.listSpaces(),
      this.listSkills(),
      this.listMemoryFiles(),
      this.listCronJobs(),
      this.listProfiles(),
    ]);
    return { settings, projects, spaces, skills, memory, crons, profiles, slashCommands: SLASH_COMMANDS };
  }

  async getSettings(): Promise<HermesWebUiSettings> {
    const raw = await fs.readFile(this.settingsPath(), "utf8").catch(() => "");
    if (!raw) return DEFAULT_SETTINGS;
    try {
      const parsed = JSON.parse(raw) as Partial<HermesWebUiSettings>;
      return {
        theme: this.theme(parsed.theme),
        language: parsed.language === "en" ? "en" : "zh",
        sendKey: parsed.sendKey === "mod-enter" ? "mod-enter" : "enter",
        showUsage: Boolean(parsed.showUsage),
        showCliSessions: parsed.showCliSessions !== false,
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  async saveSettings(input: Partial<HermesWebUiSettings>): Promise<HermesWebUiSettings> {
    const current = await this.getSettings();
    const next: HermesWebUiSettings = {
      ...current,
      ...input,
      theme: this.theme(input.theme ?? current.theme),
      language: input.language === "en" ? "en" : "zh",
      sendKey: input.sendKey === "mod-enter" ? "mod-enter" : "enter",
    };
    await this.writeJson(this.settingsPath(), next);
    return next;
  }

  async listProjects(): Promise<ProjectGroup[]> {
    return (await this.readJson<ProjectGroup[]>(this.projectsPath(), [])).filter((item) => !item.archived);
  }

  async saveProject(input: Partial<ProjectGroup>): Promise<ProjectGroup> {
    const projects = await this.listProjects();
    const at = new Date().toISOString();
    const id = input.id?.trim() || `project-${Date.now().toString(36)}`;
    const next: ProjectGroup = {
      id,
      name: input.name?.trim() || "未命名项目",
      color: input.color?.trim() || "#10b981",
      sessionCount: input.sessionCount,
      archived: input.archived,
      createdAt: projects.find((item) => item.id === id)?.createdAt ?? at,
      updatedAt: at,
    };
    await this.writeJson(this.projectsPath(), [next, ...projects.filter((item) => item.id !== id)]);
    return next;
  }

  async deleteProject(id: string) {
    const projects = await this.listProjects();
    await this.writeJson(this.projectsPath(), projects.filter((item) => item.id !== id));
    return { ok: true, id };
  }

  async listSpaces(): Promise<WorkspaceSpace[]> {
    return await this.readJson<WorkspaceSpace[]>(this.spacesPath(), []);
  }

  async saveSpace(input: Partial<WorkspaceSpace>): Promise<WorkspaceSpace> {
    const spaces = await this.listSpaces();
    const at = new Date().toISOString();
    const id = input.id?.trim() || `space-${Date.now().toString(36)}`;
    const targetPath = input.path?.trim() || "";
    if (!targetPath) throw new Error("工作区路径不能为空。");
    const stat = await fs.stat(targetPath).catch(() => undefined);
    if (!stat?.isDirectory()) throw new Error(`工作区不存在或不是目录：${targetPath}`);
    const next: WorkspaceSpace = {
      id,
      name: input.name?.trim() || path.basename(targetPath) || targetPath,
      path: targetPath,
      description: input.description?.trim(),
      pinned: Boolean(input.pinned),
      lastOpenedAt: at,
      createdAt: spaces.find((item) => item.id === id)?.createdAt ?? at,
      updatedAt: at,
    };
    await this.writeJson(this.spacesPath(), [next, ...spaces.filter((item) => item.id !== id)]);
    return next;
  }

  async deleteSpace(id: string) {
    const spaces = await this.listSpaces();
    await this.writeJson(this.spacesPath(), spaces.filter((item) => item.id !== id));
    return { ok: true, id };
  }

  async listSkills(): Promise<HermesSkill[]> {
    const root = this.hermesHome("skills");
    const files = await this.walkFiles(root, 3);
    const skills = await Promise.all(files.filter((file) => this.isValidSkillFile(file)).map(async (file) => {
      const stat = await fs.stat(file);
      const content = await fs.readFile(file, "utf8").catch(() => "");
      const relativePath = path.relative(root, file);
      const name = path.basename(file, path.extname(file));
      return {
        id: relativePath.replace(/\\/g, "/"),
        name,
        path: file,
        relativePath,
        category: path.dirname(relativePath) === "." ? "personal" : path.dirname(relativePath).split(/[\\/]/)[0] ?? "personal",
        summary: firstContentLine(content) || "暂无说明",
        updatedAt: stat.mtime.toISOString(),
        size: stat.size,
      };
    }));
    return skills.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  private isValidSkillFile(filePath: string): boolean {
    const fileName = path.basename(filePath).toLowerCase();
    if (!fileName.endsWith(".md")) return false;
    if (fileName.startsWith(".")) return false;
    if (fileName.startsWith("_")) return false;
    if (fileName.endsWith(".bak.md")) return false;
    if (fileName.includes(".backup.")) return false;
    if (fileName.includes(".tmp.")) return false;
    const dirName = path.dirname(filePath).toLowerCase();
    if (dirName.includes("__pycache__")) return false;
    if (dirName.includes(".git")) return false;
    return true;
  }

  async readSkill(id: string) {
    const filePath = await this.resolveUnder(this.hermesHome("skills"), id);
    return { id, path: filePath, content: await fs.readFile(filePath, "utf8") };
  }

  async saveSkill(id: string, content: string) {
    const skillId = id.endsWith(".md") ? id : `${id}.md`;
    const validation = validateSkillId(skillId);
    if (!validation.valid) {
      throw new Error(`技能验证失败: ${validation.errors.join(", ")}`);
    }
    
    const filePath = await this.resolveUnder(this.hermesHome("skills"), skillId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await this.backupPath(filePath);
    await fs.writeFile(filePath, content, "utf8");
    return this.readSkill(path.relative(this.hermesHome("skills"), filePath));
  }

  async deleteSkill(id: string) {
    const filePath = await this.resolveUnder(this.hermesHome("skills"), id);
    await this.moveToTrash(filePath);
    return { ok: true, id };
  }

  async listMemoryFiles(): Promise<HermesMemoryFile[]> {
    const files: Array<HermesMemoryFile["id"]> = ["USER.md", "MEMORY.md"];
    return await Promise.all(files.map(async (fileName) => {
      const filePath = this.hermesHome("memories", fileName);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, "", { flag: "a" });
      const stat = await fs.stat(filePath);
      return {
        id: fileName,
        label: fileName === "USER.md" ? "用户偏好" : "长期记忆",
        path: filePath,
        content: await fs.readFile(filePath, "utf8"),
        updatedAt: stat.mtime.toISOString(),
        size: stat.size,
      };
    }));
  }

  async saveMemoryFile(id: HermesMemoryFile["id"], content: string) {
    const filePath = this.hermesHome("memories", id);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.copyFile(filePath, `${filePath}.${Date.now()}.bak`).catch(() => undefined);
    await fs.writeFile(filePath, content, "utf8");
    return (await this.listMemoryFiles()).find((item) => item.id === id);
  }

  async importMemoryFile(sourcePath: string, targetId: HermesMemoryFile["id"]) {
    const sourceStat = await fs.stat(sourcePath);
    if (!sourceStat.isFile()) {
      throw new Error("源路径不是文件。");
    }
    const content = await fs.readFile(sourcePath, "utf8");
    return this.saveMemoryFile(targetId, content);
  }

  async listProfiles(): Promise<HermesProfile[]> {
    const base = this.hermesHome();
    const active = (await fs.readFile(path.join(base, "active_profile"), "utf8").catch(() => "")).trim() || "default";
    const profileRoot = path.join(base, "profiles");
    const entries = await fs.readdir(profileRoot, { withFileTypes: true }).catch(() => []);
    const names = ["default", ...entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)];
    return await Promise.all([...new Set(names)].map(async (name) => {
      const profilePath = name === "default" ? base : path.join(profileRoot, name);
      const [skills, memories, stat] = await Promise.all([
        fs.readdir(path.join(profilePath, "skills")).catch(() => []),
        fs.readdir(path.join(profilePath, "memories")).catch(() => []),
        fs.stat(profilePath).catch(() => undefined),
      ]);
      return {
        id: name,
        name,
        path: profilePath,
        active: active === name,
        hasConfig: Boolean(await fs.stat(path.join(profilePath, "config.yaml")).catch(() => undefined)),
        skillCount: skills.length,
        memoryFiles: memories.filter((item) => item.endsWith(".md")).length,
        updatedAt: stat?.mtime.toISOString(),
      };
    }));
  }

  async switchProfile(name: string) {
    await fs.writeFile(path.join(this.hermesHome(), "active_profile"), name === "default" ? "" : name, "utf8");
    return { ok: true, active: name, profiles: await this.listProfiles() };
  }

  async createProfile(name: string) {
    const validation = validateProfileName(name);
    if (!validation.valid) {
      throw new Error(`Profile 验证失败: ${validation.errors.join(", ")}`);
    }
    
    const safe = name.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
    if (!safe) throw new Error("Profile 名称不能为空。");
    const profilePath = path.join(this.hermesHome(), "profiles", safe);
    await fs.mkdir(path.join(profilePath, "skills"), { recursive: true });
    await fs.mkdir(path.join(profilePath, "memories"), { recursive: true });
    await fs.mkdir(path.join(profilePath, "cron"), { recursive: true });
    return (await this.listProfiles()).find((item) => item.id === safe);
  }

  async deleteProfile(name: string) {
    if (name === "default") throw new Error("不能删除 default profile。");
    const profilePath = await this.resolveUnder(path.join(this.hermesHome(), "profiles"), name);
    await this.moveToTrash(profilePath);
    return { ok: true, id: name, profiles: await this.listProfiles() };
  }

  async listCronJobs(): Promise<HermesCronJob[]> {
    const jobsPath = this.hermesHome("cron", "jobs.json");
    const raw = await this.readJson<unknown[]>(jobsPath, []);
    return raw.map((item, index) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const id = String(record.id ?? record.name ?? `job-${index}`);
      return {
        id,
        name: String(record.name ?? record.title ?? id),
        prompt: typeof record.prompt === "string" ? record.prompt : undefined,
        schedule: typeof record.schedule === "string" ? record.schedule : typeof record.cron === "string" ? record.cron : undefined,
        status: record.enabled === false || record.paused === true ? "paused" : "active",
        source: typeof record.source === "string" && record.source === "cli" ? "cli" : "json-fallback",
        lastOutput: typeof record.last_output === "string" ? record.last_output : undefined,
        path: jobsPath,
        lastRunAt: typeof record.last_run_at === "string" ? record.last_run_at : undefined,
        nextRunAt: typeof record.next_run_at === "string" ? record.next_run_at : undefined,
      };
    });
  }

  async saveCronJob(input: Partial<HermesCronJob>): Promise<HermesCronJob> {
    if (!input.name?.trim()) {
      throw new Error("定时任务名称不能为空");
    }
    
    if (input.schedule) {
      const validation = validateCronSchedule(input.schedule);
      if (!validation.valid) {
        throw new Error(`定时计划验证失败: ${validation.errors.join(", ")}`);
      }
    }
    
    const jobsPath = this.hermesHome("cron", "jobs.json");
    const raw = await this.readJson<Record<string, unknown>[]>(jobsPath, []);
    const at = new Date().toISOString();
    const id = input.id?.trim() || `job-${Date.now().toString(36)}`;
    const current = raw.find((item) => String(item.id ?? item.name ?? "") === id) ?? {};
    const cliResult = await this.tryRunHermes(["cron", input.id ? "update" : "create", "--name", input.name?.trim() || String(current.name ?? "未命名任务"), "--schedule", input.schedule?.trim() || String(current.schedule ?? current.cron ?? "manual"), "--prompt", input.prompt ?? String(current.prompt ?? "")]);
    if (cliResult.ok) {
      const cliJobs = await this.listCronJobs();
      return cliJobs.find((item) => item.id === id || item.name === input.name) ?? {
        id,
        name: input.name?.trim() || "未命名任务",
        prompt: input.prompt,
        schedule: input.schedule,
        status: input.status ?? "active",
        source: "cli",
        lastOutput: cliResult.message,
      };
    }
    const next = {
      ...current,
      id,
      name: input.name?.trim() || String(current.name ?? "未命名任务"),
      prompt: input.prompt ?? String(current.prompt ?? ""),
      schedule: input.schedule?.trim() || String(current.schedule ?? current.cron ?? "manual"),
      enabled: input.status === "paused" ? false : true,
      paused: input.status === "paused",
      source: "json-fallback",
      last_output: cliResult.message || "Hermes CLI 未提供 cron create/update，已回退写入 jobs.json。",
      updated_at: at,
      created_at: String(current.created_at ?? at),
    };
    await this.writeJson(jobsPath, [next, ...raw.filter((item) => String(item.id ?? item.name ?? "") !== id)]);
    return (await this.listCronJobs()).find((item) => item.id === id) ?? {
      id,
      name: String(next.name),
      prompt: String(next.prompt),
      schedule: String(next.schedule),
      status: input.status ?? "active",
      source: "json-fallback",
      lastOutput: String(next.last_output ?? ""),
      path: jobsPath,
    };
  }

  async runCronJob(id: string) {
    return this.runHermes(["cron", "run", id]);
  }

  async pauseCronJob(id: string) {
    return this.runHermes(["cron", "pause", id]);
  }

  async resumeCronJob(id: string) {
    return this.runHermes(["cron", "resume", id]);
  }

  async deleteCronJob(id: string) {
    const result = await this.runHermes(["cron", "delete", id]).catch(async (error: unknown) => {
      const jobsPath = this.hermesHome("cron", "jobs.json");
      const raw = await this.readJson<Record<string, unknown>[]>(jobsPath, []);
      await this.backupPath(jobsPath);
      await this.writeJson(jobsPath, raw.filter((item) => String(item.id ?? item.name ?? "") !== id));
      return { ok: true, message: `CLI 删除失败，已回退更新 jobs.json：${error instanceof Error ? error.message : "未知错误"}`, exitCode: null };
    });
    return result;
  }

  async previewFile(filePath: string): Promise<FilePreviewResult> {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      return { path: filePath, name: path.basename(filePath), kind: "directory", size: stat.size, modifiedAt: stat.mtime.toISOString() };
    }
    const ext = path.extname(filePath).toLowerCase();
    const imageExts = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]);
    if (imageExts.has(ext)) {
      return { path: filePath, name: path.basename(filePath), kind: "image", mimeType: mimeFromExt(ext), size: stat.size, modifiedAt: stat.mtime.toISOString() };
    }
    if (stat.size > 512 * 1024) {
      return { path: filePath, name: path.basename(filePath), kind: "binary", size: stat.size, modifiedAt: stat.mtime.toISOString() };
    }
    const content = await fs.readFile(filePath, "utf8").catch(() => "");
    return { path: filePath, name: path.basename(filePath), kind: ext === ".md" ? "markdown" : "text", content, size: stat.size, modifiedAt: stat.mtime.toISOString() };
  }

  async gitInfo(workspacePath: string) {
    const branch = await runCommand("git", ["branch", "--show-current"], { cwd: workspacePath, timeoutMs: 5000 }).catch(() => undefined);
    const status = await runCommand("git", ["status", "--porcelain"], { cwd: workspacePath, timeoutMs: 5000 }).catch(() => undefined);
    const allDirtyFiles = status?.exitCode === 0 ? status.stdout.split(/\r?\n/).filter(Boolean).map((line) => line.trim()) : [];
    return {
      branch: branch?.exitCode === 0 ? branch.stdout.trim() || "detached" : "",
      dirtyCount: allDirtyFiles.length,
      dirtyFiles: allDirtyFiles.slice(0, 20),
      available: branch?.exitCode === 0 || status?.exitCode === 0,
    };
  }

  async fileBreadcrumb(filePath: string): Promise<FileBreadcrumbItem[]> {
    const resolved = path.resolve(filePath);
    const parsed = path.parse(resolved);
    const segments = resolved.slice(parsed.root.length).split(path.sep).filter(Boolean);
    const items: FileBreadcrumbItem[] = [{ name: parsed.root.replace(/[\\/]$/, "") || parsed.root, path: parsed.root }];
    let current = parsed.root;
    for (const segment of segments) {
      current = path.join(current, segment);
      items.push({ name: segment, path: current });
    }
    return items;
  }

  async openExternalPath(targetPath: string) {
    const error = await shell.openPath(targetPath);
    return { ok: !error, message: error || `已打开：${targetPath}` };
  }

  private async runHermes(args: string[]) {
    const root = await this.resolveHermesRoot();
    const runtime = await this.currentRuntime();
    const adapter = runtime ? this.runtimeAdapterFactory!(runtime) : undefined;
    const runtimeRoot = adapter?.toRuntimePath(root);
    const launch = runtime && adapter && runtimeRoot
      ? await adapter.buildHermesLaunch({
        runtime,
        rootPath: runtimeRoot,
        pythonArgs: [
          runtime.mode === "wsl"
            ? `${runtimeRoot.replace(/\/+$/, "")}/hermes`
            : path.join(root, "hermes"),
          ...args,
        ],
        cwd: root,
        env: {
          PYTHONUTF8: "1",
          PYTHONIOENCODING: "utf-8",
          PYTHONPATH: runtimeRoot,
        },
      })
      : await this.legacyHermesLaunch(root, args);
    const result = await runCommand(launch.command, launch.args, {
      cwd: launch.cwd,
      timeoutMs: 30000,
      env: launch.env,
      commandId: "webui.hermes",
      runtimeKind: runtime?.mode ?? "windows",
    });
    return { ok: result.exitCode === 0, message: result.stdout || result.stderr, exitCode: result.exitCode };
  }

  private async currentRuntime() {
    if (!this.runtimeAdapterFactory || !this.readRuntimeConfig) return undefined;
    const config = await this.readRuntimeConfig();
    return {
      mode: config.hermesRuntime?.mode ?? "windows",
      distro: config.hermesRuntime?.distro?.trim() || undefined,
      pythonCommand: config.hermesRuntime?.pythonCommand?.trim() || "python3",
      windowsAgentMode: config.hermesRuntime?.windowsAgentMode ?? "hermes_native",
    } satisfies NonNullable<RuntimeConfig["hermesRuntime"]>;
  }

  private async legacyHermesLaunch(root: string, args: string[]) {
    // Legacy fallback: kept for tests/standalone construction paths until all WebUI callers inject RuntimeAdapterFactory.
    const cliPath = path.join(root, "hermes");
    return {
      command: "python",
      args: [cliPath, ...args],
      cwd: root,
      env: { PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", PYTHONPATH: root },
    };
  }

  private async tryRunHermes(args: string[]) {
    try {
      return await this.runHermes(args);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Hermes CLI 调用失败。", exitCode: null };
    }
  }

  private theme(value: unknown): ThemePreference["id"] {
    return value === "light" || value === "slate" || value === "oled" ? value : "green-light";
  }

  private hermesHome(...segments: string[]) {
    return path.join(os.homedir(), ".hermes", ...segments);
  }

  private settingsPath() {
    return path.join(this.appPaths.baseDir(), "webui-settings.json");
  }

  private projectsPath() {
    return path.join(this.appPaths.baseDir(), "webui-projects.json");
  }

  private spacesPath() {
    return path.join(this.appPaths.baseDir(), "webui-spaces.json");
  }

  private async readJson<T>(filePath: string, fallback: T): Promise<T> {
    const raw = await fs.readFile(filePath, "utf8").catch(() => "");
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private async writeJson(filePath: string, value: unknown) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  }

  private async backupPath(targetPath: string) {
    const stat = await fs.stat(targetPath).catch(() => undefined);
    if (!stat?.isFile()) return;
    const backupDir = path.join(path.dirname(targetPath), ".hermes-workbench-backups");
    await fs.mkdir(backupDir, { recursive: true });
    await fs.copyFile(targetPath, path.join(backupDir, `${path.basename(targetPath)}.${Date.now()}.bak`)).catch(() => undefined);
  }

  private async moveToTrash(targetPath: string) {
    const stat = await fs.stat(targetPath).catch(() => undefined);
    if (!stat) return;
    const trashDir = path.join(this.hermesHome(), ".workbench-trash", new Date().toISOString().slice(0, 10));
    await fs.mkdir(trashDir, { recursive: true });
    const target = path.join(trashDir, `${path.basename(targetPath)}.${Date.now()}`);
    await fs.rename(targetPath, target).catch(async () => {
      await fs.rm(targetPath, { recursive: stat.isDirectory(), force: true });
    });
  }

  private async walkFiles(root: string, maxDepth: number, depth = 0): Promise<string[]> {
    if (depth > maxDepth) return [];
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    const nested = await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) return this.walkFiles(entryPath, maxDepth, depth + 1);
      if (entry.isFile()) return [entryPath];
      return [];
    }));
    return nested.flat();
  }

  private async resolveUnder(root: string, relativePath: string) {
    const target = path.resolve(root, relativePath);
    const resolvedRoot = path.resolve(root);
    if (!target.toLowerCase().startsWith(resolvedRoot.toLowerCase())) {
      throw new Error("路径越界。");
    }
    return target;
  }
}

function firstContentLine(content: string) {
  return content.split(/\r?\n/).map((line) => line.replace(/^#+\s*/, "").trim()).find(Boolean);
}

function mimeFromExt(ext: string) {
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return `image/${ext.replace(".", "") || "png"}`;
}
