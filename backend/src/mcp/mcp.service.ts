import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnitHealth } from '../common/health';
import { McpContentService } from './mcp.content';
import {
  JsonRpcId,
  JsonRpcResponse,
  Lang,
  Localised,
  RPC,
  SiteContent,
} from './mcp.types';

/**
 * A read-only Model Context Protocol server: an agent pointed at the API can ask
 * about Jules — the résumé, the projects, the skills and the evidence for them, and
 * what Jules is doing now — and nothing it can call writes anything.
 *
 * Hand-written rather than `@modelcontextprotocol/sdk`. It is stateless Streamable
 * HTTP answered with plain JSON: `initialize`, `ping`, `tools/*` and `resources/*`,
 * no sessions, no server-sent stream, no sampling, nothing the SDK's machinery would
 * be here for. Off by default (`MCP_ENABLED`), limited per IP by the existing guard,
 * and — like `ask` — nothing asked of it is logged.
 */

/** Newest first: the first is what a client asking for something else is offered. */
export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const LOCALE_INPUT = {
  type: 'object',
  properties: {
    locale: {
      type: 'string',
      enum: ['en', 'fr'],
      description: 'Language of the answer. English when left out.',
    },
  },
  additionalProperties: false,
} as const;

interface Tool {
  name: string;
  title: string;
  description: string;
  render: (content: SiteContent, lang: Lang) => string;
}

const pick = <T>(value: Localised<T>, lang: Lang): T => value[lang] ?? value.en;

function profileText(c: SiteContent, lang: Lang): string {
  const p = c.profile;
  return [
    `${p.name} (${p.alias})`,
    `${pick(p.role, lang)} · ${p.employer} · ${p.location}`,
    `${p.availability.open ? '●' : '○'} ${pick(p.availability.note, lang)}`,
    '',
    ...pick(p.bio, lang),
    '',
    `${lang === 'fr' ? 'Langues' : 'Languages'}: ${pick(p.languages, lang)}`,
    `Email: ${p.email}`,
    `${lang === 'fr' ? 'Site' : 'Website'}: ${c.site}`,
  ].join('\n');
}

function projectsText(c: SiteContent, lang: Lang): string {
  return c.projects
    .map((p) =>
      [
        `${p.name} [${p.status}]`,
        `  ${pick(p.description, lang)}`,
        `  stack: ${p.stack.join(', ')}`,
        ...(p.repo ? [`  source: ${p.repo}`] : []),
        ...(p.live ? [`  live: ${p.live}`] : []),
      ].join('\n'),
    )
    .join('\n\n');
}

function skillsText(c: SiteContent, lang: Lang): string {
  const shown = c.skills.filter((s) => s.usedIn.length);
  const plain = c.skills.filter((s) => !s.usedIn.length).map((s) => s.name);
  return [
    ...shown.map(
      (s) =>
        `${s.name}: ${s.usedIn.map((e) => `${pick(e.what, lang)} (${e.url})`).join('; ')}`,
    ),
    '',
    `${lang === 'fr' ? 'Aussi' : 'Also'}: ${plain.join(', ')}`,
  ].join('\n');
}

function nowText(c: SiteContent, lang: Lang): string {
  const stale =
    c.now.staleDays === null
      ? ''
      : lang === 'fr'
        ? ` (vieux de ${c.now.staleDays} jours au moment du build : probablement dépassé)`
        : ` (${c.now.staleDays} days old at build time: probably out of date)`;
  return [
    `${lang === 'fr' ? 'Mis à jour le' : 'Updated'} ${c.now.updated}${stale}`,
    ...c.now.entries.map((e) => `- ${e.category}: ${pick(e.text, lang)}`),
  ].join('\n');
}

function resumeText(c: SiteContent, lang: Lang): string {
  const fr = lang === 'fr';
  return [
    profileText(c, lang),
    '',
    fr ? 'COMPÉTENCES' : 'SKILLS',
    c.skills.map((s) => s.name).join(', '),
    '',
    fr ? 'PROJETS' : 'PROJECTS',
    projectsText(c, lang),
    '',
    fr ? 'LIENS' : 'LINKS',
    ...c.links.map((l) => `${l.label}: ${l.href.replace(/^mailto:/, '')}`),
  ].join('\n');
}

export const TOOLS: Tool[] = [
  {
    name: 'get_profile',
    title: 'Profile',
    description:
      'Who Jules Hémery is: role, employer, location, whether open to work, a short bio, languages and how to get in touch.',
    render: profileText,
  },
  {
    name: 'get_resume',
    title: 'Résumé',
    description:
      'The whole résumé as plain text: profile, skills, projects and links.',
    render: resumeText,
  },
  {
    name: 'list_projects',
    title: 'Projects',
    description: 'Projects with their status, description, stack and links.',
    render: projectsText,
  },
  {
    name: 'list_skills',
    title: 'Skills',
    description:
      'Skills, each with where it is actually used on jhemery.xyz or in its source, so the claim can be checked.',
    render: skillsText,
  },
  {
    name: 'get_now',
    title: 'Now',
    description:
      'What Jules is doing at the moment (a /now page), with the date it was last updated.',
    render: nowText,
  },
];

interface Resource {
  uri: string;
  name: string;
  mimeType: string;
  description: string;
  read: (content: SiteContent) => string;
}

export const RESOURCES: Resource[] = [
  {
    uri: 'jhemery://resume',
    name: 'resume',
    mimeType: 'text/plain',
    description: 'The résumé, in English.',
    read: (c) => resumeText(c, 'en'),
  },
  {
    uri: 'jhemery://resume/fr',
    name: 'resume-fr',
    mimeType: 'text/plain',
    description: 'Le CV, en français.',
    read: (c) => resumeText(c, 'fr'),
  },
  {
    uri: 'jhemery://profile',
    name: 'profile',
    mimeType: 'application/json',
    description: 'The profile, both languages.',
    read: (c) => JSON.stringify(c.profile, null, 2),
  },
  {
    uri: 'jhemery://projects',
    name: 'projects',
    mimeType: 'application/json',
    description: 'Every project, both languages.',
    read: (c) => JSON.stringify(c.projects, null, 2),
  },
  {
    uri: 'jhemery://skills',
    name: 'skills',
    mimeType: 'application/json',
    description: 'Every skill and its evidence.',
    read: (c) => JSON.stringify(c.skills, null, 2),
  },
  {
    uri: 'jhemery://now',
    name: 'now',
    mimeType: 'application/json',
    description: 'The /now list and its date.',
    read: (c) => JSON.stringify(c.now, null, 2),
  },
];

const INSTRUCTIONS =
  'Read-only facts about Jules Hémery (Couvbat), a full-stack developer in France: ' +
  'the résumé, projects, skills with evidence, and what Jules is doing now, in English ' +
  'or French. Nothing here writes anything and nothing asked is logged. ' +
  'The same content is on https://jhemery.xyz.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class McpService {
  constructor(
    private readonly config: ConfigService,
    private readonly source: McpContentService,
  ) {}

  get enabled(): boolean {
    return this.config.get<string>('MCP_ENABLED') === 'true';
  }

  health(): UnitHealth {
    if (!this.enabled)
      return { unit: 'mcp', state: 'inactive', reason: 'disabled' };
    if (!this.config.get<string>('FRONTEND_URL')) {
      return { unit: 'mcp', state: 'inactive', reason: 'unconfigured' };
    }
    return { unit: 'mcp', state: 'active', cacheAge: this.source.age };
  }

  /**
   * One JSON-RPC message in, one response out — or `null` for a notification, or for
   * a response the client sent us (neither gets an answer).
   */
  async handle(message: unknown): Promise<JsonRpcResponse | null> {
    if (!isRecord(message) || message.jsonrpc !== '2.0') {
      return this.error(null, RPC.invalidRequest, 'Not a JSON-RPC 2.0 message');
    }
    if (typeof message.method !== 'string') {
      // A client's reply to a server request: this server never sends any.
      return 'result' in message || 'error' in message
        ? null
        : this.error(null, RPC.invalidRequest, 'Missing method');
    }
    const id = message.id as JsonRpcId | null | undefined;
    const notification = id === undefined;
    if (notification || message.method.startsWith('notifications/'))
      return null;

    const params = isRecord(message.params) ? message.params : {};
    try {
      return {
        jsonrpc: '2.0',
        id,
        result: await this.call(message.method, params),
      };
    } catch (err) {
      if (err instanceof RpcError) return this.error(id, err.code, err.message);
      const text =
        err instanceof HttpException ? err.message : 'Internal error';
      return this.error(id, RPC.internalError, text);
    }
  }

  private async call(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    switch (method) {
      case 'initialize': {
        const asked =
          typeof params.protocolVersion === 'string'
            ? params.protocolVersion
            : '';
        return {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked)
            ? asked
            : PROTOCOL_VERSIONS[0],
          capabilities: {
            tools: { listChanged: false },
            resources: { listChanged: false, subscribe: false },
          },
          serverInfo: {
            name: 'jhemery.xyz',
            title: 'Jules Hémery',
            version: '1.0.0',
          },
          instructions: INSTRUCTIONS,
        };
      }
      case 'ping':
        return {};
      case 'tools/list':
        return {
          tools: TOOLS.map((tool) => ({
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: LOCALE_INPUT,
            annotations: {
              readOnlyHint: true,
              destructiveHint: false,
              openWorldHint: false,
            },
          })),
        };
      case 'tools/call':
        return this.callTool(params);
      case 'resources/list':
        return {
          resources: RESOURCES.map(({ uri, name, mimeType, description }) => ({
            uri,
            name,
            mimeType,
            description,
          })),
        };
      case 'resources/read': {
        const resource = RESOURCES.find((r) => r.uri === params.uri);
        if (!resource)
          throw new RpcError(
            RPC.invalidParams,
            `Unknown resource: ${String(params.uri)}`,
          );
        const content = await this.source.content();
        return {
          contents: [
            {
              uri: resource.uri,
              mimeType: resource.mimeType,
              text: resource.read(content),
            },
          ],
        };
      }
      case 'resources/templates/list':
        return { resourceTemplates: [] };
      default:
        throw new RpcError(RPC.methodNotFound, `Method not found: ${method}`);
    }
  }

  /** A failure inside a tool is the tool's result, per the protocol, not a JSON-RPC error. */
  private async callTool(params: Record<string, unknown>): Promise<unknown> {
    const tool = TOOLS.find((t) => t.name === params.name);
    if (!tool)
      throw new RpcError(
        RPC.invalidParams,
        `Unknown tool: ${String(params.name)}`,
      );
    const args = isRecord(params.arguments) ? params.arguments : {};
    if (
      args.locale !== undefined &&
      args.locale !== 'en' &&
      args.locale !== 'fr'
    ) {
      throw new RpcError(RPC.invalidParams, 'locale must be "en" or "fr"');
    }
    const lang: Lang = args.locale === 'fr' ? 'fr' : 'en';
    try {
      const content = await this.source.content();
      return { content: [{ type: 'text', text: tool.render(content, lang) }] };
    } catch {
      return {
        content: [
          {
            type: 'text',
            text: 'The site content is unavailable right now; https://jhemery.xyz has the same information.',
          },
        ],
        isError: true,
      };
    }
  }

  private error(
    id: JsonRpcId | null | undefined,
    code: number,
    message: string,
  ): JsonRpcResponse {
    return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
  }
}

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}
