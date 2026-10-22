#!/usr/bin/env python3
import sys
import select
import json
import os

def fmt_tokens(n):
    if n >= 1000000:
        return f"{n / 1000000:.2f}M"
    elif n >= 1000:
        return f"{n / 1000:.1f}k"
    return str(n)

def get_quota_badge(data, model_name):
    quota = data.get("quota") or {}
    if not quota:
        return ""

    is_claude = "claude" in model_name.lower()
    if is_claude:
        weekly = quota.get("3p-weekly", {}).get("remaining_fraction")
        short = quota.get("3p-5h", {}).get("remaining_fraction")
    else:
        weekly = quota.get("gemini-weekly", {}).get("remaining_fraction")
        short = quota.get("gemini-5h", {}).get("remaining_fraction")

    candidates = [f for f in [weekly, short] if f is not None]
    if not candidates:
        return ""

    min_frac = min(candidates)
    pct = int(round(min_frac * 100))
    if pct > 50:
        q_color = "\033[32m"
    elif pct >= 20:
        q_color = "\033[33m"
    else:
        q_color = "\033[1;31m"
    reset = "\033[0m"
    return f" {q_color}[Q: {pct}%]{reset}"

def main():
    session_id = None
    model_name = "Gemini"
    max_tokens = 1000000
    max_label = "1M"

    # Read stdin non-blocking if provided by agy
    raw = None
    if not sys.stdin.isatty():
        try:
            r, _, _ = select.select([sys.stdin], [], [], 0.05)
            if r:
                raw = sys.stdin.read()
        except Exception:
            pass

    transcript_path = None
    data = {}
    if raw and raw.strip():
        try:
            data = json.loads(raw)
            transcript_path = data.get("transcript_path")
            session_id = data.get("conversation_id") or data.get("session_id")
            model_info = data.get("model") or data.get("model_info") or {}
            if isinstance(model_info, dict):
                model_name = model_info.get("name") or model_info.get("model") or model_info.get("id") or model_name
            elif isinstance(model_info, str):
                model_name = model_info
        except Exception:
            pass

    # Context window limits from agy payload or fallback by model name
    cw = data.get("context_window") or {}
    cw_size = cw.get("context_window_size")
    if cw_size and cw_size > 0:
        max_tokens = cw_size
        if max_tokens >= 1000000:
            max_label = f"{round(max_tokens / 1000000)}M"
        elif max_tokens >= 1000:
            max_label = f"{round(max_tokens / 1000)}k"
        else:
            max_label = str(max_tokens)
    elif "claude" in model_name.lower():
        max_tokens = 200000
        max_label = "200k"
    else:
        max_tokens = 1000000
        max_label = "1M"

    # 1. Primary source: read directly from agy payload
    total_tokens = 0
    cached_tokens = 0
    if cw:
        total_tokens = cw.get("total_input_tokens", 0)
        curr = cw.get("current_usage") or {}
        cached_tokens = curr.get("cache_read_input_tokens", 0)
        if not total_tokens:
            total_tokens = curr.get("input_tokens", 0) + cached_tokens

    # 2. Secondary source: read current session transcript on disk
    if total_tokens == 0 and session_id:
        candidates = []
        if transcript_path:
            candidates.append(transcript_path)
            if "/antigravity/brain/" in transcript_path:
                candidates.append(transcript_path.replace("/antigravity/brain/", "/antigravity-cli/brain/"))
        home = os.path.expanduser("~")
        candidates.append(os.path.join(home, f".gemini/antigravity-cli/brain/{session_id}/.system_generated/logs/transcript.jsonl"))

        for c in candidates:
            if os.path.exists(c):
                try:
                    with open(c, "rb") as f:
                        size = os.path.getsize(c)
                        f.seek(max(0, size - 65536))
                        lines = f.read().decode("utf-8", errors="ignore").splitlines()
                        for line in reversed(lines):
                            if "input_tokens" in line or "cache_read_tokens" in line:
                                d = json.loads(line)
                                inp = d.get("input_tokens", 0)
                                cache = d.get("cache_read_tokens", 0)
                                total_tokens = inp + cache
                                cached_tokens = cache
                                if total_tokens > 0:
                                    break
                    if total_tokens > 0:
                        break
                except Exception:
                    pass

    pct = (total_tokens / max_tokens) * 100 if max_tokens else 0

    # Color threshold: Cyan (<60%), Yellow (60-80%), Red (>=80%)
    if pct < 60:
        color = "\033[36m"
    elif pct < 80:
        color = "\033[33m"
    else:
        color = "\033[1;31m"
    reset = "\033[0m"

    used_str = fmt_tokens(total_tokens)
    parts = [f"{used_str}/{max_label}", f"{pct:.1f}%"]
    if cached_tokens > 0:
        parts.append(f"{fmt_tokens(cached_tokens)} cache")
    inner = " · ".join(parts)
    main_badge = f"{color}[{inner}]{reset}"

    # 200k threshold warning for long contexts
    alert_badge = ""
    exceeds_200k = data.get("exceeds_200k_tokens", False) or (max_tokens > 200000 and total_tokens >= 200000)
    if exceeds_200k:
        alert_badge = f" \033[1;33m[!>200k /compact]{reset}"

    # Model quota badge
    quota_badge = get_quota_badge(data, model_name)

    print(f"{main_badge}{alert_badge}{quota_badge}")

if __name__ == "__main__":
    main()
