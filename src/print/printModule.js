import { captureCurrentArtwork } from './captureCurrentArtwork.js';
import { PRINT_EDITIONS, resolvePrintArtwork } from './printCatalog.js';
import './printModule.css';

const UNLOCK_CLICKS = 11;

function createElement(tag, className, attributes = {}) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  Object.entries(attributes).forEach(([name, value]) => {
    if (name === 'text') element.textContent = value;
    else element.setAttribute(name, value);
  });
  return element;
}

function createMarkup() {
  const root = createElement('div', 'print-module', { 'aria-hidden': 'true' });
  root.innerHTML = `
    <button class="print-cart" type="button" aria-label="Open selected print" hidden>
      <span aria-hidden="true">P</span><small>1</small>
    </button>
    <section class="print-dialog" role="dialog" aria-modal="true" aria-labelledby="print-title">
      <header class="print-header">
        <div><p>Signed fine-art edition</p><h2 id="print-title">Current frame</h2></div>
        <button class="print-close" type="button" aria-label="Close print selection">&times;</button>
      </header>
      <div class="print-stage">
        <button class="print-arrow print-prev" type="button" aria-label="Previous frame">&#8592;</button>
        <button class="print-image-button" type="button" aria-label="Magnify selected frame">
          <img class="print-preview" alt="" />
          <span class="print-empty">Capture the current movie frame to begin.</span>
        </button>
        <button class="print-arrow print-next" type="button" aria-label="Next frame">&#8594;</button>
      </div>
      <div class="print-frame-nav" role="tablist" aria-label="Captured frames"></div>
      <div class="print-actions">
        <button class="print-capture" type="button">Capture current frame</button>
        <button class="print-download" type="button" disabled>Download selected capture</button>
      </div>
      <p class="print-note">Local workflow: move downloaded captures into <code>raw_captures</code>, then run <code>npm run print:prepare</code>.</p>
      <div class="print-editions" aria-label="Choose print edition"></div>
      <section class="print-checkout" hidden>
        <p class="print-selected"></p>
        <div class="print-paypal"></div>
        <button class="print-change" type="button">Change edition</button>
      </section>
      <section class="print-success" hidden><h3>Edition reserved</h3><p></p></section>
      <p class="print-status" role="status" aria-live="polite"></p>
    </section>
    <div class="print-lightbox" role="dialog" aria-modal="true" aria-label="Magnified print" aria-hidden="true">
      <button class="print-lightbox-close" type="button" aria-label="Close magnifier">&times;</button>
      <div class="print-lightbox-stage"><img alt="" /></div>
      <div class="print-zoom-controls">
        <button type="button" data-zoom="out" aria-label="Zoom out">&minus;</button>
        <button type="button" data-zoom="reset" class="print-zoom-value">100%</button>
        <button type="button" data-zoom="in" aria-label="Zoom in">+</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  return root;
}

export class PrintModule {
  constructor({ getContext, unlockElement, mountElement } = {}) {
    this.getContext = getContext;
    this.root = createMarkup();
    this.dialog = this.root.querySelector('.print-dialog');
    this.preview = this.root.querySelector('.print-preview');
    this.empty = this.root.querySelector('.print-empty');
    this.frameNav = this.root.querySelector('.print-frame-nav');
    this.editions = this.root.querySelector('.print-editions');
    this.checkout = this.root.querySelector('.print-checkout');
    this.success = this.root.querySelector('.print-success');
    this.status = this.root.querySelector('.print-status');
    this.cartButton = this.root.querySelector('.print-cart');
    document.body.appendChild(this.cartButton);
    this.lightbox = this.root.querySelector('.print-lightbox');
    this.lightboxImage = this.lightbox.querySelector('img');
    this.captures = [];
    this.selectedIndex = -1;
    this.cart = null;
    this.paypalButtons = null;
    this.paypalConfigPromise = null;
    this.paypalScriptPromise = null;
    this.zoom = 1;
    this.unlocked = false;
    this.unlockClicks = 0;
    this.trigger = null;
    this.openButton = createElement('button', 'print-open', {
      type: 'button', text: 'PRINT', 'aria-label': 'Open print edition', hidden: ''
    });
    (mountElement || document.body).appendChild(this.openButton);

    this.renderEditions();
    this.bindEvents();
    unlockElement?.addEventListener('click', (event) => this.handleUnlockClick(event));
    unlockElement?.addEventListener('contextmenu', (event) => this.handleUnlockRightClick(event));
  }

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    this.openButton.hidden = false;
    document.body.classList.add('print-unlocked');
    document.dispatchEvent(new CustomEvent('print:unlocked'));
  }

  handleUnlockClick(event) {
    if (event?.target?.closest?.('button, a')) return;
    if (this.unlocked) return;
    this.unlockClicks += 1;
    if (this.unlockClicks < UNLOCK_CLICKS) return;
    this.unlock();
  }

  handleUnlockRightClick(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    this.unlock();
  }

  isOpen() {
    return this.root.classList.contains('active');
  }

  async open(trigger = document.activeElement) {
    if (!this.unlocked) return false;
    const context = this.getContext?.() || {};
    const artwork = resolvePrintArtwork(context.movieName);
    if (!artwork || !context.video) {
      context.notify?.('Load a Synthetic Desires movie first.');
      return false;
    }
    this.trigger = trigger;
    this.artwork = artwork;
    this.root.querySelector('#print-title').textContent = artwork.title;
    this.root.classList.add('active');
    this.root.setAttribute('aria-hidden', 'false');
    this.root.querySelector('.print-close').focus();
    context.pause?.();
    if (!this.captures.some((capture) => capture.artworkId === artwork.id)) {
      await this.capture(false);
    } else {
      this.selectCapture(this.captures.findIndex((capture) => capture.artworkId === artwork.id));
    }
    return true;
  }

  close() {
    if (!this.isOpen()) return;
    this.closeLightbox();
    this.root.classList.remove('active');
    this.root.setAttribute('aria-hidden', 'true');
    this.getContext?.().resume?.();
    this.trigger?.focus?.();
  }

  async capture(download = true) {
    const context = this.getContext?.() || {};
    const artwork = resolvePrintArtwork(context.movieName);
    if (!artwork) return;
    const artworkCaptures = this.getArtworkCaptures();
    if (artworkCaptures.length >= artwork.frameCount) {
      this.setStatus(`This local edition already has ${artwork.frameCount} captured frames.`);
      return;
    }
    this.setStatus('Capturing current frame...');
    try {
      const capture = await captureCurrentArtwork({
        video: context.video,
        title: `${artwork.id}-frame-${artworkCaptures.length + 1}`,
        text: context.spokenText,
        download
      });
      this.captures.push({ ...capture, artworkId: artwork.id });
      this.selectCapture(this.captures.length - 1);
      this.setStatus(download ? 'Capture downloaded. Move it to raw_captures for print preparation.' : 'Current frame ready.');
    } catch (error) {
      this.setStatus(error.message || 'Capture failed.');
    }
  }

  selectCapture(index) {
    if (index < 0 || index >= this.captures.length) return;
    this.selectedIndex = index;
    const capture = this.captures[index];
    this.preview.src = capture.previewUrl;
    this.preview.alt = `${this.artwork?.title || 'Synthetic Desires'} captured frame ${index + 1}`;
    this.preview.hidden = false;
    this.empty.hidden = true;
    this.root.querySelector('.print-download').disabled = false;
    this.renderFrameNav();
    this.updateArrows();
  }

  getArtworkCaptures() {
    if (!this.artwork) return [];
    return this.captures
      .map((capture, index) => ({ capture, index }))
      .filter(({ capture }) => capture.artworkId === this.artwork.id);
  }

  renderFrameNav() {
    this.frameNav.replaceChildren(...this.getArtworkCaptures().map(({ capture, index }, artworkIndex) => {
      const button = createElement('button', index === this.selectedIndex ? 'selected' : '', {
        type: 'button', role: 'tab', 'aria-selected': String(index === this.selectedIndex),
        'aria-label': `Captured frame ${artworkIndex + 1}`
      });
      const image = createElement('img', '', { src: capture.previewUrl, alt: '' });
      button.appendChild(image);
      button.addEventListener('click', () => this.selectCapture(index));
      return button;
    }));
  }

  updateArrows() {
    const artworkCaptures = this.getArtworkCaptures();
    const position = artworkCaptures.findIndex(({ index }) => index === this.selectedIndex);
    this.root.querySelector('.print-prev').disabled = position <= 0;
    this.root.querySelector('.print-next').disabled = position < 0 || position >= artworkCaptures.length - 1;
  }

  renderEditions() {
    this.editions.replaceChildren(...Object.entries(PRINT_EDITIONS).map(([id, edition]) => {
      const button = createElement('button', 'print-edition', { type: 'button' });
      button.innerHTML = `<span>${edition.label}</span><strong>${edition.price}</strong><small>${edition.edition}</small>`;
      button.addEventListener('click', () => this.enterCheckout(id));
      return button;
    }));
  }

  enterCheckout(editionId) {
    if (!this.artwork || this.selectedIndex < 0) return;
    const edition = PRINT_EDITIONS[editionId];
    const frame = this.getArtworkCaptures().findIndex(({ index }) => index === this.selectedIndex) + 1;
    if (frame < 1) return;
    this.cart = { artworkId: this.artwork.id, editionId, frame };
    this.cartButton.hidden = false;
    this.editions.hidden = true;
    this.checkout.hidden = false;
    this.success.hidden = true;
    this.root.querySelector('.print-selected').textContent = `${this.artwork.title}, captured frame ${this.cart.frame} - ${edition.label} - ${edition.price}`;
    this.renderPayPalButtons().catch(() => this.setStatus('Payments could not be loaded.'));
  }

  resetCheckout() {
    this.clearPayPalButtons();
    this.editions.hidden = false;
    this.checkout.hidden = true;
    this.success.hidden = true;
    this.setStatus('');
  }

  async resumeCart() {
    if (!this.unlocked || !this.cart) return;
    const context = this.getContext?.() || {};
    const currentArtwork = resolvePrintArtwork(context.movieName);
    if (currentArtwork?.id !== this.cart.artworkId) {
      await context.selectArtwork?.(this.cart.artworkId);
    }
    const opened = await this.open(this.cartButton);
    if (!opened) return;
    const capture = this.getArtworkCaptures()[this.cart.frame - 1];
    if (capture) this.selectCapture(capture.index);
    this.enterCheckout(this.cart.editionId);
  }

  async getPayPalConfig() {
    if (!this.paypalConfigPromise) {
      this.paypalConfigPromise = fetch('/api/paypal-config').then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Payments are not configured.');
        return result;
      });
    }
    return this.paypalConfigPromise;
  }

  loadPayPalSdk(config) {
    if (window.paypal?.Buttons) return Promise.resolve(window.paypal);
    if (this.paypalScriptPromise) return this.paypalScriptPromise;
    const domain = config.environment === 'live' ? 'https://www.paypal.com' : 'https://www.sandbox.paypal.com';
    this.paypalScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${domain}/sdk/js?client-id=${encodeURIComponent(config.clientId)}&currency=${encodeURIComponent(config.currency)}&intent=capture&components=buttons`;
      script.onload = () => resolve(window.paypal);
      script.onerror = () => reject(new Error('PayPal SDK failed to load.'));
      document.head.appendChild(script);
    });
    return this.paypalScriptPromise;
  }

  clearPayPalButtons() {
    try { this.paypalButtons?.close?.(); } catch {}
    this.paypalButtons = null;
    this.root.querySelector('.print-paypal').replaceChildren();
  }

  async renderPayPalButtons() {
    const config = await this.getPayPalConfig();
    const paypal = await this.loadPayPalSdk(config);
    this.clearPayPalButtons();
    this.paypalButtons = paypal.Buttons({
      style: { layout: 'vertical', color: 'black', shape: 'rect', label: 'pay', height: 46 },
      createOrder: async () => {
        const response = await fetch('/api/paypal-create-order', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.cart)
        });
        const result = await response.json();
        if (!response.ok || !result.id) throw new Error(result.error || 'Could not create order.');
        return result.id;
      },
      onApprove: async ({ orderID }) => {
        const response = await fetch('/api/paypal-capture', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: orderID })
        });
        const result = await response.json();
        if (!response.ok || result.status !== 'COMPLETED') throw new Error(result.error || 'Payment was not completed.');
        this.checkout.hidden = true;
        this.success.hidden = false;
        this.success.querySelector('p').textContent = result.payerName ? `Thank you, ${result.payerName}. PayPal has sent your receipt.` : 'Thank you. PayPal has sent your receipt.';
      },
      onError: () => this.setStatus('Payment could not be completed. Please try again.')
    });
    await this.paypalButtons.render(this.root.querySelector('.print-paypal'));
  }

  openLightbox() {
    if (this.selectedIndex < 0) return;
    this.lightboxImage.src = this.preview.src;
    this.lightboxImage.alt = this.preview.alt;
    this.zoom = 1;
    this.updateZoom();
    this.lightbox.classList.add('active');
    this.lightbox.setAttribute('aria-hidden', 'false');
    this.lightbox.querySelector('.print-lightbox-close').focus();
  }

  closeLightbox() {
    this.lightbox.classList.remove('active');
    this.lightbox.setAttribute('aria-hidden', 'true');
  }

  updateZoom(delta = 0) {
    this.zoom = Math.max(1, Math.min(1.5, Math.round((this.zoom + delta) * 4) / 4));
    this.lightboxImage.style.transform = `scale(${this.zoom})`;
    this.lightbox.querySelector('.print-zoom-value').textContent = `${Math.round(this.zoom * 100)}%`;
  }

  downloadSelected() {
    const capture = this.captures[this.selectedIndex];
    if (!capture) return;
    const link = document.createElement('a');
    link.href = capture.previewUrl;
    link.download = capture.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  setStatus(message) {
    this.status.textContent = message;
  }

  bindEvents() {
    this.openButton.addEventListener('click', () => this.open(this.openButton));
    this.root.querySelector('.print-close').addEventListener('click', () => this.close());
    this.root.querySelector('.print-capture').addEventListener('click', () => this.capture(true));
    this.root.querySelector('.print-download').addEventListener('click', () => this.downloadSelected());
    this.root.querySelector('.print-image-button').addEventListener('click', () => this.openLightbox());
    this.root.querySelector('.print-change').addEventListener('click', () => this.resetCheckout());
    this.root.querySelector('.print-prev').addEventListener('click', () => {
      const captures = this.getArtworkCaptures();
      const position = captures.findIndex(({ index }) => index === this.selectedIndex);
      if (position > 0) this.selectCapture(captures[position - 1].index);
    });
    this.root.querySelector('.print-next').addEventListener('click', () => {
      const captures = this.getArtworkCaptures();
      const position = captures.findIndex(({ index }) => index === this.selectedIndex);
      if (position >= 0 && position < captures.length - 1) this.selectCapture(captures[position + 1].index);
    });
    this.cartButton.addEventListener('click', () => this.resumeCart());
    this.root.querySelector('.print-lightbox-close').addEventListener('click', () => this.closeLightbox());
    this.lightbox.querySelector('[data-zoom="out"]').addEventListener('click', () => this.updateZoom(-0.25));
    this.lightbox.querySelector('[data-zoom="in"]').addEventListener('click', () => this.updateZoom(0.25));
    this.lightbox.querySelector('[data-zoom="reset"]').addEventListener('click', () => { this.zoom = 1; this.updateZoom(); });
    this.root.addEventListener('click', (event) => { if (event.target === this.root) this.close(); });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (this.lightbox.classList.contains('active')) this.closeLightbox();
        else if (this.isOpen()) this.close();
        return;
      }
      const target = event.target;
      const isTyping = target instanceof HTMLElement
        && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (event.key.toLowerCase() !== 's' || event.repeat || isTyping || event.metaKey || event.ctrlKey || event.altKey) return;
      if (!this.unlocked || this.isOpen()) return;
      event.preventDefault();
      this.open(this.openButton);
    });
  }
}
