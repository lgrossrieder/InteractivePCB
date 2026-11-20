/*
    This file contains all of the definitions for working with pcbdata.json.
    This file declares all of the access functions and interfaces for converting
    the json file into an internal data structure.
*/

"use strict";
var Part     = require("./Part.js");
var globalData = require("./global.js");


/***************************************************************************************************
                                         PCB Part Interfaces
**************************************************************************************************/
// One entry per part, and one entry per value (part number) when values are combined.
let BOM = [];

let BOM_Combined = new Map();

/*
    Sort key for designators: letters, then the number, then any suffix (C2 < C10 < C10A < R1).
*/
function DesignatorKey(ref)
{
    let m = String(ref).match(/^([^\d]*)(\d*)(.*)$/);
    return [m[1].toUpperCase(), m[2] === "" ? -1 : parseInt(m[2], 10), m[3]];
}

function CompareDesignators(a, b)
{
    let ka = DesignatorKey(a), kb = DesignatorKey(b);
    if (ka[0] !== kb[0]) { return ka[0] < kb[0] ? -1 : 1; }
    if (ka[1] !== kb[1]) { return ka[1] - kb[1]; }
    return ka[2] < kb[2] ? -1 : (ka[2] > kb[2] ? 1 : 0);
}

function CreateBOM(pcbdataStructure)
{
    let parts = pcbdataStructure.parts.slice().sort((a, b) => CompareDesignators(a.name, b.name));
    for(let part of parts)
    {
        // Parts that are not fitted or not in the BOM are drawn but not listed for assembly.
        if (part.dnp || part.in_bom === 0)
        {
            continue;
        }
        let value     = part.value;
        let footprint = "";
        let reference = part.name;
        let location  = part.location;

        let attributes = new Map(); // Create a empty dictionary
        for(let i of part.attributes)
        {
            attributes.set(i.name.toLowerCase(), String(i.value));
        }

        let checkboxes = new Map();
        // Add the par to the global part array
        BOM.push(new Part.Part(value, footprint, reference, location, attributes, checkboxes));

        if(BOM_Combined.has(value))
        {
            let exisingPart = BOM_Combined.get(value)
            exisingPart.quantity = exisingPart.quantity + 1;
            exisingPart.reference = exisingPart.reference + "," + reference;
            exisingPart.refs.push(reference);
        }
        else
        {
            // Combined rows show the attributes of their first part.
            BOM_Combined.set(value, new Part.Part(value, footprint, reference, location, new Map(attributes), new Map()));
        }
    }
}

function GetBOM()
{
     if(globalData.getCombineValues())
     {
        let result = []

        for(let parts of BOM_Combined.values())
        {
            result.push(parts)
        }
        return result;
     }
     else
     {
        return BOM;
     }
}

function DeleteBOM()
{
    BOM = [];
    BOM_Combined = new Map();
}

function getAttributeValue(part, attributeToLookup)
{
    let attributes = part.attributes;

    if(attributeToLookup == "name")
    {
        return part.reference;
    }
    // Return the attribute value if the part has it, otherwise an empty string.
    return (attributes && attributes.has(attributeToLookup)) ? attributes.get(attributeToLookup) : "";
}

/***************************************************************************************************
                                         PCB Layers Interfaces
***************************************************************************************************/

function GetLayerCanvas(layerName, isFront)
{
    let layerCanvas = globalData.layer_list.get(layerName);

    if(layerCanvas == undefined)
    {
        return undefined;
    }
    else
    {
        return layerCanvas[globalData.render_layers].GetCanvas(isFront);
    }
}

module.exports = {
    CreateBOM, GetBOM, DeleteBOM, getAttributeValue, GetLayerCanvas, CompareDesignators
};
