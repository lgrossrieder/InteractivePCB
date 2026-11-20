"use strict";


var Point          = require("./render/point.js").Point
var render_lowlevel = require("./render/render_lowlevel.js");

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
