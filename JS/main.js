import { drawRayTracer, Camera, traceRay, packRGBA } from "./rayTracing.js";
import { Vector } from "./mathLib.js";

export const canvas = document.getElementById("Viewport");
const ctx = canvas.getContext("2d", { alpha: false });

const img = ctx.createImageData(canvas.width, canvas.height);
export const ViewportBuffer32 = new Uint32Array(img.data.buffer);

// Create camera
const camera = new Camera(
    new Vector(0, 2, 8),
    new Vector(0, 0, 0),
    new Vector(0, 1, 0),
    90
);

// Create test scene with spheres
const spheres = [
    {
        position: new Vector(0, 0, 0),
        radius: 2.0,
        material: { color: { r: 255, g: 100, b: 100 }, roughness: 0.0 }
    },
    {
        position: new Vector(-4, 1, -2),
        radius: 1.5,
        material: { color: { r: 100, g: 255, b: 100 }, roughness: 0.0 }
    },
    {
        position: new Vector(4, 1, -2),
        radius: 1.5,
        material: { color: { r: 100, g: 100, b: 255 }, roughness: 0.0 }
    },
    {
        position: new Vector(0, -5000010, 0),
        radius: 5000000.0,
        material: { color: { r: 255, g: 255, b: 255 }, roughness: 0.0 }
    },
    {
        position: new Vector(3, 0, 0),
        radius: 1.0,
        material: { color: { r: 255, g: 255, b: 255 }, roughness: 0.0 }
    }
];

// DOM Elements
const camPosXRange = document.getElementById("cam-pos-x");
const camPosYRange = document.getElementById("cam-pos-y");
const camPosZRange = document.getElementById("cam-pos-z");
const camFovRange = document.getElementById("cam-fov");

const camPosXNum = document.getElementById("cam-pos-x-num");
const camPosYNum = document.getElementById("cam-pos-y-num");
const camPosZNum = document.getElementById("cam-pos-z-num");
const camFovNum = document.getElementById("cam-fov-num");

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
    rangeEl.addEventListener("input", () => {
        numberEl.value = rangeEl.value;
        updateCamera();
    });
    numberEl.addEventListener("input", () => {
        rangeEl.value = numberEl.value;
        updateCamera();
    });
}

syncInput(camPosXRange, camPosXNum);
syncInput(camPosYRange, camPosYNum);
syncInput(camPosZRange, camPosZNum);
syncInput(camFovRange, camFovNum);

// Progressive rendering state
let progressiveRenderingEnabled = true;
let currentRenderLine = 0;
let linesPerFrame = 8; // Adjust for performance

// Update camera from controls
function updateCamera() {
    const x = parseFloat(camPosXRange.value);
    const y = parseFloat(camPosYRange.value);
    const z = parseFloat(camPosZRange.value);
    const fov = parseFloat(camFovRange.value);

    camera.pos = new Vector(x, y, z);
    camera.fov = fov;
    camera.updateViewMatrix();

    // Reset progressive rendering on camera change
    currentRenderLine = 0;

    updateDebugDisplay();
}

// Update debug display
function updateDebugDisplay() {
    const width = canvas.width;
    const height = canvas.height;
    debugResolution.textContent = `${width} x ${height}`;

    const pos = camera.pos;
    debugCamPos.textContent = `X: ${pos.x.toFixed(2)}, Y: ${pos.y.toFixed(2)}, Z: ${pos.z.toFixed(2)}`;

    debugCamFov.textContent = `${camera.fov.toFixed(1)}°`;

    const lookAt = camera.lookAt;
    debugLookAt.textContent = `X: ${lookAt.x.toFixed(2)}, Y: ${lookAt.y.toFixed(2)}, Z: ${lookAt.z.toFixed(2)}`;

    const up = camera.up;
    debugCamUp.textContent = `X: ${up.x.toFixed(2)}, Y: ${up.y.toFixed(2)}, Z: ${up.z.toFixed(2)}`;

    debugSphereCount.textContent = spheres.length;
}

// Reset camera button
resetCameraBtn.addEventListener("click", () => {
    camPosXRange.value = 0;
    camPosXNum.value = 0;
    camPosYRange.value = 2;
    camPosYNum.value = 2;
    camPosZRange.value = 8;
    camPosZNum.value = 8;
    camFovRange.value = 90;
    camFovNum.value = 90;
    
    updateCamera();
});

// Resolution change
resolutionSelect.addEventListener("change", (e) => {
    const res = e.target.value;
    const [width, height] = res.split("x").map(Number);
    
    canvas.width = width;
    canvas.height = height;
    
    // Reset progressive rendering on resolution change
    currentRenderLine = 0;
    
    updateDebugDisplay();
});

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
            const screenX = x / canvas.width;
            const screenY = y / canvas.height;
            
            // Get ray from camera
            const ray = camera.getRay(screenX, screenY, aspectRatio);
            
            // Trace ray
            const hit = traceRay(ray, spheres);
            
            let pixelColor = 0x000000FF; // Black background
            
            if (hit.hit) {
                // Simple shading based on normal
                const lightDir = Vector.normalize(new Vector(1, 0, 2));
                const brightness = Math.max(0, Vector.dot(hit.normal, lightDir)) * 0.8 + 0.2;
                
                const r = Math.floor(hit.material.color.r * brightness);
                const g = Math.floor(hit.material.color.g * brightness);
                const b = Math.floor(hit.material.color.b * brightness);
                
                pixelColor = packRGBA(r, g, b, 255);
            }
            
            ViewportBuffer32[y * canvas.width + x] = pixelColor;
        }
    }
    
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

// Initialize debug display
updateDebugDisplay();
requestAnimationFrame(renderFrame);