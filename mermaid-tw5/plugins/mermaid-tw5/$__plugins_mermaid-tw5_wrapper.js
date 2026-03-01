/*
title: $:/plugins/orange/mermaid-tw5/wrapper.js
type: application/javascript
module-type: widget
author: Nathaniel Jones 2017-05-26
modified: E Furlan 2022-05-08
*/
(function() {
    // jslint node: true, browser: true
    // global $tw: false
    'use strict';

    var uniqueID = 1,
        Rocklib = require("$:/plugins/orange/mermaid-tw5/widget-tools.js").rocklib,
        Widget = require("$:/core/modules/widgets/widget.js").widget,
        rocklib = new Rocklib(),
        mermaid = require("$:/plugins/orange/mermaid-tw5/mermaid.min.js");

        // Add D3 library to support pan and zoom
        // by fkmiec 2023-05-21
        var d3 = require("$:/plugins/orange/mermaid-tw5/d3.v6.min.js");

    function _exportSVGAsPNG(svgElement, diagramId) {
        var svgData = new XMLSerializer().serializeToString(svgElement);
        var img = new Image();
        img.onload = function() {
            var canvas = document.createElement("canvas");
            // Scale 2x for high-DPI / retina display clarity
            var scaleFactor = 2;
            canvas.width = img.naturalWidth * scaleFactor;
            canvas.height = img.naturalHeight * scaleFactor;
            var ctx = canvas.getContext("2d");
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            var pngUrl = canvas.toDataURL("image/png");
            var link = document.createElement("a");
            link.download = "mermaid-" + (diagramId || "diagram") + ".png";
            link.href = pngUrl;
            link.click();
        };
        // Use data URL instead of Blob URL to avoid tainted canvas SecurityError
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgData);
    }

    function _exportSVGAsPDF(svgElement) {
        var svgData = new XMLSerializer().serializeToString(svgElement);
        var printWindow = window.open("", "_blank");
        if (printWindow) {
            printWindow.document.write(
                "<!DOCTYPE html><html><head><title>Mermaid Diagram</title>" +
                "<style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;}" +
                "svg{max-width:100%;height:auto;}</style></head><body>" +
                svgData + "</body></html>"
            );
            printWindow.document.close();
            printWindow.focus();
            printWindow.print();
        } else {
            alert("Please allow popups to save as PDF.");
        }
    }

    function _addExportButtons(containerNode) {
        var diagramId = containerNode.id;
        var toolbar = containerNode.ownerDocument.createElement("div");
        toolbar.className = "mermaid-export-toolbar";
        toolbar.setAttribute("style",
            "display:none;gap:4px;margin-top:4px;justify-content:flex-end;");
        var btnPNG = containerNode.ownerDocument.createElement("button");
        btnPNG.textContent = "Save as PNG";
        btnPNG.setAttribute("style",
            "padding:2px 8px;font-size:12px;cursor:pointer;border:1px solid #ccc;border-radius:3px;background:#f8f8f8;");
        btnPNG.addEventListener("click", function(e) {
            e.stopPropagation();
            var svg = containerNode.querySelector("svg");
            if (svg) _exportSVGAsPNG(svg, diagramId);
        });
        var btnPDF = containerNode.ownerDocument.createElement("button");
        btnPDF.textContent = "Save as PDF";
        btnPDF.setAttribute("style",
            "padding:2px 8px;font-size:12px;cursor:pointer;border:1px solid #ccc;border-radius:3px;background:#f8f8f8;");
        btnPDF.addEventListener("click", function(e) {
            e.stopPropagation();
            var svg = containerNode.querySelector("svg");
            if (svg) _exportSVGAsPDF(svg);
        });
        toolbar.appendChild(btnPNG);
        toolbar.appendChild(btnPDF);
        containerNode.appendChild(toolbar);
        containerNode.addEventListener("mouseenter", function() {
            toolbar.style.display = "flex";
        });
        containerNode.addEventListener("mouseleave", function() {
            toolbar.style.display = "none";
        });
    }

    let MermaidWidget = function(parseTreeNode, options) {
        this.initialise(parseTreeNode, options);
    };
    MermaidWidget.prototype = new Widget();
    // Render this widget into the DOM
    MermaidWidget.prototype.render = function(parent, nextSibling) {
        this.parentDomNode = parent;
        this.computeAttributes();
        this.execute();
        var tag = "mermaid",
            scriptBody = rocklib.getScriptBody(this, "text"),
            divNode = rocklib.getCanvas(this, tag);
        try {
            let options = {
                theme: ""
            };
            rocklib.getOptions(this, tag, options);

            // Add securityLevel: 'loose' configuration to support click events
            // by fkmiec 2023-05-21
            mermaid.initialize({
                startOnLoad: false,
                flowchart: { useMaxWidth: true, htmlLabels: true },
                securityLevel: 'loose',
            });
            // START ZOOM LOGIC: Enable zooming the mermaid diagram with D3
            // by fkmiec 2023-05-21
            let zoomEventListenersApplied = false;
            let isZoomEnabled = false;

            divNode.addEventListener('click', function() {
                if(!zoomEventListenersApplied) {
                    var svgEl = this.querySelector("svg");
                    if (!svgEl) return;
                    var svg = d3.select(svgEl);
                    // Use DOM manipulation instead of HTML serialization to preserve styles
                    var gElement = document.createElementNS("http://www.w3.org/2000/svg", "g");
                    while (svgEl.childNodes.length > 0) {
                        gElement.appendChild(svgEl.childNodes[0]);
                    }
                    svgEl.appendChild(gElement);
                    var inner = svg.select("g");
                    var zoom = d3.zoom().filter(() => isZoomEnabled).on("zoom", function(event) {
                        inner.attr("transform", event.transform);
                    });
                    svg.call(zoom);
                    zoomEventListenersApplied = true;
                }
                isZoomEnabled?isZoomEnabled=false:isZoomEnabled=true;
            });
            //END ZOOM LOGIC

            // Insert into DOM first so mermaid can measure text
            parent.insertBefore(divNode, nextSibling);
            this.domNodes.push(divNode);

            // Mermaid 11.x render is async (returns a Promise)
            // Use a unique render ID and render inside divNode container
            // requestAnimationFrame ensures the browser has laid out the DOM for text measurement
            var renderId = 'mermaid-render-' + divNode.id;
            requestAnimationFrame(function() {
                mermaid.render(renderId, scriptBody, divNode).then(function(result) {
                    divNode.innerHTML = result.svg;
                    if (result.bindFunctions) {
                        result.bindFunctions(divNode);
                    }
                    _addExportButtons(divNode);
                }).catch(function(err) {
                    divNode.innerText = err.message || String(err);
                });
            });

        } catch (ex) {
            divNode.innerText = ex;
            parent.insertBefore(divNode, nextSibling);
            this.domNodes.push(divNode);
        }
    };
    MermaidWidget.prototype.execute = function() {
        // Nothing to do
    };
    /*
    Selectively refreshes the widget if needed. Returns true if the
    widget or any of its children needed re-rendering
    */
    MermaidWidget.prototype.refresh = function(changedTiddlers) {
        return false;
    };
    exports.mermaid = MermaidWidget;
})();
