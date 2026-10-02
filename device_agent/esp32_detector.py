import time

import serial

from serial.tools import list_ports

from config import (
    SERIAL_BAUD,
    SERIAL_TIMEOUT,
)


# ============================================================
# KNOWN USB-UART NAMES
# ============================================================

LIKELY_DESCRIPTIONS = (
    "CP210",
    "CH340",
    "CH910",
    "USB SERIAL",
    "UART",
    "SILICON LABS",
)


# ============================================================
# PORT SCORE
# ============================================================

def score_port(port):

    description = (
        port.description
        or ""
    ).upper()

    score = 0

    for keyword in LIKELY_DESCRIPTIONS:

        if keyword in description:
            score += 10

    if port.vid is not None:
        score += 1

    if port.pid is not None:
        score += 1

    return score


# ============================================================
# GET CANDIDATE PORTS
# ============================================================

def get_candidate_ports():

    ports = list(
        list_ports.comports()
    )

    ports.sort(
        key=score_port,
        reverse=True,
    )

    return ports


# ============================================================
# TEST ONE PORT
# ============================================================

def test_port(
    device,
    seconds=4,
):

    print(
        f"Testing {device}..."
    )

    try:

        ser = serial.Serial(
            port=device,
            baudrate=SERIAL_BAUD,
            timeout=SERIAL_TIMEOUT,
        )

        # Avoid some ESP32 reset behaviour
        try:
            ser.dtr = False
            ser.rts = False
        except Exception:
            pass

        start = time.time()

        while (
            time.time()
            -
            start
            <
            seconds
        ):

            line = (
                ser.readline()
                .decode(
                    "utf-8",
                    errors="ignore",
                )
                .strip()
            )

            if not line:
                continue

            if (
                "CSI_DATA," in line
                or
                "RESPICARE CSI" in line
                or
                "CSI CAPTURE READY" in line
            ):

                print(
                    f"ESP32 detected on {device}"
                )

                return ser

        ser.close()

    except Exception as error:

        print(
            f"Skipping {device}: {error}"
        )

    return None


# ============================================================
# AUTO DETECT ESP32
# ============================================================

def find_esp32():

    ports = get_candidate_ports()

    if not ports:

        raise RuntimeError(
            "No serial devices found."
        )

    print()
    print(
        "Searching for RespiCare ESP32..."
    )

    for port in ports:

        print(
            f"{port.device} - "
            f"{port.description}"
        )

    print()

    for port in ports:

        connection = test_port(
            port.device
        )

        if connection is not None:

            return connection

    raise RuntimeError(
        "RespiCare ESP32 not detected."
    )


# ============================================================
# MANUAL TEST
# ============================================================

if __name__ == "__main__":

    serial_connection = (
        find_esp32()
    )

    print()
    print(
        "ESP32 CONNECTED"
    )

    print(
        f"Port: "
        f"{serial_connection.port}"
    )

    serial_connection.close()