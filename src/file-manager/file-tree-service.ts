import fs from "node:fs/promises";
import path from "node:path";
import type { FileTreeEntry, FileTreeResult } from "../shared/types";

const IGNORED_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "release",
  ".cache",
  ".pnpm-store",
  "__pycache__",
  ".next",
  ".vite",
]);

const MAX_DEPTH = 3;
const MAX_ENTRIES = 280;

export class FileTreeService {
  async getTree(workspacePath: string): Promise<FileTreeResult> {
    const root = path.resolve(workspacePath);
    const state = { count: 0, skippedEntries: 0, truncated: false };
    const entries = await this.readDirectory(root, root, 0, state);

    return {
      workspacePath: root,
      generatedAt: new Date().toISOString(),
      entries,
      truncated: state.truncated,
      skippedEntries: state.skippedEntries,
      message: state.truncated
        ? "目录较大，已只展示前几层和部分文件。"
        : "文件树已按小白模式加载，依赖和构建目录已自动隐藏。",
    };
  }

  private async readDirectory(
    root: string,
    current: string,
    depth: number,
    state: { count: number; skippedEntries: number; truncated: boolean },
  ): Promise<FileTreeEntry[]> {
    if (depth > MAX_DEPTH || state.count >= MAX_ENTRIES) {
      state.truncated = true;
      return [];
    }

    const dirents = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    const visible = dirents
      .filter((entry) => {
        if (IGNORED_NAMES.has(entry.name)) {
          state.skippedEntries += 1;
          return false;
        }
        return entry.isDirectory() || entry.isFile();
      })
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) {
          return a.isDirectory() ? -1 : 1;
        }
        return a.name.localeCompare(b.name, "zh-Hans-CN");
      });

    const result: FileTreeEntry[] = [];
    for (const entry of visible) {
      if (state.count >= MAX_ENTRIES) {
        state.truncated = true;
        break;
      }

      const absolutePath = path.join(current, entry.name);
      const relativePath = path.relative(root, absolutePath) || ".";
      const stats = await fs.stat(absolutePath).catch(() => undefined);
      state.count += 1;

      if (entry.isDirectory()) {
        result.push({
          name: entry.name,
          path: absolutePath,
          relativePath,
          type: "directory",
          modifiedAt: stats?.mtime.toISOString(),
          children: await this.readDirectory(root, absolutePath, depth + 1, state),
        });
        continue;
      }

      result.push({
        name: entry.name,
        path: absolutePath,
        relativePath,
        type: "file",
        size: stats?.size,
        modifiedAt: stats?.mtime.toISOString(),
      });
    }

    return result;
  }
}
