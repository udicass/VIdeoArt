function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The artwork could not be encoded.'));
    }, 'image/png');
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}

function wrapText(context, text, maxWidth, fontSpec) {
  if (fontSpec) context.font = fontSpec;
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 6);
}

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';

function normalizePrintText(value) {
  return String(value || '')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (ch) => String(SUPERSCRIPT_DIGITS.indexOf(ch)))
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (ch) => String(SUBSCRIPT_DIGITS.indexOf(ch)))
    .replace(/([A-Za-z])(\d)/g, '$1 $2');
}

function formatToTargetLines(context, text, maxWidth, initialFontSize, scale, targetLines = 2) {
  let fontSize = initialFontSize;
  const minFontSize = Math.max(13, Math.round(14 * scale));

  while (fontSize >= minFontSize) {
    const fontSpec = `500 ${fontSize}px 'Outfit', -apple-system, 'Segoe UI', system-ui, sans-serif`;
    context.font = fontSpec;
    const lines = wrapText(context, text, maxWidth, fontSpec);
    if (lines.length <= targetLines) {
      return { lines, fontSize, fontSpec };
    }
    fontSize -= 0.5;
  }

  const fontSpec = `500 ${minFontSize}px 'Outfit', -apple-system, 'Segoe UI', system-ui, sans-serif`;
  context.font = fontSpec;
  const lines = wrapText(context, text, maxWidth, fontSpec);
  return { lines, fontSize: minFontSize, fontSpec };
}

function drawSpeechBubbleOverlay(context, width, height, rawText) {
  const spokenText = normalizePrintText(rawText).replace(/\s+/g, ' ').trim();
  if (!spokenText) return;

  // Match the live app bubble exactly (1080p reference values).
  const scale = height / 1080;

  const fontSize = Math.round(16 * scale);
  const lineHeight = Math.round(22.4 * scale);
  const paddingX = Math.round(24 * scale);
  const paddingY = Math.round(16 * scale);
  const radius = Math.round(18 * scale);
  const marginBottom = Math.round(44 * scale);
  const maxBubbleW = Math.round(620 * scale);
  const minBubbleW = Math.round(220 * scale);

  const barWidth = Math.max(2, Math.round(2 * scale));
  const barGap = Math.max(2, Math.round(2 * scale));
  const barHeights = [
    Math.round(10 * scale),
    Math.round(16 * scale),
    Math.round(8 * scale),
    Math.round(14 * scale),
    Math.round(7 * scale)
  ];
  const totalWaveWidth = barHeights.length * barWidth + (barHeights.length - 1) * barGap;
  const rowGap = Math.round(8 * scale);

  const fontSpec = `500 ${fontSize}px 'Outfit', -apple-system, 'Segoe UI', system-ui, sans-serif`;
  context.font = fontSpec;

  const maxTextW = maxBubbleW - paddingX * 2 - rowGap - totalWaveWidth;
  const words = spokenText.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (context.measureText(candidate).width <= maxTextW) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  const longestLinePx = Math.max(...lines.map((line) => context.measureText(line).width));
  const contentW = longestLinePx + rowGap + totalWaveWidth;
  const boxW = Math.min(maxBubbleW, Math.max(minBubbleW, Math.round(contentW + paddingX * 2)));

  const textH = lines.length * lineHeight;
  const boxH = textH + paddingY * 2;

  const x = Math.round((width - boxW) / 2);
  const y = Math.round(height - marginBottom - boxH);

  const centerY = y + boxH / 2;
  const waveX = x + boxW - paddingX - totalWaveWidth;
  const textCenterX = Math.round((x + paddingX + (waveX - rowGap)) / 2);
  const textStartY = centerY - (textH / 2);

  // Background
  context.save();
  context.fillStyle = 'rgba(10, 10, 25, 0.50)';
  drawRoundedRect(context, x, y, boxW, boxH, radius);
  context.fill();
  context.restore();

  // Border
  context.save();
  context.strokeStyle = '#00e5a0';
  context.lineWidth = Math.max(1, Math.round(0.8 * scale));
  drawRoundedRect(context, x, y, boxW, boxH, radius);
  context.stroke();
  context.restore();

  // Spoken text
  context.save();
  context.font = fontSpec;
  context.fillStyle = '#f0eef6';
  context.textAlign = 'center';
  context.textBaseline = 'top';
  lines.forEach((line, index) => {
    context.fillText(line, textCenterX, textStartY + index * lineHeight);
  });
  context.restore();

  // Voice wave bars
  context.save();
  context.fillStyle = '#00e5a0';
  let cursorX = waveX;
  barHeights.forEach((bH) => {
    const barY = Math.round(centerY - bH / 2);
    drawRoundedRect(context, cursorX, barY, barWidth, bH, barWidth / 2);
    context.fill();
    cursorX += barWidth + barGap;
  });
  context.restore();
}

export async function captureCurrentArtwork({
  video,
  title = 'Synthetic Desires',
  text = '',
  maxDimension = 6000,
  download = true
} = {}) {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    throw new Error('Load a movie before capturing a print frame.');
  }

  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore font ready errors
    }
  }

  const scale = maxDimension / Math.max(video.videoWidth, video.videoHeight);
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas capture is unavailable.');

  context.fillStyle = '#020407';
  context.fillRect(0, 0, width, height);
  context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, width, height);

  drawSpeechBubbleOverlay(context, width, height, text);

  const blob = await canvasToBlob(canvas);
  const slug = String(title || 'synthetic-desires')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  const filename = `${slug || 'synthetic-desires'}-${Date.now()}.png`;
  if (download) downloadBlob(blob, filename);
  return { blob, filename, width, height, previewUrl: URL.createObjectURL(blob) };
}
