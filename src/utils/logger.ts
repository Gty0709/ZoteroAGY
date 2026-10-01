const PREFIX = '[ZoteroAGY]';
export class Logger {
  static log(...args: any[]): void { Zotero.debug(`${PREFIX} ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`); }
  static warn(...args: any[]): void { Zotero.debug(`${PREFIX} [WARN] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`); }
  static error(...args: any[]): void { Zotero.debug(`${PREFIX} [ERROR] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`); }
  static debug(...args: any[]): void { if (__env__ === 'development') Zotero.debug(`${PREFIX} [DEBUG] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`); }
}
