import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export const dataDir = path.resolve(process.env.COMICS_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)),'../data'));
export const interval = Math.max(15,Number(process.env.COMICS_SYNC_MINUTES)||30)*60000;
const chromeInstalled = process.platform === 'win32' && [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean).some(base => existsSync(path.join(base, 'Google/Chrome/Application/chrome.exe')));
export const collectorOptions = { dataDir, channel:process.env.COMICS_BROWSER_CHANNEL || (chromeInstalled ? 'chrome' : undefined), headless:process.env.COMICS_HEADLESS !== 'false' };
