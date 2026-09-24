import { ConfigService } from '@nestjs/config';
import { McpContentService } from './mcp.content';
import { McpService, PROTOCOL_VERSIONS, RESOURCES, TOOLS } from './mcp.service';
import { RPC, SiteContent } from './mcp.types';

const CONTENT: SiteContent = {
  version: 1,
  generatedAt: '2026-09-24T00:00:00.000Z',
  site: 'https://jhemery.xyz',
  profile: {
    name: 'Jules Hémery',
    alias: 'Couvbat',
    role: { en: 'Full-Stack Developer', fr: 'Développeur Full-Stack' },
    employer: 'In-Leed',
    location: 'France',
    email: 'contact@jhemery.xyz',
    languages: { en: 'French · English', fr: 'Français · Anglais' },
    bio: { en: ['Hello.'], fr: ['Bonjour.'] },
    availability: {
      open: true,
      note: { en: 'Open to work', fr: 'Disponible' },
    },
  },
  skills: [
    {
      name: 'WebAssembly',
      usedIn: [
        {
          what: {
            en: 'ffmpeg in the browser',
            fr: 'ffmpeg dans le navigateur',
          },
          url: 'https://jhemery.xyz/tools/ffmpeg',
        },
      ],
    },
    { name: 'PHP', usedIn: [] },
  ],
  projects: [
    {
      name: 'jhemery-portfolio',
      description: { en: 'This site.', fr: 'Ce site.' },
      stack: ['Vue 3'],
      status: 'production',
      repo: 'https://github.com/Couvbat/jhemery',
    },
  ],
  links: [{ label: 'Email', href: 'mailto:contact@jhemery.xyz' }],
  now: {
    updated: '2026-09-24',
    staleDays: null,
    entries: [
      { category: 'building', text: { en: 'Things.', fr: 'Des choses.' } },
    ],
  },
};

function build(
  env: Record<string, string> = {
    MCP_ENABLED: 'true',
    FRONTEND_URL: 'https://jhemery.xyz',
  },
  fail = false,
) {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  const content = jest.fn(() =>
    fail ? Promise.reject(new Error('down')) : Promise.resolve(CONTENT),
  );
  const source = { content, age: null } as unknown as McpContentService;
  return { service: new McpService(config, source), content };
}

const rpc = (method: string, params?: Record<string, unknown>) => ({
  jsonrpc: '2.0',
  id: 1,
  method,
  ...(params ? { params } : {}),
});

/** No `id`: a notification, which gets no answer. */
const notify = (method: string, params?: Record<string, unknown>) => ({
  jsonrpc: '2.0',
  method,
  ...(params ? { params } : {}),
});

describe('McpService', () => {
  it('negotiates the protocol version: the client’s if known, the newest otherwise', async () => {
    const { service } = build();
    const known = await service.handle(
      rpc('initialize', { protocolVersion: '2025-03-26' }),
    );
    expect(known).toMatchObject({
      id: 1,
      result: {
        protocolVersion: '2025-03-26',
        serverInfo: { name: 'jhemery.xyz' },
      },
    });
    const unknown = await service.handle(
      rpc('initialize', { protocolVersion: '1999-01-01' }),
    );
    expect(unknown).toMatchObject({
      result: { protocolVersion: PROTOCOL_VERSIONS[0] },
    });
  });

  it('declares tools and resources, and nothing that could write', async () => {
    const { service } = build();
    const init = await service.handle(rpc('initialize', {}));
    expect(init).toMatchObject({
      result: { capabilities: { tools: {}, resources: {} } },
    });
    expect(JSON.stringify(init)).not.toMatch(/sampling|elicitation/);

    const tools = (await service.handle(rpc('tools/list'))) as {
      result: {
        tools: Array<{ name: string; annotations: { readOnlyHint: boolean } }>;
      };
    };
    expect(tools.result.tools.map((t) => t.name)).toEqual(
      TOOLS.map((t) => t.name),
    );
    expect(tools.result.tools.every((t) => t.annotations.readOnlyHint)).toBe(
      true,
    );
  });

  it('answers a tool call in the language asked for', async () => {
    const { service } = build();
    const en = await service.handle(
      rpc('tools/call', { name: 'get_profile', arguments: {} }),
    );
    const fr = await service.handle(
      rpc('tools/call', { name: 'get_profile', arguments: { locale: 'fr' } }),
    );
    expect(JSON.stringify(en)).toContain('Full-Stack Developer');
    expect(JSON.stringify(fr)).toContain('Développeur Full-Stack');
  });

  it('shows the evidence behind each skill', async () => {
    const { service } = build();
    const reply = (await service.handle(
      rpc('tools/call', { name: 'list_skills' }),
    )) as { result: { content: Array<{ text: string }> } };
    expect(reply.result.content[0].text).toContain(
      'WebAssembly: ffmpeg in the browser (https://jhemery.xyz/tools/ffmpeg)',
    );
    expect(reply.result.content[0].text).toContain('Also: PHP');
  });

  it('reads every resource it lists', async () => {
    const { service } = build();
    for (const resource of RESOURCES) {
      const reply = (await service.handle(
        rpc('resources/read', { uri: resource.uri }),
      )) as { result: { contents: Array<{ uri: string; text: string }> } };
      expect(reply.result.contents[0].uri).toBe(resource.uri);
      expect(reply.result.contents[0].text.length).toBeGreaterThan(0);
    }
  });

  it('turns an unreachable content file into a tool error, not a protocol error', async () => {
    const { service } = build(undefined, true);
    expect(
      await service.handle(rpc('tools/call', { name: 'get_now' })),
    ).toMatchObject({ result: { isError: true } });
  });

  it('uses the standard errors for what it does not know', async () => {
    const { service } = build();
    expect(
      await service.handle(rpc('tools/call', { name: 'rm_rf' })),
    ).toMatchObject({ error: { code: RPC.invalidParams } });
    expect(
      await service.handle(
        rpc('tools/call', { name: 'get_now', arguments: { locale: 'de' } }),
      ),
    ).toMatchObject({ error: { code: RPC.invalidParams } });
    expect(
      await service.handle(
        rpc('resources/read', { uri: 'file:///etc/passwd' }),
      ),
    ).toMatchObject({ error: { code: RPC.invalidParams } });
    expect(await service.handle(rpc('sampling/createMessage'))).toMatchObject({
      error: { code: RPC.methodNotFound },
    });
    expect(await service.handle({ hello: 'world' })).toMatchObject({
      id: null,
      error: { code: RPC.invalidRequest },
    });
  });

  it('never answers a notification, and ignores a client’s responses', async () => {
    const { service, content } = build();
    expect(
      await service.handle(notify('notifications/initialized')),
    ).toBeNull();
    expect(
      await service.handle(notify('tools/call', { name: 'get_now' })),
    ).toBeNull();
    expect(
      await service.handle({ jsonrpc: '2.0', id: 3, result: {} }),
    ).toBeNull();
    // A notification does no work either.
    expect(content).not.toHaveBeenCalled();
  });

  it('reports its health from its flags', () => {
    expect(build({}).service.health()).toEqual({
      unit: 'mcp',
      state: 'inactive',
      reason: 'disabled',
    });
    expect(build({ MCP_ENABLED: 'true' }).service.health()).toEqual({
      unit: 'mcp',
      state: 'inactive',
      reason: 'unconfigured',
    });
    expect(build().service.health()).toEqual({
      unit: 'mcp',
      state: 'active',
      cacheAge: null,
    });
  });
});
