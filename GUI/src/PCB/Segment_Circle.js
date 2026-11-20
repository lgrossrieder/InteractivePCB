"use strict";

/*
    Filled disc on a layer (round pads, drill holes).

    JSON: { type: "circle", layer, x, y, radius, positive?: 0|1 }
*/

var Segment  = require("./Segment.js").Segment;
var colorMap = require("../colormap.js");

class Segment_Circle extends Segment
{
    constructor(iPCB_JSON_Segment)
    {
        super(iPCB_JSON_Segment);
        this.layer    = iPCB_JSON_Segment.layer;
        this.x        = iPCB_JSON_Segment.x;
        this.y        = iPCB_JSON_Segment.y;
        this.radius   = iPCB_JSON_Segment.radius;
        this.positive = (iPCB_JSON_Segment.positive === undefined) ? 1 : iPCB_JSON_Segment.positive;
    }

    Render(guiContext, scalefactor)
    {
        guiContext.save();
        guiContext.globalCompositeOperation = this.positive ? "source-over" : "destination-out";
        guiContext.fillStyle = this.positive ? colorMap.GetTraceColor(this.layer) : "#000000";
        guiContext.beginPath();
        guiContext.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
        guiContext.fill();
        guiContext.restore();
    }
}

module.exports = {
    Segment_Circle
};
