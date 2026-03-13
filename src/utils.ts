/**
 * Encode a local filesystem path as a file:// URI.
 * Uses per-segment encodeURIComponent to safely handle #, ?, &, =, spaces, etc.
 * NEVER use encodeURI() on filesystem paths.
 */
export function pathToFileUri(absolutePath: string): string {
    const encoded = absolutePath
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');
    return `file://${encoded}`;
}

/**
 * Sanitize a note basename for use as a filesystem filename.
 * Replaces characters that are illegal or ambiguous in filenames.
 */
export function sanitizeNoteName(name: string): string {
    return name
        .replace(/:/g, '-')
        .replace(/\//g, '-')
        .replace(/\0/g, '');
}

/**
 * Convert a file:// URI back to an absolute filesystem path.
 * Decodes percent-encoding per path segment (inverse of pathToFileUri).
 * Returns null if the URI does not start with 'file://'.
 */
export function fileUriToPath(uri: string): string | null {
    if (!uri.startsWith('file://')) return null;
    const withoutScheme = uri.slice('file://'.length);
    return withoutScheme
        .split('/')
        .map(segment => decodeURIComponent(segment))
        .join('/');
}

/**
 * Build an obsidian://open URI for a note.
 * @param vaultName - The vault name (raw, will be encoded)
 * @param notePath - The note path relative to vault root, without extension (e.g. "Projects/Alpha")
 */
export function buildObsidianOpenUri(vaultName: string, notePath: string): string {
    const vault = encodeURIComponent(vaultName);
    // notePath may contain '/' (subfolder separator) — encodeURIComponent encodes '/' as '%2F',
    // which is correct here since the entire path is a query-parameter value.
    const file = encodeURIComponent(notePath);
    return `obsidian://open?vault=${vault}&file=${file}`;
}

/**
 * Build the content of a .url (INI InternetShortcut) file.
 * Uses CRLF line endings per the INI/Windows Internet Shortcut spec.
 */
export function buildUrlFileContent(uri: string): string {
    return `[InternetShortcut]\r\nURL=${uri}\r\n`;
}

