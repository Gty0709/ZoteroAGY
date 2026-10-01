export class TokenStore {
  private static prefix(): string {
    return addon.data.config.prefsPrefix;
  }

  static setAccessToken(token: string, expiresIn: number): void {
    Zotero.Prefs.set(`${this.prefix()}.accessToken`, token, true);
    Zotero.Prefs.set(
      `${this.prefix()}.tokenExpiry`,
      Date.now() + expiresIn * 1000,
      true,
    );
    addon.data.auth.accessToken = token;
  }
  static getAccessToken(): string | null {
    return (
      (Zotero.Prefs.get(`${this.prefix()}.accessToken`, true) as string) || null
    );
  }
  static setRefreshToken(token: string): void {
    Zotero.Prefs.set(`${this.prefix()}.refreshToken`, token, true);
    addon.data.auth.refreshToken = token;
  }
  static getRefreshToken(): string | null {
    return (
      (Zotero.Prefs.get(`${this.prefix()}.refreshToken`, true) as string) ||
      null
    );
  }
  static setUserInfo(info: {
    name: string;
    email: string;
    avatar: string;
  }): void {
    Zotero.Prefs.set(`${this.prefix()}.userInfo`, JSON.stringify(info), true);
    addon.data.auth.userInfo = info;
  }
  static getUserInfo(): { name: string; email: string; avatar: string } | null {
    try {
      const raw = Zotero.Prefs.get(`${this.prefix()}.userInfo`, true) as string;
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  static clearAll(): void {
    for (const key of [
      "accessToken",
      "refreshToken",
      "tokenExpiry",
      "userInfo",
    ]) {
      Zotero.Prefs.set(`${this.prefix()}.${key}`, "", true);
    }
    addon.data.auth = { accessToken: null, refreshToken: null, userInfo: null };
  }
  static isTokenExpired(): boolean {
    const expiry = Zotero.Prefs.get(
      `${this.prefix()}.tokenExpiry`,
      true,
    ) as number;
    return !expiry || Date.now() > expiry - 60000;
  }
}
