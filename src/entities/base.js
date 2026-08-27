import { state } from '../core/state.js';
import { drawSprite } from '../core/sprites.js';

export class Entity {
    constructor(x, y, w, h, assetName) { this.x=x; this.y=y; this.w=w; this.h=h; this.assetName=assetName; }
    render(ctx) {
        const img = state.assets[this.assetName];
        if (img && drawSprite(ctx, img, this.x, this.y, this.w, this.h, { valign: 'bottom' })) return;
        ctx.fillStyle = '#ff00ea'; ctx.fillRect(this.x, this.y, this.w, this.h);
    }
}
