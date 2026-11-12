"""Probe the configured browser engine against live fingerprint detectors.

    python scripts/fortress_probe.py --user-id test-user --out /tmp/probe.json
    python scripts/fortress_probe.py --engine playwright   # baseline

Uses the production launch path, so results reflect what real applies see.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.browser.engine import create_context, launch_browser, new_stealth_page  # noqa: E402
from app.config import settings  # noqa: E402

NATIVE_CHECK = """
() => {
  const out = {};
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  const foreignToString = frame.contentWindow.Function.prototype.toString;
  out.webdriver = navigator.webdriver;
  out.plugins = navigator.plugins.length;
  out.mimeTypes = navigator.mimeTypes.length;
  out.ua = navigator.userAgent;
  out.platform = navigator.platform;
  out.languages = navigator.languages;
  out.cores = navigator.hardwareConcurrency;
  out.memory = navigator.deviceMemory;
  out.tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  out.chromeRuntime = typeof window.chrome?.runtime;
  try {
    const getter = navigator.__lookupGetter__('webdriver');
    out.webdriverNative = getter ? foreignToString.call(getter).includes('[native code]') : null;
  } catch (e) { out.webdriverNative = 'error'; }
  try {
    const desc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver');
    out.webdriverDescriptor = desc ? foreignToString.call(desc.get).includes('[native code]') : null;
  } catch (e) { out.webdriverDescriptor = 'error'; }
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    out.webglVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
    out.webglRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
    out.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  } catch (e) { out.webglRenderer = 'error'; }
  try {
    const c = document.createElement('canvas');
    c.width = 200; c.height = 40;
    const ctx = c.getContext('2d');
    ctx.fillText('applyso-fortress-probe', 2, 20);
    out.canvas = c.toDataURL().slice(-48);
  } catch (e) { out.canvas = 'error'; }
  frame.remove();
  return out;
}
"""

SANNY_TALLY = """
() => {
  const rows = [...document.querySelectorAll('table tr')];
  const failed = rows.filter(r => /failed/i.test(r.innerText));
  return {
    rows: rows.length,
    failed: failed.length,
    failedLabels: failed.map(r => r.innerText.split('\\n')[0]).slice(0, 12),
  };
}
"""

BROWSERSCAN_TALLY = """
() => {
  const text = document.body.innerText;
  return {
    verdict: /no bots detected/i.test(text) ? 'normal'
      : /bot/i.test(text) ? 'flagged' : 'unknown',
    mentionsHeadless: /headless/i.test(text),
  };
}
"""

DETECTORS = [
    {"name": "sannysoft", "url": "https://bot.sannysoft.com/", "script": SANNY_TALLY},
    {"name": "browserscan", "url": "https://www.browserscan.net/bot-detection", "script": BROWSERSCAN_TALLY},
]


async def run(engine_name: str, user_id: str | None) -> dict:
    settings.apply_browser_engine = engine_name
    report: dict = {"engine": engine_name, "user_id": user_id, "detectors": {}}

    async with launch_browser(headless=True, user_id=user_id) as browser:
        report["browser_version"] = browser.version
        context = await create_context(browser)
        page = await new_stealth_page(context)

        await page.goto("https://example.com", wait_until="domcontentloaded")
        report["native"] = await page.evaluate(NATIVE_CHECK)

        for detector in DETECTORS:
            entry: dict = {"url": detector["url"]}
            try:
                await page.goto(detector["url"], wait_until="domcontentloaded", timeout=45_000)
                await page.wait_for_timeout(3500)
                entry["result"] = await page.evaluate(detector["script"])
            except Exception as error:
                entry["error"] = f"{type(error).__name__}: {error}"[:300]
            report["detectors"][detector["name"]] = entry

    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", default=settings.apply_browser_engine)
    parser.add_argument("--user-id", default="probe-user")
    parser.add_argument("--out", default="")
    args = parser.parse_args()

    report = asyncio.run(run(args.engine, args.user_id))
    text = json.dumps(report, indent=2)
    print(text)
    if args.out:
        Path(args.out).write_text(text)
        print(f"\nwritten: {args.out}")


if __name__ == "__main__":
    main()
