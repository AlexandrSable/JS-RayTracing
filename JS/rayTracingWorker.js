import { traceRay, tracePath, packRGBA } from "./rayTracing.js";

let cameraData = null;
let spheres = null;
let workerId = null;

// Helper class to mimic Camera for ray generation
class CameraProxy {
    constructor(data) {
        this.posX = data.posX;
        this.posY = data.posY;
        this.posZ = data.posZ;
        this.forwardX = data.forwardX;
        this.forwardY = data.forwardY;
        this.forwardZ = data.forwardZ;
        this.rightX = data.rightX;
        this.rightY = data.rightY;
        this.rightZ = data.rightZ;
        this.upX = data.upX;
        this.upY = data.upY;
        this.upZ = data.upZ;
        this.fov = data.fov;
    }
    
    getRay(screenX, screenY, aspectRatio) {
        const fovRadians = (this.fov * Math.PI) / 180;
        const viewportHeight = 2.0 * Math.tan(fovRadians / 2.0);
        const viewportWidth = viewportHeight * aspectRatio;
        
        const u = (screenX - 0.5) * viewportWidth;
        const v = (0.5 - screenY) * viewportHeight;
        
        const dirX = this.rightX * u + this.upX * v + this.forwardX;
        const dirY = this.rightY * u + this.upY * v + this.forwardY;
        const dirZ = this.rightZ * u + this.upZ * v + this.forwardZ;
        
        return {
            ox: this.posX,
            oy: this.posY,
            oz: this.posZ,
            dx: dirX,
            dy: dirY,
            dz: dirZ
        };
    }
}

// Receive camera and sphere data from main thread
self.onmessage = function(event) {
    const { type, data } = event.data;
    
    if (type === 'init') {
        workerId = data.workerId;
        cameraData = new CameraProxy(data.camera);
        spheres = data.spheres;
        // Request first work item
        self.postMessage({ type: 'requestWork', workerId });
    } 
    else if (type === 'work') {
        // Render assigned work tile
        const { generation, tileId, startY, endY, canvasWidth, canvasHeight, samplesPerFrame, maxBounces, accumBuffer, sampleCountBuffer } = data;
        
        const aspectRatio = canvasWidth / canvasHeight;
        const result = new Uint32Array(canvasWidth * (endY - startY));
        const outAccumBuffer = new Float32Array(accumBuffer);
        const outSampleCountBuffer = new Uint32Array(sampleCountBuffer);
        
        // Render this tile
        for (let y = startY; y < endY; y++) {
            for (let x = 0; x < canvasWidth; x++) {
                const screenX = (x + Math.random()) / canvasWidth;
                const screenY = (y + Math.random()) / canvasHeight;
                
                const stripIdx = (y - startY) * canvasWidth + x;
                let accR = 0, accG = 0, accB = 0;
                
                for (let s = 0; s < samplesPerFrame; s++) {
                    const ray = cameraData.getRay(screenX, screenY, aspectRatio);
                    const col = tracePath(ray, spheres, maxBounces);
                    accR += col.r;
                    accG += col.g;
                    accB += col.b;
                }
                
                outAccumBuffer[stripIdx * 3 + 0] += accR;
                outAccumBuffer[stripIdx * 3 + 1] += accG;
                outAccumBuffer[stripIdx * 3 + 2] += accB;
                outSampleCountBuffer[stripIdx] += samplesPerFrame;
                
                const totalSamples = Math.max(1, outSampleCountBuffer[stripIdx]);
                const r = Math.min(255, Math.floor((outAccumBuffer[stripIdx * 3 + 0] / totalSamples) * 255));
                const g = Math.min(255, Math.floor((outAccumBuffer[stripIdx * 3 + 1] / totalSamples) * 255));
                const b = Math.min(255, Math.floor((outAccumBuffer[stripIdx * 3 + 2] / totalSamples) * 255));
                const pixelColor = packRGBA(r, g, b, 255);
                
                result[stripIdx] = pixelColor;
            }
        }
        
        // Send back the rendered tile
        self.postMessage({
            type: 'renderComplete',
            data: {
                generation,
                tileId,
                startY,
                endY,
                pixels: result,
                accumBuffer: outAccumBuffer,
                sampleCountBuffer: outSampleCountBuffer
            }
        }, [result.buffer, outAccumBuffer.buffer, outSampleCountBuffer.buffer]);
        
        // Request next work item
        self.postMessage({ type: 'requestWork', workerId });
    }
};

