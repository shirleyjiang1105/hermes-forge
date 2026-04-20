import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AppPaths } from "./app-paths";
import { runCommand } from "../process/command-runner";
import type { SecretVault } from "../auth/secret-vault";
import type {
  HermesConnectorConfig,
  HermesConnectorField,
  HermesConnectorListResult,
  HermesConnectorPlatform,
  HermesConnectorPlatformId,
  HermesConnectorSaveInput,
  HermesConnectorStatus,
  HermesGatewayActionResult,
  HermesGatewayStatus,
  WeixinQrLoginResult,
  WeixinQrLoginStatus,
} from "../shared/types";

type StoredPlatformConfig = {
  enabled?: boolean;
  values?: Record<string, string | boolean>;
  secretRefs?: Record<string, string>;
  updatedAt?: string;
  lastSyncedAt?: string;
};

type StoredConnectorConfig = {
  platforms?: Partial<Record<HermesConnectorPlatformId, StoredPlatformConfig>>;
};

type WeixinQrEvent =
  | { type: "phase"; phase: WeixinQrLoginStatus["phase"]; message?: string }
  | { type: "qr"; qrUrl: string; expiresAt?: string; message?: string }
  | { type: "confirmed"; accountId: string; token: string; baseUrl?: string; userId?: string }
  | { type: "error"; code?: string; message?: string };

type PythonCommand = {
  command: string;
  args: string[];
  label: string;
};

const MANAGED_START = "# >>> Hermes Desktop Connectors >>>";
const MANAGED_END = "# <<< Hermes Desktop Connectors <<<";

const PYTHON_ENV = {
  PYTHONUTF8: "1",
  PYTHONIOENCODING: "utf-8",
};

const PLATFORM_REGISTRY: HermesConnectorPlatform[] = [
  platform("telegram", "Telegram", "official", "BotFather 机器人，支持私聊、群组、线程、语音和文件。", [
    password("botToken", "TELEGRAM_BOT_TOKEN", "Bot Token", true, "7123456789:AAH..."),
    text("allowedUsers", "TELEGRAM_ALLOWED_USERS", "允许用户", false, "123456789,987654321"),
    text("homeChannel", "TELEGRAM_HOME_CHANNEL", "Home Channel", false, "123456789"),
  ], ["在 Telegram 中向 @BotFather 创建 bot 并复制 token。", "建议填写 TELEGRAM_ALLOWED_USERS 限制可访问用户。"]),
  platform("discord", "Discord", "official", "Discord Bot，支持服务器、DM、线程和附件。", [
    password("botToken", "DISCORD_BOT_TOKEN", "Bot Token", true, "MTI..."),
    text("allowedUsers", "DISCORD_ALLOWED_USERS", "允许用户", false, "123456789012345678"),
    text("homeChannel", "DISCORD_HOME_CHANNEL", "Home Channel", false, "channel id"),
  ], ["在 Discord Developer Portal 创建 Bot 并开启 Message Content Intent。", "邀请 bot 时授予发送消息、读取历史和查看频道权限。"]),
  platform("slack", "Slack", "official", "Slack Socket Mode，支持频道、DM、线程和 /hermes 命令。", [
    password("botToken", "SLACK_BOT_TOKEN", "Bot Token", true, "xoxb-..."),
    password("appToken", "SLACK_APP_TOKEN", "App Token", true, "xapp-..."),
    text("allowedUsers", "SLACK_ALLOWED_USERS", "允许用户", false, "U0123456789"),
    text("homeChannel", "SLACK_HOME_CHANNEL", "Home Channel", false, "C0123456789"),
  ], ["在 api.slack.com/apps 创建应用并启用 Socket Mode。", "Bot token 需要 chat:write、app_mentions:read、im:history 等权限。"]),
  platform("whatsapp", "WhatsApp", "official", "内置 Baileys 桥接，使用二维码配对手机。", [
    bool("enabled", "WHATSAPP_ENABLED", "启用 WhatsApp", true),
    text("allowedUsers", "WHATSAPP_ALLOWED_USERS", "允许号码", false, "15551234567"),
  ], ["先同步配置，再运行 Hermes 的 WhatsApp 配对流程扫描二维码。"]),
  platform("signal", "Signal", "official", "通过 signal-cli HTTP bridge 接入 Signal。", [
    url("httpUrl", "SIGNAL_HTTP_URL", "HTTP URL", true, "http://localhost:8080"),
    text("account", "SIGNAL_ACCOUNT", "账号", true, "+15551234567"),
    text("allowedUsers", "SIGNAL_ALLOWED_USERS", "允许用户", false, "+15559876543"),
    text("homeChannel", "SIGNAL_HOME_CHANNEL", "Home Channel", false, "+15559876543"),
  ], ["先启动 signal-cli HTTP 服务，例如 signal-cli daemon --http=localhost:8080。"]),
  platform("email", "Email", "official", "IMAP/SMTP 邮箱接入，适合后台任务通知和邮件对话。", [
    text("address", "EMAIL_ADDRESS", "邮箱地址", true, "hermes@example.com"),
    password("password", "EMAIL_PASSWORD", "邮箱密码/App Password", true, "app password"),
    text("imapHost", "EMAIL_IMAP_HOST", "IMAP Host", true, "imap.gmail.com"),
    text("smtpHost", "EMAIL_SMTP_HOST", "SMTP Host", true, "smtp.gmail.com"),
    text("allowedUsers", "EMAIL_ALLOWED_USERS", "允许发件人", false, "you@example.com"),
    text("homeAddress", "EMAIL_HOME_ADDRESS", "Home Address", false, "you@example.com"),
  ], ["Gmail 建议使用 App Password，并确认 IMAP 已开启。"]),
  platform("matrix", "Matrix", "official", "Matrix homeserver bot，支持房间、DM 和可选端到端加密。", [
    url("homeserver", "MATRIX_HOMESERVER", "Homeserver", true, "https://matrix.org"),
    password("accessToken", "MATRIX_ACCESS_TOKEN", "Access Token", false, "syt_..."),
    text("userId", "MATRIX_USER_ID", "User ID", false, "@hermes:matrix.org"),
    password("password", "MATRIX_PASSWORD", "Password", false),
    text("allowedUsers", "MATRIX_ALLOWED_USERS", "允许用户", false, "@you:matrix.org"),
    text("homeRoom", "MATRIX_HOME_ROOM", "Home Room", false, "!room:matrix.org"),
  ], ["Access Token 或 Password 至少填写一个。"]),
  platform("mattermost", "Mattermost", "official", "自托管 Mattermost Bot 接入。", [
    url("url", "MATTERMOST_URL", "Server URL", true, "https://mattermost.example.com"),
    password("token", "MATTERMOST_TOKEN", "Bot Token", true),
    text("allowedUsers", "MATTERMOST_ALLOWED_USERS", "允许用户", false),
    text("homeChannel", "MATTERMOST_HOME_CHANNEL", "Home Channel", false),
  ], ["在 Mattermost Integrations 中创建 Bot Account 并复制 token。"]),
  platform("dingtalk", "DingTalk", "official", "钉钉 Stream Mode 企业机器人。", [
    text("clientId", "DINGTALK_CLIENT_ID", "Client ID / AppKey", true),
    password("clientSecret", "DINGTALK_CLIENT_SECRET", "Client Secret / AppSecret", true),
    text("allowedUsers", "DINGTALK_ALLOWED_USERS", "允许用户", false),
    text("homeChannel", "DINGTALK_HOME_CHANNEL", "Home Channel", false),
  ], ["在钉钉开放平台创建企业内部应用，复制 AppKey 和 AppSecret。"]),
  platform("feishu", "Feishu", "official", "飞书机器人/应用接入。", [
    text("appId", "FEISHU_APP_ID", "App ID", true),
    password("appSecret", "FEISHU_APP_SECRET", "App Secret", true),
    text("allowedUsers", "FEISHU_ALLOWED_USERS", "允许用户", false),
    text("homeChannel", "FEISHU_HOME_CHANNEL", "Home Channel", false),
  ], ["本机 Hermes 源码已包含 Feishu 平台配置；按飞书开放平台应用凭据填写。"]),
  platform("homeassistant", "Home Assistant", "official", "Home Assistant Assist pipeline 集成。", [
    url("url", "HASS_URL", "Home Assistant URL", true, "http://homeassistant.local:8123"),
    password("token", "HASS_TOKEN", "Long-Lived Access Token", true),
  ], ["在 Home Assistant 用户资料页创建 Long-Lived Access Token。"]),
  platform("wecom", "WeCom", "advanced", "企业微信 AI Bot 模式。", [
    text("botId", "WECOM_BOT_ID", "Bot ID", true),
    password("secret", "WECOM_SECRET", "Secret", true),
    text("allowedUsers", "WECOM_ALLOWED_USERS", "允许用户", false),
    text("homeChannel", "WECOM_HOME_CHANNEL", "Home Channel", false),
  ], ["在企业微信管理后台创建 AI Bot，并限制允许用户。"]),
  platform("wecom_callback", "WeCom Callback", "advanced", "企业微信自建应用回调模式，需要公网/内网可访问回调端口。", [
    text("corpId", "WECOM_CALLBACK_CORP_ID", "Corp ID", true),
    password("corpSecret", "WECOM_CALLBACK_CORP_SECRET", "Corp Secret", true),
    text("agentId", "WECOM_CALLBACK_AGENT_ID", "Agent ID", false),
    password("token", "WECOM_CALLBACK_TOKEN", "Callback Token", false),
    password("aesKey", "WECOM_CALLBACK_ENCODING_AES_KEY", "EncodingAESKey", false),
    number("port", "WECOM_CALLBACK_PORT", "Callback Port", false, "8645"),
    text("allowedUsers", "WECOM_CALLBACK_ALLOWED_USERS", "允许用户", false),
  ], ["回调模式需要配置可信回调地址，并确保端口可达。"]),
  platform("weixin", "Weixin / WeChat", "advanced", "个人微信 iLink Bot API 接入。", [
    text("accountId", "WEIXIN_ACCOUNT_ID", "Account ID", true),
    password("token", "WEIXIN_TOKEN", "Token", true),
    url("baseUrl", "WEIXIN_BASE_URL", "Base URL", false),
    url("cdnBaseUrl", "WEIXIN_CDN_BASE_URL", "CDN Base URL", false, "https://novac2c.cdn.weixin.qq.com/c2c"),
    text("dmPolicy", "WEIXIN_DM_POLICY", "私聊策略", false, "pairing"),
    bool("allowAllUsers", "WEIXIN_ALLOW_ALL_USERS", "允许所有私聊用户", false),
    text("allowedUsers", "WEIXIN_ALLOWED_USERS", "允许用户", false),
    text("groupPolicy", "WEIXIN_GROUP_POLICY", "群聊策略", false, "disabled"),
    text("groupAllowedUsers", "WEIXIN_GROUP_ALLOWED_USERS", "允许群聊", false),
    text("homeChannel", "WEIXIN_HOME_CHANNEL", "Home Channel", false),
  ], ["需要可用的 iLink Bot API 服务和账号授权。"]),
  platform("bluebubbles", "BlueBubbles", "advanced", "通过 Mac 上的 BlueBubbles Server 接入 iMessage。", [
    url("serverUrl", "BLUEBUBBLES_SERVER_URL", "Server URL", true),
    password("password", "BLUEBUBBLES_PASSWORD", "Password", true),
    text("allowedUsers", "BLUEBUBBLES_ALLOWED_USERS", "允许用户", false),
    text("homeChannel", "BLUEBUBBLES_HOME_CHANNEL", "Home Channel", false),
  ], ["需要一台已配置 BlueBubbles Server 的 Mac。"]),
  platform("sms", "SMS", "advanced", "Hermes SMS 平台配置入口。", [
    text("homeChannel", "SMS_HOME_CHANNEL", "Home Channel", false),
    text("allowedUsers", "SMS_ALLOWED_USERS", "允许用户", false),
  ], ["SMS 具体依赖取决于 Hermes 安装的短信适配器。"]),
  platform("qqbot", "QQ Bot", "advanced", "QQ Bot 平台配置入口。", [
    text("allowedUsers", "QQ_ALLOWED_USERS", "允许用户", false),
    text("groupAllowedUsers", "QQ_GROUP_ALLOWED_USERS", "群聊允许用户", false),
    text("homeChannel", "QQ_HOME_CHANNEL", "Home Channel", false),
  ], ["QQ Bot 具体凭据字段取决于 Hermes 适配器版本。"]),
];

export class HermesConnectorService {
  private gatewayProcess?: ChildProcessWithoutNullStreams;
  private gatewayStartedAt?: string;
  private gatewayOutput = "";
  private gatewayError = "";
  private gatewayExitMessage = "";
  private weixinQrProcess?: ChildProcessWithoutNullStreams;
  private weixinQrStatus: WeixinQrLoginStatus = { running: false, phase: "idle", message: "微信扫码登录尚未启动。" };
  private weixinQrLineBuffer = "";

  constructor(
    private readonly appPaths: AppPaths,
    private readonly secretVault: SecretVault,
    private readonly resolveHermesRoot: () => Promise<string>,
    private readonly resolveConfiguredPythonCommand?: () => Promise<string | undefined>,
  ) {}

  async list(): Promise<HermesConnectorListResult> {
    const [stored, envValues, gateway] = await Promise.all([
      this.readConfig(),
      this.readEnvValues(),
      this.status(),
    ]);
    const connectors = await Promise.all(PLATFORM_REGISTRY.map((platform) => this.toConnector(platform, stored, envValues, gateway)));
    return { connectors, gateway, envPath: this.envPath() };
  }

  async save(input: HermesConnectorSaveInput): Promise<HermesConnectorConfig> {
    const platform = platformById(input.platformId);
    const stored = await this.readConfig();
    const current = stored.platforms?.[platform.id] ?? {};
    const values: Record<string, string | boolean> = { ...(current.values ?? {}) };
    const secretRefs: Record<string, string> = { ...(current.secretRefs ?? {}) };

    for (const field of platform.fields) {
      if (!(field.key in input.values)) continue;
      const rawValue = input.values[field.key];
      if (field.secret) {
        if (typeof rawValue === "string" && rawValue.trim()) {
          const ref = secretRef(platform.id, field.key);
          await this.secretVault.saveSecret(ref, rawValue.trim());
          secretRefs[field.key] = ref;
        }
        continue;
      }
      if (field.type === "boolean") {
        values[field.key] = Boolean(rawValue);
      } else {
        const value = typeof rawValue === "string" ? rawValue.trim() : String(rawValue ?? "").trim();
        if (value) values[field.key] = value;
        else delete values[field.key];
      }
    }

    const next: StoredPlatformConfig = {
      enabled: input.enabled ?? true,
      values,
      secretRefs,
      updatedAt: new Date().toISOString(),
      lastSyncedAt: current.lastSyncedAt,
    };
    stored.platforms ??= {};
    stored.platforms[platform.id] = next;
    await this.writeConfig(stored);

    const envValues = await this.readEnvValues();
    return this.toConnector(platform, stored, envValues, await this.status());
  }

  async disable(platformId: HermesConnectorPlatformId) {
    const platform = platformById(platformId);
    const stored = await this.readConfig();
    stored.platforms ??= {};
    stored.platforms[platform.id] = {
      ...(stored.platforms[platform.id] ?? {}),
      enabled: false,
      updatedAt: new Date().toISOString(),
    };
    await this.writeConfig(stored);
    const envValues = await this.readEnvValues();
    return this.toConnector(platform, stored, envValues, await this.status());
  }

  async syncEnv(): Promise<{ ok: boolean; envPath: string; message: string; connectors: HermesConnectorConfig[] }> {
    const stored = await this.readConfig();
    const lines: string[] = [
      MANAGED_START,
      "# Managed by Hermes Desktop. Edit connector settings in the desktop app.",
    ];
    const syncedAt = new Date().toISOString();

    for (const platform of PLATFORM_REGISTRY) {
      const config = stored.platforms?.[platform.id];
      if (!config || config.enabled === false) continue;
      const missing = await this.missingRequired(platform, config, {});
      if (missing.length > 0) continue;
      const envLines = await this.envLinesFor(platform, config);
      if (envLines.length === 0) continue;
      lines.push("", `# ${platform.label}`, ...envLines);
      stored.platforms![platform.id] = { ...config, lastSyncedAt: syncedAt };
    }
    lines.push(MANAGED_END);

    const envPath = this.envPath();
    const existing = await fs.readFile(envPath, "utf8").catch(() => "");
    await this.backupEnv(existing);
    const withoutBlock = removeManagedBlock(existing).trimEnd();
    const hasAnyConnector = lines.some((line) => line.includes("="));
    const next = hasAnyConnector
      ? `${withoutBlock ? `${withoutBlock}\n\n` : ""}${lines.join("\n")}\n`
      : `${withoutBlock}${withoutBlock ? "\n" : ""}`;
    await fs.mkdir(path.dirname(envPath), { recursive: true });
    await fs.writeFile(envPath, next, "utf8");
    await this.writeConfig(stored);
    const list = await this.list();
    return {
      ok: true,
      envPath,
      message: hasAnyConnector ? `已同步连接器配置到 ${envPath}` : "没有完整可同步的连接器，已移除桌面端管理区块。",
      connectors: list.connectors,
    };
  }

  async status(): Promise<HermesGatewayStatus> {
    const running = Boolean(this.gatewayProcess && !this.gatewayProcess.killed);
    const cliStatus = await this.gatewayCliStatus().catch(() => undefined);
    return {
      running,
      pid: running ? this.gatewayProcess?.pid : undefined,
      startedAt: running ? this.gatewayStartedAt : undefined,
      command: running ? "Hermes Python gateway run" : undefined,
      message: running ? "Gateway 正由桌面端托管运行。" : cliStatus?.message || this.gatewayExitMessage || "Gateway 未由桌面端托管运行。",
      lastOutput: trimLog([this.gatewayOutput, cliStatus?.stdout].filter(Boolean).join("\n")),
      lastError: trimLog([this.gatewayError, cliStatus?.stderr].filter(Boolean).join("\n")),
      checkedAt: new Date().toISOString(),
    };
  }

  async start(): Promise<HermesGatewayActionResult> {
    const current = await this.status();
    if (current.running) {
      return { ok: true, status: current, message: "Gateway 已在运行。" };
    }
    const root = await this.resolveHermesRoot();
    const python = await this.resolvePythonCommand(root);
    const child = spawn(python.command, [...python.args, path.join(root, "hermes"), "gateway", "run"], {
      cwd: root,
      env: { ...process.env, ...PYTHON_ENV },
      windowsHide: true,
      shell: false,
    });
    this.gatewayProcess = child;
    this.gatewayStartedAt = new Date().toISOString();
    this.gatewayOutput = "";
    this.gatewayError = "";
    this.gatewayExitMessage = "";
    this.gatewayOutput = `Using Python: ${python.label}`;
    child.stdout.on("data", (chunk: Buffer) => {
      this.gatewayOutput = trimLog(`${this.gatewayOutput}${chunk.toString("utf8")}`);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      this.gatewayError = trimLog(`${this.gatewayError}${chunk.toString("utf8")}`);
    });
    child.on("error", (error) => {
      this.gatewayError = trimLog(`${this.gatewayError}\n${error.message}`);
    });
    child.on("close", (exitCode) => {
      this.gatewayExitMessage = `Gateway 已退出，退出码：${exitCode ?? "unknown"}`;
      this.gatewayProcess = undefined;
      this.gatewayStartedAt = undefined;
    });
    return { ok: true, status: await this.status(), message: "Gateway 已启动。" };
  }

  async stop(): Promise<HermesGatewayActionResult> {
    if (!this.gatewayProcess?.pid) {
      return { ok: true, status: await this.status(), message: "没有桌面端托管的 Gateway 进程。" };
    }
    await killProcessTree(this.gatewayProcess.pid);
    this.gatewayProcess = undefined;
    this.gatewayStartedAt = undefined;
    this.gatewayExitMessage = "Gateway 已由桌面端停止。";
    return { ok: true, status: await this.status(), message: "Gateway 已停止。" };
  }

  async restart(): Promise<HermesGatewayActionResult> {
    await this.stop();
    return this.start();
  }

  async shutdown() {
    await this.stop();
    await this.cancelWeixinQrLogin();
  }

  getWeixinQrStatus(): WeixinQrLoginStatus {
    return { ...this.weixinQrStatus };
  }

  async startWeixinQrLogin(): Promise<WeixinQrLoginResult> {
    if (this.weixinQrProcess && !this.weixinQrProcess.killed) {
      return { ok: true, status: this.getWeixinQrStatus(), message: "微信扫码登录已在进行中。" };
    }
    const root = await this.resolveHermesRoot();
    const python = await this.resolvePythonCommand(root);
    const script = [
      "import asyncio, datetime, json, sys, time",
      "from hermes_constants import get_hermes_home",
      "from gateway.platforms import weixin as wx",
      "def emit(payload):",
      "    print(json.dumps(payload, ensure_ascii=False), flush=True)",
      "def expires_at(seconds):",
      "    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=seconds)).isoformat()",
      "async def fetch_qr(session, bot_type):",
      "    qr_resp = await wx._api_get(session, base_url=wx.ILINK_BASE_URL, endpoint=f'{wx.EP_GET_BOT_QR}?bot_type={bot_type}', timeout_ms=wx.QR_TIMEOUT_MS)",
      "    qrcode_value = str(qr_resp.get('qrcode') or '')",
      "    qrcode_url = str(qr_resp.get('qrcode_img_content') or '')",
      "    if not qrcode_value:",
      "        raise RuntimeError('二维码响应缺少 qrcode。')",
      "    emit({'type': 'qr', 'qrUrl': qrcode_url or qrcode_value, 'expiresAt': expires_at(120), 'message': '请使用微信扫描二维码，并在手机上确认。'})",
      "    return qrcode_value",
      "async def main():",
      "    if not wx.AIOHTTP_AVAILABLE:",
      "        emit({'type': 'error', 'code': 'missing_aiohttp', 'message': '缺少 Weixin 扫码依赖 aiohttp。'})",
      "        return 2",
      "    if not wx.CRYPTO_AVAILABLE:",
      "        emit({'type': 'error', 'code': 'missing_crypto', 'message': '缺少 Weixin 扫码依赖 cryptography。'})",
      "        return 2",
      "    bot_type = '3'",
      "    timeout_seconds = 480",
      "    hermes_home = str(get_hermes_home())",
      "    emit({'type': 'phase', 'phase': 'fetching_qr', 'message': '正在获取微信二维码...'})",
      "    async with wx.aiohttp.ClientSession(trust_env=True, connector=wx._make_ssl_connector()) as session:",
      "        try:",
      "            qrcode_value = await fetch_qr(session, bot_type)",
      "        except Exception as exc:",
      "            emit({'type': 'error', 'code': 'fetch_qr_failed', 'message': f'获取微信二维码失败：{exc}'})",
      "            return 1",
      "        deadline = time.time() + timeout_seconds",
      "        current_base_url = wx.ILINK_BASE_URL",
      "        refresh_count = 0",
      "        last_phase = 'waiting_scan'",
      "        while time.time() < deadline:",
      "            try:",
      "                status_resp = await wx._api_get(session, base_url=current_base_url, endpoint=f'{wx.EP_GET_QR_STATUS}?qrcode={qrcode_value}', timeout_ms=wx.QR_TIMEOUT_MS)",
      "            except asyncio.TimeoutError:",
      "                await asyncio.sleep(1)",
      "                continue",
      "            except Exception as exc:",
      "                emit({'type': 'phase', 'phase': last_phase, 'message': f'扫码状态检查暂时失败，正在重试：{exc}'})",
      "                await asyncio.sleep(1)",
      "                continue",
      "            status = str(status_resp.get('status') or 'wait')",
      "            if status == 'wait':",
      "                if last_phase != 'waiting_scan':",
      "                    emit({'type': 'phase', 'phase': 'waiting_scan', 'message': '等待微信扫码...'})",
      "                    last_phase = 'waiting_scan'",
      "            elif status == 'scaned':",
      "                emit({'type': 'phase', 'phase': 'waiting_confirm', 'message': '已扫码，请在微信手机端确认登录。'})",
      "                last_phase = 'waiting_confirm'",
      "            elif status == 'scaned_but_redirect':",
      "                redirect_host = str(status_resp.get('redirect_host') or '')",
      "                if redirect_host:",
      "                    current_base_url = f'https://{redirect_host}'",
      "                emit({'type': 'phase', 'phase': 'waiting_confirm', 'message': '已扫码，正在切换确认服务器...'})",
      "                last_phase = 'waiting_confirm'",
      "            elif status == 'expired':",
      "                refresh_count += 1",
      "                if refresh_count > 3:",
      "                    emit({'type': 'error', 'code': 'expired', 'message': '二维码多次过期，请重新扫码。'})",
      "                    return 1",
      "                emit({'type': 'phase', 'phase': 'fetching_qr', 'message': f'二维码已过期，正在刷新 ({refresh_count}/3)...'})",
      "                try:",
      "                    qrcode_value = await fetch_qr(session, bot_type)",
      "                    current_base_url = wx.ILINK_BASE_URL",
      "                    last_phase = 'waiting_scan'",
      "                except Exception as exc:",
      "                    emit({'type': 'error', 'code': 'refresh_qr_failed', 'message': f'刷新微信二维码失败：{exc}'})",
      "                    return 1",
      "            elif status == 'confirmed':",
      "                account_id = str(status_resp.get('ilink_bot_id') or '')",
      "                token = str(status_resp.get('bot_token') or '')",
      "                base_url = str(status_resp.get('baseurl') or wx.ILINK_BASE_URL)",
      "                user_id = str(status_resp.get('ilink_user_id') or '')",
      "                if not account_id or not token:",
      "                    emit({'type': 'error', 'code': 'incomplete_credentials', 'message': '微信已确认，但返回凭据不完整。'})",
      "                    return 1",
      "                wx.save_weixin_account(hermes_home, account_id=account_id, token=token, base_url=base_url, user_id=user_id)",
      "                emit({'type': 'confirmed', 'accountId': account_id, 'token': token, 'baseUrl': base_url, 'userId': user_id})",
      "                return 0",
      "            else:",
      "                emit({'type': 'phase', 'phase': last_phase, 'message': f'等待微信确认，当前状态：{status}'})",
      "            await asyncio.sleep(1)",
      "    emit({'type': 'error', 'code': 'timeout', 'message': '微信扫码登录超时，请重新扫码。'})",
      "        return 1",
      "sys.exit(asyncio.run(main()))",
    ].join("\n");

    this.weixinQrLineBuffer = "";
    this.weixinQrStatus = {
      running: true,
      phase: "fetching_qr",
      startedAt: new Date().toISOString(),
      success: undefined,
      message: "正在获取微信二维码...",
    };
    const child = spawn(python.command, [...python.args, "-c", script], {
      cwd: root,
      env: { ...process.env, ...PYTHON_ENV, PYTHONPATH: root },
      windowsHide: true,
      shell: false,
    });
    this.weixinQrProcess = child;
    child.stdout.on("data", (chunk: Buffer) => this.handleWeixinQrOutput(chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => {
      this.weixinQrStatus = {
        ...this.weixinQrStatus,
        output: trimLog(`${this.weixinQrStatus.output ?? ""}${sanitizeSensitiveLog(chunk.toString("utf8"))}`),
      };
    });
    child.on("error", (error) => {
      this.weixinQrStatus = {
        ...this.weixinQrStatus,
        running: false,
        phase: "failed",
        completedAt: new Date().toISOString(),
        success: false,
        message: `微信扫码登录启动失败：${error.message}`,
      };
    });
    child.on("close", (exitCode) => {
      this.weixinQrProcess = undefined;
      this.weixinQrLineBuffer = "";
      if (isWeixinQrTerminal(this.weixinQrStatus.phase) || ["saving", "syncing", "starting_gateway"].includes(this.weixinQrStatus.phase)) return;
      this.weixinQrStatus = {
        ...this.weixinQrStatus,
        running: false,
        phase: "failed",
        completedAt: new Date().toISOString(),
        success: false,
        message: exitCode === 0 ? "微信扫码登录已结束，但未返回凭据。" : "微信扫码登录未完成或已超时。",
      };
    });
    return { ok: true, status: this.getWeixinQrStatus(), message: "微信扫码登录已启动。" };
  }

  async cancelWeixinQrLogin(): Promise<WeixinQrLoginResult> {
    if (this.weixinQrProcess?.pid) {
      await killProcessTree(this.weixinQrProcess.pid);
      this.weixinQrProcess = undefined;
    }
    this.weixinQrLineBuffer = "";
    this.weixinQrStatus = {
      ...this.weixinQrStatus,
      running: false,
      phase: "cancelled",
      completedAt: new Date().toISOString(),
      success: false,
      message: "微信扫码登录已取消。",
    };
    return { ok: true, status: this.getWeixinQrStatus(), message: "微信扫码登录已取消。" };
  }

  private handleWeixinQrOutput(text: string) {
    this.weixinQrLineBuffer += text;
    const lines = this.weixinQrLineBuffer.split(/\r?\n/);
    this.weixinQrLineBuffer = lines.pop() ?? "";
    for (const line of lines) {
      const event = parseWeixinQrEvent(line);
      if (!event) {
        const safeLine = sanitizeSensitiveLog(line);
        if (!safeLine.trim()) continue;
        this.weixinQrStatus = {
          ...this.weixinQrStatus,
          output: trimLog(`${this.weixinQrStatus.output ?? ""}${safeLine}\n`),
        };
        continue;
      }
      if (event.type === "qr") {
        this.weixinQrStatus = {
          ...this.weixinQrStatus,
          running: true,
          phase: "waiting_scan",
          qrUrl: event.qrUrl,
          expiresAt: event.expiresAt,
          message: event.message || "请使用微信扫码。",
        };
        continue;
      }
      if (event.type === "phase") {
        this.weixinQrStatus = {
          ...this.weixinQrStatus,
          running: true,
          phase: event.phase,
          message: event.message || this.weixinQrStatus.message,
        };
        continue;
      }
      if (event.type === "error") {
        this.weixinQrStatus = {
          ...this.weixinQrStatus,
          running: false,
          phase: "failed",
          completedAt: new Date().toISOString(),
          success: false,
          message: event.message || "微信扫码登录失败。",
        };
        continue;
      }
      void this.completeWeixinQrLogin(event);
    }
  }

  private async completeWeixinQrLogin(credentials: Extract<WeixinQrEvent, { type: "confirmed" }>) {
    const setPhase = (phase: WeixinQrLoginStatus["phase"], message: string) => {
      this.weixinQrStatus = {
        ...this.weixinQrStatus,
        running: true,
        phase,
        message,
      };
    };
    try {
      if (!credentials.accountId || !credentials.token) throw new Error("扫码结果缺少 accountId 或 token。");
      setPhase("saving", "微信已确认，正在加密保存凭据...");
      const stored = await this.readConfig();
      const current = stored.platforms?.weixin ?? {};
      const tokenRef = secretRef("weixin", "token");
      await this.secretVault.saveSecret(tokenRef, credentials.token);
      stored.platforms ??= {};
      stored.platforms.weixin = {
        enabled: true,
        values: {
          ...(current.values ?? {}),
          accountId: credentials.accountId,
          ...(credentials.baseUrl ? { baseUrl: credentials.baseUrl } : {}),
          cdnBaseUrl: "https://novac2c.cdn.weixin.qq.com/c2c",
          dmPolicy: "pairing",
          allowAllUsers: false,
          groupPolicy: "disabled",
          ...(credentials.userId ? { homeChannel: credentials.userId } : {}),
        },
        secretRefs: { ...(current.secretRefs ?? {}), token: tokenRef },
        updatedAt: new Date().toISOString(),
        lastSyncedAt: current.lastSyncedAt,
      };
      await this.writeConfig(stored);
      setPhase("syncing", "凭据已保存，正在同步 Hermes .env...");
      await this.syncEnv();
      setPhase("starting_gateway", "配置已同步，正在启动 Gateway...");
      const gatewayResult = await this.start();
      const gatewayStarted = gatewayResult.ok && gatewayResult.status.running;
      this.weixinQrStatus = {
        ...this.weixinQrStatus,
        running: false,
        phase: "success",
        completedAt: new Date().toISOString(),
        success: true,
        accountId: credentials.accountId,
        userId: credentials.userId,
        gatewayStarted,
        message: gatewayStarted
          ? "微信扫码成功，凭据已保存并同步，Gateway 已启动。"
          : `微信扫码成功，凭据已保存并同步，但 Gateway 启动状态需要确认：${gatewayResult.message}`,
      };
    } catch (error) {
      this.weixinQrStatus = {
        ...this.weixinQrStatus,
        running: false,
        phase: "failed",
        completedAt: new Date().toISOString(),
        success: false,
        message: error instanceof Error ? error.message : "微信扫码登录结果处理失败。",
      };
    }
  }

  private async toConnector(
    platform: HermesConnectorPlatform,
    stored: StoredConnectorConfig,
    envValues: Record<string, string>,
    gateway: HermesGatewayStatus,
  ): Promise<HermesConnectorConfig> {
    const saved = stored.platforms?.[platform.id];
    const enabled = saved?.enabled !== false;
    const values: Record<string, string | boolean> = {};
    const secretRefs: Record<string, string> = {};
    const secretStatus: Record<string, boolean> = {};

    for (const field of platform.fields) {
      if (field.secret) {
        const ref = saved?.secretRefs?.[field.key] ?? (envValues[field.envVar] ? secretRef(platform.id, field.key) : undefined);
        if (ref) {
          secretRefs[field.key] = ref;
          secretStatus[field.key] = await this.secretVault.hasSecret(ref);
        } else {
          secretStatus[field.key] = false;
        }
        continue;
      }
      const savedValue = saved?.values?.[field.key];
      const envValue = envValues[field.envVar];
      if (typeof savedValue !== "undefined") {
        values[field.key] = savedValue;
      } else if (typeof envValue !== "undefined") {
        values[field.key] = field.type === "boolean" ? parseBoolean(envValue) : envValue;
      } else if (field.type === "boolean") {
        values[field.key] = false;
      }
    }

    const missingRequired = await this.missingRequired(platform, saved, envValues);
    const configured = missingRequired.length === 0;
    const status = connectorStatus(enabled, configured, gateway);
    return {
      platform,
      status,
      enabled,
      configured,
      missingRequired,
      values,
      secretRefs,
      secretStatus,
      updatedAt: saved?.updatedAt,
      lastSyncedAt: saved?.lastSyncedAt,
      message: statusMessage(status, missingRequired),
    };
  }

  private async missingRequired(platform: HermesConnectorPlatform, saved: StoredPlatformConfig | undefined, envValues: Record<string, string>) {
    const missing: string[] = [];
    for (const field of platform.fields.filter((item) => item.required)) {
      if (field.secret) {
        const ref = saved?.secretRefs?.[field.key];
        const hasSavedSecret = ref ? await this.secretVault.hasSecret(ref) : false;
        if (!hasSavedSecret && !envValues[field.envVar]) missing.push(field.key);
        continue;
      }
      const savedValue = saved?.values?.[field.key];
      if (field.type === "boolean") {
        if (savedValue !== true && !parseBoolean(envValues[field.envVar])) missing.push(field.key);
      } else if (!String(savedValue ?? envValues[field.envVar] ?? "").trim()) {
        missing.push(field.key);
      }
    }
    if (platform.id === "matrix") {
      const tokenRef = saved?.secretRefs?.accessToken;
      const passwordRef = saved?.secretRefs?.password;
      const hasToken = (tokenRef ? await this.secretVault.hasSecret(tokenRef) : false) || Boolean(envValues.MATRIX_ACCESS_TOKEN);
      const hasPassword = (passwordRef ? await this.secretVault.hasSecret(passwordRef) : false) || Boolean(envValues.MATRIX_PASSWORD);
      if (!hasToken && !hasPassword) missing.push("accessToken");
    }
    return [...new Set(missing)];
  }

  private async envLinesFor(platform: HermesConnectorPlatform, config: StoredPlatformConfig) {
    const lines: string[] = [];
    for (const field of platform.fields) {
      let value: string | undefined;
      if (field.secret) {
        const ref = config.secretRefs?.[field.key];
        value = ref ? await this.secretVault.readSecret(ref) : undefined;
      } else {
        const raw = config.values?.[field.key];
        if (typeof raw === "boolean") value = raw ? "true" : "false";
        else value = typeof raw === "string" ? raw : undefined;
      }
      if (typeof value === "string" && value.trim()) {
        lines.push(`${field.envVar}=${quoteEnv(value.trim())}`);
      }
    }
    return lines;
  }

  private async resolvePythonCommand(root: string): Promise<PythonCommand> {
    const configured = (await this.resolveConfiguredPythonCommand?.().catch(() => undefined))?.trim();
    const candidates: PythonCommand[] = [];
    const addCandidate = (raw: string | undefined) => {
      if (!raw?.trim()) return;
      const parsed = parseCommandLine(raw);
      if (!parsed) return;
      if (!candidates.some((item) => item.command === parsed.command && item.args.join("\0") === parsed.args.join("\0"))) {
        candidates.push(parsed);
      }
    };

    addCandidate(configured);
    if (process.platform === "win32") {
      addCandidate(path.join(root, ".venv", "Scripts", "python.exe"));
      addCandidate(path.join(root, "venv", "Scripts", "python.exe"));
      addCandidate(path.join(root, "env", "Scripts", "python.exe"));
      addCandidate("py -3");
      addCandidate("py");
      addCandidate("python");
      addCandidate("python3");
    } else {
      addCandidate(path.join(root, ".venv", "bin", "python"));
      addCandidate(path.join(root, "venv", "bin", "python"));
      addCandidate(configured || "python3");
      addCandidate("python");
    }

    const failures: string[] = [];
    for (const candidate of candidates) {
      if (looksLikeFilePath(candidate.command) && !(await fileExists(candidate.command))) {
        failures.push(`${candidate.label}: 文件不存在`);
        continue;
      }
      const result = await runCommand(candidate.command, [...candidate.args, "--version"], {
        cwd: root,
        timeoutMs: 5000,
        env: PYTHON_ENV,
      });
      if (result.exitCode === 0) {
        return candidate;
      }
      failures.push(`${candidate.label}: ${trimLog(result.stderr || result.stdout || `exit ${result.exitCode}`)}`);
    }

    throw new Error([
      "找不到可用的 Python，无法启动微信扫码或 Gateway。",
      "请在设置页把 Hermes Python 命令改成可执行路径，例如 py -3，或完整的 python.exe 路径。",
      failures.length ? `已尝试：${failures.slice(0, 6).join("；")}` : "",
    ].filter(Boolean).join(" "));
  }

  private async gatewayCliStatus() {
    const root = await this.resolveHermesRoot();
    const python = await this.resolvePythonCommand(root);
    const result = await runCommand(python.command, [...python.args, path.join(root, "hermes"), "gateway", "status"], {
      cwd: root,
      timeoutMs: 10000,
      env: PYTHON_ENV,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      message: result.stdout.trim() || result.stderr.trim() || `gateway status exit ${result.exitCode}`,
    };
  }

  private envPath() {
    return path.join(os.homedir(), ".hermes", ".env");
  }

  private configPath() {
    return path.join(this.appPaths.baseDir(), "connectors-config.json");
  }

  private async readConfig(): Promise<StoredConnectorConfig> {
    const raw = await fs.readFile(this.configPath(), "utf8").catch(() => "");
    if (!raw) return { platforms: {} };
    try {
      const parsed = JSON.parse(raw) as StoredConnectorConfig;
      return { platforms: parsed.platforms ?? {} };
    } catch {
      return { platforms: {} };
    }
  }

  private async writeConfig(config: StoredConnectorConfig) {
    await fs.mkdir(path.dirname(this.configPath()), { recursive: true });
    await fs.writeFile(this.configPath(), JSON.stringify(config, null, 2), "utf8");
  }

  private async readEnvValues() {
    const raw = await fs.readFile(this.envPath(), "utf8").catch(() => "");
    const values: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index <= 0) continue;
      values[trimmed.slice(0, index).trim()] = unquoteEnv(trimmed.slice(index + 1).trim());
    }
    return values;
  }

  private async backupEnv(existing: string) {
    if (!existing) return;
    const backupDir = path.join(path.dirname(this.envPath()), ".hermes-workbench-backups");
    await fs.mkdir(backupDir, { recursive: true });
    await fs.writeFile(path.join(backupDir, `.env.${Date.now()}.bak`), existing, "utf8");
  }
}

function platform(
  id: HermesConnectorPlatformId,
  label: string,
  category: HermesConnectorPlatform["category"],
  description: string,
  fields: HermesConnectorField[],
  setupHelp: string[],
): HermesConnectorPlatform {
  return { id, label, category, description, fields, setupHelp };
}

function text(key: string, envVar: string, label: string, required = false, placeholder?: string): HermesConnectorField {
  return { key, envVar, label, type: "text", required, placeholder };
}

function url(key: string, envVar: string, label: string, required = false, placeholder?: string): HermesConnectorField {
  return { key, envVar, label, type: "url", required, placeholder };
}

function password(key: string, envVar: string, label: string, required = false, placeholder?: string): HermesConnectorField {
  return { key, envVar, label, type: "password", required, secret: true, placeholder };
}

function bool(key: string, envVar: string, label: string, required = false): HermesConnectorField {
  return { key, envVar, label, type: "boolean", required };
}

function number(key: string, envVar: string, label: string, required = false, placeholder?: string): HermesConnectorField {
  return { key, envVar, label, type: "number", required, placeholder };
}

function platformById(id: HermesConnectorPlatformId) {
  const platform = PLATFORM_REGISTRY.find((item) => item.id === id);
  if (!platform) throw new Error(`未知连接器平台：${id}`);
  return platform;
}

function secretRef(platformId: HermesConnectorPlatformId, fieldKey: string) {
  return `connector.${platformId}.${fieldKey}`;
}

function connectorStatus(enabled: boolean, configured: boolean, gateway: HermesGatewayStatus): HermesConnectorStatus {
  if (!enabled) return "disabled";
  if (!configured) return "unconfigured";
  if (gateway.running) return "running";
  if (gateway.lastError && !gateway.running) return "error";
  return "configured";
}

function statusMessage(status: HermesConnectorStatus, missing: string[]) {
  if (status === "disabled") return "已禁用，不会同步到 Hermes .env。";
  if (status === "unconfigured") return `缺少必填配置：${missing.join("、")}`;
  if (status === "running") return "已配置，Gateway 正在运行。";
  if (status === "error") return "已配置，但 Gateway 最近报告错误。";
  return "已配置，等待同步或启动 Gateway。";
}

function parseBoolean(value: unknown) {
  return String(value ?? "").trim().toLowerCase() === "true" || String(value ?? "").trim() === "1" || String(value ?? "").trim().toLowerCase() === "yes";
}

function quoteEnv(value: string) {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function unquoteEnv(value: string) {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return value;
}

export function removeManagedBlock(content: string) {
  const start = content.indexOf(MANAGED_START);
  if (start === -1) return content;
  const end = content.indexOf(MANAGED_END, start);
  if (end === -1) return content.slice(0, start).trimEnd();
  return `${content.slice(0, start)}${content.slice(end + MANAGED_END.length)}`.trimEnd();
}

function trimLog(value: string) {
  const text = value.trim();
  return text.length > 6000 ? text.slice(text.length - 6000) : text;
}

function parseCommandLine(raw: string): PythonCommand | undefined {
  const parts = raw.match(/"[^"]+"|'[^']+'|\S+/g)?.map((part) => part.replace(/^["']|["']$/g, "")) ?? [];
  const command = parts.shift()?.trim();
  if (!command) return undefined;
  return {
    command,
    args: parts,
    label: [command, ...parts].join(" "),
  };
}

function looksLikeFilePath(value: string) {
  return path.isAbsolute(value) || value.includes("\\") || value.includes("/");
}

async function fileExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function sanitizeSensitiveLog(value: string) {
  return value
    .replace(/(WEIXIN_TOKEN|bot_token|WEIXIN_QR_RESULT)\s*[:=]\s*["']?[^"'\s,}]+/gi, "$1=<redacted>")
    .replace(/("token"\s*:\s*")[^"]+(")/gi, "$1<redacted>$2")
    .replace(/("bot_token"\s*:\s*")[^"]+(")/gi, "$1<redacted>$2");
}

function isWeixinQrTerminal(phase: WeixinQrLoginStatus["phase"]) {
  return phase === "success" || phase === "failed" || phase === "cancelled";
}

export function parseWeixinQrEvent(line: string): WeixinQrEvent | undefined {
  if (!line.trim().startsWith("{")) return undefined;
  let payload: unknown;
  try {
    payload = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  if (record.type === "qr" && typeof record.qrUrl === "string" && record.qrUrl.trim()) {
    return {
      type: "qr",
      qrUrl: record.qrUrl,
      expiresAt: typeof record.expiresAt === "string" ? record.expiresAt : undefined,
      message: typeof record.message === "string" ? record.message : undefined,
    };
  }
  if (record.type === "phase" && typeof record.phase === "string" && isWeixinQrPhase(record.phase)) {
    return {
      type: "phase",
      phase: record.phase,
      message: typeof record.message === "string" ? record.message : undefined,
    };
  }
  if (record.type === "confirmed" && typeof record.accountId === "string" && typeof record.token === "string") {
    return {
      type: "confirmed",
      accountId: record.accountId,
      token: record.token,
      baseUrl: typeof record.baseUrl === "string" ? record.baseUrl : undefined,
      userId: typeof record.userId === "string" ? record.userId : undefined,
    };
  }
  if (record.type === "error") {
    return {
      type: "error",
      code: typeof record.code === "string" ? record.code : undefined,
      message: typeof record.message === "string" ? record.message : undefined,
    };
  }
  return undefined;
}

function isWeixinQrPhase(value: string): value is WeixinQrLoginStatus["phase"] {
  return [
    "idle",
    "fetching_qr",
    "waiting_scan",
    "waiting_confirm",
    "saving",
    "syncing",
    "starting_gateway",
    "success",
    "failed",
    "cancelled",
  ].includes(value);
}

async function killProcessTree(pid: number) {
  if (process.platform === "win32") {
    await runCommand("taskkill", ["/pid", String(pid), "/t", "/f"], {
      cwd: process.cwd(),
      timeoutMs: 10000,
    });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Process already exited.
  }
}

export const testOnly = {
  PLATFORM_REGISTRY,
  parseCommandLine,
  parseWeixinQrEvent,
  removeManagedBlock,
};
