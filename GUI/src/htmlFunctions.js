var globalData = require("./global.js");
var render     = require("./render.js");
var ipcb       = require("./ipcb.js");
var pcb        = require("./pcb.js");
var layerTable = require("./layer_table.js")
var bomTable   = require("./bom_table.js")

const boardRotation = document.getElementById("boardRotation");
boardRotation.oninput=function()
{
    render.SetBoardRotation(boardRotation.value);
};

const darkModeBox = document.getElementById("darkmodeCheckbox");
darkModeBox.onchange = function ()
{
    ipcb.setDarkMode(darkModeBox.checked);
};

const highlightpin1Checkbox =document.getElementById("highlightpin1Checkbox");
highlightpin1Checkbox.onchange=function()
{
    globalData.setHighlightPin1(highlightpin1Checkbox.checked);
    globalData.writeStorage("highlightpin1", highlightpin1Checkbox.checked);
    render.RenderPCB(globalData.GetAllCanvas().front);
    render.RenderPCB(globalData.GetAllCanvas().back);
};

const dimUnselectedCheckbox = document.getElementById("dimUnselectedCheckbox");
dimUnselectedCheckbox.onchange = function()
{
    globalData.setDimUnselected(dimUnselectedCheckbox.checked);
    globalData.writeStorage("dimUnselected", dimUnselectedCheckbox.checked);
    render.drawHighlights();
};

const dragCheckbox = document.getElementById("dragCheckbox");
dragCheckbox.checked=function()
{
    globalData.setRedrawOnDrag(dragCheckbox.checked);
};
dragCheckbox.onchange=function()
{
    globalData.setRedrawOnDrag(dragCheckbox.checked);
    globalData.writeStorage("redrawOnDrag", dragCheckbox.checked);
};


const combineValues = document.getElementById("combineValues");
combineValues.onchange=function()
{
    globalData.setCombineValues(combineValues.checked);
    globalData.writeStorage("combineValues", combineValues.checked);
    bomTable.populateBomTable();
};


const hidePlacedParts = document.getElementById("hidePlacedParts");
hidePlacedParts.onchange=function()
{
    globalData.setHidePlacedParts(hidePlacedParts.checked);
    globalData.writeStorage("hidePlacedParts", hidePlacedParts.checked);
    bomTable.populateBomTable();
};

const debugModeBox = document.getElementById("debugMode");
debugModeBox.onchange=function()
{
    globalData.setDebugMode(debugModeBox.checked);
    globalData.writeStorage("debugMode", debugModeBox.checked);
    render.RenderPCB(globalData.GetAllCanvas().front);
    render.RenderPCB(globalData.GetAllCanvas().back);
};



/* BOM Table FIlter */
const filterBOM = document.getElementById("bom-filter");
filterBOM.oninput=function()
{
    bomTable.Filter(filterBOM.value);
};

const clearFilterBOM = document.getElementById("clearBOMSearch");
clearFilterBOM.onclick=function()
{
    filterBOM.value="";
    bomTable.Filter(filterBOM.value);
};

const removeBOMEntries = document.getElementById("removeBOMEntries");
removeBOMEntries.oninput=function()
{
    bomTable.FilterByAttribute(removeBOMEntries.value);
};


/* Layer Table Filter */
const filterLayer = document.getElementById("layer-filter");
filterLayer.oninput=function()
{
    layerTable.Filter(filterLayer.value);
};

const clearFilterLayer = document.getElementById("clearLayerSearch");
clearFilterLayer.onclick=function()
{
    filterLayer.value="";
    layerTable.Filter(filterLayer.value);
};





const bomCheckboxes = document.getElementById("bomCheckboxes");
bomCheckboxes.oninput=function()
{
    bomTable.setBomCheckboxes(bomCheckboxes.value);
};

const additionalAttributes = document.getElementById("additionalAttributes");
additionalAttributes.oninput=function()
{
    ipcb.setAdditionalAttributes(additionalAttributes.value);
};

const fl_btn = document.getElementById("fl-btn");
fl_btn.onclick=function()
{
    ipcb.changeCanvasLayout("F");
};

const fb_btn = document.getElementById("fb-btn");
fb_btn.onclick=function()
{
    ipcb.changeCanvasLayout("FB");
};

const fullscreen_btn = document.getElementById("fullscreen-btn");
fullscreen_btn.onclick=function()
{
    ipcb.toggleFullScreen();
};

const bl_btn = document.getElementById("bl-btn");
bl_btn.onclick=function()
{
    ipcb.changeCanvasLayout("B");
};

const bom_btn = document.getElementById("bom-btn");
bom_btn.onclick=function()
{
    ipcb.changeBomLayout("BOM");
};

const lr_btn = document.getElementById("bom-lr-btn");
lr_btn.onclick=function()
{
    ipcb.changeBomLayout("LR");
};

const tb_btn = document.getElementById("bom-tb-btn");
tb_btn.onclick=function()
{
    ipcb.changeBomLayout("TB");
};

const pcb_btn = document.getElementById("pcb-btn");
pcb_btn.onclick=function()
{
    ipcb.changeBomLayout("PCB");
};

const lay_btn = document.getElementById("lay-btn");
lay_btn.onclick=function()
{
    ipcb.LayerTable_Toggle();
    ipcb.TestPointTable_Off();
    ipcb.TraceTable_Off();
    ipcb.Render_RightScreenTable();
};

const trace_btn = document.getElementById("trace-btn");
trace_btn.onclick=function()
{
    ipcb.LayerTable_Off();
    ipcb.TraceTable_Toggle();
    ipcb.TestPointTable_Off();
    ipcb.Render_RightScreenTable();
};

const testpoint_btn = document.getElementById("testpoint-btn");
testpoint_btn.onclick=function()
{
    ipcb.LayerTable_Off();
    ipcb.TraceTable_Off();
    ipcb.TestPointTable_Toggle();
    ipcb.Render_RightScreenTable();
};

/***************************************************************************************************
                         Loading a board: Altium export folder, ODB++ archive or pcbdata.json
***************************************************************************************************/
var altium = require("./altium/folder.js");

function setLoadStatus(text)
{
    document.getElementById("loadStatus").textContent = text || "";
}

function showLoadMessages(warnings, log)
{
    let box     = document.getElementById("loadMessages");
    let list    = document.getElementById("loadMessagesList");
    let summary = document.getElementById("loadMessagesSummary");
    while (list.firstChild) { list.removeChild(list.firstChild); }
    for (let w of warnings)
    {
        let li = document.createElement("li");
        li.textContent = "\u26a0 " + w;
        list.appendChild(li);
    }
    for (let m of log)
    {
        let li = document.createElement("li");
        li.textContent = m;
        list.appendChild(li);
    }
    summary.textContent = warnings.length ? (warnings.length + " warning" + (warnings.length > 1 ? "s" : "") + " while importing (details)")
                                          : "Import details";
    box.classList.toggle("has-warnings", warnings.length > 0);
    box.hidden = (warnings.length + log.length) == 0;
    box.open = false;
}

function showBoard(pcbdata)
{
    ipcb.LoadPCB(pcbdata);
    delete document.body.dataset.loadError;
}

function loadFailed(err)
{
    console.error(err);
    setLoadStatus("");
    document.body.dataset.loadError = err.message || String(err);
    alert("Could not load the board:\n\n" + (err.message || err));
}

/* entries: { path, size, read: async () => Uint8Array } */
async function loadEntries(entries, label)
{
    try
    {
        setLoadStatus("Reading " + label + " \u2026");
        // A single pcbdata.json (as written by the Eagle plugin or tools/altium2ipcb.js)
        if (entries.length == 1 && /\.json$/i.test(entries[0].path))
        {
            let text = new TextDecoder("utf-8").decode(await entries[0].read());
            let data = JSON.parse(text.replace(/^\s*var\s+pcbdata\s*=\s*/, "").replace(/;\s*$/, ""));
            showLoadMessages([], []);
            showBoard(data);
            setLoadStatus("");
            return;
        }
        let result = await altium.loadAltiumExport(entries, { onProgress: setLoadStatus });
        showLoadMessages(result.warnings, result.log);
        showBoard(result.pcbdata);
        setLoadStatus("");
    }
    catch (err)
    {
        loadFailed(err);
    }
}

function fileEntries(fileList)
{
    return Array.from(fileList).map(f => ({
        path: f.webkitRelativePath || f.name,
        size: f.size,
        read: async () => new Uint8Array(await f.arrayBuffer()),
    }));
}

for (let id of ["altiumFolderInput", "altiumFolderInputEmpty"])
{
    const folderInput = document.getElementById(id);
    folderInput.onchange = function ()
    {
        if (folderInput.files.length == 0) { return; }
        let entries = fileEntries(folderInput.files);
        let name = entries[0].path.split("/")[0];
        loadEntries(entries, name);
        folderInput.value = "";
    };
}

const load_pcb = document.getElementById("pcbFileInput");
load_pcb.onchange = function ()
{
    if (load_pcb.files.length == 0) { return; }
    let entries = fileEntries(load_pcb.files);
    loadEntries(entries, entries[0].path);
    load_pcb.value = "";
};

/* Drag and drop of a folder (or files) anywhere on the page. */
function readAllDirectoryEntries(reader)
{
    return new Promise(function (resolve, reject)
    {
        let all = [];
        (function next()
        {
            reader.readEntries(function (batch)
            {
                if (batch.length == 0) { resolve(all); return; }
                all = all.concat(Array.from(batch));
                next();
            }, reject);
        })();
    });
}

async function collectDropped(entry, prefix, out)
{
    if (entry.isFile)
    {
        let file = await new Promise((resolve, reject) => entry.file(resolve, reject));
        out.push({ path: prefix + file.name, size: file.size, read: async () => new Uint8Array(await file.arrayBuffer()) });
    }
    else if (entry.isDirectory)
    {
        let children = await readAllDirectoryEntries(entry.createReader());
        for (let child of children)
        {
            await collectDropped(child, prefix + entry.name + "/", out);
        }
    }
}

document.addEventListener("dragover", function (e)
{
    e.preventDefault();
    document.body.classList.add("drag-over");
});
document.addEventListener("dragleave", function (e)
{
    if (e.target === document.documentElement || e.clientX <= 0 || e.clientY <= 0)
    {
        document.body.classList.remove("drag-over");
    }
});
document.addEventListener("drop", async function (e)
{
    e.preventDefault();
    document.body.classList.remove("drag-over");
    let items = Array.from(e.dataTransfer.items || []);
    let roots = items.map(i => i.webkitGetAsEntry ? i.webkitGetAsEntry() : null).filter(x => x);
    let entries = [];
    try
    {
        if (roots.length)
        {
            for (let r of roots) { await collectDropped(r, "", entries); }
        }
        else
        {
            entries = fileEntries(e.dataTransfer.files);
        }
    }
    catch (err)
    {
        loadFailed(err);
        return;
    }
    if (entries.length)
    {
        loadEntries(entries, roots.length == 1 ? roots[0].name : entries.length + " files");
    }
});
