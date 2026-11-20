/*
    Small geometry helpers shared by the ODB++ importer.

    Shapes used internally (all coordinates in mm, board frame, y up):
        { t: "line",   x0, y0, x1, y1, w }          round-capped stroke
        { t: "arc",    cx, cy, r, a0, a1, w }        stroke, counter-clockwise from a0 to a1 (degrees)
        { t: "circle", x, y, r }                     filled disc
        { t: "poly",   c: [[x0, y0, x1, y1, ...], ...] }  filled, even-odd (holes are extra contours)
    Any shape may carry neg: true (ODB++ negative polarity, erases what is below it on the same layer).
*/
"use strict";

const TAU = 2 * Math.PI;

function round(v)
{
    return Math.round(v * 10000) / 10000;
}

// Points along an arc from (xs, ys) to (xe, ye) around (xc, yc), excluding the start point.
function arcPoints(xs, ys, xe, ye, xc, yc, clockwise, maxChord)
{
    let r  = Math.hypot(xs - xc, ys - yc);
    let a0 = Math.atan2(ys - yc, xs - xc);
    let a1 = Math.atan2(ye - yc, xe - xc);
    if (clockwise)
    {
        if (a1 >= a0 - 1e-9) { a1 -= TAU; }
    }
    else
    {
        if (a1 <= a0 + 1e-9) { a1 += TAU; }
    }
    let n = Math.max(2, Math.min(90, Math.ceil(Math.abs(a1 - a0) * r / (maxChord || 0.05))));
    let pts = [];
    for (let i = 1; i <= n; i++)
    {
        let a = a0 + (a1 - a0) * i / n;
        pts.push(xc + r * Math.cos(a), yc + r * Math.sin(a));
    }
    return pts;
}

function circleContour(x, y, r, n)
{
    n = n || Math.max(12, Math.min(64, Math.ceil(TAU * r / 0.05)));
    let c = [];
    for (let i = 0; i < n; i++)
    {
        c.push(x + r * Math.cos(TAU * i / n), y + r * Math.sin(TAU * i / n));
    }
    return c;
}

function rectContour(w, h)
{
    return [-w / 2, -h / 2, w / 2, -h / 2, w / 2, h / 2, -w / 2, h / 2];
}

/*
    Rectangle with rounded (round = true) or chamfered corners. corners is the ODB++ corner
    list ("1234" = all; 1 = top right, 2 = top left, 3 = bottom left, 4 = bottom right).
*/
function roundRectContour(w, h, rad, corners, chamfer)
{
    rad = Math.min(rad, w / 2, h / 2);
    let all = !corners;
    let cs = [
        // corner id, corner point, direction of the two edges leaving it
        { id: "1", x:  w / 2, y:  h / 2, a: 0 },
        { id: "2", x: -w / 2, y:  h / 2, a: 90 },
        { id: "3", x: -w / 2, y: -h / 2, a: 180 },
        { id: "4", x:  w / 2, y: -h / 2, a: 270 },
    ];
    let c = [];
    for (let k of cs)
    {
        let use = all || corners.indexOf(k.id) >= 0;
        if (!use || rad <= 0)
        {
            c.push(k.x, k.y);
            continue;
        }
        // centre of the rounding, inside the corner
        let sx = Math.sign(k.x), sy = Math.sign(k.y);
        let cx = k.x - sx * rad, cy = k.y - sy * rad;
        // counter-clockwise walk: from the edge before the corner to the edge after it
        let a0 = (k.a - 0) * Math.PI / 180;
        let a1 = (k.a + 90) * Math.PI / 180;
        if (chamfer)
        {
            c.push(cx + rad * Math.cos(a0), cy + rad * Math.sin(a0));
            c.push(cx + rad * Math.cos(a1), cy + rad * Math.sin(a1));
        }
        else
        {
            let n = 6;
            for (let i = 0; i <= n; i++)
            {
                let a = a0 + (a1 - a0) * i / n;
                c.push(cx + rad * Math.cos(a), cy + rad * Math.sin(a));
            }
        }
    }
    return c;
}

function ovalContour(w, h)
{
    // stadium: semicircles on the short sides
    let c = [];
    let n = 12;
    if (w >= h)
    {
        let r = h / 2, d = w / 2 - r;
        for (let i = 0; i <= n; i++) { let a = -Math.PI / 2 + Math.PI * i / n; c.push(d + r * Math.cos(a), r * Math.sin(a)); }
        for (let i = 0; i <= n; i++) { let a =  Math.PI / 2 + Math.PI * i / n; c.push(-d + r * Math.cos(a), r * Math.sin(a)); }
    }
    else
    {
        let r = w / 2, d = h / 2 - r;
        for (let i = 0; i <= n; i++) { let a = Math.PI * i / n; c.push(r * Math.cos(a), d + r * Math.sin(a)); }
        for (let i = 0; i <= n; i++) { let a = Math.PI + Math.PI * i / n; c.push(r * Math.cos(a), -d + r * Math.sin(a)); }
    }
    return c;
}

function ellipseContour(w, h)
{
    let c = [];
    let n = 32;
    for (let i = 0; i < n; i++) { c.push(w / 2 * Math.cos(TAU * i / n), h / 2 * Math.sin(TAU * i / n)); }
    return c;
}

function octagonContour(w, h, r)
{
    return [
        w / 2 - r, -h / 2, w / 2, -h / 2 + r, w / 2, h / 2 - r, w / 2 - r, h / 2,
        -w / 2 + r, h / 2, -w / 2, h / 2 - r, -w / 2, -h / 2 + r, -w / 2 + r, -h / 2,
    ];
}

/*
    Placement transform as used by ODB++: optional mirror in x, then clockwise rotation by rot
    degrees, then translation. Returns a function mapping (x, y) -> [x, y].
*/
function makeTransform(dx, dy, rotCwDeg, mirror)
{
    let a = -rotCwDeg * Math.PI / 180;
    let ca = Math.cos(a), sa = Math.sin(a);
    let m = mirror ? -1 : 1;
    let f = function (x, y)
    {
        x = m * x;
        return [dx + x * ca - y * sa, dy + x * sa + y * ca];
    };
    f.mirror = mirror;
    f.rot = rotCwDeg;
    f.scale = 1;
    return f;
}

function transformContour(c, f)
{
    let out = new Array(c.length);
    for (let i = 0; i < c.length; i += 2)
    {
        let p = f(c[i], c[i + 1]);
        out[i] = p[0];
        out[i + 1] = p[1];
    }
    return out;
}

function transformShape(s, f)
{
    let neg = s.neg;
    let r;
    if (s.t === "poly")
    {
        r = { t: "poly", c: s.c.map(c => transformContour(c, f)) };
    }
    else if (s.t === "circle")
    {
        let p = f(s.x, s.y);
        r = { t: "circle", x: p[0], y: p[1], r: s.r };
    }
    else if (s.t === "line")
    {
        let p0 = f(s.x0, s.y0), p1 = f(s.x1, s.y1);
        r = { t: "line", x0: p0[0], y0: p0[1], x1: p1[0], y1: p1[1], w: s.w };
    }
    else if (s.t === "arc")
    {
        // Convert through end points so mirroring flips the direction correctly.
        let a0 = s.a0 * Math.PI / 180, a1 = s.a1 * Math.PI / 180;
        let ps = f(s.cx + s.r * Math.cos(a0), s.cy + s.r * Math.sin(a0));
        let pe = f(s.cx + s.r * Math.cos(a1), s.cy + s.r * Math.sin(a1));
        let pc = f(s.cx, s.cy);
        let b0 = Math.atan2(ps[1] - pc[1], ps[0] - pc[0]) * 180 / Math.PI;
        let b1 = Math.atan2(pe[1] - pc[1], pe[0] - pc[0]) * 180 / Math.PI;
        let full = Math.abs(s.a1 - s.a0) >= 359.999;
        if (full) { b0 = 0; b1 = 360; }
        else if (f.mirror) { let t = b0; b0 = b1; b1 = t; }
        r = { t: "arc", cx: pc[0], cy: pc[1], r: s.r, a0: b0, a1: b1, w: s.w };
    }
    if (neg) { r.neg = true; }
    return r;
}

function shapeBounds(s, b)
{
    b = b || { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    function add(x, y, pad)
    {
        pad = pad || 0;
        if (x - pad < b.x0) { b.x0 = x - pad; }
        if (y - pad < b.y0) { b.y0 = y - pad; }
        if (x + pad > b.x1) { b.x1 = x + pad; }
        if (y + pad > b.y1) { b.y1 = y + pad; }
    }
    if (s.t === "poly")
    {
        for (let c of s.c) { for (let i = 0; i < c.length; i += 2) { add(c[i], c[i + 1]); } }
    }
    else if (s.t === "circle") { add(s.x, s.y, s.r); }
    else if (s.t === "line") { add(s.x0, s.y0, s.w / 2); add(s.x1, s.y1, s.w / 2); }
    else if (s.t === "arc") { add(s.cx, s.cy, s.r + s.w / 2); }
    return b;
}

module.exports = {
    round, arcPoints, circleContour, rectContour, roundRectContour, ovalContour, ellipseContour,
    octagonContour, makeTransform, transformContour, transformShape, shapeBounds
};
