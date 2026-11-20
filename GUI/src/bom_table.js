"use strict";
var globalData = require("./global.js");
var pcb        = require("./pcb.js");
var render     = require("./render.js");

/*
    Checkbox states are stored per designator ("checkbox_placed_R12"), so they survive switching
    between combined and single rows; a row is ticked when all of its parts are.
*/
function checkboxKey(checkbox, ref)
{
    return "checkbox_" + checkbox.toLowerCase() + "_" + ref;
}

function IsRowChecked(checkbox, bomentry)
{
    return bomentry.refs.every(ref => globalData.readStorage(checkboxKey(checkbox, ref)) == "true");
}

function SetRowChecked(checkbox, bomentry, checked)
{
    for (let ref of bomentry.refs)
    {
        globalData.writeStorage(checkboxKey(checkbox, ref), checked ? "true" : "false");
    }
}

/* Redraws board and table and keeps the highlighted parts highlighted. */
function RefreshKeepingHighlight()
{
    let refs = globalData.getHighlightedRefs().slice();
    render.RenderPCB(globalData.GetAllCanvas().front);
    render.RenderPCB(globalData.GetAllCanvas().back);
    populateBomTable();
    globalData.setHighlightedRefs(refs);
    for (let handler of globalData.getHighlightHandlers())
    {
        if (handler.refs.some(r => refs.indexOf(r) >= 0))
        {
            let row = document.getElementById(handler.id);
            if (row) { row.classList.add("highlighted"); }
            globalData.setCurrentHighlightedRowId(handler.id, true);
        }
    }
    render.drawHighlights();
}

function createCheckboxChangeHandler(checkbox, bomentry)
{
    return function(event)
    {
        SetRowChecked(checkbox, bomentry, !IsRowChecked(checkbox, bomentry));
        RefreshKeepingHighlight();
    };
}

function IsCheckboxClicked(bomrowid, checkboxname)
{
    let checkboxnum = 0;
    while (checkboxnum < globalData.getCheckboxes().length && globalData.getCheckboxes()[checkboxnum].toLowerCase() != checkboxname.toLowerCase())
    {
        checkboxnum++;
    }
    if (!bomrowid || checkboxnum >= globalData.getCheckboxes().length)
    {
        return;
    }
    let bomrow = document.getElementById(bomrowid);
    let checkbox = bomrow.childNodes[checkboxnum + 1].childNodes[0];
    return checkbox.checked;
}

function clearBOMTable()
{
    let bom = document.getElementById("bombody");

    while (bom.firstChild)
    {
        bom.removeChild(bom.firstChild);
    }
}

/*
    https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort

    JS treats values in compare as strings by default
    so need to use a function to sort numerically.
*/
function NumericCompare(a,b)
{
    return (a - b);
}

/*
    Takes as an argument a list of reference designations.
*/
function ConvertReferenceDesignatorsToRanges(ReferenceDesignations)
{
    /*
        Runs of three or more consecutive numbers with the same prefix are shown as a range
        (C1,C2,C3 -> C1-C3). Designators that do not end in their number (R610A) are listed as is.
        Adapted from KiCost.
    */
    let groups = new Map();
    let result = [];
    for (let ref of ReferenceDesignations.slice().sort(pcb.CompareDesignators))
    {
        let m = ref.match(/^([^\d]*)(\d+)$/);
        if (!m)
        {
            result.push(ref);
            continue;
        }
        if (!groups.has(m[1])) { groups.set(m[1], []); }
        groups.get(m[1]).push(parseInt(m[2], 10));
    }
    for (let [designator, numbers] of groups)
    {
        numbers.sort(NumericCompare);
        let rangeStart = 0;
        while (rangeStart < numbers.length)
        {
            let numRange = String(numbers[rangeStart]);
            let nextRangeStart = rangeStart + 1;
            for (let rangeEnd = rangeStart + 2; rangeEnd < numbers.length; rangeEnd++)
            {
                if (rangeEnd - rangeStart != numbers[rangeEnd] - numbers[rangeStart])
                {
                    break;
                }
                numRange = String(numbers[rangeStart]) + "-" + String(numbers[rangeEnd]);
                nextRangeStart = rangeEnd + 1;
            }
            result.push(designator + numRange);
            rangeStart = nextRangeStart;
        }
    }
    return result.sort(pcb.CompareDesignators);
}

function populateBomBody()
{
    let bom = document.getElementById("bombody");

    clearBOMTable();

    globalData.setHighlightHandlers([]);
    globalData.setCurrentHighlightedRowId(null, false);

    let bomtable = pcb.GetBOM();

    if (globalData.getBomSortFunction())
    {
        bomtable = bomtable.slice().sort(globalData.getBomSortFunction());
    }

    // Placed rows are left out when "Hide placed parts" is on (only with a "Placed" column).
    let checkboxNames = globalData.getBomCheckboxes().split(",").map(c => c.trim()).filter(c => c);
    let placedName = checkboxNames.find(c => c.toLowerCase() == "placed");
    if (globalData.getHidePlacedParts() && placedName)
    {
        bomtable = bomtable.filter(entry => !IsRowChecked(placedName, entry));
    }

    for (let i = 0; i < bomtable.length; i++)
    {
        let bomentry = bomtable[i];
        let references = ConvertReferenceDesignatorsToRanges(bomentry.refs).join(", ");

        let tr = document.createElement("TR");
        let td = document.createElement("TD");
        let rownum = i + 1;
        tr.id = "bomrow" + rownum;
        td.textContent = rownum;
        tr.appendChild(td);

        // Checkboxes
        for (let checkbox of checkboxNames)
        {
            td = document.createElement("TD");
            let input = document.createElement("input");
            input.type = "checkbox";
            input.checked = IsRowChecked(checkbox, bomentry);
            input.onchange = createCheckboxChangeHandler(checkbox, bomentry);
            td.appendChild(input);
            tr.appendChild(td);
        }

        // References
        td = document.createElement("TD");
        td.textContent = references;
        tr.appendChild(td);

        // Value
        td = document.createElement("TD");
        td.textContent = bomentry.value;
        tr.appendChild(td);

        // Attributes
        let additionalAttributes = globalData.getAdditionalAttributes().split(",");
        for (let x of additionalAttributes)
        {
            x = x.trim()
            if (x)
            {
                td = document.createElement("TD");
                td.textContent = pcb.getAttributeValue(bomentry, x.toLowerCase());
                tr.appendChild(td);
            }
        }

        if(globalData.getCombineValues())
        {
            td = document.createElement("TD");
            td.textContent = bomentry.quantity;
            tr.appendChild(td);
        }

        bom.appendChild(tr);
        let handler = createRowHighlightHandler(tr.id, bomentry.refs);

        tr.onclick = handler;
        tr.onmousemove = handler;
        globalData.pushHighlightHandlers({
            id: tr.id,
            handler: handler,
            refs: bomentry.refs
        });
    }
}

function createRowHighlightHandler(rowid, refs)
{
    return function(event)
    {
        if(event.shiftKey || (event.type =="click"))
        {
            /*
                If control key pressed pressed, then keep original rows highlighted and
                highlight new selected row.
            */
            if(event.ctrlKey )
            {
                /* Only append the new cicked object if not currently highlited */
                let alreadySelected = false;
                /* Disable highlight on all rows */
                let highlitedRows = globalData.getCurrentHighlightedRowId()
                for(let highlitedRow of highlitedRows)
                {
                    // USed here so that the row if highlighted will not highlighted
                    if (highlitedRow == rowid)
                    {
                        alreadySelected = true;
                    }
                }

                if(alreadySelected == false)
                {
                    document.getElementById(rowid).classList.add("highlighted");
                    globalData.setCurrentHighlightedRowId(rowid, true);
                    globalData.setHighlightedRefs(refs, true);
                    render.drawHighlights(IsCheckboxClicked(rowid, "placed"));
                }
            }
            else
            {
                /* Disable highlight on all rows */
                let highlitedRows = globalData.getCurrentHighlightedRowId()
                for(let highlitedRow of highlitedRows)
                {
                    // USed here so that the row if highlighted will not highlighted
                    if (highlitedRow == rowid)
                    {
                        // Skip do nothing
                    }
                    else
                    {
                        document.getElementById(highlitedRow).classList.remove("highlighted");
                    }
                }
                // Highlight current clicked row
                document.getElementById(rowid).classList.add("highlighted");
                globalData.setCurrentHighlightedRowId(rowid, false);
                globalData.setHighlightedRefs(refs);
                render.drawHighlights(IsCheckboxClicked(rowid, "placed"));
            }
        }
    }
}

function setBomCheckboxes(value)
{
    globalData.setBomCheckboxes(value);
    globalData.writeStorage("bomCheckboxes", value);
    populateBomTable();
}

function setRemoveBOMEntries(value)
{
    globalData.setRemoveBOMEntries(value);
    globalData.writeStorage("removeBOMEntries", value);
    populateBomTable();
}

function populateBomTable()
{
    populateBomHeader();
    populateBomBody();

        /* Read filter string. Hide BOM elements that dont cintain string entry */
    let filterBOM = document.getElementById("bom-filter");
    Filter(filterBOM.value)
}

function populateBomHeader()
{
    let bomhead   = document.getElementById("bomhead");
    while (bomhead.firstChild)
    {
        bomhead.removeChild(bomhead.firstChild);
    }

    let tr = document.createElement("TR");
    let th = document.createElement("TH");
    th.classList.add("numCol");
    tr.appendChild(th);


    let additionalCheckboxes = globalData.getBomCheckboxes().split(",");
    additionalCheckboxes     = additionalCheckboxes.filter(function(e){return e});
    globalData.setCheckboxes(additionalCheckboxes);
    for (let x2 of additionalCheckboxes)
    {
        // remove beginning and trailing whitespace
        x2 = x2.trim()
        if (x2)
        {
            tr.appendChild(createColumnHeader(x2, "Checkboxes"));
        }
    }

    tr.appendChild(createColumnHeader("References", "References"));

    tr.appendChild(createColumnHeader("Value", "Value"));

    let additionalAttributes = globalData.getAdditionalAttributes().split(",");
    // Remove null, "", undefined, and 0 values
    additionalAttributes    =additionalAttributes.filter(function(e){return e});
    for (let x of additionalAttributes)
    {
        // remove beginning and trailing whitespace
        x = x.trim()
        if (x)
        {
            tr.appendChild(createColumnHeader(x, "Attributes"));
        }
    }

    if(globalData.getCombineValues())
    {
            //XXX: This comparison function is using positive and negative implicit
            tr.appendChild(createColumnHeader("Quantity", "Quantity"));
    }

    bomhead.appendChild(tr);
}

/*
    Creates a new column header and regenerates BOM table.
    BOM table is recreated since a new column has been added.
*/
function createColumnHeader(name, cls)
{
    let th = document.createElement("TH");
    th.innerHTML = name;
    th.classList.add(cls);
    let span = document.createElement("SPAN");
    th.appendChild(span);
    return th;
}

function Filter(s)
{
    s = s.toLowerCase();
    let bomBody = document.getElementById("bombody");

    for (let part of bomBody.rows)
    {
        // This is searching for the string across the entire rows
        // text.
        if(part.innerText.trim().toLowerCase().includes(s))
        {
            part.style.display = "";
        }
        else
        {
            part.style.display = "none";
        }
    }
}

function FilterByAttribute(s)
{
    s = s.toLowerCase();
    let bomBody = document.getElementById("bombody");

    if(s != "")
    {
        // Removes strings that are also empty which occur
        // if a comma is entered but not a another character ('aaa,').
        let filterStrings = s.split(",").filter(element => {return element !== ''});


        for (let part of bomBody.rows)
        {
            for(let filterString of filterStrings)
            {
                if(part.innerText.trim().toLowerCase().includes(filterString))
                {
                    part.style.display = "none";
                    break;
                }
                else
                {
                    part.style.display = "";
                }
            }
        }
    }
    else
    {
         for (let part of bomBody.rows)
        {
            part.style.display = "";
        }
    }
}

/*
    Ticks the "Placed" box of the highlighted row(s) (or clears it when all are ticked) and
    moves the highlight to the next row: one key press per part number while assembling.
*/
function TogglePlacedOnHighlightedRow()
{
    let checkboxNames = globalData.getBomCheckboxes().split(",").map(c => c.trim()).filter(c => c);
    let placedName = checkboxNames.find(c => c.toLowerCase() == "placed");
    let rows = globalData.getCurrentHighlightedRowId();
    if (!placedName || rows.length == 0)
    {
        return;
    }
    let entries = [];
    let lastIndex = -1;
    let handlers = globalData.getHighlightHandlers();
    for (let row of rows)
    {
        let index = handlers.findIndex(h => h.id == row);
        if (index < 0) { continue; }
        lastIndex = Math.max(lastIndex, index);
        entries.push(handlers[index].refs);
    }
    let allRefs = [].concat.apply([], entries);
    let checked = allRefs.every(ref => globalData.readStorage(checkboxKey(placedName, ref)) == "true");
    for (let ref of allRefs)
    {
        globalData.writeStorage(checkboxKey(placedName, ref), checked ? "false" : "true");
    }
    // After ticking, move on to the row below the last highlighted one (found again by its
    // designators, so this also works when placed rows are hidden).
    let next = checked ? null : handlers[lastIndex + 1];
    if (next)
    {
        globalData.setHighlightedRefs(next.refs.slice());
    }
    RefreshKeepingHighlight();
    let current = globalData.getCurrentHighlightedRowId();
    if (current.length)
    {
        let el = document.getElementById(current[0]);
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" }); }
    }
}

module.exports = {
    TogglePlacedOnHighlightedRow,
    setBomCheckboxes, populateBomTable,
    setRemoveBOMEntries, clearBOMTable, Filter, FilterByAttribute
};
