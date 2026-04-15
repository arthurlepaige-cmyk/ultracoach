/**
 * Module IA central — priorité : Ollama (local) → Groq → Anthropic
 */
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

async function callAI(systemPrompt, userMessage) {
  // 1. Ollama (priorité — local, gratuit, privé)
  try {
    const { Ollama } = require('ollama');
    const ollama = new Ollama({ host: OLLAMA_HOST });
    const models = await ollama.list();
    if (models.models?.length > 0) {
      const resp = await ollama.chat({
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      });
      return { text: resp.message.content, provider: 'ollama', model: OLLAMA_MODEL };
    }
  } catch { /* Ollama non disponible */ }

  // 2. Groq (cloud, si clé configurée)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    const Groq = require('groq-sdk');
    const groq = new Groq({ apiKey: groqKey });
    const resp = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 4096,
    });
    return { text: resp.choices[0].message.content, provider: 'groq', model: GROQ_MODEL };
  }

  // 3. Anthropic (fallback cloud)
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: anthropicKey });
    const msg = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    return { text: msg.content[0].text, provider: 'anthropic', model: 'claude-opus-4-6' };
  }

  throw new Error('Aucun fournisseur IA disponible. Lance Ollama (ollama serve) ou configure GROQ_API_KEY dans .env');
}

async function getAIStatus() {
  const status = { ollama: false, groq: false, anthropic: false, active: null, model: null };

  try {
    const { Ollama } = require('ollama');
    const ollama = new Ollama({ host: OLLAMA_HOST });
    const models = await ollama.list();
    status.ollama = models.models?.length > 0;
    if (status.ollama) { status.active = 'ollama'; status.model = OLLAMA_MODEL; }
  } catch { /* ok */ }

  if (process.env.GROQ_API_KEY) {
    status.groq = true;
    if (!status.active) { status.active = 'groq'; status.model = GROQ_MODEL; }
  }

  if (process.env.ANTHROPIC_API_KEY) {
    status.anthropic = true;
    if (!status.active) { status.active = 'anthropic'; status.model = 'claude-opus-4-6'; }
  }

  return status;
}

module.exports = { callAI, getAIStatus };
