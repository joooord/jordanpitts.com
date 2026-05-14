// scripts/llm.ts
// Provider-agnostic LLM client. The model string determines the adapter.
// Supports Anthropic (Claude), OpenAI (GPT, o-series), and Google (Gemini).
//
// New providers can be added by extending detectProvider + the switch.

import Anthropic from '@anthropic-ai/sdk'

export type LLMRole = 'user' | 'assistant'

export interface LLMMessage {
  role: LLMRole
  content: string
}

export interface LLMCallOptions {
  model: string
  system: string
  messages: LLMMessage[]
  maxTokens?: number
}

export type LLMProvider = 'anthropic' | 'openai' | 'google'

export function detectProvider(model: string): LLMProvider {
  const m = model.toLowerCase()
  if (m.startsWith('claude-')) return 'anthropic'
  if (m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) return 'openai'
  if (m.startsWith('gemini-')) return 'google'
  throw new Error(`Cannot detect provider for model: ${model}. Expected prefix claude-*, gpt-*, o1*, o3*, o4*, or gemini-*.`)
}

export async function callLLM(opts: LLMCallOptions): Promise<string> {
  const provider = detectProvider(opts.model)
  switch (provider) {
    case 'anthropic': return callAnthropic(opts)
    case 'openai': return callOpenAI(opts)
    case 'google': return callGoogle(opts)
  }
}

// ---------- Anthropic ----------

async function callAnthropic(opts: LLMCallOptions): Promise<string> {
  const client = new Anthropic()
  const response = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 64000,
    system: opts.system,
    messages: opts.messages.map(m => ({ role: m.role, content: m.content })),
  })
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')
}

// ---------- OpenAI ----------

async function callOpenAI(opts: LLMCallOptions): Promise<string> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY not set')

  // The Responses API would be cleaner, but Chat Completions is more universally supported.
  const body = {
    model: opts.model,
    messages: [
      { role: 'system', content: opts.system },
      ...opts.messages.map(m => ({ role: m.role, content: m.content })),
    ],
    // Some o-series models reject max_tokens in favour of max_completion_tokens.
    // Use max_completion_tokens when the model name starts with o.
    ...(opts.model.startsWith('o')
      ? { max_completion_tokens: opts.maxTokens ?? 16384 }
      : { max_tokens: opts.maxTokens ?? 16384 }),
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${await safeReadText(res)}`)
  }
  const data = await res.json() as {
    choices: { message: { content: string | null } }[]
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenAI returned empty content')
  return content
}

// ---------- Google (Gemini) ----------

async function callGoogle(opts: LLMCallOptions): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not set')

  const contents = opts.messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents,
        generationConfig: { maxOutputTokens: opts.maxTokens ?? 8192 },
      }),
    },
  )
  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${await safeReadText(res)}`)
  }
  const data = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? ''
  if (!text) throw new Error('Gemini returned empty content')
  return text
}

// ---------- Helpers ----------

async function safeReadText(res: Response): Promise<string> {
  try { return await res.text() } catch { return '(no body)' }
}
