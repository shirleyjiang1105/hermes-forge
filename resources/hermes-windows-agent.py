#!/usr/bin/env python3
"""
Hermes Windows Agent Runner for Forge

职责：在 Windows 侧启动 AIAgent，通过 JSON Lines stdout 与 Forge 实时通信。
不拼接 prompt、不管理 session、不处理 Windows 桥接 —— 这些全部是 Hermes 自己的职责。

事件协议（JSON Lines，每行一个事件，用 __FORGE_EVENT__...__FORGE_EVENT_END__ 包裹）：
  {"type": "lifecycle", "stage": "started", ...}
  {"type": "tool_call", "tool": "...", "input": {...}, ...}
  {"type": "tool_result", "tool": "...", "output": "...", ...}
  {"type": "message_chunk", "content": "...", ...}
  {"type": "result", "success": true, "content": "...", ...}
  {"type": "error", "message": "...", "error_type": "...", ...}
"""

from __future__ import annotations

import argparse
import base64
import json
import logging
import mimetypes
import os
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path


EVENT_START = "__FORGE_EVENT__"
EVENT_END = "__FORGE_EVENT_END__"


def emit(event_type: str, payload: dict) -> None:
    """向 Forge 发送结构化事件。"""
    event = {
        "type": event_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **payload,
    }
    line = json.dumps(event, ensure_ascii=False)
    print(f"{EVENT_START}{line}{EVENT_END}", flush=True)


def _stderr(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def _provider_from_env() -> str:
    provider = (
        os.environ.get("HERMES_INFERENCE_PROVIDER")
        or os.environ.get("AI_PROVIDER")
        or ""
    ).strip().lower()
    if provider == "openai":
        return "openrouter"
    return provider or "auto"


def _api_key_from_env() -> str:
    for key in (
        "AI_API_KEY",
        "OPENAI_API_KEY",
        "OPENROUTER_API_KEY",
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_TOKEN",
    ):
        value = os.environ.get(key, "").strip()
        if value:
            return value
    return ""


def _base_url_from_env() -> str:
    for key in ("AI_BASE_URL", "OPENAI_BASE_URL", "OPENROUTER_BASE_URL", "ANTHROPIC_BASE_URL"):
        value = os.environ.get(key, "").strip()
        if value:
            return value
    return ""


def _model_from_env() -> str:
    return (os.environ.get("AI_MODEL") or os.environ.get("OPENAI_MODEL") or "").strip()


def _prepare_user_message(query: str, image_path: str | None):
    if not image_path:
        return query
    path = Path(image_path)
    mime = mimetypes.guess_type(path.name)[0] or "image/png"
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return [
        {"type": "text", "text": query},
        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{data}"}},
    ]


def _try_install_stream_hooks() -> None:
    """
    尝试 monkey-patch Hermes 内部来捕获工具调用事件。
    如果 Hermes 的 AIAgent 本身不支持流式回调，这是 Plan B。
    由于我们不知道 Hermes 内部结构，这里先预留扩展点。
    后续可以通过 inspect run_agent 模块来找到可 patch 的目标。
    """
    try:
        import run_agent as ra
        # 尝试找到 Agent 类中的工具执行方法
        agent_cls = getattr(ra, "AIAgent", None)
        if agent_cls is None:
            return

        # 如果 AIAgent 有 run_conversation_generator 或类似方法，优先使用
        if hasattr(agent_cls, "run_conversation_stream"):
            # 原生支持流式，不需要 patch
            return

        # 尝试 patch 工具调用
        original_run_conversation = getattr(agent_cls, "run_conversation", None)
        if original_run_conversation is None:
            return

        # 尝试找到工具执行相关的内部方法
        # Hermes AIAgent 中实际的方法名：_invoke_tool / _execute_tool_calls / _execute_tool_calls_concurrent
        for attr_name in ("_invoke_tool", "_execute_tool", "execute_tool", "_run_tool", "run_tool", "_call_tool", "call_tool"):
            if hasattr(agent_cls, attr_name):
                _patch_tool_method(agent_cls, attr_name)
                break
    except Exception:
        # Patch 失败不影响主流程
        pass


def _patch_tool_method(agent_cls, method_name: str) -> None:
    """Patch AIAgent 的工具执行方法来 emit 事件。"""
    original = getattr(agent_cls, method_name)

    def patched(self, *args, **kwargs):
        # 尝试提取 tool_name 和 input
        tool_name = _extract_tool_name(args, kwargs)
        tool_input = _extract_tool_input(args, kwargs)

        session_id = getattr(self, "session_id", None)
        emit("tool_call", {"tool": tool_name, "input": tool_input, "session_id": session_id})

        try:
            result = original(self, *args, **kwargs)
            emit("tool_result", {
                "tool": tool_name,
                "output": _safe_preview(result),
                "session_id": session_id,
            })
            return result
        except Exception as e:
            emit("tool_result", {
                "tool": tool_name,
                "output": f"Error: {e}",
                "success": False,
                "session_id": session_id,
            })
            raise

    setattr(agent_cls, method_name, patched)


def _extract_tool_name(args, kwargs) -> str:
    # 常见的参数顺序：(self, tool_name, input_data) 或 (self, tool_name, **input_data)
    if len(args) >= 2 and isinstance(args[1], str):
        return args[1]
    return kwargs.get("tool_name") or kwargs.get("tool") or "unknown"


def _extract_tool_input(args, kwargs) -> dict:
    if len(args) >= 3 and isinstance(args[2], dict):
        return args[2]
    return {k: v for k, v in kwargs.items() if k not in ("tool_name", "tool")}


def _safe_preview(value, max_len: int = 500) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value
        if len(text) > max_len:
            return text[:max_len] + "..."
        return text
    except Exception:
        return str(value)[:max_len]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root-path", required=True, help="Hermes 安装根目录")
    parser.add_argument("--query", required=True, help="用户查询")
    parser.add_argument("--system-prompt", default="", help="系统提示词")
    parser.add_argument("--session-id", help="会话 ID")
    parser.add_argument("--image-path", help="图片附件路径")
    parser.add_argument("--source", default="hermes-forge-desktop", help="调用来源标识")
    parser.add_argument("--max-turns", type=int, default=90, help="最大对话轮数")
    args = parser.parse_args()

    root = Path(args.root_path).resolve()
    sys.path.insert(0, str(root))
    os.environ["PYTHONPATH"] = os.pathsep.join([
        str(root),
        os.environ.get("PYTHONPATH", ""),
    ]).strip(os.pathsep)

    logging.disable(logging.CRITICAL)

    try:
        from run_agent import AIAgent
    except ImportError as e:
        emit("error", {
            "message": f"无法从 {root} 导入 run_agent.AIAgent: {e}",
            "error_type": "ImportError",
            "session_id": args.session_id,
        })
        return 1

    # 尝试安装流式钩子（如果 Hermes 不支持原生流式）
    _try_install_stream_hooks()

    emit("lifecycle", {"stage": "started", "session_id": args.session_id})

    try:
        agent = AIAgent(
            base_url=_base_url_from_env(),
            api_key=_api_key_from_env(),
            provider=_provider_from_env(),
            model=_model_from_env(),
            max_iterations=args.max_turns,
            quiet_mode=True,
            ephemeral_system_prompt=args.system_prompt or None,
            session_id=args.session_id,
            platform=args.source,
            skip_context_files=False,
        )

        user_message = _prepare_user_message(args.query, args.image_path)
        result = agent.run_conversation(user_message)

        final_response = ""
        if isinstance(result, dict):
            final_response = str(result.get("final_response") or "")
        else:
            final_response = str(result or "")

        emit("result", {
            "success": True,
            "content": final_response,
            "session_id": args.session_id,
        })
        return 0

    except Exception as exc:
        _stderr(f"Hermes windows agent runner failed: {exc}")
        _stderr(traceback.format_exc())
        emit("error", {
            "message": str(exc),
            "error_type": type(exc).__name__,
            "traceback": traceback.format_exc(),
            "session_id": args.session_id,
        })
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
