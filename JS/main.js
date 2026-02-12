const canvas = document.getElementById("Viewport");
const ctx = canvas.getContext("2d", { alpha: false });

const img = ctx.createImageData(canvas.width, canvas.height);
const ViewportBuffer32 = new Uint32Array(img.data.buffer);

function clearViewportBuffer()
{
    ViewportBuffer32.fill(0);    
}

function packRGBA(r, g, b, a = 255) {
    return (a << 24) | (b << 16) | (g << 8) | r;
}

function drawUVs()
{
    for(let y = 0; y < canvas.height; y++)
    {
        for(let x = 0; x < canvas.width; x++)
        {
            ViewportBuffer32[y * canvas.width + x] = packRGBA(Math.floor((x / canvas.width) * 255), Math.floor((y / canvas.height) * 255), 0, 255);
        }
    }
}

function renderFrame()
{
    let selectedResolution = document.getElementById("resolution-select").value;
    const messageElement = document.getElementById("resolution-display");
    messageElement.textContent = `Current Resolution: ${selectedResolution}`;

    clearViewportBuffer();

    drawUVs();

    ctx.putImageData(img, 0, 0);
    requestAnimationFrame(renderFrame);
}

requestAnimationFrame(renderFrame);