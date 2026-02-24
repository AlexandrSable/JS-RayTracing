import { Camera, traceRay, tracePath, packRGBA } from "./rayTracing.js";
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
    0, 2, 1,
    0, 0, 0,
    0, 1, 0,
    90
);

// Cornell-like room built from large tangent spheres for walls and a few interior spheres
const spheres = [
    // Floor (large sphere tangent near y = -3)
    {
        px: 0, py: -1003, pz: 0,
        radius: 1000.0,
        material: { color: { r: 220, g: 220, b: 220 }, roughness: 0.0 }
    },
    // Ceiling
    {
        px: 0, py: 1003, pz: 0,
        radius: 1000.0,
        material: { color: { r: 240, g: 240, b: 240 }, roughness: 0.0 }
    },
    // Back wall (tangent near z = -5) - darkened
    {
        px: 0, py: 0, pz: -1005,
        radius: 1000.0,
        material: { color: { r: 120, g: 120, b: 120 }, roughness: 0.0 }
    },
    // Left wall (red)
    {
        px: -1005, py: 0, pz: 0,
        radius: 1000.0,
        material: { color: { r: 40, g: 200, b: 40 }, roughness: 0.0 }
    },
    // Right wall (green)
    {
        px: 1005, py: 0, pz: 0,
        radius: 1000.0,
        material: { color: { r: 200, g: 40, b: 40 }, roughness: 0.0 }
    },

    // Ceiling lamp (bright light fixture near ceiling center)
    {
        px: 0, py: 5.0, pz: -1.5,
        radius: 2.4,
        material: { color: { r: 1000, g: 1000, b: 800 }, roughness: 0.0, emissive: true }
    },

    // Small objects inside the room (spheres instead of boxes)
    // Big red 'box' represented by a sphere sitting on the floor
    {
        px: 1.2, py: -2.0, pz: -2.5,
        radius: 1.3,
        material: { color: { r: 200, g: 100, b: 100 }, roughness: 0.0 }
    },
    // Smaller white object
    {
        px: -1.4, py: -2.0, pz: -2.0,
        radius: 0.9,
        material: { color: { r: 230, g: 230, b: 230 }, roughness: 0.0 }
    },
    // Small green ball near the back
    {
        px: 2.4, py: -1.2, pz: -3.0,
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
let samplesPerFrame = samplesPerFrameRange ? parseInt(samplesPerFrameRange.value) : 1;
let maxBounces = maxBouncesRange ? parseInt(maxBouncesRange.value) : 2;


// Update camera from controls
function updateCamera() {
    const fov = parseFloat(camFovRange.value);

    // If orbit controls exist, use elevation/azimuth + distance to compute position
    if (camElevRange && camAzimRange) {
        const elev = parseFloat(camElevRange.value); // -90 .. 90
        const azim = parseFloat(camAzimRange.value); // 0 .. 360
        const offsetX = camera.posX - camera.lookAtX;
        const offsetY = camera.posY - camera.lookAtY;
        const offsetZ = camera.posZ - camera.lookAtZ;
        const dist = camDistRange ? parseFloat(camDistRange.value) : Math.sqrt(offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ);

        camera.setOrbit(elev, azim, dist);
        camera.fov = fov;
        // setOrbit already updates view matrix
    } else {
        const x = parseFloat(camPosXRange.value);
        const y = parseFloat(camPosYRange.value);
        const z = parseFloat(camPosZRange.value);

        camera.posX = x;
        camera.posY = y;
        camera.posZ = z;
        camera.fov = fov;
        camera.updateViewMatrix();
    }

    // Reset progressive rendering on camera change
    accumBuffer.fill(0);
    sampleCountBuffer.fill(0);
    resetWorkQueue();
    sceneGeneration++; // Invalidate pending work from old camera state

    updateDebugDisplay();
    
    // Update workers with new camera data
    updateAllWorkers();
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
        debugCamPos.textContent = `X: ${camera.posX.toFixed(2)}, Y: ${camera.posY.toFixed(2)}, Z: ${camera.posZ.toFixed(2)}`;
    }

    debugCamFov.textContent = `${camera.fov.toFixed(1)}°`;

    debugLookAt.textContent = `X: ${camera.lookAtX.toFixed(2)}, Y: ${camera.lookAtY.toFixed(2)}, Z: ${camera.lookAtZ.toFixed(2)}`;

    debugCamUp.textContent = `X: ${camera.upX.toFixed(2)}, Y: ${camera.upY.toFixed(2)}, Z: ${camera.upZ.toFixed(2)}`;

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
    
    // Increment generation to invalidate pending worker results
    sceneGeneration++;
    
    // Recreate internal buffer at the requested resolution
    setupViewportBuffer(width, height);
    
    // Clear accumulation buffers for clean render at new resolution
    accumBuffer.fill(0);
    sampleCountBuffer.fill(0);
    clearViewportBuffer();

    // Reset work queue for new resolution
    initWorkQueue(height);

    updateDebugDisplay();
});;

// Keep samplesPerFrame and maxBounces in sync when their controls change
if (samplesPerFrameRange) samplesPerFrameRange.addEventListener('input', () => { samplesPerFrame = parseInt(samplesPerFrameRange.value); });
if (samplesPerFrameNum) samplesPerFrameNum.addEventListener('input', () => { samplesPerFrame = parseInt(samplesPerFrameNum.value); });
if (maxBouncesRange) maxBouncesRange.addEventListener('input', () => { maxBounces = parseInt(maxBouncesRange.value); });
if (maxBouncesNum) maxBouncesNum.addEventListener('input', () => { maxBounces = parseInt(maxBouncesNum.value); });

function clearViewportBuffer()
{
    ViewportBuffer32.fill(0x000000FF);  // Black background with full alpha
}

// Draw without progressive rendering (fallback mode)
function drawRayTracer(cam, sphs) {
    const aspectRatio = canvas.width / canvas.height;
    
    // Precomputed light direction (normalized)
    const lightDirX = 1 / Math.sqrt(5);
    const lightDirY = 0;
    const lightDirZ = 2 / Math.sqrt(5);
    
    for(let y = 0; y < canvas.height; y++)
    {
        for(let x = 0; x < canvas.width; x++)
        {
            const screenX = x / canvas.width;
            const screenY = y / canvas.height;
            
            const ray = cam.getRay(screenX, screenY, aspectRatio);
            const hit = traceRay(ray, sphs);
            
            let pixelColor = 0x000000FF; // Black background
            
            if (hit.hit) {
                const brightness = Math.max(0, hit.nx * lightDirX + hit.ny * lightDirY + hit.nz * lightDirZ) * 0.8 + 0.2;
                
                const r = Math.floor(hit.material.color.r * brightness);
                const g = Math.floor(hit.material.color.g * brightness);
                const b = Math.floor(hit.material.color.b * brightness);
                
                pixelColor = packRGBA(r, g, b, 255);
            }
            
            ViewportBuffer32[y * canvas.width + x] = pixelColor;
        }
    }
}


// Web Worker setup with dynamic load balancing
const numWorkers = navigator.hardwareConcurrency || 4;
let workers = [];
let workersInitialized = false;
let sceneGeneration = 0; // Increment when resolution/scene changes

// Work queue system
const TILE_HEIGHT = 32; // Larger tiles reduce overhead
let workQueue = [];
let currentWorkIndex = 0;
let completedTiles = new Set();

function initWorkQueue(canvasHeight) {
    workQueue = [];
    currentWorkIndex = 0;
    completedTiles.clear();
    
    // Create tiles for the entire image
    for (let y = 0; y < canvasHeight; y += TILE_HEIGHT) {
        workQueue.push({
            startY: y,
            endY: Math.min(y + TILE_HEIGHT, canvasHeight)
        });
    }
}

function getNextWorkTile() {
    if (currentWorkIndex < workQueue.length) {
        return {
            tileId: currentWorkIndex,
            tile: workQueue[currentWorkIndex++]
        };
    }
    return null;
}

function hasAllTilesCompleted() {
    return completedTiles.size === workQueue.length;
}

function resetWorkQueue() {
    currentWorkIndex = 0;
    completedTiles.clear();
}

function initializeWorkers() {
    if (workersInitialized) return;
    workersInitialized = true;
    
    // Initialize work queue
    initWorkQueue(canvas.height);
    
    for (let i = 0; i < numWorkers; i++) {
        const worker = new Worker("JS/rayTracingWorker.js", { type: "module" });
        
        worker.onmessage = function(event) {
            const { type, workerId, data } = event.data;
            
            if (type === 'requestWork') {
                handleWorkerWorkRequest(worker, workerId);
            } else if (type === 'renderComplete') {
                handleWorkerResult(data);
                handleWorkerWorkRequest(worker, workerId); // Auto-request next work
            }
        };
        
        // Send initialization
        worker.postMessage({
            type: 'init',
            data: {
                workerId: i,
                camera: {
                    posX: camera.posX,
                    posY: camera.posY,
                    posZ: camera.posZ,
                    lookAtX: camera.lookAtX,
                    lookAtY: camera.lookAtY,
                    lookAtZ: camera.lookAtZ,
                    upX: camera.upX,
                    upY: camera.upY,
                    upZ: camera.upZ,
                    fov: camera.fov,
                    forwardX: camera.forwardX,
                    forwardY: camera.forwardY,
                    forwardZ: camera.forwardZ,
                    rightX: camera.rightX,
                    rightY: camera.rightY,
                    rightZ: camera.rightZ,
                    worldUpX: camera.worldUpX,
                    worldUpY: camera.worldUpY,
                    worldUpZ: camera.worldUpZ,
                    orbitRadius: camera.orbitRadius,
                    orbitElevation: camera.orbitElevation,
                    orbitAzimuth: camera.orbitAzimuth
                },
                spheres: spheres
            }
        });
        
        workers.push(worker);
    }
}

function handleWorkerWorkRequest(worker, workerId) {
    // Only assign if we have tiles remaining in this pass
    if (currentWorkIndex >= workQueue.length) {
        // All tiles assigned for this pass
        if (completedTiles.size === workQueue.length) {
            // All tiles completed - reset for next progressive pass
            resetWorkQueue();
            // Don't assign new work yet, worker will request next frame
        }
        return;
    }
    
    const work = getNextWorkTile();
    if (!work) {
        return;
    }
    
    const { tileId, tile } = work;
    const stripHeight2 = tile.endY - tile.startY;
    const workerAccumBuffer = new Float32Array(canvas.width * stripHeight2 * 3);
    const workerSampleCountBuffer = new Uint32Array(canvas.width * stripHeight2);
    
    // Copy existing buffers for this tile
    let srcOffset = tile.startY * canvas.width;
    let dstOffset = 0;
    for (let y = tile.startY; y < tile.endY; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const srcIdx = srcOffset + x;
            const dstIdx = dstOffset + x;
            workerAccumBuffer[dstIdx * 3 + 0] = accumBuffer[srcIdx * 3 + 0];
            workerAccumBuffer[dstIdx * 3 + 1] = accumBuffer[srcIdx * 3 + 1];
            workerAccumBuffer[dstIdx * 3 + 2] = accumBuffer[srcIdx * 3 + 2];
            workerSampleCountBuffer[dstIdx] = sampleCountBuffer[srcIdx];
        }
        srcOffset += canvas.width;
        dstOffset += canvas.width;
    }
    
    // Send work to worker
    worker.postMessage({
        type: 'work',
        data: {
            generation: sceneGeneration,
            tileId,
            startY: tile.startY,
            endY: tile.endY,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            samplesPerFrame,
            maxBounces,
            accumBuffer: workerAccumBuffer,
            sampleCountBuffer: workerSampleCountBuffer
        }
    }, [workerAccumBuffer.buffer, workerSampleCountBuffer.buffer]);
}

function handleWorkerResult(data) {
    const { startY, endY, pixels, accumBuffer: workerAccum, sampleCountBuffer: workerSamples, generation, tileId } = data;

    // Ignore results from old scene generations (resolution changes, camera resets)
    if (generation !== sceneGeneration) {
        return;
    }

    // Mark this tile as completed
    if (typeof tileId === 'number') completedTiles.add(tileId);

    // Merge worker results back to main buffers
    let stripOffset = 0;
    for (let y = startY; y < endY; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const mainIdx = y * canvas.width + x;
            const stripIdx = stripOffset + x;

            // Copy returned accumulators and sample counts for this tile
            accumBuffer[mainIdx * 3 + 0] = workerAccum[stripIdx * 3 + 0];
            accumBuffer[mainIdx * 3 + 1] = workerAccum[stripIdx * 3 + 1];
            accumBuffer[mainIdx * 3 + 2] = workerAccum[stripIdx * 3 + 2];
            sampleCountBuffer[mainIdx] = workerSamples[stripIdx];

            ViewportBuffer32[mainIdx] = pixels[stripIdx];
        }
        stripOffset += canvas.width;
    }

    // If all tiles completed, reset for next progressive pass
    if (completedTiles.size === workQueue.length) {
        resetWorkQueue();
    }
}

function updateAllWorkers() {
    if (!workersInitialized) return;
    // Reinit workers with new camera data
    workers.forEach((worker, idx) => {
        worker.postMessage({
            type: 'init',
            data: {
                workerId: idx,
                camera: {
                    posX: camera.posX,
                    posY: camera.posY,
                    posZ: camera.posZ,
                    lookAtX: camera.lookAtX,
                    lookAtY: camera.lookAtY,
                    lookAtZ: camera.lookAtZ,
                    upX: camera.upX,
                    upY: camera.upY,
                    upZ: camera.upZ,
                    fov: camera.fov,
                    forwardX: camera.forwardX,
                    forwardY: camera.forwardY,
                    forwardZ: camera.forwardZ,
                    rightX: camera.rightX,
                    rightY: camera.rightY,
                    rightZ: camera.rightZ,
                    worldUpX: camera.worldUpX,
                    worldUpY: camera.worldUpY,
                    worldUpZ: camera.worldUpZ,
                    orbitRadius: camera.orbitRadius,
                    orbitElevation: camera.orbitElevation,
                    orbitAzimuth: camera.orbitAzimuth
                },
                spheres: spheres
            }
        });
    });
}

function renderFrameWithWorkers() {
    if (!workersInitialized) return;
    
    // Ensure work queue is initialized for this progressive pass
    if (workQueue.length === 0) {
        initWorkQueue(canvas.height);
        // Prime the pump: start work requests from all workers
        for (let i = 0; i < workers.length; i++) {
            workers[i].postMessage({ type: 'requestWork', workerId: i });
        }
    }
}



function renderFrame()
{
    if (progressiveRenderingEnabled) {
        renderFrameWithWorkers();
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

// Initialize workers after camera is fully set up
initializeWorkers();

// Initialize debug display and start rendering
requestAnimationFrame(renderFrame);