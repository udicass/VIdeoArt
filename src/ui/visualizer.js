export class Visualizer {
  constructor() {
    this.isActive = false;
    this.overlay = document.createElement('div');
    this.overlay.className = 'ai-visualizer-overlay hidden';
    
    // Add glowing gradient layer
    this.glowLayer = document.createElement('div');
    this.glowLayer.className = 'valkyrie-glow focus-glow';
    this.overlay.appendChild(this.glowLayer);
    
    // Add ripple layers
    for (let i = 0; i < 3; i++) {
      const ripple = document.createElement('div');
      ripple.className = `ai-ripple ripple-${i}`;
      this.overlay.appendChild(ripple);
    }
    
    document.body.appendChild(this.overlay);

    // Dynamic style definitions block
    if (!document.getElementById('ai-visualizer-styles')) {
      const style = document.createElement('style');
      style.id = 'ai-visualizer-styles';
      style.textContent = `
        .ai-visualizer-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          pointer-events: none;
          z-index: 100;
          opacity: 0;
          transition: opacity 0.6s ease-in-out;
        }
        .ai-visualizer-overlay.active {
          opacity: 1;
        }
        .valkyrie-glow {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, rgba(140,220,255,0.06) 0%, transparent 60%);
          mix-blend-mode: screen;
        }
        .valkyrie-glow.focus-glow {
          animation: breath-glow 4s ease-in-out infinite alternate;
        }
        .valkyrie-glow.hostB {
          background: radial-gradient(circle at center, rgba(230,160,255,0.08) 0%, transparent 60%);
        }
        .ai-ripple {
          position: absolute;
          top: 50%; left: 50%;
          width: 200px; height: 200px;
          margin: -100px 0 0 -100px;
          border: 1px solid rgba(140,220,255,0.1);
          border-radius: 50%;
          opacity: 0;
          transform: scale(0.5);
        }
        .ai-visualizer-overlay.active .ai-ripple {
          animation: ripple-out 3s linear infinite;
        }
        .ripple-1 { animation-delay: 1s !important; }
        .ripple-2 { animation-delay: 2s !important; }
        
        .ai-visualizer-overlay.active.hostB .ai-ripple {
          border-color: rgba(230,160,255,0.15);
        }

        @keyframes breath-glow {
          0% { transform: scale(1); opacity: 0.4; }
          100% { transform: scale(1.1); opacity: 0.8; }
        }
        @keyframes ripple-out {
          0% { transform: scale(0.5); opacity: 0; }
          10% { opacity: 0.5; }
          100% { transform: scale(4); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  setThinking(speaker = 'hostA') {
    this.isActive = true;
    this.overlay.classList.add('active');
    
    // Adjust colors depending on who is talking
    if (speaker === 'hostB') {
      this.glowLayer.classList.add('hostB');
      this.overlay.classList.add('hostB');
    } else {
      this.glowLayer.classList.remove('hostB');
      this.overlay.classList.remove('hostB');
    }
  }

  stop() {
    this.isActive = false;
    this.overlay.classList.remove('active');
  }
}

export const visualizer = new Visualizer();
