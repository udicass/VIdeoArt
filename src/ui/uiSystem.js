export const ui = {
  // Elements
  loadingScreen: null,
  loaderStatus: null,
  loaderBarFill: null,
  appContainer: null,
  btnSecretTrain: null,
  threeCanvas: null,
  webcamVideo: null,
  gestureIcon: null,
  gestureName: null,
  gestureSub: null,
  aiChatMessages: null,
  aiChatInput: null,
  aiChatStatus: null,
  
  // Initialization
  init() {
    this.loadingScreen = document.getElementById('loading-screen');
    this.loaderStatus = document.getElementById('loader-status');
    this.loaderBarFill = document.getElementById('loader-bar-fill');
    this.appContainer = document.getElementById('app');
    this.btnSecretTrain = document.getElementById('btn-secret-train');
    this.threeCanvas = document.getElementById('three-canvas');
    this.webcamVideo = document.getElementById('webcam');
    this.gestureIcon = document.getElementById('gesture-icon');
    this.gestureName = document.getElementById('gesture-name');
    this.gestureSub = document.getElementById('gesture-sub');
    this.aiChatMessages = document.getElementById('ai-chat-messages');
    this.aiChatInput = document.getElementById('ai-chat-input');
    this.aiChatStatus = document.getElementById('ai-chat-status');
  },

  // Helpers
  safeSetText(el, text) {
    if (el) el.textContent = text;
  },

  updateLoading(message, progress) {
    if (this.loaderStatus) this.loaderStatus.textContent = message;
    if (this.loaderBarFill) {
      this.loaderBarFill.style.width = `${progress}%`;
    }
    if (progress >= 100) {
      if (this.loadingScreen) {
        this.loadingScreen.style.opacity = '0';
        setTimeout(() => this.loadingScreen.classList.add('hidden'), 600);
      }
    }
  }
};
