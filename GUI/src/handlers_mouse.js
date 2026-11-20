var globalData = require("./global.js");
var render     = require("./render.js");

function handleMouseDown(e, layerdict)
{
    if (e.which != 1)
    {
        return;
    }

    e.preventDefault();
    e.stopPropagation();

    layerdict.transform.mousestartx = e.offsetX;
    layerdict.transform.mousestarty = e.offsetY;
    layerdict.transform.mousedownx = e.offsetX;
    layerdict.transform.mousedowny = e.offsetY;
    layerdict.transform.mousedown = true;
}

function smoothScrollToRow(rowid)
{
    let row = document.getElementById(rowid);
    if (row)
    {
        row.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest"
        });
    }
}

/* Short description of a part for the info line above the board. */
function ShowPartInfo(ref)
{
    let info = document.getElementById("partInfo");
    if (!info) { return; }
    let part = globalData.pcb_parts.find(p => p.name == ref);
    if (!part)
    {
        info.textContent = "";
        return;
    }
    let text = part.name + "  " + (part.value || "");
    let description = part.attributes.get("description");
    if (description) { text += "  –  " + description; }
    text += "  (" + (part.location == "B" ? "bottom" : "top");
    if (part.dnp) { text += ", not fitted"; }
    else if (!part.inBom) { text += ", not in BOM"; }
    text += ")";
    info.textContent = text;
}

/*
    Click on the board: several parts may overlap; repeated clicks cycle through them. A part with a
    BOM row selects that row, any other part (fiducial, test point, not fitted) is highlighted alone.
*/
function modulesClicked(event, references)
{
    let lastClickedIndex = references.indexOf(globalData.getLastClickedRef());
    let ref = references[(lastClickedIndex + 1) % references.length];
    globalData.setLastClickedRef(ref);
    ShowPartInfo(ref);
    for (let handler of globalData.getHighlightHandlers())
    {
        if (handler.refs.indexOf(ref) >= 0)
        {
            // Row handlers act on clicks only; the board click arrives as a mouseup.
            handler.handler({ type: "click", ctrlKey: event.ctrlKey, shiftKey: false });
            smoothScrollToRow(globalData.getCurrentHighlightedRowId());
            return;
        }
    }
    for (let row of globalData.getCurrentHighlightedRowId())
    {
        let el = document.getElementById(row);
        if (el) { el.classList.remove("highlighted"); }
    }
    globalData.setCurrentHighlightedRowId(null, false);
    globalData.setHighlightedRefs([ref]);
}

function bboxScan(layer, x, y)
{
    let result = [];
    for (let part of globalData.pcb_parts)
    {
        if (part.location == layer && part.package.Contains(x, y))
        {
            result.push(part.name);
        }
    }
    // Smallest part first, so a resistor inside a connector outline can be picked.
    let area = (name) =>
    {
        let b = globalData.pcb_parts.find(p => p.name == name).package.boundingBox;
        return Math.abs((b.point2.x - b.point0.x) * (b.point2.y - b.point0.y));
    };
    return result.sort((a, b) => area(a) - area(b));
}


function handleMouseClick(e, layerdict)
{
    let x = e.offsetX;
    let y = e.offsetY;
    let t = layerdict.transform;
    if (layerdict.layer != "B")
    {
        x = (2 * x / t.zoom - t.panx + t.x) / -t.s;
    }
    else
    {
        x = (2 * x / t.zoom - t.panx - t.x) / t.s;
    }
    y = (2 * y / t.zoom - t.y - t.pany) / t.s;
    let v = render.RotateVector([x, y], -globalData.GetBoardRotation());
    let reflist = bboxScan(layerdict.layer, v[0], v[1], t);
    if (reflist.length > 0)
    {
        modulesClicked(e, reflist);
        render.drawHighlights();
    }
}

function handleMouseUp(e, layerdict)
{
    e.preventDefault();
    e.stopPropagation();
    if (    e.which == 1
         && layerdict.transform.mousedown
         && layerdict.transform.mousedownx == e.offsetX
         && layerdict.transform.mousedowny == e.offsetY
    )
    {
        // This is just a click
        handleMouseClick(e, layerdict);
        layerdict.transform.mousedown = false;
        return;
    }
    if (e.which == 3)
    {
        // Reset pan and zoom on right click.
        layerdict.transform.panx = 0;
        layerdict.transform.pany = 0;
        layerdict.transform.zoom = 1;
        render.RenderPCB(layerdict);
    }
    else if (!globalData.getRedrawOnDrag())
    {
        render.RenderPCB(layerdict);
    }
    render.drawHighlights();
    layerdict.transform.mousedown = false;
}

function handleMouseMove(e, layerdict)
{
    if (!layerdict.transform.mousedown)
    {
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    let dx = e.offsetX - layerdict.transform.mousestartx;
    let dy = e.offsetY - layerdict.transform.mousestarty;
    layerdict.transform.panx += 2 * dx / layerdict.transform.zoom;
    layerdict.transform.pany += 2 * dy / layerdict.transform.zoom;
    layerdict.transform.mousestartx = e.offsetX;
    layerdict.transform.mousestarty = e.offsetY;

    if (globalData.getRedrawOnDrag())
    {
        render.RenderPCB(layerdict);
        render.drawHighlights();
    }
}

function handleMouseWheel(e, layerdict)
{
    e.preventDefault();
    e.stopPropagation();
    var t = layerdict.transform;
    var wheeldelta = e.deltaY;
    if (e.deltaMode == 1)
    {
        // FF only, scroll by lines
        wheeldelta *= 30;
    }
    else if (e.deltaMode == 2)
    {
        wheeldelta *= 300;
    }

    var m = Math.pow(1.1, -wheeldelta / 40);
    // Limit amount of zoom per tick.
    if (m > 2)
    {
        m = 2;
    }
    else if (m < 0.5)
    {
        m = 0.5;
    }

    t.zoom *= m;
    var zoomd = (1 - m) / t.zoom;
    t.panx += 2 * e.offsetX * zoomd;
    t.pany += 2 * e.offsetY * zoomd;
    render.RenderPCB(layerdict);
    render.drawHighlights();
}

function addMouseHandlers(div, layerdict)
{
    div.onmouseclick = function(e)
    {
        handleMouseClick(e, layerdict);
    };

    div.onmousedown = function(e)
    {
        handleMouseDown(e, layerdict);
    };

    div.onmousemove = function(e)
    {
        handleMouseMove(e, layerdict);
    };

    div.onmouseup = function(e)
    {
        handleMouseUp(e, layerdict);
    };

    div.onmouseout = function(e)
    {
        handleMouseUp(e, layerdict);
    };

    div.onwheel = function(e)
    {
        handleMouseWheel(e, layerdict);
    };


    div.oncontextmenu = function(e)
    {
        e.preventDefault();
    };
}

module.exports = {
    ShowPartInfo,
    addMouseHandlers, smoothScrollToRow
};
