import os


# ============================================================
# RESPICARE BACKEND
# ============================================================

API_BASE_URL = os.getenv(
    "RESPICARE_API_URL",
    "http://127.0.0.1:8000",
)


# ============================================================
# PATIENT LOGIN
# ============================================================

PATIENT_EMAIL = os.getenv(
    "RESPICARE_EMAIL",
    "",
)

PATIENT_PASSWORD = os.getenv(
    "RESPICARE_PASSWORD",
    "",
)


# ============================================================
# SERIAL
# ============================================================

SERIAL_BAUD = 115200

SERIAL_TIMEOUT = 1.0


# ============================================================
# CSI
# ============================================================

CALIBRATION_FILE = (
    "calibration/respicare_calibration.json"
)

WINDOW_SECONDS = 30

UPDATE_SECONDS = 5

ANALYSIS_FS = 10.0