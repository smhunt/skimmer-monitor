/*
 * Configuration parameters
 * Tune these for your specific skimmer geometry and pool setup
 */

#ifndef CONFIG_H
#define CONFIG_H

// --- Skimmer geometry ---
// Distance from sensor mounting plane (lid underside) to skimmer throat bottom
#define SKIMMER_DEPTH_MM        250

// Offset added to ToF reading to compensate for glass window
// Determine empirically: measure known distance with and without window installed
#define WINDOW_OFFSET_MM        0

// --- Fill thresholds (all in mm from skimmer bottom) ---
#define LOW_WATER_TRIGGER_MM    80    // Start filling when level drops below
#define FILL_TARGET_MM          150   // Stop filling when level reaches
#define MIN_RISE_MM             5     // Minimum rise during rate check

// --- Fill timing ---
#define MAX_FILL_DURATION_MS    600000UL   // 10 min hard cap
#define FILL_CHECK_INTERVAL_MS  30000UL    // Check level every 30s during fill
#define RATE_CHECK_DELAY_MS     120000UL   // Verify rise after 2 min
#define MAX_DAILY_FILLS         6          // Alert if exceeded (likely leak)

// --- Sampling ---
#define MEDIAN_SAMPLES          7
#define SLEEP_DURATION_S        300         // 5 minute reporting interval

// --- Pins ---
#define RELAY_PIN               D7
#define BATTERY_ADC_PIN         A0
#define BATTERY_DIVIDER_RATIO   2.0         // Voltage divider on battery monitor

// --- Battery thresholds ---
#define LOW_BATTERY_THRESHOLD   3.5         // Volts
#define CRITICAL_BATTERY_V      3.2

// --- Environmental ---
#define CONDENSATION_THRESHOLD  85.0        // % RH inside enclosure

// --- MQTT ---
#define MQTT_BROKER             "10.10.10.24"   // Mosquitto (Docker) on Sean's MBP
#define MQTT_PORT               1883

#endif
