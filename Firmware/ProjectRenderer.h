#ifndef PROJECT_RENDERER_H
#define PROJECT_RENDERER_H

#include <TFT_eSPI.h>
#include <ArduinoJson.h>
#include <TJpg_Decoder.h>
#include <LittleFS.h>

class ProjectRenderer {
public:
    ProjectRenderer(TFT_eSPI& tft) : _tft(tft) {}

    void renderProject(JsonDocument& doc) {
        const char* activeScreenId = doc["activeScreenId"];
        if (!activeScreenId) return;

        JsonArray screens = doc["screens"];
        for (JsonObject screen : screens) {
            if (strcmp(screen["id"], activeScreenId) == 0) {
                renderScreen(screen);
                break;
            }
        }
    }

    void renderScreen(JsonObject screen) {
        // Background Color
        if (screen.containsKey("backgroundColor")) {
            const char* colorHex = screen["backgroundColor"];
            _tft.fillScreen(hexTo565(colorHex));
        }

        JsonArray elements = screen["elements"];
        for (JsonObject el : elements) {
            renderElement(el);
        }

        // Handle Background Asset
        if (screen.containsKey("backgroundAsset")) {
            const char* assetName = screen["backgroundAsset"];
            if (assetName && strlen(assetName) > 0) {
                String path = "/" + String(assetName) + ".jpg";
                if (LittleFS.exists(path)) {
                    TJpg_Decoder.drawJpgFile(LittleFS, path.c_str(), 0, 0);
                }
            }
        }
    }

    void renderElement(JsonObject el) {
        const char* type = el["type"];
        const char* name = el["name"];
        int x = el["x"];
        int y = el["y"];
        int w = el["w"];
        int h = el["h"];
        const char* colorHex = el["color"];
        uint16_t color = hexTo565(colorHex);

        if (strcmp(type, "fillRect") == 0) {
            _tft.fillRect(x, y, w, h, color);
        } else if (strcmp(type, "drawRect") == 0) {
            _tft.drawRect(x, y, w, h, color);
        } else if (strcmp(type, "fillRoundRect") == 0) {
            _tft.fillRoundRect(x, y, w, h, 8, color);
        } else if (strcmp(type, "fillCircle") == 0) {
            int r = min(w, h) / 2;
            _tft.fillCircle(x + w / 2, y + h / 2, r, color);
        } else if (strcmp(type, "drawCircle") == 0) {
            int r = min(w, h) / 2;
            _tft.drawCircle(x + w / 2, y + h / 2, r, color);
        } else if (strcmp(type, "fillTriangle") == 0) {
            _tft.fillTriangle(x + w / 2, y, x, y + h, x + w, y + h, color);
        } else if (strcmp(type, "drawString") == 0) {
            _tft.setTextColor(color);
            _tft.setTextSize(max(1, h / 8));
            _tft.drawString(name, x, y);
        } else if (strcmp(type, "drawCentreString") == 0) {
            _tft.setTextColor(color);
            _tft.setTextSize(max(1, h / 8));
            _tft.drawCentreString(name, x + w / 2, y, 2);
        } else if (el.containsKey("asset")) {
            const char* assetName = el["asset"];
            if (assetName && strlen(assetName) > 0) {
                String path = "/" + String(assetName) + ".jpg";
                if (LittleFS.exists(path)) {
                    TJpg_Decoder.drawJpgFile(LittleFS, path.c_str(), x, y);
                }
            }
        }
    }

    // Binary Rendering for Production (Ultra Efficient)
    void renderBinary(File& file) {
        char magic[5];
        file.readBytes(magic, 4);
        magic[4] = '\0';
        if (strcmp(magic, "P240") != 0) return;

        uint8_t version = file.read();
        uint8_t numScreens = file.read();

        // Simple binary playback (renders first screen for now)
        if (numScreens > 0) {
            uint16_t bgColor;
            file.read((uint8_t*)&bgColor, 2);
            _tft.fillScreen(bgColor);

            uint16_t numElements;
            file.read((uint8_t*)&numElements, 2);

            for (int i = 0; i < numElements; i++) {
                uint8_t type = file.read();
                int16_t x, y, w, h;
                uint16_t color;
                file.read((uint8_t*)&x, 2);
                file.read((uint8_t*)&y, 2);
                file.read((uint8_t*)&w, 2);
                file.read((uint8_t*)&h, 2);
                file.read((uint8_t*)&color, 2);

                uint8_t nameLen = file.read();
                char name[32];
                if (nameLen > 31) nameLen = 31;
                file.readBytes(name, nameLen);
                name[nameLen] = '\0';

                drawBinaryElement(type, x, y, w, h, color, name);
            }
        }
    }

private:
    TFT_eSPI& _tft;

    void drawBinaryElement(uint8_t type, int16_t x, int16_t y, int16_t w, int16_t h, uint16_t color, const char* name) {
        switch (type) {
            case 1: _tft.fillRect(x, y, w, h, color); break;
            case 2: _tft.drawRect(x, y, w, h, color); break;
            case 3: _tft.fillRoundRect(x, y, w, h, 8, color); break;
            case 4: _tft.fillCircle(x + w / 2, y + h / 2, min(w, h) / 2, color); break;
            case 5: _tft.drawCircle(x + w / 2, y + h / 2, min(w, h) / 2, color); break;
            case 6: _tft.fillTriangle(x + w / 2, y, x, y + h, x + w, y + h, color); break;
            case 7: 
                _tft.setTextColor(color);
                _tft.setTextSize(max(1, h / 8));
                _tft.drawString(name, x, y);
                break;
            case 8:
                _tft.setTextColor(color);
                _tft.setTextSize(max(1, h / 8));
                _tft.drawCentreString(name, x + w / 2, y, 2);
                break;
        }
    }

    uint16_t hexTo565(const char* hex) {
        if (!hex || hex[0] != '#') return 0x0000;
        
        long rgb = strtol(hex + 1, NULL, 16);
        if (strlen(hex) == 4) { // #RGB
            int r = (rgb >> 8) & 0xF;
            int g = (rgb >> 4) & 0xF;
            int b = rgb & 0xF;
            r = (r << 4) | r;
            g = (g << 4) | g;
            b = (b << 4) | b;
            rgb = (r << 16) | (g << 8) | b;
        }

        uint8_t r = (rgb >> 16) & 0xFF;
        uint8_t g = (rgb >> 8) & 0xFF;
        uint8_t b = rgb & 0xFF;

        return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
    }
};

#endif
