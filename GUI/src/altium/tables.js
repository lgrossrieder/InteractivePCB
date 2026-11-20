/*
    Readers for the tabular Altium outputs: BOM (.xlsx or .csv), pick and place (.csv or .txt)
    and test point reports (.csv). Altium writes these in the Windows code page, so text is
    decoded as UTF-8 when valid and as windows-1252 otherwise.
*/
"use strict";

var archive = require("./archive.js");

function decodeText(bytes)
{
    // UTF-8 byte order mark
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    {
        return new TextDecoder("utf-8").decode(bytes.subarray(3));
    }
    // UTF-16 LE byte order mark
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe)
    {
        return new TextDecoder("utf-16le").decode(bytes.subarray(2));
    }
    try
    {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }
    catch (e)
    {
        return new TextDecoder("windows-1252").decode(bytes);
    }
}

/*
    CSV with quotes; the separator is guessed from the line with the most fields.

    Altium quotes every field but does not escape quotes inside them (a description such as
    'Barrier Block 0.374" (9.50mm)' breaks a standard parser). When the header row is fully
    quoted, each line is therefore split on '","' on its own.
*/
function parseCsv(text)
{
    let lines = text.split(/\r?\n/);
    let headerLine = lines.find(l => /^\s*"[^"]*"(,"[^"]*")+\s*$/.test(l) && /designator|name|net/i.test(l));
    if (headerLine)
    {
        return lines.map(function (l)
        {
            let t = l.trim();
            if (/^".*"$/.test(t) && t.indexOf("\",\"") > 0)
            {
                return t.slice(1, -1).split("\",\"").map(c => c.trim());
            }
            return [t];
        });
    }
    let sample = text.split(/\r?\n/).slice(0, 40);
    let best = ",", bestCount = -1;
    for (let sep of [",", ";", "\t"])
    {
        let count = Math.max.apply(null, sample.map(l => l.split(sep).length));
        if (count > bestCount) { best = sep; bestCount = count; }
    }
    let rows = [];
    let row = [], field = "", quoted = false;
    for (let i = 0; i < text.length; i++)
    {
        let ch = text[i];
        if (quoted)
        {
            if (ch === "\"")
            {
                if (text[i + 1] === "\"") { field += "\""; i++; }
                else { quoted = false; }
            }
            else { field += ch; }
        }
        else if (ch === "\"") { quoted = true; }
        else if (ch === best) { row.push(field); field = ""; }
        else if (ch === "\n" || ch === "\r")
        {
            if (ch === "\r" && text[i + 1] === "\n") { i++; }
            row.push(field); rows.push(row); row = []; field = "";
        }
        else { field += ch; }
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows.map(r => r.map(c => c.trim()));
}

/*
    Fixed-width text tables (Altium .txt pick and place): columns start where the header words
    start. Quoted fields are kept whole.
*/
function parseFixedWidth(lines, headerIndex)
{
    let header = lines[headerIndex];
    let starts = [];
    let re = /\S+/g, m;
    while ((m = re.exec(header))) { starts.push(m.index); }
    let rows = [];
    for (let i = headerIndex; i < lines.length; i++)
    {
        let l = lines[i];
        if (!l.trim()) { continue; }
        let row = [];
        for (let j = 0; j < starts.length; j++)
        {
            row.push(l.slice(starts[j], j + 1 < starts.length ? starts[j + 1] : undefined).trim().replace(/^"|"$/g, ""));
        }
        rows.push(row);
    }
    return rows;
}

function xmlUnescape(s)
{
    return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (a, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&#x([0-9a-f]+);/gi, (a, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&amp;/g, "&");
}

function columnIndex(ref)
{
    let letters = ref.match(/^[A-Z]+/)[0];
    let n = 0;
    for (let ch of letters) { n = n * 26 + (ch.charCodeAt(0) - 64); }
    return n - 1;
}

/* First worksheet of an .xlsx file as rows of strings. */
async function readXlsx(bytes)
{
    let entries = archive.readZip(bytes);
    let byName = new Map(entries.map(e => [e.path.toLowerCase(), e]));
    let text = async (p) => (byName.has(p) ? new TextDecoder("utf-8").decode(await byName.get(p).read()) : "");

    let shared = [];
    let sst = await text("xl/sharedstrings.xml");
    let siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g, m;
    while ((m = siRe.exec(sst)))
    {
        let s = "";
        let tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g, t;
        while ((t = tRe.exec(m[1]))) { s += t[1]; }
        shared.push(xmlUnescape(s));
    }

    // First sheet in workbook order.
    let sheetPath = "xl/worksheets/sheet1.xml";
    let wb = await text("xl/workbook.xml");
    let rels = await text("xl/_rels/workbook.xml.rels");
    let first = wb.match(/<sheet\b[^>]*r:id="([^"]+)"/);
    if (first)
    {
        let rel = rels.match(new RegExp("<Relationship\\b[^>]*Id=\"" + first[1] + "\"[^>]*>"));
        let target = rel && rel[0].match(/Target="([^"]+)"/);
        if (target) { sheetPath = ("xl/" + target[1].replace(/^\/?xl\//, "")).toLowerCase(); }
    }
    let sheet = await text(sheetPath);
    let rows = [];
    let rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g, r;
    while ((r = rowRe.exec(sheet)))
    {
        let row = [];
        let cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, c;
        while ((c = cRe.exec(r[1])))
        {
            let attrs = c[1], body = c[2] || "";
            let ref = attrs.match(/\br="([A-Z]+)\d+"/);
            let type = (attrs.match(/\bt="(\w+)"/) || [])[1];
            let v;
            if (type === "inlineStr")
            {
                v = "";
                let tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g, t;
                while ((t = tRe.exec(body))) { v += t[1]; }
                v = xmlUnescape(v);
            }
            else
            {
                let vm = body.match(/<v>([\s\S]*?)<\/v>/);
                v = vm ? xmlUnescape(vm[1]) : "";
                if (type === "s" && v !== "") { v = shared[parseInt(v, 10)] || ""; }
            }
            let idx = ref ? columnIndex(ref[1]) : row.length;
            while (row.length < idx) { row.push(""); }
            row[idx] = String(v).trim();
        }
        rows.push(row);
    }
    return rows;
}

/*
    Splits rows into the key/value block above the table and the table itself. The header row
    is the first row holding one of the given column names.
*/
function findTable(rows, headerNames)
{
    let wanted = headerNames.map(h => h.toLowerCase());
    let headerIndex = rows.findIndex(r => r.some(c => wanted.indexOf(String(c).toLowerCase()) >= 0));
    if (headerIndex < 0) { return null; }
    let header = rows[headerIndex].map(c => String(c || "").trim());
    let info = {};
    for (let i = 0; i < headerIndex; i++)
    {
        let cells = rows[i].filter(c => c !== "" && c !== undefined);
        if (cells.length >= 2) { info[cells[0].replace(/:$/, "")] = cells[1]; }
        else if (cells.length === 1)
        {
            let m = cells[0].match(/^([^:]+):\s*(.+)$/);
            if (m) { info[m[1].trim()] = m[2].trim(); }
        }
    }
    let records = [];
    for (let i = headerIndex + 1; i < rows.length; i++)
    {
        let r = rows[i];
        if (!r.some(c => c !== "" && c !== undefined)) { continue; }
        let rec = {};
        header.forEach((h, j) => { if (h) { rec[h] = r[j] === undefined ? "" : String(r[j]).trim(); } });
        records.push(rec);
    }
    return { header: header, info: info, records: records };
}

function pick(rec, names)
{
    for (let n of names)
    {
        for (let key of Object.keys(rec))
        {
            if (key.toLowerCase() === n.toLowerCase() && rec[key] !== "") { return rec[key]; }
        }
    }
    return "";
}

function splitDesignators(s)
{
    return String(s || "").split(/[,;\s]+/).map(x => x.trim()).filter(x => x);
}

/* BOM rows to one record per designator. */
async function readBom(name, bytes)
{
    let rows;
    if (/\.xlsx$/i.test(name)) { rows = await readXlsx(bytes); }
    else { rows = parseCsv(decodeText(bytes)); }
    let table = findTable(rows, ["Designator", "Designators", "RefDes", "Reference"]);
    if (!table) { return null; }
    let byRef = new Map();
    for (let rec of table.records)
    {
        let refs = splitDesignators(pick(rec, ["Designator", "Designators", "RefDes", "Reference"]));
        if (!refs.length) { continue; }
        let fitted = pick(rec, ["Fitted", "Populate", "DNP"]);
        let entry = {
            line: pick(rec, ["Line #", "Line", "#", "Item"]),
            mpn: pick(rec, ["Manufacturer Part Number 1", "Manufacturer Part Number", "MPN", "Part Number", "Comment"]),
            comment: pick(rec, ["Comment", "Value"]),
            description: pick(rec, ["Description"]),
            manufacturer: pick(rec, ["Manufacturer 1", "Manufacturer"]),
            footprint: pick(rec, ["Footprint", "Package"]),
            supplier: pick(rec, ["Supplier 1", "Supplier"]),
            supplierPn: pick(rec, ["Supplier Part Number 1", "Supplier Part Number"]),
            dnp: /not\s*fitted|^dnp$|^dnf$|^no$|do not/i.test(fitted),
        };
        for (let r of refs) { byRef.set(r, entry); }
    }
    return { info: table.info, byRef: byRef };
}

/* Pick and place (.csv or fixed width .txt) to records. */
function readPickPlace(name, bytes)
{
    let text = decodeText(bytes);
    let lines = text.split(/\r?\n/);
    let info = {};
    for (let l of lines.slice(0, 30))
    {
        let m = l.match(/^\s*([A-Za-z ]+):\s+(.+?)\s*$/);
        if (m) { info[m[1].trim()] = m[2]; }
    }
    let rows;
    let headerIndex = lines.findIndex(l => /^\s*"?Designator"?[\s,;]/.test(l));
    if (headerIndex < 0) { return null; }
    if (/\.csv$/i.test(name) || /","/.test(lines[headerIndex]))
    {
        rows = parseCsv(lines.slice(headerIndex).join("\n"));
    }
    else
    {
        rows = parseFixedWidth(lines, headerIndex);
    }
    let table = findTable(rows, ["Designator"]);
    if (!table) { return null; }
    let mm = !/mil/i.test(info["Units used"] || "") ;
    let num = (s) => parseFloat(String(s).replace(/mm|mil/gi, ""));
    let k = mm ? 1 : 0.0254;
    let parts = [];
    for (let rec of table.records)
    {
        let x = pick(rec, ["Center-X(mm)", "Center-X(mil)", "Mid X", "Ref X", "X"]);
        let y = pick(rec, ["Center-Y(mm)", "Center-Y(mil)", "Mid Y", "Ref Y", "Y"]);
        let ref = pick(rec, ["Designator"]);
        if (!ref || x === "" || y === "") { continue; }
        let unitK = /mil\)$/i.test(Object.keys(rec).find(h => /^Center-X/i.test(h)) || "") ? 0.0254 : k;
        parts.push({
            ref: ref,
            comment: pick(rec, ["Comment"]),
            layer: pick(rec, ["Layer"]),
            footprint: pick(rec, ["Footprint"]),
            x: num(x) * unitK,
            y: num(y) * unitK,
            rot: num(pick(rec, ["Rotation"])) || 0,
            description: pick(rec, ["Description"]),
        });
    }
    return { info: info, parts: parts };
}

/* Altium test point report: Net, Name (TP1-1), X, Y, Side. */
function readTestPoints(name, bytes)
{
    let rows = parseCsv(decodeText(bytes));
    let table = findTable(rows, ["Net", "Name"]);
    if (!table || table.header.indexOf("Name") < 0) { return null; }
    return table.records.map(rec => ({
        name: pick(rec, ["Name"]).replace(/-\d+$/, ""),
        pad: pick(rec, ["Name"]),
        net: pick(rec, ["Net"]),
        side: pick(rec, ["Side"]),
        x: parseFloat(pick(rec, ["X Coord", "X"])),
        y: parseFloat(pick(rec, ["Y Coord", "Y"])),
    }));
}

module.exports = {
    decodeText, parseCsv, readXlsx, findTable, readBom, readPickPlace, readTestPoints, splitDesignators
};
