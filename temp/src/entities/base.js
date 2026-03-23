import { state } from '../core/state.js';

export class Entity {
    constructor(x, y, w, h, assetName) { this.x=x; this.y=y; this.w=w; this.h=h; this.assetName=assetName; }
    render(ctx) {
        if (state.assets[this.assetName]) ctx.drawImage(state.assets[this.assetName], this.x, this.y, this.w, this.h);
        else { ctx.fillStyle = '#ff00ea'; ctx.fillRect(this.x, this.y, this.w, this.h); }
    }
}
