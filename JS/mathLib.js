export class Vec3
{
    constructor (x, y, z)
    {
        this.x = x
        this.y = y
        this.z = z
    }
    add(other){
        return new Vec3(this.x + other.x, this.y + other.y, this.z + other.z);
    }
    minus(other){
        return new Vec3(this.x - other.x, this.y - other.y, this.z - other.z);
    }
    // Multiply other vector by this one and return the result
    multiply(other){
        return new Vec3(this.x * other.x, this.y * other.y, this.z * other.z)
    }
    // Scale this vector by the number scalar and return the result
    scale(scalar){
        return new Vec3(this.x + scalar, this.y + scalar, this.z + scalar)
    }
    // Calculate the dot product of this vector with the other and return the result
    dot(other) {}
    // Calculate and return the magnitude of this vector
    length() {}
    // Return a normalised version of this vector
    normalised() {}
}

export class Ray
{
    constructor (origin, direction)
    {
        this.origin = rayOrigin;
        this.direction = rayDirection;
    }
}

export function createHitResult()
{
    return{
        hit: false,
        distance: 0.0,
        hitLocation: new Vec3(0, 0, 0),
        hitNormal: new Vec3(0, 0, 0)
    };
}