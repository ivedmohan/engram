#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ensureDaemonRunning, daemonFetch, daemonFetchText } from '../daemon/rpc.js';

// Resolve the project cwd the agent is actually working in. MCP "roots" are deprecated as of the
// newest spec, so an explicit env var set by the client's MCP config is the primary mechanism —
// process.cwd() is only a fallback for clients that launch the server inside the workspace dir.
const CWD = process.env.ENGRAM_CWD || process.cwd();
const TOOL = process.env.ENGRAM_TOOL || 'unknown-mcp-client';

const callDaemon = daemonFetch;

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

const server = new McpServer({ name: 'engram', version: '0.1.0' });

server.registerTool(
  'engram_recall',
  {
    title: 'Recall project memory',
    description:
      "Search the user's shared memory across all their AI tools (Claude Code, Cursor, Gemini CLI, etc.) " +
      'for facts, decisions and preferences about the CURRENT project. Call this before answering questions ' +
      'about project conventions, past decisions, architecture choices, or user preferences — the answer may ' +
      'have been decided in a different tool than the one you are running in, and stale decisions are marked ' +
      'as superseded rather than silently returned.',
    inputSchema: {
      query: z.string().describe('What you want to know, in natural language, e.g. "what framework does the relayer use"'),
      limit: z.number().optional().describe('Max number of memories to return (default 8)'),
    },
  },
  async ({ query, limit }) => {
    const result = await callDaemon<{ results: any[] }>('POST', '/recall', { query, cwd: CWD, limit });
    if (result.results.length === 0) {
      return textResult('No memories found for that query in this project.');
    }
    const lines = result.results.map((m) => {
      const sup = m.supersedes ? ` (supersedes: "${m.supersedes.text}")` : '';
      return `- [${m.kind}] ${m.text}${sup} — via ${m.tool ?? 'unknown tool'}`;
    });
    return textResult(lines.join('\n'));
  },
);

server.registerTool(
  'engram_remember',
  {
    title: 'Remember a decision or preference',
    description:
      'Save a durable fact, decision or preference to shared memory so other AI tools (Claude Code, Cursor, ' +
      'Gemini CLI, etc.) can see it later. Use this when the user makes an explicit decision ("let\'s use X"), ' +
      'states a standing preference ("always do Y in this repo"), or asks you to remember something. Do not ' +
      'use it for transient context, chit-chat, or anything already obvious from the code.',
    inputSchema: {
      text: z.string().describe('The memory, as one atomic, present-tense statement, e.g. "Relayer uses Hono"'),
      kind: z.enum(['fact', 'decision', 'preference', 'task', 'context']).optional().default('fact'),
      scope: z
        .enum(['project', 'global'])
        .optional()
        .default('project')
        .describe('"global" only for preferences that apply across all the user\'s projects'),
    },
  },
  async ({ text, kind, scope }) => {
    const result = await callDaemon<{ id: string; duplicate: boolean }>('POST', '/memories', {
      text,
      kind,
      scope,
      cwd: CWD,
      tool: TOOL,
    });
    return textResult(result.duplicate ? `Already remembered (id: ${result.id})` : `Remembered (id: ${result.id})`);
  },
);

server.registerTool(
  'engram_project_context',
  {
    title: 'Get project memory context',
    description:
      'Get a compact summary of the current active memories (decisions, preferences, facts) for this project ' +
      'and the user\'s global preferences. Useful at the start of a task to load in what is already known.',
    inputSchema: {},
  },
  async () => {
    const text = await daemonFetchText(`/context?cwd=${encodeURIComponent(CWD)}`);
    return textResult(text);
  },
);

server.registerTool(
  'engram_forget',
  {
    title: 'Forget a memory',
    description: 'Mark a memory as forgotten by its id (from engram_recall or engram_explain) so it is no longer served to any tool.',
    inputSchema: {
      memoryId: z.string(),
      scope: z.enum(['project', 'global']).optional().default('project'),
    },
  },
  async ({ memoryId, scope }) => {
    await callDaemon('POST', '/forget', { memoryId, scope, cwd: CWD });
    return textResult(`Forgot memory ${memoryId}`);
  },
);

server.registerTool(
  'engram_explain',
  {
    title: 'Explain a memory',
    description:
      'Get full provenance for a memory by id: which tool and session captured it, when, what entities it ' +
      'involves, and its supersession chain (what it replaced, if anything).',
    inputSchema: {
      memoryId: z.string(),
      scope: z.enum(['project', 'global']).optional().default('project'),
    },
  },
  async ({ memoryId, scope }) => {
    const result = await callDaemon<any>(
      'GET',
      `/explain/${encodeURIComponent(memoryId)}?cwd=${encodeURIComponent(CWD)}&scope=${scope}`,
    );
    return textResult(JSON.stringify(result, null, 2));
  },
);

await ensureDaemonRunning();
await server.connect(new StdioServerTransport());
console.error(`[engram-mcp] connected — tool=${TOOL} cwd=${CWD}`);
