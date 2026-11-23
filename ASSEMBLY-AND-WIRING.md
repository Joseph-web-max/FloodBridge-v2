# FloodBridge ESP32 demonstrator — assembly and wiring

## Prototype bill of materials
- ESP32 DevKit / ESP32-WROOM compatible board.
- JSN-SR04T waterproof ultrasonic probe and matching controller board (confirm exact hardware revision).
- 5 V regulated supply suitable for the sensor current and the selected ESP32 board power input.
- 10 kΩ and 20 kΩ resistors for an ECHO voltage divider (or a suitable 5 V-to-3.3 V level shifter).
- Breadboard / terminal block, jumpers and a USB data cable for bench testing.
- Non-conductive test stand and a water container for controlled range testing.
- For later field deployment: engineered bracket, sealed rated enclosure, surge/lightning protection, battery/solar design and safe mounting hardware selected by a qualified installer.

## Bench wiring
| JSN-SR04T controller | ESP32 |
|---|---|
| VCC | 5 V supply (check your board's documented 5 V input pin and power topology) |
| GND | Common GND |
| TRIG | GPIO 18 |
| ECHO | GPIO 19 through a resistor divider / level shifter |

**ECHO divider:** connect sensor ECHO to a 10 kΩ resistor, then to ESP32 GPIO 19. Connect a 20 kΩ resistor from GPIO 19 to GND. This gives approximately 3.3 V from a 5 V logic-high. A properly rated logic-level shifter is also acceptable. Do not feed a 5 V ECHO signal directly to an ESP32 input.

## Sensor mounting reference
- Probe points vertically down to the water surface, without obstruction in its acoustic cone.
- Confirm minimum and maximum range for the exact sensor revision. A common JSN-SR04T manual specifies a minimum range around 25 cm; variants differ.
- Sensor-to-datum height must be surveyed and documented by a qualified person.
- Firmware default is `SENSOR_HEIGHT_ABOVE_DATUM_M = -1.0`, which intentionally prevents stage calculation until configured.
- Even with a datum, the result is a local water stage, not water depth on a road, flow velocity or discharge.

## Firmware
Open `FloodBridge_ESP32_WaterLevel.ino` in Arduino IDE, choose the correct ESP32 board and port, then compile and flash. Confirm ESP32 BLE support is available with your installed Arduino-ESP32 core. The sketch uses the core BLE library (BLEDevice/BLEServer/BLE2902).

## Bench commissioning
1. Inspect wiring with power disconnected.
2. Confirm common ground and ECHO voltage divider before connecting GPIO.
3. Power the sensor from an appropriate 5 V regulated source.
4. Open serial monitor at 115200 baud.
5. Move a flat target at known measured distances within the valid range.
6. Check repeatability; compare against a tape measure.
7. Test missing echo and invalid range.
8. Confirm JSON is emitted once per 30 seconds.
9. Confirm BLE NUS connection and JSON line reconstruction on a supported HTTPS site.
10. Never infer gauge datum, thresholds or flood safety from bench data.

## Power caution
Do not power a board through USB and an external supply simultaneously unless the exact board documentation explicitly supports that configuration. Avoid exposed electronics around water. The hobby module is not a certified unattended river gauge.
