function getRay(screenX, screenY, aspectRatio){
    const fovRadians = (this.fov * Math.PI) / 180;
    const viewportHeight = 2.0 * Math.tan(fovRadians / 2.0);
    const viewportWidth = viewportHeight * aspectRatio;
    
    // View space conversion
    const u = (screenX - 0.5) * viewportWidth;
    const v = (0.5 - screenY) * viewportHeight;
    
    // Convert to world space
    ray = new Ray;
    const dirX = this.rightX * u + this.upX * v + this.forwardX;
    const dirY = this.rightY * u + this.upY * v + this.forwardY;
    const dirZ = this.rightZ * u + this.upZ * v + this.forwardZ;
    
    return new Ray(this);
}