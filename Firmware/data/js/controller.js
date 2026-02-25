/**
 * Prototype Controller - Orchestrates Model, View, and C# Backend
 */
class PrototypeController {
    constructor(model, view) {
        this.model = model;
        this.view = view;
        this.app = null; // Will be set by script.js

        this.draggingElement = null;
        this.dragOffset = { x: 0, y: 0 };

        this.resizingElement = null;

        this.setupViewCallbacks();
    }

    // Called after app is set
    async init(app) {
        this.app = app;
        if (app.api) this.view.app = app; // Give view access to app/model
        await this.sync();
    }

    async sync() {
        if (!this.app || !this.app.api) return;
        this.view.setSyncStatus('saving');
        try {
            const resp = await this.app.api.request('/api/prototype');
            const data = await resp.json();

            // Só atualiza o modelo se NÃO estiver editando ativamente via código (evita revert/undo)
            const isEditing = this.view.editor && (this.view.editor.hasTextFocus() || this.view.editor.hasWidgetFocus());
            if (!isEditing) {
                this.model.updateFromData(data);
                this.view.render(this.model);
                this.view.renderCodePreview(this.model);
            }

            this.view.setSyncStatus('synced');
        } catch (err) {
            console.error('Sync failed:', err);
            this.view.setSyncStatus('local');
        }
    }

    async callApi(path, method = 'POST', body = null) {
        // Obsoleto: Substituído por queueSave() para salvamento integral.
        return this.queueSave();
    }

    /**
     * Sincroniza o estado total do projeto com o servidor.
     * Debounced para evitar excesso de requisições.
     */
    queueSave() {
        this.model.saveToLocal();
        this.view.render(this.model);
        this.view.setSyncStatus('saving');

        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(async () => {
            if (!this.app || !this.app.api) return;
            try {
                const resp = await this.app.api.request('/api/prototype/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.model.getRawData())
                });
                if (resp.ok) {
                    const data = await resp.json();

                    // PROTEÇÃO CRÍTICA: Se o usuário estiver editando, não sobrescreve o modelo local 
                    // com o retorno do servidor, pois o servidor pode devolver estado antigo enquanto o save processa.
                    const isEditing = this.view.editor && (this.view.editor.hasTextFocus() || this.view.editor.hasWidgetFocus());
                    if (!isEditing) {
                        this.model.updateFromData(data);
                        this.view.render(this.model);
                        this.view.renderCodePreview(this.model);
                    }

                    this.view.setSyncStatus('synced');
                } else {
                    throw new Error('Server error on save');
                }
            } catch (err) {
                console.error('Bulk save failed:', err);
                this.view.setSyncStatus('error');
            }
        }, 1000);
    }

    setupViewCallbacks() {
        // TELAS
        this.view.onAddScreen = (template) => {
            const id = `screen_${Date.now()}`;
            const newScreen = {
                id,
                name: `${template ? template.charAt(0).toUpperCase() + template.slice(1) : 'Tela'}_${this.model.screens.length + 1}`,
                elements: []
            };

            // Aplica elementos iniciais baseados no template
            if (template === 'dashboard') {
                newScreen.elements = [
                    { id: `el_${Date.now()}_1`, type: 'fillRect', name: 'Header', x: 0, y: 0, w: 240, h: 30, color: '#1e293b' },
                    { id: `el_${Date.now()}_2`, type: 'drawCentreString', name: 'CPU: 45%', x: 120, y: 8, w: 0, h: 0, color: '#38bdf8', valueBind: 'cpu_usage' },
                    { id: `el_${Date.now()}_3`, type: 'fillCircle', name: 'Status_OK', x: 190, y: 15, w: 10, h: 10, color: '#4ade80' },
                    { id: `el_${Date.now()}_4`, type: 'fillRect', name: 'ChartArea', x: 20, y: 60, w: 200, h: 120, color: '#0f172a' },
                    { id: `el_${Date.now()}_5`, type: 'drawLine', name: 'GraphLine', x: 20, y: 180, w: 200, h: -80, color: '#38bdf8' }
                ];
            } else if (template === 'menu') {
                newScreen.elements = [
                    { id: `el_${Date.now()}_1`, type: 'drawCentreString', name: 'MENU PRINCIPAL', x: 120, y: 20, w: 0, h: 0, color: '#f8fafc' },
                    { id: `el_${Date.now()}_2`, type: 'fillRoundRect', name: 'Opt_1', x: 40, y: 60, w: 160, h: 35, color: '#334155' },
                    { id: `el_${Date.now()}_3`, type: 'drawString', name: 'Configurações', x: 60, y: 70, w: 0, h: 0, color: '#fff' },
                    { id: `el_${Date.now()}_4`, type: 'fillRoundRect', name: 'Opt_2', x: 40, y: 105, w: 160, h: 35, color: '#334155' },
                    { id: `el_${Date.now()}_5`, type: 'drawString', name: 'Sensores', x: 60, y: 115, w: 0, h: 0, color: '#fff' },
                    { id: `el_${Date.now()}_6`, type: 'fillRoundRect', name: 'Opt_3', x: 40, y: 150, w: 160, h: 35, color: '#334155' },
                    { id: `el_${Date.now()}_7`, type: 'drawString', name: 'Sair', x: 60, y: 160, w: 0, h: 0, color: '#fff' }
                ];
            } else if (template === 'loading') {
                newScreen.elements = [
                    { id: `el_${Date.now()}_1`, type: 'drawCentreString', name: 'LOADING...', x: 120, y: 100, w: 0, h: 0, color: '#38bdf8' },
                    { id: `el_${Date.now()}_2`, type: 'drawRect', name: 'ProgressBorder', x: 40, y: 130, w: 160, h: 10, color: '#475569' },
                    { id: `el_${Date.now()}_3`, type: 'fillRect', name: 'ProgressBar', x: 42, y: 132, w: 80, h: 6, color: '#38bdf8', wBind: 'loading_progress' }
                ];
            } else if (template === 'clock') {
                newScreen.elements = [
                    { id: `el_${Date.now()}_1`, type: 'drawCircle', name: 'ClockFace', x: 120, y: 120, w: 200, h: 200, color: '#1e293b' },
                    { id: `el_${Date.now()}_2`, type: 'drawCentreString', name: '12:45', x: 120, y: 90, w: 0, h: 0, color: '#fff', valueBind: 'current_time' },
                    { id: `el_${Date.now()}_3`, type: 'drawCentreString', name: 'Quarta, 25 Fev', x: 120, y: 140, w: 0, h: 0, color: '#475569', valueBind: 'current_date' }
                ];
            } else if (template === 'others') {
                newScreen.elements = [
                    { id: `el_${Date.now()}_1`, type: 'fillTriangle', name: 'Decor_1', x: 20, y: 20, w: 100, h: 100, color: '#6366f1' },
                    { id: `el_${Date.now()}_2`, type: 'fillEllipse', name: 'Decor_2', x: 120, y: 120, w: 80, h: 40, color: '#a855f7' },
                    { id: `el_${Date.now()}_3`, type: 'drawPixel', name: 'Star', x: 200, y: 50, w: 0, h: 0, color: '#fbbf24' }
                ];
            }
            this.model.screens.push(newScreen);
            this.model.activeScreenId = id;
            this.queueSave();
        };

        this.view.onSelectScreen = (id) => {
            this.model.activeScreenId = id;
            this.model.selectedElementId = null;
            this.queueSave();
        };

        this.view.onDeleteScreen = (id) => {
            if (this.model.screens.length <= 1) return;
            this.model.screens = this.model.screens.filter(s => s.id !== id);
            if (this.model.activeScreenId === id) {
                this.model.activeScreenId = this.model.screens[0].id;
            }
            this.queueSave();
        };

        this.view.onReorderScreen = (id, newIndex) => {
            const idx = this.model.screens.findIndex(s => s.id === id);
            if (idx === -1) return;
            const screen = this.model.screens.splice(idx, 1)[0];
            const target = Math.max(0, Math.min(newIndex, this.model.screens.length));
            this.model.screens.splice(target, 0, screen);
            this.view._codeEditedManually = false;
            this.queueSave();
        };

        // ELEMENTOS
        this.view.onAddElement = (type, asset = null) => {
            const screen = this.model.activeScreen;
            if (!screen) return;
            const elId = `el_${Date.now()}`;
            const isCircle = type === 'circle';
            const el = {
                id: elId,
                type,
                name: `${type}_${screen.elements.length + 1}`,
                x: 10 + (screen.elements.length * 5),
                y: 10 + (screen.elements.length * 5),
                w: isCircle ? 60 : 80,
                h: isCircle ? 60 : 40,
                color: "#38bdf8",
                asset
            };
            screen.elements.push(el);
            this.model.selectedElementId = elId;
            this.queueSave();
        };

        this.view.onSelectElement = (id) => {
            this.model.selectedElementId = id;
            this.queueSave();
        };

        this.view.onElementDelete = (id) => {
            const screen = this.model.activeScreen;
            if (!screen) return;
            screen.elements = screen.elements.filter(e => e.id !== id);
            if (this.model.selectedElementId === id) this.model.selectedElementId = null;
            this.queueSave();
        };

        this.view.onReorderElement = (id, newIndex) => {
            const screen = this.model.activeScreen;
            if (!screen || this._isReordering) return;
            this._isReordering = true;

            const idx = screen.elements.findIndex(e => e.id === id);
            if (idx !== -1) {
                const el = screen.elements.splice(idx, 1)[0];
                const target = Math.max(0, Math.min(newIndex, screen.elements.length));
                screen.elements.splice(target, 0, el);
                this.view._codeEditedManually = false;
                this.queueSave();
            }

            setTimeout(() => { this._isReordering = false; }, 500);
        };

        this.view.onPropertyChange = (elId, prop, val) => {
            const screen = this.model.activeScreen;
            if (!screen) return;

            if (prop === 'background') {
                screen.backgroundAsset = val;
                screen.background = this.model.assets.find(a => a.name === val)?.dataUrl;
            } else {
                const el = screen.elements.find(e => e.id === elId);
                if (el) el[prop] = val;
            }
            this.queueSave();
        };

        this.view.onAssetUpload = (asset) => {
            this.model.assets.push(asset);
            this.queueSave();
        };

        this.view.onDeleteAsset = (name) => {
            this.model.assets = this.model.assets.filter(a => a.name !== name);
            this.model.screens.forEach(s => {
                if (s.backgroundAsset === name) { s.backgroundAsset = null; s.background = null; }
                s.elements.forEach(el => { if (el.asset === name) el.asset = null; });
            });
            this.queueSave();
        };

        this.view.onScreenPropertyChange = async (screenId, prop, val, oldVal) => {
            const screen = this.model.screens.find(s => s.id === screenId);
            if (!screen) return;

            const oldName = oldVal || screen.name;

            // 1. Update local model
            screen[prop] = val;

            // 2. Persist to backend
            if (prop === 'backgroundAsset') {
                const asset = this.model.assets.find(a => a.name === val);
                await this.app.api.request('/api/prototype/screen/background', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        screenId: screenId,
                        assetName: val,
                        dataUrl: asset ? asset.dataUrl : null
                    })
                });
            } else {
                await this.app.api.request('/api/prototype/screen/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ screenId, [prop]: val })
                });
            }

            // 3. Sync code
            if (this.view._codeEditedManually && this.view.dom.codePreview) {
                let code = this.view.dom.codePreview.value;
                if (prop === 'name') {
                    const oldClean = this.view._cleanName(oldName);
                    const newClean = this.view._cleanName(val);
                    // Replaces both definition "void draw_OldName(" and calls "draw_OldName("
                    const fnRegex = new RegExp(`draw_${oldClean}\\s*\\(`, 'g');
                    code = code.replace(fnRegex, `draw_${newClean}(`);
                } else if (prop === 'backgroundColor') {
                    const cleanName = this.view._cleanName(screen.name);
                    const fnName = `draw_${cleanName}`;
                    const fillRegex = new RegExp(`(void\\s+${fnName}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?tft\\.fillScreen\\s*\\()([^;]*?)(\\))`, 'm');
                    const new565 = this.view.hexTo565(val);
                    code = code.replace(fillRegex, `$1${new565}$3`);
                }
                this.view.updateCodeValue(code);
                this.view.parseAndRenderCode(code);
            } else {
                this.view.renderCodePreview(this.model);
            }
        };

        // Import background from Designer or from disk
        this.view.onImportBackground = async (dataUrl, sourceName) => {
            const activeId = this.model.activeScreenId;
            if (!activeId) return;
            await this.app.api.request('/api/prototype/screen/background', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    screenId: activeId,
                    assetName: null,
                    dataUrl: dataUrl
                })
            });
        };

        this.view.onCanvasMouseDown = (e) => this.handleMouseDown(e);
        this.view.onCanvasMouseMove = (e) => this.handleMouseMove(e);
        this.view.onCanvasMouseUp = (e) => this.handleMouseUp(e);

        // Code editor → model sync (fires 800ms after user stops typing)
        this.view.onCodeChanged = (code) => this._syncCodeToModel(code);

        // AI AUTO-LAYOUT
        this.view.onAutoLayout = async (intent) => {
            const screen = this.model.activeScreen;
            if (!screen || !this.app || !this.app.api) return;

            this.view.setSyncStatus('saving');
            try {
                const resp = await this.app.api.request('/api/ai/auto-layout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        elements: screen.elements,
                        intent: intent || "Organize harmoniously"
                    })
                });

                if (!resp.ok) {
                    const error = await resp.json();
                    throw new Error(error.detail || 'Falha no Auto-Layout');
                }

                const optimizedElements = await resp.json();
                screen.elements = optimizedElements;
                this.view._codeEditedManually = false;
                this.queueSave();
                this.view.setSyncStatus('synced');
            } catch (err) {
                console.error('Auto-layout failed:', err);
                alert('Erro na IA: ' + err.message);
                this.view.setSyncStatus('error');
            }
        };

        // 📁 PROJECT LIFECYCLE CALLBACKS
        this.view.onProjectNew = () => {
            const defaultProject = {
                screens: [{ id: 'screen_default', name: 'Main', elements: [] }],
                assets: [],
                activeScreenId: 'screen_default',
                screenSeq: 1,
                elementSeq: 1
            };
            this.model.updateFromData(defaultProject);
            this.view.render(this.model);
            this.view.updateCodeValue("");
            this.queueSave();
        };

        this.view.onProjectOpen = (projectData) => {
            this.model.updateFromData(projectData);
            this.view.render(this.model);
            this.view.renderCodePreview(this.model);
            this.queueSave();
            if (this.app?.toast) this.app.toast.show('success', 'Projeto Aberto', 'O arquivo foi carregado com sucesso.');
        };

        this.view.onProjectSave = () => {
            const data = JSON.stringify(this.model.getRawData(), null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `PixelDisplay240_Project_${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        };

        this.view.onProjectExportHardware = async () => {
            this.view.setSyncStatus('saving');
            try {
                const resp = await fetch('/api/prototype/export', {
                    headers: { 'Authorization': `Bearer ${this.app.api.token}` }
                });
                if (!resp.ok) throw new Error("Falha na exportação");
                const blob = await resp.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = "PixelDisplay240_Project.zip";
                a.click();
                URL.revokeObjectURL(url);
                this.view.setSyncStatus('synced');
            } catch (err) {
                console.error("Export failed:", err);
                alert("Erro ao exportar projeto para hardware.");
                this.view.setSyncStatus('error');
            }
        };
    }

    /**
     * Bidirectional sync: parse C++ code → update model elements.
     */
    _syncCodeToModel(code) {
        if (this._syncTimer) clearTimeout(this._syncTimer);
        this._syncTimer = setTimeout(async () => {
            if (this._isSyncingOrder || this._isReordering) return;
            await this._doSyncCodeToModel(code);
        }, 50);
    }

    /**
     * ATOMIC SYNC: Processa todas as telas e elementos globalmente.
     */
    async _doSyncCodeToModel(code) {
        const parsedScreenOrder = this.view._parseScreenOrderFromCode(code);
        let modelChanged = false;

        // 1. Sincroniza ESTRUTURA de Telas (Criação, Remoção e Reordenação)
        for (let i = 0; i < parsedScreenOrder.length; i++) {
            const cleanName = parsedScreenOrder[i];
            const actualScreen = this.model.screens.find(s => this.view._cleanName(s.name) === cleanName);

            if (!actualScreen) {
                console.log(`[Controller] Criando nova tela via código: draw_${cleanName}`);
                const newId = `screen_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                this.model.screens.splice(i, 0, { id: newId, name: cleanName, elements: [] });
                if (i === 0 && !this.model.activeScreenId) this.model.activeScreenId = newId;
                modelChanged = true;
            } else {
                const currentIndex = this.model.screens.indexOf(actualScreen);
                if (currentIndex !== i) {
                    this.model.screens.splice(currentIndex, 1);
                    this.model.screens.splice(i, 0, actualScreen);
                    modelChanged = true;
                }
            }
        }

        const oldScreenCount = this.model.screens.length;
        this.model.screens = this.model.screens.filter(s => parsedScreenOrder.includes(this.view._cleanName(s.name)));
        if (this.model.screens.length !== oldScreenCount) {
            modelChanged = true;
            if (!this.model.activeScreenId || !this.model.screens.find(s => s.id === this.model.activeScreenId)) {
                this.model.activeScreenId = this.model.screens[0]?.id;
            }
        }

        // 2. Sincroniza ELEMENTOS de todas as telas detectadas
        for (const screen of this.model.screens) {
            const fnName = this.view._cleanName(screen.name);
            const parsedElements = this.view._parseElementsFromCode(code, fnName);
            if (!parsedElements) continue;

            const matchedIds = new Set();
            const finalOrder = [];

            for (const p of parsedElements) {
                let match = screen.elements.find(el =>
                    !matchedIds.has(el.id) && el.type === p.type && (p.name ? el.name === p.name : true)
                );
                if (!match) match = screen.elements.find(el => !matchedIds.has(el.id) && el.type === p.type);

                if (match) {
                    matchedIds.add(match.id);
                    finalOrder.push(match.id);
                    if (match.x !== p.x || match.y !== p.y || match.w !== p.w || match.h !== p.h ||
                        match.color !== p.color || (p.name && match.name !== p.name) || match.asset !== p.asset) {

                        Object.assign(match, p);
                        modelChanged = true;
                    }
                } else {
                    const elId = `el_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                    screen.elements.push({ id: elId, ...p });
                    matchedIds.add(elId);
                    finalOrder.push(elId);
                    modelChanged = true;
                }
            }

            const oldElCount = screen.elements.length;
            screen.elements = screen.elements.filter(el => matchedIds.has(el.id));
            if (screen.elements.length !== oldElCount) modelChanged = true;

            for (let i = 0; i < finalOrder.length; i++) {
                const elId = finalOrder[i];
                const currentIndex = screen.elements.findIndex(el => el.id === elId);
                if (currentIndex !== -1 && currentIndex !== i) {
                    const el = screen.elements.splice(currentIndex, 1)[0];
                    screen.elements.splice(i, 0, el);
                    modelChanged = true;
                }
            }
        }

        if (modelChanged) {
            this.queueSave();
        }
    }

    handleMouseDown(e) {
        const rect = e.target.getBoundingClientRect();
        const scaleX = 240 / rect.width;
        const scaleY = 240 / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        const screen = this.model.activeScreen;
        if (!screen) return;

        if (this.model.selectedElementId) {
            const el = screen.elements.find(e => e.id === this.model.selectedElementId);
            if (el) {
                if (x >= el.x + el.w - 10 && x <= el.x + el.w + 5 && y >= el.y + el.h - 10 && y <= el.y + el.h + 5) {
                    this.resizingElement = el;
                    this.draggingElement = null;
                    return;
                }
            }
        }

        this.draggingElement = null;
        this.resizingElement = null;
        for (let i = screen.elements.length - 1; i >= 0; i--) {
            const el = screen.elements[i];
            if (x >= el.x && x <= el.x + el.w && y >= el.y && y <= el.y + el.h) {
                this.draggingElement = el;
                this.dragOffset = { x: x - el.x, y: y - el.y };
                this.view.onSelectElement(el.id);
                break;
            }
        }
        if (!this.draggingElement && !this.resizingElement) this.view.onSelectElement(null);
    }

    handleMouseMove(e) {
        if (!this.draggingElement && !this.resizingElement) return;
        const rect = e.target.getBoundingClientRect();
        const scaleX = 240 / rect.width;
        const scaleY = 240 / rect.height;
        const currentX = (e.clientX - rect.left) * scaleX;
        const currentY = (e.clientY - rect.top) * scaleY;

        if (this.resizingElement) {
            this.resizingElement.w = Math.round(Math.max(5, currentX - this.resizingElement.x));
            this.resizingElement.h = Math.round(Math.max(5, currentY - this.resizingElement.y));
            this.view.render(this.model);
            return;
        }
        if (this.draggingElement) {
            this.draggingElement.x = Math.round(currentX - this.dragOffset.x);
            this.draggingElement.y = Math.round(currentY - this.dragOffset.y);
            this.view.render(this.model);
        }
    }

    async handleMouseUp(e) {
        if (this.resizingElement || this.draggingElement) {
            this.queueSave();
            this.resizingElement = null;
            this.draggingElement = null;
        }
    }

    async importFromCollection(dataUrl) {
        this.model.assets.push({ name: `Design_${Date.now()}`, dataUrl: dataUrl, kind: 'image' });
        this.queueSave();
    }

    refresh() { this.sync(); }
}

if (window.PixelDisplay240System) window.PixelDisplay240System.register('controller', '5.1.0');
