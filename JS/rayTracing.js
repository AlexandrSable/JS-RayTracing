import { Vector } from "./mathLib.js";


function packRGBA(r, g, b, a = 255) {
    return (a << 24) | (b << 16) | (g << 8) | r;
}

export { packRGBA };

class Ray
{
    constructor(ox, oy, oz, dx, dy, dz) {
        this.ox = ox; this.oy = oy; this.oz = oz;
        this.dx = dx; this.dy = dy; this.dz = dz;
    }
}

// Factory function to create new HitResults
function createHitResult() {
    return {
        hit: false,
        dst: 0.0,
        hPx: 0,
        hPy: 0,
        hPz: 0,
        nx: 0,
        ny: 0,
        nz: 0
    };
}

const RayTracedMaterial =
{
    color: { r: 255, g: 255, b: 255 },
    roughness: 0.0
};

const Sphere = 
{
    px: 0,
    py: 0,
    pz: 0,
    radius: 1.0,
    material: RayTracedMaterial
}

let lightDirX = 1;
let lightDirY = 0;
let lightDirZ = 2;
const lightLength = Math.sqrt(lightDirX * lightDirX + lightDirY * lightDirY + lightDirZ * lightDirZ);

lightDirX = lightDirX / lightLength;
lightDirY = lightDirY / lightLength;
lightDirZ = lightDirZ / lightLength;

class Camera
{
    constructor(posX, posY, posZ, lookAtX, lookAtY, lookAtZ, upX, upY, upZ, fov) {
        this.posX = posX || 0.0;
        this.posY = posY || 2.5;
        this.posZ = posZ || 10;

        this.lookAtX = lookAtX || 0.0;
        this.lookAtY = lookAtY || 0.0;
        this.lookAtZ = lookAtZ || 0.0;

        this.upX = upX || 0.0;
        this.upY = upY || 1.0;
        this.upZ = upZ || 0.0;

        this.fov = fov || 90;
        this.worldUpX = this.upX;
        this.worldUpY = this.upY;
        this.worldUpZ = this.upZ;

        // Derive orbit parameters (elevation/azimuth/radius) from initial pos
        const offsetX = this.posX - this.lookAtX;
        const offsetY = this.posY - this.lookAtY;
        const offsetZ = this.posZ - this.lookAtZ;

        this.orbitRadius = Math.sqrt(offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ) || 1.0;

        this.orbitElevation = Math.asin(Math.max(-1, Math.min(1, offsetY / this.orbitRadius))) * 180.0 / Math.PI;
        this.orbitAzimuth = Math.atan2(offsetZ, offsetX) * 180.0 / Math.PI;

        this.updatePositionFromOrbit();
    }
    
    updateViewMatrix() {
        // Calculate forward vector (from pos to lookAt)
        this.forwardX = this.lookAtX - this.posX;
        this.forwardY = this.lookAtY - this.posY;
        this.forwardZ = this.lookAtZ - this.posZ;
        const forwardLength = Math.sqrt(this.forwardX * this.forwardX + this.forwardY * this.forwardY + this.forwardZ * this.forwardZ);
        if (forwardLength > 1e-6) {
            this.forwardX /= forwardLength;
            this.forwardY /= forwardLength;
            this.forwardZ /= forwardLength;
        } else {
            // If lookAt is at the same position, default to a forward vector
            this.forwardX = 0; this.forwardY = 0; this.forwardZ = -1;
        }
        // Calculate right vector using worldUp to avoid roll
        this.rightX = this.worldUpY * this.forwardZ - this.worldUpZ * this.forwardY;
        this.rightY = this.worldUpZ * this.forwardX - this.worldUpX * this.forwardZ;
        this.rightZ = this.worldUpX * this.forwardY - this.worldUpY * this.forwardX;
        const rightLength = Math.sqrt(this.rightX * this.rightX + this.rightY * this.rightY + this.rightZ * this.rightZ);
        if (rightLength < 1e-6) {
            // forward is parallel to worldUp; choose arbitrary right
            this.rightX = 1; this.rightY = 0; this.rightZ = 0;
        } else {
            this.rightX /= rightLength;
            this.rightY /= rightLength;
            this.rightZ /= rightLength;
        }

        // Recalculate up to ensure orthogonality
        this.upX = this.forwardY * this.rightZ - this.forwardZ * this.rightY;
        this.upY = this.forwardZ * this.rightX - this.forwardX * this.rightZ;
        this.upZ = this.forwardX * this.rightY - this.forwardY * this.rightX;
        const upLength = Math.sqrt(this.upX * this.upX + this.upY * this.upY + this.upZ * this.upZ);
        if (upLength < 1e-6) {
            // If forward and right are parallel, default to a reasonable up vector
            this.upX = 0; this.upY = 1; this.upZ = 0;
        } else {
            this.upX /= upLength;
            this.upY /= upLength;
            this.upZ /= upLength;
        }
    }

    // Update this.pos from orbit angles (degrees) and radius
    updatePositionFromOrbit() {
        const e = this.orbitElevation * Math.PI / 180.0; // elevation
        const a = this.orbitAzimuth * Math.PI / 180.0;   // azimuth

        const cosE = Math.cos(e);
        const x = this.orbitRadius * cosE * Math.cos(a);
        const y = this.orbitRadius * Math.sin(e);
        const z = this.orbitRadius * cosE * Math.sin(a);

        this.posX = this.lookAtX + x;
        this.posY = this.lookAtY + y;
        this.posZ = this.lookAtZ + z;
        this.updateViewMatrix();
    }

    setOrbit(elevationDeg, azimuthDeg, radius) {
        if (typeof elevationDeg === 'number') this.orbitElevation = elevationDeg;
        if (typeof azimuthDeg === 'number') this.orbitAzimuth = azimuthDeg;
        if (typeof radius === 'number') this.orbitRadius = radius;
        this.updatePositionFromOrbit();
    }
    
    getRay(screenX, screenY, aspectRatio) {
        const fovRadians = (this.fov * Math.PI) / 180;
        const viewportHeight = 2.0 * Math.tan(fovRadians / 2.0);
        const viewportWidth = viewportHeight * aspectRatio;
        
        // View space conversion
        const u = (screenX - 0.5) * viewportWidth;
        const v = (0.5 - screenY) * viewportHeight;
        
        // Convert to world space
        const dirX = this.rightX * u + this.upX * v + this.forwardX;
        const dirY = this.rightY * u + this.upY * v + this.forwardY;
        const dirZ = this.rightZ * u + this.upZ * v + this.forwardZ;
        
        return new Ray(this.posX, this.posY, this.posZ, dirX, dirY, dirZ);
    }
}

export { Camera };




// Ray-sphere intersection
function raySphereIntersect(ray, sphere) {
    const result = createHitResult();
    
    const ocX = ray.ox - sphere.px;
    const ocY = ray.oy - sphere.py;
    const ocZ = ray.oz - sphere.pz;

    const a = ray.dx * ray.dx + ray.dy * ray.dy + ray.dz * ray.dz;
    const b = 2.0 * (ocX * ray.dx + ocY * ray.dy + ocZ * ray.dz);
    const c = ocX * ocX + ocY * ocY + ocZ * ocZ - sphere.radius * sphere.radius;
    
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
    result.hPx = ray.ox + t * ray.dx;
    result.hPy = ray.oy + t * ray.dy;
    result.hPz = ray.oz + t * ray.dz;
    result.nx = (result.hPx - sphere.px) / sphere.radius;
    result.ny = (result.hPy - sphere.py) / sphere.radius;
    result.nz = (result.hPz - sphere.pz) / sphere.radius;
    
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
function sampleHemisphereCosine(normalX, normalY, normalZ) {
    const r1 = rand();
    const r2 = rand();
    const phi = 2.0 * Math.PI * r1;
    const r = Math.sqrt(r2);
    const x = r * Math.cos(phi);
    const y = r * Math.sin(phi);
    const z = Math.sqrt(Math.max(0, 1 - r2)); // cos theta

    // Build orthonormal basis (n, t, b)
    let tangentX;
    let tangentY;
    let tangentZ;

    if (Math.abs(normalX) > Math.abs(normalZ)) 
    {
        tangentX = -normalY;
        tangentY = normalX;
        tangentZ = 0;
    }
    else
    { 
        tangentX = 0;
        tangentY = -normalZ;
        tangentZ = normalY;
    }
    const tangent = Vector.normalize(new Vector(tangentX, tangentY, tangentZ));
    const bitangent = Vector.cross(new Vector(normalX, normalY, normalZ), tangent);

    // Transform sample (x,y,z) where z is along normal
    const dir = {x: (tangent.x * x) + (bitangent.x * y) + (normalX * z), 
                 y: (tangent.y * x) + (bitangent.y * y) + (normalY * z), 
                 z: (tangent.z * x) + (bitangent.z * y) + (normalZ * z)};

    const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
    if (len > 0) {
        dir.x /= len;
        dir.y /= len;
        dir.z /= len;
    }
    return dir;
}

// Trace with simple direct lighting + multi-bounce diffuse accumulation + emissive support
function tracePath(ray, spheres, maxBounces) {
    let throughput = { r: 1.0, g: 1.0, b: 1.0 };
    let radiance = { r: 0.0, g: 0.0, b: 0.0 };

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
        const bright = Math.max(0, hit.nx * lightDirX + hit.ny * lightDirY + hit.nz * lightDirZ) * 0.1 + 0.2;
        radiance.r += throughput.r * albedo.r * bright;
        radiance.g += throughput.g * albedo.g * bright;
        radiance.b += throughput.b * albedo.b * bright;

        // Prepare next bounce: sample hemisphere around normal
        const newDir = sampleHemisphereCosine(hit.nx, hit.ny, hit.nz);
        const epsPosX = hit.hPx + hit.nx * 0.001;
        const epsPosY = hit.hPy + hit.ny * 0.001;
        const epsPosZ = hit.hPz + hit.nz * 0.001;

        ray = new Ray(epsPosX, epsPosY, epsPosZ, newDir.x, newDir.y, newDir.z);

        // Update throughput by albedo (Lambertian)
        throughput.r *= albedo.r;
        throughput.g *= albedo.g;
        throughput.b *= albedo.b;
    }

    return radiance;
}

export { tracePath };
