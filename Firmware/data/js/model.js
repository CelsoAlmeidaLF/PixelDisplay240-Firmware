class PrototypeModel {
    constructor() {
        this.screens = [];
        this.assets = [];
        this.activeScreenId = null;
        this.selectedElementId = null;
        this.screenSeq = 1;
        this.elementSeq = 1;
    }

    get activeScreen() {
        return this.screens.find(s => s.id === this.activeScreenId);
    }

    updateFromData(data) {
        if (!data) return;
        this.screens = data.screens || [];
        this.assets = data.assets || [];
        this.activeScreenId = data.activeScreenId;
        this.selectedElementId = data.selectedElementId;
        this.screenSeq = data.screenSeq || (this.screens.length + 1);
        this.elementSeq = data.elementSeq || 1;
    }

    getRawData() {
        return {
            screens: this.screens,
            assets: this.assets,
            activeScreenId: this.activeScreenId,
            selectedElementId: this.selectedElementId,
            screenSeq: this.screenSeq,
            elementSeq: this.elementSeq
        };
    }

    saveToLocal() {
        localStorage.setItem('pixeldisplay240_project', JSON.stringify(this.getRawData()));
    }
}
if (window.PixelDisplay240System) window.PixelDisplay240System.register('model', '5.1.0');
