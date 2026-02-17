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
        this.pos     =    pos || new Vector(0, 2.5, 10);
        this.lookAt  = lookAt || new Vector(0, 0, 0);
        this.up      =     up || new Vector(0, 1, 0);
        this.fov     =    fov || 90;
        this.worldUp = this.up;

        // Derive orbit parameters (elevation/azimuth/radius) from initial pos
        const offset = Vector.subtract(this.pos, this.lookAt);
        this.orbitRadius = Vector.magnitude(offset) || 1.0;
        // elevation: -90..90 degrees (y axis)
        this.orbitElevation = Math.asin(Math.max(-1, Math.min(1, offset.y / this.orbitRadius))) * 180.0 / Math.PI;
        // azimuth: 0..360 degrees measured from +X toward +Z
        this.orbitAzimuth = Math.atan2(offset.z, offset.x) * 180.0 / Math.PI;

        this.updatePositionFromOrbit();
    }
    
    updateViewMatrix() {
        // Calculate forward vector (from pos to lookAt)
        this.forward = Vector.subtract(this.lookAt, this.pos);
        this.forward = Vector.normalize(this.forward);
        // Calculate right vector using worldUp to avoid roll
        this.right = Vector.cross(this.worldUp, this.forward);
        if (Vector.magnitude(this.right) < 1e-6) {
            // forward is parallel to worldUp; choose arbitrary right
            this.right = new Vector(1, 0, 0);
        } else {
            this.right = Vector.normalize(this.right);
        }

        // Recalculate up to ensure orthogonality
        this.up = Vector.cross(this.forward, this.right);
        this.up = Vector.normalize(this.up);
    }

    // Update this.pos from orbit angles (degrees) and radius
    updatePositionFromOrbit() {
        const e = this.orbitElevation * Math.PI / 180.0; // elevation
        const a = this.orbitAzimuth * Math.PI / 180.0;   // azimuth

        const cosE = Math.cos(e);
        const x = this.orbitRadius * cosE * Math.cos(a);
        const y = this.orbitRadius * Math.sin(e);
        const z = this.orbitRadius * cosE * Math.sin(a);

        this.pos = Vector.add(this.lookAt, new Vector(x, y, z));
        this.updateViewMatrix();
    }

    setOrbit(elevationDeg, azimuthDeg, radius) {
        if (typeof elevationDeg === 'number') this.orbitElevation = elevationDeg;
        if (typeof azimuthDeg === 'number') this.orbitAzimuth = azimuthDeg;
        if (typeof radius === 'number') this.orbitRadius = radius;
        this.updatePositionFromOrbit();
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
// Monte-Carlo-ish multi-bounce tracer (returns color in 0..1 floats)
function rand() { return Math.random(); }

// Sample a cosine-weighted direction over hemisphere aligned with normal
function sampleHemisphereCosine(normal) {
    const r1 = rand();
    const r2 = rand();
    const phi = 2.0 * Math.PI * r1;
    const r = Math.sqrt(r2);
    const x = r * Math.cos(phi);
    const y = r * Math.sin(phi);
    const z = Math.sqrt(Math.max(0, 1 - r2)); // cos theta

    // Build orthonormal basis (n, t, b)
    let tangent;
    if (Math.abs(normal.x) > Math.abs(normal.z)) tangent = new Vector(-normal.y, normal.x, 0);
    else tangent = new Vector(0, -normal.z, normal.y);
    tangent = Vector.normalize(tangent);
    const bitangent = Vector.cross(normal, tangent);

    // Transform sample (x,y,z) where z is along normal
    const dir = Vector.add(
        Vector.add(Vector.scale(tangent, x), Vector.scale(bitangent, y)),
        Vector.scale(normal, z)
    );
    return Vector.normalize(dir);
}

// Trace with simple direct lighting + multi-bounce diffuse accumulation + emissive support
function tracePath(ray, spheres, maxBounces) {
    let throughput = { r: 1.0, g: 1.0, b: 1.0 };
    let radiance = { r: 0.0, g: 0.0, b: 0.0 };

    const lightDir = Vector.normalize(new Vector(1, 0, 2));

    for (let depth = 0; depth < maxBounces; depth++) {
        const hit = traceRay(ray, spheres);
        if (!hit.hit) {
            // environment is black
            break;
        }

        // Get material (clamped to 0-1 for albedo, but keep original for emissives)
        const m = hit.material || RayTracedMaterial;
        const isEmissive = m.emissive === true;
        
        if (isEmissive) {
            // Add emissive contribution (not clamped, can be very bright)
            const emitR = (m.color.r || 1000) / 255.0;
            const emitG = (m.color.g || 1000) / 255.0;
            const emitB = (m.color.b || 1000) / 255.0;
            radiance.r += throughput.r * emitR;
            radiance.g += throughput.g * emitG;
            radiance.b += throughput.b * emitB;
            // Stop bouncing at light source
            break;
        }
        
        const albedo = { r: (m.color.r || 255) / 255.0, g: (m.color.g || 255) / 255.0, b: (m.color.b || 255) / 255.0 };

        // Direct lighting (simple lambertian with fixed directional light)
        const bright = Math.max(0, Vector.dot(hit.normal, lightDir)) * 0.1 + 0.2;
        radiance.r += throughput.r * albedo.r * bright;
        radiance.g += throughput.g * albedo.g * bright;
        radiance.b += throughput.b * albedo.b * bright;

        // Prepare next bounce: sample hemisphere around normal
        const newDir = sampleHemisphereCosine(hit.normal);
        const epsPos = Vector.add(hit.hitPos, Vector.scale(hit.normal, 0.001));
        ray = new Ray(epsPos, newDir);

        // Update throughput by albedo (Lambertian)
        throughput.r *= albedo.r;
        throughput.g *= albedo.g;
        throughput.b *= albedo.b;
    }

    return radiance;
}

export { tracePath };

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