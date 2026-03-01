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

    /*
    Pre-process mermaid source text to convert TW5 wiki-link syntax in node
    labels into mermaid click directives.

    Supported syntaxes inside quoted node label text:
      [[TiddlerName]]           → displays "TiddlerName", clicks open tiddler
      [[TiddlerName|Display]]   → displays "Display",     clicks open tiddler

    Only [[...]] patterns that appear inside single- or double-quoted label
    strings are processed.  Bare [[...]] used for mermaid's subroutine shape
    (e.g. A[[text]]) are left untouched.

    For each affected node a  click NodeId "#TiddlerName" "TiddlerName"
    directive is appended to the diagram source so mermaid handles navigation
    through its normal click mechanism (requires securityLevel:'loose').
    */
    function preprocessTiddlerLinks(text) {
        if (text.indexOf('[[') === -1) return text;

        var clickDirectives = [];
        // Keywords that start diagram-level lines – we must not treat them as node IDs
        var mermaidKeywords = [
            'graph', 'flowchart', 'subgraph', 'end', 'classdef', 'class',
            'click', 'note', 'participant', 'actor', 'loop', 'alt', 'else',
            'opt', 'par', 'and', 'critical', 'option', 'break', 'rect',
            'link', 'direction', 'sequencediagram', 'statediagram',
            'erdiagram', 'gantt', 'pie', 'mindmap', 'timeline', 'state',
            'section', 'title'
        ];

        var lines = text.split('\n');
        var processed = lines.map(function(line) {
            if (line.indexOf('[[') === -1) return line;

            var newLine = line;
            // Walk every quoted string in the line independently so that
            // multiple nodes on the same line (e.g. A["[[X]]"] --> B["[[Y]]"])
            // each get their own click directive.
            var quoteRegex = /"([^"]*)"|'([^']*)'/g;
            var m;
            while ((m = quoteRegex.exec(line)) !== null) {
                var content = m[1] !== undefined ? m[1] : m[2];
                var quote   = m[1] !== undefined ? '"' : "'";
                if (content.indexOf('[[') === -1) continue;

                // Look backwards from the opening quote to find the nearest node ID.
                // A node definition has the form:  nodeId[  nodeId(  nodeId{  nodeId>
                // Use the LAST match so that, on a line like A["[[X]]"] --> B["[[Y]]"],
                // B is correctly identified as the owner of the second quoted string.
                var textBefore = line.substring(0, m.index);
                var nodeIdPattern = /([A-Za-z0-9_][A-Za-z0-9_-]*)\s*[\[({>]/g;
                var nim, lastNodeId = null;
                while ((nim = nodeIdPattern.exec(textBefore)) !== null) {
                    if (mermaidKeywords.indexOf(nim[1].toLowerCase()) === -1) {
                        lastNodeId = nim[1];
                    }
                }
                if (!lastNodeId) continue;
                var nodeId = lastNodeId;

                var firstTarget = null;
                var newContent = content.replace(
                    /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g,
                    function(lm, target, display) {
                        target = target.trim();
                        if (firstTarget === null) firstTarget = target;
                        return display ? display.trim() : target;
                    }
                );

                if (firstTarget !== null) {
                    // Substitute the cleaned label in the working copy of the line.
                    // Use indexOf to avoid replacing an identical string at a wrong position.
                    var idx = newLine.indexOf(m[0]);
                    if (idx !== -1) {
                        newLine = newLine.substring(0, idx) +
                                  quote + newContent + quote +
                                  newLine.substring(idx + m[0].length);
                    }

                    var safeTarget = firstTarget.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                    // Skip if a click directive for this node already exists in the
                    // original source or in our pending list.
                    var clickRe = new RegExp('\\bclick\\s+' + nodeId + '\\s');
                    var alreadyInSource = clickRe.test(text);
                    var alreadyPending  = clickDirectives.some(function(d) {
                        return d.indexOf('click ' + nodeId + ' ') === 0;
                    });
                    if (!alreadyInSource && !alreadyPending) {
                        clickDirectives.push(
                            'click ' + nodeId + ' "#' + safeTarget + '" "' + safeTarget + '"'
                        );
                    }
                }
            }

            return newLine;
        }).join('\n');

        if (clickDirectives.length > 0) {
            processed += '\n' + clickDirectives.join('\n');
        }

        return processed;
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
            scriptBody = preprocessTiddlerLinks(rocklib.getScriptBody(this, "text")),
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
                    var gElement = svgEl.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "g");
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
            var isRendered = false;
            var printImg = null;
            var performRender = function() {
                if (isRendered) return;
                // Skip if divNode has been removed from the document (widget destroyed)
                if (!divNode.ownerDocument.body.contains(divNode)) return;
                isRendered = true;
                mermaid.render(renderId, scriptBody).then(function(result) {
                    divNode.innerHTML = result.svg;
                    if (result.bindFunctions) {
                        result.bindFunctions(divNode);
                    }
                    _addExportButtons(divNode);
                    // Pre-create a hidden <img> with the SVG serialized as a data URL.
                    // Pre-loading ensures the image is fully decoded before any print
                    // event fires (including from PrintRiver's popup window), avoiding
                    // the blank-image timing issue that occurs when img.src is set only
                    // inside the beforeprint handler.
                    var svgEl = divNode.querySelector('svg');
                    if (svgEl) {
                        var svgData = new XMLSerializer().serializeToString(svgEl);
                        printImg = divNode.ownerDocument.createElement('img');
                        printImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
                        printImg.style.cssText = 'display:none;max-width:100%;height:auto;';
                        divNode.insertBefore(printImg, svgEl);
                    }
                }).catch(function(err) {
                    divNode.innerText = err.message || String(err);
                });
            };
            requestAnimationFrame(performRender);
            // Before printing, show the pre-loaded <img> and hide the SVG so that the
            // diagram renders correctly in PDF/print output.  Inline SVGs injected via
            // innerHTML are often omitted or mis-rendered by browsers and PDF viewers
            // when printing; a pre-loaded <img> with an SVG data URL is reliable.
            // If the diagram has not yet rendered (printImg is null) we attempt to
            // render it now so it will be available for any subsequent print attempt.
            var onBeforePrint = function() {
                var svg = divNode.querySelector('svg');
                if (printImg) {
                    // Pre-loaded image is ready — just toggle visibility.
                    if (svg) { svg.style.display = 'none'; }
                    printImg.style.display = '';
                } else if (svg) {
                    // Diagram rendered but pre-image not yet available (rare fallback).
                    var svgData = new XMLSerializer().serializeToString(svg);
                    printImg = divNode.ownerDocument.createElement('img');
                    printImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
                    printImg.style.cssText = 'max-width:100%;height:auto;';
                    svg.style.display = 'none';
                    divNode.insertBefore(printImg, svg);
                } else {
                    // Diagram not yet rendered — trigger render for a future print attempt.
                    performRender();
                }
            };
            // After printing, hide the <img> and restore the SVG.
            var onAfterPrint = function() {
                if (printImg) {
                    printImg.style.display = 'none';
                    var svg = divNode.querySelector('svg');
                    if (svg) { svg.style.display = ''; }
                }
            };
            var targetWindow = divNode.ownerDocument.defaultView;
            targetWindow.addEventListener('beforeprint', onBeforePrint);
            targetWindow.addEventListener('afterprint', onAfterPrint);
            // Store cleanup references on the divNode so the destroy handler can reach them.
            divNode._onBeforePrint = onBeforePrint;
            divNode._onAfterPrint = onAfterPrint;
            divNode._printWindow = targetWindow;

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
    /*
    Remove window-level print event listeners to prevent accumulation when
    the widget is destroyed or recreated by TiddlyWiki's render pipeline.
    */
    MermaidWidget.prototype.destroy = function() {
        var divNode = this.domNodes && this.domNodes[0];
        if (divNode) {
            var targetWindow = divNode._printWindow || divNode.ownerDocument.defaultView;
            if (divNode._onBeforePrint) {
                targetWindow.removeEventListener('beforeprint', divNode._onBeforePrint);
            }
            if (divNode._onAfterPrint) {
                targetWindow.removeEventListener('afterprint', divNode._onAfterPrint);
            }
        }
    };
    exports.mermaid = MermaidWidget;
})();
