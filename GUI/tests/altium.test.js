/*
    Tests of the Altium export importer (src/altium). Synthetic data only.

        node --test tests/        (or: make test)
*/
"use strict";

const test   = require("node:test");
const assert = require("node:assert/strict");
const zlib   = require("zlib");

const geo     = require("../src/altium/geometry.js");
const archive = require("../src/altium/archive.js");
const tables  = require("../src/altium/tables.js");
const odb     = require("../src/altium/odb.js");
const folder  = require("../src/altium/folder.js");

const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);
const enc = (s) => new TextEncoder().encode(s);

/* ------------------------------------------------------------------------------------------ */

test("transform: clockwise rotation, mirror before rotation", () =>
{
    let f = geo.makeTransform(10, 20, 90, false);
    let p = f(1, 0);
    assert.ok(near(p[0], 10) && near(p[1], 19), "+x rotated 90 deg clockwise points to -y: " + p);
    let m = geo.makeTransform(0, 0, 0, true)(1, 2);
    assert.deepEqual(m.map(Math.round), [-1, 2]);
});

test("arc points follow the requested direction", () =>
{
    // quarter circle from (1,0) to (0,1) around the origin
    let ccw = geo.arcPoints(1, 0, 0, 1, 0, 0, false);
    let cw  = geo.arcPoints(1, 0, 0, 1, 0, 0, true);
    let mid = (pts) => [pts[Math.floor(pts.length / 4) * 2], pts[Math.floor(pts.length / 4) * 2 + 1]];
    assert.ok(mid(ccw)[0] > 0 && mid(ccw)[1] > 0, "counter-clockwise stays in the first quadrant");
    assert.ok(mid(cw)[1] < 0 || mid(cw)[0] < 0, "clockwise goes the long way round");
});

test("standard symbols: sizes in microns for mm jobs", () =>
{
    let r = odb.standardSymbol("r500", 0.001);
    assert.equal(r.t, "circle");
    assert.ok(near(r.r, 0.25));
    let rr = odb.standardSymbol("rect1000x500xr100", 0.001);
    let b = geo.shapeBounds(rr);
    assert.ok(near(b.x1 - b.x0, 1, 1e-9) && near(b.y1 - b.y0, 0.5, 1e-9));
    assert.equal(odb.standardSymbol("no_such_symbol", 0.001), null);
});

/* ------------------------------------------------------------------------------------------ */

test("csv: Altium's unescaped quotes inside quoted fields", () =>
{
    let text = [
        "Altium Designer Pick and Place Locations",
        "Units used: mm",
        "",
        "\"Designator\",\"Comment\",\"Layer\",\"Footprint\",\"Center-X(mm)\",\"Center-Y(mm)\",\"Rotation\",\"Description\"",
        "\"J1\",\"TB2\",\"TopLayer\",\"TB\",\"8.2000\",\"10.5000\",\"90\",\"Barrier Block 0.374\" (9.50mm) Screws\"",
        "\"R1\",\"10k\",\"BottomLayer\",\"0402_R\",\"1.0000\",\"2.0000\",\"0\",\"Resistor\"",
    ].join("\r\n");
    let pnp = tables.readPickPlace("pick_place.csv", enc(text));
    assert.equal(pnp.parts.length, 2);
    assert.equal(pnp.parts[0].description, "Barrier Block 0.374\" (9.50mm) Screws");
    assert.equal(pnp.parts[1].layer, "BottomLayer");
    assert.ok(near(pnp.parts[1].y, 2));
});

test("text decoding falls back to windows-1252", () =>
{
    let bytes = new Uint8Array([0x34, 0x37, 0xb5, 0x46]);   // "47µF" in cp1252
    assert.equal(tables.decodeText(bytes), "47µF");
});

/* ------------------------------------------------------------------------------------------ */

function tarOf(files)
{
    let blocks = [];
    for (let [name, text] of Object.entries(files))
    {
        let data = Buffer.from(text);
        let h = Buffer.alloc(512);
        h.write(name, 0);
        h.write("0000644\0", 100);
        h.write(data.length.toString(8).padStart(11, "0") + "\0", 124);
        h.write("0", 156);
        h.write("ustar\0", 257);
        blocks.push(h, data, Buffer.alloc((512 - data.length % 512) % 512));
    }
    blocks.push(Buffer.alloc(1024));
    return Buffer.concat(blocks);
}

function storedZipOf(files)
{
    let locals = [], centrals = [], offset = 0;
    for (let [name, text] of Object.entries(files))
    {
        let data = Buffer.from(text), n = Buffer.from(name);
        let l = Buffer.alloc(30);
        l.writeUInt32LE(0x04034b50, 0); l.writeUInt32LE(data.length, 18); l.writeUInt32LE(data.length, 22);
        l.writeUInt16LE(n.length, 26);
        let c = Buffer.alloc(46);
        c.writeUInt32LE(0x02014b50, 0); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24);
        c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
        locals.push(l, n, data);
        centrals.push(c, n);
        offset += 30 + n.length + data.length;
    }
    let cd = Buffer.concat(centrals);
    let e = Buffer.alloc(22);
    e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(centrals.length / 2, 8); e.writeUInt16LE(centrals.length / 2, 10);
    e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(offset, 16);
    return Buffer.concat(locals.concat([cd, e]));
}

test("archives: .tgz and stored .zip", async () =>
{
    let tgz = new Uint8Array(zlib.gzipSync(tarOf({ "job/matrix/matrix": "STEP {\nNAME=PCB\n}\n" })));
    let t = await archive.readArchive("x.tgz", tgz);
    assert.equal(t[0].path, "job/matrix/matrix");
    assert.match(new TextDecoder().decode(await t[0].read()), /NAME=PCB/);

    let zip = new Uint8Array(storedZipOf({ "a/b.txt": "hello" }));
    let z = await archive.readArchive("x.zip", zip);
    assert.equal(z[0].path, "a/b.txt");
    assert.equal(new TextDecoder().decode(await z[0].read()), "hello");
});

/* ------------------------------------------------------------------------------------------ */

/*
    A small ODB++ job as Altium writes it: two copper layers, overlay, one 2-pin package placed
    on top (rotation 90) and on the bottom (rotation 90). Pin records (TOP) follow Altium:
    rotate clockwise, then mirror bottom parts in x.
*/
function syntheticOdb()
{
    let pinsLocal = [[-0.5, 0], [0.5, 0]];
    function toeprints(x, y, rot, bottom)
    {
        let a = -rot * Math.PI / 180;
        return pinsLocal.map(([px, py], i) =>
        {
            let rx = px * Math.cos(a) - py * Math.sin(a), ry = px * Math.sin(a) + py * Math.cos(a);
            if (bottom) { rx = -rx; }
            return "TOP " + i + " " + (x + rx).toFixed(5) + " " + (y + ry).toFixed(5) + " " + rot + " N 0 0 " + (i + 1);
        }).join("\n");
    }
    let layer = (row, type, name) => "LAYER {\n ROW=" + row + "\n CONTEXT=BOARD\n TYPE=" + type + "\n NAME=" + name + "\n POLARITY=POSITIVE\n}\n";
    return {
        "matrix/matrix": "STEP {\n COL=1\n NAME=PCB\n}\n" +
            layer(1, "COMPONENT", "COMP_+_TOP") + layer(2, "SILK_SCREEN", "TOP_OVERLAY") + layer(3, "SIGNAL", "TOP_LAYER") +
            layer(4, "SIGNAL", "BOTTOM_LAYER") + layer(5, "COMPONENT", "COMP_+_BOT"),
        "misc/info": "UNITS=MM\nSAVE_DATE=20260101.120000\nSAVE_APP=Altium Designer test\n",
        "steps/pcb/profile": "UNITS=MM\nS P 0\nOB 0 0 I\nOS 0 30\nOS 40 30\nOS 40 0\nOS 0 0\nOE\nSE\n",
        "steps/pcb/layers/top_layer/features": "UNITS=MM\n$0 r200\n$1 rect400x600\nL 1 1 5 1 0 P 0\nP 10 10 1 P 0 0\n" +
            "A 0 5 5 0 0 0 0 P 0 Y\nS P 0\nOB 30 20 I\nOS 30 25\nOS 35 25\nOS 35 20\nOE\nOB 31 21 H\nOS 32 21\nOS 32 22\nOE\nSE\n",
        "steps/pcb/layers/bottom_layer/features": "UNITS=MM\n$0 r200\nL 2 2 6 2 0 P 0\n",
        "steps/pcb/layers/top_overlay/features": "UNITS=MM\n$0 r100\nL 1 28 10 28 0 P 0\n",
        "steps/pcb/eda/data": "UNITS=MM\nPKG 0402 1 -0.75 -0.25 0.75 0.25\nCT\nOB 0.5 -0.25 I\nOS -0.5 -0.25\nOS -0.5 0.25\nOS 0.5 0.25\nOE\nCE\n" +
            "PIN 1 S -0.5 0 0 U U\nRC -0.75 -0.25 0.5 0.5\nPIN 2 S 0.5 0 0 U U\nRC 0.25 -0.25 0.5 0.5\n",
        "steps/pcb/layers/comp_+_top/components": "UNITS=MM\n@0 .comp_mount_type\n@1 .no_pop\n" +
            "CMP 0 10 10 90 N R1 RC0402-10K ;0=1\nPRP Resistance '10k'\n" + toeprints(10, 10, 90, false) + "\n" +
            "CMP 0 15 10 0 N R3 RC0402-10K ;0=1,1\n" + toeprints(15, 10, 0, false) + "\n",
        "steps/pcb/layers/comp_+_bot/components": "UNITS=MM\nCMP 0 20 10 90 N R2 RC0402-10K ;0=1\n" + toeprints(20, 10, 90, true) + "\n",
    };
}

test("odb: pads land on the pin records, top and bottom", () =>
{
    let r = odb.convert(syntheticOdb(), { projectName: "t" });
    assert.equal(r.pinErrors, 0, r.warnings.join("; "));
    let d = r.pcbdata;
    let byName = Object.fromEntries(d.parts.map(p => [p.name, p]));
    assert.equal(byName.R1.location, "F");
    assert.equal(byName.R2.location, "B");
    // top, 90 deg clockwise: pin 1 (local -x) goes to +y
    assert.ok(near(byName.R1.package.pads[0].x, 10, 1e-4) && near(byName.R1.package.pads[0].y, 10.5, 1e-4));
    // bottom: rotated, then mirrored: pin 1 also at +y (mirror in x does not move it)
    assert.ok(near(byName.R2.package.pads[0].y, 10.5, 1e-4));
    assert.equal(byName.R1.package.pads[0].pin1, 1);
    assert.equal(byName.R3.dnp, 1, ".no_pop marks the part not fitted");
    assert.equal(byName.R1.dnp, 0);
    assert.deepEqual(d.board.bounding_box, { x0: 0, y0: 0, x1: 40, y1: 30 });
    assert.equal(d.metadata.date, "2026-01-01 12:00");
});

test("odb: layers, order, shapes", () =>
{
    let d = odb.convert(syntheticOdb()).pcbdata;
    let names = d.board.layers.map(l => l.name);
    assert.deepEqual(names, ["Board", "Bottom Layer", "Top Layer", "Pads", "Top Overlay"]);
    let top = d.board.layers.find(l => l.name == "Top Layer");
    let types = top.paths.map(p => p.type).sort();
    assert.deepEqual(types, ["arc", "line", "polygon", "polygon"]);
    let surface = top.paths.filter(p => p.type == "polygon").find(p => p.contours.length == 2);
    assert.ok(surface, "surface with a hole keeps both contours");
    assert.equal(top.visible_front, true);
    assert.equal(top.visible_back, false);
});

test("folder: ODB++ + BOM + test points", async () =>
{
    let files = syntheticOdb();
    let entries = Object.entries(files).map(([p, t]) => ({ path: "Board_1_A/ODB/odb/" + p, size: t.length, read: async () => enc(t) }));
    let bom = "Line #,Fitted,Quantity,Designator,Manufacturer Part Number 1,Description,Manufacturer 1\n" +
              "1,Fitted,1,R1,RC0402FR-0710KL,10k 1% 0402,Yageo\n" +
              "2,Not Fitted,1,R2,RC0402FR-0710KL,10k 1% 0402,Yageo\n";
    entries.push({ path: "Board_1_A/BOM/Board_1_A_BOM.csv", size: bom.length, read: async () => enc(bom) });
    let tps = "\"Net\",\"Name\",\"X Coord\",\"Y Coord\",\"Side\",\"Hole Size\",\"Type\"\n\"GND\",\"TP1-1\",\"1mm\",\"2mm\",\"Top\",\"0mm\",\"Surface mount\"\n";
    entries.push({ path: "Board_1_A/Test Points/Board_1_A_TPs.csv", size: tps.length, read: async () => enc(tps) });

    let r = await folder.loadAltiumExport(entries);
    let d = r.pcbdata;
    assert.equal(d.metadata.project_name, "Board_1_A");
    let byName = Object.fromEntries(d.parts.map(p => [p.name, p]));
    assert.equal(byName.R1.value, "RC0402FR-0710KL");
    assert.equal(byName.R1.attributes.find(a => a.name == "Description").value, "10k 1% 0402");
    assert.equal(byName.R2.dnp, 1, "BOM 'Not Fitted'");
    assert.equal(byName.R3.in_bom, 0, "not listed in the BOM");
    assert.deepEqual(d.test_points.map(t => [t.name, t.description]), [["TP1", "GND"]]);
});

test("folder: ODB++ inside a .tgz inside a .zip", async () =>
{
    let tgz = zlib.gzipSync(tarOf(Object.fromEntries(Object.entries(syntheticOdb()).map(([p, t]) => ["job/" + p, t]))));
    // zip with the tgz stored (binary content through Buffer)
    let zip = storedZipOf({});
    let n = Buffer.from("job.tgz");
    let l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt32LE(tgz.length, 18); l.writeUInt32LE(tgz.length, 22); l.writeUInt16LE(n.length, 26);
    let c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt32LE(tgz.length, 20); c.writeUInt32LE(tgz.length, 24); c.writeUInt16LE(n.length, 28);
    let cd = Buffer.concat([c, n]);
    let e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(1, 8); e.writeUInt16LE(1, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(30 + n.length + tgz.length, 16);
    zip = new Uint8Array(Buffer.concat([l, n, tgz, cd, e]));
    let r = await folder.loadAltiumExport([{ path: "vendor.zip", size: zip.length, read: async () => zip }], { projectName: "v" });
    assert.equal(r.pcbdata.parts.length, 3);
});

test("folder: pick and place only", async () =>
{
    let text = "\"Designator\",\"Comment\",\"Layer\",\"Footprint\",\"Center-X(mm)\",\"Center-Y(mm)\",\"Rotation\",\"Description\"\n" +
               "\"C1\",\"100n\",\"TopLayer\",\"0402\",\"5\",\"5\",\"0\",\"cap\"\n\"C2\",\"100n\",\"BottomLayer\",\"0402\",\"15\",\"8\",\"90\",\"cap\"\n";
    let r = await folder.loadAltiumExport([{ path: "B/Pick Place/B_pick_place.csv", size: text.length, read: async () => enc(text) }]);
    assert.equal(r.pcbdata.parts.length, 2);
    assert.ok(r.warnings.some(w => /No ODB\+\+/.test(w)));
    assert.equal(r.pcbdata.parts[1].location, "B");
});

test("folder: nothing usable gives a clear error", async () =>
{
    await assert.rejects(folder.loadAltiumExport([{ path: "x/readme.txt", size: 1, read: async () => enc("x") }]), /No ODB\+\+/);
});
