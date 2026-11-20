"use strict";

var BoundingBox  = require("../BoundingBox.js").BoundingBox;

var Package_Pad_Rectangle  = require("./Package_Pad_Rectangle.js").Package_Pad_Rectangle;
var Package_Pad_Oblong     = require("./Package_Pad_Oblong.js").Package_Pad_Oblong;
var Package_Pad_Round      = require("./Package_Pad_Round.js").Package_Pad_Round;
var Package_Pad_Octagon    = require("./Package_Pad_Octagon.js").Package_Pad_Octagon;
var Package_Pad_SMD        = require("./Package_Pad_SMD.js").Package_Pad_SMD;
var Package_Pad_Polygon    = require("./Package_Pad_Polygon.js").Package_Pad_Polygon;

var colormap           = require("../colormap.js");
var globalData         = require("../global.js");

class Package
{
    constructor(iPCB_JSON_Package)
    {
        let bb = iPCB_JSON_Package.bounding_box;
        this.boundingBox = new BoundingBox(bb.x0, bb.y0, bb.x1, bb.y1, bb.angle || 0);

        this.pads = [];

        for(let pad of iPCB_JSON_Package.pads)
        {
            if (pad.type == "rect")
            {
                this.pads.push(new Package_Pad_Rectangle(pad));
            }
            else if (pad.type == "oblong")
            {
                this.pads.push(new Package_Pad_Oblong(pad));
            }
            else if (pad.type == "round")
            {
                this.pads.push(new Package_Pad_Round(pad));
            }
            else if (pad.type == "octagon")
            {
                this.pads.push(new Package_Pad_Octagon(pad));
            }
            else if (pad.type == "smd")
            {
                this.pads.push(new Package_Pad_SMD(pad));
            }
            else if (pad.type == "polygon")
            {
                this.pads.push(new Package_Pad_Polygon(pad));
            }
            else
            {
                console.log("ERROR: Unsupported pad type ", pad.type);
            }
        }
    }

    /*
        state: { selected, placed, dnp }
          selected  part is highlighted from the BOM, a click or the test point table
          placed    every "Placed" checkbox of the part is ticked
          dnp       part is not fitted / not in the BOM
    */
    Render(guiContext, isViewFront, location, state)
    {
        if (typeof state !== "object")
        {
            state = { selected: !!state, placed: false, dnp: false };
        }
        let onThisSide = ((location == "F") && isViewFront) || ((location == "B") && !isViewFront);

        for (let pad of this.pads)
        {
            if ((pad.IsSMD() && onThisSide) || pad.IsTHT())
            {
                let isPin1 = pad.IsPin1() && (state.selected || globalData.getHighlightPin1());
                let color = colormap.GetPadColor(isPin1, state.selected, state.placed, state.dnp);
                pad.Render(guiContext, color);
            }
        }

        // Selected parts get the marker from RenderMarker instead.
        if (onThisSide && !state.selected && globalData.getDebugMode())
        {
            let color = colormap.GetBoundingBoxColor(false, false);
            this.boundingBox.Render(guiContext, color);
        }
    }

    RenderMarker(guiContext, isViewFront, location, isPlaced, withRing)
    {
        let onThisSide = ((location == "F") && isViewFront) || ((location == "B") && !isViewFront);
        if (onThisSide)
        {
            this.boundingBox.RenderMarker(guiContext, colormap.GetHighlightColors(isPlaced), withRing);
        }
    }

    /* True when the board point (x, y) is inside the (rotated) bounding box. */
    Contains(x, y)
    {
        return this.boundingBox.Contains(x, y);
    }
}

module.exports = {
    Package
};
