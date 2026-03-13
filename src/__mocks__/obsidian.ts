// Minimal Obsidian API mock for unit tests
export class Plugin {
    app: any;
    manifest: any;
    constructor(app: any, manifest: any) {
        this.app = app;
        this.manifest = manifest;
    }
    addCommand(_: any) {}
    addRibbonIcon(_: any, __: any, ___: any) { return { addClass: () => {} }; }
    addSettingTab(_: any) {}
    loadData() { return Promise.resolve({}); }
    saveData(_: any) { return Promise.resolve(); }
    registerEvent(_: any) {}
}

export class PluginSettingTab {
    app: any;
    plugin: any;
    containerEl: any;
    constructor(app: any, plugin: any) {
        this.app = app;
        this.plugin = plugin;
        this.containerEl = { empty: () => {}, createEl: () => ({}) };
    }
}

export class Setting {
    constructor(_: any) {}
    setName(_: any) { return this; }
    setDesc(_: any) { return this; }
    addToggle(_: any) { return this; }
}

export class Modal {
    app: any;
    contentEl: any;
    constructor(app: any) {
        this.app = app;
        this.contentEl = { empty: () => {}, createEl: () => ({}) };
    }
    open() {}
    close() {}
}

export class Notice {
    constructor(_: string, __?: number) {}
}

export class TFile {
    path: string;
    basename: string;
    name: string;
    constructor(path: string) {
        this.path = path;
        this.name = path.split('/').pop() ?? path;
        this.basename = this.name.replace(/\.[^.]+$/, '');
    }
}
