/**
 * Module IA central — priorité : Groq → Ollama → Anthropic
 */
const Groq = require('groq-sdk');
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral';

async function callAI(systemPrompt, userMessage) {
  // 1. Groq (priorité)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
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

  // 2. Ollama (local, si disponible)
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

  // 3. Anthropic (fallback)
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    throw new Error('Aucun fournisseur IA configuré. Ajoutez GROQ_API_KEY dans le fichier .env');
  }
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

async function getAIStatus() {
  const status = { groq: false, ollama: false, anthropic: false, active: null };

  if (process.env.GROQ_API_KEY) {
    status.groq = true;
    status.active = 'groq';
  }

  try {
    const { Ollama } = require('ollama');
    const ollama = new Ollama({ host: OLLAMA_HOST });
    const models = await ollama.list();
    status.ollama = models.models?.length > 0;
    if (!status.active && status.ollama) status.active = 'ollama';
  } catch { /* ok */ }

  if (process.env.ANTHROPIC_API_KEY) {
    status.anthropic = true;
    if (!status.active) status.active = 'anthropic';
  }

  return status;
}

module.exports = { callAI, getAIStatus };
