// !!! NO LONGER IN USE, IT STAYS HERE JUST FOR MATH REFERENCE (BECAUSE I DONT REMEMBER ALL FORMULAS FOR VECTOR MATH) !!!

export function Vector(x, y, z) {
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
}

// Static vector operations
Vector.add = function(a, b) {
    return new Vector(a.x + b.x, a.y + b.y, a.z + b.z);
};

Vector.subtract = function(a, b) {
    return new Vector(a.x - b.x, a.y - b.y, a.z - b.z);
};

Vector.scale = function(v, scalar) {
    return new Vector(v.x * scalar, v.y * scalar, v.z * scalar);
};

Vector.dot = function(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
};

Vector.cross = function(a, b) {
    return new Vector(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x
    );
};

Vector.magnitude = function(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
};

Vector.normalize = function(v) {
    const len = Vector.magnitude(v);
    if (len === 0) return new Vector(0, 0, 0);
    return new Vector(v.x / len, v.y / len, v.z / len);
};