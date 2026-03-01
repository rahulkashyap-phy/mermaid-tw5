/*
title: $:/plugins/orange/mermaid-tw5/markdown-mermaid.js
type: application/javascript
module-type: startup
*/
(function() {
    "use strict";

    exports.name = "mermaid-markdown";
    exports.platforms = ["browser", "node"];
    exports.after = ["startup"];
    exports.synchronous = true;

    // Encode mermaid content as HTML entities for safe embedding in a TW5 e"..."
    // string attribute. The markdown plugin's parser uses parseStringLiteralExtended
    // which decodes entities in e"..." attributes, restoring the original content.
    function encodeMermaidText(content) {
        return content
            .replace(/&/g, "&#38;")
            .replace(/"/g, "&#34;")
            .replace(/</g, "&#60;")
            .replace(/>/g, "&#62;")
            .replace(/\n/g, "&#10;")
            .replace(/\r/g, "&#13;");
    }

    exports.startup = function() {
        // Check if the TW5 markdown plugin parser is available.
        // The markdown plugin exposes its markdown-it instance at
        // $tw.Wiki.parsers["text/markdown"].prototype.md for extension.
        var MarkdownParser = $tw.Wiki.parsers &&
            ($tw.Wiki.parsers["text/markdown"] || $tw.Wiki.parsers["text/x-markdown"]);
        if (!MarkdownParser || !MarkdownParser.prototype || !MarkdownParser.prototype.md) {
            return;
        }

        var md = MarkdownParser.prototype.md;

        // Save the original fence renderer (if any)
        var defaultFenceRenderer = md.renderer.rules.fence;

        // Override the fence renderer to intercept ```mermaid blocks.
        // The markdown plugin temporarily installs parseStringLiteralExtended
        // when parsing the rendered HTML, so e"..." attribute syntax (with HTML
        // entity decoding) is always available here.
        md.renderer.rules.fence = function(tokens, idx, options, env, self) {
            var token = tokens[idx];
            var info = token.info ? token.info.trim() : "";
            var lang = info.split(/\s+/g)[0];

            if (lang === "mermaid") {
                // Use e"..." entity-encoded attribute to safely handle any
                // mermaid content including newlines and special characters
                return '<$mermaid text=e"' + encodeMermaidText(token.content) + '"/>\n';
            }

            // Fall back to the original fence renderer for non-mermaid blocks
            if (defaultFenceRenderer) {
                return defaultFenceRenderer(tokens, idx, options, env, self);
            }
            return self.renderToken(tokens, idx, options, env, self);
        };
    };
})();
