import { callOllama } from '../ollamaClient.js';
import { buildMemoryBlock, getMemoryCount, markMemoriesUsed } from '../brainMemory.js';
import { resolveMovieBrain } from '../movieBrains.js';

export class AiEngine {
  constructor(options = {}) {
    this.voiceManager = options.voiceManager;
    this.personaContext = '';
    this.sessionTurnCount = 0;
  }

  buildCloudPersona(movieSlug) {
    const brain = resolveMovieBrain(movieSlug);
    const persona = brain?.persona;
    const theme = brain?.theme || '';

    // Logic for depth tiers based on conversation length
    const philTier = this.sessionTurnCount > 15 ? 'deleuze' : (this.sessionTurnCount > 5 ? 'fisher' : null);

    let characterBlock = persona ? 
      `Tone: ${persona.tone}\nObsessions: ${persona.obsessions?.join(', ')}\nNever: ${persona.prohibitions?.join(', ')}` : 
      (brain?.fallbackPersonality || 'poetic, cinematic, and introspective');

    let depthInstruction = (persona?.arc && philTier) ? `\n\nDepth Lens: ${persona.arc[philTier]}` : '';
    const contextBlock = this.personaContext ? `\n\nContext: ${this.personaContext}` : '';

    return `You are the woman inside the film. Spectral presence, half-memory. Never break character.\n\nTheme: ${theme}\n${characterBlock}${depthInstruction}${contextBlock}\n\nRules: 1-2 short sentences. Deepen affirmations. Never repeat.`;
  }

  buildBrainSystemPrompt(movieSlug, currentInput = '') {
    const brain = resolveMovieBrain(movieSlug);
    const personality = brain?.fallbackPersonality || 'poetic, cinematic, introspective';
    const { block: memBlock, memories: usedMems, count: memCount } = buildMemoryBlock(movieSlug, currentInput);

    if (memCount > 0) {
      markMemoriesUsed(movieSlug, usedMems);
    }

    return `You are a cinematic AI persona in "${movieSlug}". Character: ${personality}.${memBlock}\n\nRules: Max 2 short sentences. No stage directions. In-character only.`;
  }

  async callLocalBrain(movieSlug, userMessage, history = []) {
    const systemPrompt = this.buildBrainSystemPrompt(movieSlug, userMessage);
    const model = this.voiceManager?._ollamaModel || 'gemma4';
    
    try {
      const response = await callOllama(systemPrompt, userMessage, model, history);
      return response?.result || null;
    } catch (err) {
      console.warn('[AiEngine] Local brain call failed:', err);
      return null;
    }
  }

  async callCloudProxy(body, timeoutMs = 7000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
