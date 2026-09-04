import html2canvas from 'html2canvas';

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

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode the print canvas.'));
    }, 'image/png');
  });
}

export async function capturePrintReadyFrame({
  THREE,
  renderer,
  scene,
  camera,
  overlayElement = null,
  hiddenObjects = [],
  sceneId = 'scene',
  renderWidth = 3840,
  renderHeight = 2160,
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
  const captureContext = captureCanvas.getContext('2d');
  const image = captureContext.createImageData(width, height);
  const rowSize = width * 4;
  for (let sourceRow = 0; sourceRow < height; sourceRow += 1) {
    const targetRow = height - sourceRow - 1;
    image.data.set(
      pixels.subarray(sourceRow * rowSize, (sourceRow + 1) * rowSize),
      targetRow * rowSize
    );
  }
  captureContext.putImageData(image, 0, 0);

  if (overlayElement) {
    const overlay = await html2canvas(overlayElement, {
      backgroundColor: null,
      scale: 1,
      logging: false,
      useCORS: true
    });
    if (overlay.width && overlay.height) {
      captureContext.drawImage(overlay, 0, 0, overlay.width, overlay.height, 0, 0, width, height);
    }
  }

  const sourceAspect = outputWidth / outputHeight;
  const cropHeight = height;
  const cropWidth = Math.min(width, cropHeight * sourceAspect);
  const cropX = (width - cropWidth) / 2;
  const safeY = bleed;
  const safeHeight = outputHeight - bleed * 2;
  const safeWidth = Math.min(outputWidth - bleed * 2, safeHeight * sourceAspect);
  const safeX = (outputWidth - safeWidth) / 2;

  const printCanvas = document.createElement('canvas');
  printCanvas.width = outputWidth;
  printCanvas.height = outputHeight;
  const printContext = printCanvas.getContext('2d');
  printContext.fillStyle = `#${background.toString(16).padStart(6, '0')}`;
  printContext.fillRect(0, 0, outputWidth, outputHeight);
  printContext.drawImage(
    captureCanvas,
    cropX, 0, cropWidth, cropHeight,
    safeX, safeY, safeWidth, safeHeight
  );

  const safeSceneId = String(sceneId || 'scene').replace(/[^a-z0-9_-]+/gi, '-');
  const blob = await canvasToBlob(printCanvas);
  downloadBlob(blob, `SyntheticDesires_PrintReady_${safeSceneId}_${Date.now()}.png`);
  return { blob, width: outputWidth, height: outputHeight };
}
