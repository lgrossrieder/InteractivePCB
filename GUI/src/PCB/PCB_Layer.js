"use strict";

var Segment_Arc     = require("./Segment_Arc.js").Segment_Arc;
var Segment_Line    = require("./Segment_Line.js").Segment_Line;
var Segment_Polygon = require("./Segment_Polygon.js").Segment_Polygon;
var Segment_Circle  = require("./Segment_Circle.js").Segment_Circle;

var pcb        = require("../pcb.js");
var globalData = require("../global.js");

class PCB_Layer
{
    constructor(iPCB_JSON_Layer)
    {
        this.name  = iPCB_JSON_Layer.name;
        this.paths = [];
        // Default visibility per view, used until the user changes it in the layer table.
        this.visible_front = (iPCB_JSON_Layer.visible_front === undefined) ? true : !!iPCB_JSON_Layer.visible_front;
        this.visible_back  = (iPCB_JSON_Layer.visible_back  === undefined) ? true : !!iPCB_JSON_Layer.visible_back;

        for(let segment of iPCB_JSON_Layer.paths)
        {
            if(segment.type == "arc")
            {
                this.paths.push(new Segment_Arc(segment));
            }
            else if(segment.type == "line")
            {
                this.paths.push(new Segment_Line(segment));
            }
            else if(segment.type == "polygon")
            {
                this.paths.push(new Segment_Polygon(segment));
            }
            else if(segment.type == "circle")
            {
                this.paths.push(new Segment_Circle(segment));
            }
            else
            {
                console.log("ERROR: Unsupported segment type, ", segment.type);
            }
        }
    }

    Render(isViewFront, scalefactor)
    {
        // Hidden layers are not drawn; toggling a layer redraws the view.
        let renderLayer = globalData.layer_list.get(this.name);
        if (renderLayer && !renderLayer[globalData.render_layers].IsVisible(isViewFront))
        {
            return;
        }
        let contexts = new Map();
        for(let path of this.paths)
        {
            let layerName = path.layer || this.name;
            let ctx = contexts.get(layerName);
            if (ctx === undefined)
            {
                let canvas = pcb.GetLayerCanvas(layerName, isViewFront) || pcb.GetLayerCanvas(this.name, isViewFront);
                ctx = canvas ? canvas.getContext("2d") : null;
                contexts.set(layerName, ctx);
            }
            if (ctx)
            {
                path.Render(ctx, scalefactor);
            }
        }
    }
}

module.exports = {
    PCB_Layer
};
