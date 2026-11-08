import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ==========================================
// ⚙️ CONFIGURATION
const SNAPPINESS = 15; 
const RETURN_SPEED = 3; 
// ==========================================

// --- 1. Setup Scene & Orthographic Camera ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const viewSize = 10;
const aspect = window.innerWidth / window.innerHeight;
const camera = new THREE.OrthographicCamera(
    -viewSize * aspect / 2, viewSize * aspect / 2, 
    viewSize / 2, -viewSize / 2, 0.1, 100
);
camera.position.z = 10;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio); 
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.NoToneMapping; 
document.body.appendChild(renderer.domElement);

// --- 2. Build the Face Rig ---
const orbiGroup = new THREE.Group();
scene.add(orbiGroup);

// --- 3. Generate the Smooth Gradient Face Texture ---
function createGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; 
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createRadialGradient(512, 512, 50, 512, 512, 800);
    gradient.addColorStop(0, '#FFD700'); 
    gradient.addColorStop(0.4, '#FFA500'); 
    gradient.addColorStop(0.8, '#CC5500'); 
    gradient.addColorStop(1, '#331100');   

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1024, 1024);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

const faceGeometry = new THREE.PlaneGeometry(35, 35); 
const faceMaterial = new THREE.MeshBasicMaterial({ map: createGlowTexture() });
const faceBase = new THREE.Mesh(faceGeometry, faceMaterial);
faceBase.position.z = 0;
orbiGroup.add(faceBase);

// --- 4. Helper: Create Pill Shape (Fully Rounded) ---
function createPillShape(width, height) {
    const shape = new THREE.Shape();
    const radius = height / 2; 
    const x = -width / 2;
    const y = -height / 2;
    
    shape.moveTo(x + radius, y);
    shape.lineTo(x + width - radius, y);
    shape.absarc(x + width - radius, y + radius, radius, -Math.PI / 2, Math.PI / 2, false);
    shape.lineTo(x + radius, y + height);
    shape.absarc(x + radius, y + radius, radius, Math.PI / 2, -Math.PI / 2, false);
    
    return new THREE.ShapeGeometry(shape);
}

// --- 5. The Eyes & Eyebrows ---
const eyeData = []; 

const blueMat = new THREE.MeshBasicMaterial({ color: 0x88C0FF, depthTest: false });
const navyMat = new THREE.MeshBasicMaterial({ color: 0x0A1128, depthTest: false });

function createEye(xPos, yPos, index) {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(xPos, yPos, 1); 

    // Sclera
    const normalGeo = new THREE.CircleGeometry(1.3, 64); 
    const normalEye = new THREE.Mesh(normalGeo, blueMat);
    normalEye.renderOrder = 1;
    eyeGroup.add(normalEye);

    // Happy Eye
    const happyGeo = new THREE.TorusGeometry(0.9, 0.25, 16, 32, Math.PI);
    const happyEye = new THREE.Mesh(happyGeo, navyMat);
    happyEye.position.y = -0.2; 
    happyEye.renderOrder = 1;
    eyeGroup.add(happyEye);

    // Pupils
    const pupilGroup = new THREE.Group();
    const pupilGeo = new THREE.CircleGeometry(0.65, 64); 
    const pupil = new THREE.Mesh(pupilGeo, navyMat);
    pupil.renderOrder = 2;
    pupilGroup.add(pupil);
    eyeGroup.add(pupilGroup);
    
    // --- ROUNDED EYEBROWS ---
    const browGeo = createPillShape(2.4, 0.35); 
    const browMesh = new THREE.Mesh(browGeo, navyMat);
    
    // Elongated inner sides
    const innerShift = index === 0 ? 0.25 : -0.25;
    browMesh.position.set(innerShift, 1.25, 0.05); 
    browMesh.renderOrder = 1;
    
    eyeGroup.add(browMesh);
    eyeGroup.userData.brow = browMesh; 

    eyeData.push({ 
        group: eyeGroup, 
        normalEye, 
        happyEye, 
        pupilGroup, 
        brow: browMesh
    });

    return eyeGroup;
}

const leftEye = createEye(-2.7, 1.8, 0);
const rightEye = createEye(2.7, 1.8, 1);
orbiGroup.add(leftEye);
orbiGroup.add(rightEye);

// --- 6. The Mouths ---
const mouthGroup = new THREE.Group();
mouthGroup.position.set(0, -1.0, 1);

const neutralMesh = new THREE.Mesh(new THREE.CircleGeometry(0.45, 32), navyMat);

const happyMesh = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.25, 16, 32, Math.PI), navyMat);
happyMesh.rotation.z = Math.PI;
happyMesh.position.y = 0.6;

const surprisedMesh = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.2, 16, 32), navyMat);

const sadMesh = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.25, 16, 32, Math.PI), navyMat);
sadMesh.position.y = -0.6;

mouthGroup.add(neutralMesh, happyMesh, surprisedMesh, sadMesh);
mouthGroup.children.forEach(m => { m.visible = false; m.renderOrder = 1; });
orbiGroup.add(mouthGroup);

// --- 7. Expression Controller ---
const EXPRESSIONS = {
    neutral:   { happyEyes: false, pupilY: 0,    browY: 0,    browRot: 0,    browVisible: true, mouth: neutralMesh },
    happy:     { happyEyes: true,  pupilY: 0,    browY: 0,    browRot: 0,    browVisible: false, mouth: happyMesh }, 
    surprised: { happyEyes: false, pupilY: 0,    browY: 0.4,  browRot: -0.15, browVisible: true, mouth: surprisedMesh },
    sad:       { happyEyes: false, pupilY: -0.2, browY: 0,    browRot: 0.4,  browVisible: true, mouth: sadMesh } 
};

let currentTarget = EXPRESSIONS.neutral;

function setExpression(name) {
    if (!EXPRESSIONS[name]) return;
    currentTarget = EXPRESSIONS[name];
    
    mouthGroup.children.forEach(m => m.visible = false);
    currentTarget.mouth.visible = true;

    eyeData.forEach(data => {
        data.normalEye.visible = !currentTarget.happyEyes;
        data.pupilGroup.visible = !currentTarget.happyEyes; 
        data.happyEye.visible = currentTarget.happyEyes;
        data.brow.visible = currentTarget.browVisible;
    });
}

window.addEventListener('keydown', (event) => {
    if (event.key === '1') setExpression('neutral');
    if (event.key === '2') setExpression('happy');
    if (event.key === '3') setExpression('surprised');
    if (event.key === '4') setExpression('sad');
});

setExpression('neutral');

// --- 8. Post-Processing ---
const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.6, 0.98);
const outputPass = new OutputPass();
const smaaPass = new SMAAPass(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio());

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);
composer.addPass(smaaPass); 
composer.addPass(outputPass);

// --- 9. Mouse Tracking & Smooth Return ---
let desiredX = 0; 
let desiredY = 0;
let currentX = 0; 
let currentY = 0;
let lastMouseMoveTime = Date.now();

window.addEventListener('mousemove', (event) => {
    desiredX = (event.clientX / window.innerWidth) * 2 - 1;
    desiredY = -(event.clientY / window.innerHeight) * 2 + 1;
    lastMouseMoveTime = Date.now(); 
});

// --- 10. Blink Controller ---
let isBlinking = false;
let lastBlinkTime = Date.now();
let nextBlinkDelay = Math.random() * 4000 + 4000; 
let blinkStartTime = 0;
const blinkDuration = 150; 

window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && !isBlinking && !currentTarget.happyEyes) {
        isBlinking = true;
        blinkStartTime = Date.now();
    }
});

function updateBlink() {
    const now = Date.now();
    if (!isBlinking) {
        if (now - lastBlinkTime > nextBlinkDelay) {
            isBlinking = true;
            blinkStartTime = now;
        }
    } else {
        const progress = (now - blinkStartTime) / blinkDuration;
        if (progress >= 1) {
            isBlinking = false;
            lastBlinkTime = now;
            nextBlinkDelay = Math.random() * 4000 + 4000;
        }
    }
}

// --- 11. Animation Loop ---
const clock = new THREE.Clock();
let currentBrowRot = 0;
let currentBrowY = 0;
let currentPupilY = 0;

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const time = Date.now() * 0.001;

    if (Date.now() - lastMouseMoveTime > 2000) {
        desiredX = 0;
        desiredY = 0;
    }

    const activeSpeed = (desiredX === 0 && desiredY === 0) ? RETURN_SPEED : SNAPPINESS;
    currentX = THREE.MathUtils.damp(currentX, desiredX, activeSpeed, delta);
    currentY = THREE.MathUtils.damp(currentY, desiredY, activeSpeed, delta);

    currentBrowRot = THREE.MathUtils.damp(currentBrowRot, currentTarget.browRot, 10, delta);
    currentBrowY = THREE.MathUtils.damp(currentBrowY, currentTarget.browY, 10, delta);
    currentPupilY = THREE.MathUtils.damp(currentPupilY, currentTarget.pupilY, 10, delta);

    const pupilMaxMove = 0.4; 
    eyeData.forEach((data, index) => {
        data.pupilGroup.position.x = (currentX * pupilMaxMove);
        data.pupilGroup.position.y = (currentY * pupilMaxMove) + currentPupilY;
    });

    updateBlink();
    let blinkScale = 1.0;
    if (isBlinking) {
        const progress = (Date.now() - blinkStartTime) / blinkDuration;
        blinkScale = Math.max(0.05, Math.abs(Math.cos(progress * Math.PI)));
    }

    eyeData.forEach((data, index) => {
        if (!currentTarget.happyEyes) {
            // 1. Squish the eye down. Stretch X slightly to make it look like a natural fold.
            data.normalEye.scale.y = blinkScale;
            data.normalEye.scale.x = 1 + (1 - blinkScale) * 0.2;
            
            data.pupilGroup.scale.y = blinkScale; 
            data.pupilGroup.scale.x = 1 + (1 - blinkScale) * 0.2;

            // 2. Eyebrow acts as the eyelid: Drops from 1.25 perfectly down to the center (0)
            // When blinkScale is 1 (open), offset is 0. When blinkScale is 0 (closed), offset is -1.25.
            const browDrop = (1 - blinkScale) * 1.25;
            data.brow.position.y = 1.25 + currentBrowY - browDrop;
            
        } else {
            data.brow.position.y = 1.25 + currentBrowY;
            data.normalEye.scale.set(1, 1, 1); // Reset if happy
        }

        const rotDir = index === 0 ? -1 : 1;
        data.brow.rotation.z = rotDir * currentBrowRot;
    });

    const lightShift = 0.02;
    faceMaterial.map.offset.x = -currentX * lightShift;
    faceMaterial.map.offset.y = currentY * lightShift;

    orbiGroup.scale.setScalar(1 + Math.sin(time * 2) * 0.005);

    composer.render();
}

window.addEventListener('resize', () => {
    const newAspect = window.innerWidth / window.innerHeight;
    camera.left = -viewSize * newAspect / 2;
    camera.right = viewSize * newAspect / 2;
    camera.top = viewSize / 2;
    camera.bottom = -viewSize / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    smaaPass.setSize(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio());
    composer.setSize(window.innerWidth, window.innerHeight);
});

animate();
