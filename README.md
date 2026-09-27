<p align="center"><img src="logo-512.png" alt="NotePannuda" width="160"></p>

# NotePannuda

Jot first, organize later. NotePannuda is a fast, local-first notes and tasks app that runs in your browser and installs like an app on your Mac and your Android phone. Paired devices sync directly with each other: no accounts, no cloud storage, no server of your own.

**Your app's address after publishing:** `https://YOUR-USERNAME.github.io/notepannuda/notepannuda.html`

## Features

- **Instant capture:** every jot saves as you type. Finish with **Save note** or **Save as task** (or Enter / Cmd+Enter). On phones and tablets, Enter adds a new line and the Note / Task buttons save (changeable in Settings). The checklist button turns a line into a checklist item. On a computer, drag the divider under the jot box to make it taller or shorter. Quick syntax: `#tag`, `!h` `!m` `!l` for priority, `due:fri`, `due:+3d`, `w:3` for weight, and `[]` to start a checklist.
- **Tasks:** priority, weight, due dates, reminders, and checklists. Checking the last item completes the task.
- **Organized automatically:** tasks are grouped by Overdue, Today, Next 7 days, Later, and No due date. Completed tasks move to their own section.
- **Search:** multi-word, instant even with 10,000 jots, with filters like `is:task`, `p:high,med`, `w:3-5`, `due:week`, `#tag`, and `-word`, plus `sort:` options. Priority and weight buttons let you pick several at once.
- **Auto-tags:** keyword rules tag jots for you.
- **Sync between any number of devices:** changes move directly device to device, and conflicts are never silently lost.
- **Send changes, Export and Import:** move everything as a JSON file through Drive, Files, email, or Quick Share.
- **Recently deleted:** restore all, by tag, or one by one, or delete forever right away instead of waiting 30 days.
- **Select to complete or delete in bulk:** choose **Select** above the list, Cmd/Ctrl-click a jot, or long-press on a phone. Shift-click selects a range, **Select all** takes everything in the current view or search. Then choose **Complete** (or **Reopen**) or **Delete**, and Undo if you change your mind.
- **Resizable panels:** on a computer, drag the edge of the sidebar or editor (double-click the edge to reset).
- **Notifications:** when another device connects, a daily summary of tasks due (at a time you choose), and task reminders. Turn them on in Settings. On a Mac keep the app open (minimized is fine); on Android they arrive while the app is open or recently used, plus an optional background check in Chrome.
- **Phone-friendly:** swipe to complete or delete, Android back-gesture support, and a share target (share text or files into NotePannuda). Works offline.

## Files

| File | What it is |
|---|---|
| `notepannuda.html` | The whole app |
| `sw.js` | Service worker: offline use and receiving shared files |
| `manifest.webmanifest` | Makes it installable (name, icons, shortcuts, share target) |
| `favicon.ico`, `favicon.svg`, `favicon-16.png`, `favicon-32.png` | Browser tab icons |
| `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Home-screen and app icons |
| `logo-96.png`, `logo-512.png` | Logo (sidebar badge, README) |
| `badge-96.png` | Small monochrome icon for Android's notification bar |
| `shortcut-*.png` | Long-press shortcut icons |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are |
| `publish.sh` | Publishes or updates the site from your Mac |

## Publish it on GitHub Pages

### Option A: one command (Mac)

1. Install the tools, once:
   - **Git:** run `xcode-select --install` in Terminal.
   - **GitHub CLI:** run `brew install gh` if you have Homebrew (https://brew.sh), or download it from https://cli.github.com.
2. In Terminal, go to this folder and run:
   ```
   bash publish.sh
   ```
   The first time, a browser window opens to sign in to GitHub. The script creates the public repository `notepannuda`, uploads the files, turns on GitHub Pages, and prints your app's address.

Run `bash publish.sh` again whenever you have updated files. To use a different repository name, add it: `bash publish.sh my-notes`.

### Option B: in the browser

1. On github.com, choose **+**, then **New repository**. Name it `notepannuda`, choose **Public**, and select **Create repository**.
2. Select **uploading an existing file**, drag in all the files from this folder, then select **Commit changes**.
   `.nojekyll` is hidden on a Mac by default. Press Cmd+Shift+. (period) in Finder to show it. The site works without it.
3. Go to **Settings**, then **Pages**. Set Source to **Deploy from a branch**, Branch to **main**, folder **/ (root)**, and select **Save**.
4. After a minute or two, open `https://YOUR-USERNAME.github.io/notepannuda/notepannuda.html`.

The repository is public, but it contains only the empty app. Your notes live on your devices, never on GitHub.

## Install

**Mac:** use one browser consistently, since each browser keeps its own copy of your notes.
- **Chrome:** open your app's address, then use the install icon in the address bar, or the three-dot menu: **Cast, save, and share**, then **Install page as app**.
- **Edge:** **...** menu, then **Apps**, then **Install this site as an app**.
- **Safari (macOS Sonoma or later):** **File**, then **Add to Dock**. Always use the Dock app, since it keeps its own storage.
- **Tip:** add NotePannuda to **System Settings**, then **General**, then **Login Items**, and leave it open (minimized is fine). Your phone then syncs within seconds whenever you open it.

**Pixel / Android:** open the address in Chrome, then tap the three-dot menu, then **Add to home screen**, then **Install**. Long-press the icon for the **New jot** and **Tasks** shortcuts.

## Pair your devices

1. On a device that's already set up, open **Settings** and select **Show pairing code** (or **Add a device**).
2. On the new device, point the Camera app at the QR code and open the link, then tap **Pair**. Or open NotePannuda there, choose **Enter a code**, and type the 26-character code.
3. Each device should say **Connected to ...** within a few seconds.

You can pair as many devices as you like. Pair each new one with the code from any device in the group. Give each device a name in Settings so messages read naturally ("Edited on Pixel 9 Pro and Mac").

Keep the pairing code private: anyone who has it can sync with your notes. To take a device out of the group (a lost phone, say), use **Remove** next to it in Settings. The other connected devices move to a new code automatically. Any device that wasn't connected at that moment is named, so you can pair it again.

## How sync works

- **Direct:** when the app is open on two devices, they find each other through public Nostr relays, then connect directly (WebRTC). Changes arrive in about half a second.
- **Relay fallback:** if a network blocks direct connections (some offices, hotels, and mobile carriers), small changes go through the relays instead, sealed with your pairing key and never stored. Big catch-ups go slowly this way to be fair to the volunteers who run relays, so **Send changes** is faster for those. It switches back to direct automatically (retried about once a minute). You can turn the fallback off in Settings, under **How direct sync works**.
- **Groups:** every device connects to every other open device. If two can't reach each other, a device in between passes changes along. Devices that are rarely open at the same time still catch up through the others.
- **Conflicts:** changes to different fields (a due date on one device, a priority on another) simply combine. If the same jot's text was edited on two devices before they synced, both versions are kept, and the jot is marked **Edited on 2 devices** so you can keep one or combine them. An edit made after a delete brings the jot back.
- **The phone syncs while the app is open on it.** Nothing runs in the background.

## Privacy

- **Your notes:** stored only on your devices. Between devices they're encrypted end to end, both over direct connections and through the relays.
- **Relays:** they see small encrypted messages, when your devices are online, and their IP addresses. They can't read anything, and they don't store these messages.
- **Address lookup:** to find a direct path across networks, devices ask public STUN servers (Cloudflare, Google), which see your IP address but no notes.
- **GitHub:** it hosts only the empty app.

## Update the app

Replace the files, then run `bash publish.sh` (or upload them again in the browser). Devices pick up the new version the next time the app opens online; if one doesn't, close it fully and reopen it. Notes and pairing carry over as long as the address stays the same.

Changing your GitHub username or the repository name changes the address, and a new address starts empty. To move your notes: in the old copy, go to Settings and choose **Export file**; in the new one, choose **Import file**.

## Back up

Your notes exist only on your devices. Now and then, use **Export file** to keep a copy somewhere safe.

Importing a backup (a file made with **Export file**) is a restore, not a sync:

- A jot in the file that's missing here, or was **deleted forever** here, comes back as a normal jot, on all your paired devices.
- A jot in the file that's still in **Recently deleted** here stays there, and the import offers to restore it in one tap.
- Everything else merges field by field, so importing an older or repeated file never loses anything.

A **Send changes** file is different: it's sync by hand, so it carries deletions and merges with the sync rules.

## Deleting

- **Delete** moves a jot to **Recently deleted** on all your devices. It waits there for 30 days.
- In **Recently deleted**, restore everything, restore just the jots with certain tags (tap tags under **Restore by tag**, or in the sidebar, then **Restore**), or select jots one by one.
- **Delete forever** (on a jot, on a selection, or on everything shown) erases the text right away instead of waiting 30 days. On a device that isn't paired, the jot is removed completely. On a paired device, only its ID and deletion time are kept, with no content, so an offline device can't sync its old copy back. Either way, importing a backup that has the jot brings it back.

## Troubleshooting

- **The pairing link opened in Chrome instead of the app (Android):** that's fine. They share storage.
- **Stuck on "Paired. Syncs when your other device is open":** make sure both apps are open and online, then select **Sync now** in Settings on both.
- **"Can't reach the relays that introduce your devices":** try another network, or edit the relay list under **How direct sync works**.
- **"Syncing ... through relays":** the network blocks direct connections. Everything still syncs, and large changes are just slower.
- **No "Scan a code" button:** use the phone's Camera app, or type the code.
- **Unpairing** stops syncing but never deletes notes. **Clearing a browser's site data** deletes that device's notes: re-pair it and they sync back from your other devices.
