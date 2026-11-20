/* DOM manipulation and misc code */

"use strict";


var Split             = require("split.js");
var globalData        = require("./global.js");
var render            = require("./render.js");
var renderCanvas      = require("./render/render_Canvas.js");
var pcb               = require("./pcb.js");
var handlers_mouse    = require("./handlers_mouse.js");
var layerTable        = require("./layer_table.js");
var bomTable          = require("./bom_table.js");
var Metadata          = require("./Metadata.js").Metadata;

var PCB_Trace = require("./PCB/PCB_Trace.js").PCB_Trace;
var PCB_TestPoint  = require("./PCB/PCB_TestPoint.js").PCB_TestPoint;
var PCB_Layer = require("./PCB/PCB_Layer.js").PCB_Layer;
var PCB_Part  = require("./PCB/PCB_Part.js").PCB_Part;

var Render_Layer = require("./render/Render_Layer.js").Render_Layer;
var RemoveAllLayerCanvases = require("./render/Render_Layer.js").RemoveAllLayerCanvases;
var version           = require("./version.js");

var Fullscreen = require("./fullscreen.js");
var colorMap        = require("./colormap.js");


var rightSideTable = require("./RightSideScreenTable.js")


/* Layer table */
let layerTableVisable     = true;
let traceTableVisable     = false;
let testPointTableVisable = false;

let rightScreenTableVisable = layerTableVisable || traceTableVisable || testPointTableVisable;
let mainLayout = "";



function setDarkMode(value)
{
    let topmostdiv = document.getElementById("topmostdiv");
    if (value)
    {
        topmostdiv.classList.add("dark");
    }
    else
    {
        topmostdiv.classList.remove("dark");
    }
    globalData.writeStorage("darkmode", value);
    document.documentElement.classList.toggle("dark-page", !!value);

    // Layer colour swatches show the palette in use.
    if (globalData.layer_list && globalData.layer_list.size > 0)
    {
        rightSideTable.populateRightSideScreenTable();
        Render_RightScreenTable();
    }


    // The layer table eye icons are inverted by the ".dark .layer_checkbox" rule in index.css
    // (reading document.styleSheets is blocked for pages opened from file://).

    if (globalData.GetAllCanvas())
    {
        render.RenderPCB(globalData.GetAllCanvas().front);
        render.RenderPCB(globalData.GetAllCanvas().back);
    }
}

/* Arrow keys move the highlight through the visible BOM rows. */
function highlightRelativeRow(step)
{
    let handlers = globalData.getHighlightHandlers().filter(function (h)
    {
        let row = document.getElementById(h.id);
        return row && row.style.display != "none";
    });
    if (handlers.length == 0)
    {
        return;
    }
    let current = globalData.getCurrentHighlightedRowId();
    let index = (current.length > 0) ? handlers.findIndex(h => h.id == current[current.length - 1]) : -1;
    let next = (index < 0) ? (step > 0 ? 0 : handlers.length - 1) : Math.min(handlers.length - 1, Math.max(0, index + step));
    handlers[next].handler({ type: "click" });
    handlers_mouse.smoothScrollToRow(handlers[next].id);
}

function highlightPreviousRow(event)
{
    highlightRelativeRow(-1);
}

function highlightNextRow(event)
{
    highlightRelativeRow(1);
}

function modulesClicked(references)
{
    let lastClickedIndex = references.indexOf(globalData.getLastClickedRef());
    let ref = references[(lastClickedIndex + 1) % references.length];
    for (let handler of globalData.getHighlightHandlers())
    {
        if (handler.refs.indexOf(ref) >= 0)
        {
            globalData.setLastClickedRef(ref);
            handler.handler();
            handlers_mouse.smoothScrollToRow(globalData.getCurrentHighlightedRowId());
            break;
        }
    }
}

function changeCanvasLayout(layout)
{
    if(mainLayout != "BOM")
    {
        document.getElementById("fl-btn").classList.remove("depressed");
        document.getElementById("fb-btn").classList.remove("depressed");
        document.getElementById("bl-btn").classList.remove("depressed");

        switch (layout)
        {
        case "F":
            document.getElementById("fl-btn").classList.add("depressed");
            if (globalData.getBomLayout() != "BOM")
            {
                globalData.collapseCanvasSplit(1);
            }
            break;
        case "B":
            document.getElementById("bl-btn").classList.add("depressed");
            if (globalData.getBomLayout() != "BOM")
            {
                globalData.collapseCanvasSplit(0);
            }
            break;
        default:
            document.getElementById("fb-btn").classList.add("depressed");
            if (globalData.getBomLayout() != "BOM")
            {
                globalData.setSizesCanvasSplit([50, 50]);
            }
            break;
        }

        globalData.setCanvasLayout(layout);
        globalData.writeStorage("canvaslayout", layout);
        render.resizeAll();
    }
}

function populateMetadata()
{
    let metadata = Metadata.GetInstance();
    metadata.Set(pcbdata.metadata);

    if(metadata.revision == undefined)
    {
        document.getElementById("revision").textContent = "";
    }
    else
    {
        document.getElementById("revision").textContent = "Revision: " + metadata.revision.toString()
            + ((pcbdata.metadata && pcbdata.metadata.variant && pcbdata.metadata.variant != "DEFAULT") ? "  (variant " + pcbdata.metadata.variant + ")" : "");
    }

    if(metadata.company == undefined)
    {
        document.getElementById("company").textContent = "";
    }
    else
    {
        document.getElementById("company").textContent  = metadata.company;
    }

    if(metadata.project_name == undefined)
    {
        document.getElementById("title").textContent = "";
    }
    else
    {
        document.getElementById("title").textContent = metadata.project_name;
    }

    if(metadata.date == undefined)
    {
        document.getElementById("filedate").textContent = "";
    }
    else
    {
        document.getElementById("filedate").textContent = metadata.date;
    }
}

function focusInputField(input)
{
    input.scrollIntoView(false);
    input.focus();
    input.select();
}

function focusBOMFilterField()
{
    focusInputField(document.getElementById("bom-filter"));
}

function toggleBomCheckbox(bomrowid, checkboxnum)
{
    if (!bomrowid || checkboxnum > globalData.getCheckboxes().length)
    {
        return;
    }
    let bomrow = document.getElementById(bomrowid);
    let checkbox = bomrow.childNodes[checkboxnum].childNodes[0];
    checkbox.checked = !checkbox.checked;
    checkbox.indeterminate = false;
    checkbox.onchange();
}

function removeGutterNode(node)
{
    for (let i = 0; i < node.childNodes.length; i++)
    {
        if (    (node.childNodes[i].classList )
             && (node.childNodes[i].classList.contains("gutter"))
        )
        {
            node.removeChild(node.childNodes[i]);
            break;
        }
    }
}

function cleanGutters()
{
    removeGutterNode(document.getElementById("bot"));
    removeGutterNode(document.getElementById("canvasdiv"));
}

function setAdditionalAttributes(value)
{
    globalData.setAdditionalAttributes(value);
    globalData.writeStorage("additionalAttributes", value);
    bomTable.populateBomTable();
}

// XXX: None of this seems to be working.
document.onkeydown = function(e)
{
    // Keys typed into the filters, settings or the test point table are not shortcuts.
    let target = e.target || {};
    if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName || "") || target.isContentEditable)
    {
        return;
    }
    switch (e.key)
    {
        case " ":
            if (typeof pcbdata !== "undefined" && pcbdata)
            {
                bomTable.TogglePlacedOnHighlightedRow();
                e.preventDefault();
            }
            break;
        case "ArrowUp":
            highlightPreviousRow(e);
            e.preventDefault();
            break;
        case "ArrowDown":
            highlightNextRow(e);
            e.preventDefault();
            break;
        case "F11":
             e.preventDefault();
            break;
        default:
            break;
    }

    if (e.altKey)
    {
        switch (e.key)
        {
        case "f":
            focusBOMFilterField();
            e.preventDefault();
            break;
        case "z":
            changeBomLayout("BOM");
            e.preventDefault();
            break;
        case "x":
            changeBomLayout("LR");
            e.preventDefault();
            break;
        case "c":
            changeBomLayout("TB");
            e.preventDefault();
            break;
        case "v":
            changeCanvasLayout("F");
            e.preventDefault();
            break;
        case "b":
            changeCanvasLayout("FB");
            e.preventDefault();
            break;
        case "n":
            changeCanvasLayout("B");
            e.preventDefault();
            break;
        default:
            break;
        }
    }
};


document.getElementById("lay-btn").classList.add("depressed");
function LayerTable_Toggle()
{
    if (layerTableVisable)
    {
        layerTableVisable = false;
        document.getElementById("lay-btn").classList.remove("depressed");
    }
    else
    {
        layerTableVisable = true;
        document.getElementById("lay-btn").classList.add("depressed");
    }
    rightScreenTableVisable = layerTableVisable || traceTableVisable || testPointTableVisable;
    changeBomLayout(mainLayout);
}

function LayerTable_Off()
{
    layerTableVisable = false;
    document.getElementById("lay-btn").classList.remove("depressed");
    rightScreenTableVisable = layerTableVisable || traceTableVisable || testPointTableVisable;
    changeBomLayout(mainLayout);
}

function LayerTable_On()
{
    layerTableVisable = true;
    document.getElementById("lay-btn").classList.add("depressed");
    rightScreenTableVisable = layerTableVisable || traceTableVisable || testPointTableVisable;
    changeBomLayout(mainLayout);
}

document.getElementById("trace-btn").classList.remove("depressed");
function TraceTable_Toggle()
{
    if (traceTableVisable)
    {
        traceTableVisable = false;
        document.getElementById("trace-btn").classList.remove("depressed");
    }
    else
    {
        traceTableVisable = true;
        document.getElementById("trace-btn").classList.add("depressed");
    }
    rightScreenTableVisable = layerTableVisable || traceTableVisable || testPointTableVisable;
    changeBomLayout(mainLayout);
}

function TraceTable_Off()
{
    traceTableVisable = false;
    document.getElementById("trace-btn").classList.remove("depressed");
    rightScreenTableVisable = layerTableVisable || traceTableVisable || testPointTableVisable;
    changeBomLayout(mainLayout);
}

function TraceTable_On()
{
    traceTableVisable = true;
    document.getElementById("trace-btn").classList.add("depressed");
    rightScreenTableVisable = layerTableVisable || traceTableVisable || testPointTableVisable;
    changeBomLayout(mainLayout);
}

document.getElementById("testpoint-btn").classList.remove("depressed");
function TestPointTable_Toggle()
{
    if (testPointTableVisable)
    {
        testPointTableVisable = false;
        document.getElementById("testpoint-btn").classList.remove("depressed");
    }
    else
    {
        testPointTableVisable = true;
        document.getElementById("testpoint-btn").classList.add("depressed");
    }
    rightScreenTableVisable = layerTableVisable || traceTableVisable || testPointTableVisable;
    changeBomLayout(mainLayout);
}

function TestPointTable_Off()
{
    testPointTableVisable = false;
    document.getElementById("testpoint-btn").classList.remove("depressed");
    rightScreenTableVisable = layerTableVisable || traceTableVisable || testPointTableVisable;
    changeBomLayout(mainLayout);
}

function TestPointTable_On()
{
    testPointTableVisable = true;
    document.getElementById("testpoint-btn").classList.add("depressed");
    rightScreenTableVisable = layerTableVisable || traceTableVisable || testPointTableVisable;
    changeBomLayout(mainLayout);
}

function Render_RightScreenTable()
{
    let layerBody = document.getElementById("layer_table");
    let traceBody = document.getElementById("trace_table");
    let testPointBody = document.getElementById("testpoint_table");

    if(layerTableVisable)
    {
        layerBody.removeAttribute("hidden");
        traceBody.setAttribute("hidden", "hidden");
        testPointBody.setAttribute("hidden", "hidden");
    }
    else if(traceTableVisable)
    {
        layerBody.setAttribute("hidden", "hidden");
        traceBody.removeAttribute("hidden");
        testPointBody.setAttribute("hidden", "hidden");
    }
    else if(testPointTableVisable)
    {
        layerBody.setAttribute("hidden", "hidden");
        traceBody.setAttribute("hidden", "hidden");
        testPointBody.removeAttribute("hidden");
    }
    else
    {
        console.log("Right screen table disabled")
    }
}

function Create_Layers(pcbdata)
{
    globalData.layer_list = new Map();
    /* Create layer objects from JSON file */
    for(let layer of pcbdata.board.layers)
    {
        globalData.layer_list.set(layer.name, [new PCB_Layer(layer), new Render_Layer(layer)]);
    }

    /*
        Internally the following layers are used
            1. Pads
            2. Highlights
        If these were not created before, then they will be created here.
    */
    let layerPads       = {"name":"Pads", "paths": []};
    if(globalData.layer_list.get(layerPads.name) == undefined)
    {
        globalData.layer_list.set(layerPads.name, [new PCB_Layer(layerPads), new Render_Layer(layerPads)]);
    }

    let layerHighlights = {"name":"Highlights", "paths": []};
    if(globalData.layer_list.get(layerHighlights.name) == undefined)
    {
        globalData.layer_list.set(layerHighlights.name, [new PCB_Layer(layerHighlights), new Render_Layer(layerHighlights)]);
    }
}

function Create_Traces(pcbdata)
{
    globalData.pcb_traces = [];
    /* Create trace objects from JSON file */
    for(let trace of (pcbdata.board.traces || []))
    {
        globalData.pcb_traces.push(new PCB_Trace(trace));
    }
}

function Create_TestPoints(pcbdata)
{
    globalData.pcb_testpoints = [];
    /* Create test point objects from JSON file */
    for(let testpoint of (pcbdata.test_points || []))
    {
        globalData.pcb_testpoints.push(new PCB_TestPoint(testpoint));
    }
}

function Create_Parts(pcbdata)
{
    globalData.pcb_parts = [];
    /* Create layer objects from JSON file */
    for(let part of pcbdata.parts)
    {
        globalData.pcb_parts.push(new PCB_Part(part));
    }
}

function Create_Configuration(pcbdata)
{
    // Settings in the board file are defaults: they apply until the user changes them.
    let setDefault = function (key, value)
    {
        if (globalData.readStorage(key) === null)
        {
            globalData.writeStorage(key, value);
            return true;
        }
        return false;
    };
    for(let config of (pcbdata.configuration || []))
    {
        if(config.category=="color")
        {
            colorMap.SetColor(config.name, config.value, config.value_dark);
        }
        else if(config.category=="setting")
        {
            if( config.name =="dark_mode")
            {
                setDefault("darkmode", config.value == 1);
            }
            else if(config.name =="hight_first_pin")
            {
                setDefault("highlightpin1", config.value == 1);
            }
            else if(config.name =="hide_placed_parts")
            {
                setDefault("hidePlacedParts", config.value == 1);
            }
            else if(config.name =="combine_values")
            {
                setDefault("combineValues", config.value == 1);
            }
            else if(config.name =="bom_pcb_layout")
            {
                setDefault("bomlayout", config.value);
            }
            else if(config.name =="additional_table")
            {
                if( config.value == "Tr")
                {
                    layerTableVisable     = false;
                    traceTableVisable     = true;
                    testPointTableVisable = false;
                }
                else if( config.value == "Tp")
                {
                    layerTableVisable     = false;
                    traceTableVisable     = false;
                    testPointTableVisable = true;
                }
                else if( config.value == "Lr")
                {
                    layerTableVisable     = true;
                    traceTableVisable     = false;
                    testPointTableVisable = false;
                }
                else
                {
                    layerTableVisable     = false;
                    traceTableVisable     = false;
                    testPointTableVisable = false;
                }
            }
            else if(config.name =="bom_checkboxes")
            {
                setDefault("bomCheckboxes", config.value);
            }
            else if(config.name =="bom_part_attributes")
            {
                setDefault("additionalAttributes", config.value);
            }
            else
            {
               console.log("Warning: Unsupported setting parameter ", config.category, config.name, config.value);
            }
        }
        else
        {
            console.log("Warning: Unsupported parameter ", config.category, config.name);
        }
    }

}

/* Replaces the board shown by another one (file or folder opened in the page). */
function LoadPCB(newPcbData)
{
    window.pcbdata = newPcbData;
    bomTable.clearBOMTable();
    pcb.DeleteBOM();
    RemoveAllLayerCanvases();
    globalData.layer_list = new Map();
    globalData.setHighlightedRefs(null);
    globalData.setCurrentHighlightedRowId(null, false);
    globalData.setLastClickedRef(undefined);
    handlers_mouse.ShowPartInfo(null);
    InitPCB(newPcbData);
}

function changeBomLayout(layout)
{
    mainLayout = layout;
    document.getElementById("bom-btn").classList.remove("depressed");
    document.getElementById("bom-lr-btn").classList.remove("depressed");
    document.getElementById("bom-tb-btn").classList.remove("depressed");
    document.getElementById("pcb-btn").classList.remove("depressed");
    switch (layout)
    {
    case "BOM":
        document.getElementById("bom-btn").classList.add("depressed");

        document.getElementById("fl-btn").classList.remove("depressed");
        document.getElementById("fb-btn").classList.remove("depressed");
        document.getElementById("bl-btn").classList.remove("depressed");



        if (globalData.getBomSplit())
        {
            if(rightScreenTableVisable)
            {
                globalData.destroyLayerSplit();
                globalData.setLayerSplit(null);
            }
            globalData.destroyBomSplit();
            globalData.setBomSplit(null);
            globalData.destroyCanvasSplit();
            globalData.setCanvasSplit(null);
        }

        document.getElementById("bomdiv").style.display = "";
        document.getElementById("frontcanvas").style.display = "none";
        document.getElementById("backcanvas").style.display = "none";
        if(rightScreenTableVisable)
        {
            rightScreenTableVisable = false;
            document.getElementById("lay-btn").classList.remove("depressed");
            document.getElementById("trace-btn").classList.remove("depressed");
            document.getElementById("testpoint-btn").classList.remove("depressed");
            document.getElementById("layerdiv").style.display = "none";
        }

        document.getElementById("bot").style.height = "";

        document.getElementById("datadiv"   ).classList.add(   "split-horizontal");
        break;
    case "PCB":

        document.getElementById("pcb-btn"     ).classList.add("depressed");
        document.getElementById("bomdiv").style.display = "none";
        document.getElementById("frontcanvas").style.display = "";
        document.getElementById("backcanvas" ).style.display = "";

        if(rightScreenTableVisable)
        {
            document.getElementById("layerdiv"   ).style.display = "";
        }
        else
        {
            document.getElementById("layerdiv"   ).style.display = "none";
        }

        document.getElementById("bot"        ).style.height = "calc(90%)";

        document.getElementById("datadiv"   ).classList.add(   "split-horizontal");
        document.getElementById("bomdiv"     ).classList.remove(   "split-horizontal");
        document.getElementById("canvasdiv"  ).classList.remove(   "split-horizontal");
        document.getElementById("frontcanvas").classList.add(   "split-horizontal");
        document.getElementById("backcanvas" ).classList.add(   "split-horizontal");
        if(rightScreenTableVisable)
        {
            document.getElementById("layerdiv"   ).classList.add(   "split-horizontal");
        }

        if (globalData.getBomSplit())
        {
            globalData.destroyLayerSplit();
            globalData.setLayerSplit(null);
            globalData.destroyBomSplit();
            globalData.setBomSplit(null);
            globalData.destroyCanvasSplit();
            globalData.setCanvasSplit(null);
        }

        if(rightScreenTableVisable)
        {
            globalData.setLayerSplit(Split(["#datadiv", "#layerdiv"], {
                sizes: [80, 20],
                onDragEnd: render.resizeAll,
                gutterSize: 5,
                cursor: "col-resize"
            }));
        }
        else
        {
            globalData.setLayerSplit(Split(["#datadiv", "#layerdiv"], {
                sizes: [99, 0.1],
                onDragEnd: render.resizeAll,
                gutterSize: 5,
                cursor: "col-resize"
            }));
        }

        globalData.setBomSplit(Split(["#bomdiv", "#canvasdiv"], {
            direction: "vertical",
            sizes: [50, 50],
            onDragEnd: render.resizeAll,
            gutterSize: 5,
            cursor: "row-resize"
        }));

        globalData.setCanvasSplit(Split(["#frontcanvas", "#backcanvas"], {
            sizes: [50, 50],
            gutterSize: 5,
            onDragEnd: render.resizeAll,
            cursor: "row-resize"
        }));

        document.getElementById("canvasdiv"  ).style.height = "calc(99%)";

        break;
    case "TB":
        document.getElementById("bom-tb-btn"     ).classList.add("depressed");
        document.getElementById("bomdiv").style.display = "";
        document.getElementById("frontcanvas").style.display = "";
        document.getElementById("backcanvas" ).style.display = "";
        if(rightScreenTableVisable)
        {
            document.getElementById("layerdiv"   ).style.display = "";
        }
        else
        {
            document.getElementById("layerdiv"   ).style.display = "none";
        }
        document.getElementById("bot"        ).style.height = "calc(90%)";

        document.getElementById("datadiv"   ).classList.add(   "split-horizontal");
        document.getElementById("bomdiv"     ).classList.remove(   "split-horizontal");
        document.getElementById("canvasdiv"  ).classList.remove(   "split-horizontal");
        document.getElementById("frontcanvas").classList.add(   "split-horizontal");
        document.getElementById("backcanvas" ).classList.add(   "split-horizontal");
        if(rightScreenTableVisable)
        {
            document.getElementById("layerdiv"   ).classList.add(   "split-horizontal");
        }

        if (globalData.getBomSplit())
        {
            globalData.destroyLayerSplit();
            globalData.setLayerSplit(null);
            globalData.destroyBomSplit();
            globalData.setBomSplit(null);
            globalData.destroyCanvasSplit();
            globalData.setCanvasSplit(null);
        }

        if(rightScreenTableVisable)
        {
            globalData.setLayerSplit(Split(["#datadiv", "#layerdiv"], {
                sizes: [80, 20],
                onDragEnd: render.resizeAll,
                gutterSize: 5,
                cursor: "col-resize"
            }));
        }
        globalData.setBomSplit(Split(["#bomdiv", "#canvasdiv"], {
            direction: "vertical",
            sizes: [50, 50],
            onDragEnd: render.resizeAll,
            gutterSize: 5,
            cursor: "row-resize"
        }));

        globalData.setCanvasSplit(Split(["#frontcanvas", "#backcanvas"], {
            sizes: [50, 50],
            gutterSize: 5,
            onDragEnd: render.resizeAll,
            cursor: "row-resize"
        }));


        break;
    case "LR":
        document.getElementById("bom-lr-btn"     ).classList.add("depressed");
        document.getElementById("bomdiv").style.display = "";
        document.getElementById("frontcanvas").style.display = "";
        document.getElementById("backcanvas" ).style.display = "";
        if(rightScreenTableVisable)
        {
            document.getElementById("layerdiv"   ).style.display = "";
        }
        else
        {
            document.getElementById("layerdiv"   ).style.display = "none";
        }
        document.getElementById("bot"        ).style.height = "calc(90%)";

        document.getElementById("datadiv"    ).classList.add(   "split-horizontal");
        document.getElementById("bomdiv"     ).classList.add(   "split-horizontal");
        document.getElementById("canvasdiv"  ).classList.add(   "split-horizontal");
        document.getElementById("frontcanvas").classList.remove(   "split-horizontal");
        document.getElementById("backcanvas" ).classList.remove(   "split-horizontal");
        document.getElementById("layerdiv"   ).classList.add(   "split-horizontal");

        if (globalData.getBomSplit())
        {

            globalData.destroyLayerSplit();
            globalData.setLayerSplit(null);

            globalData.destroyBomSplit();
            globalData.setBomSplit(null);
            globalData.destroyCanvasSplit();
            globalData.setCanvasSplit(null);
        }

        if(rightScreenTableVisable)
        {
            globalData.setLayerSplit(Split(["#datadiv", "#layerdiv"], {
                sizes: [80, 20],
                onDragEnd: render.resizeAll,
                gutterSize: 5,
                cursor: "col-resize"
            }));
        }

        globalData.setBomSplit(Split(["#bomdiv", "#canvasdiv"], {
            sizes: [50, 50],
            onDragEnd: render.resizeAll,
            gutterSize: 5,
            cursor: "row-resize"
        }));

        globalData.setCanvasSplit(Split(["#frontcanvas", "#backcanvas"], {
            sizes: [50, 50],
            direction: "vertical",
            gutterSize: 5,
            onDragEnd: render.resizeAll,
            cursor: "row-resize"
        }));

        break;
    }
    globalData.setBomLayout(layout);
    globalData.writeStorage("bomlayout", layout);
    bomTable.populateBomTable();
    changeCanvasLayout(globalData.getCanvasLayout());
}

// TODO: Remove global variable. Used to test feature.
document.getElementById("fullscreen-btn").classList.remove("depressed");
let isFullscreen = false;
function toggleFullScreen()
{
    if(isFullscreen)
    {
        document.getElementById("fullscreen-btn").classList.remove("depressed");
        isFullscreen = false;
        Fullscreen.closeFullscreen();
    }
    else
    {
        document.getElementById("fullscreen-btn").classList.add("depressed");
        isFullscreen = true;
        Fullscreen.openFullscreen();
    }
}

//XXX: I would like this to be in the html functions js file. But this function needs to be
//     placed here, otherwise the application rendering becomes very very weird.
function StorageScopeFor(data)
{
    let m = data.metadata || {};
    return (m.project_name || "") + "|" + (m.revision || "") + "|" + (m.variant || "");
}

function InitPCB(pcbdata)
{
    // Settings and checkboxes are stored per board.
    globalData.setStorageScope(StorageScopeFor(pcbdata));
    document.getElementById("emptyState").style.display = "none";

    pcb.CreateBOM(pcbdata);
    let metadata = Metadata.GetInstance();
    metadata.Set(pcbdata.metadata);

    Create_Traces(pcbdata);
    Create_TestPoints(pcbdata);
    Create_Parts(pcbdata);
    // Colours and default settings before the layers and tables are built.
    Create_Configuration(pcbdata);
    Create_Layers(pcbdata);

    rightSideTable.populateRightSideScreenTable();
    // Show only the selected table of the right panel (layers, traces or test points).
    Render_RightScreenTable();

    // Must be called after loading PCB as rendering required the bounding box information for PCB
    render.initRender();

    populateMetadata();

    // Set up mouse event handlers (assigned as onX properties, so a reload replaces them)
    handlers_mouse.addMouseHandlers(document.getElementById("frontcanvas"), globalData.GetAllCanvas().front);
    handlers_mouse.addMouseHandlers(document.getElementById("backcanvas") , globalData.GetAllCanvas().back);

    globalData.setBomLayout(globalData.readStorage("bomlayout"));
    if (!globalData.getBomLayout())
    {
        globalData.setBomLayout("LR");
    }
    globalData.setCanvasLayout(globalData.readStorage("canvaslayout"));
    if (!globalData.getCanvasLayout())
    {
        globalData.setCanvasLayout("FB");
    }

    globalData.setBomCheckboxes(globalData.readStorage("bomCheckboxes"));
    if (globalData.getBomCheckboxes() === null)
    {
        globalData.setBomCheckboxes("");
    }

    globalData.setRemoveBOMEntries(globalData.readStorage("removeBOMEntries"));
    if (globalData.getRemoveBOMEntries() === null)
    {
        globalData.setRemoveBOMEntries("");
    }

    globalData.setAdditionalAttributes(globalData.readStorage("additionalAttributes"));
    if (globalData.getAdditionalAttributes() === null)
    {
        globalData.setAdditionalAttributes("");
    }

    document.getElementById("bomCheckboxes").value        = globalData.getBomCheckboxes();
    document.getElementById("additionalAttributes").value = globalData.getAdditionalAttributes();

    let redrawOnDrag = globalData.readStorage("redrawOnDrag") !== "false";
    document.getElementById("dragCheckbox").checked = redrawOnDrag;
    globalData.setRedrawOnDrag(redrawOnDrag);

    let darkMode = globalData.readStorage("darkmode") === "true";
    document.getElementById("darkmodeCheckbox").checked = darkMode;
    setDarkMode(darkMode);

    let hidePlaced = globalData.readStorage("hidePlacedParts") === "true";
    document.getElementById("hidePlacedParts").checked = hidePlaced;
    globalData.setHidePlacedParts(hidePlaced);

    // On unless switched off
    let dimUnselected = globalData.readStorage("dimUnselected") !== "false";
    document.getElementById("dimUnselectedCheckbox").checked = dimUnselected;
    globalData.setDimUnselected(dimUnselected);

    let locatorRing = globalData.readStorage("locatorRing") === "true";
    document.getElementById("locatorRingCheckbox").checked = locatorRing;
    globalData.setLocatorRing(locatorRing);

    let highlightPin1 = globalData.readStorage("highlightpin1") === "true";
    document.getElementById("highlightpin1Checkbox").checked = highlightPin1;
    globalData.setHighlightPin1(highlightPin1);

    // If this is true then combine parts and display quantity
    let combine = globalData.readStorage("combineValues") === "true";
    document.getElementById("combineValues").checked = combine;
    globalData.setCombineValues(combine);

    let debugMode = globalData.readStorage("debugMode") === "true";
    document.getElementById("debugMode").checked = debugMode;
    globalData.setDebugMode(debugMode);

    // Read the value of board rotation from local storage
    let boardRotation = globalData.readStorage("boardRotation");
    /*
        Adjusted to match how the update rotation angle is calculated.
        If null, then angle not in local storage, set to 180 degrees.
    */
    if (boardRotation === null)
    {
        boardRotation = 180;
    }
    else
    {
        boardRotation = parseInt(boardRotation);
    }

    // Set internal global variable for board rotation.
    globalData.SetBoardRotation(boardRotation);
    document.getElementById("boardRotation").value = (boardRotation-180) / 5;
    document.getElementById("rotationDegree").textContent = (boardRotation-180);

    // Triggers render
    changeBomLayout(globalData.getBomLayout());
    document.body.dataset.boardLoaded = (pcbdata.metadata && pcbdata.metadata.project_name) || "board";
}

//XXX: The page set up has to run from here, otherwise the application rendering becomes very weird.
window.onload = function(e)
{
    // Must occur early for storage parameters to be loaded. If not loaded early then
    // incorrect parameters may be used.
    globalData.initStorage();

    let versionNumberHTML       = document.getElementById("softwareVersion");
    versionNumberHTML.innerHTML = version.GetVersionString();

    if (typeof pcbdata !== "undefined" && pcbdata)
    {
        InitPCB(pcbdata);
    }
    else
    {
        // No board embedded or next to the page: ask for an Altium export folder.
        document.getElementById("emptyState").style.display = "";
    }
};

window.onresize = function ()
{
    if (globalData.GetAllCanvas()) { render.resizeAll(); }
};
window.matchMedia("print").addListener(window.onresize);

module.exports = {
    changeBomLayout        , setDarkMode      , changeCanvasLayout,
    setAdditionalAttributes, LayerTable_Toggle, TraceTable_Toggle,
    TestPointTable_Toggle  , toggleFullScreen , LoadPCB, LayerTable_Off,
    LayerTable_On          , TraceTable_Off   , TraceTable_On,
    TestPointTable_Off     , TestPointTable_On, Render_RightScreenTable
};
