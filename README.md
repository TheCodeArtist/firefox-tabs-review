Firefox-tabs-review
----

`firefox-tabs-review` is a local, single-file viewer for a messy Firefox session.

Open `firefox-tabs-review.html`, drop in Firefox session data, and review the tabs outside the browser window that created them.

It reads files you choose and builds an **imported snapshot** of your tabs. **Find tab** copies a Firefox tab-search query and guides you to a matching open tab. Use **Load newer snapshot** to choose updated session files when you want to refresh the list. Browser changes are not tracked automatically.


<figure>
  <img src="./firefox-tabs-review-screenshot1.png" alt="Firefox Tabs Viewer in light mode, grouped by container, with the insights sidebar open." width="100%">
  <figcaption align="center">Light mode, compact rows, grouped by container. The sidebar shows the snapshot count, containers, age buckets, top domains, and duplicates.</figcaption>
</figure>

<br>
<br>

<figure>
  <img src="./firefox-tabs-review-screenshot2.png" alt="Firefox Tabs Viewer in dark mode, grouped by window, with tab rows and the insights sidebar." width="100%">
  <figcaption align="center">Dark mode, grouped by window. Each row shows the title, URL, age, container, original window and tab position, and domain.</figcaption>
</figure>

<br>
<br>

<figure>
  <img src="./firefox-tabs-review-screenshot3.png" alt="Command palette open over the Firefox Tabs Viewer with export, grouping, sorting, and window commands." width="100%">
  <figcaption align="center">The command palette searches actions, grouping modes, sort modes, window filters, container filters, age filters, and tabs.</figcaption>
</figure>

<br>
<br>

<figure>
  <img src="./firefox-tabs-review-screenshot4.png" alt="Help and shortcuts dialog in Firefox Tabs Viewer." width="100%">
  <figcaption align="center">The help dialog lists the review flow, keyboard shortcuts, command examples, filtering notes, and selection/export actions.</figcaption>
</figure>

----

# What it is

The app is one static HTML file:

```text
firefox-tabs-review.html
```

There is no server, account, build step, browser extension, or Python script.

You can open the file from disk, or publish the same file as a static page.

The viewer accepts:

- a Firefox session file (`recovery.jsonlz4`, `previous.jsonlz4`, or `sessionstore.jsonlz4`).
- the session file plus the profile's `containers.json`, for container names, colors, and icons.
- a whole profile folder dropped from a Chromium-based browser (fallback; slow on large profiles).
- a JSON previously exported by this viewer.

The fast path is two files:

1. `<profile>/sessionstore-backups/recovery.jsonlz4` (falls back to `previous.jsonlz4` or `<profile>/sessionstore.jsonlz4`).
2. `<profile>/containers.json` (optional; only needed for container metadata).

Both can be dragged onto the page together, picked one at a time in the guided loader, or picked together with the fallback **Pick both Firefox files at once...** link.


## How it works

For each readable session entry, the viewer extracts:

- title
- URL
- last-accessed time
- favicon data URL, if Firefox stored one
- Firefox container id, name, color, and icon, when available
- Firefox profile name
- source session file
- window number and tab position

Favicons come from the session data. The viewer does not fetch favicons from the network.

## Saved state and exports

After a successful load, the viewer stores the last tab snapshot in this browser's `localStorage`, up to its built-in size limit. Refreshing the page can restore that last loaded review queue without reading the Firefox folder again.

`Export reloadable JSON` downloads a viewer-specific JSON file with the tabs and favicons. Drop that JSON back into the load dialog later to continue from the same snapshot.

Preferences such as theme, grouping, sorting, density, sidebar width, and sidebar visibility are stored locally in the browser. `Reset viewer` clears the current tab list and the saved snapshot for this app, but keeps your view preferences and chosen light/dark theme.

----

# How to use it

Open `firefox-tabs-review.html` in a browser, then drag `recovery.jsonlz4`
(and optionally `containers.json`) from your Firefox profile onto the page,
or use the guided picker in the load dialog. If the session uses containers,
the dialog asks for `containers.json` after the session file loads.

> Note: The load dialog includes platform-specific hints for the normal Firefox folder paths:
> 
> - Windows: `%APPDATA%\Mozilla\Firefox`
> - macOS: `~/Library/Application Support/Firefox`
> - Linux: `~/.mozilla/firefox`
>
> The profile folder is under `<that path>/Profiles/<profile>/`. `recovery.jsonlz4` lives inside its `sessionstore-backups/` subfolder; `containers.json` sits directly in the profile folder.

Start with the sidebar.  
Duplicates and top domains are usually the easiest cleanup.

Then switch grouping between window, container, domain, age, or even a flat list...  
...until the pile starts to make sense.

Use search for titles, URLs, domains, profile names, and container names.  
The toolbar filters by profile, container, age bucket, and window.  
Sorting covers original order, newest first, oldest first, title, and domain.

Select tabs with checkboxes or the keyboard,  
then use the bulk bar to open them, copy plain URLs, copy Markdown links, or copy OneTab-style text.

Right-click a row for one-tab actions: find, open another copy, copy URL, copy title, copy Markdown, or filter by domain.

## Find an existing tab in Firefox

1. Find the row using the viewer's search or filters, then click **Find tab** (or select the row and press **f**). The viewer copies a search such as `% Project planning` immediately and opens the guide.
2. Focus Firefox in the profile that contains the tab. Press **Ctrl+L**, then **Ctrl+V** (**Cmd+L**, then **Cmd+V** on macOS).
3. Choose the matching **Switch to tab** result with the arrow keys and **Enter**, or click it. Compare the full URL, page content, and container with the guide's target.

The guide detects your keyboard platform and lets you change it. **Title** and **URL** switch the copied search; the text is editable if a shorter distinctive phrase works better. If clipboard access is blocked, the guide selects the query and tells you how to copy it manually.

Tabs with the same title or URL trigger a warning, including copies hidden by viewer filters. Snapshot profile, window, and tab positions are clues: they can change, and identical copies cannot be identified reliably from a file. If there is no match, try the URL or a shorter phrase, check the profile, or use **Load newer snapshot** to choose a fresh `recovery.jsonlz4`.

**Mark reviewed locally** adds a **Reviewed locally** badge; **Undo local review** clears it. All rows stay visible, and snapshot counts stay unchanged. Review status persists with the saved snapshot and reloadable JSON, preserving the original timestamp, source metadata, and window/tab positions. Loading a fresh Firefox session starts a fresh review.

The persistent **Imported snapshot** strip shows the timestamp recorded in the imported data, the total tabs in that snapshot, and the number matching your filters. For raw Firefox session files, the timestamp is the import time; it is not a live reading of Firefox. Refreshing the viewer, marking a row reviewed, and reopening an export preserve that timestamp. Older data with an unknown timestamp is labeled accordingly.

**Load newer snapshot** opens the existing file-import dialog. Choose updated Firefox session files to replace the snapshot. Canceling or choosing an unreadable file keeps the previous snapshot. A valid session with no tabs displays an empty snapshot. Reloading the viewer restores the saved snapshot instead of rereading Firefox's files.

A short optional closing tip lives in **Help**. Closing a browser tab leaves the imported snapshot unchanged.

Clicking a row's title, double-clicking a row, or using **Open another copy** still opens its URL in a new tab. These actions are separate from the guided search for an existing tab.

The Firefox steps follow Mozilla's [tab-search instructions](https://support.mozilla.org/en-US/kb/search-open-tabs-firefox), [keyboard shortcuts](https://support.mozilla.org/en-US/kb/keyboard-shortcuts-perform-firefox-tasks-quickly), and [pinned-tab guidance](https://support.mozilla.org/en-US/kb/pinned-tabs-keep-favorite-websites-open).

## Command palette (and shortcuts)

Press `Ctrl K` or click `Command` to open the command palette.  
It can run viewer actions, change grouping, change sort order, change density,  
toggle the theme, toggle the sidebar, export JSON, reset the viewer,  
filter by profile/container/window/age, and jump to a tab in the current results.

Useful shortcuts:

- `/` focuses search.
- `Ctrl K` opens the command palette.
- `?` opens help.
- `j` and `k` move the active row.
- Arrow keys move through rows or command results.
- `f` copies a Firefox search for the active row and opens the switch guide.
- `Enter` opens another copy of the active tab's URL or runs the active command.
- `x` selects the active tab.
- `Shift x` selects a range.
- `g g` jumps to the first match.
- `G` jumps to the last match.
- `Esc` clears search, closes suggestions, or clears duplicate filtering.
- Right click opens row actions.

----

# A note on Privacy

The app runs in the browser:

- it reads files only after you select or drop them
- it does not upload session data
- it does not write inside your Firefox profile
- it does not start, stop, or signal Firefox

Firefox session data can include private URLs, page titles, internal links, local paths, and favicon data.  
Sharing the HTML viewer is fine. Sharing your own exported JSON or session files may expose browsing history.

----

# Known limits

- The viewer reads the current entry for each tab, not the whole back/forward history.
- Private windows are not captured because Firefox does not write them to session restore files.
- Pinned state is retained when present and shown in the Find tab guide. Older viewer exports may not include it. Muted/audio state, reader mode, and scroll position are not shown.
- A session file can lag behind Firefox while the browser is still writing it.
- The standalone viewer cannot activate or close browser tabs directly, verify a completed action, or distinguish identical live copies from a snapshot. Direct control would require a Firefox extension with live tab IDs.
