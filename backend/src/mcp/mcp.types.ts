/**
 * `content.json` as the frontend's résumé plugin emits it (version 1). Mirrored rather
 * than imported: the two apps deploy separately, and the backend checks `version`
 * before trusting any field.
 */
export type Lang = 'en' | 'fr';
export type Localised<T = string> = Record<Lang, T>;

export interface SiteContent {
  version: 1;
  generatedAt: string;
  site: string;
  profile: {
    name: string;
    alias: string;
    role: Localised;
    employer: string;
    location: string;
    email: string;
    languages: Localised;
    bio: Localised<string[]>;
    availability: { open: boolean; note: Localised };
  };
  skills: Array<{
    name: string;
    usedIn: Array<{ what: Localised; url: string }>;
  }>;
  projects: Array<{
    name: string;
    description: Localised;
    stack: string[];
    status: string;
    repo?: string;
    live?: string;
  }>;
  links: Array<{ label: string; href: string }>;
  now: {
    updated: string;
    staleDays: number | null;
    entries: Array<{ category: string; text: Localised }>;
  };
}

// ---------------------------------------------------------------------------
// JSON-RPC 2.0, the slice of it MCP uses
// ---------------------------------------------------------------------------

export type JsonRpcId = string | number;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId | null;
  method: string;
  params?: Record<string, unknown>;
}

export type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: JsonRpcId | null; result: unknown }
  | {
      jsonrpc: '2.0';
      id: JsonRpcId | null;
      error: { code: number; message: string };
    };

/** The standard's error codes, the only ones this server ever sends. */
export const RPC = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;
