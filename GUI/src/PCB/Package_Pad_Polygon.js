"use strict";

/*
    Pad given by its outline in board coordinates (Altium / ODB++ import).

    JSON: { type: "polygon", name, pin1, tht, x, y, contours: [[x0, y0, x1, y1, ...], ...], drill? }
    Contours after the first are holes (even-odd fill).
*/

var Package_Pad = require("./Package_Pad.js").Package_Pad;
var colormap    = require("../colormap.js");

class Package_Pad_Polygon extends Package_Pad
{
    constructor(iPCB_JSON_Pad)
    {
        super(iPCB_JSON_Pad);
        this.name     = iPCB_JSON_Pad.name;
        this.x        = iPCB_JSON_Pad.x;
        this.y        = iPCB_JSON_Pad.y;
        this.tht      = !!iPCB_JSON_Pad.tht;
        this.drill    = iPCB_JSON_Pad.drill || 0;
        this.contours = iPCB_JSON_Pad.contours || [];
        this.path     = null;
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

    IsSMD()
    {
        return !this.tht;
    }

    IsTHT()
    {
        return this.tht;
    }

    Render(guiContext, color)
    {
        guiContext.save();
        guiContext.fillStyle = color;
        guiContext.fill(this.GetPath(), "evenodd");
        if (this.drill > 0)
        {
            guiContext.fillStyle = colormap.GetDrillColor();
            guiContext.beginPath();
            guiContext.arc(this.x, this.y, this.drill / 2, 0, 2 * Math.PI);
            guiContext.fill();
        }
        guiContext.restore();
    }
}

module.exports = {
    Package_Pad_Polygon
};
