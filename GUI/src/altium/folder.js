/*
    Altium export folder (the OutJob "Project Outputs" folder) to iPCB pcbdata.

    The folder is scanned for:
        ODB++         extracted (…/odb/matrix/matrix) or as .tgz / .zip     board, layers, parts, pads
        BOM           *.xlsx or *.csv under a "BOM" folder or named *BOM*   descriptions, MPN, fitted
        Pick Place    *pick*place*.csv|txt                                   fallback when there is no ODB++
        Test Points   *TP*.csv (Altium test point report)                    test point table

    Input: entries { path, size, read: async () => Uint8Array } with paths relative to the
    selected folder ("Board_1_A/BOM/…" from a browser folder pick, or relative to the
    folder on the command line). Works unchanged in the browser and in Node.
*/
"use strict";

var archive = require("./archive.js");
var tables  = require("./tables.js");
var odb     = require("./odb.js");

function basename(p) { return p.split("/").pop(); }

/* Files of the ODB++ product under root, as lower case relative path -> text. */
async function loadOdbFiles(entries, root)
{
    let files = new Map();
    let rootLower = root.toLowerCase();
    let wanted = /^(matrix\/matrix|misc\/info|steps\/[^/]+\/(profile|stephdr|eda\/data|layers\/[^/]+\/(features|components|tools))|symbols\/[^/]+\/features)$/;
    await Promise.all(entries.map(async function (e)
    {
        let p = e.path.toLowerCase();
        if (!p.startsWith(rootLower)) { return; }
        let rel = p.slice(rootLower.length);
        if (!wanted.test(rel)) { return; }
        files.set(rel, tables.decodeText(await e.read()));
    }));
    return files;
}

function odbRoots(entries)
{
    return entries
        .map(e => e.path.match(/^(.*?)matrix\/matrix$/i))
        .filter(m => m)
        .map(m => m[1])
        .sort((a, b) => a.length - b.length);
}

/* Finds the ODB++ product: extracted folder first, then archives (names with "odb" first). */
async function findOdb(entries, log, nested)
{
    let roots = odbRoots(entries);
    if (roots.length)
    {
        log("ODB++ folder " + (roots[0] || "./"));
        return { files: await loadOdbFiles(entries, roots[0]), source: roots[0] || "./" };
    }
    let archives = entries.filter(e => archive.isArchive(e.path));
    archives.sort((a, b) => (/odb/i.test(basename(b.path)) - /odb/i.test(basename(a.path))) || (a.size - b.size));
    for (let a of archives)
    {
        let inner;
        try
        {
            inner = await archive.readArchive(a.path, await a.read());
        }
        catch (err)
        {
            log("skipped " + a.path + ": " + err.message);
            continue;
        }
        let r = odbRoots(inner);
        if (r.length)
        {
            log("ODB++ archive " + a.path);
            return { files: await loadOdbFiles(inner, r[0]), source: a.path };
        }
        // One level of nesting: a .zip holding the ODB++ .tgz (as handed out by board vendors)
        if (!nested)
        {
            let found = await findOdb(inner.map(e => Object.assign({}, e, { path: a.path + "/" + e.path })), log, true);
            if (found) { return found; }
        }
    }
    return null;
}

function firstMatch(entries, re, notRe)
{
    let found = entries.filter(e => re.test(e.path) && !(notRe && notRe.test(e.path)));
    found.sort((a, b) => a.path.length - b.path.length);
    return found[0];
}

function commonRoot(entries)
{
    if (!entries.length) { return ""; }
    let first = entries[0].path.split("/");
    if (first.length < 2) { return ""; }
    let root = first[0];
    return entries.every(e => e.path.startsWith(root + "/")) ? root : "";
}

/* Parts from pick and place only: no pads, a small box around each centroid. */
function partsFromPickPlace(pnp)
{
    return pnp.parts.map(function (p)
    {
        let bottom = /bottom|^b/i.test(p.layer);
        return {
            name: p.ref,
            value: p.comment,
            package: {
                pads: [],
                bounding_box: { x0: p.x - 0.75, y0: p.y - 0.75, x1: p.x + 0.75, y1: p.y + 0.75, angle: 0 },
            },
            attributes: [
                { name: "Footprint", value: p.footprint },
                { name: "Rotation", value: String(p.rot) },
                { name: "X", value: p.x.toFixed(3) },
                { name: "Y", value: p.y.toFixed(3) },
                { name: "Description", value: p.description },
            ],
            location: bottom ? "B" : "F",
            dnp: 0,
        };
    });
}

function setAttribute(part, name, value)
{
    if (value === undefined || value === null || value === "") { return; }
    let a = part.attributes.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (a) { a.value = value; }
    else { part.attributes.push({ name: name, value: value }); }
}

/*
    Main entry. Returns { pcbdata, warnings, log }.
*/
async function loadAltiumExport(entries, options)
{
    options = options || {};
    let messages = [];
    let log = (m) => { messages.push(m); if (options.onProgress) { options.onProgress(m); } };
    let warnings = [];

    entries = entries.map(e => Object.assign({}, e, { path: e.path.replace(/\\/g, "/").replace(/^\.\//, "") }));
    let root = commonRoot(entries);
    let projectName = options.projectName || root || "";

    // ODB++
    let pcbdata;
    let found = await findOdb(entries, log);
    if (found)
    {
        let r = odb.convert(found.files, { projectName: projectName });
        pcbdata = r.pcbdata;
        warnings = warnings.concat(r.warnings);
        log(r.components + " components, " + pcbdata.board.layers.length + " layers");
    }

    // Pick and place
    let pnpEntry = firstMatch(entries, /pick[\s_-]*(and[\s_-]*)?place[^/]*\.(csv|txt)$/i)
        || firstMatch(entries, /(^|\/)pick[\s_-]*place\/[^/]+\.(csv|txt)$/i);
    let pnp = null;
    if (pnpEntry)
    {
        pnp = tables.readPickPlace(pnpEntry.path, await pnpEntry.read());
        if (pnp) { log("pick and place " + pnpEntry.path + ": " + pnp.parts.length + " parts"); }
    }

    if (!pcbdata)
    {
        if (!pnp || !pnp.parts.length)
        {
            throw new Error("No ODB++ output and no pick and place file found in the folder. " +
                "Add an ODB++ output (and a BOM) to the OutJob and generate it.");
        }
        warnings.push("No ODB++ found: parts are shown as boxes at their pick and place centroids, without pads, " +
            "copper or silkscreen. Add the ODB++ output to the OutJob for the full board.");
        let parts = partsFromPickPlace(pnp);
        let b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
        for (let p of parts)
        {
            let bb = p.package.bounding_box;
            b.x0 = Math.min(b.x0, bb.x0); b.y0 = Math.min(b.y0, bb.y0);
            b.x1 = Math.max(b.x1, bb.x1); b.y1 = Math.max(b.y1, bb.y1);
        }
        let m = 3;
        let outline = [b.x0 - m, b.y0 - m, b.x1 + m, b.y0 - m, b.x1 + m, b.y1 + m, b.x0 - m, b.y1 + m];
        pcbdata = {
            metadata: {
                protocol_version: 2, ecad: "Altium", company: "", project_name: projectName, revision: "", date: "",
                number_parts: { top: parts.filter(p => p.location === "F").length, bottom: parts.filter(p => p.location === "B").length },
            },
            board: {
                bounding_box: { x0: b.x0 - m, y0: b.y0 - m, x1: b.x1 + m, y1: b.y1 + m },
                traces: [],
                layers: [{ name: "Board", side: "both", visible_front: true, visible_back: true,
                    paths: [{ type: "polygon", layer: "Board", contours: [outline] }] }],
            },
            parts: parts,
            test_points: [],
            configuration: [{ category: "color", name: "Board", value: "#1E3D26" }],
        };
    }
    else if (pnp)
    {
        // Cross-check: every placed ODB++ part should be in the pick and place file.
        let pnpRefs = new Set(pnp.parts.map(p => p.ref));
        let missing = pcbdata.parts.filter(p => !pnpRefs.has(p.name)).map(p => p.name);
        if (missing.length && missing.length < pcbdata.parts.length)
        {
            log(missing.length + " parts not in pick and place (DNP or not placed): " + missing.slice(0, 10).join(", ") + (missing.length > 10 ? ", …" : ""));
        }
    }
    if (pnp && pnp.info)
    {
        if (!pcbdata.metadata.date && pnp.info.Date) { pcbdata.metadata.date = pnp.info.Date + (pnp.info.Time ? " " + pnp.info.Time : ""); }
        if (pnp.info.Variant) { pcbdata.metadata.variant = pnp.info.Variant; }
        if (pnp.info.Revision) { pcbdata.metadata.vcs_revision = pnp.info.Revision; }
    }

    // BOM
    let bomEntry = firstMatch(entries, /(^|\/)bom\/[^/]+\.(xlsx|csv)$/i, /~\$/)
        || firstMatch(entries, /bom[^/]*\.(xlsx|csv)$/i, /~\$/);
    let bom = null;
    if (bomEntry)
    {
        try
        {
            bom = await tables.readBom(bomEntry.path, await bomEntry.read());
        }
        catch (err)
        {
            warnings.push("BOM " + bomEntry.path + " could not be read: " + err.message);
        }
        if (bom) { log("BOM " + bomEntry.path + ": " + bom.byRef.size + " designators"); }
        else if (!warnings.some(w => w.startsWith("BOM "))) { warnings.push("BOM " + bomEntry.path + ": no Designator column found"); }
    }
    else if (entries.some(e => /bom[^/]*\.xls$/i.test(e.path)))
    {
        warnings.push("Only an .xls BOM was found; export the BOM as .xlsx or .csv to get descriptions and fitted state.");
    }
    if (bom)
    {
        let notInBom = [];
        for (let p of pcbdata.parts)
        {
            let e = bom.byRef.get(p.name);
            if (!e)
            {
                p.in_bom = 0;
                notInBom.push(p.name);
                continue;
            }
            p.in_bom = 1;
            if (e.mpn) { p.value = e.mpn; }
            setAttribute(p, "Description", e.description);
            setAttribute(p, "Manufacturer", e.manufacturer);
            setAttribute(p, "Comment", e.comment);
            setAttribute(p, "Supplier", e.supplier);
            setAttribute(p, "Supplier Part Number", e.supplierPn);
            setAttribute(p, "BOM Line", e.line);
            if (e.dnp) { p.dnp = 1; }
        }
        if (notInBom.length)
        {
            log(notInBom.length + " parts are not in the BOM (not listed for assembly): " + notInBom.slice(0, 12).join(", ") + (notInBom.length > 12 ? ", …" : ""));
        }
        let info = bom.info || {};
        let rev = [];
        if (info["PCB Revision"]) { rev.push(info["PCB Revision"]); }
        if (info["SCH Revision"]) { rev.push("SCH " + info["SCH Revision"]); }
        if (rev.length) { pcbdata.metadata.revision = rev.join(", "); }
        if (info.Company) { pcbdata.metadata.company = info.Company; }
        if (info.Variant && !pcbdata.metadata.variant) { pcbdata.metadata.variant = info.Variant; }
    }
    else
    {
        warnings.push("No BOM found: the BOM table groups parts by the ODB++ part name only.");
    }
    if (!pcbdata.metadata.revision && pcbdata.metadata.vcs_revision)
    {
        pcbdata.metadata.revision = pcbdata.metadata.vcs_revision.slice(0, 10);
    }

    // DNP parts: drawn, but not listed for assembly.
    let dnp = pcbdata.parts.filter(p => p.dnp).map(p => p.name);
    if (dnp.length) { log(dnp.length + " parts not fitted: " + dnp.slice(0, 12).join(", ") + (dnp.length > 12 ? ", …" : "")); }

    // Test points
    let tpEntry = firstMatch(entries, /(^|[_\s/])tps?\.csv$/i) || firstMatch(entries, /test[\s_-]*points?\/[^/]*tp[^/]*\.csv$/i);
    if (tpEntry)
    {
        let tps = tables.readTestPoints(tpEntry.path, await tpEntry.read());
        if (tps && tps.length)
        {
            pcbdata.test_points = tps.map(t => ({
                name: t.name, description: t.net, expected: "", side: /bot/i.test(t.side) ? "B" : "F", x: t.x, y: t.y,
            }));
            log("test points " + tpEntry.path + ": " + tps.length);
        }
    }

    // Viewer defaults for assembly: grouped by part number, a "Placed" checkbox per row.
    pcbdata.configuration = pcbdata.configuration.concat([
        { category: "setting", name: "combine_values", value: 1 },
        { category: "setting", name: "bom_checkboxes", value: "Placed" },
        { category: "setting", name: "bom_part_attributes", value: "Description,Footprint" },
    ]);
    pcbdata.metadata.project_name = pcbdata.metadata.project_name || projectName;
    pcbdata.metadata.source_files = {
        odb: found ? found.source : "",
        bom: bomEntry ? bomEntry.path : "",
        pick_place: pnpEntry ? pnpEntry.path : "",
        test_points: tpEntry ? tpEntry.path : "",
    };
    return { pcbdata: pcbdata, warnings: warnings, log: messages };
}

module.exports = {
    loadAltiumExport
};
