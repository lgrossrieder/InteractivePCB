"use strict";

/*
    Filled polygon on a layer.

    JSON (Altium / ODB++ import):
        { type: "polygon", layer, contours: [[x0, y0, x1, y1, ...], ...], positive?: 0|1 }
    Contours after the first may be holes; they are filled with the even-odd rule.
    positive: 0 erases what was drawn before on the same layer (negative feature).

    The older form with a "segments" list of lines is still accepted.
*/

var Segment  = require("./Segment.js").Segment;
var colorMap = require("../colormap.js");

class Segment_Polygon extends Segment
{
    constructor(iPCB_JSON_Polygon)
    {
        super(iPCB_JSON_Polygon);
        this.layer    = iPCB_JSON_Polygon.layer;
        this.positive = (iPCB_JSON_Polygon.positive === undefined) ? 1 : iPCB_JSON_Polygon.positive;
        this.contours = [];
        this.path     = null;

        if (iPCB_JSON_Polygon.contours)
        {
            this.contours = iPCB_JSON_Polygon.contours;
        }
        else if (iPCB_JSON_Polygon.segments)
        {
            let c = [];
            for (let segment of iPCB_JSON_Polygon.segments)
            {
                if (segment.type == "line")
                {
                    c.push(segment.x0, segment.y0);
                }
            }
            this.contours = [c];
        }
    }

    GetPath()
    {
        if (this.path === null)
        {
            let path = new Path2D();
            for (let c of this.contours)
            {
                if (c.length < 6) { continue; }
                path.moveTo(c[0], c[1]);
                for (let i = 2; i < c.length; i += 2)
                {
                    path.lineTo(c[i], c[i + 1]);
                }
                path.closePath();
            }
            this.path = path;
        }
        return this.path;
    }

    Render(guiContext, scalefactor)
    {
        guiContext.save();
        guiContext.globalCompositeOperation = this.positive ? "source-over" : "destination-out";
        guiContext.fillStyle = this.positive ? colorMap.GetTraceColor(this.layer) : "#000000";
        guiContext.fill(this.GetPath(), "evenodd");
        guiContext.restore();
    }
}

module.exports = {
    Segment_Polygon
};
