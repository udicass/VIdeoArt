import fs from 'fs';
import path from 'path';

const newModel = process.argv[2];

if (!newModel) {
  console.error("Usage: node setModel.mjs <model_name>");
  process.exit(1);
}

const voiceManagerPath = path.join(process.cwd(), 'src', 'voiceManager.js');

try {
  let content = fs.readFileSync(voiceManagerPath, 'utf8');
  
  // Replace the default model assignment
  const updatedContent = content.replace(
    /this\._ollamaModel = '[^']+';/,
    `this._ollamaModel = '${newModel}';`
  );

  fs.writeFileSync(voiceManagerPath, updatedContent);
  console.log(`✅ Default Ollama model updated to: ${newModel}`);
} catch (err) {
  console.error("Failed to update model:", err);
  process.exit(1);
}
