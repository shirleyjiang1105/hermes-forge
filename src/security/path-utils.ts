import * as path from "path";

export function isPathTraversalAttempt(filePath: string, baseDir: string): boolean {
  const resolvedBase = path.resolve(baseDir);
  const resolvedPath = path.resolve(filePath);
  
  return !resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase;
}

export function sanitizeFileName(fileName: string): string {
  const invalidChars = /[<>:"/\\|?*\x00-\x1F]/g;
  const sanitized = fileName.replace(invalidChars, "_");
  
  if (sanitized.startsWith(".")) {
    return "_" + sanitized;
  }
  
  return sanitized;
}

export function validateFilePath(filePath: string, allowedExtensions?: string[]): { valid: boolean; reason?: string } {
  if (!filePath || typeof filePath !== "string") {
    return { valid: false, reason: "文件路径不能为空" };
  }

  if (filePath.length > 4096) {
    return { valid: false, reason: "文件路径过长" };
  }

  if (isPathTraversalAttempt(filePath, "/")) {
    return { valid: false, reason: "检测到路径遍历攻击" };
  }

  if (allowedExtensions && allowedExtensions.length > 0) {
    const ext = path.extname(filePath).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return { valid: false, reason: `不支持的文件类型，支持的类型: ${allowedExtensions.join(", ")}` };
    }
  }

  return { valid: true };
}

export function ensureSafePath(basePath: string, relativePath: string): string {
  const sanitized = sanitizeFileName(relativePath);
  const resolved = path.join(basePath, sanitized);
  
  if (isPathTraversalAttempt(resolved, basePath)) {
    throw new Error("路径遍历检测：非法路径访问");
  }
  
  return resolved;
}

export function isValidFileName(name: string): boolean {
  if (!name || name.length > 255) return false;
  
  const invalidPattern = /[<>:"/\\|?*\x00-\x1F]/;
  if (invalidPattern.test(name)) return false;
  
  if (name === "." || name === "..") return false;
  
  return true;
}