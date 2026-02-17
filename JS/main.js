import { drawRayTracer, Camera, traceRay, tracePath, packRGBA } from "./rayTracing.js";
import { Vector } from "./mathLib.js";

export const canvas = document.getElementById("Viewport");
const ctx = canvas.getContext("2d", { alpha: false });

// Image data and view buffer will be (re)created to match the canvas buffer size.
let img = ctx.createImageData(canvas.width, canvas.height);
export let ViewportBuffer32 = new Uint32Array(img.data.buffer);
// Accumulation buffer for progressive multi-sample rendering (float RGB)
let accumBuffer = new Float32Array(canvas.width * canvas.height * 3);
let sampleCountBuffer = new Uint32Array(canvas.width * canvas.height);

// Resize helpers: recreate `img` and `ViewportBuffer32` for given buffer size
function setupViewportBuffer(width, height) {
    canvas.width = Math.max(1, Math.floor(width));
    canvas.height = Math.max(1, Math.floor(height));
    img = ctx.createImageData(canvas.width, canvas.height);
    ViewportBuffer32 = new Uint32Array(img.data.buffer);
    accumBuffer = new Float32Array(canvas.width * canvas.height * 3);
    sampleCountBuffer = new Uint32Array(canvas.width * canvas.height);
}

// Create camera
const camera = new Camera(
    new Vector(0, 2, 1),
    new Vector(0, 0, 0),
    new Vector(0, 1, 0),
    90
);

// Cornell-like room built from large tangent spheres for walls and a few interior spheres
const spheres = [
    // Floor (large sphere tangent near y = -3)
    {
        position: new Vector(0, -1003, 0),
        radius: 1000.0,
        material: { color: { r: 220, g: 220, b: 220 }, roughness: 0.0 }
    },
    // Ceiling
    {
        position: new Vector(0, 1003, 0),
        radius: 1000.0,
        material: { color: { r: 240, g: 240, b: 240 }, roughness: 0.0 }
    },
    // Back wall (tangent near z = -5) - darkened
    {
        position: new Vector(0, 0, -1005),
        radius: 1000.0,
        material: { color: { r: 120, g: 120, b: 120 }, roughness: 0.0 }
    },
    // Left wall (red)
    {
        position: new Vector(-1005, 0, 0),
        radius: 1000.0,
        material: { color: { r: 40, g: 200, b: 40 }, roughness: 0.0 }
    },
    // Right wall (green)
    {
        position: new Vector(1005, 0, 0),
        radius: 1000.0,
        material: { color: { r: 200, g: 40, b: 40 }, roughness: 0.0 }
    },

    // Ceiling lamp (bright light fixture near ceiling center)
    {
        position: new Vector(0, 5.0, -1.5),
        radius: 2.4,
        material: { color: { r: 1000, g: 1000, b: 800 }, roughness: 0.0, emissive: true }
    },

    // Small objects inside the room (spheres instead of boxes)
    // Big red 'box' represented by a sphere sitting on the floor
    {
        position: new Vector(1.2, -2.0, -2.5),
        radius: 1.3,
        material: { color: { r: 200, g: 100, b: 100 }, roughness: 0.0 }
    },
    // Smaller white object
    {
        position: new Vector(-1.4, -2.0, -2.0),
        radius: 0.9,
        material: { color: { r: 230, g: 230, b: 230 }, roughness: 0.0 }
    },
    // Small green ball near the back
    {
        position: new Vector(2.4, -1.2, -3.0),
        radius: 0.6,
        material: { color: { r: 100, g: 220, b: 120 }, roughness: 0.0 }
    }
];

// DOM Elements
const camPosXRange = document.getElementById("cam-pos-x");
const camPosYRange = document.getElementById("cam-pos-y");
const camPosZRange = document.getElementById("cam-pos-z");
const camFovRange = document.getElementById("cam-fov");

// New orbit/angle controls (optional in HTML). Elevation: -90..90, Azimuth: 0..360
const camElevRange = document.getElementById("cam-elev");
const camAzimRange = document.getElementById("cam-azim");
const camDistRange = document.getElementById("cam-dist");

const camPosXNum = document.getElementById("cam-pos-x-num");
const camPosYNum = document.getElementById("cam-pos-y-num");
const camPosZNum = document.getElementById("cam-pos-z-num");
const camFovNum = document.getElementById("cam-fov-num");

const camElevNum = document.getElementById("cam-elev-num");
const camAzimNum = document.getElementById("cam-azim-num");
const camDistNum = document.getElementById("cam-dist-num");
const samplesPerFrameRange = document.getElementById("samples-per-frame");
const samplesPerFrameNum = document.getElementById("samples-per-frame-num");
const maxBouncesRange = document.getElementById("max-bounces");
const maxBouncesNum = document.getElementById("max-bounces-num");

const resolutionSelect = document.getElementById("resolution-select");
const resetCameraBtn = document.getElementById("reset-camera");

// Debug display elements
const debugResolution = document.getElementById("debug-resolution");
const debugCamPos = document.getElementById("debug-cam-pos");
const debugCamFov = document.getElementById("debug-cam-fov");
const debugLookAt = document.getElementById("debug-look-at");
const debugCamUp = document.getElementById("debug-cam-up");
const debugSphereCount = document.getElementById("debug-sphere-count");

// Sync range and number inputs
function syncInput(rangeEl, numberEl) {
    if (!rangeEl || !numberEl) return;
    rangeEl.addEventListener("input", () => {
        numberEl.value = rangeEl.value;
        updateCamera();
    });
    numberEl.addEventListener("input", () => {
        rangeEl.value = numberEl.value;
        updateCamera();
    });
}

if (camPosXRange && camPosXNum) syncInput(camPosXRange, camPosXNum);
if (camPosYRange && camPosYNum) syncInput(camPosYRange, camPosYNum);
if (camPosZRange && camPosZNum) syncInput(camPosZRange, camPosZNum);
if (camFovRange && camFovNum) syncInput(camFovRange, camFovNum);

// Wire up new controls if present
if (camElevRange && camElevNum) syncInput(camElevRange, camElevNum);
if (camAzimRange && camAzimNum) syncInput(camAzimRange, camAzimNum);
if (camDistRange && camDistNum) syncInput(camDistRange, camDistNum);
if (samplesPerFrameRange && samplesPerFrameNum) syncInput(samplesPerFrameRange, samplesPerFrameNum);
if (maxBouncesRange && maxBouncesNum) syncInput(maxBouncesRange, maxBouncesNum);

// Progressive rendering state
let progressiveRenderingEnabled = true;
let currentRenderLine = 0;
let linesPerFrame = 8; // Adjust for performance
let samplesPerFrame = samplesPerFrameRange ? parseInt(samplesPerFrameRange.value) : 1;
let maxBounces = maxBouncesRange ? parseInt(maxBouncesRange.value) : 2;


// Update camera from controls
function updateCamera() {
    const fov = parseFloat(camFovRange.value);

    // If orbit controls exist, use elevation/azimuth + distance to compute position
    if (camElevRange && camAzimRange) {
        const elev = parseFloat(camElevRange.value); // -90 .. 90
        const azim = parseFloat(camAzimRange.value); // 0 .. 360
        const dist = camDistRange ? parseFloat(camDistRange.value) : Vector.magnitude(Vector.subtract(camera.pos, camera.lookAt));

        camera.setOrbit(elev, azim, dist);
        camera.fov = fov;
        // setOrbit already updates view matrix
    } else {
        const x = parseFloat(camPosXRange.value);
        const y = parseFloat(camPosYRange.value);
        const z = parseFloat(camPosZRange.value);

        camera.pos = new Vector(x, y, z);
        camera.fov = fov;
        camera.updateViewMatrix();
    }

    // Reset progressive rendering on camera change
    currentRenderLine = 0;
    // reset accumulation when camera or other important params change
    accumBuffer.fill(0);
    sampleCountBuffer.fill(0);

    updateDebugDisplay();
}

// Update debug display
function updateDebugDisplay() {
    const width = canvas.width;
    const height = canvas.height;
    debugResolution.textContent = `${width} x ${height}`;

    if (camElevRange && camAzimRange) {
        const az = (((camera.orbitAzimuth % 360) + 360) % 360);
        debugCamPos.textContent = `Elev: ${camera.orbitElevation.toFixed(2)}°, Azim: ${az.toFixed(2)}°`;
    } else {
        const pos = camera.pos;
        debugCamPos.textContent = `X: ${pos.x.toFixed(2)}, Y: ${pos.y.toFixed(2)}, Z: ${pos.z.toFixed(2)}`;
    }

    debugCamFov.textContent = `${camera.fov.toFixed(1)}°`;

    const lookAt = camera.lookAt;
    debugLookAt.textContent = `X: ${lookAt.x.toFixed(2)}, Y: ${lookAt.y.toFixed(2)}, Z: ${lookAt.z.toFixed(2)}`;

    const up = camera.up;
    debugCamUp.textContent = `X: ${up.x.toFixed(2)}, Y: ${up.y.toFixed(2)}, Z: ${up.z.toFixed(2)}`;

    debugSphereCount.textContent = spheres.length;
}

// Reset camera button
resetCameraBtn.addEventListener("click", () => {
    // If using orbit controls, reset to a default orbit
    if (camElevRange && camAzimRange) {
        camElevRange.value = 20; // elevation
        if (camElevNum) camElevNum.value = 20;
        camAzimRange.value = 90; // azimuth
        if (camAzimNum) camAzimNum.value = 90;
        if (camDistRange) { camDistRange.value = 1; if (camDistNum) camDistNum.value = 1; }
        camFovRange.value = 90;
        camFovNum.value = 90;
    } else {
        camPosXRange.value = 0;
        camPosXNum.value = 0;
        camPosYRange.value = 2;
        camPosYNum.value = 2;
        camPosZRange.value = 8;
        camPosZNum.value = 8;
        camFovRange.value = 90;
        camFovNum.value = 90;
    }

    updateCamera();
});

// Resolution change
resolutionSelect.addEventListener("change", (e) => {
    const res = e.target.value;
    const [width, height] = res.split("x").map(Number);
    // Recreate internal buffer at the requested resolution
    setupViewportBuffer(width, height);

    // Reset progressive rendering on resolution change
    currentRenderLine = 0;

    updateDebugDisplay();
});

// Keep samplesPerFrame and maxBounces in sync when their controls change
if (samplesPerFrameRange) samplesPerFrameRange.addEventListener('input', () => { samplesPerFrame = parseInt(samplesPerFrameRange.value); });
if (samplesPerFrameNum) samplesPerFrameNum.addEventListener('input', () => { samplesPerFrame = parseInt(samplesPerFrameNum.value); });
if (maxBouncesRange) maxBouncesRange.addEventListener('input', () => { maxBounces = parseInt(maxBouncesRange.value); });
if (maxBouncesNum) maxBouncesNum.addEventListener('input', () => { maxBounces = parseInt(maxBouncesNum.value); });

function clearViewportBuffer()
{
    ViewportBuffer32.fill(0);    
}

// Progressive rendering function
function renderFrameProgressive() {
    const aspectRatio = canvas.width / canvas.height;
    
    // Render scanlines incrementally
    const startLine = currentRenderLine;
    const endLine = Math.min(currentRenderLine + linesPerFrame, canvas.height);
    
    for (let y = startLine; y < endLine; y++) {
        for (let x = 0; x < canvas.width; x++) {
                // Normalize screen coordinates to 0-1
                const screenX = (x + Math.random()) / canvas.width;
                const screenY = (y + Math.random()) / canvas.height;

                // perform `samplesPerFrame` random samples per pixel this frame
                const idx = (y * canvas.width + x);
                let accR = 0, accG = 0, accB = 0;
                for (let s = 0; s < samplesPerFrame; s++) {
                    const ray = camera.getRay(screenX, screenY, aspectRatio);
                    const col = tracePath(ray, spheres, maxBounces);
                    accR += col.r;
                    accG += col.g;
                    accB += col.b;
                }

                // accumulate into float buffer and update per-pixel sample count
                accumBuffer[idx * 3 + 0] += accR;
                accumBuffer[idx * 3 + 1] += accG;
                accumBuffer[idx * 3 + 2] += accB;
                sampleCountBuffer[idx] += samplesPerFrame;

                // compute displayed color as average for this pixel
                const totalSamples = Math.max(1, sampleCountBuffer[idx]);
                const r = Math.min(255, Math.floor((accumBuffer[idx * 3 + 0] / totalSamples) * 255));
                const g = Math.min(255, Math.floor((accumBuffer[idx * 3 + 1] / totalSamples) * 255));
                const b = Math.min(255, Math.floor((accumBuffer[idx * 3 + 2] / totalSamples) * 255));
                const pixelColor = packRGBA(r, g, b, 255);
                ViewportBuffer32[idx] = pixelColor;
        }
    }
    
        // scanline completed; advance currentRenderLine
        currentRenderLine = endLine;
    
    // Reset if finished
    if (currentRenderLine >= canvas.height) {
        currentRenderLine = 0;
    }
}

function renderFrame()
{
    if (progressiveRenderingEnabled) {
        renderFrameProgressive();
    } else {
        clearViewportBuffer();
        drawRayTracer(camera, spheres);
    }
    
    ctx.putImageData(img, 0, 0);
    requestAnimationFrame(renderFrame);
}

// Initialize internal buffer from the resolution select (keeps displayed canvas
// occupying the same panel space while internal resolution changes).
if (resolutionSelect && resolutionSelect.value) {
    const [initW, initH] = resolutionSelect.value.split('x').map(Number);
    setupViewportBuffer(initW, initH);
} else {
    setupViewportBuffer(canvas.width, canvas.height);
}

// Sync HTML input values to the camera at startup
updateCamera();

// Initialize debug display and start rendering
requestAnimationFrame(renderFrame);