export const ALLOWED_FILE_EXTENSIONS = [
  ".md",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".html",
  ".css",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".cpp",
  ".c",
  ".h",
  ".sql",
  ".xml",
  ".csv",
];

export const MAX_FILE_SIZE = 1024 * 1024 * 50;

export const MAX_PATH_LENGTH = process.platform === "win32" ? 260 : 4096;

export const FORBIDDEN_PATHS = [
  "/etc",
  "/root",
  "/home",
  "/usr",
  "/var",
  "C:\\Windows",
  "C:\\Program Files",
  "C:\\Program Files (x86)",
];

export const SENSITIVE_FILENAMES = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  "package-lock.json",
  "yarn.lock",
  "composer.lock",
  "Gemfile.lock",
  "secret",
  "secrets",
  "credentials",
  ".aws",
  ".ssh",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
];