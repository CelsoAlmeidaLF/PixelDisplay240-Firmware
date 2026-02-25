#include <WiFi.h>
#include <WebServer.h>
#include <LittleFS.h>
#include <TFT_eSPI.h>
#include <ArduinoJson.h>
#include "ProjectRenderer.h"

// --- CONFIGURAÇÕES ---
const char* ssid = "NOME_DO_WIFI";
const char* password = "SENHA_DO_WIFI";

TFT_eSPI tft = TFT_eSPI();
ProjectRenderer renderer(tft);
WebServer server(80);

// Global Project State
JsonDocument projectDoc;
bool projectChanged = true;
SemaphoreHandle_t projectMutex;

// --- TJpg_Decoder Callback ---
bool tjpgCallback(int16_t x, int16_t y, uint16_t w, uint16_t h, uint16_t* bitmap) {
    if (y >= tft.height()) return false;
    tft.pushImage(x, y, w, h, bitmap);
    return true;
}

// --- TASK: DISPLAY RENDERER ---
void TaskDisplay(void *pvParameters) {
    (void) pvParameters;
    
    for (;;) {
        if (projectChanged) {
            if (xSemaphoreTake(projectMutex, portMAX_DELAY)) {
                tft.startWrite();
                
                if (LittleFS.exists("/project.bin")) {
                    File file = LittleFS.open("/project.bin", "r");
                    renderer.renderBinary(file);
                    file.close();
                } else {
                    renderer.renderProject(projectDoc);
                }
                
                tft.endWrite();
                projectChanged = false;
                xSemaphoreGive(projectMutex);
            }
        }
        vTaskDelay(pdMS_TO_TICKS(100)); // 10fps check
    }
}

// --- HANDLERS: WEB SERVER ---

void handleDeployBinary() {
    if (server.hasArg("plain") || server.args() == 0) { // Handles raw body
        WiFiClient client = server.client();
        File file = LittleFS.open("/project.bin", "w");
        if (file) {
            while (client.available()) {
                file.write(client.read());
            }
            file.close();
            projectChanged = true;
            server.send(200, "application/json", "{\"status\":\"binary_deployed\"}");
        } else {
            server.send(500, "text/plain", "File system error");
        }
    }
}

void handleGetProject() {
    String output;
    if (xSemaphoreTake(projectMutex, portMAX_DELAY)) {
        serializeJson(projectDoc, output);
        xSemaphoreGive(projectMutex);
    }
    server.send(200, "application/json", output);
}

void handleSaveProject() {
    if (server.hasArg("plain")) {
        String body = server.arg("plain");
        
        if (xSemaphoreTake(projectMutex, portMAX_DELAY)) {
            DeserializationError error = deserializeJson(projectDoc, body);
            if (!error) {
                // Save to LittleFS
                File file = LittleFS.open("/project.json", "w");
                if (file) {
                    file.print(body);
                    file.close();
                }
                projectChanged = true;
                server.send(200, "application/json", "{\"status\":\"ok\"}");
            } else {
                server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
            }
            xSemaphoreGive(projectMutex);
        }
    } else {
        server.send(400, "text/plain", "Missing body");
    }
}

void handleAIImage() {
    if (server.hasArg("prompt")) {
        String prompt = server.arg("prompt");
        // Proxy to Pollinations or similar (needs WiFiClientSecure)
        // Simplified: return a message or redirect
        server.send(302, "text/plain", "https://image.pollinations.ai/prompt/" + prompt);
    } else {
        server.send(400, "text/plain", "Missing prompt");
    }
}

void handleAIAutoLayout() {
    // This would ideally call Gemini. 
    // Hosting the full logic on ESP32 is hard, so we just return the same elements for now
    // or proxy the request to an external service.
    if (server.hasArg("plain")) {
        String body = server.arg("plain");
        server.send(200, "application/json", body); // Dummy echo
    }
}

// Serve static files from LittleFS
bool handleFileRead(String path) {
    if (path.endsWith("/")) path += "index.html";
    String contentType = "text/plain";
    if (path.endsWith(".html")) contentType = "text/html";
    else if (path.endsWith(".css")) contentType = "text/css";
    else if (path.endsWith(".js")) contentType = "application/javascript";
    else if (path.endsWith(".png")) contentType = "image/png";
    else if (path.endsWith(".jpg")) contentType = "image/jpeg";
    else if (path.endsWith(".ico")) contentType = "image/x-icon";
    else if (path.endsWith(".svg")) contentType = "image/svg+xml";

    if (LittleFS.exists(path)) {
        File file = LittleFS.open(path, "r");
        server.streamFile(file, contentType);
        file.close();
        return true;
    }
    return false;
}

void setup() {
    Serial.begin(115200);
    
    // 1. Display
    tft.init();
    tft.setRotation(0);
    tft.fillScreen(TFT_BLACK);
    
    TJpg_Decoder.setCallback(tjpgCallback);
    TJpg_Decoder.setJpgScale(1);

    tft.setTextColor(TFT_WHITE);
    tft.drawString("Iniciando PixelDisplay240...", 10, 10);

    // 2. Filesystem
    if (!LittleFS.begin(true)) {
        Serial.println("Erro ao montar LittleFS");
        tft.drawString("Erro LittleFS!", 10, 30);
    }

    // Load project from memory
    if (LittleFS.exists("/project.json")) {
        File file = LittleFS.open("/project.json", "r");
        deserializeJson(projectDoc, file);
        file.close();
    } else {
        // Default Project
        projectDoc["activeScreenId"] = "screen_1";
        JsonArray screens = projectDoc.createNestedArray("screens");
        JsonObject s1 = screens.createNestedObject();
        s1["id"] = "screen_1";
        s1["name"] = "Main";
        s1["backgroundColor"] = "#000000";
        s1.createNestedArray("elements");
    }

    // 3. WiFi
    WiFi.begin(ssid, password);
    tft.drawString("Conectando WiFi...", 10, 50);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWiFi Conectado!");
    tft.fillScreen(TFT_BLACK);
    tft.drawString("IP: " + WiFi.localIP().toString(), 10, 10);

    // 4. Mutex
    projectMutex = xSemaphoreCreateMutex();

    // 5. RTOS Task
    xTaskCreatePinnedToCore(
        TaskDisplay,   // Function
        "DisplayTask", // Name
        8192,          // Stack size
        NULL,          // Parameter
        1,             // Priority
        NULL,          // Task handle
        1              // Core 1
    );

    // 6. Server Routes
    server.on("/api/prototype", HTTP_GET, handleGetProject);
    server.on("/api/prototype/save", HTTP_POST, handleSaveProject);
    server.on("/api/prototype/deploy", HTTP_POST, handleDeployBinary);
    server.on("/api/ai/image", HTTP_GET, handleAIImage);
    server.on("/api/ai/auto-layout", HTTP_POST, handleAIAutoLayout);
    
    // Dummy routes for compatibility
    server.on("/api/agents", HTTP_GET, []() {
        server.send(200, "application/json", "[]");
    });
    server.on("/api/auth/token", HTTP_GET, []() {
        server.send(200, "application/json", "{\"token\":\"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjQwNzY2NjI0MDB9.dummy\"}");
    });
    server.on("/api/logs", HTTP_POST, []() {
        server.send(200, "application/json", "{\"status\":\"ok\"}");
    });
    
    // Catch-all for static files
    server.onNotFound([]() {
        if (!handleFileRead(server.uri())) {
            server.send(404, "text/plain", "Not Found");
        }
    });

    server.begin();
    Serial.println("Servidor HTTP iniciado");
}

void loop() {
    server.handleClient();
    delay(2); // Yield to keep system stable
}
