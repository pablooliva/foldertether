# FolderTether Quick Action — Installation

The Quick Action lets you create a linked Obsidian note directly from a Finder folder via right-click.

## Steps

1. **Open Shortcuts.app** (Applications → Shortcuts, or Spotlight → "Shortcuts").

2. **Create a new shortcut:** Click the `+` button in the top-right corner. Name it `FolderTether` (or anything you prefer).

3. **Add the shell script action:**
   - In the search bar on the right, search for **"Run Shell Script"** and drag it into the shortcut.
   - Set **Shell** to `/bin/bash` and **Input** to **"Shortcut Input"**.
   - Paste the entire contents of `folder-tether.sh` into the script field.
   - In the action header, set **"Receive input from"** to **"Finder"** and check **"Folders"**.

4. **Enable as a Quick Action:** In the shortcut's settings (click the `ⓘ` icon next to its name), enable **"Use as Quick Action"** → **"Finder"**. The action will now appear in the Finder right-click menu under **Quick Actions** when a folder is selected.

5. **First run:** Right-click any folder in Finder, choose **Quick Actions → FolderTether**. On first run, the script will prompt you for your vault name and vault root path and save them to `~/.config/foldertether/config`. Subsequent runs use the saved config automatically.

## Notes

- Only the first selected folder is used if multiple folders are selected at once.
- To change your vault name or path, edit or delete `~/.config/foldertether/config` and re-run the action.
- If `linked_dir` does not appear as a URL-type property in Obsidian immediately after the first Quick Action run, restart Obsidian or reload the FolderTether plugin to pick up the `types.json` change.
