import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

function printUsage() {
  console.log([
    'Usage:',
    '  node scripts/generateVoiceOverKeyframes.mjs --storyboard <file.json> --out-dir <dir> [--provider automatic1111|comfyui] [--base-url http://127.0.0.1:7860] [--workflow workflow.json] [--steps 18] [--cfg 6] [--sampler DPM++ 2M Karras] [--model checkpoint] [--overwrite] [--dry-run]',
    '',
    'Providers:',
    '  automatic1111  Uses /sdapi/v1/txt2img directly.',
    '  comfyui        Uses a workflow template JSON with placeholder values.',
    '',
    'ComfyUI workflow placeholders:',
    '  __PROMPT__ __NEGATIVE_PROMPT__ __WIDTH__ __HEIGHT__ __SEED__ __STEPS__ __CFG__ __SAMPLER__',
    '',
    'Output names:',
    '  <segment.id>.png'
  ].join('\n'));
}

function parseArgs(argv = []) {
  const options = {
    provider: 'automatic1111',
    baseUrl: 'http://127.0.0.1:7860',
    steps: 18,
    cfg: 6,
    sampler: 'DPM++ 2M Karras',
    overwrite: false,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--storyboard' && next) {
      options.storyboard = path.resolve(process.cwd(), next);
      index += 1;
    } else if (arg === '--out-dir' && next) {
      options.outDir = path.resolve(process.cwd(), next);
      index += 1;
    } else if (arg === '--provider' && next) {
      options.provider = String(next || '').trim().toLowerCase() || 'automatic1111';
      index += 1;
    } else if (arg === '--base-url' && next) {
      options.baseUrl = String(next || '').trim() || options.baseUrl;
      index += 1;
    } else if (arg === '--workflow' && next) {
      options.workflow = path.resolve(process.cwd(), next);
      index += 1;
    } else if (arg === '--steps' && next) {
      options.steps = Math.max(1, Number(next));
      index += 1;
    } else if (arg === '--cfg' && next) {
      options.cfg = Math.max(1, Number(next));
      index += 1;
    } else if (arg === '--sampler' && next) {
      options.sampler = String(next || '').trim() || options.sampler;
      index += 1;
    } else if (arg === '--model' && next) {
      options.model = String(next || '').trim();
      index += 1;
    } else if (arg === '--overwrite') {
      options.overwrite = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

async function readStoryboard(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.segments) || !parsed.segments.length) {
    throw new Error('Storyboard JSON has no segments.');
  }
  return parsed;
}

function normalizeBaseUrl(value = '') {
  return String(value || '').trim().replace(/\/+$/, '');
}

function outputPathForSegment(outDir, segment) {
  return path.join(outDir, `${segment.id}.png`);
}

async function ensureOutputDir(outDir) {
  await fs.mkdir(outDir, { recursive: true });
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function requestJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} · ${JSON.stringify(data).slice(0, 280)}`);
  }
  return data;
}

async function requestBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText} · ${message.slice(0, 280)}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function setAutomatic1111Model(baseUrl, model) {
  if (!model) return;
  await requestJson(`${baseUrl}/sdapi/v1/options`, {
    sd_model_checkpoint: model
  });
}

async function renderWithAutomatic1111(storyboard, options) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  await ensureOutputDir(options.outDir);
  if (!options.dryRun) {
    await setAutomatic1111Model(baseUrl, options.model);
  }

  for (const segment of storyboard.segments) {
    const outputPath = outputPathForSegment(options.outDir, segment);
    if (!options.overwrite && await exists(outputPath)) {
      console.log(`skip ${segment.id} -> ${outputPath}`);
      continue;
    }

    const payload = {
      prompt: String(segment.prompt || '').trim(),
      negative_prompt: String(segment.negativePrompt || '').trim(),
      seed: Number.isFinite(Number(segment.seed)) ? Number(segment.seed) : -1,
      width: Math.max(256, Number(storyboard?.render?.width || 768)),
      height: Math.max(256, Number(storyboard?.render?.height || 768)),
      steps: Math.max(1, Number(options.steps || 18)),
      cfg_scale: Math.max(1, Number(options.cfg || segment.guidanceScale || 6)),
      sampler_name: String(options.sampler || 'DPM++ 2M Karras').trim(),
      batch_size: 1,
      n_iter: 1,
      restore_faces: false,
      send_images: true,
      save_images: false
    };

    if (options.dryRun) {
      console.log(`[dry-run][automatic1111] ${segment.id} ${JSON.stringify(payload)}`);
      continue;
    }

    const result = await requestJson(`${baseUrl}/sdapi/v1/txt2img`, payload);
    const imageBase64 = Array.isArray(result?.images) ? result.images[0] : '';
    if (!imageBase64) {
      throw new Error(`Automatic1111 returned no image for ${segment.id}.`);
    }
    const cleanBase64 = String(imageBase64).split(',', 1)[0] === imageBase64
      ? imageBase64
      : String(imageBase64).split(',').pop();
    await fs.writeFile(outputPath, Buffer.from(cleanBase64, 'base64'));
    console.log(`saved ${segment.id} -> ${outputPath}`);
  }
}

function replaceTemplatePlaceholders(value, replacements) {
  if (Array.isArray(value)) {
    return value.map((item) => replaceTemplatePlaceholders(item, replacements));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, replaceTemplatePlaceholders(inner, replacements)])
    );
  }
  if (typeof value !== 'string') return value;

  if (Object.prototype.hasOwnProperty.call(replacements, value)) {
    return replacements[value];
  }

  let next = value;
  for (const [token, replacement] of Object.entries(replacements)) {
    next = next.split(token).join(String(replacement));
  }
  return next;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function collectComfyImageRef(historyPayload) {
  const outputs = historyPayload && typeof historyPayload === 'object'
    ? Object.values(historyPayload).flatMap((entry) => Object.values(entry?.outputs || {}))
    : [];
  for (const output of outputs) {
    const images = Array.isArray(output?.images) ? output.images : [];
    if (images[0]?.filename) return images[0];
  }
  return null;
}

async function renderWithComfyUi(storyboard, options) {
  if (!options.workflow) {
    throw new Error('ComfyUI provider requires --workflow <template.json>.');
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl || 'http://127.0.0.1:8188');
  const workflowTemplate = JSON.parse(await fs.readFile(options.workflow, 'utf8'));
  const clientId = crypto.randomUUID();
  await ensureOutputDir(options.outDir);

  for (const segment of storyboard.segments) {
    const outputPath = outputPathForSegment(options.outDir, segment);
    if (!options.overwrite && await exists(outputPath)) {
      console.log(`skip ${segment.id} -> ${outputPath}`);
      continue;
    }

    const replacements = {
      __PROMPT__: String(segment.prompt || '').trim(),
      __NEGATIVE_PROMPT__: String(segment.negativePrompt || '').trim(),
      __WIDTH__: Math.max(256, Number(storyboard?.render?.width || 768)),
      __HEIGHT__: Math.max(256, Number(storyboard?.render?.height || 768)),
      __SEED__: Number.isFinite(Number(segment.seed)) ? Number(segment.seed) : Math.floor(Math.random() * 1000000000),
      __STEPS__: Math.max(1, Number(options.steps || 18)),
      __CFG__: Math.max(1, Number(options.cfg || segment.guidanceScale || 6)),
      __SAMPLER__: String(options.sampler || 'dpmpp_2m').trim()
    };
    const prompt = replaceTemplatePlaceholders(workflowTemplate, replacements);

    if (options.dryRun) {
      console.log(`[dry-run][comfyui] ${segment.id} ${JSON.stringify(prompt).slice(0, 800)}`);
      continue;
    }

    const queued = await requestJson(`${baseUrl}/prompt`, { prompt, client_id: clientId });
    const promptId = String(queued?.prompt_id || '').trim();
    if (!promptId) {
      throw new Error(`ComfyUI returned no prompt_id for ${segment.id}.`);
    }

    let imageRef = null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await sleep(1500);
      const historyResponse = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`);
      const history = await historyResponse.json().catch(() => ({}));
      imageRef = collectComfyImageRef(history);
      if (imageRef?.filename) break;
    }

    if (!imageRef?.filename) {
      throw new Error(`ComfyUI did not finish with an image for ${segment.id}.`);
    }

    const imageUrl = new URL(`${baseUrl}/view`);
    imageUrl.searchParams.set('filename', String(imageRef.filename || ''));
    imageUrl.searchParams.set('subfolder', String(imageRef.subfolder || ''));
    imageUrl.searchParams.set('type', String(imageRef.type || 'output'));
    const buffer = await requestBuffer(String(imageUrl));
    await fs.writeFile(outputPath, buffer);
    console.log(`saved ${segment.id} -> ${outputPath}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.storyboard || !options.outDir) {
    printUsage();
    process.exit(options.help ? 0 : 1);
  }

  const storyboard = await readStoryboard(options.storyboard);
  if (options.provider === 'automatic1111') {
    await renderWithAutomatic1111(storyboard, options);
    return;
  }
  if (options.provider === 'comfyui') {
    if (!options.baseUrl || options.baseUrl === 'http://127.0.0.1:7860') {
      options.baseUrl = 'http://127.0.0.1:8188';
    }
    await renderWithComfyUi(storyboard, options);
    return;
  }

  throw new Error(`Unsupported provider: ${options.provider}`);
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});