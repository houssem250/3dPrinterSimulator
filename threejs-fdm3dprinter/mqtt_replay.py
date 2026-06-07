import sqlite3
import json
import time
from datetime import datetime
import paho.mqtt.client as mqtt
import sys

# Configuration
DB_PATH = 'sample_telemetry/telemetry_temp_err.db'
BROKER = 'localhost'
PORT = 1883

def get_timestamp(ts_str):
    # Parse ISO8601 string to a datetime object
    # e.g., "2026-06-04T08:52:46.053Z"
    try:
        if ts_str.endswith('Z'):
            ts_str = ts_str[:-1] + '+00:00'
        return datetime.fromisoformat(ts_str)
    except ValueError:
        return None

def main():
    print(f"Connecting to MQTT Broker at {BROKER}:{PORT}...")
    client = mqtt.Client(client_id="MqttReplayScript")
    try:
        client.connect(BROKER, PORT, 60)
    except Exception as e:
        print(f"Failed to connect to MQTT broker: {e}")
        print("Make sure Mosquitto is running.")
        sys.exit(1)

    print(f"Opening database: {DB_PATH}")
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
    except Exception as e:
        print(f"Failed to open database: {e}")
        sys.exit(1)

    # Fetch all rows relying on default insertion order (which is already chronological)
    # This avoids the expensive string sorting from ORDER BY timestamp ASC
    cursor.execute("SELECT topic, timestamp, payload_json FROM telemetry")
    rows = cursor.fetchall()
    conn.close()

    if not rows:
        print("No data found in the database.")
        sys.exit(0)

    print(f"Loaded {len(rows)} messages. Starting replay...")

    last_dt = None
    start_real_time = time.time()
    msg_count = 0

    for topic, ts_str, payload in rows:
        current_dt = get_timestamp(ts_str)
        
        if current_dt and last_dt:
            # Calculate how long to wait based on the timestamps
            delta_seconds = (current_dt - last_dt).total_seconds()
            if delta_seconds > 0:
                # To avoid massive delays if there's a huge gap in the DB, 
                # we cap the sleep at 5 seconds.
                sleep_time = min(delta_seconds, 5.0)
                time.sleep(sleep_time)

        # Publish
        client.publish(topic, payload)
        msg_count += 1
        
        if msg_count % 500 == 0:
            print(f"Published {msg_count} messages...")

        if current_dt:
            last_dt = current_dt

    print(f"Finished replaying {msg_count} messages.")
    client.disconnect()

if __name__ == '__main__':
    main()
