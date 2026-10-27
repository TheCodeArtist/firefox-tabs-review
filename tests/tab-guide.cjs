// Run with Node and Playwright installed. PLAYWRIGHT_MODULE can point to an
// existing Playwright installation; BROWSER_EXECUTABLE can select local Chrome.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const fixture = {
  timestamp_utc: '20261026T123456Z',
  profiles: [{ profile: 'work.default', windows: [[
    { title: 'Project planning', url: 'https://example.org/project', container: { id: 1, name: 'Work' } },
    { title: 'Pinned reference', url: 'https://example.org/pinned', pinned: true },
    { url: 'https://example.org/untitled' },
  ], [
    { title: 'Project planning', url: 'https://example.org/project', container: { id: 2, name: 'Personal' } },
    { title: 'Project planning', url: 'https://example.org/another-project' },
  ]] }, { profile: 'personal.default', windows: [[
    { title: 'Project planning', url: 'https://example.org/project' },
  ]] }],
};

// A valid Firefox mozLz4 file with one literal-only LZ4 block.
function sessionFile(data) {
  const json = Buffer.from(JSON.stringify(data));
  const size = Buffer.alloc(4);
  size.writeUInt32LE(json.length);
  const extension = [];
  if (json.length >= 15) {
    let remaining = json.length - 15;
    while (remaining >= 255) { extension.push(255); remaining -= 255; }
    extension.push(remaining);
  }
  return Buffer.concat([Buffer.from('mozLz40\0'), size,
    Buffer.from([Math.min(15, json.length) << 4, ...extension]), json]);
}

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    const checks = [];
    const timings = {};
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__opened = [];
      window.open = (...args) => window.__opened.push(args);
      Object.defineProperty(navigator, 'clipboard', { configurable: true,
        value: { writeText: async text => { window.__copied = text; } } });
    });
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'firefox-tabs-review.html')).href);
    assert.deepEqual(await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
      return ids.filter((id, index) => ids.indexOf(id) !== index);
    }), []);
    await page.locator('#jsonInput').setInputFiles({ name: 'review-fixture.json',
      mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
    await page.locator('.tab-row').first().waitFor();
    assert.equal(await page.locator('.tab-row').count(), 6);
    const first = () => page.locator('.tab-row[data-id="1:1:1"]');
    const dialog = page.locator('#tabGuideDialog');
    assert.equal(await page.getByRole('button', { name: 'Load newer snapshot', exact: true }).isVisible(), true);
    assert.match(await page.locator('#snapshotStatus').innerText(), /Imported snapshot.*6 tabs in snapshot · 6 matching/s);
    assert.equal(await page.locator('#snapshotTime').getAttribute('datetime'), '2026-10-26T12:34:56.000Z');
    assert.match(await page.locator('#summaryStats').innerText(), /3\s+windows/);
    assert.equal(await page.getByRole('button', { name: /find.*close/i }).count(), 0);
    checks.push('persistent snapshot identity, original timestamp, explicit counts, and visible reload action');
    await page.locator('#groupBy').selectOption('flat');
    await page.locator('#searchInput').fill('no-matching-snapshot-tab');
    await page.waitForFunction(() => document.getElementById('snapshotCounts').textContent.endsWith('0 matching'));
    assert.equal(await page.locator('.tab-row').count(), 0);
    assert.equal(await page.locator('#snapshotStatus').isVisible(), true);
    assert.match(await page.locator('#snapshotCounts').innerText(), /6 tabs in snapshot · 0 matching/);
    await page.locator('#searchInput').fill('');
    await page.waitForFunction(() => document.querySelectorAll('.tab-row').length === 6);
    await page.locator('#groupBy').selectOption('window');
    checks.push('snapshot status/counts remain visible in flat and zero-match views');

    await first().getByRole('button', { name: 'Find tab:', exact: false }).click();
    assert.equal(await page.evaluate(() => window.__copied), '% Project planning');
    assert.match(await page.locator('#guideCopyStatus').innerText(), /Search copied/);
    await page.locator('#guidePlatform').selectOption('windows');
    await page.locator('#guideCopySearch').click();
    assert.equal(await page.evaluate(() => window.__copied), '% Project planning');
    assert.match(await page.locator('#guideCopyStatus').innerText(), /Search copied/);
    assert.match(await page.locator('#guideTargetMeta').innerText(), /work.default.*Window 1.*Tab 1/);
    assert.match(await page.locator('#guideDuplicateWarning').innerText(), /3 tabs/);
    assert.equal(await page.locator('#guideCloseMode, #guideCloseInstructions').count(), 0);
    assert.equal(await page.evaluate(() => window.__opened.length), 0);
    checks.push('row action copies a tab-only search without opening a new URL');

    assert.match(await page.locator('[data-guide-key="address"]').innerText(), /Ctrl\+L/);
    await page.locator('#guidePlatform').selectOption('mac');
    assert.match(await page.locator('[data-guide-key="address"]').innerText(), /Cmd\+L/);
    assert.match(await page.locator('[data-guide-key="paste"]').innerText(), /Cmd\+V/);
    await page.locator('#guideUseUrl').click();
    assert.equal(await page.evaluate(() => window.__copied), '% https://example.org/project');
    checks.push('single find guide, platform shortcuts, and URL query');

    await page.locator('#guideQuery').fill('missing prefix');
    await page.locator('#guideCopySearch').click();
    assert.match(await page.locator('#guideCopyStatus').innerText(), /Start with %/);
    await page.locator('#guideQuery').fill('% distinctive project');
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
      document.execCommand = command => { window.__legacyCopy = command; return true; };
    });
    await page.locator('#guideCopySearch').click();
    assert.equal(await page.evaluate(() => window.__legacyCopy), 'copy');
    assert.match(await page.locator('#guideCopyStatus').innerText(), /Search copied/);
    await page.evaluate(() => { document.execCommand = () => false; });
    await page.locator('#guideCopySearch').click();
    assert.match(await page.locator('#guideCopyStatus').innerText(), /Automatic copy is unavailable.*Cmd\+C/);
    assert.equal(await page.locator('#guideQuery').evaluate(el => el.value.slice(el.selectionStart, el.selectionEnd)), '% distinctive project');
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true,
        value: { writeText: async () => { throw new Error('denied'); } } });
    });
    await page.locator('#guideCopySearch').click();
    assert.match(await page.locator('#guideCopyStatus').innerText(), /Automatic copy is unavailable/);
    checks.push('invalid prefix, absent/denied clipboard, legacy success, and manual selected-text fallback');

    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true,
        value: { writeText: () => new Promise(resolve => { window.__resolveCopy = resolve; }) } });
    });
    await page.locator('#guideCopySearch').click();
    await page.locator('#guideQuery').fill('% edited while copying');
    await page.evaluate(() => window.__resolveCopy());
    assert.match(await page.locator('#guideCopyStatus').innerText(), /Search changed/);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true,
        value: { writeText: async text => { window.__copied = text; } } });
    });
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__opened.length), 0);
    checks.push('delayed copy cannot overwrite edited-query feedback; Escape dismisses guide');

    await page.locator('#containerFilter').selectOption('Work');
    assert.equal(await page.locator('.tab-row').count(), 1);
    assert.match(await page.locator('#snapshotCounts').innerText(), /6 tabs in snapshot · 1 matching/);
    await first().getByRole('button', { name: 'Find tab:' }).click();
    assert.match(await page.locator('#guideDuplicateWarning').innerText(), /3 tabs/);
    const originalRow = await first().elementHandle();
    await page.locator('#guideMarkReviewed').click();
    assert.match(await page.locator('#guideMarkReviewed').innerText(), /Undo local review/);
    assert.equal(await originalRow.evaluate(el => el.isConnected), true);
    assert.equal(await page.locator('.tab-row').count(), 1);
    assert.match(await page.locator('#snapshotCounts').innerText(), /6 tabs in snapshot · 1 matching/);
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    assert.match(await first().innerText(), /Reviewed locally/);
    await page.reload();
    await first().waitFor();
    assert.match(await first().innerText(), /Reviewed/);
    await first().getByRole('button', { name: 'Find tab:' }).click();
    await page.locator('#guideMarkReviewed').click();
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    assert.doesNotMatch(await first().innerText(), /Reviewed/);
    assert.equal(await page.locator('#snapshotTime').getAttribute('datetime'), '2026-10-26T12:34:56.000Z');
    checks.push('local review updates one row, keeps counts/membership/time stable, and survives reload/undo');

    await page.locator('#containerFilter').selectOption('all');
    await first().click({ button: 'right' });
    await page.getByRole('button', { name: 'Find tab in Firefox…', exact: true }).click();
    assert.equal(await dialog.isVisible(), true);
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await first().locator('.tab-main').click();
    await page.keyboard.press('f');
    assert.equal(await dialog.isVisible(), true);
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await page.keyboard.press('Shift+F');
    assert.equal(await page.locator('#tabGuideTitle').innerText(), 'Find this tab in Firefox');
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    // Enter on a focused row button must not also run the row's Open action.
    await first().getByRole('button', { name: 'Find tab:' }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await dialog.isVisible(), true);
    assert.equal(await page.evaluate(() => window.__opened.length), 0);
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await first().getByRole('button', { name: 'Find tab:' }).focus();
    await page.keyboard.press('Shift+F');
    assert.equal(await page.locator('#tabGuideTitle').innerText(), 'Find this tab in Firefox');
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    checks.push('context menu and keyboard find actions cannot invoke a closing mode or open another URL');

    await page.locator('.tab-row[data-id="1:1:2"]').getByRole('button', { name: 'Find tab:' }).click();
    assert.match(await page.locator('#guideTargetMeta').innerText(), /Pinned in snapshot/);
    assert.equal(await page.locator('#guideDuplicateWarning').isVisible(), false);
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await page.locator('.tab-row[data-id="1:1:3"]').getByRole('button', { name: 'Find tab:' }).click();
    assert.equal(await page.locator('#guideQuery').inputValue(), '% https://example.org/untitled');
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await page.locator('#helpButton').click();
    await page.locator('#helpDialog summary').filter({ hasText: 'Closing a tab in Firefox (optional)' }).click();
    assert.match(await page.locator('#helpDialog').innerText(), /Browser changes do not update this snapshot/);
    await page.locator('#closeHelp').click();
    checks.push('pinned identity, URL fallback for untitled tabs, and optional closing tip confined to Help');

    await first().getByRole('button', { name: 'Find tab:' }).click();
    await page.locator('#guideMarkReviewed').click();
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportJsonButton').click()]);
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(exported.data.profiles[0].windows[0][0].reviewed, true);
    assert.equal(exported.data.profiles[0].windows[0][1].pinned, true);
    await page.locator('#loaderButton').click();
    await page.locator('#jsonInput').setInputFiles({ name: 'roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
    assert.match(await first().innerText(), /Reviewed/);
    checks.push('reloadable JSON preserves reviewed and pinned metadata');

    const screenshotDir = process.env.SCREENSHOT_DIR;
    if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });
    await first().getByRole('button', { name: 'Find tab:' }).click();
    for (const [width, height, density, theme] of [
      [1280, 1000, 'comfy', 'dark'], [1024, 900, 'compact', 'light'],
      [390, 844, 'comfy', 'dark'], [390, 844, 'compact', 'light'], [390, 844, 'cards', 'dark'],
    ]) {
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      await page.setViewportSize({ width, height });
      await page.locator('#density').selectOption(density);
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#themeButton').click();
      await first().getByRole('button', { name: 'Find tab:' }).click();
      const bounds = await dialog.evaluate(el => ({ left: el.getBoundingClientRect().left,
        right: el.getBoundingClientRect().right, client: el.clientWidth, scroll: el.scrollWidth }));
      assert.ok(bounds.left >= 0 && bounds.right <= width && bounds.scroll <= bounds.client + 1, JSON.stringify(bounds));
      if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `guide-${width}-${density}-${theme}.png`) });
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      const statusBounds = await page.locator('#snapshotStatus').evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
      assert.ok(statusBounds.scroll <= statusBounds.client + 1, JSON.stringify(statusBounds));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      assert.equal(await page.getByRole('button', { name: 'Load newer snapshot', exact: true }).isVisible(), true);
      if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `snapshot-${width}-${density}-${theme}.png`) });
      assert.equal(await first().getByRole('button', { name: 'Find tab:' }).isVisible(), true);
      const rowBounds = await first().evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
      assert.ok(rowBounds.scroll <= rowBounds.client + 1, JSON.stringify(rowBounds));
      await first().getByRole('button', { name: 'Find tab:' }).click();
    }
    checks.push('light/dark and comfy/compact/cards layouts at desktop and 390px width');

    // Long imported profile, container, and URL strings must wrap in the guide.
    await page.evaluate(() => {
      const tab = tabGuide.tab;
      tab.profile = 'long-profile-'.repeat(30);
      tab.container.name = 'long-container-'.repeat(20);
      tab.url = 'https://example.org/' + 'longpath'.repeat(40);
      renderTabGuide();
    });
    const longBounds = await dialog.evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
    assert.ok(longBounds.scroll <= longBounds.client + 1, JSON.stringify(longBounds));
    checks.push('long imported target metadata wraps without horizontal overflow');

    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await page.locator('#loaderButton').click();
    await page.locator('#sessionInput').setInputFiles({ name: 'recovery.jsonlz4', mimeType: 'application/octet-stream',
      buffer: sessionFile({ windows: [{ tabs: [{ pinned: true, entries: [{ title: 'Raw pinned', url: 'https://example.org/raw' }] }] }] }) });
    await page.locator('.tab-row').first().waitFor();
    await page.locator('.tab-row').first().getByRole('button', { name: 'Find tab:' }).click();
    assert.match(await page.locator('#guideTargetMeta').innerText(), /Pinned in snapshot/);
    assert.equal(await page.locator('#guideMarkReviewed').innerText(), 'Mark reviewed locally');
    checks.push('real mozLz4 import retains pinned state and starts fresh review');

    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    const sparseFixture = { timestamp_utc: '20200101T000000Z', profiles: [
      { profile: 'empty-profile', windows: [] },
      { profile: 'sparse-profile', profile_path: 'Profiles/sparse', session_file: 'sessionstore-backups/recovery.jsonlz4',
        windows: [[], [{ title: 'Sparse target', url: 'https://example.org/sparse', pinned: true }]] },
    ] };
    await page.locator('#loaderButton').click();
    await page.locator('#jsonInput').setInputFiles({ name: 'sparse-fixture.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(sparseFixture)) });
    await page.locator('.tab-row').first().getByRole('button', { name: 'Find tab:' }).click();
    await page.locator('#guideMarkReviewed').click();
    const savedSparse = await page.evaluate(() => JSON.parse(localStorage.getItem('ffTabsViewerLastSnapshot')));
    assert.equal(savedSparse.data.timestamp_utc, sparseFixture.timestamp_utc);
    assert.equal(savedSparse.data.profiles.length, 2);
    assert.equal(savedSparse.data.profiles[1].profile_path, 'Profiles/sparse');
    assert.equal(savedSparse.data.profiles[1].session_file, 'sessionstore-backups/recovery.jsonlz4');
    assert.deepEqual(savedSparse.data.profiles[1].windows[0], []);
    assert.equal(savedSparse.data.profiles[1].windows[1][0].reviewed, true);
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await page.reload();
    await page.locator('.tab-row[data-id="2:2:1"]').waitFor();
    const [sparseDownload] = await Promise.all([page.waitForEvent('download'), page.locator('#exportJsonButton').click()]);
    const exportedSparse = JSON.parse(fs.readFileSync(await sparseDownload.path(), 'utf8'));
    assert.deepEqual(exportedSparse.data, savedSparse.data);
    checks.push('review save/export retain source timestamp, provenance, and sparse profile/window positions');

    await page.locator('.tab-row').first().getByRole('button', { name: 'Find tab:' }).click();
    await page.evaluate(() => {
      window.__originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'ffTabsViewerLastSnapshot') throw new DOMException('Quota exceeded', 'QuotaExceededError');
        return window.__originalSetItem.call(this, key, value);
      };
    });
    await page.locator('#guideMarkReviewed').click();
    assert.equal(await page.locator('#guideMarkReviewed').innerText(), 'Mark reviewed locally');
    assert.match(await page.locator('#toast').innerText(), /storage could not save/);
    await page.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem; });
    await page.locator('#guideMarkReviewed').click();
    assert.equal(await page.locator('#guideMarkReviewed').innerText(), 'Undo local review');
    checks.push('storage failure reports the problem and preserves usable in-memory review controls');

    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    const previousTime = await page.locator('#snapshotTime').getAttribute('datetime');
    await page.getByRole('button', { name: 'Load newer snapshot', exact: true }).click();
    assert.equal(await page.locator('#dropTitle').innerText(), 'Load newer snapshot');
    await page.keyboard.press('Escape');
    await page.locator('#dropDialog').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#snapshotTime').getAttribute('datetime'), previousTime);
    await page.getByRole('button', { name: 'Load newer snapshot', exact: true }).click();
    await page.locator('#jsonInput').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{') });
    assert.equal(await page.locator('#dropDialog').isVisible(), true);
    assert.equal(await page.locator('#snapshotTime').getAttribute('datetime'), previousTime);
    assert.equal(await page.locator('.tab-row').count(), 1);
    const previousFilename = await page.evaluate(() => state.snapshotFilename);
    await page.locator('#jsonInput').setInputFiles({ name: 'malformed-data.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ profiles: [null] })) });
    assert.equal(await page.evaluate(() => state.snapshotFilename), previousFilename);
    assert.equal(await page.locator('#snapshotTime').getAttribute('datetime'), previousTime);
    assert.equal(await page.locator('.tab-row').count(), 1);
    await page.keyboard.press('Escape'); await page.locator('#dropDialog').waitFor({ state: 'hidden' });
    assert.doesNotMatch(await page.locator('#subtitle').innerText(), /Reading|Decoding/);
    await page.getByRole('button', { name: 'Load newer snapshot', exact: true }).click();
    const newer = { timestamp_utc: '2026-10-27T10:15:00Z', profiles: [{ profile: 'newer', windows: [[
      { title: 'New snapshot tab', url: 'https://example.org/newer' },
      { title: 'Another new tab', url: 'https://example.org/another' },
    ]] }] };
    await page.locator('#jsonInput').setInputFiles({ name: 'newer.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(newer)) });
    await page.locator('#dropDialog').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.tab-row').count(), 2);
    assert.equal(await page.locator('.review-status').count(), 0);
    assert.equal(await page.locator('#snapshotTime').getAttribute('datetime'), newer.timestamp_utc.replace('Z', '.000Z'));
    assert.match(await page.locator('#snapshotCounts').innerText(), /2 tabs in snapshot · 2 matching/);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    assert.equal(await page.locator('.tab-row').count(), 2);
    checks.push('explicit newer-snapshot import replaces rows/time; cancel, invalid input, and focus preserve the prior snapshot');

    await page.getByRole('button', { name: 'Load newer snapshot', exact: true }).click();
    await page.locator('#sessionInput').setInputFiles({ name: 'recovery.jsonlz4', mimeType: 'application/octet-stream',
      buffer: sessionFile({ windows: [] }) });
    await page.locator('#dropDialog').waitFor({ state: 'hidden' });
    assert.match(await page.locator('#snapshotCounts').innerText(), /0 tabs in snapshot · 0 matching/);
    assert.match(await page.locator('#content').innerText(), /No tabs in this imported snapshot/);
    assert.equal(await page.locator('#exportJsonButton').isEnabled(), true);
    await page.reload();
    assert.equal(await page.locator('#dropDialog').isVisible(), false);
    assert.equal(await page.locator('#snapshotStatus').isVisible(), true);
    assert.match(await page.locator('#snapshotCounts').innerText(), /0 tabs in snapshot · 0 matching/);
    checks.push('empty Firefox sessions stay visible as valid zero-tab snapshots after reload');

    await page.evaluate(() => {
      const snapshot = JSON.parse(localStorage.getItem('ffTabsViewerLastSnapshot'));
      snapshot.data.timestamp_utc = 'unavailable';
      localStorage.setItem('ffTabsViewerLastSnapshot', JSON.stringify(snapshot));
    });
    await page.reload();
    assert.equal(await page.locator('#snapshotTime').innerText(), 'Snapshot time unavailable');
    assert.equal(await page.locator('#snapshotTime').getAttribute('datetime'), null);
    checks.push('unknown timestamps display honestly without breaking restored snapshots');

    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.locator('#density').selectOption('compact');
    timings.reviewToggleMs = await page.evaluate(() => {
      const tabs = Array.from({ length: 2000 }, (_, i) => ({ title: `Review target ${i}`, url: `https://example.org/item/${i}` }));
      loadParsedData({ timestamp_utc: '20200101T000000Z', profiles: [{ profile: 'large', windows: [tabs] }] }, 'large synthetic snapshot');
      openTabGuide(state.tabs[0]);
      window.__largeRow = document.querySelector('.tab-row');
      const start = performance.now();
      document.getElementById('guideMarkReviewed').click();
      return Math.round((performance.now() - start) * 100) / 100;
    });
    assert.equal(await page.locator('.tab-row').count(), 2000);
    assert.equal(await page.evaluate(() => window.__largeRow.isConnected), true);
    assert.equal(await page.locator('.review-status').count(), 1);
    assert.match(await page.locator('#snapshotCounts').innerText(), /2000 tabs in snapshot · 2000 matching/);
    checks.push('2000-tab review toggles preserve existing rows and snapshot counts');
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    page.once('dialog', confirmation => confirmation.accept());
    await page.locator('#resetViewerToolbarButton').click();
    assert.equal(await page.locator('.tab-row').count(), 0);
    assert.equal(await page.locator('#snapshotStatus').isVisible(), false);
    assert.equal(await page.getByRole('button', { name: 'Load snapshot', exact: true }).count(), 1);
    assert.equal(await page.locator('#dropDialog').isVisible(), true);
    await page.reload();
    assert.equal(await page.locator('#dropDialog').isVisible(), true);
    assert.equal(await page.locator('.tab-row').count(), 0);
    checks.push('reset clears the review snapshot and remains empty after reload');

    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, checks, timings, browserErrors: errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
