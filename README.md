# Hermes Forge

Hermes Forge 是一款基于 Electron、React 与 Tailwind CSS 打造的纯本地 Hermes Agent 桌面工坊。它把 Hermes 的命令行能力、流式会话、本地工作区、文件上下文和 Windows / WSL 工具桥接封装进一个可审计、可改造、可共同演进的桌面客户端。

这个项目不是封闭成品，也不是官方 Hermes 客户端。它的发布目标很明确：邀请社区一起把 Hermes 的本地桌面体验打磨得更好。你可以改 UI、补平台适配、做插件系统、优化安全边界、扩展连接器，或者把它改造成你自己的 Agent 工作台。

> Local-first. Community-hackable. Built for people who want to reshape the Hermes desktop experience.

## Why Forge

Hermes Forge 的名字来自“工坊”：这里不是只展示一个完成品，而是给开发者一起锻造本地 Agent 桌面体验的地方。我们希望社区围绕这些方向协作：

- 让 Hermes Agent 更容易在桌面端启动、配置和观察。
- 让 Windows / WSL / 本地模型 / Provider 配置变得更安全、更透明。
- 让 UI、主题、插件、工作区和自动化能力可以被社区自由改造。
- 让所有敏感数据留在本机，默认不提交、不上传、不暴露。

## Core Features

- Apple-inspired glass UI: 以轻量玻璃质感、清晰层级和桌面级交互组织聊天、工作区、状态栏与配置中心。
- Streaming conversation engine: 主进程统一编排 Hermes CLI 输出、任务状态、工具事件与最终回复，Renderer 只消费安全事件流。
- Local-first workspace isolation: 会话文件、快照、工作区锁和附件副本均在本机管理，避免 Renderer 直接触达敏感文件系统能力。
- Secure IPC boundary: Electron preload 只暴露白名单 API，主进程负责路径校验、权限判断、密钥读取与命令执行。
- Hermes runtime profiles: 支持 Windows / WSL 模式、Python 命令、Hermes 根路径、模型 Provider 与本地 OpenAI-compatible endpoint 配置。
- Windows Agent bridge: 可选桥接 PowerShell、剪贴板、窗口、截图、键鼠和文件工具，并通过运行时 token 与权限策略保护调用边界。
- Memory-aware context: 支持 Hermes 本地记忆目录、上下文预算、只读 Context Bundle 和会话日志脱敏。
- Developer-ready release flow: 内置 TypeScript 检查、Vitest 测试、Vite 构建与 electron-builder Windows 打包脚本。

## Quick Start

### Prerequisites

- Node.js 20 或更高版本
- npm 10 或更高版本
- Windows 10/11 推荐；WSL 模式需要已安装 WSL 发行版
- 已在本机准备 Hermes Agent CLI

### Installation

```bash
git clone https://github.com/Mahiruxia/hermes-forge.git
cd hermes-forge
npm install
```

复制环境变量模板，并按需填写本机 Hermes 与模型配置：

```bash
cp .env.example .env
```

Windows PowerShell 也可以直接创建本地环境文件：

```powershell
Copy-Item .env.example .env
```

### Development

启动开发版桌面客户端：

```bash
npm run dev
```

构建并启动生产模式 Electron 客户端：

```bash
npm start
```

常用质量检查：

```bash
npm run check
npm test
npm run build
```

## Build and Deploy

Hermes Forge 当前提供 Windows 打包脚本：

```bash
npm run package:portable
npm run package:win
```

打包结果会输出到 `release/`，该目录已被 `.gitignore` 忽略。正式发布 GitHub Release 时，建议只上传构建后的安装包或 portable 包，不要上传 `.env`、`user-data/`、会话日志、缓存、快照或本地 Hermes 配置。

推荐发布流程：

```bash
npm run check
npm test
npm run build
npm run package:portable
```

如果你正在改版 Hermes Forge，欢迎先开 Draft PR 展示方向，不必等到功能完全成熟。UI 方案、平台适配、插件想法、文档改进都可以先讨论。

## Runtime Configuration

Hermes 根路径不会在源码中写死。应用会按以下顺序查找：

1. 设置页中保存的 Hermes 根路径
2. `HERMES_HOME`
3. `HERMES_AGENT_HOME`
4. 当前系统用户目录下的 `Hermes Agent`
5. 当前项目目录下的 `Hermes Agent`

真实 API Key、Bridge token 和本地模型地址请写入 `.env` 或应用设置，不要提交到仓库。`.env.example` 只保留空值和安全示例。

首次启动时，Hermes Forge 会通过真实的 Hermes probe 检测当前登录用户环境下的 Hermes CLI 是否可用。未检测到时，一键部署会走主进程安装流程，而不是前端模拟：

1. 检测 Git 与 Python 是否可用。
2. 将 Hermes Agent 克隆到 `HERMES_INSTALL_DIR`，默认是当前系统用户目录下的 `Hermes Agent`。
3. 如果存在 `pyproject.toml` 或 `requirements.txt`，尝试安装 Python 依赖。
4. 保存 Hermes 根路径到本机运行配置。
5. 再次执行 Hermes 健康检查，只有通过后才进入应用。

可以通过 `.env` 覆盖安装源和安装目录：

```dotenv
HERMES_INSTALL_DIR=
HERMES_INSTALL_REPO_URL=https://github.com/NousResearch/hermes-agent.git
```

如果目标目录已存在且不是 Hermes 安装目录，一键部署会停止并返回安装日志路径，不会覆盖用户文件。

## Project Structure

```text
.
├── assets/                 App icons and static release assets
├── resources/              Runtime helper resources copied into Electron packages
├── scripts/                Local development and diagnostic scripts
├── src/
│   ├── adapters/           Hermes adapter and engine abstraction
│   ├── auth/               Main-process secret vault helpers
│   ├── diagnostics/        Diagnostic export and runtime inspection
│   ├── file-manager/       Workspace file tree services
│   ├── main/               Electron main process, IPC handlers, windows, runtime config
│   ├── memory/             Memory broker, context budgeter, local index helpers
│   ├── preload/            Secure Electron preload bridge
│   ├── process/            Command runner, task runner, snapshots and workspace locks
│   ├── renderer/           React UI, dashboard, panels, state store and styles
│   ├── security/           Path validation and permission constants
│   ├── setup/              First-run setup orchestration
│   ├── shared/             Shared TypeScript types, schemas and IPC contracts
│   └── updater/            Update status services
├── index.html              Vite renderer entry
├── package.json            npm scripts, dependencies and electron-builder config
└── vite.config.ts          Renderer build configuration
```

## Security Notes

- 不要提交 `.env`、本地 Hermes 配置、Electron `user-data`、会话日志、缓存、快照或打包产物。
- Renderer 不应读取明文凭证；Provider API Key 由主进程通过 SecretVault 和运行时环境注入。
- Windows Agent bridge token 只应在运行时生成和传递，不应出现在源码或文档示例中。
- 所有文件读写、命令执行和上下文桥接都应经过权限策略与路径校验。

## Contributing

Hermes Forge 欢迎社区一起改。你可以从这些地方开始：

- 提一个 Issue 描述你想要的桌面体验。
- 发 Draft PR 展示 UI 改版、交互实验或平台适配方向。
- 补测试、补文档、补安全检查。
- 认领 `ROADMAP.md` 里的任务，或者提出新的路线图建议。

建议贡献前先运行：

```bash
npm run check
npm test
```

提交 PR 时请说明：

- 变更动机和用户影响
- 主要实现点
- 已运行的检查命令
- 是否涉及权限、密钥、文件系统、命令执行或打包流程

更多细节见 [CONTRIBUTING.md](CONTRIBUTING.md)、[SECURITY.md](SECURITY.md) 和 [ROADMAP.md](ROADMAP.md)。

## License

MIT
