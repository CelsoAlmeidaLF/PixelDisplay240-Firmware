/**
 * Prototype View - Handles DOM manipulation, canvas rendering, and TFT code parsing.
 */
if (window.PixelDisplay240System) window.PixelDisplay240System.register('view', '5.1.0');

class PrototypeView {
    constructor(apiClient) {
        this.api = apiClient;
        this.dom = {
            screenList: document.getElementById('screen-list'),
            mainGallery: document.getElementById('proto-main-container'),
            canvas: document.getElementById('proto-canvas'),
            assetList: document.getElementById('proto-asset-list'),
            codePreview: document.getElementById('proto-code-preview'),
            elementList: document.getElementById('proto-element-list'),
            interactionPanel: document.getElementById('proto-interaction-panel'),
            addScreenBtn: document.getElementById('btn-add-screen'),
            syncStatus: document.getElementById('proto-sync-status')
        };

        if (this.dom.canvas) {
            this.ctx = this.dom.canvas.getContext('2d');
            this.setupCanvasEvents();
        }

        // Initialize Monaco Editor if available
        this.editor = null;
        this.initMonaco();

        // Fallback for hidden textarea sync
        if (this.dom.codePreview) {
            this.dom.codePreview.oninput = () => {
                this._codeEditedManually = true;
                const code = this.dom.codePreview.value;
                if (this.editor && this.editor.getValue() !== code) {
                    this.editor.setValue(code);
                }
                this.parseAndRenderCode(code);
                clearTimeout(this._codeSyncTimer);
                this._codeSyncTimer = setTimeout(() => {
                    this.onCodeChanged?.(code);
                }, 250);
            };
        }

        this.setupGeneralEvents();
        this.imageCache = new Map();
        this._bgImage = null;
        this._codeEditedManually = false;

        // TFT Named Color constants (RGB565)
        this._tftColors = {
            TFT_BLACK: 0x0000, TFT_NAVY: 0x000F, TFT_DARKGREEN: 0x03E0,
            TFT_DARKCYAN: 0x03EF, TFT_MAROON: 0x7800, TFT_PURPLE: 0x780F,
            TFT_OLIVE: 0x7BE0, TFT_LIGHTGREY: 0xC618, TFT_DARKGREY: 0x7BEF,
            TFT_BLUE: 0x001F, TFT_GREEN: 0x07E0, TFT_CYAN: 0x07FF,
            TFT_RED: 0xF800, TFT_MAGENTA: 0xF81F, TFT_YELLOW: 0xFFE0,
            TFT_WHITE: 0xFFFF, TFT_ORANGE: 0xFDA0, TFT_GREENYELLOW: 0xB7E0,
            TFT_PINK: 0xFE19, TFT_BROWN: 0x9A60, TFT_GOLD: 0xFEA0,
            TFT_SILVER: 0xC618, TFT_SKYBLUE: 0x867D, TFT_VIOLET: 0x915C
        };
    }

    setApiClient(apiClient) {
        this.api = apiClient;
    }

    initMonaco() {
        const container = document.getElementById('proto-code-preview-monaco');
        if (!container || !window.require) return;

        require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
        require(['vs/editor/editor.main'], () => {
            this.editor = monaco.editor.create(container, {
                value: this.dom.codePreview ? this.dom.codePreview.value : "",
                language: 'cpp',
                theme: 'vs-dark',
                automaticLayout: true,
                fontSize: 13,
                fontFamily: "'JetBrains Mono', monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                roundedSelection: true,
                cursorStyle: 'line',
                tabSize: 4,
                scrollbar: {
                    vertical: 'visible',
                    horizontal: 'visible',
                    useShadows: false,
                    verticalHasArrows: false,
                    horizontalHasArrows: false,
                    verticalScrollbarSize: 10,
                    horizontalScrollbarSize: 10
                }
            });

            this.editor.onDidChangeModelContent(() => {
                const code = this.editor.getValue();
                if (this.dom.codePreview) this.dom.codePreview.value = code;

                this._codeEditedManually = true;
                this.parseAndRenderCode(code);

                clearTimeout(this._codeSyncTimer);
                this._codeSyncTimer = setTimeout(() => {
                    this.onCodeChanged?.(code);
                }, 250);
            });
        });
    }

    updateCodeValue(code) {
        if (this.editor) {
            if (this.editor.getValue() !== code) {
                this.editor.setValue(code);
            }
        }
        if (this.dom.codePreview) {
            this.dom.codePreview.value = code;
        }
    }

    setSyncStatus(status) {
        if (!this.dom.syncStatus) return;
        const iconMap = {
            'saving': { icon: 'refresh-cw', text: 'Salvando...', class: 'sync-saving' },
            'synced': { icon: 'check-circle', text: 'Sincronizado', class: 'sync-synced' },
            'error': { icon: 'alert-circle', text: 'Erro ao sincronizar', class: 'sync-error' },
            'local': { icon: 'database', text: 'Modo Local', class: 'sync-local' }
        };
        const cfg = iconMap[status] || iconMap['synced'];
        this.dom.syncStatus.className = `sync-badge ${cfg.class}`;
        this.dom.syncStatus.innerHTML = `<i data-lucide="${cfg.icon}" style="width:12px;"></i> <span>${cfg.text}</span>`;
        if (window.lucide) window.lucide.createIcons();
    }

    setupCanvasEvents() {
        this.dom.canvas.onmousedown = (e) => this.onCanvasMouseDown?.(e);
        this.dom.canvas.onmousemove = (e) => this.onCanvasMouseMove?.(e);
        this.dom.canvas.onmouseup = (e) => this.onCanvasMouseUp?.(e);
    }

    setupGeneralEvents() {
        if (this.dom.addScreenBtn) {
            this.dom.addScreenBtn.onclick = () => {
                const select = document.getElementById('screen-template-select');
                const template = select ? select.value : '';
                this.onAddScreen?.(template);
            };
        }

        // JPG / BMP / PNG import → set as background
        const imgBtn = document.getElementById('btn-upload-image');
        const imgInput = document.getElementById('proto-image-upload');
        if (imgBtn && imgInput) imgBtn.onclick = () => imgInput.click();
        if (imgInput) {
            imgInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => this._handleImageImport(file.name, ev.target.result);
                reader.readAsDataURL(file);
                imgInput.value = '';
            };
        }

        // Wire all TFT command buttons to Add Element instead of Builder
        document.querySelectorAll('.tft-cmd-btn').forEach(btn => {
            btn.onclick = () => {
                const cmdId = btn.dataset.cmd;
                if (cmdId && this.onAddElement) {
                    let asset = null;
                    if (cmdId === 'pushImage' && this.app?.prototype?.model?.assets?.length > 0) {
                        asset = this.app.prototype.model.assets[0].name;
                    }
                    this.onAddElement(cmdId, asset);
                }
            };
        });

        // ✨ AI Auto-Layout Button
        const autoLayoutBtn = document.getElementById('btn-auto-layout');
        if (autoLayoutBtn) {
            autoLayoutBtn.onclick = () => {
                const intent = prompt("Descreva a intenção desta tela para a IA (ex: Painel de Controle, Menu de Opções, Player de Música):", "Organização Harmônica");
                if (intent !== null) {
                    this.onAutoLayout?.(intent);
                }
            };
        }

        // 📁 PROJECT MANAGEMENT BUTTONS
        const btnNew = document.getElementById('btn-project-new');
        const btnOpen = document.getElementById('btn-project-open');
        const btnSave = document.getElementById('btn-project-save');
        const btnExport = document.getElementById('btn-project-export');
        const fileOpen = document.getElementById('proto-project-upload');

        if (btnNew) btnNew.onclick = () => {
            if (confirm("Deseja criar um NOVO projeto? Todas as alterações não salvas serão perdidas.")) {
                this.onProjectNew?.();
            }
        };

        if (btnOpen && fileOpen) {
            btnOpen.onclick = () => fileOpen.click();
            fileOpen.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const project = JSON.parse(ev.target.result);
                        this.onProjectOpen?.(project);
                        fileOpen.value = '';
                    } catch (err) {
                        alert("Erro ao ler o arquivo de projeto JSON.");
                    }
                };
                reader.readAsText(file);
            };
        }

        if (btnSave) btnSave.onclick = () => this.onProjectSave?.();
        if (btnExport) btnExport.onclick = () => this.onProjectExportHardware?.();
    }

    /** Handle JPG/BMP/PNG imported from disk → set as screen background */
    async _handleImageImport(filename, dataUrl) {
        // Set as active screen background via callback
        this.onImportBackground?.(dataUrl, filename);

        // Update proto canvas immediately
        const img = new Image();
        img.onload = async () => {
            this._bgImage = img;
            if (this.dom.canvas) this.render(this.app.prototype.model); // full repaint
        };
        img.src = dataUrl;
    }


    /** Helper to convert Image to C uint16_t array string (RGB565) */
    _convertToRGB565Array(img, arrayName) {
        const canvas = document.createElement('canvas');
        canvas.width = 240; canvas.height = 240;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 240, 240);
        const data = ctx.getImageData(0, 0, 240, 240).data;

        let code = `// PixelDisplay240 Auto-Generated Image Array\n`;
        code += `// Name: ${arrayName} (240x240)\n`;
        code += `// Format: RGB565 uint16_t\n\n`;
        code += `#include <pgmspace.h>\n\n`;
        code += `const uint16_t ${arrayName}[57600] PROGMEM = {\n  `;

        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i] >> 3;
            const g = data[i + 1] >> 2;
            const b = data[i + 2] >> 3;
            const rgb565 = (r << 11) | (g << 5) | b;
            code += `0x${rgb565.toString(16).toUpperCase().padStart(4, '0')}`;
            if (i < data.length - 4) code += ', ';
            if (++count >= 12) { code += '\n  '; count = 0; }
        }
        code += `\n};\n`;
        return code;
    }


    render(model) {
        this.renderScreenList(model);
        this.renderMainGallery(model);
        this.renderAssetList(model);
        this.renderWorkspace(model);     // ALWAYS draw model to canvas
        this.renderElementList(model);
        this.renderCodePreview(model);   // ALWAYS regenerate C++ code from model
        this.renderInspector(model);

        const title = document.getElementById('active-screen-title');
        if (title && model.activeScreen) {
            title.textContent = model.activeScreen.name;
        }

        if (this.app?.status) this.app.status.refreshMetrics();
    }

    // ─── Screen List ───────────────────────────────────────────────────────────
    renderScreenList(model) {
        if (!this.dom.screenList) return;
        this.dom.screenList.innerHTML = '';

        model.screens.forEach((screen, index) => {
            const isActive = screen.id === model.activeScreenId;
            const item = document.createElement('div');
            item.className = `layer-item ${isActive ? 'active' : ''}`;
            item.draggable = true;
            item.dataset.index = index;
            item.dataset.id = screen.id;

            item.onclick = (e) => {
                if (e.target.closest('.action-btn')) return;
                this._codeEditedManually = false;
                this.onSelectScreen?.(screen.id);
            };

            item.innerHTML = `
                <i data-lucide="monitor" style="width:14px;"></i>
                <span class="screen-name" style="flex:1;font-weight:${isActive ? '700' : '400'};">${screen.name}</span>
                <div style="display: flex; gap: 2px;">
                    <button class="action-btn delete-screen" title="Excluir"><i data-lucide="trash-2" style="width:14px;"></i></button>
                    <div class="drag-handle" style="cursor: grab; padding: 2px;"><i data-lucide="grip-vertical" style="width:12px; opacity:0.5;"></i></div>
                </div>
            `;

            // Drag and Drop Handlers for Screens
            item.ondragstart = (e) => {
                e.dataTransfer.setData('text/plain', screen.id);
                e.dataTransfer.effectAllowed = 'move';
                item.classList.add('dragging');
                e.stopPropagation();
            };

            item.ondragend = (e) => {
                item.classList.remove('dragging');
                this.dom.screenList.querySelectorAll('.layer-item').forEach(i => i.classList.remove('drag-over'));
                e.stopPropagation();
            };

            item.ondragover = (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                item.classList.add('drag-over');
                e.stopPropagation();
            };

            item.ondragleave = (e) => {
                item.classList.remove('drag-over');
                e.stopPropagation();
            };

            item.ondrop = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const draggedId = e.dataTransfer.getData('text/plain');
                const targetIndex = parseInt(item.dataset.index);
                if (draggedId && draggedId !== screen.id) {
                    this.onReorderScreen?.(draggedId, targetIndex);
                }
            };

            const delBtn = item.querySelector('.delete-screen');
            if (delBtn) delBtn.onclick = (e) => { e.stopPropagation(); this.onDeleteScreen?.(screen.id); };
            this.dom.screenList.appendChild(item);
        });

        if (window.lucide) window.lucide.createIcons();
    }

    // ─── Main Gallery (Compact Navigation Sidebar) ──────────────────────────
    renderMainGallery(model) {
        if (!this.dom.mainGallery) return;
        this.dom.mainGallery.innerHTML = '';
        this.dom.mainGallery.className = 'preview-vertical-list';

        model.screens.forEach(screen => {
            const isActive = screen.id === model.activeScreenId;
            const card = document.createElement('div');
            card.className = `screen-card-compact ${isActive ? 'active' : ''}`;
            card.onclick = () => this.onSelectScreen?.(screen.id);

            const canvas = document.createElement('canvas');
            canvas.width = 240; canvas.height = 240;

            const info = document.createElement('div');
            info.className = 'screen-card-info';

            const name = document.createElement('span');
            name.className = 'screen-name';
            name.textContent = screen.name;

            const meta = document.createElement('span');
            meta.className = 'screen-meta';
            meta.textContent = `${screen.elements.length} elementos | ${screen.backgroundAsset || 'Sem fundo'}`;

            info.appendChild(name);
            info.appendChild(meta);

            card.appendChild(canvas);
            card.appendChild(info);

            this.dom.mainGallery.appendChild(card);
            this._drawToCanvas(screen, canvas, model.assets);
        });
    }

    // ─── Workspace (Active Screen Canvas) ──────────────────────────────────────
    renderWorkspace(model) {
        if (!this.dom.canvas || !model.activeScreen) return;
        // Always draw from model — textarea parser is a separate real-time overlay
        this._drawToCanvas(model.activeScreen, this.dom.canvas, model.assets);
    }

    _drawToCanvas(screen, canvas, assets) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Background: either a dataURL (from designer import) or asset name or backgroundColor
        const bgFill = screen.backgroundColor || '#111';
        if (screen.background) {
            const img = this._getImg(screen.background);
            if (img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                // Keep reference for code parser pushImage
                if (canvas === this.dom.canvas) this._bgImage = img;
            } else {
                img.onload = () => {
                    if (canvas === this.dom.canvas) this._bgImage = img;
                    this._drawToCanvas(screen, canvas, assets);
                };
                ctx.fillStyle = bgFill;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        } else {
            ctx.fillStyle = bgFill;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            if (canvas === this.dom.canvas) this._bgImage = null;
        }

        // Elements
        screen.elements.forEach(el => {
            ctx.save();
            const color = el.color || '#38bdf8';

            if (el.asset) {
                const asset = assets.find(a => a.name === el.asset);
                if (asset) {
                    const img = this._getImg(asset.dataUrl);
                    if (img.complete) {
                        ctx.drawImage(img, el.x, el.y, el.w, el.h);
                    } else {
                        img.onload = () => this._drawToCanvas(screen, canvas, assets);
                    }
                } else {
                    // Fallback for missing asset
                    ctx.strokeStyle = '#ef4444';
                    ctx.setLineDash([4, 4]);
                    ctx.strokeRect(el.x, el.y, el.w, el.h);
                    ctx.fillStyle = '#ef4444';
                    ctx.textAlign = 'center';
                    ctx.fillText('?', el.x + el.w / 2, el.y + el.h / 2);
                }
            } else {
                // Determine style based on fill vs draw
                const isOutline = el.type.startsWith('draw') && !el.type.includes('String') && el.type !== 'drawPixel';
                if (isOutline) {
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1;
                } else {
                    ctx.fillStyle = color;
                }

                switch (el.type) {
                    case 'fillCircle':
                    case 'circle': // legacy
                    case 'drawCircle': {
                        const r = Math.min(el.w, el.h) / 2;
                        ctx.beginPath();
                        ctx.arc(el.x + el.w / 2, el.y + el.h / 2, r, 0, Math.PI * 2);
                        isOutline ? ctx.stroke() : ctx.fill();
                        break;
                    }
                    case 'fillRoundRect': {
                        const r = Math.min(el.w, el.h) / 4; // approximate radius
                        this._roundRect(ctx, el.x, el.y, el.w, el.h, r);
                        ctx.fill();
                        break;
                    }
                    case 'fillTriangle': {
                        ctx.beginPath();
                        ctx.moveTo(el.x + el.w / 2, el.y); // Top
                        ctx.lineTo(el.x, el.y + el.h);   // Bottom Left
                        ctx.lineTo(el.x + el.w, el.y + el.h); // Bottom Right
                        ctx.closePath();
                        ctx.fill();
                        break;
                    }
                    case 'fillEllipse': {
                        ctx.beginPath();
                        ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2, el.w / 2, el.h / 2, 0, 0, Math.PI * 2);
                        ctx.fill();
                        break;
                    }
                    case 'drawLine': {
                        ctx.beginPath();
                        ctx.moveTo(el.x, el.y);
                        ctx.lineTo(el.x + el.w, el.y + el.h);
                        ctx.stroke();
                        break;
                    }
                    case 'drawFastHLine': {
                        ctx.beginPath();
                        ctx.moveTo(el.x, el.y);
                        ctx.lineTo(el.x + el.w, el.y);
                        ctx.stroke();
                        break;
                    }
                    case 'drawFastVLine': {
                        ctx.beginPath();
                        ctx.moveTo(el.x, el.y);
                        ctx.lineTo(el.x, el.y + el.h);
                        ctx.stroke();
                        break;
                    }
                    case 'drawPixel': {
                        ctx.fillRect(el.x, el.y, 2, 2); // visible size
                        break;
                    }
                    case 'drawString':
                    case 'drawCentreString': {
                        const fontSize = Math.max(10, el.h);
                        ctx.font = `${fontSize}px monospace`;
                        ctx.textBaseline = 'top';
                        // Use element Name as text content hack
                        const text = (el.name.startsWith(el.type) ? 'Text' : el.name) || 'Text';

                        if (el.type === 'drawCentreString') {
                            ctx.textAlign = 'center';
                            ctx.fillText(text, el.x + el.w / 2, el.y);
                        } else {
                            ctx.textAlign = 'left';
                            ctx.fillText(text, el.x, el.y);
                        }
                        break;
                    }
                    case 'drawRect': {
                        ctx.strokeRect(el.x, el.y, el.w, el.h);
                        ctx.strokeRect(el.x, el.y, el.w, el.h);
                        break;
                    }
                    case 'fillRect':
                    default: {
                        ctx.fillRect(el.x, el.y, el.w, el.h);
                        break;
                    }
                }
            }
            ctx.restore();
        });
    }

    _getImg(dataUrl) {
        if (this.imageCache.has(dataUrl)) return this.imageCache.get(dataUrl);
        const img = new Image();
        img.src = dataUrl;
        this.imageCache.set(dataUrl, img);
        return img;
    }

    // ─── Asset List ────────────────────────────────────────────────────────────
    renderAssetList(model) {
        if (!this.dom.assetList) return;
        this.dom.assetList.innerHTML = '';

        if (model.assets.length === 0) {
            this.dom.assetList.innerHTML = '<div class="hint" style="grid-column: 1/-1;">Sem assets</div>';
            return;
        }

        model.assets.forEach(asset => {
            const item = document.createElement('div');
            item.className = 'asset-item';
            item.style.cssText = 'background: var(--bg-dark); border: 1px solid var(--border); border-radius: 8px; padding: 6px; display: flex; flex-direction: column; gap: 4px;';
            item.innerHTML = `
                <img src="${asset.dataUrl}" style="width: 100%; height: 40px; object-fit: contain; background: #000; border-radius: 4px;">
                <div style="font-size: 0.6rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center;">${asset.name}</div>
                <div style="display: flex; gap: 2px;">
                    <button class="small-btn bg-btn" title="Fundo"><i data-lucide="monitor" style="width:10px;"></i></button>
                    <button class="small-btn add-btn" title="Add"><i data-lucide="plus" style="width:10px;"></i></button>
                    <button class="small-btn del-btn" title="Apagar"><i data-lucide="trash-2" style="width:10px;"></i></button>
                </div>
            `;
            item.querySelector('.bg-btn').onclick = (e) => { e.stopPropagation(); this.onPropertyChange?.(null, 'background', asset.name); };
            item.querySelector('.add-btn').onclick = (e) => { e.stopPropagation(); this.onAddElement?.('image', asset.name); };
            item.querySelector('.del-btn').onclick = (e) => { e.stopPropagation(); this.onDeleteAsset?.(asset.name); };
            this.dom.assetList.appendChild(item);
        });

        if (window.lucide) window.lucide.createIcons();
    }

    // ─── Element List ──────────────────────────────────────────────────────────
    renderElementList(model) {
        if (!this.dom.elementList || !model.activeScreen) return;
        this.dom.elementList.innerHTML = '';

        model.activeScreen.elements.forEach((el, index) => {
            const item = document.createElement('div');
            item.className = 'layer-item' + (model.selectedElementId === el.id ? ' active' : '');
            item.draggable = true;
            item.dataset.id = el.id;
            item.dataset.index = index;

            item.onclick = () => this.onSelectElement?.(el.id);
            item.innerHTML = `
                <i data-lucide="${el.asset ? 'image' : 'square'}" style="width:12px;"></i>
                <span style="flex:1; font-size: 0.7rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${el.name}</span>
                <div style="display: flex; gap: 2px;">
                    <button class="action-btn del-el" title="Remover"><i data-lucide="trash-2" style="width:12px;"></i></button>
                    <div class="drag-handle" style="cursor: grab; padding: 2px;"><i data-lucide="grip-vertical" style="width:12px; opacity:0.5;"></i></div>
                </div>
            `;

            // Drag and Drop Handlers
            item.ondragstart = (e) => {
                console.log('Drag Start:', el.id);
                e.dataTransfer.setData('text/plain', el.id);
                e.dataTransfer.effectAllowed = 'move';
                item.classList.add('dragging');
                e.stopPropagation();
            };

            item.ondragend = (e) => {
                item.classList.remove('dragging');
                this.dom.elementList.querySelectorAll('.layer-item').forEach(i => i.classList.remove('drag-over'));
                e.stopPropagation();
            };

            item.ondragover = (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                item.classList.add('drag-over');
                e.stopPropagation();
            };

            item.ondragleave = (e) => {
                item.classList.remove('drag-over');
                e.stopPropagation();
            };

            item.ondrop = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const draggedId = e.dataTransfer.getData('text/plain');
                const targetIndex = parseInt(item.dataset.index);
                console.log(`Drop: dragging ${draggedId} onto index ${targetIndex} (id: ${el.id})`);

                if (draggedId && draggedId !== el.id) {
                    console.log(`[View] Solicitando reordenação: ${draggedId} para o índice ${targetIndex}`);
                    this.onReorderElement?.(draggedId, targetIndex);
                }
            };

            item.querySelector('.del-el').onclick = (e) => { e.stopPropagation(); this.onElementDelete?.(el.id); };
            this.dom.elementList.appendChild(item);
        });

        if (window.lucide) window.lucide.createIcons();
    }

    // ─── Code Preview (Auto-generated + Editable) ─────────────────────────────
    renderCodePreview(model) {
        if (!this.dom.codePreview) return;

        // Só pulamos a atualização automática se o editor estiver com foco real (digitando).
        // Se o editor NÃO tiver foco, significa que a mudança veio de uma ação na UI (drag, property change),
        // e devemos atualizar o código para refletir a nova posição/valor.
        const isEditorFocused = this.editor && (this.editor.hasTextFocus() || this.editor.hasWidgetFocus());
        if (isEditorFocused) return;

        // Mantém track de que a edição via UI não deve disparar parser de volta por enquanto
        this._isUpdatingFromUI = true;

        // Capture existing custom code from current value before regenerating
        const currentCode = this.dom.codePreview.value;
        const customCodeMap = new Map();

        // Regex to find user custom blocks: // USER_CODE_BEGIN {ScreenName} ... // USER_CODE_END
        // Or simpler: just match content between well-known markers if we supported them.

        // BETTER STRATEGY: 
        // We can't easily merge custom logic with auto-generated UI code without a complex AST.
        // INSTEAD, we will generate the code normally, but if the user has written CUSTOM functions
        // outside the draw functions, we preserve them.

        // 1. Preserve headers/globals (everything before first draw_ function)
        const globalsMatch = currentCode.match(/^([\s\S]*?)(?=void\s+draw_)/);
        const preservedGlobals = globalsMatch ? globalsMatch[1] :
            '// PixelDisplay240 v5 - Auto-generated Code\n' +
            '// Edit freely — changes reflect in the display preview in real time.\n' +
            '#include <TFT_eSPI.h>\n' +
            '#include <SPI.h>\n' +
            'extern TFT_eSPI tft;\n\n';

        let code = preservedGlobals;

        // 2. Generate Draw Functions
        model.screens.forEach(screen => {
            const cleanName = this._cleanName(screen.name);
            const fnName = `draw_${cleanName}`;
            const bgArrName = `${cleanName}_bg`;


            code += `void ${fnName}() {\n`;

            if (screen.background || screen.backgroundAsset) {
                const bgName = screen.backgroundAsset || `${cleanName}_bg`;
                // If we have an image (asset or dataURL from designer), we use pushImage with the array name
                code += `  tft.pushImage(0, 0, 240, 240, ${bgName});\n`;
            } else if (screen.backgroundColor) {
                const hexColor = this.hexTo565(screen.backgroundColor);
                code += `  tft.fillScreen(${hexColor});\n`;
            } else {
                code += `  tft.fillScreen(TFT_BLACK);\n`;
            }

            screen.elements.forEach(el => {
                const color = el.colorBind || this.hexTo565(el.color);
                const ex = el.xBind || el.x;
                const ey = el.yBind || el.y;
                const ew = el.wBind || el.w;
                const eh = el.hBind || el.h;
                const nameComment = `// ${el.name}`;

                if (el.asset) {
                    code += `  tft.pushImage(${ex}, ${ey}, ${ew}, ${eh}, ${el.asset}); ${nameComment}\n`;
                } else {
                    switch (el.type) {
                        case 'fillCircle':
                        case 'circle': // legacy
                        case 'drawCircle': {
                            const cx = el.xBind ? `${ex} + (${ew}/2)` : Math.round(el.x + el.w / 2);
                            const cy = el.yBind ? `${ey} + (${eh}/2)` : Math.round(el.y + el.h / 2);
                            const r = el.wBind ? `Math.min(${ew}, ${eh}) / 2` : Math.round(Math.min(el.w, el.h) / 2);
                            const cmd = el.type.startsWith('draw') ? 'drawCircle' : 'fillCircle';
                            code += `  tft.${cmd}(${cx}, ${cy}, ${r}, ${color}); ${nameComment}\n`;
                            break;
                        }
                        case 'fillRoundRect':
                        case 'drawRoundRect': {
                            const r = el.wBind ? `Math.min(${ew}, ${eh}) / 4` : Math.round(Math.min(el.w, el.h) / 4);
                            const cmd = el.type.startsWith('draw') ? 'drawRoundRect' : 'fillRoundRect';
                            code += `  tft.${cmd}(${ex}, ${ey}, ${ew}, ${eh}, ${r}, ${color}); ${nameComment}\n`;
                            break;
                        }
                        case 'fillTriangle':
                        case 'drawTriangle': {
                            // Isosceles triangle inside bounding box
                            const x0 = el.xBind ? `${ex} + (${ew}/2)` : Math.round(el.x + el.w / 2);
                            const y0 = ey;
                            const x1 = ex, y1 = el.yBind ? `${ey} + ${eh}` : el.y + el.h;
                            const x2 = el.xBind ? `${ex} + ${ew}` : el.x + el.w;
                            const y2 = el.yBind ? `${ey} + ${eh}` : el.y + el.h;
                            const cmd = el.type.startsWith('draw') ? 'drawTriangle' : 'fillTriangle';
                            code += `  tft.${cmd}(${x0}, ${y0}, ${x1}, ${y1}, ${x2}, ${y2}, ${color}); ${nameComment}\n`;
                            break;
                        }
                        case 'fillEllipse':
                        case 'drawEllipse': {
                            const cx = el.xBind ? `${ex} + (${ew}/2)` : Math.round(el.x + el.w / 2);
                            const cy = el.yBind ? `${ey} + (${eh}/2)` : Math.round(el.y + el.h / 2);
                            const rx = el.wBind ? `(${ew}/2)` : Math.round(el.w / 2);
                            const ry = el.hBind ? `(${eh}/2)` : Math.round(el.h / 2);
                            const cmd = el.type.startsWith('draw') ? 'drawEllipse' : 'fillEllipse';
                            code += `  tft.${cmd}(${cx}, ${cy}, ${rx}, ${ry}, ${color}); ${nameComment}\n`;
                            break;
                        }
                        case 'drawLine': {
                            const x1 = el.xBind ? `${ex} + ${ew}` : el.x + el.w;
                            const y1 = el.yBind ? `${ey} + ${eh}` : el.y + el.h;
                            code += `  tft.drawLine(${ex}, ${ey}, ${x1}, ${y1}, ${color}); ${nameComment}\n`;
                            break;
                        }
                        case 'drawFastHLine': {
                            code += `  tft.drawFastHLine(${ex}, ${ey}, ${ew}, ${color}); ${nameComment}\n`;
                            break;
                        }
                        case 'drawFastVLine': {
                            code += `  tft.drawFastVLine(${ex}, ${ey}, ${eh}, ${color}); ${nameComment}\n`;
                            break;
                        }
                        case 'drawPixel': {
                            code += `  tft.drawPixel(${ex}, ${ey}, ${color}); ${nameComment}\n`;
                            break;
                        }
                        case 'drawString':
                        case 'drawCentreString': {
                            // Use ValueBind if present, otherwise element Name
                            const text = el.valueBind ? `String(${el.valueBind}).c_str()` : `"${el.name.replace(/"/g, '\\"')}"`;
                            const isVariable = !!el.valueBind;

                            // Size heuristic: assume height 8px = size 1
                            const size = el.hBind ? `Math.max(1, (int)(${eh} / 8))` : Math.max(1, Math.round(el.h / 8));
                            code += `  tft.setTextColor(${color}); tft.setTextSize(${size});\n`;
                            if (el.type === 'drawCentreString') {
                                const cx = el.xBind ? `${ex} + (${ew}/2)` : Math.round(el.x + el.w / 2);
                                code += `  tft.drawCentreString(${text}, ${cx}, ${ey}, 2); ${nameComment}\n`;
                            } else {
                                code += `  tft.drawString(${text}, ${ex}, ${ey}); ${nameComment}\n`;
                            }
                            break;
                        }
                        case 'drawRect': {
                            code += `  tft.drawRect(${ex}, ${ey}, ${ew}, ${eh}, ${color}); ${nameComment}\n`;
                            break;
                        }
                        case 'fillRect':
                        default: {
                            code += `  tft.fillRect(${ex}, ${ey}, ${ew}, ${eh}, ${color}); ${nameComment}\n`;
                            break;
                        }
                    }
                }
            });

            code += '}\n\n';
        });

        // 3. Preserve User Logic (anything after the generated functions)
        // Find where the last generated function ended in the OLD code vs NEW code isn't 1:1.
        // Simple heuristic: If the user appended logic at the end, keep it.
        // We look for "void loop" or "void setup" or other functions in the old code that are NOT draw_ functions

        // Extract all functions from old code
        const customFuncs = [];
        const funcRegex = /void\s+(?!draw_)([a-zA-Z0-9_]+)\s*\([^)]*\)\s*\{[\s\S]*?\}/g;
        let match;
        while ((match = funcRegex.exec(currentCode)) !== null) {
            customFuncs.push(match[0]);
        }

        if (customFuncs.length > 0) {
            code += '// --- User Logic Preserved ---\n';
            code += customFuncs.join('\n\n');
            code += '\n';
        }

        // Only update if changed (prevents cursor jumping if exact same)
        this.updateCodeValue(code);
    }

    hexTo565(hex) {
        if (!hex) return '0x0000';
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const rgb565 = ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
        return '0x' + rgb565.toString(16).toUpperCase().padStart(4, '0');
    }

    /** Convert RGB565 integer back to hex color string */
    _rgb565ToHex(c) {
        const r = Math.round(((c >> 11) & 0x1F) * 255 / 31);
        const g = Math.round(((c >> 5) & 0x3F) * 255 / 63);
        const b = Math.round((c & 0x1F) * 255 / 31);
        return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Parse the active screen's function from C++ code and extract elements.
     * Returns [{type, x, y, w, h, color, name}]
     */
    _parseElementsFromCode(code, fnName) {
        const elements = [];
        this._lastParsedColor = '#ffffff'; // Reset state per function
        this._lastParsedSize = 16;

        const fnRe = new RegExp(`void\\s+draw_${fnName}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\}`);
        const fnMatch = code.match(fnRe);
        const body = fnMatch ? fnMatch[1] : code;

        const lines = body.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('//')) continue;

            // Extract comment as name if present:  code... // name
            let name = null;
            const commentMatch = trimmed.match(/\/\/\s*(.*)$/);
            if (commentMatch) name = commentMatch[1].trim();

            const parseColor = (val) => {
                const cleanVal = val.trim();
                if (this._tftColors[cleanVal] !== undefined) return this._rgb565ToHex(this._tftColors[cleanVal]);
                return this._rgb565ToHex(parseInt(cleanVal, cleanVal.startsWith('0x') || cleanVal.startsWith('0X') ? 16 : 10));
            };

            // 1. Rects (fill/draw)
            const rectM = trimmed.match(/tft\.(fill|draw)Rect\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(0[xX][0-9A-Fa-f]+|\d+|[a-zA-Z0-9_]+)\s*\)/);
            if (rectM) {
                elements.push({
                    type: rectM[1] + 'Rect',
                    x: parseInt(rectM[2]), y: parseInt(rectM[3]),
                    w: parseInt(rectM[4]), h: parseInt(rectM[5]),
                    color: parseColor(rectM[6]),
                    name: name || (rectM[1] + 'Rect')
                });
                continue;
            }

            // 2. Circles (fill/draw)
            const circM = trimmed.match(/tft\.(fill|draw)Circle\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(0[xX][0-9A-Fa-f]+|\d+|[a-zA-Z0-9_]+)\s*\)/);
            if (circM) {
                const cx = parseInt(circM[2]), cy = parseInt(circM[3]), r = parseInt(circM[4]);
                elements.push({
                    type: circM[1] + 'Circle',
                    x: cx - r, y: cy - r, w: r * 2, h: r * 2,
                    color: parseColor(circM[5]),
                    name: name || (circM[1] + 'Circle')
                });
                continue;
            }

            // 3. Round Rects
            const rRectM = trimmed.match(/tft\.(fill|draw)RoundRect\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(0[xX][0-9A-Fa-f]+|\d+|[a-zA-Z0-9_]+)\s*\)/);
            if (rRectM) {
                elements.push({
                    type: rRectM[1] + 'RoundRect',
                    x: parseInt(rRectM[2]), y: parseInt(rRectM[3]),
                    w: parseInt(rRectM[4]), h: parseInt(rRectM[5]),
                    color: parseColor(rRectM[7]),
                    name: name || (rRectM[1] + 'RoundRect')
                });
                continue;
            }

            // 4. Lines
            const lineM = trimmed.match(/tft\.drawLine\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(0[xX][0-9A-Fa-f]+|\d+|[a-zA-Z0-9_]+)\s*\)/);
            if (lineM) {
                const x0 = parseInt(lineM[1]), y0 = parseInt(lineM[2]);
                const x1 = parseInt(lineM[3]), y1 = parseInt(lineM[4]);
                elements.push({
                    type: 'drawLine',
                    x: x0, y: y0, w: x1 - x0, h: y1 - y0,
                    color: parseColor(lineM[5]),
                    name: name || 'line'
                });
                continue;
            }

            // 5. Fast Lines (H/V)
            const hLineM = trimmed.match(/tft\.drawFastHLine\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(0[xX][0-9A-Fa-f]+|\d+|[a-zA-Z0-9_]+)\s*\)/);
            if (hLineM) {
                elements.push({
                    type: 'drawFastHLine',
                    x: parseInt(hLineM[1]), y: parseInt(hLineM[2]),
                    w: parseInt(hLineM[3]), h: 2,
                    color: parseColor(hLineM[4]),
                    name: name || 'hLine'
                });
                continue;
            }
            const vLineM = trimmed.match(/tft\.drawFastVLine\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(0[xX][0-9A-Fa-f]+|\d+|[a-zA-Z0-9_]+)\s*\)/);
            if (vLineM) {
                elements.push({
                    type: 'drawFastVLine',
                    x: parseInt(vLineM[1]), y: parseInt(vLineM[2]),
                    w: 2, h: parseInt(vLineM[3]),
                    color: parseColor(vLineM[4]),
                    name: name || 'vLine'
                });
                continue;
            }

            // 6. Text (drawString / drawCentreString / print / println)
            const txtM = trimmed.match(/tft\.(drawString|drawCentreString)\s*\(\s*"(.*?)"\s*,\s*(-?\d+)\s*,\s*(-?\d+)(?:\s*,\s*(\d+))?\s*\)/);
            if (txtM) {
                elements.push({
                    type: txtM[1],
                    x: parseInt(txtM[3]), y: parseInt(txtM[4]),
                    w: 0, h: this._lastParsedSize || 16,
                    color: this._lastParsedColor || '#ffffff',
                    name: txtM[2]
                });
                continue;
            }

            // 7. PushImage (Assets / Backgrounds)
            const imgM = trimmed.match(/tft\.pushImage\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*([a-zA-Z0-9_]+)\s*\)/);
            if (imgM) {
                const assetName = imgM[5];
                if (assetName === `${fnName}_bg`) continue;

                elements.push({
                    type: 'pushImage',
                    x: parseInt(imgM[1]), y: parseInt(imgM[2]),
                    w: parseInt(imgM[3]), h: parseInt(imgM[4]),
                    asset: assetName,
                    name: name || assetName
                });
                continue;
            }

            // 8. Text Colors and Settings (Implicit state parsing)
            const colorM = trimmed.match(/tft\.setTextColor\s*\(\s*([^)]+)\s*\)/);
            if (colorM) {
                this._lastParsedColor = parseColor(colorM[1]);
                continue;
            }

            const sizeM = trimmed.match(/tft\.setTextSize\s*\(\s*(\d+)\s*\)/);
            if (sizeM) {
                this._lastParsedSize = parseInt(sizeM[1]) * 8;
                continue;
            }
        }
        return elements;
    }

    /**
     * Parses the global order of screens by looking at draw_ function definitions.
     * Returns array of screen names (clean names) in order.
     */
    _parseScreenOrderFromCode(code) {
        const order = [];
        // Regex mais flexível para suportar espaços: void [espaços] draw_Nome [espaços] (
        const re = /void\s+draw_([a-zA-Z0-9_]+)\s*\(/g;
        let match;
        while ((match = re.exec(code)) !== null) {
            order.push(match[1]);
        }
        return order;
    }

    // ─── TFT Code Parser → Live Canvas Preview ────────────────────────────────
    _rgb565ToStr(color565) {
        const r = ((color565 >> 11) & 0x1F) * 8;
        const g = ((color565 >> 5) & 0x3F) * 4;
        const b = (color565 & 0x1F) * 8;
        return `rgb(${r},${g},${b})`;
    }

    _resolveColor(tok) {
        tok = (tok || '').trim();
        if (this._tftColors[tok] !== undefined) return this._rgb565ToStr(this._tftColors[tok]);
        if (tok.startsWith('0x') || tok.startsWith('0X')) return this._rgb565ToStr(parseInt(tok, 16));
        if (!isNaN(tok)) return this._rgb565ToStr(parseInt(tok));
        return '#888';
    }

    _parseArgs(str) {
        const args = [];
        let depth = 0, cur = '', inStr = false;
        for (const ch of str) {
            if (ch === '"' || ch === "'") inStr = !inStr;
            if (!inStr && ch === '(') depth++;
            if (!inStr && ch === ')') depth--;
            if (!inStr && ch === ',' && depth === 0) { args.push(cur.trim()); cur = ''; }
            else cur += ch;
        }
        if (cur.trim()) args.push(cur.trim());
        return args;
    }

    _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    parseAndRenderCode(code) {
        if (!this.dom.canvas) return;
        const ctx = this.ctx;
        const W = this.dom.canvas.width;
        const H = this.dom.canvas.height;

        // Find active screen name to target the correct draw_ function
        const screen = this.app?.prototype?.model?.activeScreen;
        if (!screen) return;
        const fnName = screen.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
        const targetFn = `void draw_${fnName}`;

        // Extract just the body of the target function
        const fnRe = new RegExp(`${targetFn}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\}`, 'm');
        const fnMatch = code.match(fnRe);
        const bodyContent = fnMatch ? fnMatch[1] : '';

        // Initial clear
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, W, H);

        let textColor = '#ffffff';
        let fontSize = 8;

        for (const line of bodyContent.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || (trimmed.startsWith('/*') && trimmed.endsWith('*/'))) continue;

            const match = trimmed.match(/tft\.(\w+)(?:<[^>]*>)?\s*\(([^;]*)\)/);
            if (!match) continue;

            const cmd = match[1];
            const args = this._parseArgs(match[2]);

            try {
                switch (cmd) {
                    case 'fillScreen':
                        ctx.fillStyle = this._resolveColor(args[0]);
                        ctx.fillRect(0, 0, W, H);
                        break;
                    case 'fillRect':
                        ctx.fillStyle = this._resolveColor(args[4]);
                        ctx.fillRect(+args[0], +args[1], +args[2], +args[3]);
                        break;
                    case 'drawRect':
                        ctx.strokeStyle = this._resolveColor(args[4]);
                        ctx.lineWidth = 1;
                        ctx.strokeRect(+args[0] + 0.5, +args[1] + 0.5, +args[2], +args[3]);
                        ctx.strokeRect(+args[0] + 0.5, +args[1] + 0.5, +args[2], +args[3]);
                        break;
                    case 'fillRoundRect':
                        ctx.fillStyle = this._resolveColor(args[5]);
                        this._roundRect(ctx, +args[0], +args[1], +args[2], +args[3], +args[4]);
                        ctx.fill();
                        break;
                    case 'drawRoundRect':
                        ctx.strokeStyle = this._resolveColor(args[5]);
                        ctx.lineWidth = 1;
                        this._roundRect(ctx, +args[0], +args[1], +args[2], +args[3], +args[4]);
                        ctx.stroke();
                        break;
                    case 'fillCircle':
                        ctx.fillStyle = this._resolveColor(args[3]);
                        ctx.beginPath();
                        ctx.arc(+args[0], +args[1], +args[2], 0, Math.PI * 2);
                        ctx.fill();
                        break;
                    case 'drawCircle':
                        ctx.strokeStyle = this._resolveColor(args[3]);
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.arc(+args[0], +args[1], +args[2], 0, Math.PI * 2);
                        ctx.stroke();
                        break;
                    case 'fillTriangle': {
                        ctx.fillStyle = this._resolveColor(args[6]);
                        ctx.beginPath();
                        ctx.moveTo(+args[0], +args[1]);
                        ctx.lineTo(+args[2], +args[3]);
                        ctx.lineTo(+args[4], +args[5]);
                        ctx.closePath(); ctx.fill();
                        break;
                    }
                    case 'drawLine':
                        ctx.strokeStyle = this._resolveColor(args[4]);
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(+args[0], +args[1]);
                        ctx.lineTo(+args[2], +args[3]);
                        ctx.stroke();
                        break;
                    case 'drawPixel':
                        ctx.fillStyle = this._resolveColor(args[2]);
                        ctx.fillRect(+args[0], +args[1], 1, 1);
                        break;
                    case 'setTextColor':
                        textColor = this._resolveColor(args[0]);
                        break;
                    case 'setTextSize':
                        fontSize = Math.max(6, (+args[0] || 1) * 8);
                        break;
                    case 'drawString':
                    case 'drawCentreString': {
                        const txt = args[0]?.replace(/^["']|["']$/g, '') || '';
                        ctx.fillStyle = textColor;
                        ctx.font = `${fontSize}px monospace`;
                        if (cmd === 'drawCentreString') {
                            ctx.textAlign = 'center';
                            ctx.fillText(txt, +args[1], +args[2] + (fontSize * 0.8));
                            ctx.textAlign = 'left';
                        } else {
                            ctx.fillText(txt, +args[1], +args[2] + (fontSize * 0.8));
                        }
                        break;
                    }
                    case 'pushImage': {
                        const assetName = args[4];
                        const x = +args[0], y = +args[1], w = +args[2], h = +args[3];

                        // Check if it's the current screen background
                        const screen = this.app?.prototype?.model?.activeScreen;
                        const fnName = screen ? screen.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') : '';

                        if (assetName === `${fnName}_bg` || assetName === screen?.backgroundAsset) {
                            if (this._bgImage && this._bgImage.complete) {
                                ctx.drawImage(this._bgImage, x, y, w, h);
                                break; // Corrected: use break instead of return
                            }
                        }

                        // Try to find asset in model
                        const asset = this.app?.prototype?.model?.assets?.find(a => a.name === assetName);
                        if (asset) {
                            const img = this._getImg(asset.dataUrl);
                            if (img.complete) {
                                ctx.drawImage(img, x, y, w, h);
                            } else {
                                img.onload = () => this.parseAndRenderCode(code);
                            }
                        } else {
                            // Generic placeholder with dotted border
                            ctx.strokeStyle = '#38bdf8';
                            ctx.setLineDash([2, 4]);
                            ctx.strokeRect(x, y, w, h);
                            ctx.setLineDash([]);
                            ctx.fillStyle = 'rgba(56,189,248,0.1)';
                            ctx.fillRect(x, y, w, h);
                            ctx.fillStyle = '#38bdf8';
                            ctx.font = '9px monospace';
                            ctx.textAlign = 'center';
                            ctx.fillText(assetName, x + w / 2, y + h / 2);
                            ctx.textAlign = 'left';
                        }
                        break;
                    }
                }
            } catch (err) { /* skip malformed commands */ }
        }
    }

    // ─── Inspector / Properties Panel ─────────────────────────────────────────
    renderInspector(model) {
        if (!this.dom.interactionPanel) return;

        const screen = model.activeScreen;
        const el = screen ? screen.elements.find(e => e.id === model.selectedElementId) : null;

        // CRITICAL: Prevent re-rendering the whole panel if the user is currently typing
        // This avoids focus loss and "jumping" inputs.
        const focused = document.activeElement;
        const isEditing = this.dom.interactionPanel.contains(focused) &&
            (focused.tagName === 'INPUT' || focused.tagName === 'SELECT');

        if (isEditing) {
            // Update the model locally but skip the full DOM redraw to keep focus
            if (focused.dataset.screenProp === 'name' && screen) {
                screen.name = focused.value;
                // Update Sidebar and Title WITHOUT re-rendering inspector
                const sidebarName = this.dom.screenList?.querySelector('.layer-item.active .screen-name');
                if (sidebarName) sidebarName.textContent = focused.value;
                const title = document.getElementById('active-screen-title');
                if (title) title.textContent = focused.value;
            }
            return;
        }

        if (!el) {
            this.dom.interactionPanel.innerHTML = `
                <div class="inspector-group">
                    <div class="inspector-section-title">PROPRIEDADES DA TELA</div>
                    <div style="display:grid;grid-template-columns:1fr;gap:12px;">
                        <div class="input-field compact">
                            <span>Nome da Tela</span>
                            <input type="text" data-screen-prop="name" value="${screen?.name || ''}">
                        </div>
                        <div class="input-field compact">
                            <span>Imagem de Fundo (.jpg/.bmp)</span>
                            <select data-screen-prop="backgroundAsset" style="width:100%;">
                                <option value="">Nenhuma (Cor Sólida)</option>
                                ${model.assets.map(a => `<option value="${a.name}" ${screen?.backgroundAsset === a.name ? 'selected' : ''}>${a.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="input-field compact">
                            <span>Cor de Fundo (se sem imagem)</span>
                            <input type="color" data-screen-prop="backgroundColor" value="${screen?.backgroundColor || '#000000'}">
                        </div>
                    </div>
                </div>
            `;

            // Wire screen prop changes
            this.dom.interactionPanel.querySelectorAll('input, select').forEach(input => {
                const prop = input.dataset.screenProp;

                input.onfocus = () => {
                    input._originalValue = input.value;
                };

                input.oninput = () => {
                    const val = input.value;
                    if (prop === 'name' && screen) {
                        screen.name = val;
                        // Fast UI feedback: Sidebar
                        const sidebarName = this.dom.screenList?.querySelector('.layer-item.active .screen-name');
                        if (sidebarName) sidebarName.textContent = val;
                        // Fast UI feedback: Title
                        const title = document.getElementById('active-screen-title');
                        if (title) title.textContent = val;
                        // NEW: Fast UI feedback: Main Gallery Cards (the ones in your screenshot)
                        const cards = this.dom.mainGallery?.querySelectorAll('.screen-card');
                        if (cards) {
                            model.screens.forEach((s, idx) => {
                                if (s.id === screen.id && cards[idx]) {
                                    const cardTitle = cards[idx].querySelector('div'); // The first div is the title
                                    if (cardTitle) cardTitle.textContent = val;
                                }
                            });
                        }
                    } else if (prop === 'backgroundColor' && screen) {
                        screen.backgroundColor = val;
                        this.renderWorkspace(model);
                        if (!this._codeEditedManually) this.renderCodePreview(model);
                    }
                };

                input.onchange = () => {
                    const val = input.value;
                    const oldVal = input._originalValue;
                    this.onScreenPropertyChange?.(screen.id, prop, val, oldVal);
                };
            });

            if (window.lucide) window.lucide.createIcons();
            return;
        }

        this.dom.interactionPanel.innerHTML = `
            <div class="inspector-group">
                <div class="inspector-section-title">PROPRIEDADES</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    <div class="input-field compact">
                        <span>Nome</span>
                        <input type="text" data-prop="name" value="${el.name || ''}">
                    </div>
                    <div class="input-field compact">
                        <span>${el.type === 'pushImage' ? 'Imagem' : 'Cor'}</span>
                        ${el.type === 'pushImage'
                ? `<select data-prop="asset" style="width:100%;">
                                 <option value="">Nenhuma</option>
                                 ${model.assets.map(a => `<option value="${a.name}" ${el.asset === a.name ? 'selected' : ''}>${a.name}</option>`).join('')}
                               </select>`
                : `<input type="color" data-prop="color" value="${el.color || '#38bdf8'}">`
            }
                    </div>
                </div>
            </div>

            <div class="inspector-group" style="margin-top:12px;">
                <div class="inspector-section-title">POSIÇÃO & TAMANHO</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    <div class="input-field compact">
                        <span>X</span>
                        <div style="display:flex;gap:4px;">
                            <input type="number" data-prop="x" value="${el.x ?? 10}" style="flex:1;">
                            <input type="text" data-prop="xBind" value="${el.xBind || ''}" placeholder="🔗 var" title="Vínculo C++" class="binding-input" style="width:60px;">
                        </div>
                    </div>
                    <div class="input-field compact">
                        <span>Y</span>
                        <div style="display:flex;gap:4px;">
                            <input type="number" data-prop="y" value="${el.y ?? 10}" style="flex:1;">
                            <input type="text" data-prop="yBind" value="${el.yBind || ''}" placeholder="🔗 var" title="Vínculo C++" class="binding-input" style="width:60px;">
                        </div>
                    </div>
                    <div class="input-field compact">
                        <span>W</span>
                        <div style="display:flex;gap:4px;">
                            <input type="number" data-prop="w" value="${el.w ?? 50}" style="flex:1;">
                            <input type="text" data-prop="wBind" value="${el.wBind || ''}" placeholder="🔗 var" title="Vínculo C++" class="binding-input" style="width:60px;">
                        </div>
                    </div>
                    <div class="input-field compact">
                        <span>H</span>
                        <div style="display:flex;gap:4px;">
                            <input type="number" data-prop="h" value="${el.h ?? 50}" style="flex:1;">
                            <input type="text" data-prop="hBind" value="${el.hBind || ''}" placeholder="🔗 var" title="Vínculo C++" class="binding-input" style="width:60px;">
                        </div>
                    </div>
                </div>
            </div>

            <div class="inspector-group" style="margin-top:12px;">
                <div class="inspector-section-title">LÓGICA DINÂMICA</div>
                <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px;">
                    <div class="input-field compact">
                        <span>Vínculo Cor</span>
                        <input type="text" data-prop="colorBind" value="${el.colorBind || ''}" placeholder="🔗 var_cor" class="binding-input">
                    </div>
                    <div class="input-field compact">
                        <span>Vínculo Valor</span>
                        <input type="text" data-prop="valueBind" value="${el.valueBind || ''}" placeholder="🔗 var_valor" class="binding-input">
                    </div>
                </div>
            </div>

            <div class="inspector-group">
                <div class="inspector-section-title">INTERAÇÃO</div>
                <div class="input-field compact">
                    <span>Ir para Tela</span>
                    <select data-prop="targetScreenId" style="width:100%;">
                        <option value="">Nenhuma</option>
                        ${model.screens.map(s => `<option value="${s.id}" ${el.targetScreenId === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
                    </select>
                </div>
            </div>

            <button class="secondary-btn del-el-btn" style="width:100%; margin-top:12px; color:var(--error); border-color:var(--glass-border);">
                <i data-lucide="trash-2" style="width:14px;"></i> Excluir
            </button>
        `;

        this.dom.interactionPanel.querySelectorAll('input, select').forEach(input => {
            const fire = (e) => {
                const prop = e.target.dataset.prop;
                let val = e.target.value;
                if (e.target.type === 'number') val = parseInt(val) || 0;
                // Optimistic: update local element + redraw immediately
                el[prop] = val;
                if (!this._codeEditedManually) this._drawToCanvas(model.activeScreen, this.dom.canvas, model.assets);
                // Persist to backend
                this.onPropertyChange?.(el.id, prop, val);
            };
            input.oninput = fire;
            if (input.tagName === 'SELECT') input.onchange = fire;
        });

        const delBtn = this.dom.interactionPanel.querySelector('.del-el-btn');
        if (delBtn) delBtn.onclick = () => this.onElementDelete?.(el.id);

        if (window.lucide) window.lucide.createIcons();
    }

    _roundRect(ctx, x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    _cleanName(name) {
        if (!name) return 'Screen';
        return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    }
}