import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const workRoot = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-10';
const frameCount = 12;
const width = 512;
const height = 512;

const track = {
  name: 'VOC',
  seed: 713168000,
  frameDir: path.join(workRoot, 'androids_dream_VOC_FRESH_CONTENT_V42_frames'),
  subject: 'one adult human woman, unmistakably feminine face, natural human skin, dark shoulder-length hair, clearly human',
  identity: 'same exact recurring woman, one face, one person, stable identity across every frame'
};

// 12 genuinely NEW beats: distinct mood, lighting, and micro-compositional treatments
// so the content is novel, while framing/identity stays fixed (no deviation).
const beats = [
  { expression: 'neutral calm direct gaze, quiet resolve', light: 'even soft studio light, muted ash gray', detail: 'relaxed jaw, steady unblinking eyes, plain dark coat' },
  { expression: 'subtle concern growing behind the eyes', light: 'low warm candlelight from the side', detail: 'slight knit in the brows, lips parted faintly, collar turned up' },
  { expression: 'deep tiredness after a long hunt', light: 'cold dim blue window light', detail: 'heavy-lidded eyes, faint dark circles, hooded shoulders, ash dust on collar' },
  { expression: 'restrained uncertainty, guarded', light: 'hard overhead lamp, stark shadows', detail: 'flat guarded mouth, eyes slightly narrowed, tension in the neck' },
  { expression: 'faint empathy and sorrow held back', light: 'soft silver edge light, gentle falloff', detail: 'glassy moist eyes, chin trembling faintly, breath visible in cold air' },
  { expression: 'wary vigilance, listening', light: 'dark room, single pale highlight', detail: 'eyes tracking slightly, lips pressed, dark practical jacket' },
  { expression: 'quiet sadness, private grief', light: 'rain-streaked window glow, cool tones', detail: 'downcast gaze held level, tired brow, scarf wrapped high' },
  { expression: 'defiant weariness, not broken', light: 'low warm lamp against cold shadow', detail: 'firm set jaw, chin slightly lifted, hands hidden, coat darkened' },
  { expression: 'distant memory, gentle longing', light: 'faint golden rim light, soft haze', detail: 'far-away eyes, relaxed brow, softer skin tones, sweater collar' },
  { expression: 'bare vulnerable moment', light: 'single soft top light, dark void behind', detail: 'open expression, hair pulled back, shoulders relaxed and bare' },
  { expression: 'quiet acceptance, peace settling', light: 'silver moonlight, cool and calm', detail: 'level calm gaze, relaxed mouth, faint breath, plain dark wrap' },
  { expression: 'neutral returning, final resolve', light: 'even balanced light, muted ash gray', detail: 'steady direct gaze, composed features, coat straightened' }
];

const negativePrompt = [
  'low quality, worst quality, blurry, soft focus, motion blur, image noise, film grain, jpeg artifacts, gritty texture',
  'bad anatomy, asymmetrical eyes, crossed eyes, deformed face, distorted face, melted face, extra eyes, eye artifacts, noisy eyes',
  'eyeliner, mascara, heavy eyelashes, false eyelashes, black eye makeup, raccoon eyes, painted eyes, dark eye rings',
  'man, male, masculine face, masculine jaw, beard, stubble, male clothing',
  'duplicate face, second face, two people, multiple people, extra body, duplicate body, ghost face',
  'profile, three-quarter view, tilted head, looking away, cropped forehead, cropped chin, cut off head, cut off shoulders',
  'hands, arms, objects, scenery, landscape, architecture, furniture, clutter, collage, split screen',
  'black bar, black border, top border, letterbox, frame edge, clipped head',
  'text, letters, logo, watermark, subtitles, red lipstick, bright lipstick, open mouth'
].join(', ');

function buildPrompt(index) {
  const beat = beats[index % beats.length];
  return [
    track.subject,
    track.identity,
    'symmetrical centered frontal medium close-up portrait, entire head fully visible with clear space above the hair',
    'eyes exactly level, face centered horizontally, fixed camera, fixed lens, fixed distance, fixed crop',
    'forehead, hairline, chin, neck, and both shoulders fully inside frame, generous clean dark background border',
    `(${beat.expression}:0.8)`,
    beat.light,
    beat.detail,
    'high quality studio portrait, clean smooth image, sharp natural eyes, coherent facial anatomy, low noise',
    'Do Androids Dream of Electric Sheep, empathy and uncertain identity, plain dark background'
  ].join(', ');
}

async function requestFrame(index) {
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/txt2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      prompt: buildPrompt(index),
      negative_prompt: negativePrompt,
      steps: 32,
      width,
      height,
      cfg_scale: 6.5,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: false,
      seed: track.seed,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`${track.name} frame ${index + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`${track.name} frame ${index + 1} returned no image`);
  return Buffer.from(encoded, 'base64');
}

mkdirSync(track.frameDir, { recursive: true });
for (let index = 0; index < frameCount; index += 1) {
  const output = path.join(track.frameDir, `single_figure_${String(index + 1).padStart(4, '0')}.png`);
  if (!existsSync(output)) writeFileSync(output, await requestFrame(index));
  process.stdout.write(`${track.name} fresh-content CUDA image ${index + 1}/${frameCount}\n`);
}

console.log(JSON.stringify({ method: 'fresh-content-txt2img-v42', frameCount, frameDir: track.frameDir }, null, 2));
