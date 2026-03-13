# FolderTether Quick Action — Installation

The Quick Action lets you create a linked Obsidian note directly from a Finder folder via right-click.

## Steps

1. **Open Shortcuts.app** (Applications → Shortcuts, or Spotlight → "Shortcuts").

2. **Create a new shortcut:** Click the `+` button in the top-right corner. Name it `FolderTether` (or anything you prefer).

3. **Add the shell script action:**
   - In the search bar on the right, search for **"Run Shell Script"** and drag it into the shortcut.
   - Set **Shell** to `/bin/bash`, **Input** to **"Shortcut Input"**, and **Pass Input** to **"as arguments"**.
   - Paste the entire contents of `folder-tether.sh` into the script field.

4. **Enable as a Quick Action:** In the shortcut's settings (click the `ⓘ` icon next to its name), enable **"Use as Quick Action"** → **"Finder"**. The action will now appear in the Finder right-click menu under **Quick Actions** when a folder is selected.

5. **First run:** Right-click any folder in Finder, choose **Quick Actions → FolderTether**. On first run, the script will prompt you for your vault name and vault root path and save them to `~/.config/foldertether/vaults/<VaultName>.conf`. Subsequent runs use the saved config automatically.

## Notes

- Only the first selected folder is used if multiple folders are selected at once.
- **Multiple vaults:** Each vault gets its own config file in `~/.config/foldertether/vaults/`. When two or more are configured, the script shows a picker on each run. Select **"Add new vault…"** from the picker to register an additional vault.
- To remove a vault, delete its `.conf` file from `~/.config/foldertether/vaults/`.
- To edit a vault's name or path, edit its `.conf` file directly.
- If `linked_dir` does not appear as a URL-type property in Obsidian immediately after the first Quick Action run, restart Obsidian or reload the FolderTether plugin to pick up the `types.json` change.
