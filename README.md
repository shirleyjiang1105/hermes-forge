# Hermes Desktop Workspace

Hermes Desktop Workspace 是一款基于 Electron、React 与 Tailwind CSS 打造的纯本地 Hermes Agent 桌面工作台。它把 Hermes 的命令行能力、流式会话、本地工作区、文件上下文和 Windows 原生工具桥接封装进一个优雅的桌面客户端，让开发者可以在自己的机器上运行、审计和扩展 Agent 工作流，而不把项目文件或凭证交给远端壳层。

这个项目的目标很克制：提供一个安全、可移植、可开源复用的 Hermes 桌面外壳。所有运行路径、模型密钥与 Provider 配置都应来自用户本机设置、系统环境变量或 Electron 用户数据目录。

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
git clone https://github.com/your-org/hermes-desktop-workspace.git
cd hermes-desktop-workspace
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

Windows 打包：

```bash
npm run package:portable
npm run package:win
```

## Runtime Configuration

Hermes 根路径不会在源码中写死。应用会按以下顺序查找：

1. 设置页中保存的 Hermes 根路径
2. `HERMES_HOME`
3. `HERMES_AGENT_HOME`
4. 当前系统用户目录下的 `Hermes Agent`
5. 当前项目目录下的 `Hermes Agent`

真实 API Key、Bridge token 和本地模型地址请写入 `.env` 或应用设置，不要提交到仓库。`.env.example` 只保留空值和安全示例。

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

欢迎提交 Issue、讨论设计方向或发起 Pull Request。建议贡献前先运行：

```bash
npm run check
npm test
```

提交 PR 时请说明：

- 变更动机和用户影响
- 主要实现点
- 已运行的检查命令
- 是否涉及权限、密钥、文件系统、命令执行或打包流程

## License

MIT
