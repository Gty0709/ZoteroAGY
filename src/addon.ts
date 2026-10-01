import { config } from "../package.json";
import { ColumnOptions, DialogHelper } from "zotero-plugin-toolkit";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  contexts?: ContextItem[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  agyConversationId?: string;
}

export interface ContextItem {
  id: string;
  type: "selection" | "annotation" | "abstract" | "title";
  text: string;
  source?: string;
  page?: number;
  color?: string;
  itemKey?: string;
  annotationKey?: string;
  libraryID?: number;
}

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    env: "development" | "production";
    initialized?: boolean;
    ztoolkit: ZToolkit;
    locale?: { current: any };
    prefs?: {
      window: Window;
      columns: Array<ColumnOptions>;
      rows: Array<{ [dataKey: string]: string }>;
    };
    dialog?: DialogHelper;
    chat: {
      conversations: Map<string, Conversation>;
      activeConversationId: string | null;
      contexts: ContextItem[];
    };
    auth: {
      accessToken: string | null;
      refreshToken: string | null;
      userInfo: { name: string; email: string; avatar: string } | null;
    };
    sidebar: { browser: any | null; visible: boolean };
  };
  public hooks: typeof hooks;
  public api: object;

  constructor() {
    this.data = {
      alive: true,
      config,
      env: __env__,
      initialized: false,
      ztoolkit: createZToolkit(),
      chat: {
        conversations: new Map(),
        activeConversationId: null,
        contexts: [],
      },
      auth: { accessToken: null, refreshToken: null, userInfo: null },
      sidebar: { browser: null, visible: false },
    };
    this.hooks = hooks;
    this.api = {};
  }
}
export default Addon;
