# Daytown Chrome side panel

Daytown adds a task panel alongside the page you are using. **Chrome's native new-tab page, Google search bar, shortcuts, theme and search settings stay unchanged.** There is no new-tab override and no search-provider override.

## Load or reload

1. Start Daytown with `npm start` and keep the local server running at `http://localhost:3000`.
2. Manually open `chrome://extensions` in Chrome. Enable **Developer mode** and choose **Load unpacked**. Select this `extension` folder.
3. If you already loaded the earlier Daytown version, click **Reload** on its extension card. The new manifest removes the new-tab override. Close any old Daytown new-tab page and open a fresh new tab to see Chrome's normal page.
4. Open Chrome's Extensions menu and click **Daytown**, or pin its icon and click that icon. Daytown opens in Chrome's side panel.
5. In the panel, hold the microphone or type a task. Use **Start 5 min**, **Done** or **Later 15 min**. **Desktop pet** starts the transparent desktop sprite through the local server. Electron must be installed for this optional desktop feature.

Extension installation and reload are manual user actions. A browser automation policy prevents the coding agent from operating Chrome's extension-management page.

## Local data

The extension talks only to `http://localhost:3000`. No API key, model calls, remote scripts or external fonts are included. Task state and generated art remain local. The last task snapshot, town image and pet image are cached in `chrome.storage.local`; if the server stops, the cached view stays visible and task changes wait for the server to return.

The compact panel shows one next task and one first step. Town artwork is behind **Town view** so it does not compete with the task. Voice reminders are optional and marked **AI-generated**. Notifications are optional and suppressed while any Daytown floating pet is open. The default desktop pet has no opaque card. The older opaque browser Picture-in-Picture option is explicitly labelled **Browser preview (opaque)** under the dashboard's Demo controls; it is not the default.

`newtab.html` remains a standalone development preview only. The manifest does **not** register it as Chrome's new-tab page. It does not alter browser settings.

## Verification

Run `node --test extension/manifest.test.mjs`. Tests verify that the extension is a side-panel supplement, has no browser-page/search overrides and uses only packaged scripts/styles and the localhost API.

Official docs checked 1 November 2026: [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), [extension host permissions](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests), [Document Picture-in-Picture](https://developer.chrome.com/docs/web-platform/document-picture-in-picture).

`app.js`, `daytown-view.js` and `style.css` are packaged copies of the dashboard controller/helpers/styles, with external font imports removed. Update these copies when editing the dashboard controller. `panel.css` controls only the compact side panel.
