import fs from 'fs';

async function run() {
  const key = process.argv[2];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
  
  const prompt = `You are a cinematic sci-fi AI expanding a brain dictionary (Synthetic_Desires).
Generate 20 new highly evocative cyberpunk/noir/philosophical entries for each category.
Output ONLY strict, valid JSON with no markdown wrapping and no backticks:
{
  "themes": ["theme 1", "theme 2"],
  "references": ["ref string 1"],
  "symbols": ["symbol 1"],
  "obsessions": ["obsession concept 1"],
  "quotes": ["quote idea 1"]
}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    
    let textInfo = data.candidates[0].content.parts[0].text;
    if (textInfo.startsWith('```json')) {
        textInfo = textInfo.replace(/```json/g, '').replace(/```/g, '');
    }
    
    fs.writeFileSync('expanded_gemini_seeds.json', textInfo.trim());
    console.log('SUCCESS');
  } catch (err) {
    console.error('Error fetching from Gemini API:', err);
  }
}
run();
