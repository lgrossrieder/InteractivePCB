"use strict";

var globalData        = require("./global.js");

var ColorMap = new Map(
    [
        // Light Mode, Dark Mode
        // Dark mode follows Altium's dark view: silver pads, white selection.
        ["Drill"                  ,["#CCCCCC"   , "#101010"]],
        ["BboundingBox_Default"   ,["#878787"   , "#878787"]],
        ["BboundingBox_Placed"    ,["#40D040"   , "#40D040"]],
        ["BboundingBox_Highlited" ,["#D04040"   , "#FFFFFF"]],
        ["BboundingBox_Debug"     ,["#2977ff"   , "#2977ff"]],
        ["Pad_Default"            ,["#B0B0B0"   , "#C0C0C0"]],
        ["Pad_DNP"                ,["#505050"   , "#4A4A4A"]],
        ["Pad_Pin1"               ,["#ffb629"   , "#FF8C00"]],
        ["Pad_IsHighlited"        ,["#D04040"   , "#FFFFFF"]],
        ["Pad_IsPlaced"           ,["#40D040"   , "#33D17A"]],
        ["Default"                ,["#878787"   , "#878787"]]
    ]);



/* colorCodeDark: colour in dark mode (default: the same as in light mode) */
function SetColor(colorName, colorCode, colorCodeDark)
{
    ColorMap.set(colorName, [colorCode, colorCodeDark || colorCode]);
}

/* Changes a colour for the palette in use only (layer table colour picker). */
function SetColorCurrentPalette(colorName, colorCode)
{
    let entry = ColorMap.get(colorName) || [colorCode, colorCode];
    entry = entry.slice();
    entry[GetColorPalette()] = colorCode;
    ColorMap.set(colorName, entry);
}

/*
    Currently 2 supported color palette. 
    Palette 0 is for light mode, and palette 1 
    id for dark mode.
*/
function GetColorPalette()
{
    return (globalData.readStorage("darkmode") === "true") ? 1 : 0;
}

function GetTraceColor(traceLayer)
{
    let traceColorMap = ColorMap.get(traceLayer);
    if (traceColorMap == undefined)
    {
        //console.log("WARNING: Invalid trace layer number, using default.");
        return ColorMap.get("Default")[GetColorPalette()];
    }
    else
    {
        return traceColorMap[GetColorPalette()];
    }
}


function GetBoundingBoxColor(isHighlited, isPlaced)
{
    // Order of color selection.
    if (isPlaced) 
    {
        let traceColorMap = ColorMap.get("BboundingBox_Placed");
        return traceColorMap[GetColorPalette()];
    }
    // Highlighted and not placed
    else if(isHighlited)
    {
        let traceColorMap = ColorMap.get("BboundingBox_Highlited");
        return traceColorMap[GetColorPalette()];
    }
    /*
        If debug mode is enabled then force drawing a bounding box
      not highlighted,  not placed, and debug mode active
    */
    else if(globalData.getDebugMode())
    {
        let traceColorMap = ColorMap.get("BboundingBox_Debug");
        return traceColorMap[GetColorPalette()];
    }
    else
    {
        let traceColorMap = ColorMap.get("BboundingBox_Default");
        return traceColorMap[GetColorPalette()];
    }
}


function GetPadColor(isPin1, isHighlited, isPlaced, isDnp)
{
    if(isDnp && !isHighlited)
    {
        let traceColorMap = ColorMap.get("Pad_DNP");
        return traceColorMap[GetColorPalette()];
    }
    else if(isPin1)
    {
        let traceColorMap = ColorMap.get("Pad_Pin1");
        return traceColorMap[GetColorPalette()];
    }
    else if(isPlaced && isHighlited)
    {
        let traceColorMap = ColorMap.get("Pad_IsPlaced");
        return traceColorMap[GetColorPalette()];
    }
    else if(isHighlited)
    {
        let traceColorMap = ColorMap.get("Pad_IsHighlited");
        return traceColorMap[GetColorPalette()];
    }
    else if(isPlaced)
    {
        let traceColorMap = ColorMap.get("Pad_IsPlaced");
        return traceColorMap[GetColorPalette()];
    }
    else
    {
        let traceColorMap = ColorMap.get("Pad_Default");
        return traceColorMap[GetColorPalette()];
    }
}

function GetViaColor()
{
    let traceColorMap = ColorMap.get("Vias");
    if (traceColorMap == undefined)
    {
        //console.log("WARNING: Invalid trace layer number, using default.");
        return ColorMap.get("Default")[GetColorPalette()];
    }
    else
    {
        return traceColorMap[GetColorPalette()];
    }
}

function GetDrillColor()
{
    let traceColorMap = ColorMap.get("Drill");
    if (traceColorMap == undefined)
    {
        //console.log("WARNING: Invalid trace layer number, using default.");
        return ColorMap.get("Default")[GetColorPalette()];
    }
    else
    {
        return traceColorMap[GetColorPalette()];
    }
}

module.exports = {
    GetTraceColor, GetBoundingBoxColor, GetPadColor,
    GetViaColor, GetDrillColor, SetColor, SetColorCurrentPalette
};
