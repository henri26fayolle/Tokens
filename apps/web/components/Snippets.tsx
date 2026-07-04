'use client';

import { useState } from 'react';

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:4000';

type Provider = 'anthropic' | 'openai';
type Lang = 'python' | 'typescript' | 'curl';

function snippet(provider: Provider, lang: Lang, key: string): string {
  const k = key || 'YOUR_KAIDEN_KEY';
  if (provider === 'anthropic') {
    if (lang === 'python')
      return `from anthropic import Anthropic

client = Anthropic(
    base_url="${GATEWAY}/anthropic",
    default_headers={"X-Kaiden-Key": "${k}"},
)  # your ANTHROPIC_API_KEY works exactly as before`;
    if (lang === 'typescript')
      return `import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  baseURL: '${GATEWAY}/anthropic',
  defaultHeaders: { 'X-Kaiden-Key': '${k}' },
}); // your ANTHROPIC_API_KEY works exactly as before`;
    return `curl ${GATEWAY}/anthropic/v1/messages \\
  -H "x-api-key: $ANTHROPIC_API_KEY" \\
  -H "X-Kaiden-Key: ${k}" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{"model":"claude-sonnet-5","max_tokens":64,"messages":[{"role":"user","content":"hello kaiden"}]}'`;
  }
  if (lang === 'python')
    return `from openai import OpenAI

client = OpenAI(
    base_url="${GATEWAY}/openai/v1",
    default_headers={"X-Kaiden-Key": "${k}"},
)  # your OPENAI_API_KEY works exactly as before`;
  if (lang === 'typescript')
    return `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: '${GATEWAY}/openai/v1',
  defaultHeaders: { 'X-Kaiden-Key': '${k}' },
}); // your OPENAI_API_KEY works exactly as before`;
  return `curl ${GATEWAY}/openai/v1/chat/completions \\
  -H "Authorization: Bearer $OPENAI_API_KEY" \\
  -H "X-Kaiden-Key: ${k}" \\
  -H "content-type: application/json" \\
  -d '{"model":"gpt-5.2","messages":[{"role":"user","content":"hello kaiden"}]}'`;
}

export function Snippets({ kaidenKey }: { kaidenKey: string }) {
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [lang, setLang] = useState<Lang>('python');
  const [copied, setCopied] = useState(false);

  const code = snippet(provider, lang, kaidenKey);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <div className="tabs">
        {(['anthropic', 'openai'] as const).map((p) => (
          <button
            key={p}
            type="button"
            className={provider === p ? 'active' : ''}
            onClick={() => setProvider(p)}
          >
            {p === 'anthropic' ? 'Anthropic' : 'OpenAI'}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {(['python', 'typescript', 'curl'] as const).map((l) => (
          <button
            key={l}
            type="button"
            className={lang === l ? 'active' : ''}
            onClick={() => setLang(l)}
          >
            {l}
          </button>
        ))}
      </div>
      <pre className="snippet">{code}</pre>
      <button type="button" className="btn" style={{ marginTop: 10 }} onClick={copy}>
        {copied ? '✓ Copied' : 'Copy snippet'}
      </button>
    </div>
  );
}
