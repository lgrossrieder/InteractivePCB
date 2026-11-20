"use strict";

var Package    = require("./Package.js").Package;
var globalData = require("../global.js");

class PCB_Part
{
    constructor(iPCB_JSON_Part)
    {
        this.name        = iPCB_JSON_Part.name;
        this.value       = iPCB_JSON_Part.value;
        this.package     = new Package(iPCB_JSON_Part.package);
        this.attributes  = new Map();
        this.location    = iPCB_JSON_Part.location;
        // Not fitted, or not listed in the BOM (fiducials, test points, mounting holes)
        this.dnp         = !!iPCB_JSON_Part.dnp;
        this.inBom       = (iPCB_JSON_Part.in_bom === undefined) ? true : !!iPCB_JSON_Part.in_bom;

        // Iterate over all attributes and add the, to attribute map.
        for(let attribute of iPCB_JSON_Part.attributes)
        {
            this.attributes.set(attribute.name.toLowerCase(),attribute.value);
        }

    }

    IsPlaced()
    {
        return globalData.readStorage("checkbox_placed_" + this.name) == "true";
    }

    Render(guiContext, isViewFront, isSelected)
    {
        let state = {
            selected: isSelected,
            placed:   this.IsPlaced(),
            dnp:      this.dnp || !this.inBom,
        };
        this.package.Render(guiContext, isViewFront, this.location, state);
    }

    /* Outline (and locator ring for small parts) around the selected part. */
    RenderMarker(guiContext, isViewFront, withRing)
    {
        this.package.RenderMarker(guiContext, isViewFront, this.location, this.IsPlaced(), withRing);
    }
}

module.exports = {
    PCB_Part
};
