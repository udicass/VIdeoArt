/**
 * Webcam Overlay Module
 * Draws MediaPipe hand landmarks on the PiP canvas overlay.
 */

const CONNECTIONS = [
    // Thumb
    [0, 1], [1, 2], [2, 3], [3, 4],
    // Index
    [0, 5], [5, 6], [6, 7], [7, 8],
    // Middle
    [9, 10], [10, 11], [11, 12],
    // Ring
    [13, 14], [14, 15], [15, 16],
    // Pinky
    [0, 17], [17, 18], [18, 19], [19, 20],
    // Palm
    [5, 9], [9, 13], [13, 17],
];

export class WebcamOverlay {
    constructor(overlayCanvas, videoElement) {
        this.canvas = overlayCanvas;
        this.ctx = overlayCanvas.getContext('2d');
        this.video = videoElement;
    }

    clear() {
        const { canvas, ctx, video } = this;
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        if (video.readyState >= 2) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
        ctx.restore();
    }

    draw(results) {        const { canvas, ctx, video } = this;

        // Match canvas to display size
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;

        // Draw video frame
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Mirror and draw video
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        if (video.readyState >= 2) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
        ctx.restore();

        // Dark overlay for style
        ctx.fillStyle = 'rgba(5, 5, 10, 0.25)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (!results || !results.landmarks || results.landmarks.length === 0) return;

        for (const landmarks of results.landmarks) {
            // Draw connections
            ctx.strokeStyle = 'rgba(124, 92, 255, 0.6)';
            ctx.lineWidth = 2;

            for (const [start, end] of CONNECTIONS) {
                const p1 = landmarks[start];
                const p2 = landmarks[end];

                // Mirror X
                const x1 = (1 - p1.x) * canvas.width;
                const y1 = p1.y * canvas.height;
                const x2 = (1 - p2.x) * canvas.width;
                const y2 = p2.y * canvas.height;

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }

            // Draw landmarks
            for (let i = 0; i < landmarks.length; i++) {
                const lm = landmarks[i];
                const x = (1 - lm.x) * canvas.width;
                const y = lm.y * canvas.height;

                // Special landmarks get bigger dots
                const isKeypoint = [0, 4, 8, 12, 16, 20].includes(i);
                const radius = isKeypoint ? 4 : 2;

                // Color based on finger
                let color = '#7c5cff';
                if (i <= 4) color = '#ff6b9d';       // Thumb
                else if (i <= 8) color = '#00e5a0';   // Index
                else if (i <= 12) color = '#00d4ff';  // Middle
                else if (i <= 16) color = '#ffb347';  // Ring
                else color = '#e040fb';               // Pinky

                // Glow effect
                ctx.shadowBlur = isKeypoint ? 8 : 4;
                ctx.shadowColor = color;

                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
            }

            ctx.shadowBlur = 0;
        }
    }
}
