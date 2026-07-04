'use client';

import { useState } from 'react';
import { CheckIcon } from './icons';

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:4000';

interface CopyBlock {
  label?: string;
  code: string;
}

interface Guide {
  id: string;
  label: string;
  intro: string;
  blocks: (gw: string, key: string) => CopyBlock[];
  note?: string;
}

/**
 * Tool-first connect guides. Two auth forms exist on purpose:
 *  - header form (X-Kaiden-Key) for SDKs and anything that can set headers;
 *  - key-in-path form (/k/<key>/…) for tools that only accept a base URL
 *    (Cursor, OpenWebUI). The path URL is secret-equivalent to the key.
 */
const GUIDES: Guide[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    intro: 'Two environment variables — every coding session becomes XP.',
    blocks: (gw, key) => [
      {
        label: 'In your shell profile (~/.zshrc)',
        code: `export ANTHROPIC_BASE_URL="${gw}/anthropic"\nexport ANTHROPIC_CUSTOM_HEADERS="X-Kaiden-Key: ${key}"`,
      },
    ],
    note: 'Applies when Claude Code authenticates with an Anthropic API key.',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    intro: 'Cursor accepts a base URL but not custom headers — use the key-in-path URL.',
    blocks: (gw, key) => [
      {
        label: 'Settings → Models → API Keys → Override OpenAI Base URL',
        code: `${gw}/k/${key}/openai/v1`,
      },
    ],
    note: 'Keep your own OpenAI API key in the key field, exactly as before. Treat the URL as a secret — it contains your Kaiden key.',
  },
  {
    id: 'openwebui',
    label: 'OpenWebUI',
    intro: 'Point a connection at the gateway with the key-in-path URL.',
    blocks: (gw, key) => [
      {
        label: 'Admin → Settings → Connections → OpenAI API → API Base URL',
        code: `${gw}/k/${key}/openai/v1`,
      },
    ],
    note: 'API key field keeps your provider key. The URL contains your Kaiden key — treat it as a secret.',
  },
  {
    id: 'python',
    label: 'Python',
    intro: 'One base URL and one default header on your existing client.',
    blocks: (gw, key) => [
      {
        label: 'Anthropic',
        code: `from anthropic import Anthropic\n\nclient = Anthropic(\n    base_url="${gw}/anthropic",\n    default_headers={"X-Kaiden-Key": "${key}"},\n)`,
      },
      {
        label: 'OpenAI',
        code: `from openai import OpenAI\n\nclient = OpenAI(\n    base_url="${gw}/openai/v1",\n    default_headers={"X-Kaiden-Key": "${key}"},\n)`,
      },
    ],
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    intro: 'One base URL and one default header on your existing client.',
    blocks: (gw, key) => [
      {
        label: 'Anthropic',
        code: `import Anthropic from '@anthropic-ai/sdk';\n\nconst client = new Anthropic({\n  baseURL: '${gw}/anthropic',\n  defaultHeaders: { 'X-Kaiden-Key': '${key}' },\n});`,
      },
      {
        label: 'OpenAI',
        code: `import OpenAI from 'openai';\n\nconst client = new OpenAI({\n  baseURL: '${gw}/openai/v1',\n  defaultHeaders: { 'X-Kaiden-Key': '${key}' },\n});`,
      },
    ],
  },
  {
    id: 'curl',
    label: 'curl',
    intro: 'The fastest way to see your first event land.',
    blocks: (gw, key) => [
      {
        code: `curl ${gw}/anthropic/v1/messages \\\n  -H "x-api-key: $ANTHROPIC_API_KEY" \\\n  -H "X-Kaiden-Key: ${key}" \\\n  -H "anthropic-version: 2023-06-01" \\\n  -H "content-type: application/json" \\\n  -d '{"model":"claude-sonnet-5","max_tokens":64,"messages":[{"role":"user","content":"hello kaiden"}]}'`,
      },
    ],
  },
];

function CopyableBlock({ block }: { block: CopyBlock }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(block.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{ marginBottom: 10 }}>
      {block.label && (
        <div className="faint" style={{ fontSize: 12, marginBottom: 4 }}>
          {block.label}
        </div>
      )}
      <pre className="snippet">{block.code}</pre>
      <button type="button" className="btn" style={{ marginTop: 8 }} onClick={copy}>
        {copied ? (
          <>
            <CheckIcon size={16} /> Copied
          </>
        ) : (
          'Copy'
        )}
      </button>
    </div>
  );
}

export function ToolGuides({ kaidenKey }: { kaidenKey: string }) {
  const [active, setActive] = useState('claude-code');
  const key = kaidenKey || 'YOUR_KAIDEN_KEY';
  const guide = GUIDES.find((g) => g.id === active) ?? GUIDES[0];
  if (!guide) return null;

  return (
    <div>
      <div className="tabs">
        {GUIDES.map((g) => (
          <button
            key={g.id}
            type="button"
            className={active === g.id ? 'active' : ''}
            onClick={() => setActive(g.id)}
          >
            {g.label}
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 14, margin: '4px 0 12px' }}>
        {guide.intro}
      </p>
      {guide.blocks(GATEWAY, key).map((block) => (
        <CopyableBlock key={block.code} block={block} />
      ))}
      {guide.note && (
        <p className="faint" style={{ fontSize: 12, marginTop: 4 }}>
          {guide.note}
        </p>
      )}
    </div>
  );
}
