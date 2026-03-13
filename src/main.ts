import {
    App,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
    TFile,
} from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import {
    pathToFileUri,
    fileUriToPath,
    sanitizeNoteName,
    buildObsidianOpenUri,
    buildUrlFileContent,
} from './utils';
import { PathInputModal } from './PathInputModal';

// ─── Settings ──────────────────────────────────────────────────────────────

interface FolderTetherSettings {
    deleteUrlOnNoteDelete: boolean;
}

const DEFAULT_SETTINGS: FolderTetherSettings = {
    deleteUrlOnNoteDelete: false,
};

// ─── Plugin ────────────────────────────────────────────────────────────────

export default class FolderTetherPlugin extends Plugin {
    settings: FolderTetherSettings = DEFAULT_SETTINGS;

    // Write-guard: prevents re-entrant metadataCache 'changed' events caused by
    // our own processFrontMatter() calls (REQ-007).
    private _isWritingFrontmatter = false;

    // Track which notes have already shown a broken-link notice this session (REQ-008).
    private _brokenLinkNoticesShown = new Set<string>();

    // Track the last-known linked_dir value per file path for change detection (REQ-007).
    private _lastKnownLinkedDir = new Map<string, string>();

    async onload() {
        await this.loadSettings();

        // Register "Link note to directory" command (REQ-001)
        this.addCommand({
            id: 'link-note-to-directory',
            name: 'Link note to directory',
            checkCallback: (checking: boolean) => {
                const file = this.app.workspace.getActiveFile();
                if (!file) return false;
                if (!checking) this.linkNoteToDirectory(file);
                return true;
            },
        });

        // Register "Open linked directory" command (REQ-004)
        this.addCommand({
            id: 'open-linked-directory',
            name: 'Open linked directory',
            checkCallback: (checking: boolean) => {
                const file = this.app.workspace.getActiveFile();
                if (!file) return false;
                const linkedDir = this.getLinkedDir(file);
                if (!linkedDir) return false;
                if (!checking) this.openLinkedDirectory(file);
                return true;
            },
        });

        // Ribbon icon — always visible; open linked dir or show notice (UX-001)
        const ribbonIcon = this.addRibbonIcon('folder-open', 'Open linked directory', () => {
            const file = this.app.workspace.getActiveFile();
            if (!file) return; // no-op when no note active
            const linkedDir = this.getLinkedDir(file);
            if (!linkedDir) {
                new Notice("No linked directory. Use 'Link note to directory' command first.");
                return;
            }
            this.openLinkedDirectory(file);
        });
        ribbonIcon.addClass('folder-tether-ribbon');

        // Settings tab
        this.addSettingTab(new FolderTetherSettingTab(this.app, this));

        // Lifecycle hooks — inside onLayoutReady to avoid vault-load race conditions
        this.app.workspace.onLayoutReady(() => {
            // Register linked_dir as url type on startup (REQ-003)
            this.setPropertyType();

            // Rename: update .url filename (REQ-005)
            this.registerEvent(
                this.app.vault.on('rename', (file, oldPath) => {
                    if (file instanceof TFile && file.extension === 'md') {
                        this.updateUrlFile(file, oldPath);
                    }
                })
            );

            // Delete: handle .url file (REQ-006)
            this.registerEvent(
                this.app.vault.on('delete', (file) => {
                    if (file instanceof TFile && file.extension === 'md') {
                        this.handleNoteDeletion(file);
                    }
                })
            );

            // Frontmatter change: detect manual linked_dir edits (REQ-007)
            this.registerEvent(
                this.app.metadataCache.on('changed', (file) => {
                    if (this._isWritingFrontmatter) return;
                    if (file instanceof TFile && file.extension === 'md') {
                        this.handleFrontmatterChange(file);
                    }
                })
            );

            // File open: detect broken links (REQ-008)
            this.registerEvent(
                this.app.workspace.on('file-open', (file) => {
                    if (!file) return; // null = all tabs closed
                    this.checkLinkedDirExists(file);
                })
            );
        });
    }

    onunload() {}

    // ─── Settings ─────────────────────────────────────────────────────────

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // ─── Property Type Registration ────────────────────────────────────────

    private setPropertyType() {
        try {
            const mtm = (this.app as any).metadataTypeManager;
            if (mtm && typeof mtm.setType === 'function') {
                // Only set if not already set to avoid unnecessary writes
                const existing = typeof mtm.getAssignedType === 'function'
                    ? mtm.getAssignedType('linked_dir')
                    : null;
                if (!existing) {
                    mtm.setType('linked_dir', 'url');
                }
            }
        } catch (e) {
            console.warn('[FolderTether] metadataTypeManager unavailable; linked_dir will display as plain text.', e);
        }
    }

    // ─── Core Link Creation ────────────────────────────────────────────────

    async linkNoteToDirectory(file: TFile) {
        // Try native folder picker first; fall back to text-input modal (REQ-001, EDGE-007)
        let dirPath: string | null = null;

        try {
            const { remote } = require('electron');
            const result = await remote.dialog.showOpenDialog({
                title: 'Select directory to link',
                properties: ['openDirectory'],
            });
            if (result.canceled || !result.filePaths.length) return;
            dirPath = result.filePaths[0];
        } catch (e) {
            // remote.dialog unavailable — show text-input fallback (EDGE-007)
            console.warn('[FolderTether] remote.dialog unavailable, using fallback modal.', e);
            await new Promise<void>(resolve => {
                new PathInputModal(
                    this.app,
                    (inputPath) => { dirPath = inputPath; resolve(); },
                    () => { resolve(); }  // cancel: dirPath stays null, unblocks the await
                ).open();
            });
        }

        if (!dirPath) return;

        // Validate directory (FAIL-001, FAIL-002, SEC-001)
        if (!fs.existsSync(dirPath)) {
            new Notice(`Directory not found: ${dirPath}. Please check the path and try again.`);
            return;
        }
        try {
            fs.accessSync(dirPath, fs.constants.W_OK);
        } catch {
            new Notice(`Cannot write to ${dirPath} — permission denied. Choose a writable directory.`);
            return;
        }

        const vaultName = this.app.vault.getName();
        // notePath: path relative to vault root, without extension
        const notePath = file.path.replace(/\.md$/, '');

        // Write .url file FIRST (atomic order — FAIL-003, FAIL-008)
        let urlFilePath: string;
        try {
            urlFilePath = this.createUrlFile(dirPath, vaultName, notePath, file.basename);
        } catch (e: any) {
            new Notice(`Failed to create back-link file: ${e.message}`);
            return;
        }

        // Write frontmatter (FAIL-008 compensating transaction)
        const linkedDirUri = pathToFileUri(dirPath);
        try {
            this._isWritingFrontmatter = true;
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm['linked_dir'] = linkedDirUri;
            });
        } catch (e: any) {
            // Compensating transaction: attempt to delete the .url file we just wrote
            try {
                fs.unlinkSync(urlFilePath);
                new Notice(`Link creation failed: ${e.message}. No changes were made.`);
            } catch (deleteErr: any) {
                new Notice(
                    `Link creation partially failed — a back-link file was written to ${dirPath} ` +
                    `but the note's frontmatter was not updated. Please check both manually.`
                );
                console.error('[FolderTether] FAIL-008: both processFrontMatter and compensation failed.', e, deleteErr);
            }
            return;
        } finally {
            this._isWritingFrontmatter = false;
        }

        // Record last-known value to avoid spurious change detection (REQ-007)
        this._lastKnownLinkedDir.set(file.path, linkedDirUri);

        new Notice(`Linked to: ${dirPath}`);
    }

    /**
     * Create a .url file in dirPath pointing back to the given note.
     * Returns the full path of the file written (needed for FAIL-008 compensation).
     * Handles EDGE-011 (pre-existing .url file).
     */
    private createUrlFile(
        dirPath: string,
        vaultName: string,
        notePath: string,
        noteBasename: string
    ): string {
        const sanitized = sanitizeNoteName(noteBasename);
        const urlFileName = `${sanitized}.url`;
        const urlFilePath = path.join(dirPath, urlFileName);
        const uri = buildObsidianOpenUri(vaultName, notePath);
        const content = buildUrlFileContent(uri);

        // EDGE-011: check for pre-existing .url file
        if (fs.existsSync(urlFilePath)) {
            const existing = fs.readFileSync(urlFilePath, 'utf8');
            const existingUriMatch = existing.match(/^URL=(.+)$/m);
            const existingUri = existingUriMatch ? existingUriMatch[1].trim() : null;
            if (existingUri === uri) {
                // Idempotent: same target, skip write
                return urlFilePath;
            }
            console.warn(`[FolderTether] Overwrote existing .url file at ${urlFilePath} — previous target: ${existingUri}`);
        }

        fs.writeFileSync(urlFilePath, content, 'utf8');
        return urlFilePath;
    }

    // ─── Open Linked Directory ─────────────────────────────────────────────

    private openLinkedDirectory(file: TFile) {
        const linkedDir = this.getLinkedDir(file);
        if (!linkedDir) {
            new Notice("No linked directory. Use 'Link note to directory' command first.");
            return;
        }
        // Convert file:// URI back to a filesystem path for shell.openPath()
        const dirPath = fileUriToPath(linkedDir);
        if (!dirPath) {
            new Notice('Cannot open directory: linked_dir is not a valid file:// URI.');
            return;
        }
        const { shell } = require('electron');
        shell.openPath(dirPath).then((error: string) => {
            if (error) {
                new Notice(`Failed to open directory: ${error}`);
            }
        });
    }

    // ─── Lifecycle Hooks ───────────────────────────────────────────────────

    private async updateUrlFile(file: TFile, oldPath: string) {
        const linkedDir = this.getLinkedDir(file);
        if (!linkedDir) return;

        const dirPath = fileUriToPath(linkedDir);
        if (!dirPath || !fs.existsSync(dirPath)) return;

        const oldBasename = path.basename(oldPath, '.md');
        const oldUrlFileName = `${sanitizeNoteName(oldBasename)}.url`;
        const oldUrlFilePath = path.join(dirPath, oldUrlFileName);

        // Delete old .url (FAIL-006: if missing, just log and continue)
        if (fs.existsSync(oldUrlFilePath)) {
            try {
                fs.unlinkSync(oldUrlFilePath);
            } catch (e) {
                console.warn(`[FolderTether] FAIL-006: Could not delete old .url at ${oldUrlFilePath}`, e);
            }
        } else {
            console.warn(`[FolderTether] FAIL-006: Old .url not found at ${oldUrlFilePath}, skipping delete.`);
        }

        // Create new .url
        const vaultName = this.app.vault.getName();
        const notePath = file.path.replace(/\.md$/, '');
        try {
            this.createUrlFile(dirPath, vaultName, notePath, file.basename);
        } catch (e: any) {
            new Notice(`Failed to update back-link file after rename: ${e.message}`);
        }
    }

    private handleNoteDeletion(file: TFile) {
        // vault.on('delete') fires after the file is gone from the vault, so
        // metadataCache may already be purged. Use _lastKnownLinkedDir (populated
        // on file-open and link creation) as the primary source.
        const linkedDir = this._lastKnownLinkedDir.get(file.path) ?? this.getLinkedDir(file);
        if (!linkedDir) return;

        if (!this.settings.deleteUrlOnNoteDelete) return;

        const dirPath = fileUriToPath(linkedDir);
        if (!dirPath) return;

        const urlFileName = `${sanitizeNoteName(file.basename)}.url`;
        const urlFilePath = path.join(dirPath, urlFileName);

        if (fs.existsSync(urlFilePath)) {
            try {
                fs.unlinkSync(urlFilePath);
            } catch (e: any) {
                console.warn(`[FolderTether] Could not delete .url on note delete: ${e.message}`);
            }
        }
    }

    private async handleFrontmatterChange(file: TFile) {
        if (this._isWritingFrontmatter) return;

        const newLinkedDir = this.getLinkedDir(file);
        const previousLinkedDir = this._lastKnownLinkedDir.get(file.path);

        // No change, or no linked_dir present
        if (newLinkedDir === previousLinkedDir) return;

        // Update tracking map
        if (newLinkedDir) {
            this._lastKnownLinkedDir.set(file.path, newLinkedDir);
        } else {
            this._lastKnownLinkedDir.delete(file.path);
        }

        // If there was a previous linked_dir, clean up the old .url
        if (previousLinkedDir) {
            const oldDirPath = fileUriToPath(previousLinkedDir);
            if (oldDirPath && fs.existsSync(oldDirPath)) {
                const oldUrlFilePath = path.join(oldDirPath, `${sanitizeNoteName(file.basename)}.url`);
                if (fs.existsSync(oldUrlFilePath)) {
                    try {
                        fs.unlinkSync(oldUrlFilePath);
                    } catch (e) {
                        console.warn('[FolderTether] Could not delete old .url on frontmatter change.', e);
                    }
                }
            }
        }

        // If there's a new linked_dir, create a new .url
        if (newLinkedDir) {
            const newDirPath = fileUriToPath(newLinkedDir);
            if (!newDirPath || !fs.existsSync(newDirPath)) {
                new Notice(`Linked directory not found: ${newDirPath ?? newLinkedDir}. The link may be stale.`);
                return;
            }
            const vaultName = this.app.vault.getName();
            const notePath = file.path.replace(/\.md$/, '');
            try {
                this.createUrlFile(newDirPath, vaultName, notePath, file.basename);
            } catch (e: any) {
                new Notice(`Failed to create back-link file after frontmatter change: ${e.message}`);
            }
        }
    }

    private checkLinkedDirExists(file: TFile) {
        const linkedDir = this.getLinkedDir(file);
        if (!linkedDir) return;

        // Seed the map while the file and its metadata are still live.
        // This ensures handleNoteDeletion can read linked_dir even after the
        // file is removed from the vault and the metadataCache is purged.
        this._lastKnownLinkedDir.set(file.path, linkedDir);

        const dirPath = fileUriToPath(linkedDir);
        if (!dirPath) return;

        // Show each notice at most once per session per note (REQ-008).
        if (this._brokenLinkNoticesShown.has(file.path)) return;

        if (!fs.existsSync(dirPath)) {
            this._brokenLinkNoticesShown.add(file.path);
            new Notice(`Linked directory not found: ${dirPath}. The link may be stale.`);
            return;
        }

        // EDGE-008: linked_dir set manually without .url — check for back-link
        const urlFileName = `${sanitizeNoteName(file.basename)}.url`;
        const urlFilePath = path.join(dirPath, urlFileName);
        if (!fs.existsSync(urlFilePath)) {
            this._brokenLinkNoticesShown.add(file.path);
            new Notice(
                `No back-link found in ${dirPath}. Run 'Link note to directory' to create one.`,
                8000
            );
        }
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    /**
     * Read the linked_dir frontmatter value from a note's cached metadata.
     * Returns null if not present.
     */
    private getLinkedDir(file: TFile): string | null {
        const cache = this.app.metadataCache.getFileCache(file);
        const linkedDir = cache?.frontmatter?.['linked_dir'];
        if (!linkedDir || typeof linkedDir !== 'string') return null;
        return linkedDir;
    }

}


// ─── Settings Tab ──────────────────────────────────────────────────────────

class FolderTetherSettingTab extends PluginSettingTab {
    plugin: FolderTetherPlugin;

    constructor(app: App, plugin: FolderTetherPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Delete back-link file when note is deleted')
            .setDesc(
                'When a linked note is deleted, also delete the .url file from the linked directory. ' +
                'If off, the .url file is left as an orphan.'
            )
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.deleteUrlOnNoteDelete)
                .onChange(async (value) => {
                    this.plugin.settings.deleteUrlOnNoteDelete = value;
                    await this.plugin.saveSettings();
                }));
    }
}
