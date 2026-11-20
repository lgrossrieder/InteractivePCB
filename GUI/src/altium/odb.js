/*
    ODB++ (as written by Altium Designer) to iPCB pcbdata.

    Input is a map of the files of one ODB++ product, relative to its root
    ("matrix/matrix", "steps/pcb/eda/data", ...). Keys are lower case, values are strings.

    What is read:
        matrix/matrix                       layer list, order and types
        steps/<step>/profile                board outline
        steps/<step>/layers/<l>/features    copper, overlay, paste, mask, drill and mechanical layers
        steps/<step>/layers/comp_+_top|bot  component placement, properties, pin positions
        steps/<step>/eda/data               package bodies and pad outlines
        symbols/<name>/features             user defined pad shapes

    Verified on Altium Designer 26 exports: component rotation is clockwise; a bottom part is
    rotated and then mirrored in x, although its mirror flag is "N". Every pad position
    computed from the package is checked against the pin record of the component file
    (TOP records) and reported in warnings if it differs.
*/
"use strict";

var geo = require("./geometry.js");

const NUM = parseFloat;

/***************************************************************************************************
                                         Symbols
***************************************************************************************************/

/*
    Standard symbol name to a shape centred on (0, 0), sizes scaled by ks (microns or mils to mm).
    Returns null for unknown names.
*/
function standardSymbol(name, ks)
{
    let m;
    let n = name.toLowerCase();
    if ((m = n.match(/^r([\d.]+)$/)))
    {
        return { t: "circle", x: 0, y: 0, r: NUM(m[1]) * ks / 2 };
    }
    if ((m = n.match(/^s([\d.]+)$/)))
    {
        let a = NUM(m[1]) * ks;
        return { t: "poly", c: [geo.rectContour(a, a)] };
    }
    if ((m = n.match(/^rect([\d.]+)x([\d.]+)(?:x(r|c)([\d.]+)(?:x(\d+))?)?$/)))
    {
        let w = NUM(m[1]) * ks, h = NUM(m[2]) * ks;
        if (m[3])
        {
            return { t: "poly", c: [geo.roundRectContour(w, h, NUM(m[4]) * ks, m[5], m[3] === "c")] };
        }
        return { t: "poly", c: [geo.rectContour(w, h)] };
    }
    if ((m = n.match(/^oval([\d.]+)x([\d.]+)$/)))
    {
        return { t: "poly", c: [geo.ovalContour(NUM(m[1]) * ks, NUM(m[2]) * ks)] };
    }
    if ((m = n.match(/^el([\d.]+)x([\d.]+)$/)))
    {
        return { t: "poly", c: [geo.ellipseContour(NUM(m[1]) * ks, NUM(m[2]) * ks)] };
    }
    if ((m = n.match(/^di([\d.]+)x([\d.]+)$/)))
    {
        let w = NUM(m[1]) * ks / 2, h = NUM(m[2]) * ks / 2;
        return { t: "poly", c: [[w, 0, 0, h, -w, 0, 0, -h]] };
    }
    if ((m = n.match(/^oct([\d.]+)x([\d.]+)x([\d.]+)$/)))
    {
        return { t: "poly", c: [geo.octagonContour(NUM(m[1]) * ks, NUM(m[2]) * ks, NUM(m[3]) * ks)] };
    }
    if ((m = n.match(/^(?:donut_r|thr|ths|s_thr|s_ths|s_tho|sr_ths)([\d.]+)x([\d.]+)/)))
    {
        // Rings and thermals are both drawn as a ring.
        let od = NUM(m[1]) * ks, id = NUM(m[2]) * ks;
        return { t: "poly", c: [geo.circleContour(0, 0, od / 2), geo.circleContour(0, 0, id / 2)] };
    }
    if ((m = n.match(/^donut_s([\d.]+)x([\d.]+)$/)))
    {
        let od = NUM(m[1]) * ks, id = NUM(m[2]) * ks;
        return { t: "poly", c: [geo.rectContour(od, od), geo.rectContour(id, id)] };
    }
    if ((m = n.match(/^hex_[ls]([\d.]+)x([\d.]+)x([\d.]+)$/)))
    {
        let w = NUM(m[1]) * ks, h = NUM(m[2]) * ks, r = NUM(m[3]) * ks;
        if (n.startsWith("hex_l"))
        {
            return { t: "poly", c: [[-w / 2, 0, -w / 2 + r, -h / 2, w / 2 - r, -h / 2, w / 2, 0, w / 2 - r, h / 2, -w / 2 + r, h / 2]] };
        }
        return { t: "poly", c: [[0, -h / 2, w / 2, -h / 2 + r, w / 2, h / 2 - r, 0, h / 2, -w / 2, h / 2 - r, -w / 2, -h / 2 + r]] };
    }
    if ((m = n.match(/^tri([\d.]+)x([\d.]+)$/)))
    {
        let b = NUM(m[1]) * ks, h = NUM(m[2]) * ks;
        return { t: "poly", c: [[-b / 2, -h / 2, b / 2, -h / 2, 0, h / 2]] };
    }
    if ((m = n.match(/^hole([\d.]+)/)))
    {
        return { t: "circle", x: 0, y: 0, r: NUM(m[1]) * ks / 2 };
    }
    return null;
}

// Stroke width a symbol gives to a line or arc feature.
function symbolWidth(name, ks)
{
    let m = name.toLowerCase().match(/^(?:r|s)([\d.]+)$/);
    if (m) { return NUM(m[1]) * ks; }
    m = name.toLowerCase().match(/^rect([\d.]+)x([\d.]+)/);
    if (m) { return Math.min(NUM(m[1]), NUM(m[2])) * ks; }
    return 0.1;
}

/***************************************************************************************************
                                         Feature files
***************************************************************************************************/

function unitsOf(text)
{
    let m = text.match(/^\s*U(?:NITS)?\s*=\s*(\w+)/m);
    let inch = m && m[1].toUpperCase().startsWith("INCH");
    // coordinates: mm or inch; symbol sizes: microns or mils
    return inch ? { k: 25.4, ks: 0.0254 } : { k: 1, ks: 0.001 };
}

/*
    ODB++ pad orientation: 0..7 legacy (90 degree steps, 4..7 mirrored), 8 = any angle, 9 = any angle
    mirrored. Rotation is clockwise.
*/
function padOrientation(tok, i)
{
    let o = parseInt(tok[i], 10);
    if (o === 8 || o === 9)
    {
        return { rot: NUM(tok[i + 1]) || 0, mirror: o === 9 };
    }
    if (isNaN(o)) { o = 0; }
    return { rot: (o % 4) * 90, mirror: o >= 4 };
}

/*
    Parses a features file into shapes. symbolShapes(name) returns the shapes of a user symbol in
    its own frame (or null). stats collects counts of skipped records.
*/
function parseFeatures(text, symbolShapes, stats)
{
    let u = unitsOf(text);
    let k = u.k, ks = u.ks;
    let symbols = [];
    let shapes = [];
    let surface = null;   // current surface: list of contours
    let contour = null;
    let surfaceNeg = false;
    stats = stats || {};

    function symShape(idx)
    {
        let name = symbols[idx];
        if (name === undefined) { return null; }
        let s = standardSymbol(name, ks);
        if (s) { return [s]; }
        let user = symbolShapes ? symbolShapes(name) : null;
        if (user) { return user; }
        stats["unknown symbol " + name] = (stats["unknown symbol " + name] || 0) + 1;
        return null;
    }

    let lines = text.split(/\r?\n/);
    for (let raw of lines)
    {
        let line = raw.split(";")[0].trim();
        if (!line || line[0] === "#") { continue; }
        let t = line.split(/\s+/);
        let c = t[0];
        if (c[0] === "$")
        {
            symbols[parseInt(c.slice(1), 10)] = t[1];
            continue;
        }
        if (surface)
        {
            if (c === "OB")
            {
                contour = [NUM(t[1]) * k, NUM(t[2]) * k];
            }
            else if (c === "OS" && contour)
            {
                contour.push(NUM(t[1]) * k, NUM(t[2]) * k);
            }
            else if (c === "OC" && contour)
            {
                let xs = contour[contour.length - 2], ys = contour[contour.length - 1];
                let pts = geo.arcPoints(xs, ys, NUM(t[1]) * k, NUM(t[2]) * k, NUM(t[3]) * k, NUM(t[4]) * k,
                    (t[5] || "Y").toUpperCase() === "Y");
                for (let p of pts) { contour.push(p); }
            }
            else if (c === "OE" && contour)
            {
                let n = contour.length;
                if (n > 4 && Math.abs(contour[0] - contour[n - 2]) < 1e-9 && Math.abs(contour[1] - contour[n - 1]) < 1e-9)
                {
                    contour.length = n - 2;
                }
                if (contour.length >= 6) { surface.push(contour); }
                contour = null;
            }
            else if (c === "SE")
            {
                if (surface.length)
                {
                    let s = { t: "poly", c: surface };
                    if (surfaceNeg) { s.neg = true; }
                    shapes.push(s);
                }
                surface = null;
            }
            continue;
        }
        if (c === "L")
        {
            let s = { t: "line", x0: NUM(t[1]) * k, y0: NUM(t[2]) * k, x1: NUM(t[3]) * k, y1: NUM(t[4]) * k,
                w: symbolWidth(symbols[parseInt(t[5], 10)] || "r100", ks) };
            if (t[6] === "N") { s.neg = true; }
            shapes.push(s);
        }
        else if (c === "A")
        {
            let xs = NUM(t[1]) * k, ys = NUM(t[2]) * k, xe = NUM(t[3]) * k, ye = NUM(t[4]) * k;
            let xc = NUM(t[5]) * k, yc = NUM(t[6]) * k;
            let w = symbolWidth(symbols[parseInt(t[7], 10)] || "r100", ks);
            let cw = (t[10] || "Y").toUpperCase() === "Y";
            let r = Math.hypot(xs - xc, ys - yc);
            let as = Math.atan2(ys - yc, xs - xc) * 180 / Math.PI;
            let ae = Math.atan2(ye - yc, xe - xc) * 180 / Math.PI;
            let s;
            if (Math.abs(xs - xe) < 1e-9 && Math.abs(ys - ye) < 1e-9)
            {
                s = { t: "arc", cx: xc, cy: yc, r: r, a0: 0, a1: 360, w: w };
            }
            else
            {
                // stored counter-clockwise
                s = cw ? { t: "arc", cx: xc, cy: yc, r: r, a0: ae, a1: as, w: w }
                       : { t: "arc", cx: xc, cy: yc, r: r, a0: as, a1: ae, w: w };
            }
            if (t[8] === "N") { s.neg = true; }
            shapes.push(s);
        }
        else if (c === "P")
        {
            let x = NUM(t[1]) * k, y = NUM(t[2]) * k;
            let base = symShape(parseInt(t[3], 10));
            if (!base) { continue; }
            let o = padOrientation(t, 6);
            let f = geo.makeTransform(x, y, o.rot, o.mirror);
            for (let b of base)
            {
                let s = geo.transformShape(b, f);
                if (t[4] === "N") { s.neg = !s.neg; }
                shapes.push(s);
            }
        }
        else if (c === "S")
        {
            surface = [];
            surfaceNeg = (t[1] === "N");
        }
        else if (c === "T" || c === "B")
        {
            stats[c === "T" ? "text records" : "barcode records"] = (stats[c === "T" ? "text records" : "barcode records"] || 0) + 1;
        }
    }
    return shapes;
}

/***************************************************************************************************
                                         Matrix
***************************************************************************************************/

function parseMatrix(text)
{
    let steps = [];
    let layers = [];
    let re = /(STEP|LAYER)\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(text)))
    {
        let rec = {};
        for (let line of m[2].split(/\r?\n/))
        {
            let i = line.indexOf("=");
            if (i > 0) { rec[line.slice(0, i).trim().toUpperCase()] = line.slice(i + 1).trim(); }
        }
        if (m[1] === "STEP") { steps.push(rec); }
        else { layers.push(rec); }
    }
    layers.sort((a, b) => parseInt(a.ROW, 10) - parseInt(b.ROW, 10));
    return { steps: steps, layers: layers };
}

/***************************************************************************************************
                                         Components and packages
***************************************************************************************************/

// Outline records (RC, CR, SQ, CT..CE) to shapes, in package coordinates.
function parseOutlines(records, k)
{
    let shapes = [];
    let contours = null, contour = null;
    for (let t of records)
    {
        let c = t[0];
        if (c === "RC")
        {
            let x = NUM(t[1]) * k, y = NUM(t[2]) * k, w = NUM(t[3]) * k, h = NUM(t[4]) * k;
            shapes.push({ t: "poly", c: [[x, y, x + w, y, x + w, y + h, x, y + h]] });
        }
        else if (c === "CR")
        {
            shapes.push({ t: "poly", c: [geo.circleContour(NUM(t[1]) * k, NUM(t[2]) * k, NUM(t[3]) * k, 24)] });
        }
        else if (c === "SQ")
        {
            let x = NUM(t[1]) * k, y = NUM(t[2]) * k, h = NUM(t[3]) * k;
            shapes.push({ t: "poly", c: [[x - h, y - h, x + h, y - h, x + h, y + h, x - h, y + h]] });
        }
        else if (c === "CT")
        {
            contours = [];
        }
        else if (c === "OB")
        {
            contour = [NUM(t[1]) * k, NUM(t[2]) * k];
            contour.hole = (t[3] || "I").toUpperCase() === "H";
        }
        else if (c === "OS" && contour)
        {
            contour.push(NUM(t[1]) * k, NUM(t[2]) * k);
        }
        else if (c === "OC" && contour)
        {
            let xs = contour[contour.length - 2], ys = contour[contour.length - 1];
            let pts = geo.arcPoints(xs, ys, NUM(t[1]) * k, NUM(t[2]) * k, NUM(t[3]) * k, NUM(t[4]) * k,
                (t[5] || "Y").toUpperCase() === "Y", 0.03);
            for (let p of pts) { contour.push(p); }
        }
        else if (c === "OE" && contour)
        {
            let n = contour.length;
            if (n > 4 && Math.abs(contour[0] - contour[n - 2]) < 1e-9 && Math.abs(contour[1] - contour[n - 1]) < 1e-9)
            {
                contour.length = n - 2;
            }
            if (contours && contour.length >= 6) { contours.push(contour); }
            contour = null;
        }
        else if (c === "CE")
        {
            if (contours && contours.length) { shapes.push({ t: "poly", c: contours }); }
            contours = null;
        }
    }
    return shapes;
}

// eda/data: packages with body outline and pins (name, type, centre, outline).
function parseEdaPackages(text)
{
    let k = unitsOf(text).k;
    let pkgs = [];
    let cur = null, pin = null, buf = [];

    function flush()
    {
        if (!cur) { return; }
        let shapes = parseOutlines(buf, k);
        if (pin) { pin.shapes = shapes; }
        else { cur.body = shapes; }
        buf = [];
    }

    for (let raw of text.split(/\r?\n/))
    {
        let line = raw.split(";")[0].trim();
        if (!line || line[0] === "#") { continue; }
        let t = line.split(/\s+/);
        if (t[0] === "PKG")
        {
            flush();
            cur = { name: t[1], body: [], pins: [] };
            pin = null;
            pkgs.push(cur);
        }
        else if (!cur)
        {
            continue;
        }
        else if (t[0] === "PIN")
        {
            flush();
            // PIN <name> <type T|B|S> <x> <y> <fhs> <etype> <mtype>
            pin = { name: t[1], type: (t[2] || "S").toUpperCase(), x: NUM(t[3]) * k, y: NUM(t[4]) * k, shapes: [] };
            cur.pins.push(pin);
        }
        else if (t[0] === "FGR" || t[0] === "NET" || t[0] === "SNT" || t[0] === "LYR")
        {
            flush();
            cur = null;
            pin = null;
        }
        else if (t[0] === "PRP")
        {
            continue;
        }
        else
        {
            buf.push(t);
        }
    }
    flush();
    return pkgs;
}

function parseComponents(text, side)
{
    let k = unitsOf(text).k;
    let attrNames = [];
    let comps = [];
    let c = null;
    for (let raw of text.split(/\r?\n/))
    {
        let trimmed = raw.trim();
        if (!trimmed || trimmed[0] === "#") { continue; }
        let parts = trimmed.split(";");
        let t = parts[0].trim().split(/\s+/);
        if (t[0][0] === "@")
        {
            attrNames[parseInt(t[0].slice(1), 10)] = (t[1] || "").toLowerCase();
        }
        else if (t[0] === "CMP")
        {
            // CMP <pkg_ref> <x> <y> <rot> <mirror> <comp_name> <part_name> ;attributes
            let attrs = {};
            if (parts[1])
            {
                for (let a of parts[1].split(","))
                {
                    let kv = a.trim().split("=");
                    let name = attrNames[parseInt(kv[0], 10)];
                    if (name) { attrs[name] = kv.length > 1 ? kv[1] : true; }
                }
            }
            c = {
                pkg: parseInt(t[1], 10), x: NUM(t[2]) * k, y: NUM(t[3]) * k, rot: NUM(t[4]) || 0,
                mirror: (t[5] || "N").toUpperCase() === "M", ref: t[6], part: t.slice(7).join(" "),
                side: side, attrs: attrs, props: {}, toeprints: [],
            };
            comps.push(c);
        }
        else if (t[0] === "PRP" && c)
        {
            let m = trimmed.match(/^PRP\s+(\S+)\s+'(.*)'/);
            if (m) { c.props[m[1]] = m[2]; }
        }
        else if (t[0] === "TOP" && c)
        {
            // TOP <pin_num> <x> <y> <rot> <mirror> <net_num> <subnet_num> <toeprint_name>
            c.toeprints.push({ num: parseInt(t[1], 10), x: NUM(t[2]) * k, y: NUM(t[3]) * k, name: t[8] });
        }
    }
    return comps;
}

/***************************************************************************************************
                                         Conversion to pcbdata
***************************************************************************************************/

function prettyLayerName(name)
{
    let n = name.toLowerCase();
    let m = n.match(/^m(\d+)__?(.*)$/);
    let words;
    if (m)
    {
        words = ["Mech" + m[1]].concat(m[2].split(/[_\s]+/).filter(x => x));
    }
    else
    {
        words = n.split(/[_\s]+/).filter(x => x);
    }
    return words.map(w => (w === "tl" || w === "bl") ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)).join(" ");
}

/*
    Side of a layer from its position in the matrix (rows above the first copper layer are top,
    below the last are bottom) or, for documentation layers, from its name.
*/
function layerSide(layer, firstCopperRow, lastCopperRow)
{
    let type = (layer.TYPE || "").toUpperCase();
    let row = parseInt(layer.ROW, 10);
    let name = (layer.NAME || "").toLowerCase();
    if (type === "DRILL" || type === "ROUT") { return "both"; }
    if ((layer.CONTEXT || "").toUpperCase() === "BOARD" && !isNaN(row) && type !== "DOCUMENT")
    {
        if (type === "SIGNAL" || type === "POWER_GROUND" || type === "MIXED")
        {
            if (row === firstCopperRow) { return "F"; }
            if (row === lastCopperRow) { return "B"; }
            return "inner";
        }
        if (row < firstCopperRow) { return "F"; }
        if (row > lastCopperRow) { return "B"; }
        return "inner";
    }
    if (/(^|_)(tl|top|t)(_|$)|top/.test(name)) { return "F"; }
    if (/(^|_)(bl|bot|bottom|b)(_|$)|bottom/.test(name)) { return "B"; }
    return "both";
}

// Default colours by layer kind, light theme (the viewer uses the same for dark mode).
function layerStyle(kind, side)
{
    switch (kind)
    {
    case "copper":
        if (side === "F") { return { color: "#C87533A0", front: true, back: false }; }
        if (side === "B") { return { color: "#4C7FC8A0", front: false, back: true }; }
        return { color: "#9A9A3A80", front: false, back: false };
    case "silk":     return { color: "#F2F2F2", front: side === "F", back: side === "B" };
    case "paste":    return { color: "#A0A0A0B0", front: false, back: false };
    case "mask":     return { color: "#30A03060", front: false, back: false };
    case "drill":    return { color: "#111111", front: true, back: true };
    case "outline":  return { color: "#E0D060", front: true, back: true };
    default:         return { color: "#D0B040", front: false, back: false };
    }
}

function round4(v) { return Math.round(v * 10000) / 10000; }

// Internal shape to a pcbdata path entry on the given layer.
function shapeToPath(s, layer)
{
    let p;
    if (s.t === "line")
    {
        p = { type: "line", layer: layer, x0: round4(s.x0), y0: round4(s.y0), x1: round4(s.x1), y1: round4(s.y1), width: round4(s.w) };
    }
    else if (s.t === "arc")
    {
        p = { type: "arc", layer: layer, cx0: round4(s.cx), cy0: round4(s.cy), radius: round4(s.r),
            angle0: round4(s.a0), angle1: round4(s.a1), width: round4(s.w), direction: "counterclockwise" };
    }
    else if (s.t === "circle")
    {
        p = { type: "circle", layer: layer, x: round4(s.x), y: round4(s.y), radius: round4(s.r) };
    }
    else
    {
        p = { type: "polygon", layer: layer, contours: s.c.map(c => c.map(round4)) };
    }
    if (s.neg) { p.positive = 0; }
    return p;
}

function bboxOf(shapes)
{
    let b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (let s of shapes) { geo.shapeBounds(s, b); }
    return b;
}

/*
    Builds pcbdata from the ODB++ file map.
    files: Map or object, lower case relative path -> text
    Returns { pcbdata, warnings, components } (components: raw records, used to merge BOM data).
*/
function convert(files, options)
{
    options = options || {};
    let get = (p) => (files instanceof Map ? files.get(p) : files[p]);
    let warnings = [];
    let stats = {};

    let matrixText = get("matrix/matrix");
    if (!matrixText) { throw new Error("ODB++: matrix/matrix not found"); }
    let matrix = parseMatrix(matrixText);

    // Step: the one named in the matrix that has a profile, else the first with a profile.
    let stepNames = new Set();
    for (let key of (files instanceof Map ? files.keys() : Object.keys(files)))
    {
        let m = key.match(/^steps\/([^/]+)\/profile$/);
        if (m) { stepNames.add(m[1]); }
    }
    // Prefer the single board step: one with components, named "pcb", then matrix order.
    let hasComponents = (n) => !!(get("steps/" + n + "/layers/comp_+_top/components") || get("steps/" + n + "/layers/comp_+_bot/components"));
    let candidates = matrix.steps.map(s => (s.NAME || "").toLowerCase()).filter(n => stepNames.has(n));
    if (!candidates.length) { candidates = Array.from(stepNames); }
    candidates.sort((a, b) => (hasComponents(b) - hasComponents(a)) || ((b === "pcb") - (a === "pcb")));
    let step = candidates[0];
    if (!step) { throw new Error("ODB++: no step with a profile found"); }
    let stepDir = "steps/" + step + "/";
    if (stepNames.size > 1) { warnings.push("ODB++ has several steps (" + Array.from(stepNames).join(", ") + "), using " + step); }

    // User symbols, parsed lazily.
    let symbolCache = new Map();
    function userSymbol(name)
    {
        let key = name.toLowerCase();
        if (symbolCache.has(key)) { return symbolCache.get(key); }
        let text = get("symbols/" + key + "/features");
        let shapes = text ? parseFeatures(text, null, stats) : null;
        symbolCache.set(key, shapes);
        return shapes;
    }

    // Board outline
    let profile = parseFeatures(get(stepDir + "profile"), userSymbol, stats);
    let bbox = bboxOf(profile);
    if (!isFinite(bbox.x0)) { throw new Error("ODB++: empty board profile"); }

    // Layers
    let copperRows = matrix.layers
        .filter(l => /^(SIGNAL|POWER_GROUND|MIXED)$/i.test(l.TYPE || "") && (l.CONTEXT || "").toUpperCase() === "BOARD")
        .map(l => parseInt(l.ROW, 10)).filter(r => !isNaN(r));
    let firstCopperRow = Math.min.apply(null, copperRows);
    let lastCopperRow = Math.max.apply(null, copperRows);

    let outLayers = [];
    let configuration = [];
    let drillHoles = [];

    // Board fill first so everything is drawn on top of it.
    outLayers.push({
        name: "Board", side: "both", visible_front: true, visible_back: true,
        paths: profile.map(s => shapeToPath(s, "Board")),
    });
    configuration.push({ category: "color", name: "Board", value: "#1E3D26" });

    let order = { inner: 0, B: 1, F: 2, both: 3 };
    let kindOrder = { copper: 0, mask: 1, paste: 2, silk: 3, doc: 4, outline: 5, drill: 6 };
    let pending = [];
    for (let l of matrix.layers)
    {
        let type = (l.TYPE || "").toUpperCase();
        let name = (l.NAME || "").toLowerCase();
        if (type === "COMPONENT" || type === "DIELECTRIC" || type === "CONDUCTIVE_PASTE") { continue; }
        let text = get(stepDir + "layers/" + name + "/features");
        if (!text) { continue; }
        let kind;
        if (type === "SIGNAL" || type === "POWER_GROUND" || type === "MIXED") { kind = "copper"; }
        else if (type === "SILK_SCREEN") { kind = "silk"; }
        else if (type === "SOLDER_PASTE") { kind = "paste"; }
        else if (type === "SOLDER_MASK") { kind = "mask"; }
        else if (type === "DRILL" || type === "ROUT") { kind = "drill"; }
        else if (/outline|profile|keep/i.test(name)) { kind = "outline"; }
        else { kind = "doc"; }
        let side = layerSide(l, firstCopperRow, lastCopperRow);
        let shapes = parseFeatures(text, userSymbol, stats);
        if (!shapes.length) { continue; }
        if (kind === "drill")
        {
            for (let s of shapes) { if (s.t === "circle") { drillHoles.push({ x: s.x, y: s.y, r: s.r, plated: !/non[-_]?plated/i.test(name) }); } }
        }
        pending.push({ l: l, name: name, kind: kind, side: side, shapes: shapes, row: parseInt(l.ROW, 10) || 0 });
    }
    // Draw order: inner copper, bottom, top, then documentation and drills.
    pending.sort((a, b) =>
        (kindOrder[a.kind] - kindOrder[b.kind]) || (order[a.side] - order[b.side]) ||
        (a.kind === "copper" && a.side === "inner" ? b.row - a.row : a.row - b.row));
    let padsAdded = false;
    for (let p of pending)
    {
        // Part pads (the viewer's "Pads" layer) go below silkscreen, so designators stay readable.
        if (!padsAdded && kindOrder[p.kind] >= kindOrder.silk)
        {
            outLayers.push({ name: "Pads", side: "both", paths: [] });
            padsAdded = true;
        }
        let display = prettyLayerName(p.name);
        if (p.kind === "drill")
        {
            let drills = pending.filter(q => q.kind === "drill");
            let plated = /non[-_]?plated/i.test(p.name) ? "NPTH" : "PTH";
            // Altium writes one plated and one non-plated drill layer; others may write one per span.
            display = drills.filter(q => /non[-_]?plated/i.test(q.name) === (plated === "NPTH")).length > 1
                ? ("Drill " + prettyLayerName(p.name).replace(/^Drill\s*/i, "")).trim()
                : "Drill " + plated;
        }
        // Layer names key the viewer's canvases, so they must be unique.
        let base = display, n = 2;
        while (outLayers.some(l => l.name === display)) { display = base + " (" + (n++) + ")"; }
        let style = layerStyle(p.kind, p.side);
        outLayers.push({
            name: display, side: p.side, kind: p.kind,
            visible_front: style.front, visible_back: style.back,
            paths: p.shapes.map(s => shapeToPath(s, display)),
        });
        configuration.push({ category: "color", name: display, value: style.color });
    }

    if (!padsAdded)
    {
        outLayers.push({ name: "Pads", side: "both", paths: [] });
    }

    // Packages and components
    let pkgs = parseEdaPackages(get(stepDir + "eda/data") || "");
    let comps = [];
    for (let l of matrix.layers)
    {
        if ((l.TYPE || "").toUpperCase() !== "COMPONENT") { continue; }
        let name = (l.NAME || "").toLowerCase();
        let text = get(stepDir + "layers/" + name + "/components");
        if (!text) { continue; }
        let side = /bot/.test(name) ? "B" : "F";
        comps = comps.concat(parseComponents(text, side));
    }
    if (!comps.length) { warnings.push("ODB++: no components found"); }

    let parts = [];
    let pinErrors = [];
    for (let c of comps)
    {
        let pkg = pkgs[c.pkg];
        // Altium writes bottom parts with mirror flag N; they are mirrored all the same.
        let mirror = c.side === "B" || c.mirror;
        // Rotation happens before the mirror: board = origin + Mx R_cw(rot) p, which equals the
        // mirror-first transform with the rotation reversed.
        let f = geo.makeTransform(c.x, c.y, mirror ? -c.rot : c.rot, mirror);

        let pads = [];
        let local = [];   // shapes in package frame for the bounding box
        if (pkg)
        {
            let firstNamed = pkg.pins.findIndex(p => p.name === "1" || p.name.toUpperCase() === "A1");
            pkg.pins.forEach(function (pin, i)
            {
                let centre = f(pin.x, pin.y);
                let tp = c.toeprints.find(t => t.num === i);
                if (tp)
                {
                    let err = Math.hypot(tp.x - centre[0], tp.y - centre[1]);
                    if (err > 0.01) { pinErrors.push(c.ref + "." + pin.name + " " + err.toFixed(3) + " mm"); }
                }
                let contours = [];
                for (let s of pin.shapes)
                {
                    local.push(s);
                    for (let cc of geo.transformShape(s, f).c) { contours.push(cc.map(round4)); }
                }
                if (!contours.length)
                {
                    contours.push(geo.circleContour(centre[0], centre[1], 0.15, 12).map(round4));
                }
                let pad = {
                    type: "polygon", name: pin.name, pin1: (firstNamed >= 0 ? i === firstNamed : i === 0) ? 1 : 0,
                    tht: pin.type === "T" ? 1 : 0, x: round4(centre[0]), y: round4(centre[1]), contours: contours,
                };
                if (pin.type === "T")
                {
                    let hole = drillHoles.find(h => Math.hypot(h.x - centre[0], h.y - centre[1]) < 0.05);
                    if (hole) { pad.drill = round4(2 * hole.r); }
                }
                pads.push(pad);
            });
            for (let s of pkg.body) { local.push(s); }
        }
        else
        {
            warnings.push("ODB++: package " + c.pkg + " of " + c.ref + " not found");
        }

        // Bounding box: package frame extents, placed as a rotated rectangle.
        let lb = local.length ? bboxOf(local) : { x0: -0.5, y0: -0.5, x1: 0.5, y1: 0.5 };
        let lc = f((lb.x0 + lb.x1) / 2, (lb.y0 + lb.y1) / 2);
        let w = lb.x1 - lb.x0, h = lb.y1 - lb.y0;
        // canvas rotation is counter-clockwise in board coordinates; mirroring reverses the sense
        let angle = mirror ? c.rot : -c.rot;
        let attrs = [];
        let dnp = c.attrs[".no_pop"] !== undefined;
        attrs.push({ name: "Footprint", value: pkg ? pkg.name : "" });
        attrs.push({ name: "Rotation", value: String(c.rot) });
        attrs.push({ name: "X", value: c.x.toFixed(3) });
        attrs.push({ name: "Y", value: c.y.toFixed(3) });
        for (let key of Object.keys(c.props))
        {
            attrs.push({ name: key.replace(/_/g, " "), value: c.props[key] });
        }
        // Value used to group the BOM: the part name, else a value property, else the package.
        let partName = /^\?*$/.test(c.part) ? "" : c.part;   // "???" in scrubbed exports
        let value = partName || c.props.VALUE || c.props.Value || c.props.PART_NUMBER || c.props.Comment || (pkg ? pkg.name : "");
        parts.push({
            name: c.ref,
            value: value,
            package: {
                pads: pads,
                bounding_box: {
                    x0: round4(lc[0] - w / 2), y0: round4(lc[1] - h / 2), x1: round4(lc[0] + w / 2), y1: round4(lc[1] + h / 2),
                    angle: angle,
                },
            },
            attributes: attrs,
            location: c.side,
            dnp: dnp ? 1 : 0,
        });
    }
    if (pinErrors.length)
    {
        warnings.push("ODB++: " + pinErrors.length + " pads differ from the pin records, e.g. " + pinErrors.slice(0, 5).join(", "));
    }
    for (let key of Object.keys(stats))
    {
        if (/unknown symbol/.test(key)) { warnings.push("ODB++: " + key + " (" + stats[key] + "x), not drawn"); }
    }

    let info = get("misc/info") || "";
    let saveDate = (info.match(/SAVE_DATE\s*=\s*(\d{4})(\d{2})(\d{2})\.(\d{2})(\d{2})/) || []);
    let app = (info.match(/SAVE_APP\s*=\s*(.*)/) || [])[1] || (info.match(/ODB_SOURCE\s*=\s*(.*)/) || [])[1] || "";

    let pcbdata = {
        metadata: {
            protocol_version: 2,
            ecad: "Altium",
            company: "",
            project_name: options.projectName || "",
            revision: "",
            date: saveDate.length ? saveDate[1] + "-" + saveDate[2] + "-" + saveDate[3] + " " + saveDate[4] + ":" + saveDate[5] : "",
            number_parts: {
                top: parts.filter(p => p.location === "F").length,
                bottom: parts.filter(p => p.location === "B").length,
            },
            source: app.trim(),
        },
        board: {
            bounding_box: { x0: round4(bbox.x0), y0: round4(bbox.y0), x1: round4(bbox.x1), y1: round4(bbox.y1) },
            traces: [],
            layers: outLayers,
        },
        parts: parts,
        test_points: [],
        configuration: configuration,
    };
    return { pcbdata: pcbdata, warnings: warnings, pinErrors: pinErrors.length, components: comps.length };
}

module.exports = {
    convert, parseFeatures, parseMatrix, parseEdaPackages, parseComponents, standardSymbol, prettyLayerName
};
