/**
 * Hand Tracker Module
 * Uses MediaPipe Tasks-Vision to track hand landmarks from webcam.
 */
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export class HandTracker {
    constructor() {
        this.handLandmarker = null;
        this.videoElement = null;
        this.lastTimestamp = -1;
        this.results = null;
        this.isTracking = false;
        this.onResults = null; // callback
    }

    /**
     * Initialize the MediaPipe Hand Landmarker
     */
    async init(videoElement, onProgress) {
        this.videoElement = videoElement;

        onProgress?.('Loading MediaPipe vision module…', 20);

        const vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm'
        );

        onProgress?.('Loading hand landmark model…', 50);

        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath:
                    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
                delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });

        onProgress?.('Hand tracker ready!', 80);
    }

    /**
     * Start the webcam
     */
    async startCamera(onProgress) {
        onProgress?.('Requesting webcam access…', 85);

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user',
            },
        });

        this.videoElement.srcObject = stream;

        return new Promise((resolve) => {
            this.videoElement.onloadeddata = () => {
                this.videoElement.play();
                this.isTracking = true;
                onProgress?.('Webcam active!', 100);
                resolve();
            };
        });
    }

    /**
     * Process a single frame — called from the animation loop
     */
    detect() {
        if (!this.isTracking || !this.handLandmarker || !this.videoElement) return null;

        const timestamp = performance.now();
        if (timestamp === this.lastTimestamp) return this.results;
        this.lastTimestamp = timestamp;

        try {
            this.results = this.handLandmarker.detectForVideo(this.videoElement, timestamp);
        } catch (e) {
            // Occasionally fails between frames — silently skip
        }

        return this.results;
    }

    /**
     * Get processed hand data: landmarks, gestures, etc.
     */
    getHandData() {
        if (!this.results || !this.results.landmarks || this.results.landmarks.length === 0) {
            return null;
        }

        const hands = this.results.landmarks.map((landmarks, i) => {
            const handedness = this.results.handednesses?.[i]?.[0]?.categoryName || 'Unknown';

            // Key landmarks
            const wrist = landmarks[0];
            const thumbTip = landmarks[4];
            const indexTip = landmarks[8];
            const middleTip = landmarks[12];
            const ringTip = landmarks[16];
            const pinkyTip = landmarks[20];
            const indexMcp = landmarks[5];
            const middleMcp = landmarks[9];

            // Palm center (average of MCP joints)
            const palmCenter = {
                x: (landmarks[0].x + landmarks[5].x + landmarks[9].x + landmarks[13].x + landmarks[17].x) / 5,
                y: (landmarks[0].y + landmarks[5].y + landmarks[9].y + landmarks[13].y + landmarks[17].y) / 5,
                z: (landmarks[0].z + landmarks[5].z + landmarks[9].z + landmarks[13].z + landmarks[17].z) / 5,
            };

            // Pinch distance (thumb to index)
            const pinchDist = Math.sqrt(
                (thumbTip.x - indexTip.x) ** 2 +
                (thumbTip.y - indexTip.y) ** 2 +
                (thumbTip.z - indexTip.z) ** 2
            );

            // Is pinching?
            const isPinching = pinchDist < 0.06;

            // Is fist? (all fingertips close to wrist)
            const fingerDists = [indexTip, middleTip, ringTip, pinkyTip].map(tip =>
                Math.sqrt((tip.x - wrist.x) ** 2 + (tip.y - wrist.y) ** 2)
            );
            const isFist = fingerDists.every(d => d < 0.15);

            // Is open palm? (all fingertips far from wrist)
            const isOpenPalm = fingerDists.every(d => d > 0.2);

            // Is Pointing? (Index extended, others curled)
            const isPointing = (
                fingerDists[0] > 0.2 && // Index out
                fingerDists[1] < 0.15 && // Middle curled
                fingerDists[2] < 0.15 && // Ring curled
                fingerDists[3] < 0.15    // Pinky curled
            );

            // Is Victory? (Index & Middle extended, others curled)
            const isVictory = (
                fingerDists[0] > 0.2 && // Index out
                fingerDists[1] > 0.2 && // Middle out
                fingerDists[2] < 0.15 && // Ring curled
                fingerDists[3] < 0.15    // Pinky curled
            );

            // Thumbs Up? (Fingers curled, Thumb extended)
            // Heuristic: Thumb tip far from wrist, other tips close to wrist.
            // Also check that thumb is "abducted" (far from index MCP)
            const thumbToWrist = Math.sqrt((thumbTip.x - wrist.x) ** 2 + (thumbTip.y - wrist.y) ** 2);
            const isFingersCurled = fingerDists.every(d => d < 0.18); // Slightly looser
            const isThumbsUp = isFingersCurled && thumbToWrist > 0.15;

            // Refine Fist (must NOT be thumbs up)
            const isTrueFist = isFist && !isThumbsUp;

            // Palm facing up? (check y-coordinate relative: fingertips above wrist means palm up mirrored)
            const avgFingerY = (indexTip.y + middleTip.y + ringTip.y + pinkyTip.y) / 4;
            const isPalmUp = isOpenPalm && avgFingerY < wrist.y - 0.05;

            // Determine gesture
            let gesture = 'open';
            if (isPinching) gesture = 'pinch';
            else if (isVictory) gesture = 'victory';
            else if (isThumbsUp) gesture = 'thumbsUp';
            else if (isTrueFist) gesture = 'fist';
            else if (isPointing) gesture = 'point';
            else if (isPalmUp) gesture = 'palmUp';

            return {
                handedness,
                landmarks,
                wrist,
                indexTip,
                thumbTip,
                middleTip,
                palmCenter,
                pinchDist,
                isPinching,
                isFist,
                isOpenPalm,
                isPalmUp,
                gesture,
            };
        });

        return hands;
    }

    /**
     * Get two-hand interaction data.
     * Returns null if fewer than 2 hands detected.
     */
    getTwoHandData(hands) {
        if (!hands || hands.length < 2) return null;

        const h1 = hands[0];
        const h2 = hands[1];

        // ── Spatial Relationships ──

        // Distance between palm centers
        const dx = h1.palmCenter.x - h2.palmCenter.x;
        const dy = h1.palmCenter.y - h2.palmCenter.y;
        const dz = h1.palmCenter.z - h2.palmCenter.z;
        const handDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Midpoint between the two hands
        const midpoint = {
            x: (h1.palmCenter.x + h2.palmCenter.x) / 2,
            y: (h1.palmCenter.y + h2.palmCenter.y) / 2,
            z: (h1.palmCenter.z + h2.palmCenter.z) / 2,
        };

        // Angle between hands (atan2 of the line connecting them)
        const angle = Math.atan2(
            h1.palmCenter.y - h2.palmCenter.y,
            h1.palmCenter.x - h2.palmCenter.x
        );

        // Index fingertip distance
        const indexDx = h1.indexTip.x - h2.indexTip.x;
        const indexDy = h1.indexTip.y - h2.indexTip.y;
        const indexDistance = Math.sqrt(indexDx * indexDx + indexDy * indexDy);

        // ── Two-Hand Gesture Classification ──

        const bothOpen = h1.isOpenPalm && h2.isOpenPalm;
        const bothFist = h1.isFist && h2.isFist;
        const bothPinch = h1.isPinching && h2.isPinching;
        const bothPalmUp = h1.isPalmUp && h2.isPalmUp;

        // Stretch: hands far apart with open palms
        const isStretching = bothOpen && handDistance > 0.4;

        // Squeeze: hands close together with open palms
        const isSqueezing = bothOpen && handDistance < 0.2;

        // Tear: hands pulling apart with fists (aggressive pull)
        const isTearing = bothFist && handDistance > 0.35;

        // Vortex: both pinching
        const isVortex = bothPinch;

        // Fold: hands tilting inward — one palm up, one palm down (or both moving inward)
        const isFolding = (h1.isPalmUp && !h2.isPalmUp) || (!h1.isPalmUp && h2.isPalmUp);

        // Ripple Storm: both palms up
        const isRippleStorm = bothPalmUp;

        // Rotation is detected by tracking angle changes (we compute it here, consume it externally)
        const isRotating = bothPinch && handDistance > 0.15 && handDistance < 0.5;

        // Determine dominant two-hand gesture
        let twoHandGesture = 'dualIdle';
        let gestureStrength = 0;

        if (isRippleStorm) {
            twoHandGesture = 'rippleStorm';
            gestureStrength = 1.0;
        } else if (isTearing) {
            twoHandGesture = 'tear';
            gestureStrength = Math.min((handDistance - 0.35) / 0.3, 1.0);
        } else if (isVortex) {
            twoHandGesture = isRotating ? 'vortex' : 'vortex';
            gestureStrength = 1.0 - Math.min(h1.pinchDist + h2.pinchDist, 0.12) / 0.12;
        } else if (isStretching) {
            twoHandGesture = 'stretch';
            gestureStrength = Math.min((handDistance - 0.4) / 0.4, 1.0);
        } else if (isSqueezing) {
            twoHandGesture = 'squeeze';
            gestureStrength = Math.min((0.2 - handDistance) / 0.15, 1.0);
        } else if (isFolding) {
            twoHandGesture = 'fold';
            gestureStrength = 0.8;
        }

        return {
            hand1: h1,
            hand2: h2,
            handDistance,
            midpoint,
            angle,
            indexDistance,
            bothOpen,
            bothFist,
            bothPinch,
            bothPalmUp,
            twoHandGesture,
            gestureStrength,
        };
    }
}
