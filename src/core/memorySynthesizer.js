import { loadMemories } from '../brainMemory.js';

export class MemorySynthesizer {
  constructor(options = {}) {
    this.aiEngine = options.aiEngine;
  }

  async synthesizeProfile(movieSlug) {
    const memories = loadMemories(movieSlug);
    if (memories.length < 5) return null; // Need enough data to synthesize

    // Extract top topics/themes from memories
    const textBlob = memories.slice(0, 10).map(m => m.response).join(' ');
    
    // Ask the cloud to summarize the "mood" of these memories
    const prompt = `Based on these dialogue snippets from an AI persona in the film "${movieSlug}", synthesize a 1-sentence "Persona Profile" that defines her current mood and philosophical focus:\n\n${textBlob}`;

    try {
      const resp = await this.aiEngine.callCloudProxy({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 100 }
      });
      const data = await resp.json();
      const profile = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      
      if (profile) {
        this.aiEngine.personaContext = profile;
        if (this.aiEngine.voiceManager) {
          this.aiEngine.voiceManager.personaContext = profile; // Sync with legacy for now
        }
      }
      return profile;
    } catch (err) {
      console.warn('[MemorySynthesizer] Profile synthesis failed:', err);
      return null;
    }
  }
}
