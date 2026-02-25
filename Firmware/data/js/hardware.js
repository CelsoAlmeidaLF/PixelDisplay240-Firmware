class HardwareManager {
    constructor() {
        this.dom = {
            editor: document.getElementById('hw-map-editor'),
            pins: document.querySelectorAll('#hw-pins-config input'),
            board: document.getElementById('hw-board'),
            driver: document.getElementById('hw-driver'),
            fsSize: document.getElementById('hw-fs-size'),
            saveBtn: document.getElementById('btn-save-hardware')
        };
        this.editor = null;
    }

    start() {
        this.initEditor();
        this.setupEvents();
        this.updateCode();
    }

    initEditor() {
        if (!window.monaco || !this.dom.editor) return;
        this.editor = monaco.editor.create(this.dom.editor, {
            value: "",
            language: 'cpp',
            theme: 'vs-dark',
            automaticLayout: true,
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            minimap: { enabled: false },
            readOnly: true
        });
    }

    setupEvents() {
        [...this.dom.pins, this.dom.board, this.dom.driver, this.dom.fsSize].forEach(el => {
            if (el) el.oninput = () => this.updateCode();
        });

        if (this.dom.saveBtn) {
            this.dom.saveBtn.onclick = () => {
                const config = this.getConfig();
                localStorage.setItem('pixeldisplay240_hw_config', JSON.stringify(config));
                if (window.app && window.app.toast) {
                    window.app.toast.show('success', 'Configuração Salva', 'As definições de hardware foram salvas localmente.');
                }
            };
        }
    }

    getConfig() {
        return {
            pins: {
                cs: document.getElementById('pin-cs')?.value || 15,
                dc: document.getElementById('pin-dc')?.value || 2,
                rst: document.getElementById('pin-rst')?.value || 4,
                mosi: document.getElementById('pin-mosi')?.value || 23,
                sclk: document.getElementById('pin-sclk')?.value || 18
            },
            board: this.dom.board?.value || 'esp32',
            driver: this.dom.driver?.value || 'st7789',
            fsSize: this.dom.fsSize?.value || 2
        };
    }

    updateCode() {
        if (!this.editor) return;
        const c = this.getConfig();
        const code = `// --- PIXELDISPLAY240 HARDWARE MAP ---
// Generated automatically for ${c.board.toUpperCase()}

#define TFT_DRIVER ${c.driver.toUpperCase()}
#define TFT_WIDTH  240
#define TFT_HEIGHT 240

// --- GPIO PINS ---
#define TFT_CS   ${c.pins.cs}
#define TFT_DC   ${c.pins.dc}
#define TFT_RST  ${c.pins.rst}
#define TFT_MOSI ${c.pins.mosi}
#define TFT_SCLK ${c.pins.sclk}

// --- STORAGE ---
#define LFS_SIZE_MB ${c.fsSize}

// --- SETUP ---
void initHardware() {
    // Initialization logic for ${c.driver}
    tft.init();
    tft.setRotation(1);
    tft.fillScreen(TFT_BLACK);
}
`;
        this.editor.setValue(code);
    }
}

if (window.PixelDisplay240System) {
    const hwManager = new HardwareManager();
    window.PixelDisplay240System.register('hardware', '5.1.0');
    window.addEventListener('load', () => hwManager.start());
}
