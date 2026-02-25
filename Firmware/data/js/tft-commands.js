class TftCommandToolbar {
    constructor() {
        this.cmds = {
            fillRect: 'tft.fillRect(0, 0, 50, 50, TFT_WHITE);',
            drawRect: 'tft.drawRect(0, 0, 50, 50, TFT_WHITE);',
            fillRoundRect: 'tft.fillRoundRect(10, 10, 60, 40, 8, TFT_YELLOW);',
            fillCircle: 'tft.fillCircle(120, 120, 30, TFT_BLUE);',
            drawCircle: 'tft.drawCircle(120, 120, 30, TFT_RED);',
            fillTriangle: 'tft.fillTriangle(120, 80, 100, 120, 140, 120, TFT_GREEN);',
            fillEllipse: 'tft.fillEllipse(120, 120, 40, 20, TFT_MAGENTA);',
            drawLine: 'tft.drawLine(0, 0, 240, 240, TFT_WHITE);',
            drawString: 'tft.drawString("Texto", 10, 10, 2);',
            drawCentreString: 'tft.drawCentreString("Centro", 120, 120, 4);',
            fillScreen: 'tft.fillScreen(TFT_BLACK);',
            pushImage: 'tft.pushImage(0, 0, width, height, asset_name);'
        };
    }

    start() {
        document.querySelectorAll('.tft-cmd-btn').forEach(btn => {
            btn.onclick = () => {
                const cmd = btn.dataset.cmd;
                const snippet = this.cmds[cmd];
                if (snippet) this.insertAtEditor(snippet);
            };
        });
    }

    insertAtEditor(text) {
        // Try to find the active editor (Monaco or textarea)
        const app = window.app;
        if (app && app.prototype && app.prototype.view) {
            const view = app.prototype.view;
            if (view.editor) {
                const selection = view.editor.getSelection();
                const range = new monaco.Range(selection.startLineNumber, selection.startColumn, selection.endLineNumber, selection.endColumn);
                view.editor.executeEdits("tft-toolbar", [{ range: range, text: text + '\n', forceMoveMarkers: true }]);
                view.editor.focus();
            } else if (view.dom.codePreview) {
                const start = view.dom.codePreview.selectionStart;
                const end = view.dom.codePreview.selectionEnd;
                const current = view.dom.codePreview.value;
                view.dom.codePreview.value = current.substring(0, start) + text + '\n' + current.substring(end);
                view.dom.codePreview.dispatchEvent(new Event('input'));
            }
        }
    }
}

if (window.PixelDisplay240System) {
    const tftToolbar = new TftCommandToolbar();
    window.PixelDisplay240System.register('tft', '5.1.0');
    // Global hook for the app to start the toolbar
    window.addEventListener('load', () => tftToolbar.start());
}
