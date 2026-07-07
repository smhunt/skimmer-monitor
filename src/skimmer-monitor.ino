/*
 * Skimmer Water Level Monitor
 *
 * Particle Photon (original; also builds for Photon 2) + VL53L1X ToF + SHT41
 * Pool skimmer water level monitoring with auto-fill control
 *
 * Author: EcoWorks Web Architecture Inc.
 * License: MIT
 */

#include "Particle.h"
#include "SparkFun_VL53L1X.h"
#include "adafruit-sht31.h"
#include "MQTT.h"
#include "config.h"

SYSTEM_THREAD(ENABLED);
SYSTEM_MODE(SEMI_AUTOMATIC);

// --- Hardware ---
void mqttCallback(char* topic, byte* payload, unsigned int length);

SFEVL53L1X tof;
Adafruit_SHT31 sht = Adafruit_SHT31();
MQTT mqtt(MQTT_BROKER, MQTT_PORT, mqttCallback);

// --- Retained state (survives sleep) ---
retained uint8_t  dailyFillCount = 0;
retained uint8_t  lastFillDay = 0;
retained float    lastLevelMm = 0;
retained uint32_t totalFillCycles = 0;
retained float    cumulativeFillMm = 0;

// --- Cloud-exposed variables ---
double cloudLevelMm = 0;
double cloudTempC = 0;
double cloudHumidity = 0;
double cloudBatteryV = 0;
int    cloudFillsToday = 0;
int    cloudTotalFills = 0;

// --- Forward declarations ---
void mqttCallback(char* topic, byte* payload, unsigned int length);
float readDistanceMedian(uint8_t samples);
void startFill();
void stopFill();
void doFillCycle(float startLevelMm);
void publishReadings(float levelMm, float tempC, float humidity, float batteryV);
int forceFill(String cmd);
int forceStop(String cmd);
int resetCounters(String cmd);
int calibrateOffset(String cmd);

void setup() {
    Serial.begin(115200);
    pinMode(RELAY_PIN, OUTPUT);
    digitalWrite(RELAY_PIN, LOW);

    Wire.begin();
    delay(100);

    // Init VL53L1X
    if (tof.begin() != 0) {
        Particle.publish("skimmer/error", "tof-init-failed", PRIVATE);
    }
    tof.setDistanceModeShort();
    tof.setTimingBudgetInMs(100);
    tof.setIntermeasurementPeriod(105);

    // Init SHT41
    if (!sht.begin(0x44)) {
        Particle.publish("skimmer/error", "sht-init-failed", PRIVATE);
    }

    // Cloud variables
    Particle.variable("level_mm", cloudLevelMm);
    Particle.variable("temp_c", cloudTempC);
    Particle.variable("humidity", cloudHumidity);
    Particle.variable("battery_v", cloudBatteryV);
    Particle.variable("fills_today", cloudFillsToday);
    Particle.variable("total_fills", cloudTotalFills);

    // Cloud functions
    Particle.function("fill", forceFill);
    Particle.function("stop", forceStop);
    Particle.function("reset", resetCounters);
    Particle.function("calibrate", calibrateOffset);

    Particle.connect();
    waitFor(Particle.connected, 30000);
}

void loop() {
    // Reset daily counter at midnight
    uint8_t today = Time.day();
    if (today != lastFillDay) {
        dailyFillCount = 0;
        lastFillDay = today;
    }

    // Read sensors
    float distance = readDistanceMedian(MEDIAN_SAMPLES);
    float levelMm = SKIMMER_DEPTH_MM - distance;
    float tempC = sht.readTemperature();
    float humidity = sht.readHumidity();
    float batteryV = analogRead(BATTERY_ADC_PIN) * 3.3 / 4095.0 * BATTERY_DIVIDER_RATIO;

    // Condensation alert
    if (humidity > CONDENSATION_THRESHOLD) {
        Particle.publish("skimmer/alert", "condensation", PRIVATE);
    }

    // Low battery alert (don't fill if battery is low)
    if (batteryV < LOW_BATTERY_THRESHOLD) {
        Particle.publish("skimmer/alert", "low-battery", PRIVATE);
    }

    // Auto-fill decision
    bool needsFill = (levelMm < LOW_WATER_TRIGGER_MM) &&
                     (dailyFillCount < MAX_DAILY_FILLS) &&
                     (batteryV >= LOW_BATTERY_THRESHOLD);

    if (needsFill) {
        doFillCycle(levelMm);
        // Re-read after fill cycle
        distance = readDistanceMedian(MEDIAN_SAMPLES);
        levelMm = SKIMMER_DEPTH_MM - distance;
    }

    publishReadings(levelMm, tempC, humidity, batteryV);
    lastLevelMm = levelMm;

    // Sleep until next read
    SystemSleepConfiguration sleepConfig;
    sleepConfig.mode(SystemSleepMode::ULTRA_LOW_POWER)
               .duration(SLEEP_DURATION_S * 1000)
               .network(NETWORK_INTERFACE_WIFI_STA);
    System.sleep(sleepConfig);
}

// --- Sensor reading ---

float readDistance() {
    tof.startRanging();
    while (!tof.checkForDataReady()) delay(5);
    uint16_t d = tof.getDistance();
    tof.clearInterrupt();
    tof.stopRanging();
    return (float)d;
}

float readDistanceMedian(uint8_t samples) {
    if (samples > 11) samples = 11;
    float vals[11];

    for (uint8_t i = 0; i < samples; i++) {
        vals[i] = readDistance();
        delay(50);
    }

    // Insertion sort
    for (uint8_t i = 1; i < samples; i++) {
        float key = vals[i];
        int8_t j = i - 1;
        while (j >= 0 && vals[j] > key) {
            vals[j + 1] = vals[j];
            j--;
        }
        vals[j + 1] = key;
    }

    return vals[samples / 2] + WINDOW_OFFSET_MM;
}

// --- Fill control ---

void startFill() {
    digitalWrite(RELAY_PIN, HIGH);
    Particle.publish("skimmer/fill", "start", PRIVATE);
}

void stopFill() {
    digitalWrite(RELAY_PIN, LOW);
    Particle.publish("skimmer/fill", "stop", PRIVATE);
}

void doFillCycle(float startLevelMm) {
    uint32_t fillStart = millis();
    startFill();

    while (millis() - fillStart < MAX_FILL_DURATION_MS) {
        delay(FILL_CHECK_INTERVAL_MS);

        float distance = readDistanceMedian(3);
        float current = SKIMMER_DEPTH_MM - distance;

        // Rate-of-rise safety check (leak/stuck valve detection)
        if (millis() - fillStart > RATE_CHECK_DELAY_MS &&
            (current - startLevelMm) < MIN_RISE_MM) {
            Particle.publish("skimmer/alert", "no-rise-aborting", PRIVATE);
            break;
        }

        if (current >= FILL_TARGET_MM) {
            cumulativeFillMm += (current - startLevelMm);
            break;
        }
    }

    stopFill();
    dailyFillCount++;
    totalFillCycles++;
}

// --- Publishing ---

void publishReadings(float levelMm, float tempC, float humidity, float batteryV) {
    cloudLevelMm = levelMm;
    cloudTempC = tempC;
    cloudHumidity = humidity;
    cloudBatteryV = batteryV;
    cloudFillsToday = dailyFillCount;
    cloudTotalFills = totalFillCycles;

    // Particle Cloud event
    char payload[256];
    snprintf(payload, sizeof(payload),
        "{\"level_mm\":%.1f,\"temp_c\":%.1f,\"humidity\":%.1f,\"battery_v\":%.2f,\"fills_today\":%d,\"total_fills\":%lu}",
        levelMm, tempC, humidity, batteryV, dailyFillCount, (unsigned long)totalFillCycles);
    Particle.publish("skimmer/reading", payload, PRIVATE);

    // MQTT for Home Assistant
    if (!mqtt.isConnected()) {
        mqtt.connect("skimmer-photon");
    }
    if (mqtt.isConnected()) {
        mqtt.publish("pool/skimmer/level", String(levelMm, 1));
        mqtt.publish("pool/skimmer/temperature", String(tempC, 1));
        mqtt.publish("pool/skimmer/humidity", String(humidity, 1));
        mqtt.publish("pool/skimmer/battery", String(batteryV, 2));
        mqtt.publish("pool/skimmer/fills_today", String(dailyFillCount));
        mqtt.publish("pool/skimmer/total_fills", String(totalFillCycles));
        mqtt.loop();
    }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
    // Reserved for command subscriptions
}

// --- Cloud functions ---

int forceFill(String cmd) {
    if (dailyFillCount >= MAX_DAILY_FILLS) return -1;
    float distance = readDistanceMedian(MEDIAN_SAMPLES);
    float levelMm = SKIMMER_DEPTH_MM - distance;
    doFillCycle(levelMm);
    return 0;
}

int forceStop(String cmd) {
    stopFill();
    return 0;
}

int resetCounters(String cmd) {
    dailyFillCount = 0;
    totalFillCycles = 0;
    cumulativeFillMm = 0;
    return 0;
}

int calibrateOffset(String cmd) {
    // Run with skimmer empty - records baseline distance to bottom
    float baseline = readDistanceMedian(11);
    char msg[64];
    snprintf(msg, sizeof(msg), "calibration: baseline=%.1fmm", baseline);
    Particle.publish("skimmer/calibrate", msg, PRIVATE);
    return (int)baseline;
}
