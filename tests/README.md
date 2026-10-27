# Tab guide checks

`tab-guide.cjs` runs browser checks against the standalone HTML opened from disk.
The app itself has no dependencies; these checks use Node.js and Playwright.

If Playwright and its Chromium browser are installed, run:

```text
node tests/tab-guide.cjs
```

You can also use an existing Playwright installation and a local Chrome executable.
For example, in PowerShell, set these to their full paths before running the check:

```powershell
$env:PLAYWRIGHT_MODULE = 'C:\path\to\node_modules\playwright'
$env:BROWSER_EXECUTABLE = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests/tab-guide.cjs
```

Optionally set `SCREENSHOT_DIR` to save desktop and mobile screenshots. The checks
use synthetic sessions, including a mozLz4 file, and a mocked clipboard. They do
not connect to a running Firefox profile or close real browser tabs. Firefox's
address-bar search still needs a manual check in Firefox.

Coverage includes snapshot timestamps and counts, explicit replacement imports,
canceled/invalid imports, empty snapshots, local review persistence, clipboard
fallbacks, keyboard navigation, and responsive layouts. A synthetic 2,000-tab
snapshot verifies that review changes preserve existing row elements and reports
the synchronous time spent on one review toggle.
