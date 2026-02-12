import { ViewportBuffer32, canvas} from "./main.js";
import { Vector } from "./mathLib.js";


function packRGBA(r, g, b, a = 255) {
    return (a << 24) | (b << 16) | (g << 8) | r;
}

export { packRGBA };

class Ray
{
    constructor(origin, dir) {
        this.origin = origin;
        this.dir = dir;
    }
}

// Factory function to create new HitResults
function createHitResult() {
    return {
        hit: false,
        dst: 0.0,
        hitPos: new Vector(0.0, 0.0, 0.0),
        normal: new Vector(0.0, 0.0, 0.0),
    };
}

const RayTracedMaterial =
{
    color: { r: 255, g: 255, b: 255 },
    roughness: 0.0
};

const Sphere = 
{
    position: new Vector(0.0, 0.0, 0.0),
    radius: 1.0,
    material: RayTracedMaterial
}

class Camera
{
    constructor(pos, lookAt, up, fov) {
        this.pos    =    pos || new Vector(0, 2.5, 10);
        this.lookAt = lookAt || new Vector(0, 0, 0);
        this.up     =     up || new Vector(0, 1, 0);
        this.fov    =    fov || 90;
        
        this.updateViewMatrix();
    }
    
    updateViewMatrix() {
        // Calculate forward vector (from pos to lookAt)
        this.forward = Vector.subtract(this.lookAt, this.pos);
        this.forward = Vector.normalize(this.forward);
        
        // Calculate right vector
        this.right = Vector.cross(this.forward, this.up);
        this.right = Vector.normalize(this.right);
        
        // Recalculate up to ensure orthogonality
        this.up = Vector.cross(this.right, this.forward);
        this.up = Vector.normalize(this.up);
    }
    
    // Generate a ray for a given screen coordinate (0-1 normalized)
    getRay(screenX, screenY, aspectRatio) {
        const fovRadians = (this.fov * Math.PI) / 180;
        const viewportHeight = 2.0 * Math.tan(fovRadians / 2.0);
        const viewportWidth = viewportHeight * aspectRatio;
        
        // Calculate ray direction in view space
        const u = (screenX - 0.5) * viewportWidth;
        const v = (0.5 - screenY) * viewportHeight;
        
        // Convert to world space
        const dir = Vector.add(
            Vector.add(
                Vector.scale(this.right, u),
                Vector.scale(this.up, v)
            ),
            Vector.scale(this.forward, 1.0)
        );
        
        const normalizedDir = Vector.normalize(dir);
        return new Ray(this.pos, normalizedDir);
    }
}

export { Camera };




// Ray-sphere intersection
function raySphereIntersect(ray, sphere) {
    const result = createHitResult();
    
    const oc = Vector.subtract(ray.origin, sphere.position);
    const a = Vector.dot(ray.dir, ray.dir);
    const b = 2.0 * Vector.dot(oc, ray.dir);
    const c = Vector.dot(oc, oc) - sphere.radius * sphere.radius;
    
    const discriminant = b * b - 4 * a * c;
    
    if (discriminant < 0) {
        return result; // No hit
    }
    
    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);
    
    // Use the closest positive intersection
    let t = -1;
    if (t1 > 0.001) t = t1;
    else if (t2 > 0.001) t = t2;
    
    if (t < 0) {
        return result; // No valid hit
    }
    
    result.hit = true;
    result.dst = t;
    result.hitPos = Vector.add(ray.origin, Vector.scale(ray.dir, t));
    result.normal = Vector.normalize(Vector.subtract(result.hitPos, sphere.position));
    
    return result;
}

// Main ray tracing function
function traceRay(ray, spheres) {
    let closest = createHitResult();
    let minDist = Infinity;
    
    for (let sphere of spheres) {
        const hit = raySphereIntersect(ray, sphere);
        if (hit.hit && hit.dst < minDist) {
            minDist = hit.dst;
            closest = hit;
            closest.material = sphere.material;
        }
    }
    
    return closest;
}

export { traceRay };

export function drawRayTracer(camera, spheres)
{
    const aspectRatio = canvas.width / canvas.height;
    
    for(let y = 0; y < canvas.height; y++)
    {
        for(let x = 0; x < canvas.width; x++)
        {
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
}