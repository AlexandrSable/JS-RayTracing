const canvas = document.getElementById("FinalRender");
const ctx = canvas.getContext("2d", { alpha: false });

export const canvasWidth = canvas.width
export const canvasHeight = canvas.height;

const img = ctx.createImageData(canvasWidth, canvasHeight);

export const RBuffer32 = new Uint32Array(img.data.buffer);

function packRGBA(r, g, b, a = 255) {
    return (a << 24) | (b << 16) | (g << 8) | r;
}
function clearBuffer(){
    RBuffer32.fill(0);
}

function drawUVcoords(){
    for(let y = 0; y < canvasHeight; y++)
    {
        for(let x = 0; x < canvasWidth; x++)
        {
            const color = packRGBA((x/canvasWidth)*255, (y/canvasHeight)*255, 0);
            RBuffer32[y * canvasWidth + x] = color;
        }
    }
}

function renderFrame()
{
    clearBuffer();
    drawUVcoords();

    ctx.putImageData(img, 0, 0);
    requestAnimationFrame(renderFrame);
}

requestAnimationFrame(renderFrame);