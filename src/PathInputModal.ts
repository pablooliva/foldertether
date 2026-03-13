import { App, Modal, Setting } from 'obsidian';

/**
 * Fallback modal for manual directory path entry when remote.dialog is unavailable.
 * EDGE-007 / REQ-001: text-input fallback required from day one.
 */
export class PathInputModal extends Modal {
    private onSubmit: (path: string) => void;
    private onCancel: () => void;
    private inputValue = '';
    private submitted = false;

    constructor(app: App, onSubmit: (path: string) => void, onCancel: () => void) {
        super(app);
        this.onSubmit = onSubmit;
        this.onCancel = onCancel;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Enter directory path' });
        contentEl.createEl('p', {
            text: 'Paste the full path to the directory you want to link (e.g. /Users/you/Projects/MyProject).',
            cls: 'folder-tether-modal-desc',
        });

        new Setting(contentEl)
            .setName('Directory path')
            .addText(text => {
                text.setPlaceholder('/path/to/directory');
                text.onChange(value => { this.inputValue = value.trim(); });
                // Allow submit on Enter key
                text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
                    if (e.key === 'Enter') { this.submit(); }
                });
                // Focus the input immediately
                setTimeout(() => text.inputEl.focus(), 50);
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Link')
                .setCta()
                .onClick(() => this.submit()))
            .addButton(btn => btn
                .setButtonText('Cancel')
                .onClick(() => this.close()));
    }

    private submit() {
        if (!this.inputValue) return;
        this.submitted = true;
        this.close();
        this.onSubmit(this.inputValue);
    }

    onClose() {
        this.contentEl.empty();
        if (!this.submitted) {
            this.onCancel();
        }
    }
}
