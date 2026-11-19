#!/usr/bin/env python3
"""
Turn an Artillery JSON result (artillery run --output results/x.json) into markdown tables for docs/.

    python3 load-tests/summarise.py load-tests/results/local-read.json
    python3 load-tests/summarise.py --timeline load-tests/results/cloud-stress.json

Prints: totals (users, requests, errors, status codes, throughput) and response times overall and per named
request (median, p95, p99, max in milliseconds). --timeline adds one row per 10-second window, which shows
where latency bends and errors start as the load steps up. Only reads the file; standard library only.
"""

import json
import sys
from datetime import UTC, datetime

ENDPOINT = "plugins.metrics-by-endpoint.response_time."


def ms(value) -> str:
    return "—" if value is None else f"{round(value):,}"


def summarise(path: str) -> str:
    with open(path) as f:
        report = json.load(f)["aggregate"]
    counters, summaries = report["counters"], report["summaries"]
    started = datetime.fromtimestamp(report["firstMetricAt"] / 1000, UTC)
    seconds = (report["lastMetricAt"] - report["firstMetricAt"]) / 1000
    requests = counters.get("http.requests", 0)
    codes = {k.rsplit(".", 1)[1]: v for k, v in counters.items() if k.startswith("http.codes.")}
    errors = {k.split(".", 1)[1]: v for k, v in counters.items() if k.startswith("errors.")}
    created, failed = counters.get("vusers.created", 0), counters.get("vusers.failed", 0)

    lines = [
        f"Run started {started:%Y-%m-%d %H:%M} UTC, {seconds:.0f} s of traffic.",
        "",
        "| Virtual users | Failed users | Requests | Throughput | Status codes | Errors |",
        "|---|---|---|---|---|---|",
        f"| {created:,} | {failed:,} ({failed / created:.1%}) | {requests:,} | {requests / seconds:.1f} req/s | "
        f"{', '.join(f'{c}: {n:,}' for c, n in sorted(codes.items())) or '—'} | "
        f"{', '.join(f'{e}: {n:,}' for e, n in sorted(errors.items())) or 'none'} |",
        "",
        "| Request | Count | Median (ms) | p95 (ms) | p99 (ms) | Max (ms) |",
        "|---|---|---|---|---|---|",
    ]
    rows = [("**All requests**", summaries.get("http.response_time", {}))]
    rows += sorted((k[len(ENDPOINT):], v) for k, v in summaries.items() if k.startswith(ENDPOINT))
    for name, s in rows:
        lines.append(f"| {name} | {s.get('count', 0):,} | {ms(s.get('median'))} | {ms(s.get('p95'))} | "
                     f"{ms(s.get('p99'))} | {ms(s.get('max'))} |")
    return "\n".join(lines)


def timeline(path: str) -> str:
    """One row per 10-second window: elapsed time, request rate, latency percentiles, errors and 4xx/5xx."""
    with open(path) as f:
        report = json.load(f)
    start = report["aggregate"]["firstMetricAt"]
    lines = ["| Time (s) | New users/s | Requests/s | Median (ms) | p95 (ms) | p99 (ms) | 4xx | 5xx | Errors |",
             "|---|---|---|---|---|---|---|---|---|"]
    for window in sorted(report["intermediate"], key=lambda w: w["firstMetricAt"]):
        counters, times = window["counters"], window["summaries"].get("http.response_time", {})
        seconds = max((window["lastMetricAt"] - window["firstMetricAt"]) / 1000, 1)
        codes = {k.rsplit(".", 1)[1]: v for k, v in counters.items() if k.startswith("http.codes.")}
        errors = sum(v for k, v in counters.items() if k.startswith("errors."))
        lines.append(
            f"| {(window['firstMetricAt'] - start) / 1000:.0f} | {counters.get('vusers.created', 0) / seconds:.1f} | "
            f"{counters.get('http.requests', 0) / seconds:.1f} | {ms(times.get('median'))} | {ms(times.get('p95'))} | "
            f"{ms(times.get('p99'))} | {sum(v for c, v in codes.items() if c.startswith('4'))} | "
            f"{sum(v for c, v in codes.items() if c.startswith('5'))} | {errors} |")
    return "\n".join(lines)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--timeline"]
    if len(args) != 1:
        sys.exit("usage: summarise.py [--timeline] <artillery-result.json>")
    print(summarise(args[0]))
    if "--timeline" in sys.argv:
        print()
        print(timeline(args[0]))
