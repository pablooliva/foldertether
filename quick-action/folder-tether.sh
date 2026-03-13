#!/usr/bin/env bash
# folder-tether.sh — FolderTether macOS Quick Action
#
# Invoked by Shortcuts.app with the selected Finder folder as $1.
# Creates a <NoteName>.url back-link file in the folder and opens
# obsidian://new to create a linked note with linked_dir frontmatter.
#
# Requirements covered: REQ-010, REQ-011, FAIL-007, EDGE-009
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── 0. Input: use only the first selected folder (EDGE-009) ──────────────────
FOLDER_PATH="${1:-}"

if [[ -z "$FOLDER_PATH" ]]; then
    osascript -e 'display dialog "FolderTether: No folder path was provided. Invoke this action from Finder with a folder selected." buttons {"OK"} default button "OK" with icon stop'
    exit 1
fi

if [[ ! -d "$FOLDER_PATH" ]]; then
    osascript -e "display dialog \"FolderTether: The path does not point to a directory:\n\n$FOLDER_PATH\" buttons {\"OK\"} default button \"OK\" with icon stop"
    exit 1
fi

# ── 1. Config: read or select from ~/.config/foldertether/vaults/ ────────────
CONFIG_DIR="$HOME/.config/foldertether"
VAULTS_DIR="$CONFIG_DIR/vaults"
LEGACY_CONFIG="$CONFIG_DIR/config"

VAULT_NAME=""
VAULT_ROOT=""

mkdir -p "$VAULTS_DIR"

# Migrate legacy single-vault config if present and no vault configs exist yet
shopt -s nullglob
conf_files=("$VAULTS_DIR"/*.conf)
shopt -u nullglob

if [[ ${#conf_files[@]} -eq 0 && -f "$LEGACY_CONFIG" ]]; then
    # shellcheck source=/dev/null
    . "$LEGACY_CONFIG"
    if [[ -n "$VAULT_NAME" && -n "$VAULT_ROOT" ]]; then
        printf 'VAULT_NAME="%s"\nVAULT_ROOT="%s"\n' "$VAULT_NAME" "$VAULT_ROOT" \
            > "$VAULTS_DIR/${VAULT_NAME}.conf"
        mv "$LEGACY_CONFIG" "$LEGACY_CONFIG.migrated"
    fi
    VAULT_NAME=""
    VAULT_ROOT=""
    shopt -s nullglob
    conf_files=("$VAULTS_DIR"/*.conf)
    shopt -u nullglob
fi

# Prompts for vault name + root path, saves a new .conf file, and sets
# VAULT_NAME / VAULT_ROOT. Returns 1 if the user cancels either prompt.
_prompt_new_vault() {
    local vault_name_input vault_root_input
    vault_name_input=$(osascript <<'APPLESCRIPT'
try
    set r to display dialog "FolderTether: Add a vault." & return & return & "Enter your Obsidian vault name:" default answer "" buttons {"Cancel", "OK"} default button "OK"
    return text returned of r
on error number -128
    return ""
end try
APPLESCRIPT
)
    [[ -z "$vault_name_input" ]] && return 1

    vault_root_input=$(osascript <<'APPLESCRIPT'
try
    set r to display dialog "Enter the full path to your vault root directory:" & return & "(e.g. /Users/you/Documents/Obsidian/Personal)" default answer "" buttons {"Cancel", "OK"} default button "OK"
    return text returned of r
on error number -128
    return ""
end try
APPLESCRIPT
)
    [[ -z "$vault_root_input" ]] && return 1

    printf 'VAULT_NAME="%s"\nVAULT_ROOT="%s"\n' "$vault_name_input" "$vault_root_input" \
        > "$VAULTS_DIR/${vault_name_input}.conf"
    VAULT_NAME="$vault_name_input"
    VAULT_ROOT="$vault_root_input"
}

VAULT_COUNT=${#conf_files[@]}

if [[ $VAULT_COUNT -eq 0 ]]; then
    # No vaults configured — first-run setup
    _prompt_new_vault || exit 0

elif [[ $VAULT_COUNT -eq 1 ]]; then
    # Only one vault — use it silently
    # shellcheck source=/dev/null
    . "${conf_files[0]}"

else
    # Multiple vaults — present a picker
    as_list=""
    for conf in "${conf_files[@]}"; do
        name=$(basename "$conf" .conf)
        name="${name//\"/\\\"}"
        as_list="${as_list}\"${name}\", "
    done
    as_list="${as_list}\"Add new vault…\""

    chosen=$(osascript <<APPLESCRIPT
set vaultList to {${as_list}}
set chosen to choose from list vaultList with prompt "Select a vault for this note:" default items {item 1 of vaultList} without multiple selections allowed and empty selection allowed
if chosen is false then return ""
return item 1 of chosen
APPLESCRIPT
)

    if [[ -z "$chosen" ]]; then
        exit 0
    elif [[ "$chosen" == "Add new vault…" ]]; then
        _prompt_new_vault || exit 0
    else
        # shellcheck source=/dev/null
        . "$VAULTS_DIR/${chosen}.conf"
    fi
fi

# ── 2. Validate config values ─────────────────────────────────────────────────
if [[ -z "$VAULT_NAME" ]]; then
    osascript -e "display dialog \"FolderTether: VAULT_NAME is missing from the selected config.\n\nPlease check or delete the relevant file in ~/.config/foldertether/vaults/ and run the action again.\" buttons {\"OK\"} default button \"OK\" with icon stop"
    exit 1
fi

if [[ -z "$VAULT_ROOT" ]]; then
    osascript -e "display dialog \"FolderTether: VAULT_ROOT is missing from the selected config.\n\nPlease check or delete the relevant file in ~/.config/foldertether/vaults/ and run the action again.\" buttons {\"OK\"} default button \"OK\" with icon stop"
    exit 1
fi

# ── 3. Prompt user for note name (default: folder basename) ───────────────────
FOLDER_BASENAME=$(basename "$FOLDER_PATH")

# Pass FOLDER_PATH and FOLDER_BASENAME as argv to avoid unquoted heredoc injection.
# try/on error -128 handles Cancel cleanly under set -e.
NOTE_NAME_RAW=$(osascript - "$FOLDER_PATH" "$FOLDER_BASENAME" <<'APPLESCRIPT'
on run argv
    set folderPath to item 1 of argv
    set folderBasename to item 2 of argv
    try
        set noteNameResult to display dialog "Create a linked Obsidian note for:" & return & folderPath & return & return & "Note name:" default answer folderBasename buttons {"Cancel", "OK"} default button "OK"
        return text returned of noteNameResult
    on error number -128
        return ""
    end try
end run
APPLESCRIPT
)

if [[ -z "$NOTE_NAME_RAW" ]]; then
    # User cancelled — exit without creating anything
    exit 0
fi

# ── 4. Sanitize note name: replace : and / with - ────────────────────────────
NOTE_NAME="${NOTE_NAME_RAW//:/\-}"
NOTE_NAME="${NOTE_NAME//\//\-}"

# ── 5. URL-encode values using python3 urllib.parse ──────────────────────────
# Encode vault name (no safe chars — spaces become %20, etc.)
VAULT_NAME_ENCODED=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$VAULT_NAME")

# Encode note name for use in obsidian:// URI query params (no safe chars)
NOTE_NAME_ENCODED=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$NOTE_NAME")

# Encode folder path for use in the file:// URI inside frontmatter.
# Encode per-segment so / separators are preserved in the URI path.
FOLDER_FILE_URI=$(python3 -c "
import urllib.parse, sys
path = sys.argv[1]
# Split on / and encode each segment individually, then rejoin
segments = path.split('/')
encoded_segments = [urllib.parse.quote(s, safe='') for s in segments]
print('file://' + '/'.join(encoded_segments))
" "$FOLDER_PATH")

# ── 6. Write/update .obsidian/types.json in vault root (REQ-011) ─────────────
TYPES_JSON_PATH="$VAULT_ROOT/.obsidian/types.json"

if [[ ! -f "$TYPES_JSON_PATH" ]]; then
    # Create types.json from scratch (handles fresh vault)
    mkdir -p "$VAULT_ROOT/.obsidian"
    printf '{"types":{"linked_dir":"url"}}' > "$TYPES_JSON_PATH"
else
    # Merge linked_dir into existing types.json using Python.
    # Pass the path as argv to avoid heredoc injection from special chars in the path.
    python3 - "$TYPES_JSON_PATH" <<'PYTHON'
import json, sys

path = sys.argv[1]
try:
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
except (json.JSONDecodeError, IOError):
    data = {}

if not isinstance(data, dict):
    data = {}

if 'types' not in data or not isinstance(data['types'], dict):
    data['types'] = {}

if data['types'].get('linked_dir') != 'url':
    data['types']['linked_dir'] = 'url'
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
        f.write('\n')
PYTHON
fi

# ── 7. Write <sanitizedName>.url to the selected folder ──────────────────────
URL_FILE_PATH="$FOLDER_PATH/$NOTE_NAME.url"

# The obsidian://open URI for the back-link file uses just the note name
# (no subfolder path), since the Quick Action always creates a root-level note.
printf '[InternetShortcut]\r\nURL=obsidian://open?vault=%s&file=%s\r\n' \
    "$VAULT_NAME_ENCODED" \
    "$NOTE_NAME_ENCODED" \
    > "$URL_FILE_PATH"

# ── 8. Build obsidian://new URI and open it ───────────────────────────────────
# Frontmatter content placed in the note body:
#   ---
#   linked_dir: "file:///path/to/dir"
#   ---
#   (blank line)
FRONTMATTER=$(printf -- '---\nlinked_dir: "%s"\n---\n\n' "$FOLDER_FILE_URI")

CONTENT_ENCODED=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$FRONTMATTER")

OBSIDIAN_URI="obsidian://new?vault=${VAULT_NAME_ENCODED}&file=${NOTE_NAME_ENCODED}&content=${CONTENT_ENCODED}"

# Capture exit code without triggering set -e (FAIL-007).
# Under set -e, a bare "/usr/bin/open ... || true" would suppress the error entirely;
# using "|| OPEN_EXIT=$?" preserves the actual code for the error dialog check.
OPEN_EXIT=0
/usr/bin/open "$OBSIDIAN_URI" || OPEN_EXIT=$?

if [[ $OPEN_EXIT -ne 0 ]]; then
    # FAIL-007: open returned non-zero — Obsidian is likely not installed
    osascript -e 'display dialog "Obsidian not found. Please install Obsidian from obsidian.md and try again." buttons {"OK"} default button "OK" with icon stop'
    exit 1
fi
