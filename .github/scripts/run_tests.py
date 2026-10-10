"""Runs the browser test page (tests/index.html) in Chrome and reports the result.

Used by the GitHub Actions workflow; you can also run it by hand:

    pip install playwright
    python .github/scripts/run_tests.py [--save-sql backup-sample.sql]

It serves the repository on a free local port, opens tests/index.html?run=all,
waits for the page to say it is done, prints each suite, and exits non-zero if
any check failed. Chrome is found by Playwright ("chrome" channel); set
CHROME_PATH to use a specific executable instead.
"""
import argparse
import functools
import http.server
import os
import pathlib
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
TIMEOUT_MS = 15 * 60 * 1000


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve():
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--save-sql', help='write the sample backup (.sql) the SQL suite produced to this path')
    args = parser.parse_args()

    server = serve()
    base = f'http://127.0.0.1:{server.server_address[1]}'
    print(f'Serving {ROOT} at {base}')

    with sync_playwright() as p:
        executable = os.environ.get('CHROME_PATH')
        browser = p.chromium.launch(executable_path=executable) if executable else p.chromium.launch(channel='chrome')
        page = browser.new_page(viewport={'width': 1500, 'height': 1000})
        page.route('**/fonts.googleapis.com/**', lambda route: route.abort())
        page.route('**/fonts.gstatic.com/**', lambda route: route.abort())
        page.goto(f'{base}/tests/index.html?run=all')
        page.wait_for_function('window.__testResults && window.__testResults.done', timeout=TIMEOUT_MS, polling=1000)
        result = page.evaluate('window.__testResults')

        if args.save_sql:
            text = page.evaluate(
                """async () => {
                    const link = document.querySelector('#artifacts a')
                    return link ? (await fetch(link.href)).text() : null
                }"""
            )
            if text:
                pathlib.Path(args.save_sql).write_text(text, encoding='utf-8')
                print(f'Saved the sample backup to {args.save_sql}')
            else:
                print('The SQL suite produced no sample file', file=sys.stderr)
        browser.close()

    server.shutdown()
    print()
    for suite in result['suites']:
        print(f"  {suite['name']:<14} {suite['passed']:>4} passed  {suite['failed']:>3} failed  {suite['skipped']:>3} skipped")
        for failure in suite.get('failures', []):
            print(f"      FAIL {failure['name']}  ::  {str(failure['detail'])[:300]}")
    print(f"\n{result['passed']} passed, {result['failed']} failed, {result['skipped']} skipped")
    return 1 if result['failed'] else 0


if __name__ == '__main__':
    sys.exit(main())
