# FloodBridge sensor telemetry protocol

## Transport
- USB serial: 115200 baud, UTF-8, newline-delimited JSON (JSONL).
- Bluetooth LE: Nordic UART Service UUIDs.
  - Service: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
  - RX: `6e400002-b5a3-f393-e0a9-e50e24dcca9e`
  - TX notify: `6e400003-b5a3-f393-e0a9-e50e24dcca9e`
- BLE fragments are reassembled by the web app until newline.

## Example line
```json
{"device_id":"FB-ESP32-001","site_id":"UNASSIGNED-SITE","distance_cm":143.2,"stage_m":null,"sensor_height_above_datum_m":null,"health":"ok","ts_ms":90000,"unit":"metres_from_local_datum"}
```

## Field definitions
- `distance_cm`: distance from sensor reference plane to reflecting water surface.
- `stage_m`: distance converted relative to local gauge datum; null until surveyed installation height is configured.
- `sensor_height_above_datum_m`: surveyed vertical distance from sensor reference plane to local gauge zero.
- `health`: basic echo validity only; not a calibration certificate.
- `ts_ms`: device uptime milliseconds, not UTC time. Browser `receivedAt` is reception time.

## Trust model
The bridge is unauthenticated. A received JSON message can be spoofed, delayed or altered. Production sensor integration requires unique device credentials, signed payloads or mutually authenticated transport, UTC time synchronisation and server audit logs.
