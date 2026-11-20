"use strict";

var globalData = require("../global.js");
var colorMap   = require("../colormap.js");
var render     = require("../render.js");

function createLayerCheckboxChangeHandler(layer, isFront)
{
    return function()
    {
        /*
            The following will correctly signal to the canvas what PCB layers should be displayed.
        */
        if(isFront)
        {
            if(globalData.readStorage( "checkbox_layer_front_" + layer.name + "_visible" ) == "true")
            {
                globalData.layer_list.get(layer.name)[globalData.render_layers].SetVisibility(isFront,false);
                globalData.writeStorage("checkbox_layer_front_" + layer.name + "_visible", "false");
            }
            else
            {
                globalData.layer_list.get(layer.name)[globalData.render_layers].SetVisibility(isFront,true);
                globalData.writeStorage("checkbox_layer_front_" + layer.name + "_visible", "true");
            }
        }
        else
        {
            if(globalData.readStorage( "checkbox_layer_back_" + layer.name + "_visible" ) == "true")
            {
                globalData.layer_list.get(layer.name)[globalData.render_layers].SetVisibility(isFront,false);
                globalData.writeStorage("checkbox_layer_back_" + layer.name + "_visible", "false");
            }
            else
            {
                globalData.layer_list.get(layer.name)[globalData.render_layers].SetVisibility(isFront,true);
                globalData.writeStorage("checkbox_layer_back_" + layer.name + "_visible", "true");
            }
        }
        render.RenderPCB(isFront ? globalData.GetAllCanvas().front : globalData.GetAllCanvas().back);
        render.drawHighlights();
    }
}

class Table_LayerEntry
{
    constructor(layer)
    {
        this.visible_front = true;
        this.visible_back  = true;

        this.layerName = layer.name;
        this.activeColorSpanElement = document.createElement("Span");

        // Assumes that all layers are visible by default.
        let defaultFront = (layer.visible_front === undefined) ? true : layer.visible_front;
        let defaultBack  = (layer.visible_back  === undefined) ? true : layer.visible_back;
        if (globalData.readStorage( "checkbox_layer_front_" + this.layerName + "_visible" ) == null)
        {
            this.visible_front = defaultFront;
            globalData.layer_list.get(this.layerName)[globalData.render_layers].SetVisibility(true, defaultFront);
            globalData.writeStorage("checkbox_layer_front_" + this.layerName + "_visible", defaultFront ? "true" : "false");
        }
        else if ( globalData.readStorage( "checkbox_layer_front_" + this.layerName + "_visible" ) == "true")
        {
            globalData.layer_list.get(this.layerName)[globalData.render_layers].SetVisibility(true,true);
            this.visible_front = true;
        }
        else
        {
            globalData.layer_list.get(this.layerName)[globalData.render_layers].SetVisibility(true,false);
            this.visible_front = false;
        }

        if (globalData.readStorage( "checkbox_layer_back_" + this.layerName + "_visible" ) == null)
        {
            this.visible_back = defaultBack;
            globalData.layer_list.get(this.layerName)[globalData.render_layers].SetVisibility(false, defaultBack);
            globalData.writeStorage("checkbox_layer_back_" + this.layerName + "_visible", defaultBack ? "true" : "false");
        }
        // Assumes that all layers are visible by default.
        else if (globalData.readStorage( "checkbox_layer_back_" + this.layerName + "_visible" ) == "true")
        {
            globalData.layer_list.get(this.layerName)[globalData.render_layers].SetVisibility(false,true);
            this.visible_back = true;
        }
        else
        {
            globalData.layer_list.get(this.layerName)[globalData.render_layers].SetVisibility(false,false);
            this.visible_back = false;
        }

        // Assumes that all layers are visible by default.
        if (globalData.readStorage( "checkbox_layer_color_" + this.layerName) == null )
        {

        }
        else
        {

        }


        let tr = document.createElement("TR");
        tr.appendChild(this.CreateCheckbox_Visible(layer, true));
        tr.appendChild(this.CreateCheckbox_Visible(layer, false));
        tr.appendChild(this.CreateCheckbox_Color(layer));

        // Layer
        let td = document.createElement("TD");
        td.innerHTML = this.layerName;
        tr.appendChild(td);
        return tr;
    }

    /*
        Create a checkbox entry for layer table.

        When checked (visible) an eye icon will be used
        and when unselected (not visible) an eye icon will
        slash will be used.
    */
    CreateCheckbox_Visible(layer, isFront)
    {
        let newlabel = document.createElement("Label");
        let td       = document.createElement("TD");
        let input    = document.createElement("input");

        input.type = "checkbox";
        newlabel.classList.add("check_box_layer")
        if(isFront)
        {
            input.checked = this.visible_front;
        }
        else
        {
            input.checked = this.visible_back;
        }

        input.onchange = createLayerCheckboxChangeHandler(layer, isFront);

        var span = document.createElement("Span");
        span.classList.add("layer_checkbox")

        newlabel.appendChild(input);
        newlabel.appendChild(span);
        td.appendChild(newlabel);
        return td;
    }

    UpdateActiveSpanElementColor(event)
    {
        this.activeColorSpanElement.style.backgroundColor = event.target.value;
        colorMap.SetColor(this.layerName,event.target.value );
        render.rerenderAll();
    }

    CreateCheckbox_Color(layer)
    {
        let newlabel = document.createElement("Label");
        let td       = document.createElement("TD");
        let input    = document.createElement("input");

        input.type = "color";
        let colorCode = colorMap.GetTraceColor(this.layerName)

        if(colorCode.length > 7)
        {
            // The colour picker has no alpha; the layer keeps its alpha until a colour is picked.
            colorCode = colorCode.substring(0, 7);
            input.value = colorCode;
            input.defaultValue = colorCode;
        }
        else
        {
            input.value = colorCode;
            input.defaultValue = colorCode;
        }

        input.addEventListener("change", this.UpdateActiveSpanElementColor.bind(this), false);

        newlabel.classList.add("check_box_color")

        this.activeColorSpanElement.classList.add("checkmark_color")
        this.activeColorSpanElement.style.backgroundColor = colorMap.GetTraceColor(this.layerName);

        newlabel.appendChild(input);
        newlabel.appendChild(this.activeColorSpanElement);
        td.appendChild(newlabel);
        return td;
    }
}

module.exports = {
    Table_LayerEntry
};
