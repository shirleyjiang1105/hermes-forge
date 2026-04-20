#!/usr/bin/env python3
"""Hermes Workbench Windows MCP bridge.

This small stdio MCP server exposes the Electron Windows Control Bridge as
native Hermes MCP tools. It has no third-party dependencies so it can run from
both Windows Python and WSL Python.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, List


FALLBACK_TOOLS: List[Dict[str, Any]] = [
    {"name": "windows.files.listDir", "description": "List a Windows directory.", "input": {"path": "Windows directory path"}},
    {"name": "windows.files.readText", "description": "Read a UTF-8 text file from Windows.", "input": {"path": "Windows file path"}},
    {"name": "windows.files.writeText", "description": "Create or overwrite a UTF-8 text file on Windows.", "input": {"path": "Windows file path", "content": "Text content"}},
    {"name": "windows.files.exists", "description": "Check whether a Windows path exists.", "input": {"path": "Windows path"}},
    {"name": "windows.files.delete", "description": "Delete a Windows file or directory.", "input": {"path": "Windows path", "recursive": "true for recursive directory delete"}},
    {"name": "windows.shell.openPath", "description": "Open a Windows file or folder with the default shell.", "input": {"path": "Windows file or folder path"}},
    {"name": "windows.clipboard.read", "description": "Read Windows clipboard text.", "input": {}},
    {"name": "windows.clipboard.write", "description": "Write Windows clipboard text.", "input": {"text": "Clipboard text"}},
    {"name": "windows.powershell.run", "description": "Run a PowerShell script on native Windows.", "input": {"script": "PowerShell script", "timeoutMs": "Optional timeout in milliseconds"}},
    {"name": "windows.screenshot.capture", "description": "Capture the primary Windows screen.", "input": {}},
    {"name": "windows.windows.list", "description": "List visible Windows desktop windows.", "input": {}},
    {"name": "windows.windows.focus", "description": "Focus a window by title using AutoHotkey.", "input": {"title": "Window title substring"}},
    {"name": "windows.windows.close", "description": "Close a window by title using AutoHotkey.", "input": {"title": "Window title substring"}},
    {"name": "windows.keyboard.type", "description": "Type text into the active Windows window using AutoHotkey.", "input": {"text": "Text to type"}},
    {"name": "windows.keyboard.pressHotkey", "description": "Send a hotkey to Windows using AutoHotkey syntax.", "input": {"hotkey": "AutoHotkey hotkey string, for example ^s"}},
    {"name": "windows.mouse.click", "description": "Click Windows screen coordinates.", "input": {"x": "Screen x coordinate", "y": "Screen y coordinate"}},
    {"name": "windows.mouse.move", "description": "Move the Windows mouse pointer.", "input": {"x": "Screen x coordinate", "y": "Screen y coordinate"}},
    {"name": "windows.ahk.runScript", "description": "Run an AutoHotkey v2 script.", "input": {"script": "AutoHotkey v2 script"}},
    {"name": "windows.system.getDesktopPath", "description": "Return the current Windows desktop path.", "input": {}},
    {"name": "windows.system.getKnownFolders", "description": "Return common Windows known folders.", "input": {}},
]


def _alias(tool_name: str) -> str:
    return "".join(ch if ch.isalnum() or ch == "_" else "_" for ch in tool_name)


def _bridge_url() -> str:
    return os.environ.get("HERMES_WINDOWS_BRIDGE_URL", "").rstrip("/")


def _bridge_token() -> str:
    return os.environ.get("HERMES_WINDOWS_BRIDGE_TOKEN", "")


def _request(method: str, path: str, body: Dict[str, Any] | None = None) -> Dict[str, Any]:
    url = f"{_bridge_url()}{path}"
    if not _bridge_url() or not _bridge_token():
        return {"ok": False, "message": "HERMES_WINDOWS_BRIDGE_URL or TOKEN is missing."}
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Authorization", f"Bearer {_bridge_token()}")
    if body is not None:
        request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        text = error.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            payload = {"message": text}
        return {"ok": False, "status": error.code, **payload}
    except Exception as error:  # noqa: BLE001 - returned to Hermes as tool result
        return {"ok": False, "message": str(error)}


def _manifest() -> List[Dict[str, Any]]:
    payload = _request("GET", "/v1/manifest")
    tools = payload.get("tools")
    return tools if isinstance(tools, list) else FALLBACK_TOOLS


def _tool_schema(tool: Dict[str, Any]) -> Dict[str, Any]:
    properties: Dict[str, Any] = {}
    for key, description in (tool.get("input") or {}).items():
        value_type = "number" if key in {"x", "y", "timeoutMs"} else "boolean" if key == "recursive" else "string"
        properties[key] = {"type": value_type, "description": str(description)}
    return {
        "name": _alias(str(tool["name"])),
        "description": f"{tool.get('description', '')} Bridge tool: {tool['name']}",
        "inputSchema": {
            "type": "object",
            "properties": properties,
            "additionalProperties": True,
        },
    }


def _tools_list() -> Dict[str, Any]:
    return {"tools": [_tool_schema(tool) for tool in _manifest() if "name" in tool]}


def _tools_call(params: Dict[str, Any]) -> Dict[str, Any]:
    requested = str(params.get("name") or "")
    arguments = params.get("arguments") or {}
    if not isinstance(arguments, dict):
        arguments = {}
    original_name = requested
    for tool in _manifest():
        name = str(tool.get("name") or "")
        if _alias(name) == requested:
            original_name = name
            break
    result = _request("POST", "/v1/tool", {"tool": original_name, "input": arguments})
    return {
        "content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}],
        "isError": not bool(result.get("ok")),
    }


def _handle(message: Dict[str, Any]) -> Dict[str, Any] | None:
    method = message.get("method")
    if method == "notifications/initialized":
        return None
    if method == "initialize":
        return {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "hermes-windows-control-bridge", "version": "0.1.0"},
        }
    if method == "tools/list":
        return _tools_list()
    if method == "tools/call":
        return _tools_call(message.get("params") or {})
    return {"error": {"code": -32601, "message": f"Unknown method: {method}"}}


def _send(payload: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def main() -> int:
    for raw in sys.stdin:
        try:
            message = json.loads(raw)
            result = _handle(message)
            if "id" not in message or result is None:
                continue
            if "error" in result and len(result) == 1:
                _send({"jsonrpc": "2.0", "id": message["id"], "error": result["error"]})
            else:
                _send({"jsonrpc": "2.0", "id": message["id"], "result": result})
        except Exception as error:  # noqa: BLE001 - MCP protocol error response
            request_id = None
            try:
                request_id = json.loads(raw).get("id")
            except Exception:
                pass
            _send({"jsonrpc": "2.0", "id": request_id, "error": {"code": -32603, "message": str(error)}})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
