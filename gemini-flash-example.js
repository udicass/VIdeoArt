require('dotenv').config();
const fetch = require('node-fetch');

const API_KEY = process.env.GEMINI_FLASH_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + API_KEY;

async function callGemini(prompt) {
  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });
  const data = await response.json();
  return data;
}

// Example usage:
(async () => {
  const result = await callGemini('Hello, Gemini Flash!');
  console.log(JSON.stringify(result, null, 2));
})();
