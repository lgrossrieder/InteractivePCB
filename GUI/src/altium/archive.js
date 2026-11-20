/*
    Minimal readers for the archives an Altium export folder may hold (.zip, .tgz, .tar.gz, .tar).
    Decompression uses the platform DecompressionStream (all current browsers, Node >= 18), so no
    library is bundled.

    Every reader returns entries { path, size, read: async () => Uint8Array }.
*/
"use strict";

async function inflate(bytes, format)
{
    let stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000; }

function decodeName(bytes)
{
    try
    {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }
    catch (e)
    {
        return new TextDecoder("windows-1252").decode(bytes);
    }
}

/* .zip: central directory based, stored and deflated entries. */
function readZip(bytes)
{
    // End of central directory record: search backwards (comment may follow it).
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    {
        if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) { throw new Error("not a zip file"); }
    let count = u16(bytes, eocd + 10);
    let offset = u32(bytes, eocd + 16);
    let entries = [];
    for (let n = 0; n < count; n++)
    {
        if (u32(bytes, offset) !== 0x02014b50) { throw new Error("corrupt zip central directory"); }
        let method = u16(bytes, offset + 10);
        let csize = u32(bytes, offset + 20);
        let usize = u32(bytes, offset + 24);
        let nlen = u16(bytes, offset + 28), xlen = u16(bytes, offset + 30), clen = u16(bytes, offset + 32);
        let local = u32(bytes, offset + 42);
        let name = decodeName(bytes.subarray(offset + 46, offset + 46 + nlen)).replace(/\\/g, "/");
        offset += 46 + nlen + xlen + clen;
        if (name.endsWith("/")) { continue; }
        entries.push({
            path: name,
            size: usize,
            read: async function ()
            {
                let lnlen = u16(bytes, local + 26), lxlen = u16(bytes, local + 28);
                let start = local + 30 + lnlen + lxlen;
                let data = bytes.subarray(start, start + csize);
                if (method === 0) { return data; }
                if (method === 8) { return inflate(data, "deflate-raw"); }
                throw new Error("zip entry " + name + ": compression method " + method + " not supported");
            },
        });
    }
    return entries;
}

function cstring(bytes, start, len)
{
    let end = start;
    while (end < start + len && bytes[end] !== 0) { end++; }
    return new TextDecoder("utf-8").decode(bytes.subarray(start, end));
}

/* .tar (ustar, GNU long names, pax path records). */
function readTar(bytes)
{
    let entries = [];
    let off = 0;
    let longName = null;
    while (off + 512 <= bytes.length)
    {
        if (bytes[off] === 0) { break; }
        let name = cstring(bytes, off, 100);
        let size = parseInt(cstring(bytes, off + 124, 12).trim() || "0", 8);
        let type = String.fromCharCode(bytes[off + 156] || 48);
        let magic = cstring(bytes, off + 257, 6);
        if (magic.startsWith("ustar"))
        {
            let prefix = cstring(bytes, off + 345, 155);
            if (prefix) { name = prefix + "/" + name; }
        }
        let dataStart = off + 512;
        let data = bytes.subarray(dataStart, dataStart + size);
        off = dataStart + Math.ceil(size / 512) * 512;
        if (type === "L")
        {
            longName = cstring(data, 0, data.length);
            continue;
        }
        if (type === "x")
        {
            let m = new TextDecoder("utf-8").decode(data).match(/\d+ path=([^\n]*)\n/);
            if (m) { longName = m[1]; }
            continue;
        }
        if (longName) { name = longName; longName = null; }
        if (type === "0" || type === "\0" || type === "7")
        {
            let d = data;
            entries.push({ path: name.replace(/^\.\//, ""), size: size, read: async () => d });
        }
    }
    return entries;
}

async function readArchive(name, bytes)
{
    let n = name.toLowerCase();
    if (n.endsWith(".zip")) { return readZip(bytes); }
    if (n.endsWith(".tgz") || n.endsWith(".tar.gz") || (bytes[0] === 0x1f && bytes[1] === 0x8b))
    {
        return readTar(await inflate(bytes, "gzip"));
    }
    if (n.endsWith(".tar")) { return readTar(bytes); }
    throw new Error("unsupported archive " + name);
}

function isArchive(name)
{
    return /\.(zip|tgz|tar\.gz|tar)$/i.test(name);
}

module.exports = {
    readArchive, readZip, readTar, isArchive, inflate
};
