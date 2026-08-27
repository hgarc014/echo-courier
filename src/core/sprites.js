const tintScratch = document.createElement('canvas');
const tintCtx = tintScratch.getContext('2d');

function spriteSize(img) {
    return {
        w: img.naturalWidth || img.width || 0,
        h: img.naturalHeight || img.height || 0
    };
}

export function prepareLoadedAsset(img, { crop = false, keyBlack = true } = {}) {
    const { w: iw, h: ih } = spriteSize(img);
    if (!iw || !ih) return img;

    const src = document.createElement('canvas');
    src.width = iw;
    src.height = ih;
    const sctx = src.getContext('2d');
    sctx.drawImage(img, 0, 0);
    if (!keyBlack) return src;

    const imageData = sctx.getImageData(0, 0, iw, ih);
    const d = imageData.data;
    let minX = iw, minY = ih, maxX = 0, maxY = 0;

    for (let y = 0; y < ih; y++) {
        for (let x = 0; x < iw; x++) {
            const i = (y * iw + x) * 4;
            const r = d[i], g = d[i + 1], b = d[i + 2];
            const maxc = r > g ? (r > b ? r : b) : (g > b ? g : b);
            if (maxc < 20) {
                d[i + 3] = 0;
            } else {
                if (maxc < 36) d[i + 3] = Math.min(d[i + 3], Math.round(255 * (maxc - 20) / 16));
                if (d[i + 3] > 16) {
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                }
            }
        }
    }
    sctx.putImageData(imageData, 0, 0);
    if (!crop || maxX < minX) return src;

    const pad = 6;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(iw - 1, maxX + pad);
    maxY = Math.min(ih - 1, maxY + pad);
    const out = document.createElement('canvas');
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    out.getContext('2d').drawImage(src, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out;
}

function blitPrepared(ctx, img, dw, dh, { tint, tintAlpha, scanlines }) {
    const tw = Math.max(1, Math.ceil(Math.abs(dw)));
    const th = Math.max(1, Math.ceil(Math.abs(dh)));
    if (tintScratch.width !== tw || tintScratch.height !== th) {
        tintScratch.width = tw;
        tintScratch.height = th;
    }
    tintCtx.setTransform(1, 0, 0, 1, 0, 0);
    tintCtx.globalCompositeOperation = 'source-over';
    tintCtx.globalAlpha = 1;
    tintCtx.clearRect(0, 0, tw, th);
    tintCtx.drawImage(img, 0, 0, tw, th);
    if (tint && tintAlpha > 0) {
        tintCtx.globalCompositeOperation = 'source-atop';
        tintCtx.globalAlpha = tintAlpha;
        tintCtx.fillStyle = tint;
        tintCtx.fillRect(0, 0, tw, th);
        tintCtx.globalAlpha = 1;
        tintCtx.globalCompositeOperation = 'source-over';
    }
    if (scanlines) {
        tintCtx.globalCompositeOperation = 'destination-in';
        tintCtx.fillStyle = '#fff';
        for (let i = 0; i < th; i += 4) tintCtx.fillRect(0, i, tw, 2);
        tintCtx.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(tintScratch, -dw / 2, -dh / 2, dw, dh);
}

export function drawTiled(ctx, img, x, y, w, h, tileSize = 40, alpha = 1) {
    if (!img) return false;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.globalAlpha = alpha;
    const { w: iw, h: ih } = spriteSize(img);
    const size = tileSize;
    const dw = size;
    const dh = iw && ih ? size * (ih / iw) : size;
    for (let i = 0; i < w; i += dw) {
        for (let j = 0; j < h; j += dh) {
            ctx.drawImage(img, x + i, y + j, dw, dh);
        }
    }
    ctx.restore();
    return true;
}

export function drawSprite(ctx, img, x, y, w, h, opts = {}) {
    if (!img) return false;
    const {
        fit = 'contain',
        align = 'center',
        valign = 'bottom',
        flipX = false,
        bob = 0,
        scaleX = 1,
        scaleY = 1,
        alpha = 1,
        tint = null,
        tintAlpha = 0.18,
        rotation = 0,
        scanlines = false
    } = opts;

    const { w: iw, h: ih } = spriteSize(img);
    if (!iw || !ih) return false;

    let dw, dh, dx, dy;
    if (fit === 'contain') {
        const scale = Math.min(w / iw, h / ih);
        dw = iw * scale;
        dh = ih * scale;
        dx = align === 'left' ? x : align === 'right' ? x + w - dw : x + (w - dw) / 2;
        dy = valign === 'top' ? y : valign === 'bottom' ? y + h - dh : y + (h - dh) / 2;
    } else {
        dw = w;
        dh = h;
        dx = x;
        dy = y;
    }

    ctx.save();
    ctx.translate(dx + dw / 2, dy + dh / 2 - bob);
    if (rotation) ctx.rotate(rotation);
    ctx.scale((flipX ? -1 : 1) * scaleX, scaleY);
    ctx.globalAlpha = alpha;
    blitPrepared(ctx, img, dw, dh, { tint, tintAlpha, scanlines });
    ctx.restore();
    return true;
}
