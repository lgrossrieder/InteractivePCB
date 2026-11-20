"use strict";


var Point          = require("./render/point.js").Point
var render_lowlevel = require("./render/render_lowlevel.js");

// Selection outline width and the halo on each side of it, in board units (mm)
const OUTLINE_WIDTH = 0.2;
const HALO_WIDTH    = 0.05;

class BoundingBox
{
    constructor(x0, y0, x1, y1, angle)
    {
        this.centerPoint = new Point((x0+x1)/2,((y0+y1)/2))

        // Translating coordinate to reference center point.
        // This will be needed to properly rotate bounding box around object.
        // Top left point
        this.point0 = new Point(x0-this.centerPoint.x,y0-this.centerPoint.y);
        // Top right point
        this.point1 = new Point(x1-this.centerPoint.x,y0-this.centerPoint.y);
        // Bottom right point
        this.point2 = new Point(x1-this.centerPoint.x,y1-this.centerPoint.y);
        // Bottom left point
        this.point3 = new Point(x0-this.centerPoint.x,y1-this.centerPoint.y);

        this.angle = angle;

    }

    /* True when board point (x, y) lies inside the box (rotated by angle degrees about its centre). */
    Contains(x, y)
    {
        let a  = -(this.angle || 0) * Math.PI / 180;
        let dx = x - this.centerPoint.x;
        let dy = y - this.centerPoint.y;
        let lx = dx * Math.cos(a) - dy * Math.sin(a);
        let ly = dx * Math.sin(a) + dy * Math.cos(a);
        return    (lx >= Math.min(this.point0.x, this.point2.x)) && (lx <= Math.max(this.point0.x, this.point2.x))
               && (ly >= Math.min(this.point0.y, this.point2.y)) && (ly <= Math.max(this.point0.y, this.point2.y));
    }

    /*
        Selection marker: an outline of OUTLINE_WIDTH board units (mm) just outside the
        part, with a thin contrasting halo; it scales with the zoom like the board.
        Optionally a locator ring with four ticks, sized in screen pixels, around parts
        that are small on screen.
        colors: { marker, halo }
    */
    RenderMarker(guiContext, colors, withRing)
    {
        let m     = guiContext.getTransform();
        let scale = Math.hypot(m.a, m.b);   // canvas pixels per board unit
        if (!(scale > 0))
        {
            return;
        }
        // The canvases are drawn at twice their CSS size.
        let px = 2 / scale;                 // board units per CSS pixel
        let w  = Math.abs(this.point2.x - this.point0.x);
        let h  = Math.abs(this.point2.y - this.point0.y);
        // Outline centred half its width outside the box: the inner edge touches the part.
        let gap = OUTLINE_WIDTH / 2;

        guiContext.save();
        guiContext.translate(this.centerPoint.x, this.centerPoint.y);
        guiContext.rotate((this.angle || 0) * Math.PI / 180);
        guiContext.lineJoin = "round";

        guiContext.beginPath();
        guiContext.rect(-w / 2 - gap, -h / 2 - gap, w + 2 * gap, h + 2 * gap);
        guiContext.globalAlpha = 0.18;
        guiContext.fillStyle   = colors.marker;
        guiContext.fill();
        guiContext.globalAlpha = 1;
        guiContext.strokeStyle = colors.halo;
        guiContext.lineWidth   = OUTLINE_WIDTH + 2 * HALO_WIDTH;
        guiContext.stroke();
        guiContext.strokeStyle = colors.marker;
        guiContext.lineWidth   = OUTLINE_WIDTH;
        guiContext.stroke();

        // Locator ring for parts smaller than about 30 px on screen
        if (withRing && (Math.max(w, h) < 30 * px))
        {
            let r    = Math.max(16 * px, Math.hypot(w, h) / 2 + 8 * px);
            let tick = 9 * px;
            guiContext.beginPath();
            guiContext.arc(0, 0, r, 0, 2 * Math.PI);
            for (let k = 0; k < 4; k++)
            {
                let a = k * Math.PI / 2;
                guiContext.moveTo(Math.cos(a) * r,          Math.sin(a) * r);
                guiContext.lineTo(Math.cos(a) * (r + tick), Math.sin(a) * (r + tick));
            }
            guiContext.strokeStyle = colors.halo;
            guiContext.lineWidth   = 5 * px;
            guiContext.stroke();
            guiContext.strokeStyle = colors.marker;
            guiContext.lineWidth   = 2.5 * px;
            guiContext.stroke();
        }
        guiContext.restore();
    }

    Render(guiContext, color)
    {
        // First fill the box.
        let renderOptions = {
            color: color,
            fill: true,
            globalAlpha: 0.2
        };

        render_lowlevel.RegularPolygon(
            guiContext,
            this.centerPoint,
            [this.point0, this.point1, this.point2, this.point3],
            this.angle,
            renderOptions
        );

        // Now stoke the box
        renderOptions = {
            color: color,
            fill: false,
            globalAlpha: 1,
            lineWidth: 0.33
        };

        render_lowlevel.RegularPolygon(
            guiContext,
            this.centerPoint,
            [this.point0, this.point1, this.point2, this.point3],
            this.angle,
            renderOptions
        );
    }

}

module.exports = {
    BoundingBox
};
