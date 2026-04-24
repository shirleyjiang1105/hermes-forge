#!/usr/bin/env python3
import json
import os
import signal
import subprocess
import sys
import threading
import time


current_process = None
current_lock = threading.Lock()


def emit(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def stop_current():
    with current_lock:
        proc = current_process
    if proc and proc.poll() is None:
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass


def handle_signal(_signum, _frame):
    stop_current()
    sys.exit(0)


signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)


def pump_stream(stream, request_id, stream_type):
    try:
        for line in iter(stream.readline, ""):
            text = line.rstrip("\r\n")
            if text:
                emit({"id": request_id, "type": stream_type, "line": text})
    finally:
        try:
            stream.close()
        except Exception:
            pass


def run_request(request):
    global current_process
    request_id = request.get("id")
    cwd = request.get("cwd") or request.get("rootPath") or os.getcwd()
    args = request.get("args") or []
    env_input = request.get("env") or {}
    timeout_ms = int(request.get("timeoutMs") or 600000)
    if not request_id or not isinstance(args, list) or not args:
        emit({"id": request_id, "type": "error", "message": "Invalid worker request."})
        return

    env = os.environ.copy()
    for key, value in env_input.items():
        if isinstance(key, str) and isinstance(value, str):
            env[key] = value

    started_at = time.time()
    emit({"id": request_id, "type": "started"})
    try:
        proc = subprocess.Popen(
            args,
            cwd=cwd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
        with current_lock:
            current_process = proc
        stdout_thread = threading.Thread(target=pump_stream, args=(proc.stdout, request_id, "stdout"), daemon=True)
        stderr_thread = threading.Thread(target=pump_stream, args=(proc.stderr, request_id, "stderr"), daemon=True)
        stdout_thread.start()
        stderr_thread.start()
        try:
            exit_code = proc.wait(timeout=max(1, timeout_ms / 1000))
        except subprocess.TimeoutExpired:
            stop_current()
            emit({"id": request_id, "type": "error", "message": f"Worker request timed out after {timeout_ms}ms."})
            return
        stdout_thread.join(timeout=1)
        stderr_thread.join(timeout=1)
        emit({"id": request_id, "type": "exit", "exitCode": exit_code, "durationMs": int((time.time() - started_at) * 1000)})
    except Exception as error:
        emit({"id": request_id, "type": "error", "message": str(error)})
    finally:
        with current_lock:
            current_process = None


def main():
    emit({"type": "ready", "pid": os.getpid()})
    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except Exception as error:
            emit({"type": "error", "message": f"Invalid JSON request: {error}"})
            continue
        if request.get("type") == "shutdown":
            stop_current()
            emit({"type": "exit", "exitCode": 0})
            return
        run_request(request)


if __name__ == "__main__":
    main()
