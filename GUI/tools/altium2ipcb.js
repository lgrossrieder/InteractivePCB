#!/usr/bin/env node
/*
    Altium export folder -> iPCB data, from the command line.

        node tools/altium2ipcb.js <export folder> [-o pcbdata.json] [--html board.html] [--name NAME]

    <export folder>   the OutJob output folder (holding ODB/, BOM/, Pick Place/, Test Points/ ...),
                      or an ODB++ .tgz/.zip directly
    -o FILE           write pcbdata.json (loaded by iPCB.html from the same folder)
    --html FILE       write one self-contained HTML file: viewer and board data together
                      (needs the viewer built first: make -C GUI release)
    --name NAME       project name shown in the title (default: folder name)

    The same importer runs in the browser ("Open Altium folder" in iPCB.html); this tool is for
    producing a file to hand to someone else or to archive with a release.
*/
"use strict";

const fs   = require("fs");
const path = require("path");
const { loadAltiumExport } = require("../src/altium/folder.js");

function usage(msg)
{
    if (msg) { console.error("error: " + msg); }
    console.error("usage: altium2ipcb.js <export folder|odb archive> [-o pcbdata.json] [--html board.html] [--name NAME]");
    process.exit(2);
}

function listFolder(root)
{
    let entries = [];
    (function walk(dir)
    {
        for (let e of fs.readdirSync(dir, { withFileTypes: true }))
        {
            let full = path.join(dir, e.name);
            if (e.isDirectory()) { walk(full); continue; }
            if (!e.isFile()) { continue; }
            let size = fs.statSync(full).size;
            entries.push({
                path: path.relative(root, full).split(path.sep).join("/"),
                size: size,
                read: async () => new Uint8Array(fs.readFileSync(full)),
            });
        }
    })(root);
    return entries;
}

function standaloneHtml(pcbdata)
{
    let viewer = path.join(__dirname, "..", "Release", "iPCB.html");
    if (!fs.existsSync(viewer)) { throw new Error(viewer + " not found; build it with: make -C GUI release"); }
    let html = fs.readFileSync(viewer, "utf8");
    // "</script" must not appear inside the inline script; U+2028/2029 are not valid in older JS strings
    let json = JSON.stringify(pcbdata).replace(/<\//g, "<\\/")
        .replace(/[\u2028\u2029]/g, (c) => "\\u" + c.charCodeAt(0).toString(16));
    let tag = /<script\b[^>]*\bsrc=["']pcbdata\.json["'][^>]*>\s*<\/script>/;
    if (!tag.test(html)) { throw new Error("viewer has no pcbdata.json script tag to replace"); }
    return html.replace(tag, () => "<script>var pcbdata = " + json + ";</script>");
}

async function main()
{
    let args = process.argv.slice(2);
    let input = null, out = null, html = null, name = null;
    for (let i = 0; i < args.length; i++)
    {
        let a = args[i];
        if (a === "-o" || a === "--out") { out = args[++i]; }
        else if (a === "--html") { html = args[++i]; }
        else if (a === "--name") { name = args[++i]; }
        else if (a === "-h" || a === "--help") { usage(); }
        else if (!input) { input = a; }
        else { usage("unexpected argument " + a); }
    }
    if (!input) { usage("no export folder given"); }
    if (!out && !html) { out = "pcbdata.json"; }

    let stat = fs.statSync(input);
    let entries, projectName;
    if (stat.isDirectory())
    {
        entries = listFolder(input);
        projectName = name || path.basename(path.resolve(input));
    }
    else
    {
        let bytes = new Uint8Array(fs.readFileSync(input));
        entries = [{ path: path.basename(input), size: bytes.length, read: async () => bytes }];
        projectName = name || path.basename(input).replace(/(_?ODB\+\+.*)?\.(tgz|tar\.gz|zip|tar)$/i, "");
    }

    let r = await loadAltiumExport(entries, { projectName: projectName });
    for (let m of r.log) { console.log(m); }
    for (let w of r.warnings) { console.warn("warning: " + w); }

    let d = r.pcbdata;
    console.log(d.metadata.project_name + " rev " + (d.metadata.revision || "?") + ": " +
        d.metadata.number_parts.top + " top / " + d.metadata.number_parts.bottom + " bottom parts, " +
        d.parts.filter(p => p.dnp).length + " DNP, " + d.test_points.length + " test points");

    if (out)
    {
        fs.writeFileSync(out, "var pcbdata = " + JSON.stringify(d) + ";\n");
        console.log("wrote " + out);
    }
    if (html)
    {
        fs.writeFileSync(html, standaloneHtml(d));
        console.log("wrote " + html);
    }
}

main().catch(function (e)
{
    console.error("error: " + e.message);
    process.exit(1);
});
