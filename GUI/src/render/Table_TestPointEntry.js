"use strict";

var globalData     = require("../global.js");
var render         = require("../render.js");
var handlers_mouse = require("../handlers_mouse.js");





class Table_TestPointEntry
{
    constructor(testPoint)
    {

        let tr = document.createElement("TR");
        // test point name
        let td = document.createElement("TD");
        td.textContent = testPoint.name;
        tr.appendChild(td);

        td = document.createElement("TD");
        td.textContent = testPoint.expected || "";
        tr.appendChild(td);

        td = document.createElement("TD");
        td.contentEditable = "true"
        tr.appendChild(td);

        td = document.createElement("TD");
        td.textContent = testPoint.description || "";
        tr.appendChild(td);

        // Clicking a row highlights the test point on the board.
        tr.style.cursor = "pointer";
        tr.onclick = function (event)
        {
            if (event.target && event.target.isContentEditable)
            {
                return;
            }
            for (let row of document.querySelectorAll("#testpointbody tr.highlighted"))
            {
                row.classList.remove("highlighted");
            }
            tr.classList.add("highlighted");
            globalData.setHighlightedRefs([testPoint.name]);
            handlers_mouse.ShowPartInfo(testPoint.name);
            render.drawHighlights();
        };
        return tr;
    }
}

module.exports = {
    Table_TestPointEntry
};
