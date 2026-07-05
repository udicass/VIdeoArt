/**
 * Three.js Scene Module
 * Creates an immersive 3D scene with manipulatable objects and particle effects.
 */
import * as THREE from 'three';
import { VideoMesh } from './videoMesh.js';

// ─── CONSTANTS ───
const GRAVITY_NORMAL = -9.8;
const GRAVITY_ANTI = 3.5;
const DAMPING = 0.96;
const LERP_SPEED = 0.08;
const MAX_OBJECTS = 40;

export class Scene3D {
    constructor(canvas) {
        this.canvas = canvas;
        this.clock = new THREE.Timer();
        this.objects = [];
        this.particles = [];
        this.gravityY = GRAVITY_NORMAL;
        this.isAntiGravity = false;
        this.handPosition = new THREE.Vector3(0, 0, 0);
        this.hand2Position = new THREE.Vector3(0, 0, 0);
        this.handActive = false;
        this.hand2Active = false;
        this.gesture = 'none';
        this.pinchStrength = 0;
        this.trailParticles = [];
        this.videoMesh = null;
        this.isVideoMode = false;
        this.twoHandData = null;

        this._init();
        this._createEnvironment();
        // this._createInitialObjects(); // Clean scene for playlist mode
        this._createParticleField();
    }

    _init() {
        // Check WebGL availability before creating renderer
        const testCanvas = document.createElement('canvas');
        const gl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
        if (!gl) {
            throw new Error('WebGL is not supported by your browser. Please use a modern browser with GPU acceleration enabled.');
        }

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false,
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x05050a, 0.015);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            200
        );
        this.camera.position.set(0, 5, 20);
        this.camera.lookAt(0, 0, 0);

        // Resize handler
        window.addEventListener('resize', () => this._onResize());
    }

    _onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // ─── ENVIRONMENT ───
    _createEnvironment() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x1a1a2e, 0.5);
        this.scene.add(ambientLight);

        // Main directional light
        const dirLight = new THREE.DirectionalLight(0x7c5cff, 0.8);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.set(1024, 1024);
        this.scene.add(dirLight);

        // Secondary light
        const secondaryLight = new THREE.DirectionalLight(0x00e5a0, 0.4);
        secondaryLight.position.set(-10, 10, -5);
        this.scene.add(secondaryLight);

        // Point lights for atmosphere
        const pLight1 = new THREE.PointLight(0xff6b9d, 0.6, 30);
        pLight1.position.set(-8, 8, -5);
        this.scene.add(pLight1);

        const pLight2 = new THREE.PointLight(0x00d4ff, 0.4, 25);
        pLight2.position.set(8, -3, 5);
        this.scene.add(pLight2);

        // Ground Plane (reflective grid)
        const gridHelper = new THREE.GridHelper(60, 60, 0x1a1a3e, 0x0d0d20);
        gridHelper.position.y = -8;
        this.scene.add(gridHelper);
        this.gridHelper = gridHelper;

        // Ground plane for shadows
        const groundGeo = new THREE.PlaneGeometry(100, 100);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x080812,
            metalness: 0.3,
            roughness: 0.8,
            transparent: true,
            opacity: 0.8,
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -8;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Skybox-like sphere
        const skyGeo = new THREE.SphereGeometry(100, 32, 32);
        const skyMat = new THREE.MeshBasicMaterial({
            color: 0x05050a,
            side: THREE.BackSide,
        });
        this.sky = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(this.sky);

        // Hand cursor sphere (shows where the hand "is" in 3D space)
        const cursorGeo = new THREE.SphereGeometry(0.3, 32, 32);
        const cursorMat = new THREE.MeshStandardMaterial({
            color: 0x7c5cff,
            emissive: 0x7c5cff,
            emissiveIntensity: 0.8,
            metalness: 0.9,
            roughness: 0.1,
            transparent: true,
            opacity: 0.7,
        });
        this.handCursor = new THREE.Mesh(cursorGeo, cursorMat);
        this.handCursor.visible = false;
        this.scene.add(this.handCursor);

        // Second hand cursor
        const cursor2Geo = new THREE.SphereGeometry(0.3, 32, 32);
        const cursor2Mat = new THREE.MeshStandardMaterial({
            color: 0x00e5a0,
            emissive: 0x00e5a0,
            emissiveIntensity: 0.8,
            metalness: 0.9,
            roughness: 0.1,
            transparent: true,
            opacity: 0.7,
        });
        this.handCursor2 = new THREE.Mesh(cursor2Geo, cursor2Mat);
        this.handCursor2.visible = false;
        this.scene.add(this.handCursor2);

        // Hand influence ring
        const ringGeo = new THREE.RingGeometry(1.5, 2.0, 64);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x7c5cff,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
        });
        this.handRing = new THREE.Mesh(ringGeo, ringMat);
        this.handRing.visible = false;
        this.scene.add(this.handRing);

        // Second hand ring
        const ring2Geo = new THREE.RingGeometry(1.5, 2.0, 64);
        const ring2Mat = new THREE.MeshBasicMaterial({
            color: 0x00e5a0,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
        });
        this.handRing2 = new THREE.Mesh(ring2Geo, ring2Mat);
        this.handRing2.visible = false;
        this.scene.add(this.handRing2);

        // Connection line between two hands
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(1, 0, 0),
        ]);
        const lineMat = new THREE.LineBasicMaterial({
            color: 0x7c5cff,
            transparent: true,
            opacity: 0.3,
        });
        this.handLine = new THREE.Line(lineGeo, lineMat);
        this.handLine.visible = false;
        this.scene.add(this.handLine);
    }

    // ─── OBJECTS ───
    _createInitialObjects() {
        const geometries = [
            new THREE.IcosahedronGeometry(0.8, 1),
            new THREE.OctahedronGeometry(0.7, 0),
            new THREE.TorusGeometry(0.6, 0.25, 16, 32),
            new THREE.TetrahedronGeometry(0.8, 0),
            new THREE.DodecahedronGeometry(0.7, 0),
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.ConeGeometry(0.5, 1.2, 8),
            new THREE.TorusKnotGeometry(0.5, 0.18, 64, 8),
        ];

        const colors = [
            0x7c5cff, 0x00e5a0, 0xff6b9d, 0xffb347,
            0x00d4ff, 0xe040fb, 0x76ff03, 0xff5252,
        ];

        for (let i = 0; i < 15; i++) {
            const geo = geometries[i % geometries.length];
            const color = colors[i % colors.length];

            const mat = new THREE.MeshStandardMaterial({
                color: color,
                emissive: color,
                emissiveIntensity: 0.15,
                metalness: 0.6,
                roughness: 0.3,
                transparent: true,
                opacity: 0.9,
            });

            const mesh = new THREE.Mesh(geo, mat);

            // Random position
            mesh.position.set(
                (Math.random() - 0.5) * 16,
                (Math.random() - 0.5) * 10 + 2,
                (Math.random() - 0.5) * 10
            );

            mesh.castShadow = true;
            mesh.receiveShadow = true;

            // Physics-like properties
            mesh.userData = {
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.02,
                    (Math.random() - 0.5) * 0.02,
                    (Math.random() - 0.5) * 0.02
                ),
                angularVel: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.02,
                    (Math.random() - 0.5) * 0.02,
                    (Math.random() - 0.5) * 0.02
                ),
                mass: 0.5 + Math.random() * 1.5,
                baseColor: color,
                isGrabbed: false,
                originalScale: 0.8 + Math.random() * 0.4,
            };

            const scale = mesh.userData.originalScale;
            mesh.scale.set(scale, scale, scale);

            this.scene.add(mesh);
            this.objects.push(mesh);
        }
    }

    // ─── PARTICLE FIELD (disabled for performance) ───
    _createParticleField() { /* disabled */ }

    // ─── ADD OBJECT ───
    addObject() {
        if (this.objects.length >= MAX_OBJECTS) return;

        const geometries = [
            new THREE.IcosahedronGeometry(0.8, 1),
            new THREE.TorusKnotGeometry(0.5, 0.18, 64, 8),
            new THREE.OctahedronGeometry(0.7, 0),
            new THREE.DodecahedronGeometry(0.7, 0),
        ];

        const colors = [0x7c5cff, 0x00e5a0, 0xff6b9d, 0xffb347, 0x00d4ff, 0xe040fb];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const geo = geometries[Math.floor(Math.random() * geometries.length)];

        const mat = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.15,
            metalness: 0.6,
            roughness: 0.3,
            transparent: true,
            opacity: 0.9,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(
            (Math.random() - 0.5) * 6,
            8 + Math.random() * 4,
            (Math.random() - 0.5) * 6
        );
        mesh.castShadow = true;

        mesh.userData = {
            velocity: new THREE.Vector3(0, 0, 0),
            angularVel: new THREE.Vector3(
                (Math.random() - 0.5) * 0.03,
                (Math.random() - 0.5) * 0.03,
                (Math.random() - 0.5) * 0.03
            ),
            mass: 0.5 + Math.random() * 1.5,
            baseColor: color,
            isGrabbed: false,
            originalScale: 0.8 + Math.random() * 0.4,
        };

        const scale = mesh.userData.originalScale;
        mesh.scale.set(scale, scale, scale);

        this.scene.add(mesh);
        this.objects.push(mesh);
    }

    // ─── LOAD VIDEO ───
    async loadVideo(file) {
        // Create VideoMesh if not exists
        if (!this.videoMesh) {
            this.videoMesh = new VideoMesh(this.scene);
        }

        const info = await this.videoMesh.loadVideo(file);
        this.isVideoMode = true;

        // Hide floating objects in video mode — push them to the sides
        for (const obj of this.objects) {
            obj.visible = false;
        }
        if (this.gridHelper) {
            this.gridHelper.visible = false;
            this.gridHelper.position.y = -8;
        }

        // Adjust camera for video viewing
        this.camera.position.set(0, 1, 14);
        this.camera.lookAt(0, 1, 0);

        return info;
    }

    // ─── REMOVE VIDEO ───
    removeVideo() {
        if (this.videoMesh) {
            this.videoMesh.dispose();
            this.videoMesh = null;
        }
        this.isVideoMode = false;

        // Show objects again
        for (const obj of this.objects) {
            obj.visible = true;
        }
        if (this.gridHelper) {
            this.gridHelper.visible = true;
        }

        // Reset camera
        this.camera.position.set(0, 5, 20);
        this.camera.lookAt(0, 0, 0);
    }

    // ─── GET VIDEO MESH (for external control) ───
    getVideoMesh() {
        return this.videoMesh;
    }

    // ─── AI RESPONSE: Rainbow Glitch Pulse ───
    triggerRainbowGlitch(duration = 2500) {
        if (this.videoMesh) {
            this.videoMesh.triggerRainbowGlitch(duration);
        }
    }

    // ─── RESET SCENE ───
    resetScene() {
        for (const obj of this.objects) {
            obj.position.set(
                (Math.random() - 0.5) * 16,
                (Math.random() - 0.5) * 10 + 2,
                (Math.random() - 0.5) * 10
            );
            obj.userData.velocity.set(0, 0, 0);
            obj.userData.isGrabbed = false;
        }
        this.gravityY = GRAVITY_NORMAL;
        this.isAntiGravity = false;
    }

    // ─── TOGGLE ANTIGRAVITY ───
    toggleAntiGravity() {
        this.isAntiGravity = !this.isAntiGravity;
        this.gravityY = this.isAntiGravity ? GRAVITY_ANTI : GRAVITY_NORMAL;
        return this.isAntiGravity;
    }

    setAntiGravity(on) {
        this.isAntiGravity = on;
        this.gravityY = on ? GRAVITY_ANTI : GRAVITY_NORMAL;
    }

    // ─── UPDATE HAND ───
    updateHand(handData) {
        if (!handData) {
            this.handActive = false;
            this.handCursor.visible = false;
            this.handRing.visible = false;
            this.gesture = 'none';
            return;
        }

        const hand = handData;
        this.handActive = true;
        this.gesture = hand.gesture;

        // Map webcam coordinates (0..1) to scene coordinates
        // Mirror X axis for natural interaction
        const targetX = (0.5 - hand.indexTip.x) * 24;
        const targetY = (0.5 - hand.indexTip.y) * 16;
        const targetZ = -hand.indexTip.z * 20;

        // Smoothly interpolate the hand position
        this.handPosition.lerp(new THREE.Vector3(targetX, targetY, targetZ), LERP_SPEED * 3);

        // Update cursor
        this.handCursor.visible = true;
        this.handCursor.position.copy(this.handPosition);

        // Scale cursor based on gesture
        const cursorScale = hand.isPinching ? 0.5 : 0.3;
        this.handCursor.scale.setScalar(cursorScale);

        // Update cursor color by gesture
        if (hand.isPinching) {
            this.handCursor.material.emissive.setHex(0xff6b9d);
            this.handCursor.material.color.setHex(0xff6b9d);
        } else if (hand.isFist) {
            this.handCursor.material.emissive.setHex(0xff5252);
            this.handCursor.material.color.setHex(0xff5252);
        } else if (hand.isPalmUp) {
            this.handCursor.material.emissive.setHex(0x00e5a0);
            this.handCursor.material.color.setHex(0x00e5a0);
        } else {
            this.handCursor.material.emissive.setHex(0x7c5cff);
            this.handCursor.material.color.setHex(0x7c5cff);
        }

        // Ring: hidden — replaced by 2D cursor overlay
        this.handRing.visible = false;

        this.pinchStrength = hand.isPinching ? 1.0 - hand.pinchDist / 0.06 : 0;
    }

    // ─── UPDATE TWO HANDS ───
    updateTwoHands(twoHandData) {
        this.twoHandData = twoHandData;

        if (!twoHandData) {
            this.hand2Active = false;
            this.handCursor2.visible = false;
            this.handRing2.visible = false;
            this.handLine.visible = false;
            return;
        }

        this.hand2Active = true;
        const h2 = twoHandData.hand2;

        // Map second hand to scene coordinates
        const targetX2 = (0.5 - h2.indexTip.x) * 24;
        const targetY2 = (0.5 - h2.indexTip.y) * 16;
        const targetZ2 = -h2.indexTip.z * 20;
        this.hand2Position.lerp(new THREE.Vector3(targetX2, targetY2, targetZ2), LERP_SPEED * 3);

        // Cursor 2
        this.handCursor2.visible = true;
        this.handCursor2.position.copy(this.hand2Position);
        this.handCursor2.scale.setScalar(h2.isPinching ? 0.5 : 0.3);

        // Ring 2
        this.handRing2.visible = true;
        this.handRing2.position.copy(this.hand2Position);
        this.handRing2.lookAt(this.camera.position);
        this.handRing2.scale.setScalar(2);

        // Connection line between hands
        this.handLine.visible = true;
        const linePositions = this.handLine.geometry.attributes.position;
        linePositions.setXYZ(0, this.handPosition.x, this.handPosition.y, this.handPosition.z);
        linePositions.setXYZ(1, this.hand2Position.x, this.hand2Position.y, this.hand2Position.z);
        linePositions.needsUpdate = true;

        // Color the line based on two-hand gesture
        const gestureColors = {
            'stretch': 0x00e5a0,
            'squeeze': 0xffb347,
            'tear': 0xff5252,
            'rippleStorm': 0x00d4ff,
            'vortex': 0xe040fb,
            'fold': 0xffb347,
            'rotate': 0x00d4ff,
            'dualIdle': 0x7c5cff,
        };
        const lineColor = gestureColors[twoHandData.twoHandGesture] || 0x7c5cff;
        this.handLine.material.color.setHex(lineColor);
        this.handLine.material.opacity = 0.2 + twoHandData.gestureStrength * 0.4;
    }

    // ─── ANIMATION LOOP ───
    update() {
        this.clock.update();
        const delta = Math.min(this.clock.getDelta(), 0.05);
        const time = this.clock.getElapsed();

        // ── Update Objects ──
        for (const obj of this.objects) {
            const ud = obj.userData;

            // Gravity
            ud.velocity.y += this.gravityY * delta * 0.05;

            // Hand interaction
            if (this.handActive) {
                const toHand = new THREE.Vector3().subVectors(this.handPosition, obj.position);
                const dist = toHand.length();

                if (this.gesture === 'pinch' && dist < 8) {
                    // Pull toward hand (gravity well)
                    const force = toHand.normalize().multiplyScalar(
                        (3 / (dist * dist + 0.5)) * this.pinchStrength * 2
                    );
                    ud.velocity.add(force.multiplyScalar(delta * 10));

                    // Glow effect
                    obj.material.emissiveIntensity = THREE.MathUtils.lerp(
                        obj.material.emissiveIntensity, 0.7, 0.1
                    );
                } else if (this.gesture === 'fist' && dist < 6) {
                    // Push away (repel)
                    const repel = toHand.normalize().multiplyScalar(-2 / (dist + 0.5));
                    ud.velocity.add(repel.multiplyScalar(delta * 15));

                    obj.material.emissiveIntensity = THREE.MathUtils.lerp(
                        obj.material.emissiveIntensity, 0.5, 0.1
                    );
                } else if (this.gesture === 'open' && dist < 10) {
                    // Gentle orbit attraction
                    const attract = toHand.normalize().multiplyScalar(0.3 / (dist + 1));
                    ud.velocity.add(attract.multiplyScalar(delta * 5));
                }

                // Proximity glow
                if (dist < 4) {
                    obj.material.emissiveIntensity = THREE.MathUtils.lerp(
                        obj.material.emissiveIntensity, 0.6, 0.05
                    );
                    const s = ud.originalScale * (1 + 0.15 * (1 - dist / 4));
                    obj.scale.lerp(new THREE.Vector3(s, s, s), 0.1);
                } else {
                    obj.material.emissiveIntensity = THREE.MathUtils.lerp(
                        obj.material.emissiveIntensity, 0.15, 0.02
                    );
                    const s = ud.originalScale;
                    obj.scale.lerp(new THREE.Vector3(s, s, s), 0.05);
                }
            } else {
                obj.material.emissiveIntensity = THREE.MathUtils.lerp(
                    obj.material.emissiveIntensity, 0.15, 0.02
                );
            }

            // Damping
            ud.velocity.multiplyScalar(DAMPING);

            // Apply velocity
            obj.position.add(ud.velocity.clone().multiplyScalar(delta * 60));

            // Rotation
            obj.rotation.x += ud.angularVel.x;
            obj.rotation.y += ud.angularVel.y;
            obj.rotation.z += ud.angularVel.z;

            // Boundary constraints (bounce)
            const bounds = { x: 15, y: 12, z: 12 };
            ['x', 'y', 'z'].forEach((axis) => {
                if (Math.abs(obj.position[axis]) > bounds[axis]) {
                    obj.position[axis] = Math.sign(obj.position[axis]) * bounds[axis];
                    ud.velocity[axis] *= -0.5;
                }
            });

            // Ground bounce
            if (obj.position.y < -7.5) {
                obj.position.y = -7.5;
                ud.velocity.y *= -0.4;
                ud.velocity.x *= 0.9;
                ud.velocity.z *= 0.9;
            }
        }

        // ── Camera subtle sway ──
        if (!this.isVideoMode) {
            this.camera.position.x = Math.sin(time * 0.15) * 1.5;
            this.camera.position.y = 5 + Math.sin(time * 0.2) * 0.5;
            this.camera.lookAt(0, 0, 0);
        } else {
            // Subtle camera sway in video mode
            this.camera.position.x = Math.sin(time * 0.1) * 0.3;
            this.camera.position.y = 1 + Math.sin(time * 0.15) * 0.15;
            this.camera.lookAt(0, 1, 0);
        }

        // ── Hand cursor pulse ──
        if (this.handCursor.visible) {
            this.handCursor.material.opacity = 0.5 + Math.sin(time * 4) * 0.2;
            this.handRing.rotation.z = time * 0.5;
        }
        if (this.handCursor2.visible) {
            this.handCursor2.material.opacity = 0.5 + Math.sin(time * 4 + 1.5) * 0.2;
            this.handRing2.rotation.z = -time * 0.5;
        }

        // ── Video Mesh update ──
        if (this.videoMesh && this.isVideoMode) {
            this.videoMesh.updateHand(
                this.handPosition,
                this.handActive,
                this.gesture,
                this.pinchStrength
            );
            this.videoMesh.updateTwoHands(this.twoHandData);
            this.videoMesh.update(time);
        }

        // ── AntiGravity visual effects ──
        if (this.isAntiGravity && !this.isVideoMode) {
            this.scene.fog.density = 0.01 + Math.sin(time * 2) * 0.003;
            this.gridHelper.position.y = -8 + Math.sin(time * 0.5) * 0.5;
        } else {
            this.scene.fog.density = THREE.MathUtils.lerp(this.scene.fog.density, 0.015, 0.01);
            if (this.gridHelper) {
                this.gridHelper.position.y = -8;
            }
        }

        // Render
        this.renderer.render(this.scene, this.camera);
    }
}
