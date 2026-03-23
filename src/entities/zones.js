import { Entity } from './base.js';

export class DeliveryZone extends Entity {
    constructor(x, y, w, h) { super(x, y, w, h, 'zone'); }
    render(ctx) { super.render(ctx); ctx.strokeStyle='#39ff14'; ctx.lineWidth=2; ctx.strokeRect(this.x, this.y, this.w, this.h); }
}
