import { state } from '../core/state.js';
import { Entity } from './base.js';
import { drawTiled } from '../core/sprites.js';

export class DeliveryZone extends Entity {
    constructor(x, y, w, h) { super(x, y, w, h, 'zone'); }
    render(ctx) {
        const pulse = 0.88 + 0.12 * Math.sin(state.currentTick * 0.08);
        if (state.assets.zone) drawTiled(ctx, state.assets.zone, this.x, this.y, this.w, this.h, 40, pulse);
        else super.render(ctx);
        ctx.strokeStyle='#39ff14'; ctx.lineWidth=2; ctx.strokeRect(this.x, this.y, this.w, this.h);
    }
}
