import json
import re
import time
from collections import deque
from pathlib import Path

import numpy as np

from scipy.signal import (
    butter,
    sosfiltfilt,
    detrend,
    welch,
    correlate,
)

from esp32_detector import find_esp32


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

CALIBRATION_FILE = (
    BASE_DIR
    / "calibration"
    / "respicare_calibration.json"
)


# ============================================================
# LIVE MONITOR SETTINGS
# ============================================================

WINDOW_SECONDS = 30.0

MIN_WINDOW_SECONDS = 20.0

UPDATE_SECONDS = 3.0

ANALYSIS_FS = 10.0

EPS = 1e-12


# ============================================================
# CSI LINE FORMAT
# ============================================================

CSI_PATTERN = re.compile(
    r"CSI_DATA,"
    r"(\d+),"
    r"(-?\d+),"
    r"(\d+),"
    r"\[(.*)\]"
)


# ============================================================
# LOAD CALIBRATION
# ============================================================

def load_calibration():

    if not CALIBRATION_FILE.exists():

        raise FileNotFoundError(
            f"\nCalibration file not found:\n"
            f"{CALIBRATION_FILE}\n"
        )

    with open(
        CALIBRATION_FILE,
        "r",
        encoding="utf-8",
    ) as file:

        calibration = json.load(
            file
        )

    print()
    print("=" * 70)
    print("RESPICARE CSI CALIBRATION LOADED")
    print("=" * 70)

    print(
        "Reference BPM      :",
        calibration[
            "known_reference"
        ][
            "bpm"
        ]
    )

    print(
        "Valid CSI pairs    :",
        len(
            calibration[
                "valid_csi_pairs"
            ]
        )
    )

    print(
        "Selected PCA PCs   :",
        calibration[
            "selected_components"
        ]
    )

    print(
        "Component weights  :",
        [
            round(
                value,
                3
            )
            for value
            in calibration[
                "component_weights"
            ]
        ]
    )

    print(
        "Quality threshold  :",
        round(
            calibration[
                "quality"
            ][
                "minimum_monitor_quality"
            ],
            3
        )
    )

    print(
        "Motion threshold   :",
        round(
            calibration[
                "quality"
            ][
                "motion_threshold"
            ],
            3
        )
    )

    return calibration


# ============================================================
# CSI PARSER
# ============================================================

def parse_csi_line(
    line,
):

    match = CSI_PATTERN.search(
        line
    )

    if match is None:
        return None

    try:

        esp_timestamp = int(
            match.group(1)
        )

        rssi = int(
            match.group(2)
        )

        csi_length = int(
            match.group(3)
        )

        raw_values = [
            int(value)
            for value
            in match.group(4).split(",")
        ]

    except ValueError:

        return None

    if (
        len(raw_values)
        !=
        csi_length
    ):

        return None

    if (
        len(raw_values)
        % 2
        !=
        0
    ):

        raw_values = raw_values[
            :-1
        ]

    raw = np.asarray(
        raw_values,
        dtype=float,
    )

    # ESP32 CSI format:
    #
    # imag, real,
    # imag, real,
    # ...

    imag = raw[
        0::2
    ]

    real = raw[
        1::2
    ]

    magnitude = np.sqrt(
        imag ** 2
        +
        real ** 2
    )

    return {
        "esp_timestamp":
            esp_timestamp,

        "rssi":
            rssi,

        "magnitude":
            magnitude,
    }


# ============================================================
# ROBUST OUTLIER REMOVAL
# ============================================================

def robust_clip(
    matrix,
    threshold=6.0,
):

    output = matrix.copy()

    for column in range(
        output.shape[1]
    ):

        values = output[
            :,
            column
        ]

        median = np.median(
            values
        )

        mad = np.median(
            np.abs(
                values
                -
                median
            )
        )

        if mad < EPS:
            continue

        robust_sigma = (
            1.4826
            *
            mad
        )

        lower = (
            median
            -
            threshold
            *
            robust_sigma
        )

        upper = (
            median
            +
            threshold
            *
            robust_sigma
        )

        output[
            :,
            column
        ] = np.clip(
            values,
            lower,
            upper,
        )

    return output


# ============================================================
# RESAMPLE IRREGULAR CSI
# ============================================================

def resample_matrix(
    time_values,
    matrix,
):

    start = time_values[0]
    end = time_values[-1]

    uniform_time = np.arange(
        start,
        end,
        1.0 / ANALYSIS_FS,
    )

    output = np.zeros(
        (
            len(uniform_time),
            matrix.shape[1],
        ),
        dtype=float,
    )

    for column in range(
        matrix.shape[1]
    ):

        values = matrix[
            :,
            column
        ]

        output[
            :,
            column
        ] = np.interp(
            uniform_time,
            time_values,
            values,
        )

    return (
        uniform_time,
        output,
    )


# ============================================================
# RESPIRATION BANDPASS
# ============================================================

def respiration_filter(
    matrix,
    low,
    high,
):

    sos = butter(
        4,
        [
            low,
            high,
        ],
        btype="bandpass",
        fs=ANALYSIS_FS,
        output="sos",
    )

    output = np.zeros_like(
        matrix
    )

    for column in range(
        matrix.shape[1]
    ):

        signal = matrix[
            :,
            column
        ]

        signal = detrend(
            signal
        )

        try:

            output[
                :,
                column
            ] = sosfiltfilt(
                sos,
                signal,
            )

        except ValueError:

            output[
                :,
                column
            ] = signal

    return output


# ============================================================
# STANDARDIZE CSI PAIRS
# ============================================================

def standardize(
    matrix,
):

    mean = np.mean(
        matrix,
        axis=0,
    )

    std = np.std(
        matrix,
        axis=0,
    )

    std[
        std < EPS
    ] = 1.0

    return (
        matrix
        -
        mean
    ) / std


# ============================================================
# SPECTRAL ANALYSIS
# ============================================================

def calculate_psd(
    signal,
):

    signal = detrend(
        signal
    )

    nperseg = min(
        256,
        len(signal),
    )

    frequencies, power = welch(
        signal,
        fs=ANALYSIS_FS,
        window="hann",
        nperseg=nperseg,
        noverlap=nperseg // 2,
        nfft=4096,
        scaling="density",
    )

    return (
        frequencies,
        power,
    )


# ============================================================
# BAND POWER
# ============================================================

def band_power(
    frequencies,
    power,
    low,
    high,
):

    mask = (
        (frequencies >= low)
        &
        (frequencies <= high)
    )

    if np.sum(mask) < 2:
        return 0.0

    if hasattr(
        np,
        "trapezoid"
    ):

        return float(
            np.trapezoid(
                power[mask],
                frequencies[mask],
            )
        )

    return float(
        np.trapz(
            power[mask],
            frequencies[mask],
        )
    )


# ============================================================
# FIND SPECTRAL PEAK
# ============================================================

def find_peak_frequency(
    frequencies,
    power,
    low,
    high,
):

    mask = (
        (frequencies >= low)
        &
        (frequencies <= high)
    )

    band_frequency = frequencies[
        mask
    ]

    band_power_values = power[
        mask
    ]

    if len(
        band_frequency
    ) < 3:

        return None

    peak_index = int(
        np.argmax(
            band_power_values
        )
    )

    peak_frequency = float(
        band_frequency[
            peak_index
        ]
    )

    # --------------------------------------------------------
    # Parabolic interpolation
    #
    # Gives a smoother frequency estimate between FFT bins.
    # --------------------------------------------------------

    if (
        peak_index > 0
        and
        peak_index
        <
        len(
            band_power_values
        ) - 1
    ):

        y1 = band_power_values[
            peak_index - 1
        ]

        y2 = band_power_values[
            peak_index
        ]

        y3 = band_power_values[
            peak_index + 1
        ]

        denominator = (
            y1
            -
            2.0 * y2
            +
            y3
        )

        if abs(
            denominator
        ) > EPS:

            offset = (
                0.5
                *
                (
                    y1
                    -
                    y3
                )
                /
                denominator
            )

            bin_spacing = (
                band_frequency[1]
                -
                band_frequency[0]
            )

            peak_frequency += (
                offset
                *
                bin_spacing
            )

    return peak_frequency


# ============================================================
# AUTOCORRELATION SECONDARY CHECK
# ============================================================

def autocorrelation_bpm(
    signal,
    low_bpm,
    high_bpm,
):

    centered = (
        signal
        -
        np.mean(
            signal
        )
    )

    autocorrelation = correlate(
        centered,
        centered,
        mode="full",
    )

    autocorrelation = autocorrelation[
        len(
            autocorrelation
        ) // 2:
    ]

    if (
        len(
            autocorrelation
        ) == 0
        or
        autocorrelation[0] == 0
    ):

        return None

    autocorrelation = (
        autocorrelation
        /
        autocorrelation[0]
    )

    min_period = (
        60.0
        /
        high_bpm
    )

    max_period = (
        60.0
        /
        low_bpm
    )

    min_lag = int(
        min_period
        *
        ANALYSIS_FS
    )

    max_lag = int(
        max_period
        *
        ANALYSIS_FS
    )

    max_lag = min(
        max_lag,
        len(
            autocorrelation
        ) - 1,
    )

    if max_lag <= min_lag:
        return None

    region = autocorrelation[
        min_lag:
        max_lag + 1
    ]

    best_lag = (
        np.argmax(
            region
        )
        +
        min_lag
    )

    period_seconds = (
        best_lag
        /
        ANALYSIS_FS
    )

    if period_seconds <= 0:
        return None

    return float(
        60.0
        /
        period_seconds
    )


# ============================================================
# LIVE CSI PROCESSOR
# ============================================================

class CSIProcessor:

    def __init__(
        self,
        calibration,
    ):

        self.calibration = (
            calibration
        )

        self.valid_pairs = np.asarray(
            calibration[
                "valid_csi_pairs"
            ],
            dtype=int,
        )

        self.pca_loadings = np.asarray(
            calibration[
                "pca_loadings"
            ],
            dtype=float,
        )

        self.selected_components = (
            calibration[
                "selected_components"
            ]
        )

        self.component_weights = np.asarray(
            calibration[
                "component_weights"
            ],
            dtype=float,
        )

        self.resp_low = float(
            calibration[
                "respiration_band_hz"
            ][0]
        )

        self.resp_high = float(
            calibration[
                "respiration_band_hz"
            ][1]
        )

        self.quality_threshold = float(
            calibration[
                "quality"
            ][
                "minimum_monitor_quality"
            ]
        )

        self.motion_threshold = float(
            calibration[
                "quality"
            ][
                "motion_threshold"
            ]
        )

        self.timestamps = deque()

        self.magnitudes = deque()

        self.rssi_values = deque()

        self.last_analysis = 0.0


    # ========================================================
    # ADD ONE CSI FRAME
    # ========================================================

    def add_frame(
        self,
        parsed_frame,
    ):

        magnitude = parsed_frame[
            "magnitude"
        ]

        if (
            np.max(
                self.valid_pairs
            )
            >=
            len(
                magnitude
            )
        ):

            return None

        selected_magnitude = magnitude[
            self.valid_pairs
        ]

        now = time.monotonic()

        self.timestamps.append(
            now
        )

        self.magnitudes.append(
            selected_magnitude
        )

        self.rssi_values.append(
            parsed_frame[
                "rssi"
            ]
        )

        self._remove_old_frames(
            now
        )

        duration = self.duration()

        if (
            duration
            <
            MIN_WINDOW_SECONDS
        ):

            return {
                "status":
                    "COLLECTING",

                "duration":
                    duration,

                "progress":
                    min(
                        100.0,
                        (
                            duration
                            /
                            MIN_WINDOW_SECONDS
                        )
                        *
                        100.0
                    ),
            }

        if (
            now
            -
            self.last_analysis
            <
            UPDATE_SECONDS
        ):

            return None

        self.last_analysis = now

        return self.analyze()


    # ========================================================
    # REMOVE OLD DATA
    # ========================================================

    def _remove_old_frames(
        self,
        now,
    ):

        while (
            self.timestamps
            and
            now
            -
            self.timestamps[0]
            >
            WINDOW_SECONDS
        ):

            self.timestamps.popleft()

            self.magnitudes.popleft()

            self.rssi_values.popleft()


    # ========================================================
    # WINDOW DURATION
    # ========================================================

    def duration(
        self,
    ):

        if (
            len(
                self.timestamps
            )
            <
            2
        ):

            return 0.0

        return (
            self.timestamps[-1]
            -
            self.timestamps[0]
        )


    # ========================================================
    # ANALYZE LIVE WINDOW
    # ========================================================

    def analyze(
        self,
    ):

        if (
            len(
                self.timestamps
            )
            <
            50
        ):

            return None

        time_values = np.asarray(
            self.timestamps,
            dtype=float,
        )

        # Make time start at zero

        time_values = (
            time_values
            -
            time_values[0]
        )

        matrix = np.asarray(
            self.magnitudes,
            dtype=float,
        )

        # ----------------------------------------------------
        # 1. Resample
        # ----------------------------------------------------

        (
            uniform_time,
            matrix,
        ) = resample_matrix(
            time_values,
            matrix,
        )

        if (
            len(
                uniform_time
            )
            <
            100
        ):

            return None

        # ----------------------------------------------------
        # 2. Outlier clipping
        # ----------------------------------------------------

        matrix = robust_clip(
            matrix
        )

        # ----------------------------------------------------
        # 3. Respiration filter
        # ----------------------------------------------------

        matrix = respiration_filter(
            matrix,
            self.resp_low,
            self.resp_high,
        )

        # ----------------------------------------------------
        # 4. Standardize CSI pairs
        # ----------------------------------------------------

        matrix = standardize(
            matrix
        )

        # ----------------------------------------------------
        # 5. Apply CALIBRATED PCA
        # ----------------------------------------------------

        if (
            matrix.shape[1]
            !=
            self.pca_loadings.shape[0]
        ):

            raise RuntimeError(
                "\nCalibration mismatch:\n"
                f"Live CSI features : {matrix.shape[1]}\n"
                f"PCA expected      : "
                f"{self.pca_loadings.shape[0]}\n"
            )

        principal_components = (
            matrix
            @
            self.pca_loadings
        )

        # ----------------------------------------------------
        # 6. Fuse selected respiratory PCs
        # ----------------------------------------------------

        fused = np.zeros(
            principal_components.shape[0],
            dtype=float,
        )

        for (
            component,
            weight
        ) in zip(
            self.selected_components,
            self.component_weights,
        ):

            signal = principal_components[
                :,
                component
            ]

            signal = (
                signal
                -
                np.mean(
                    signal
                )
            )

            std = np.std(
                signal
            )

            if std > EPS:

                signal = (
                    signal
                    /
                    std
                )

            fused += (
                weight
                *
                signal
            )

        # ----------------------------------------------------
        # 7. Motion estimation
        # ----------------------------------------------------

        derivative = np.abs(
            np.diff(
                fused
            )
        )

        motion_score = float(
            np.percentile(
                derivative,
                99
            )
        )

        motion_detected = (
            motion_score
            >
            self.motion_threshold
        )

        # ----------------------------------------------------
        # 8. PSD
        # ----------------------------------------------------

        (
            frequencies,
            power,
        ) = calculate_psd(
            fused
        )

        peak_frequency = find_peak_frequency(
            frequencies,
            power,
            self.resp_low,
            self.resp_high,
        )

        if peak_frequency is None:

            return {
                "status":
                    "NO_SIGNAL"
            }

        spectral_bpm = (
            peak_frequency
            *
            60.0
        )

        # ----------------------------------------------------
        # 9. Spectral quality
        # ----------------------------------------------------

        total_resp_power = band_power(
            frequencies,
            power,
            self.resp_low,
            self.resp_high,
        )

        # Measure concentration around detected peak

        peak_half_width = 0.04

        local_peak_power = band_power(
            frequencies,
            power,
            max(
                self.resp_low,
                peak_frequency
                -
                peak_half_width,
            ),
            min(
                self.resp_high,
                peak_frequency
                +
                peak_half_width,
            ),
        )

        signal_quality = (
            local_peak_power
            /
            (
                total_resp_power
                +
                EPS
            )
        )

        # ----------------------------------------------------
        # 10. Autocorrelation secondary estimate
        # ----------------------------------------------------

        autocorr_rate = autocorrelation_bpm(
            fused,
            self.resp_low * 60.0,
            self.resp_high * 60.0,
        )

        if autocorr_rate is None:

            agreement = 0.0

        else:

            difference = abs(
                spectral_bpm
                -
                autocorr_rate
            )

            agreement = float(
                np.exp(
                    -0.5
                    *
                    (
                        difference
                        /
                        4.0
                    ) ** 2
                )
            )

        # ----------------------------------------------------
        # IMPORTANT:
        #
        # Spectral BPM is PRIMARY.
        #
        # We do NOT average spectral BPM with autocorrelation
        # because autocorrelation failed during calibration.
        # ----------------------------------------------------

        respiratory_rate = float(
            spectral_bpm
        )

        # ----------------------------------------------------
        # Confidence
        # ----------------------------------------------------

        quality_confidence = np.clip(
            signal_quality,
            0.0,
            1.0,
        )

        confidence = (
            0.80
            *
            quality_confidence
            +
            0.20
            *
            agreement
        )

        # ----------------------------------------------------
        # RSSI
        # ----------------------------------------------------

        mean_rssi = float(
            np.mean(
                self.rssi_values
            )
        )

        # ----------------------------------------------------
        # Frame rate
        # ----------------------------------------------------

        current_duration = (
            self.duration()
        )

        if current_duration > 0:

            frame_rate = (
                len(
                    self.timestamps
                )
                /
                current_duration
            )

        else:

            frame_rate = 0.0

        # ----------------------------------------------------
        # STATUS
        # ----------------------------------------------------

        if motion_detected:

            status = "MOVEMENT"

        elif (
            signal_quality
            <
            self.quality_threshold
        ):

            status = "LOW_SIGNAL"

        else:

            status = "BREATHING_DETECTED"

        return {

            "status":
                status,

            "respiratory_rate":
                round(
                    respiratory_rate,
                    2
                ),

            "spectral_bpm":
                round(
                    spectral_bpm,
                    2
                ),

            "autocorrelation_bpm":
                (
                    round(
                        autocorr_rate,
                        2
                    )
                    if
                    autocorr_rate
                    is not None
                    else
                    None
                ),

            "signal_quality":
                round(
                    float(
                        signal_quality
                    ),
                    3
                ),

            "confidence":
                round(
                    float(
                        confidence
                    ),
                    3
                ),

            "motion_detected":
                bool(
                    motion_detected
                ),

            "motion_score":
                round(
                    motion_score,
                    3
                ),

            "rssi":
                round(
                    mean_rssi,
                    1
                ),

            "frame_rate":
                round(
                    frame_rate,
                    1
                ),

            "window_seconds":
                round(
                    current_duration,
                    1
                ),
        }


# ============================================================
# PRINT RESULT
# ============================================================

def print_result(
    result,
):

    if result is None:
        return

    status = result.get(
        "status"
    )

    if status == "COLLECTING":

        print(
            "\r"
            f"Collecting CSI... "
            f"{result['duration']:.1f}s / "
            f"{MIN_WINDOW_SECONDS:.0f}s",
            end="",
            flush=True,
        )

        return

    print()
    print()
    print("=" * 70)
    print("RESPICARE LIVE RESPIRATORY MONITOR")
    print("=" * 70)

    print(
        f"Status            : "
        f"{status}"
    )

    print(
        f"Respiratory rate  : "
        f"{result.get('respiratory_rate')} BPM"
    )

    print(
        f"Signal quality    : "
        f"{result.get('signal_quality')}"
    )

    print(
        f"Confidence        : "
        f"{result.get('confidence')}"
    )

    print(
        f"Motion detected   : "
        f"{result.get('motion_detected')}"
    )

    print(
        f"Motion score      : "
        f"{result.get('motion_score')}"
    )

    print(
        f"RSSI              : "
        f"{result.get('rssi')} dBm"
    )

    print(
        f"CSI frame rate    : "
        f"{result.get('frame_rate')} Hz"
    )

    print(
        f"Window            : "
        f"{result.get('window_seconds')} sec"
    )

    print(
        f"Spectral BPM      : "
        f"{result.get('spectral_bpm')}"
    )

    print(
        f"Autocorrelation   : "
        f"{result.get('autocorrelation_bpm')}"
    )

    print("=" * 70)


# ============================================================
# LIVE TEST
# ============================================================

def main():

    calibration = load_calibration()

    processor = CSIProcessor(
        calibration
    )

    print()
    print("=" * 70)
    print("CONNECTING TO RESPICARE ESP32")
    print("=" * 70)

    serial_connection = find_esp32()

    print()
    print(
        f"Connected on "
        f"{serial_connection.port}"
    )

    print()
    print(
        "IMPORTANT:"
    )

    print(
        "Keep traffic.py running so the ESP32 receives Wi-Fi traffic."
    )

    print()
    print(
        "Sit in the same sensing region used during calibration."
    )

    print()
    print(
        "Collecting live CSI..."
    )

    print(
        "Press CTRL+C to stop."
    )

    print()

    try:

        while True:

            raw_line = (
                serial_connection
                .readline()
                .decode(
                    "utf-8",
                    errors="ignore",
                )
                .strip()
            )

            if not raw_line:
                continue

            parsed = parse_csi_line(
                raw_line
            )

            if parsed is None:
                continue

            result = processor.add_frame(
                parsed
            )

            print_result(
                result
            )

    except KeyboardInterrupt:

        print()
        print()
        print(
            "Live monitoring stopped."
        )

    finally:

        serial_connection.close()


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":

    main()