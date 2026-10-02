import os
import sys
import time
import getpass

import requests

from csi_processor import (
    CSIProcessor,
    load_calibration,
    parse_csi_line,
)

from esp32_detector import (
    find_esp32,
)


# ============================================================
# RESPICARE CONFIG
# ============================================================

API_BASE_URL = os.getenv(
    "RESPICARE_API_URL",
    "http://127.0.0.1:8000",
).rstrip("/")


REQUEST_TIMEOUT = 10


# ============================================================
# DISPLAY
# ============================================================

def banner(title):

    print()
    print("=" * 72)
    print(title)
    print("=" * 72)


# ============================================================
# LOGIN
# ============================================================

def login():

    banner(
        "RESPICARE DEVICE AGENT LOGIN"
    )

    email = os.getenv(
        "RESPICARE_EMAIL",
        "",
    ).strip()

    password = os.getenv(
        "RESPICARE_PASSWORD",
        "",
    )

    if not email:

        email = input(
            "Patient email: "
        ).strip()

    if not password:

        password = getpass.getpass(
            "Patient password: "
        )

    if not email or not password:

        raise RuntimeError(
            "Email and password are required."
        )

    url = (
        f"{API_BASE_URL}"
        f"/auth/login"
    )

    print()
    print(
        f"Connecting to: {API_BASE_URL}"
    )

    try:

        response = requests.post(
            url,
            json={
                "email": email,
                "password": password,
            },
            timeout=REQUEST_TIMEOUT,
        )

    except requests.RequestException as error:

        raise RuntimeError(
            "Could not connect to RespiCare backend.\n"
            f"{error}"
        )

    if response.status_code != 200:

        try:

            detail = response.json()

        except Exception:

            detail = response.text

        raise RuntimeError(
            "Login failed.\n"
            f"HTTP {response.status_code}\n"
            f"{detail}"
        )

    data = response.json()

    token = data.get(
        "access_token"
    )

    user = data.get(
        "user",
        {},
    )

    patient_id = user.get(
        "id"
    )

    role = str(
        user.get(
            "role",
            "",
        )
    ).upper()

    name = user.get(
        "name",
        "Patient",
    )

    if not token:

        raise RuntimeError(
            "Backend did not return access token."
        )

    if patient_id is None:

        raise RuntimeError(
            "Backend did not return patient ID."
        )

    if role != "PATIENT":

        raise RuntimeError(
            "The device agent must login using "
            "a PATIENT account."
        )

    print()
    print(
        f"Logged in as : {name}"
    )

    print(
        f"Patient ID   : {patient_id}"
    )

    print(
        f"Role         : {role}"
    )

    return {
        "token":
            token,

        "patient_id":
            int(
                patient_id
            ),

        "user":
            user,
    }


# ============================================================
# AUTH HEADERS
# ============================================================

def auth_headers(
    token,
):

    return {
        "Authorization":
            f"Bearer {token}",

        "Content-Type":
            "application/json",
    }


# ============================================================
# CONVERT CSI RESULT TO RESPICARE READING
# ============================================================

def build_payload(
    result,
):

    status = result.get(
        "status"
    )

    confidence = result.get(
        "confidence"
    )

    respiratory_rate = result.get(
        "respiratory_rate"
    )

    # ========================================================
    # GOOD RESPIRATION SIGNAL
    # ========================================================

    if status == "BREATHING_DETECTED":

        return {
            "respiratory_rate":
                respiratory_rate,

            "signal_quality":
                "GOOD",

            "pattern":
                "REGULAR",

            "confidence":
                confidence,

            # CSI amplitude is NOT calibrated tidal volume.
            "amplitude":
                None,
        }


    # ========================================================
    # BODY MOVEMENT
    # ========================================================

    if status == "MOVEMENT":

        return {
            "respiratory_rate":
                None,

            "signal_quality":
                "MOTION_ARTIFACT",

            "pattern":
                "UNRELIABLE",

            "confidence":
                confidence,

            "amplitude":
                None,
        }


    # ========================================================
    # WEAK SIGNAL
    # ========================================================

    if status == "LOW_SIGNAL":

        return {
            "respiratory_rate":
                None,

            "signal_quality":
                "POOR",

            "pattern":
                "LOW_SIGNAL",

            "confidence":
                confidence,

            "amplitude":
                None,
        }


    # ========================================================
    # NO RESPIRATORY SIGNAL
    # ========================================================

    if status == "NO_SIGNAL":

        return {
            "respiratory_rate":
                None,

            "signal_quality":
                "SIGNAL_LOSS",

            "pattern":
                "NO_SIGNAL",

            "confidence":
                0.0,

            "amplitude":
                None,
        }


    return None


# ============================================================
# SEND READING
# ============================================================

def send_reading(
    patient_id,
    token,
    payload,
):

    url = (
        f"{API_BASE_URL}"
        f"/monitoring/patient/"
        f"{patient_id}"
        f"/reading"
    )

    try:

        response = requests.post(
            url,
            headers=auth_headers(
                token
            ),
            json=payload,
            timeout=REQUEST_TIMEOUT,
        )

    except requests.RequestException as error:

        print()
        print(
            "[BACKEND ERROR]"
        )

        print(
            error
        )

        return False


    # ========================================================
    # TOKEN EXPIRED
    # ========================================================

    if response.status_code == 401:

        print()
        print(
            "Authentication token expired."
        )

        return "RELOGIN"


    if response.status_code not in (
        200,
        201,
    ):

        print()
        print(
            f"[HTTP {response.status_code}] "
            f"Reading rejected."
        )

        try:

            print(
                response.json()
            )

        except Exception:

            print(
                response.text
            )

        return False


    return True


# ============================================================
# PRINT LIVE RESULT
# ============================================================

def print_live_status(
    result,
    uploaded,
):

    status = result.get(
        "status"
    )

    bpm = result.get(
        "respiratory_rate"
    )

    quality = result.get(
        "signal_quality"
    )

    confidence = result.get(
        "confidence"
    )

    rssi = result.get(
        "rssi"
    )

    motion = result.get(
        "motion_detected"
    )

    frame_rate = result.get(
        "frame_rate"
    )

    print()
    print("=" * 72)

    print(
        "RESPICARE LIVE CSI"
    )

    print("=" * 72)

    print(
        f"Status           : "
        f"{status}"
    )

    if bpm is not None:

        print(
            f"Respiratory rate : "
            f"{bpm} BPM"
        )

    else:

        print(
            "Respiratory rate : --"
        )

    print(
        f"Signal quality   : "
        f"{quality}"
    )

    print(
        f"Confidence       : "
        f"{confidence}"
    )

    print(
        f"Motion           : "
        f"{motion}"
    )

    print(
        f"RSSI             : "
        f"{rssi} dBm"
    )

    print(
        f"CSI rate         : "
        f"{frame_rate} Hz"
    )

    print(
        f"Backend upload   : "
        f"{'SUCCESS' if uploaded else 'FAILED'}"
    )

    print("=" * 72)


# ============================================================
# MAIN DEVICE AGENT
# ============================================================

def run_agent():

    banner(
        "RESPICARE ESP32 CSI DEVICE AGENT"
    )


    # ========================================================
    # LOGIN
    # ========================================================

    session = login()

    token = session[
        "token"
    ]

    patient_id = session[
        "patient_id"
    ]


    # ========================================================
    # LOAD CSI CALIBRATION
    # ========================================================

    calibration = (
        load_calibration()
    )

    processor = CSIProcessor(
        calibration
    )


    # ========================================================
    # CONNECT ESP32
    # ========================================================

    banner(
        "CONNECTING RESPICARE ESP32"
    )

    serial_connection = (
        find_esp32()
    )

    print()
    print(
        f"ESP32 connected on "
        f"{serial_connection.port}"
    )


    # ========================================================
    # START
    # ========================================================

    banner(
        "LIVE RESPIRATORY MONITORING STARTED"
    )

    print(
        "Keep traffic.py running."
    )

    print()

    print(
        "CSI is processed locally."
    )

    print(
        "Only processed respiratory readings "
        "are sent to RespiCare."
    )

    print()

    print(
        "CTRL+C to stop."
    )

    print()


    try:

        while True:

            # =================================================
            # READ SERIAL LINE
            # =================================================

            try:

                raw_line = (
                    serial_connection
                    .readline()
                    .decode(
                        "utf-8",
                        errors="ignore",
                    )
                    .strip()
                )

            except Exception as error:

                print()
                print(
                    "ESP32 serial connection lost:"
                )

                print(
                    error
                )

                break


            if not raw_line:
                continue


            # =================================================
            # PARSE CSI
            # =================================================

            parsed = parse_csi_line(
                raw_line
            )

            if parsed is None:
                continue


            # =================================================
            # PROCESS CSI
            # =================================================

            result = processor.add_frame(
                parsed
            )

            if result is None:
                continue


            # =================================================
            # COLLECTION PHASE
            # =================================================

            if (
                result.get(
                    "status"
                )
                ==
                "COLLECTING"
            ):

                progress = result.get(
                    "progress",
                    0,
                )

                duration = result.get(
                    "duration",
                    0,
                )

                print(
                    "\r"
                    f"Collecting respiratory CSI... "
                    f"{duration:.1f}s "
                    f"({progress:.0f}%)",
                    end="",
                    flush=True,
                )

                continue


            # =================================================
            # CONVERT TO API PAYLOAD
            # =================================================

            payload = build_payload(
                result
            )

            if payload is None:
                continue


            # =================================================
            # SEND TO RESPICARE
            # =================================================

            upload_result = send_reading(
                patient_id=
                    patient_id,

                token=
                    token,

                payload=
                    payload,
            )


            # =================================================
            # TOKEN EXPIRED
            # =================================================

            if upload_result == "RELOGIN":

                print()
                print(
                    "Logging in again..."
                )

                session = login()

                token = session[
                    "token"
                ]

                patient_id = session[
                    "patient_id"
                ]

                upload_result = send_reading(
                    patient_id=
                        patient_id,

                    token=
                        token,

                    payload=
                        payload,
                )


            # =================================================
            # DISPLAY
            # =================================================

            print_live_status(
                result,
                upload_result is True,
            )


    except KeyboardInterrupt:

        print()
        print()
        print(
            "Monitoring stopped."
        )


    finally:

        try:

            serial_connection.close()

        except Exception:

            pass


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":

    try:

        run_agent()

    except Exception as error:

        print()
        print("=" * 72)

        print(
            "RESPICARE DEVICE AGENT ERROR"
        )

        print("=" * 72)

        print(
            error
        )

        print()

        sys.exit(1)