import {
    pathToFileUri,
    fileUriToPath,
    sanitizeNoteName,
    buildObsidianOpenUri,
    buildUrlFileContent,
} from '../utils';

describe('pathToFileUri', () => {
    it('encodes spaces', () => {
        expect(pathToFileUri('/Users/pablo/My Projects/Alpha'))
            .toBe('file:///Users/pablo/My%20Projects/Alpha');
    });

    it('encodes # character (EDGE-001)', () => {
        expect(pathToFileUri('/Users/pablo/dir#1'))
            .toBe('file:///Users/pablo/dir%231');
    });

    it('encodes ? character (EDGE-001)', () => {
        expect(pathToFileUri('/Users/pablo/dir?q=1'))
            .toBe('file:///Users/pablo/dir%3Fq%3D1');
    });

    it('encodes & character (EDGE-001)', () => {
        expect(pathToFileUri('/tmp/foo&bar'))
            .toBe('file:///tmp/foo%26bar');
    });

    it('encodes = character (EDGE-001)', () => {
        expect(pathToFileUri('/tmp/foo=bar'))
            .toBe('file:///tmp/foo%3Dbar');
    });

    it('preserves path separators', () => {
        expect(pathToFileUri('/a/b/c')).toBe('file:///a/b/c');
    });

    it('handles root-level path', () => {
        expect(pathToFileUri('/tmp')).toBe('file:///tmp');
    });

    it('handles path with unicode', () => {
        const result = pathToFileUri('/Users/pablo/Ñoño');
        expect(result).toBe('file:///Users/pablo/%C3%91o%C3%B1o');
    });
});

describe('fileUriToPath', () => {
    it('round-trips with pathToFileUri for simple path', () => {
        const p = '/Users/pablo/Projects/Alpha';
        expect(fileUriToPath(pathToFileUri(p))).toBe(p);
    });

    it('round-trips with pathToFileUri for path with spaces', () => {
        const p = '/Users/pablo/My Projects/Alpha';
        expect(fileUriToPath(pathToFileUri(p))).toBe(p);
    });

    it('round-trips with pathToFileUri for path with # and ? (EDGE-001)', () => {
        const p = '/Users/pablo/dir#1/foo?bar';
        expect(fileUriToPath(pathToFileUri(p))).toBe(p);
    });

    it('round-trips with pathToFileUri for unicode path', () => {
        const p = '/Users/pablo/Ñoño';
        expect(fileUriToPath(pathToFileUri(p))).toBe(p);
    });

    it('returns null for non-file:// URI', () => {
        expect(fileUriToPath('obsidian://open?vault=X')).toBeNull();
        expect(fileUriToPath('https://example.com')).toBeNull();
        expect(fileUriToPath('')).toBeNull();
    });

    it('decodes a known file:// URI correctly', () => {
        expect(fileUriToPath('file:///Users/pablo/My%20Projects/Alpha'))
            .toBe('/Users/pablo/My Projects/Alpha');
    });
});

describe('sanitizeNoteName', () => {
    it('replaces colon with dash (EDGE-002)', () => {
        expect(sanitizeNoteName('Project: Alpha')).toBe('Project- Alpha');
    });

    it('replaces slash with dash (EDGE-002)', () => {
        expect(sanitizeNoteName('path/to/note')).toBe('path-to-note');
    });

    it('removes null bytes', () => {
        expect(sanitizeNoteName('foo\0bar')).toBe('foobar');
    });

    it('leaves normal names unchanged', () => {
        expect(sanitizeNoteName('My Project Note')).toBe('My Project Note');
    });

    it('handles percent sign (EDGE-010)', () => {
        // % is valid in a filename; should not be altered
        expect(sanitizeNoteName('100% Done')).toBe('100% Done');
    });

    it('replaces multiple colons and slashes', () => {
        expect(sanitizeNoteName('a:b/c:d')).toBe('a-b-c-d');
    });
});

describe('buildObsidianOpenUri', () => {
    it('encodes vault and file names', () => {
        const uri = buildObsidianOpenUri('My Vault', 'My Note');
        expect(uri).toBe('obsidian://open?vault=My%20Vault&file=My%20Note');
    });

    it('encodes subfolder path (EDGE-004) — slash becomes %2F', () => {
        const uri = buildObsidianOpenUri('Personal', 'Projects/Alpha');
        expect(uri).toBe('obsidian://open?vault=Personal&file=Projects%2FAlpha');
    });

    it('encodes percent in note name (EDGE-010) — % becomes %25', () => {
        const uri = buildObsidianOpenUri('Personal', '100% Done');
        expect(uri).toBe('obsidian://open?vault=Personal&file=100%25%20Done');
    });

    it('encodes special URI chars in vault name', () => {
        const uri = buildObsidianOpenUri('Vault#1', 'Note');
        expect(uri).toBe('obsidian://open?vault=Vault%231&file=Note');
    });
});

describe('buildUrlFileContent', () => {
    it('produces correct INI format with CRLF line endings', () => {
        const content = buildUrlFileContent('obsidian://open?vault=X&file=Y');
        expect(content).toBe('[InternetShortcut]\r\nURL=obsidian://open?vault=X&file=Y\r\n');
    });

    it('includes the full URI unchanged', () => {
        const uri = 'obsidian://open?vault=My%20Vault&file=My%20Note';
        const content = buildUrlFileContent(uri);
        expect(content).toContain(`URL=${uri}`);
    });
});
