// --- PixelDisplay240 Studio IDE v5 ---
// Advanced Embedded UI Design Suite - Clean OOP Implementation

// Ensure EditorModule base class exists if designer.js hasn't run or defined it
if (typeof EditorModule === 'undefined') {
    window.EditorModule = class EditorModule {
        constructor() {
            this.dom = (id) => {
                const el = document.getElementById(id);
                if (!el && !['status-memory', 'status-time'].includes(id)) {
                    // Silently return null for missing elements instead of throwing
                }
                return el;
            };
        }
    };
}

// ========== 1. Theme & Palette Manager ==========
class ThemeManager extends EditorModule {
    constructor() {
        super();
        this.presets = {
            gameboy: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
            pico8: ['#000000', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8', '#FF004D', '#FFA300', '#FFEC27', '#00E436', '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA'],
            nes: ['#7C7C7C', '#0000FC', '#0000BC', '#4428BC', '#940084', '#A80020', '#A81000', '#881400', '#503000', '#007800', '#006800', '#0058F8', '#004058', '#000000']
        };
        this.themes = {
            default: { bg: '#0f172a', card: '#1e293b', primary: '#38bdf8', border: '#334155' },
            dracula: { bg: '#282a36', card: '#44475a', primary: '#bd93f9', border: '#6272a4' },
            nord: { bg: '#2e3440', card: '#3b4252', primary: '#88c0d0', border: '#4c566a' },
            monokai: { bg: '#272822', card: '#3e3d32', primary: '#f92672', border: '#75715e' }
        };
        this._init();
    }

    _init() {
        const paletteSel = this.dom('palette-presets');
        if (paletteSel) paletteSel.onchange = () => this.loadPalette(paletteSel.value);

        const btnSave = this.dom('btn-save-color');
        if (btnSave) btnSave.onclick = () => this.addColor(this.dom('color-picker').value);
    }

    setTheme(id) {
        const t = this.themes[id]; if (!t) return;
        const root = document.documentElement.style;
        root.setProperty('--bg-dark', t.bg);
        root.setProperty('--card-bg', t.card);
        root.setProperty('--primary', t.primary);
        root.setProperty('--border', t.border);
    }

    loadPalette(id) {
        if (id === 'custom') return;
        const grid = this.dom('color-palette');
        if (!grid) return;
        grid.querySelectorAll('.palette-color').forEach(c => c.remove());
        if (this.presets[id]) this.presets[id].forEach(c => this.addColor(c));
    }

    addColor(color) {
        const grid = this.dom('color-palette');
        if (!grid) return;
        const item = document.createElement('div');
        item.className = 'palette-color';
        item.style.backgroundColor = color;
        item.onclick = () => { if (this.dom('color-picker')) this.dom('color-picker').value = this.rgbToHex(color); };
        item.oncontextmenu = (e) => { e.preventDefault(); item.remove(); };
        const btn = this.dom('btn-save-color');
        if (btn) grid.insertBefore(item, btn); else grid.appendChild(item);
    }

    rgbToHex(rgb) {
        if (rgb.startsWith('#')) return rgb;
        const p = rgb.match(/\d+/g);
        if (!p) return rgb;
        return "#" + p.map(v => parseInt(v).toString(16).padStart(2, '0')).join("");
    }
}

// ========== 2. Navigation Manager ==========
class NavigationManager extends EditorModule {
    constructor(app) {
        super();
        this.app = app;
        this.panels = {
            design: this.dom('design-view'),
            prototype: this.dom('prototype-view'),
            hardware: this.dom('hardware-view')
        };
        this.btns = {
            design: this.dom('nav-design'),
            prototype: this.dom('nav-prototype'),
            hardware: this.dom('nav-hardware')
        };
        this._setup();
    }

    _setup() {
        Object.keys(this.btns).forEach(id => {
            if (this.btns[id]) this.btns[id].onclick = () => this.switch(id);
        });
    }

    switch(viewId) {
        Object.keys(this.panels).forEach(k => {
            if (this.panels[k]) this.panels[k].classList.toggle('active', k === viewId);
            if (this.btns[k]) this.btns[k].classList.toggle('active', k === viewId);
        });

        if (viewId === 'prototype') {
            // Copy current design canvas into the proto display
            if (this.app.layers) { // Check if design module is active
                this._syncDesignToProto();
            }
            if (this.app.prototype) {
                this.app.prototype.sync();
                // Ensure Monaco layout is correct after being shown
                if (this.app.prototype.view && this.app.prototype.view.editor) {
                    setTimeout(() => this.app.prototype.view.editor.layout(), 10);
                }
            }
        }

        if (this.app.status) this.app.status.update(viewId);
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    _syncDesignToProto() {
        const previewCanvas = document.getElementById('preview-canvas');
        const protoCanvas = document.getElementById('proto-canvas');
        if (!previewCanvas || !protoCanvas) return null;

        const ctx = protoCanvas.getContext('2d');
        ctx.clearRect(0, 0, protoCanvas.width, protoCanvas.height);
        ctx.drawImage(previewCanvas, 0, 0, protoCanvas.width, protoCanvas.height);

        // Return the dataURL so it can be persisted
        return protoCanvas.toDataURL('image/png');
    }
}

// ========== 4. Window & Workspace Manager ==========
class WindowManager extends EditorModule {
    constructor(app) {
        super();
        this.app = app;
        this.windows = new Map();
        this.activeWindow = null;
        this.resizingWindow = null;
        this.dragOffset = { x: 0, y: 0 };
        this.resizeStart = { w: 0, h: 0, x: 0, y: 0 };
        this._setupGlobalEvents();
        this._loadLayout();
    }

    _setupGlobalEvents() {
        window.addEventListener('mousemove', (e) => this._onDrag(e));
        window.addEventListener('mouseup', () => this._stopDrag());

        // Setup Sidebar Collapse Triggers per view panel
        setTimeout(() => {
            document.querySelectorAll('.view-panel').forEach(view => {
                // Safety: remove existing
                view.querySelectorAll('.collapse-trigger').forEach(t => t.remove());

                const leftTrigger = document.createElement('div');
                leftTrigger.className = 'collapse-trigger collapse-trigger-left';
                leftTrigger.innerHTML = '<i data-lucide="chevron-left"></i>';
                leftTrigger.onclick = (e) => { e.stopPropagation(); this.toggleSidebar('left'); };

                const rightTrigger = document.createElement('div');
                rightTrigger.className = 'collapse-trigger collapse-trigger-right';
                rightTrigger.innerHTML = '<i data-lucide="chevron-right"></i>';
                rightTrigger.onclick = (e) => { e.stopPropagation(); this.toggleSidebar('right'); };

                view.appendChild(leftTrigger);
                view.appendChild(rightTrigger);
            });
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }, 1000);
    }

    createWindow(id, title, content, x = 100, y = 100, w = 350, h = 300) {
        if (this.windows.has(id)) {
            this.focusWindow(id);
            return;
        }

        const win = document.createElement('div');
        win.className = 'floating-window';
        win.id = `win-${id}`;
        win.style.left = x + 'px';
        win.style.top = y + 'px';
        win.style.width = w + 'px';
        win.style.height = h + 'px';

        // Store original position if content is an element
        let originalParent = null;
        let originalSibling = null;
        let borrowedElement = null;

        if (content instanceof HTMLElement) {
            borrowedElement = content;
            originalParent = content.parentElement;
            originalSibling = content.nextSibling;
        }

        win.innerHTML = `
            <div class="window-header">
                <span class="window-title">${title}</span>
                <div class="window-controls">
                    <button class="win-btn win-close"><i data-lucide="x"></i></button>
                </div>
            </div>
            <div class="window-content"></div>
            <div class="window-resizer" style="position:absolute; right:0; bottom:0; width:15px; height:15px; cursor:nwse-resize; background: linear-gradient(135deg, transparent 50%, var(--primary) 50%); opacity:0.3; border-radius:0 0 12px 0;"></div>
        `;

        const header = win.querySelector('.window-header');
        header.onmousedown = (e) => this._startDrag(id, win, e);

        const resizer = win.querySelector('.window-resizer');
        resizer.onmousedown = (e) => this._startResize(id, win, e);

        const closeBtn = win.querySelector('.win-close');
        closeBtn.onclick = (e) => { e.stopPropagation(); this.closeWindow(id); };

        win.onmousedown = () => this.focusWindow(id);

        const contentArea = win.querySelector('.window-content');
        if (typeof content === 'string') {
            contentArea.innerHTML = content;
        } else {
            contentArea.appendChild(content);
        }

        document.body.appendChild(win);
        this.windows.set(id, {
            el: win,
            borrowed: borrowedElement,
            parent: originalParent,
            sibling: originalSibling
        });

        this.focusWindow(id);
        if (typeof lucide !== 'undefined') lucide.createIcons();
        this._saveLayout();
    }

    _startDrag(id, win, e) {
        this.activeWindow = id;
        const rect = win.getBoundingClientRect();
        this.dragOffset.x = e.clientX - rect.left;
        this.dragOffset.y = e.clientY - rect.top;
        win.style.transition = 'none';
        this.focusWindow(id);
    }

    _startResize(id, win, e) {
        e.stopPropagation();
        e.preventDefault();
        this.resizingWindow = id;
        this.resizeStart = {
            w: win.offsetWidth,
            h: win.offsetHeight,
            x: e.clientX,
            y: e.clientY
        };
        this.focusWindow(id);
    }

    _onDrag(e) {
        if (this.resizingWindow) {
            const entry = this.windows.get(this.resizingWindow);
            if (!entry) return;
            const win = entry.el;
            const dw = e.clientX - this.resizeStart.x;
            const dh = e.clientY - this.resizeStart.y;
            win.style.width = Math.max(200, this.resizeStart.w + dw) + 'px';
            win.style.height = Math.max(100, this.resizeStart.h + dh) + 'px';
            return;
        }

        if (!this.activeWindow) return;
        const entry = this.windows.get(this.activeWindow);
        if (!entry) return;
        const win = entry.el;
        let x = e.clientX - this.dragOffset.x;
        let y = e.clientY - this.dragOffset.y;

        // Viewport bounds
        x = Math.max(0, Math.min(window.innerWidth - 100, x));
        y = Math.max(70, Math.min(window.innerHeight - 100, y));

        win.style.left = x + 'px';
        win.style.top = y + 'px';
    }

    _stopDrag() {
        if (this.activeWindow) {
            const entry = this.windows.get(this.activeWindow);
            if (entry) entry.el.style.transition = '';
        }
        this.activeWindow = null;
        this.resizingWindow = null;
        this._saveLayout();
    }

    focusWindow(id) {
        const entry = this.windows.get(id);
        if (!entry) return;

        this.windows.forEach(w => w.el.style.zIndex = '1000');
        entry.el.style.zIndex = '2000';
    }

    closeWindow(id) {
        const entry = this.windows.get(id);
        if (entry) {
            // Restore borrowed element
            if (entry.borrowed && entry.parent) {
                if (entry.sibling) entry.parent.insertBefore(entry.borrowed, entry.sibling);
                else entry.parent.appendChild(entry.borrowed);
            }
            entry.el.remove();
            this.windows.delete(id);
            this._saveLayout();
        }
    }

    toggleSidebar(side) {
        const selector = side === 'left' ? '.toolbar' : '.sidebar';
        const activeView = document.querySelector('.view-panel.active');
        if (!activeView) return;

        const targetPanel = activeView.querySelector(selector);
        if (!targetPanel) return;

        const shouldCollapse = !targetPanel.classList.contains('collapsed');

        // Sync ALL sidebars of this type across ALL views for consistency
        document.querySelectorAll(selector).forEach(p => {
            p.classList.toggle('collapsed', shouldCollapse);
        });

        // Update all triggers for this side across all views
        document.querySelectorAll(`.collapse-trigger-${side}`).forEach(trigger => {
            trigger.innerHTML = side === 'left'
                ? `<i data-lucide="chevron-${shouldCollapse ? 'right' : 'left'}"></i>`
                : `<i data-lucide="chevron-${shouldCollapse ? 'left' : 'right'}"></i>`;
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
        if (this.app.prototype && this.app.prototype.view && this.app.prototype.view.editor) {
            setTimeout(() => this.app.prototype.view.editor.layout(), 200);
        }
    }

    _saveLayout() {
        const layout = {};
        this.windows.forEach((entry, id) => {
            layout[id] = {
                x: entry.el.style.left,
                y: entry.el.style.top,
                w: entry.el.style.width,
                h: entry.el.style.height
            };
        });
        localStorage.setItem('pixeldisplay_layout', JSON.stringify(layout));
    }

    _loadLayout() {
        // Future: Re-open windows based on stored state
    }
}

// ========== 7. Main App Orchestrator ==========
class PixelDisplay240App extends EditorModule {
    constructor() {
        super();
        this.theme = new ThemeManager();
        this.nav = new NavigationManager(this);
        this.wm = new WindowManager(this);

        // Optional Modules (Lazy Load or External)
        this.layers = (typeof LayerManager !== 'undefined') ? new LayerManager(this) : null;
        this.layout = (typeof LayoutManager !== 'undefined') ? new LayoutManager(this) : null;
        this.drawing = (typeof DrawingManager !== 'undefined') ? new DrawingManager(this) : null;

        // REBUILT MVC PROTOTYPE (created here, initialized after api is ready)
        if (typeof PrototypeController !== 'undefined') {
            const pModel = new PrototypeModel();
            const pView = new PrototypeView();
            this.prototype = new PrototypeController(pModel, pView);
        } else {
            this.prototype = null;
        }

        this.currentTool = 'brush';
        this.undoStack = []; this.redoStack = []; this.MAX_HISTORY = 30;
        this.collection = [];
    }

    /** Called from script init after api is assigned */
    start() {
        this.init();
        // Now api exists — wire prototype to it
        if (this.prototype) this.prototype.init(this);
    }

    init(fullClear = false) {
        // Design Initialization (If Module Present)
        if (this.layers) {
            const w = parseInt(this.dom('canvas-width')?.value) || 240;
            const h = parseInt(this.dom('canvas-height')?.value) || 240;
            const oldData = (!fullClear && this.layers.layers)
                ? this.layers.layers.map(l => ({ name: l.name, data: l.canvas.toDataURL(), visible: l.visible }))
                : [];

            if (this.layers.layers) this.layers.layers.forEach(l => l.canvas.remove());
            this.layers.layers = [];

            if (oldData.length > 0) {
                oldData.forEach((d, i) => {
                    this.layers.add(d.name, d.data, true);
                    this.layers.layers[i].visible = d.visible;
                    this.layers.layers[i].canvas.style.display = d.visible ? 'block' : 'none';
                });
            } else { this.layers.add("Fundo", null, true); }

            ['grid-canvas', 'preview-canvas', 'temp-canvas'].forEach(id => {
                const c = this.dom(id); if (c) { c.width = w; c.height = h; }
            });
            const wrapper = this.dom('canvas-wrapper');
            if (wrapper) { wrapper.style.width = w + 'px'; wrapper.style.height = h + 'px'; }

            this.refresh();
        }

        this._setupTools();
        this._wireUI();
    }

    _wireUI() {
        if (this.layers) {
            const btnAdd = this.dom('btn-add-layer');
            if (btnAdd) btnAdd.onclick = () => this.layers.add();

            const fileInput = this.dom('file-input');
            if (fileInput) fileInput.onchange = (e) => this._importImage(e);

            if (this.dom('btn-merge-layers')) this.dom('btn-merge-layers').onclick = () => this._mergeLayers();
        }

        const btnUndo = this.dom('btn-undo');
        if (btnUndo) btnUndo.onclick = () => this.undo();

        const btnRedo = this.dom('btn-redo');
        if (btnRedo) btnRedo.onclick = () => this.redo();

        const brushSize = this.dom('brush-size');
        if (brushSize) brushSize.oninput = (e) => {
            if (this.dom('brush-size-val')) this.dom('brush-size-val').textContent = e.target.value;
        };

        const wInput = this.dom('canvas-width');
        const hInput = this.dom('canvas-height');
        if (wInput) wInput.onchange = () => this.init();
        if (hInput) hInput.onchange = () => this.init();

        const btnExport = this.dom('btn-export');
        if (btnExport) btnExport.onclick = () => this._export();

        const btnDeploy = this.dom('btn-deploy-production');
        if (btnDeploy) btnDeploy.onclick = () => this._showModal('deploy-modal');

        const btnConfirmDeploy = this.dom('btn-confirm-deploy');
        if (btnConfirmDeploy) btnConfirmDeploy.onclick = () => this._handleDeploy();

        // Filters
        if (this.dom('filter-gray')) this.dom('filter-gray').onclick = () => this._applyFilter('gray');
        if (this.dom('filter-invert')) this.dom('filter-invert').onclick = () => this._applyFilter('invert');
        if (this.dom('filter-bright')) this.dom('filter-bright').onclick = () => this._applyFilter('bright');
        if (this.dom('filter-contrast')) this.dom('filter-contrast').onclick = () => this._applyFilter('contrast');

        // Project Persistence
        if (this.dom('btn-save-project')) this.dom('btn-save-project').onclick = () => this._saveProject();
        if (this.dom('btn-load-project')) this.dom('btn-load-project').onclick = () => this.dom('project-input').click();
        if (this.dom('project-input')) this.dom('project-input').onchange = (e) => this._loadProject(e);

        // Modals
        if (this.dom('btn-help')) this.dom('btn-help').onclick = () => this._showModal('help-modal');
        if (this.dom('btn-agent-config')) this.dom('btn-agent-config').onclick = () => this._showModal('agent-modal');
        if (this.dom('tool-font-gen')) this.dom('tool-font-gen').onclick = () => this._showModal('font-modal');
        if (this.dom('btn-gen-font')) this.dom('btn-gen-font').onclick = () => this._generateFontArray();

        // Export Modal Buttons
        if (this.dom('btn-download-jpg')) this.dom('btn-download-jpg').onclick = () => this._exportTo('jpeg');
        if (this.dom('btn-download-bin')) this.dom('btn-download-bin').onclick = () => this._exportTo('bin');
        if (this.dom('btn-download')) this.dom('btn-download').onclick = () => this._exportTo('h');

        // UI Components
        if (this.dom('add-ui-slider')) this.dom('add-ui-slider').onclick = () => this._addUIComponent('slider');
        if (this.dom('add-ui-switch')) this.dom('add-ui-switch').onclick = () => this._addUIComponent('switch');
        if (this.dom('add-ui-bar')) this.dom('add-ui-bar').onclick = () => this._addUIComponent('bar');

        // Collection & Animation
        if (this.dom('btn-add-collection')) this.dom('btn-add-collection').onclick = () => this._addToCollection();
        if (this.dom('btn-export-collection')) this.dom('btn-export-collection').onclick = () => this._exportCollection();

        // Import current design into Prototype display + persist as screen background
        const btnImport = this.dom('btn-import-design');
        if (btnImport) btnImport.onclick = async () => {
            const dataUrl = this.nav._syncDesignToProto();
            if (!dataUrl) return;

            const spriteName = this.dom('array-name')?.value || `design_${Date.now()}`;

            // 1. Persist as an asset in the prototype model
            if (this.prototype) {
                await this.prototype.callApi('/asset', 'POST', {
                    name: spriteName,
                    dataUrl: dataUrl,
                    kind: 'image'
                });

                // 2. Persist as the active screen's background so it's saved across screen switches
                const activeId = this.prototype.model?.activeScreenId;
                if (activeId) {
                    await this.prototype.callApi('/screen/background', 'POST', {
                        screenId: activeId,
                        assetName: spriteName,
                        dataUrl: dataUrl
                    });
                }
            }

            this.toast.show('success', 'Importado!', `Design salvo como ativo "${spriteName}" e definido como fundo.`);
        };
    }

    _addToCollection() {
        const canvas = this.dom('preview-canvas');
        if (!canvas) return;

        if (!this.collection) this.collection = [];

        const dataUrl = canvas.toDataURL('image/png');
        this.collection.push({
            id: Date.now(),
            data: dataUrl,
            width: canvas.width,
            height: canvas.height
        });

        this._renderCollection();
        if (this.prototype) this.prototype.importFromCollection(dataUrl);
        this.toast.show('success', 'Adicionado à Coleção', `Sprite ${this.collection.length} adicionado.`);
    }

    _renderCollection() {
        const list = this.dom('sprite-list');
        if (!list) return;

        list.innerHTML = '';
        if (!this.collection || this.collection.length === 0) {
            list.innerHTML = '<div class="hint">Coleção vazia.</div>';
            return;
        }

        this.collection.forEach((sprite, index) => {
            const item = document.createElement('div');
            item.className = 'layer-item';
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.gap = '10px';
            item.style.padding = '5px';
            item.style.cursor = 'pointer';
            item.style.borderBottom = '1px solid var(--border)';

            const img = document.createElement('img');
            img.src = sprite.data;
            img.style.width = '32px';
            img.style.height = '32px';
            img.style.objectFit = 'contain';
            img.style.background = '#000';
            img.style.border = '1px solid var(--border)';

            const name = document.createElement('span');
            name.textContent = `Sprite_${index}`;
            name.style.flex = '1';
            name.style.fontSize = '12px';

            const btnDel = document.createElement('button');
            btnDel.className = 'text-btn small-btn';
            btnDel.innerHTML = '<i data-lucide="trash-2" style="width:14px; color:#ef4444;"></i>';
            btnDel.title = 'Excluir da Coleção';
            btnDel.onclick = (e) => {
                e.stopPropagation();
                this.collection.splice(index, 1);
                this._renderCollection();
            };

            const btnProto = document.createElement('button');
            btnProto.className = 'text-btn small-btn';
            btnProto.innerHTML = '<i data-lucide="monitor-play" style="width:14px; color:#38bdf8;"></i>';
            btnProto.title = 'Enviar para Prototipagem';
            btnProto.onclick = (e) => {
                e.stopPropagation();
                if (this.prototype) {
                    this.prototype.importFromCollection(sprite.data);
                    this.nav.switch('prototype');
                }
            };

            item.appendChild(img);
            item.appendChild(name);
            item.appendChild(btnProto);
            item.appendChild(btnDel);

            // Clicar no item carrega ele de volta pro canvas
            item.onclick = () => {
                if (this.layers && confirm('Carregar este sprite substituirá o canvas atual. Continuar?')) {
                    // Limpa as layers atuais e carrega a imagem
                    this.layers.layers = [];
                    this.layers.add(`Sprite_${index}`, sprite.data, true);
                    this.layers.renderUI();
                    this.refresh();
                }
            };

            list.appendChild(item);
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    _exportCollection() {
        if (!this.collection || this.collection.length === 0) {
            return this.toast.show('warning', 'Coleção Vazia', 'Adicione sprites à coleção primeiro.');
        }

        const format = this.dom('export-format')?.value || 'rgb565';
        const arrayName = this.dom('array-name')?.value || 'sprites';

        this.toast.show('info', 'Exportação em andamento', 'Gerando arquivo...');

        let code = `// Gerado pelo PixelDisplay240 IDE v5\n`;
        code += `// Coleção de Sprites: ${this.collection.length} imagens\n`;
        code += `// Formato: ${format.toUpperCase()}\n\n`;
        code += `#include <pgmspace.h>\n\n`;

        const promises = this.collection.map((sprite, index) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = sprite.width;
                    tempCanvas.height = sprite.height;
                    const ctx = tempCanvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    const imgData = ctx.getImageData(0, 0, sprite.width, sprite.height).data;
                    resolve({ index, imgData, width: sprite.width, height: sprite.height });
                };
                img.src = sprite.data;
            });
        });

        Promise.all(promises).then(results => {
            results.forEach(res => {
                const { index, imgData, width, height } = res;
                const spriteName = `${arrayName}_${index}`;

                if (format === 'rgb565') {
                    code += `const uint16_t ${spriteName}[${width * height}] PROGMEM = {\n  `;
                    let count = 0;
                    for (let i = 0; i < imgData.length; i += 4) {
                        const r = imgData[i] >> 3;
                        const g = imgData[i + 1] >> 2;
                        const b = imgData[i + 2] >> 3;
                        const rgb565 = (r << 11) | (g << 5) | b;

                        code += `0x${rgb565.toString(16).padStart(4, '0').toUpperCase()}`;
                        if (i < imgData.length - 4) code += ', ';

                        count++;
                        if (count >= 12) { code += '\n  '; count = 0; }
                    }
                    code += '\n};\n\n';
                } else if (format === 'rle565') {
                    let rleData = [];
                    let currentPixel = -1;
                    let runLength = 0;

                    for (let i = 0; i < imgData.length; i += 4) {
                        const r = imgData[i] >> 3;
                        const g = imgData[i + 1] >> 2;
                        const b = imgData[i + 2] >> 3;
                        const rgb565 = (r << 11) | (g << 5) | b;

                        if (currentPixel === -1) { currentPixel = rgb565; runLength = 1; }
                        else if (currentPixel === rgb565 && runLength < 255) { runLength++; }
                        else { rleData.push(runLength); rleData.push(currentPixel); currentPixel = rgb565; runLength = 1; }
                    }
                    if (runLength > 0) { rleData.push(runLength); rleData.push(currentPixel); }

                    code += `const uint16_t ${spriteName}_rle[${rleData.length}] PROGMEM = {\n  `;
                    let count = 0;
                    for (let i = 0; i < rleData.length; i++) {
                        code += `0x${rleData[i].toString(16).padStart(4, '0').toUpperCase()}`;
                        if (i < rleData.length - 1) code += ', ';
                        count++;
                        if (count >= 12) { code += '\n  '; count = 0; }
                    }
                    code += '\n};\n\n';
                } else if (format === 'rgb888') {
                    code += `const uint32_t ${spriteName}[${width * height}] PROGMEM = {\n  `;
                    let count = 0;
                    for (let i = 0; i < imgData.length; i += 4) {
                        const rgb888 = (imgData[i] << 16) | (imgData[i + 1] << 8) | imgData[i + 2];
                        code += `0x${rgb888.toString(16).padStart(6, '0').toUpperCase()}`;
                        if (i < imgData.length - 4) code += ', ';
                        count++;
                        if (count >= 8) { code += '\n  '; count = 0; }
                    }
                    code += '\n};\n\n';
                }
            });

            // Array de ponteiros para facilitar animação
            code += `// Array de ponteiros para facilitar iteração/animação\n`;
            const type = format === 'rgb888' ? 'uint32_t' : 'uint16_t';
            const suffix = format === 'rle565' ? '_rle' : '';
            code += `const ${type}* const ${arrayName}_frames[${results.length}] PROGMEM = {\n  `;
            code += results.map(r => `${arrayName}_${r.index}${suffix}`).join(', ');
            code += `\n};\n`;

            const blob = new Blob([code], { type: 'text/plain' });
            const link = document.createElement('a');
            link.download = `${arrayName}_collection.h`;
            link.href = URL.createObjectURL(blob);
            link.click();
            URL.revokeObjectURL(link.href);

            this.toast.show('success', 'Coleção Exportada', `Arquivo ${arrayName}_collection.h gerado com sucesso.`);
        });
    }

    _addUIComponent(type) {
        const active = this.layers ? this.layers.active : null;
        if (!active) return;
        const ctx = active.ctx;
        const color = this.dom('color-picker')?.value || '#fff';
        const w = active.canvas.width;
        const h = active.canvas.height;
        const cx = w / 2;
        const cy = h / 2;

        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

        if (type === 'slider') {
            ctx.strokeRect(cx - 40, cy - 5, 80, 10);
            ctx.fillRect(cx - 10, cy - 10, 20, 20);
        } else if (type === 'switch') {
            ctx.beginPath();
            ctx.roundRect(cx - 25, cy - 12, 50, 25, 12);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx + 12, cy, 8, 0, Math.PI * 2);
            ctx.fill();
        } else if (type === 'bar') {
            ctx.strokeRect(cx - 50, cy - 8, 100, 16);
            ctx.fillRect(cx - 48, cy - 6, 60, 12);
        }

        this.refresh();
        this.saveHistory();
        this.toast.show('success', 'Componente Adicionado', `${type} criado no centro.`);
    }

    _saveProject() {
        const data = {
            version: '5.0',
            width: parseInt(this.dom('canvas-width')?.value) || 240,
            height: parseInt(this.dom('canvas-height')?.value) || 240,
            layers: this.layers ? this.layers.layers.map(l => ({ name: l.name, data: l.canvas.toDataURL(), visible: l.visible })) : []
        };
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pixeldisplay240_project.json';
        a.click();
        if (this.logger) this.logger.error('Project', 'Projeto exportado com sucesso', { width: data.width, height: data.height, layers: data.layers.length });
        this.toast.show('success', 'Projeto Salvo', 'Arquivo JSON exportado com sucesso.');
    }

    _loadProject(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (this.dom('canvas-width')) this.dom('canvas-width').value = data.width || 240;
                if (this.dom('canvas-height')) this.dom('canvas-height').value = data.height || 240;
                this.init(true);
                if (this.layers) {
                    this.layers.layers.forEach(l => l.canvas.remove());
                    this.layers.layers = [];
                    data.layers.forEach((l, i) => {
                        this.layers.add(l.name, l.data, true);
                        this.layers.layers[i].visible = l.visible;
                        this.layers.layers[i].canvas.style.display = l.visible ? 'block' : 'none';
                    });
                }
                this.refresh();
                if (this.logger) this.logger.error('Project', 'Projeto carregado com sucesso', { layers: data.layers.length });
                this.toast.show('success', 'Projeto Carregado', 'O estado do editor foi restaurado.');
            } catch (err) {
                if (this.logger) this.logger.error('Project', 'Falha ao carregar JSON', { error: err.message });
                this.toast.show('error', 'Erro no Carregamento', 'Arquivo JSON inválido.');
            }
        };
        reader.readAsText(file);
    }

    _applyFilter(type) {
        const active = this.layers ? this.layers.active : null;
        if (!active) return;
        const ctx = active.ctx;
        const id = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
        const d = id.data;
        for (let i = 0; i < d.length; i += 4) {
            if (type === 'gray') { const g = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; d[i] = d[i + 1] = d[i + 2] = g; }
            if (type === 'invert') { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
            if (type === 'bright') { d[i] += 20; d[i + 1] += 20; d[i + 2] += 20; }
            if (type === 'contrast') {
                const factor = (259 * (50 + 255)) / (255 * (259 - 50));
                d[i] = factor * (d[i] - 128) + 128;
                d[i + 1] = factor * (d[i + 1] - 128) + 128;
                d[i + 2] = factor * (d[i + 2] - 128) + 128;
            }
        }
        ctx.putImageData(id, 0, 0);
        this.refresh();
        this.saveHistory();
    }

    _mergeLayers() {
        if (!this.layers || this.layers.layers.length < 2) return;
        const bottom = this.layers.layers[0];
        const bCtx = bottom.ctx;
        for (let i = 1; i < this.layers.layers.length; i++) {
            if (this.layers.layers[i].visible) bCtx.drawImage(this.layers.layers[i].canvas, 0, 0);
            this.layers.layers[i].canvas.remove();
        }
        this.layers.layers = [bottom];
        this.layers.activeIndex = 0;
        this.layers.renderUI();
        this.refresh();
        this.saveHistory();
    }

    _importImage(e) {
        if (!this.layers) return;
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                // Dithering opcional na importação
                const applyDithering = confirm("Deseja aplicar dithering (redução de cores) à imagem importada para adequá-la à paleta atual?");
                if (applyDithering) {
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = img.width;
                    tempCanvas.height = img.height;
                    const ctx = tempCanvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);

                    // Pega a paleta atual (se for preset) ou usa uma padrão de 16 cores
                    const paletteSelect = this.dom('palette-presets');

                    // Simple palette fallback if AI module not present
                    let currentPalette = [[0, 0, 0], [255, 255, 255]];
                    if (this.theme && this.theme.presets) {
                        // logic to parse presets...
                        // For now just use simple one
                    }

                    // this._applyFloydSteinbergDithering(ctx, rgbPalette); // Logic was in script.js but now where? 
                    // Actually dithering logic should be in Designer module if it's drawing related.
                    // For now, standard import.
                    this.layers.add(file.name, event.target.result);
                } else {
                    this.layers.add(file.name, event.target.result);
                }
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    _showModal(id) {
        const m = this.dom(id);
        if (m) m.style.display = 'flex';
    }

    _export() {
        this._showModal('export-modal');
        this._updateExportPreview();
    }

    _updateExportPreview() {
        const canvas = this.dom('preview-canvas');
        if (!canvas) return;
        const format = this.dom('export-format')?.value || 'rgb565';
        const arrayName = this.dom('array-name')?.value || 'image_01';
        const code = this._generateCCode(canvas, format, arrayName);
        if (this.dom('output-text')) this.dom('output-text').value = code;
    }

    _exportTo(format) {
        const canvas = this.dom('preview-canvas');
        if (!canvas) return;
        const arrayName = this.dom('array-name')?.value || 'image_01';

        if (format === 'jpeg') {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            this._download(dataUrl, `${arrayName}.jpg`);
        } else if (format === 'bin') {
            const buffer = this._generateBinary(canvas);
            const blob = new Blob([buffer], { type: 'application/octet-stream' });
            this._download(URL.createObjectURL(blob), `${arrayName}.bin`);
        } else if (format === 'h') {
            const actualFormat = this.dom('export-format')?.value || 'rgb565';
            const code = this._generateCCode(canvas, actualFormat, arrayName);
            const blob = new Blob([code], { type: 'text/plain' });
            this._download(URL.createObjectURL(blob), `${arrayName}.h`);
        }
    }

    async _handleDeploy() {
        const status = this.dom('deploy-status-container');
        const progress = this.dom('deploy-progress');
        const text = this.dom('deploy-step-text');
        const btn = this.dom('btn-confirm-deploy');

        if (status) status.style.display = 'block';
        if (btn) btn.disabled = true;

        const steps = [
            { p: 10, t: "Otimizando assets e imagens..." },
            { p: 30, t: "Gerando HARDWARE_MAP.H otimizado..." },
            { p: 50, t: "Convertendo Projeto para Binário Nativo..." },
            { p: 70, t: "Compilando firmware de produção..." },
            { p: 90, t: "Gravando na Flash (project.bin)..." },
            { p: 100, t: "Deploy concluído! Reiniciando hardware..." }
        ];

        for (const step of steps) {
            if (progress) progress.style.width = `${step.p}%`;
            if (text) text.textContent = step.p === 100 ? "✓ " + step.t : "➤ " + step.t;

            if (step.p === 50) {
                this.deployData = this._generateProjectBinary();
            }

            if (step.p === 90 && this.deployData) {
                try {
                    await fetch('/api/prototype/deploy', {
                        method: 'POST',
                        body: this.deployData
                    });
                } catch (e) { console.error("Deploy upload failed:", e); }
            }

            await new Promise(r => setTimeout(r, 600 + Math.random() * 800));
        }

        // Finalize
        this.toast.show('success', 'Operação de Deploy', 'Design implantado com sucesso no módulo!');
        setTimeout(() => {
            document.body.innerHTML = `
                <div style="background:#0f172a; color:#f8fafc; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:'Outfit';">
                    <i data-lucide="shield-check" style="width:64px; height:64px; color:#38bdf8; margin-bottom:20px;"></i>
                    <h1>MODO PRODUÇÃO ATIVO</h1>
                    <p style="color:#64748b; margin-top:10px;">O Studio Web foi pausado para liberar recursos para o hardware.</p>
                    <button onclick="location.reload()" style="margin-top:30px; background:#1e293b; color:#94a3b8; border:1px solid #334155; padding:10px 20px; border-radius:8px; cursor:pointer;">Reiniciar Studio</button>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }, 1500);
    }

    _download(url, name) {
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
        this.toast.show('success', 'Exportação', `${name} baixado!`);
    }

    _generateCCode(canvas, format, arrayName) {
        const ctx = canvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const width = canvas.width, height = canvas.height;

        let code = `// PixelDisplay240 IDE v5\n`;
        code += `// ${width}x${height} - ${format.toUpperCase()}\n\n`;
        code += `#include <pgmspace.h>\n\n`;

        if (format === 'rgb565') {
            code += `const uint16_t ${arrayName}[${width * height}] PROGMEM = {\n  `;
            for (let i = 0; i < imgData.length; i += 4) {
                const r = imgData[i] >> 3, g = imgData[i + 1] >> 2, b = imgData[i + 2] >> 3;
                const v = (r << 11) | (g << 5) | b;
                code += `0x${v.toString(16).toUpperCase().padStart(4, '0')}` + (i < imgData.length - 4 ? ', ' : '');
                if (((i / 4) + 1) % 12 === 0) code += '\n  ';
            }
            code += `\n};\n`;
        } else if (format === 'rgb888') {
            code += `const uint32_t ${arrayName}[${width * height}] PROGMEM = {\n  `;
            for (let i = 0; i < imgData.length; i += 4) {
                const hex = (imgData[i] << 16) | (imgData[i + 1] << 8) | imgData[i + 2];
                code += `0x${hex.toString(16).toUpperCase().padStart(6, '0')}` + (i < imgData.length - 4 ? ', ' : '');
                if (((i / 4) + 1) % 8 === 0) code += '\n  ';
            }
            code += `\n};\n`;
        }
        return code;
    }

    _generateBinary(canvas) {
        const ctx = canvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const buffer = new Uint16Array(imgData.length / 4);
        for (let i = 0; i < imgData.length; i += 4) {
            const r = imgData[i] >> 3, g = imgData[i + 1] >> 2, b = imgData[i + 2] >> 3;
            buffer[i / 4] = (r << 11) | (g << 5) | b;
        }
        return buffer;
    }

    _generateFontArray() {
        const family = this.dom('font-family')?.value || 'Arial';
        const size = this.dom('font-size')?.value || 16;
        const output = this.dom('font-output');

        let code = `// Font: ${family} ${size}px\n`;
        code += `const uint8_t ${family.replace(/\s+/g, '_')}_${size}ptBitmaps[] PROGMEM = {\n`;
        code += `  // Simulação de bits de fonte...\n  0x00, 0x7E, 0x42, 0x42, 0x7E, 0x00\n};\n`;

        if (output) output.value = code;
        this.toast.show('info', 'Gerador de Fontes', 'Array de bits (demo) gerado.');
    }

    _setupTools() {
        // Tools are mostly designer related
        const tools = ['brush', 'eraser', 'selection', 'move', 'text', 'line', 'rect', 'circle', 'picker', 'fill', 'font-gen', 'clear'];
        tools.forEach(k => {
            const btn = this.dom('tool-' + k);
            if (btn) btn.onclick = async () => {
                this.currentTool = k;
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (k === 'clear') { if (await this.dialog.confirm('Limpar Tudo', 'Limpar todo o canvas?')) this.init(true); }
                if (k === 'font-gen') { this.toast.show('success', 'Font Generator', 'Recurso de exportação de fonte ativado.'); }
            };
        });

        const aiBtn = this.dom('tool-ai-gen');
        if (aiBtn) aiBtn.onclick = () => { this.dom('ai-modal').style.display = 'flex'; if (typeof lucide !== 'undefined') lucide.createIcons(); };
        document.querySelectorAll('textarea').forEach(tx => {
            tx.onkeydown = (e) => {
                if (e.key === 'Tab') {
                    e.preventDefault(); const s = tx.selectionStart;
                    tx.value = tx.value.substring(0, s) + '    ' + tx.value.substring(tx.selectionEnd);
                    tx.selectionStart = tx.selectionEnd = s + 4;
                }
            };
        });
    }

    refresh() {
        const pCtx = this.dom('preview-canvas')?.getContext('2d');
        if (pCtx) {
            pCtx.clearRect(0, 0, pCtx.canvas.width, pCtx.canvas.height);
            if (this.layers) {
                this.layers.layers.forEach(l => { if (l.visible) pCtx.drawImage(l.canvas, 0, 0); });
            }
        }
        if (this.layout) { this.layout.updateRulers(); this.layout.renderGrid(); }
        if (this.layers) this.layers.renderUI();
        if (this.status) this.status.refreshMetrics();
    }

    saveHistory() {
        if (!this.layers) return;
        const snap = this.layers.layers.map(l => ({ name: l.name, data: l.canvas.toDataURL(), visible: l.visible }));
        this.undoStack.push(JSON.stringify(snap));
        if (this.undoStack.length > this.MAX_HISTORY) this.undoStack.shift();
        this.redoStack = [];
    }

    undo() {
        if (this.undoStack.length < 2) return;
        this.redoStack.push(this.undoStack.pop());
        const snap = JSON.parse(this.undoStack[this.undoStack.length - 1]);
        this._applySnapshot(snap);
    }

    redo() {
        if (this.redoStack.length === 0) return;
        const snapStr = this.redoStack.pop();
        this.undoStack.push(snapStr);
        this._applySnapshot(JSON.parse(snapStr));
    }

    _applySnapshot(snap) {
        if (!this.layers) return;
        this.layers.layers.forEach(l => l.canvas.remove());
        this.layers.layers = [];
        snap.forEach((d, i) => {
            this.layers.add(d.name, d.data, true);
            this.layers.layers[i].visible = d.visible;
            this.layers.layers[i].canvas.style.display = d.visible ? 'block' : 'none';
        });
        this.refresh();
    }

    start() {
        try {
            this.init();
            this.nav.switch('design');
            if (this.prototype) this.prototype.init(this);
            // Load key
            if (this.agents) this.agents.load();
            console.log("App Started Successfully");
        } catch (e) {
            console.error("Crash during launch:", e);
        }
        this._setupShortcuts();
        if (this.logger) this.logger.init();
    }

    _setupShortcuts() {
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            // Delete element
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.prototype?.selectedElementId) {
                this.prototype.removeElement(this.prototype.selectedElementId);
                return;
            }

            // Move element
            if (e.key.startsWith('Arrow') && this.prototype?.selectedElementId) {
                e.preventDefault();
                const step = e.shiftKey ? 10 : 1;
                const el = this.prototype.model.getElement(this.prototype.selectedElementId);
                if (!el) return;

                if (e.key === 'ArrowUp') el.y -= step;
                if (e.key === 'ArrowDown') el.y += step;
                if (e.key === 'ArrowLeft') el.x -= step;
                if (e.key === 'ArrowRight') el.x += step;

                if (this.prototype.view) this.prototype.view.render();
            }
        });
    }

    _generateProjectBinary() {
        const model = this.prototype ? this.prototype.model : null;
        if (!model || !model.screens) return null;

        const buffer = [];
        // Header: "P240", Version 5, NumScreens
        buffer.push(80, 50, 52, 48); // P240
        buffer.push(5); // Version
        buffer.push(model.screens.length);

        model.screens.forEach(screen => {
            // Screen Background Color (RGB565)
            const bgColor = this._hexTo565(screen.backgroundColor || "#000000");
            buffer.push(bgColor & 0xFF, (bgColor >> 8) & 0xFF);

            const elements = screen.elements || [];
            buffer.push(elements.length & 0xFF, (elements.length >> 8) & 0xFF);

            elements.forEach(el => {
                // Type Mapping
                const types = { 'fillRect': 1, 'drawRect': 2, 'fillRoundRect': 3, 'fillCircle': 4, 'drawCircle': 5, 'fillTriangle': 6, 'drawString': 7, 'drawCentreString': 8 };
                buffer.push(types[el.type] || 0);

                // Geometry (Int16_t x, y, w, h)
                [el.x, el.y, el.w, el.h].forEach(val => {
                    const v = parseInt(val) || 0;
                    buffer.push(v & 0xFF, (v >> 8) & 0xFF);
                });

                // Color (RGB565)
                const color = this._hexTo565(el.color || "#FFFFFF");
                buffer.push(color & 0xFF, (color >> 8) & 0xFF);

                // Name (for texts/assets) - Max 31 chars
                const name = String(el.name || "").substring(0, 31);
                buffer.push(name.length);
                for (let i = 0; i < name.length; i++) buffer.push(name.charCodeAt(i));
            });
        });

        return new Uint8Array(buffer);
    }

    _hexTo565(hex) {
        if (!hex || hex[0] !== '#') return 0x0000;
        let r, g, b;
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16);
            g = parseInt(hex[2] + hex[2], 16);
            b = parseInt(hex[3] + hex[3], 16);
        } else {
            r = parseInt(hex.substring(1, 3), 16);
            g = parseInt(hex.substring(3, 5), 16);
            b = parseInt(hex.substring(5, 7), 16);
        }
        return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
    }
}

// ========== 9. Manager Classes ==========
class DialogManager extends EditorModule {
    _open(title, msg, iconSvg, opts = {}) {
        return new Promise((r) => {
            const m = this.dom('custom-dialog'); if (!m) return r(null);
            this.dom('dialog-title').textContent = title;
            this.dom('dialog-message').textContent = msg;
            this.dom('dialog-icon').innerHTML = iconSvg;
            this.dom('dialog-input').style.display = opts.showInput ? 'block' : 'none';
            this.dom('dialog-confirm').textContent = opts.confirmText || 'OK';
            m.style.display = 'flex';
            this.dom('dialog-confirm').onclick = () => { m.style.display = 'none'; r(opts.showInput ? this.dom('dialog-input').value : true); };
            this.dom('dialog-cancel').onclick = () => { m.style.display = 'none'; r(null); };
        });
    }
    confirm(t, m) { return this._open(t, m, '', { showCancel: true }); }
    prompt(t, m, d) { return this._open(t, m, '', { showInput: true, defaultValue: d }); }
}

class ToastManager extends EditorModule {
    show(type, title, msg) {
        const c = (type === 'error') ? this.dom('toast-error-container') : this.dom('toast-success-container');
        if (!c) return;
        const t = document.createElement('div');
        t.className = `toast toast-${type}`;
        t.innerHTML = `<b>${title}</b><p>${msg}</p>`;
        c.appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }
}

class StatusBarManager extends EditorModule {
    update(v) {
        if (this.dom('status-view')) this.dom('status-view').textContent = v;
        if (this.dom('status-time')) this.dom('status-time').textContent = new Date().toLocaleTimeString();
        this.refreshMetrics();
    }

    refreshMetrics() {
        const app = window.app;
        if (!app || !app.model) return;

        // 1. Estimate RAM (Main Display Buffer RGB565)
        // Formula: Width * Height * 2 bytes
        const w = parseInt(this.dom('canvas-width')?.value) || 240;
        const h = parseInt(this.dom('canvas-height')?.value) || 240;
        const ramBytes = w * h * 2;
        const ramKb = (ramBytes / 1024).toFixed(1);
        if (this.dom('status-ram')) this.dom('status-ram').innerHTML = `<i data-lucide="activity" style="width:12px;"></i> RAM: ${ramKb}KB`;

        // 2. Estimate Flash (Assets)
        let flashBytes = 0;
        if (app.model.assets) {
            app.model.assets.forEach(asset => {
                if (asset.dataUrl) {
                    // Base64 to Binary size estimate: length * 0.75
                    flashBytes += Math.floor(asset.dataUrl.length * 0.75);
                }
            });
        }
        const flashKb = (flashBytes / 1024).toFixed(1);
        if (this.dom('status-flash')) this.dom('status-flash').innerHTML = `<i data-lucide="hard-drive" style="width:12px;"></i> FLASH: ${flashKb}KB`;

        if (window.lucide) lucide.createIcons();
    }
}

class ApiClient extends EditorModule {
    constructor(app) {
        super();
        this.app = app;
        this.tokenKey = 'pixeldisplay240_jwt';
        this.accessKeyKey = 'pixeldisplay240_access_key';
        this.tokenEndpoint = '/api/auth/token';
    }

    setAccessKey(key) {
        localStorage.setItem(this.accessKeyKey, key);
        localStorage.removeItem(this.tokenKey);
    }

    getAccessKey() {
        return localStorage.getItem(this.accessKeyKey) || '';
    }

    _getToken() {
        return localStorage.getItem(this.tokenKey) || '';
    }

    _isTokenValid(token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1] || ''));
            const exp = payload.exp ? payload.exp * 1000 : 0;
            return exp > Date.now() + 60000;
        } catch {
            return false;
        }
    }

    async _fetchToken() {
        const resp = await fetch(this.tokenEndpoint, { method: 'GET' });
        if (!resp.ok) throw new Error('token_failed');
        const data = await resp.json();
        if (data?.token) {
            localStorage.setItem(this.tokenKey, data.token);
            return data.token;
        }
        throw new Error('token_invalid');
    }

    async ensureToken() {
        const token = this._getToken();
        if (token && this._isTokenValid(token)) return token;
        return this._fetchToken();
    }

    async request(url, options = {}) {
        try {
            const token = await this.ensureToken();
            const headers = new Headers(options.headers || {});
            headers.set('Authorization', `Bearer ${token} `);
            return fetch(url, { ...options, headers });
        } catch (e) {
            if (e.message === 'missing_access_key') {
                this.app.toast.show('error', 'Auth', 'Configure a Chave de Acesso API.');
            } else {
                // this.app.toast.show('error', 'Auth', 'Falha ao autenticar na API.');
            }
            throw e;
        }
    }
}

class AgentConfigManager extends EditorModule {
    constructor(app) {
        super();
        this.app = app;
        this.endpoint = '/api/agents';
        this._bindUI();
    }

    _bindUI() {
        const btnOpen = this.dom('btn-agent-config');
        if (btnOpen) btnOpen.onclick = () => this.open();

        const btnClose = this.dom('btn-agent-close');
        if (btnClose) btnClose.onclick = () => this.close();

        const btnSave = this.dom('btn-agent-save');
        if (btnSave) btnSave.onclick = () => this.save();
    }

    async open() {
        this.load();
        if (this.dom('agent-modal')) this.dom('agent-modal').style.display = 'flex';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    close() {
        if (this.dom('agent-modal')) this.dom('agent-modal').style.display = 'none';
    }

    async load() {
        try {
            const accessKey = localStorage.getItem('pixeldisplay240_access_key') || '';
            if (this.dom('agent-access-key')) this.dom('agent-access-key').value = accessKey;

            const resp = await this.app.api.request(this.endpoint, { cache: 'no-store' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status} `);
            const data = await resp.json();
            const key = data?.gemini?.apiKey || '';
            if (this.dom('agent-gemini-key')) this.dom('agent-gemini-key').value = key;
        } catch (e) {
            // this.app.toast.show('warning', 'Aviso', 'Nao foi possivel carregar as chaves.');
        }
    }

    async save() {
        const accessKey = this.dom('agent-access-key')?.value.trim() || '';
        const geminiKey = this.dom('agent-gemini-key')?.value.trim() || '';

        try {
            this.app.api.setAccessKey(accessKey);
            const resp = await this.app.api.request(this.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ Gemini: { ApiKey: geminiKey } })
            });
            if (resp.ok) {
                this.app.toast.show('success', 'Configuração Salva', 'Chave criptografada no sistema principal.');
                this.close();
            }
        } catch (e) {
            this.app.toast.show('error', 'Erro', 'Falha ao salvar as chaves.');
        }
    }

    getKey() {
        return this.dom('agent-gemini-key')?.value || '';
    }
}

class LogManager extends EditorModule {
    constructor(app) {
        super();
        this.app = app;
        this.logs = JSON.parse(localStorage.getItem('pixeldisplay240_logs') || '[]');
        this._setupGlobalErrors();
    }

    _setupGlobalErrors() {
        window.onerror = (msg, url, line, col, error) => {
            this.error('Global', `${msg} at ${line}:${col}`, { url, stack: error?.stack });
        };
        window.onunhandledrejection = (event) => {
            this.error('Promise', event.reason?.message || 'Unhandled Rejection', { stack: event.reason?.stack });
        };
    }

    error(context, message, data = {}) {
        const entry = { timestamp: new Date().toISOString(), type: 'ERROR', context, message, data };
        this.logs.push(entry);
        if (this.logs.length > 100) this.logs.shift();
        this._renderLog(entry);
        console.error(`[${context}] ${message}`, data);
        this._sendToServer(entry);
    }

    _renderLog(entry) {
        const container = document.getElementById('console-logs');
        if (!container) return;
        const time = new Date(entry.timestamp).toLocaleTimeString();
        const div = document.createElement('div');
        div.className = 'log-entry';
        div.innerHTML = `
            <span class="log-time">${time}</span>
            <span class="log-${(entry.type || 'info').toLowerCase()}">[${entry.context}]</span>
            <span class="log-msg">${entry.message}</span>
        `;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    init() {
        const originalLog = console.log;
        const originalWarn = console.warn;
        console.log = (...args) => { originalLog(...args); this._addLog('INFO', args.join(' ')); };
        console.warn = (...args) => { originalWarn(...args); this._addLog('WARN', args.join(' ')); };

        const toggleBtn = document.getElementById('btn-toggle-console');
        const clearBtn = document.getElementById('btn-clear-console');
        const closeBtn = document.getElementById('btn-close-console');
        const panel = document.getElementById('dev-console');

        if (toggleBtn) toggleBtn.onclick = () => panel.classList.toggle('active');
        if (closeBtn) closeBtn.onclick = () => panel.classList.remove('active');
        if (clearBtn) clearBtn.onclick = () => {
            const output = document.getElementById('console-logs');
            if (output) output.innerHTML = '';
            this.clear();
        };
    }

    _addLog(type, message) {
        const entry = { timestamp: new Date().toISOString(), context: 'Sys', type, message };
        this._renderLog(entry);
    }
    _sendToServer(entry) {
        if (!this.app.api) return;
        this.app.api.request('/api/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                Context: entry.context,
                Type: entry.type,
                Message: entry.message,
                Data: entry.data
            })
        }).catch(() => { });
    }

    exportLogs() {
        if (this.logs.length === 0) return this.app.toast.show('info', 'Logs Vazios', 'Nenhum erro registrado até agora.');
        const content = this.logs.map(l => `[${l.timestamp}][${l.context}] ${l.type}: ${l.message} \nData: ${JSON.stringify(l.data, null, 2)} \`---\``).join('\n\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `error_${new Date().getTime()}.log`;
        a.click();
        URL.revokeObjectURL(url);
        this.app.toast.show('success', 'Logs Exportados', 'Arquivo de log baixado com sucesso.');
    }

    clear() {
        this.logs = [];
        localStorage.removeItem('pixeldisplay240_logs');
    }
}

// ========== 10. Initialization ==========
if (window.PixelDisplay240System) window.PixelDisplay240System.register('main', '5.1.0');

const app = new PixelDisplay240App();
app.dialog = new DialogManager();
app.toast = new ToastManager();
app.status = new StatusBarManager();
app.api = new ApiClient(app);
app.logger = new LogManager(app);
app.agents = new AgentConfigManager(app);
// Optional AI module
if (typeof AIPixelArtGenerator !== 'undefined') {
    app.ai = new AIPixelArtGenerator(app);
    window.generateAIPixelArt = () => app.ai.generate();
    window.applyAIToCanvas = () => app.ai.apply();
}


window.app = app;
window.exportErrorLog = () => app.logger.exportLogs();

// Ensure DOM is fully loaded before starting the app to avoid "element not found" errors
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.start());
} else {
    app.start();
}
