function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode the capture.'));
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
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function roundedRectPath(ctx, x, y, w, h, r) {
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

function wrapTextLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function formatToTargetLines(ctx, text, maxWidth, initialFontSize, scale, targetLines = 2) {
  let fontSize = initialFontSize;
  const minFontSize = Math.max(13, Math.round(14 * scale));

  while (fontSize >= minFontSize) {
    const fontSpec = `500 ${fontSize}px 'Outfit', -apple-system, 'Segoe UI', system-ui, sans-serif`;
    ctx.font = fontSpec;
    const lines = wrapTextLines(ctx, text, maxWidth);
    if (lines.length <= targetLines) {
      return { lines, fontSize, fontSpec };
    }
    fontSize -= 0.5;
  }

  const fontSpec = `500 ${minFontSize}px 'Outfit', -apple-system, 'Segoe UI', system-ui, sans-serif`;
  ctx.font = fontSpec;
  const lines = wrapTextLines(ctx, text, maxWidth);
  return { lines, fontSize: minFontSize, fontSpec };
}

function drawBubbleOverlay(ctx, outputWidth, outputHeight, text) {
  const clean = String(text || '').trim();
  if (!clean) return;

  // Match the live app bubble exactly (1080p reference values).
  const scale = outputHeight / 1080;

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
  ctx.font = fontSpec;

  const maxTextW = maxBubbleW - paddingX * 2 - rowGap - totalWaveWidth;
  const words = clean.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxTextW) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  const longestLinePx = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const contentW = longestLinePx + rowGap + totalWaveWidth;
  const boxW = Math.min(maxBubbleW, Math.max(minBubbleW, Math.round(contentW + paddingX * 2)));

  const textH = lines.length * lineHeight;
  const boxH = textH + paddingY * 2;

  const x = Math.round((outputWidth - boxW) / 2);
  const y = Math.round(outputHeight - marginBottom - boxH);

  const centerY = y + boxH / 2;
  const waveX = x + boxW - paddingX - totalWaveWidth;
  const textCenterX = Math.round((x + paddingX + (waveX - rowGap)) / 2);
  const textStartY = centerY - (textH / 2);

  // Background
  ctx.save();
  ctx.fillStyle = 'rgba(10, 10, 25, 0.50)';
  roundedRectPath(ctx, x, y, boxW, boxH, radius);
  ctx.fill();
  ctx.restore();

  // Border
  ctx.save();
  ctx.strokeStyle = '#00e5a0';
  ctx.lineWidth = Math.max(1, Math.round(0.8 * scale));
  roundedRectPath(ctx, x, y, boxW, boxH, radius);
  ctx.stroke();
  ctx.restore();

  // Spoken text
  ctx.save();
  ctx.font = fontSpec;
  ctx.fillStyle = '#f0eef6';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.fillText(line, textCenterX, textStartY + i * lineHeight);
  });
  ctx.restore();

  // Voice wave bars
  ctx.save();
  ctx.fillStyle = '#00e5a0';
  let cursorX = waveX;
  barHeights.forEach((bH) => {
    const barY = Math.round(centerY - bH / 2);
    roundedRectPath(ctx, cursorX, barY, barWidth, bH, barWidth / 2);
    ctx.fill();
    cursorX += barWidth + barGap;
  });
  ctx.restore();
}

export async function capturePrintReadyFrame({
  THREE,
  renderer,
  scene,
  camera,
  hiddenObjects = [],
  overlayText = '',
  sceneId = 'scene',
  renderWidth = 6000,
  renderHeight = 4500,
  outputWidth = 6000,
  outputHeight = 4500,
  bleed = 250,
  background = 0x05070a
}) {
  if (!THREE || !renderer || !scene || !camera) {
    throw new Error('Capture requires THREE, renderer, scene, and camera.');
  }

  const maxTextureSize = renderer.capabilities.maxTextureSize;
  const width = Math.min(renderWidth, maxTextureSize);
  const height = Math.min(renderHeight, Math.floor(width * renderHeight / renderWidth));
  const renderTarget = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false
  });
  renderTarget.texture.colorSpace = THREE.SRGBColorSpace;

  const previousTarget = renderer.getRenderTarget();
  const previousAspect = camera.aspect;
  const previousClearColor = renderer.getClearColor(new THREE.Color()).clone();
  const previousClearAlpha = renderer.getClearAlpha();
  const visibility = hiddenObjects.filter(Boolean).map((object) => ({ object, visible: object.visible }));
  const pixels = new Uint8Array(width * height * 4);

  try {
    visibility.forEach(({ object }) => { object.visible = false; });
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setRenderTarget(renderTarget);
    renderer.setClearColor(background, 1);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClearColor, previousClearAlpha);
    camera.aspect = previousAspect;
    camera.updateProjectionMatrix();
    visibility.forEach(({ object, visible }) => { object.visible = visible; });
    renderTarget.dispose();
  }

  const captureCanvas = document.createElement('canvas');
  captureCanvas.width = width;
  captureCanvas.height = height;
  const context = captureCanvas.getContext('2d');
  const image = context.createImageData(width, height);
  const rowSize = width * 4;
  for (let sourceRow = 0; sourceRow < height; sourceRow += 1) {
    const targetRow = height - sourceRow - 1;
    image.data.set(
      pixels.subarray(sourceRow * rowSize, (sourceRow + 1) * rowSize),
      targetRow * rowSize
    );
  }
  context.putImageData(image, 0, 0);

  const sourceAspect = outputWidth / outputHeight;
  const cropHeight = height;
  const cropWidth = Math.min(width, cropHeight * sourceAspect);
  const cropX = (width - cropWidth) / 2;
  const safeHeight = outputHeight - bleed * 2;
  const safeWidth = Math.min(outputWidth - bleed * 2, safeHeight * sourceAspect);
  const printCanvas = document.createElement('canvas');
  printCanvas.width = outputWidth;
  printCanvas.height = outputHeight;
  const printContext = printCanvas.getContext('2d');
  printContext.fillStyle = `#${background.toString(16).padStart(6, '0')}`;
  printContext.fillRect(0, 0, outputWidth, outputHeight);
  printContext.imageSmoothingEnabled = true;
  printContext.imageSmoothingQuality = 'high';
  printContext.drawImage(
    captureCanvas,
    cropX, 0, cropWidth, cropHeight,
    (outputWidth - safeWidth) / 2, bleed, safeWidth, safeHeight
  );

  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore font ready errors
    }
  }

  drawBubbleOverlay(printContext, outputWidth, outputHeight, overlayText);

  const safeSceneId = String(sceneId || 'scene').replace(/[^a-z0-9_-]+/gi, '-');
  const blob = await canvasToBlob(printCanvas);
  downloadBlob(blob, `SyntheticDesires_PrintReady_${safeSceneId}_${Date.now()}.png`);
  return { blob, width: outputWidth, height: outputHeight };
}
