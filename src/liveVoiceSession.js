import { GoogleGenAI } from '@google/genai';

const DEFAULT_MODEL = 'gemini-live-2.5-flash-preview';

function normalizeModel(model) {
    const value = String(model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
    return value.startsWith('models/') ? value : `models/${value}`;
}

export class LiveVoiceSession {
    static isSupported() {
        return typeof window !== 'undefined'
            && typeof window.WebSocket !== 'undefined'
            && typeof fetch !== 'undefined';
    }

    constructor(options = {}) {
        this.model = normalizeModel(options.model || DEFAULT_MODEL);
        this.systemInstruction = String(options.systemInstruction || '').trim();
        this.responseModalities = Array.isArray(options.responseModalities) && options.responseModalities.length
            ? options.responseModalities.map((value) => String(value || '').trim().toUpperCase()).filter(Boolean)
            : ['TEXT'];
        this.onMessage = typeof options.onMessage === 'function' ? options.onMessage : null;
        this.onError = typeof options.onError === 'function' ? options.onError : null;
        this.client = null;
        this.session = null;
        this.connected = false;
        this._closingIntentional = false;
        this.usageMetadata = null;
    }

    async connect(options = {}) {
        if (this.connected && this.session) {
            return true;
        }

        this.model = normalizeModel(options.model || this.model || DEFAULT_MODEL);
        this.systemInstruction = String(options.systemInstruction || this.systemInstruction || '').trim();
        this.responseModalities = Array.isArray(options.responseModalities) && options.responseModalities.length
            ? options.responseModalities.map((value) => String(value || '').trim().toUpperCase()).filter(Boolean)
            : this.responseModalities;
        this.onMessage = typeof options.onMessage === 'function' ? options.onMessage : this.onMessage;
        this.onError = typeof options.onError === 'function' ? options.onError : this.onError;
        this._closingIntentional = false;

        const tokenResp = await fetch('/api/live-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.model,
                systemInstruction: this.systemInstruction,
                responseModalities: this.responseModalities
            })
        });

        const tokenData = await tokenResp.json().catch(() => ({}));
        if (!tokenResp.ok || !tokenData?.token) {
            throw new Error(tokenData?.error || 'Unable to provision Live API token.');
        }

        this.client = new GoogleGenAI({
            apiKey: tokenData.token,
            apiVersion: tokenData.apiVersion || 'v1alpha'
        });

        let setupResolve = null;
        let setupReject = null;
        let setupSettled = false;
        const setupPromise = new Promise((resolve, reject) => {
            setupResolve = resolve;
            setupReject = reject;
        });
        const setupTimeout = window.setTimeout(() => {
            if (setupSettled) return;
            setupSettled = true;
            setupReject?.(new Error('Live API setup timed out.'));
        }, 12000);

        try {
            this.session = await this.client.live.connect({
                model: this.model,
                config: {
                    responseModalities: this.responseModalities,
                    temperature: 0.7,
                    ...(this.systemInstruction ? { systemInstruction: this.systemInstruction } : {}),
                    inputAudioTranscription: {},
                    ...(this.responseModalities.includes('AUDIO') ? { outputAudioTranscription: {} } : {})
                },
                callbacks: {
                    onmessage: (payload) => {
                        if (payload?.usageMetadata) {
                            this.usageMetadata = payload.usageMetadata;
                        }
                        if (payload?.setupComplete && !setupSettled) {
                            setupSettled = true;
                            window.clearTimeout(setupTimeout);
                            setupResolve?.(true);
                        }
                        try {
                            this.onMessage?.(payload);
                        } catch {
                            // Ignore consumer callback errors.
                        }
                    },
                    onerror: (event) => {
                        if (this._closingIntentional) return;
                        const message = event?.message || event?.error?.message || 'Live API socket error.';
                        try {
                            this.onError?.(new Error(message));
                        } catch {
                            // Ignore consumer callback errors.
                        }
                    },
                    onclose: (event) => {
                        const intentionalClose = this._closingIntentional;
                        this.connected = false;
                        this.session = null;
                        this.client = null;
                        const reason = event?.reason ? ` ${event.reason}` : '';
                        const detail = `Live API socket closed${typeof event?.code === 'number' ? ` (${event.code})` : ''}.${reason}`.trim();
                        if (!setupSettled) {
                            setupSettled = true;
                            window.clearTimeout(setupTimeout);
                            setupReject?.(new Error(`${detail} before setup completed.`));
                        }
                        if (intentionalClose || event?.code === 1000 || event?.code === 1001) {
                            return;
                        }
                        try {
                            this.onError?.(new Error(detail));
                        } catch {
                            // Ignore consumer callback errors.
                        }
                    }
                }
            });
        } catch (error) {
            window.clearTimeout(setupTimeout);
            this.client = null;
            this.session = null;
            throw error;
        }

        await setupPromise;
        this.connected = true;

        return true;
    }

    sendRealtimeInput(params = {}) {
        if (!this.session) {
            throw new Error('Live API session is not connected.');
        }
        this.session.sendRealtimeInput(params);
    }

    close() {
        this._closingIntentional = true;
        try {
            this.session?.close();
        } catch {
            // Ignore close failures during experimental teardown.
        }
        this.session = null;
        this.client = null;
        this.connected = false;
    }
}