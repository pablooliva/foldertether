# FolderTether

An [Obsidian](https://obsidian.md) plugin that creates bidirectional links between notes and local directories.

- **Note → Finder:** One command opens the linked folder in Finder.
- **Finder → Note:** A `.url` file placed in the directory opens the linked note in Obsidian when double-clicked.
- **Stays in sync:** Renaming or deleting a note automatically updates the `.url` file.

---

## How it works

When you run **Link note to directory**, FolderTether does two things:

1. Writes `linked_dir: file:///path/to/dir` into the note's frontmatter.
2. Creates `NoteName.url` inside that directory — a standard Windows Internet Shortcut file containing an `obsidian://open` URI.

Double-clicking the `.url` file in Finder opens the note directly in Obsidian. The `linked_dir` property renders as a clickable URL in Obsidian's Properties panel, and the **Open linked directory** command (or ribbon icon) opens the folder in Finder.

---

## Features

- **Link note to directory** — native folder picker (or manual path entry if the picker is unavailable)
- **Open linked directory** — opens the linked folder in Finder via the command palette or ribbon icon
- **Auto-sync on rename** — renames the `.url` file when the note is renamed
- **Configurable delete behavior** — optionally delete the `.url` file when the note is deleted (off by default)
- **Frontmatter change detection** — if you manually edit `linked_dir`, the `.url` file is moved automatically
- **Broken link notices** — shows a notice (once per session) when the linked directory can't be found
- **`linked_dir` property type** — registered as `url` type in Obsidian on first load, so it renders as a clickable link in the Properties panel
- **macOS Quick Action** — create a linked note starting from a Finder folder (see below)

---

## Installation

FolderTether is a desktop-only plugin (`isDesktopOnly: true`).

### Manual install

1. Download `main.js` and `manifest.json` from the latest release.
2. Inside your vault, create plugin directory `mkdir -p ./.obsidian/plugins/folder-tether/`
3. Copy both files to `.obsidian/plugins/folder-tether/` inside your vault.
4. In Obsidian: **Settings → Community plugins → Installed plugins** → enable **FolderTether**.

---

## Usage

### Link a note to a directory

1. Open the note you want to link.
2. Run **Link note to directory** from the command palette.
3. Select the directory in the folder picker (or paste the path if the picker is unavailable).

The note gains a `linked_dir` property and a `NoteName.url` file appears inside the directory.

### Open the linked directory

- Click the folder icon in the ribbon, **or**
- Run **Open linked directory** from the command palette.

### Re-link / update the link

Run **Link note to directory** again on an already-linked note. The old `.url` file is replaced and `linked_dir` is updated.

### Settings

| Setting | Default | Description |
|---|---|---|
| Delete back-link file when note is deleted | Off | When on, deletes the `.url` file from the linked directory if the note is deleted. When off, the `.url` file is left as an orphan. |

---

## macOS Quick Action (Finder → Obsidian)

The included Quick Action lets you create a linked note starting from a Finder folder — the reverse of the plugin flow.

**What it does:** Right-click a folder → Quick Actions → FolderTether → enter a note name → Obsidian opens with a new note pre-filled with `linked_dir` pointing to that folder, and a `.url` file is placed in the folder.

### Setup

1. Open **Shortcuts.app**.
2. Create a new shortcut named `FolderTether` (or anything you like).
3. Add a **Run Shell Script** action:
   - Shell: `/bin/bash`
   - Input: **Shortcut Input**
   - Paste the full contents of `quick-action/folder-tether.sh`
   - Set **"Receive input from"** → **Finder** → **Folders**
4. In the shortcut's settings (`ⓘ`), enable **Use as Quick Action → Finder**.
5. Right-click any folder in Finder → **Quick Actions → FolderTether** to use it.

On first run, the script prompts for your vault name and vault root path and saves them to `~/.config/foldertether/config`. Later runs use the saved config automatically.

To change your vault: edit or delete `~/.config/foldertether/config` and re-run the action.

> The Quick Action requires macOS. The plugin itself works on all Obsidian desktop platforms.

---

## Known limitations

- **`linked_dir` is machine-local.** Absolute filesystem paths don't transfer between machines. On a synced vault, the property is visible on other devices but the link won't open (a "Linked directory not found" notice appears once per session). A natural mitigation is to use separate vaults per machine.

- **Vault rename breaks existing `.url` files.** All `.url` files encode the vault name. If you rename your vault, re-run **Link note to directory** on affected notes to regenerate them.

- **`.url` files don't inherit a Finder icon.** They appear as generic "Internet Location" documents rather than compass-icon Safari bookmarks. This is a macOS limitation of the `.url` format.

- **Quick Action `types.json` change may require Obsidian restart.** If Obsidian is running when the Quick Action writes `types.json`, the `linked_dir` property may not render as a URL type until Obsidian restarts or the FolderTether plugin reloads.

- **Externally deleted `.url` files are not detected.** The plugin doesn't watch external directories. If a `.url` file is manually deleted, re-run **Link note to directory** to recreate it.

---

## Development

```bash
npm install       # install dependencies
npm run dev       # watch mode (incremental build)
npm run build     # production build
npm test          # unit tests
```

Requires Node.js 18+. The plugin bundles to `main.js` via esbuild; `obsidian`, `electron`, and Node built-ins are externalized.
