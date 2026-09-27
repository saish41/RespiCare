from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
from typing import Dict, Optional


# ============================================================
# RESPICARE RESPIRATORY PATTERN DETECTOR
# ============================================================
#
# IMPORTANT:
#
# This detector is for prototype/demo testing.
#
# Thresholds are NOT clinically validated diagnostic
# thresholds and this module does NOT diagnose asthma,
# apnea, or another medical condition.
#
# The detector evaluates:
#
#   1. signal reliability
#   2. learned patient baseline
#   3. respiratory-rate deviation
#   4. respiratory-motion amplitude deviation
#   5. persistence across measurements
#
# The detector deliberately does NOT know whether a
# measurement came from:
#
#   - ESP32 / Wi-Fi CSI
#   - controlled simulation
#
# Therefore ASTHMA_ATTACK does NOT directly produce
# DISTRESS. The simulator generates measurements and
# this detector independently evaluates them.
# ============================================================


# ============================================================
# DEMO / TESTING CONFIGURATION
# ============================================================

BASELINE_MIN_SAMPLES = 8

WATCH_SCORE = 4
WARNING_SCORE = 9
DISTRESS_SCORE = 16

RECOVERY_SCORE = 5


# ============================================================
# RESPIRATORY RATE RATIOS
# ============================================================

FAST_RATE_RATIO = 1.25
VERY_FAST_RATE_RATIO = 1.50

SLOW_RATE_RATIO = 0.72
VERY_SLOW_RATE_RATIO = 0.52


# ============================================================
# RESPIRATORY MOTION AMPLITUDE RATIOS
# ============================================================

SHALLOW_AMPLITUDE_RATIO = 0.55
VERY_SHALLOW_AMPLITUDE_RATIO = 0.30

PAUSE_AMPLITUDE_RATIO = 0.12


# ============================================================
# SIGNAL QUALITY
# ============================================================

GOOD_SIGNAL_VALUES = {
    "GOOD",
    "EXCELLENT",
    "FAIR",
    "SIMULATED",
}


# ============================================================
# PATIENT DETECTOR STATE
# ============================================================

@dataclass
class DetectorState:
    patient_id: int

    state: str = "NORMAL"

    baseline_rate: Optional[float] = None
    baseline_amplitude: Optional[float] = None

    baseline_rate_samples: list = field(
        default_factory=list
    )

    baseline_amplitude_samples: list = field(
        default_factory=list
    )

    abnormal_score: int = 0
    recovery_score: int = 0

    last_reason: str = (
        "Stable respiratory pattern"
    )

    last_rate: Optional[float] = None
    last_amplitude: Optional[float] = None

    last_signal_quality: str = "UNKNOWN"

    last_updated: Optional[datetime] = None


_states: Dict[int, DetectorState] = {}

_lock = Lock()


# ============================================================
# PUBLIC RESULT
# ============================================================

def _result(
    detector_state: DetectorState,
    *,
    reliable: bool,
    reason: str,
    changed: bool = False,
    previous_state: Optional[str] = None,
):
    """
    Convert internal detector state into the dictionary
    used by monitoring.py, alerts.py and respiratory_events.py.
    """

    baseline_rate = (
        detector_state.baseline_rate
    )

    current_rate = (
        detector_state.last_rate
    )

    deviation_percent = None

    if (
        baseline_rate is not None
        and baseline_rate > 0
        and current_rate is not None
    ):
        deviation_percent = (
            (
                current_rate
                - baseline_rate
            )
            / baseline_rate
        ) * 100.0

        deviation_percent = round(
            deviation_percent,
            1,
        )

    return {
        "patient_id":
            detector_state.patient_id,

        "state":
            detector_state.state,

        "detector_state":
            detector_state.state,

        "previous_state": (
            previous_state
            if previous_state is not None
            else detector_state.state
        ),

        "changed":
            changed,

        "reliable":
            reliable,

        "reason":
            reason,

        "baseline_rate":
            detector_state.baseline_rate,

        "baseline_amplitude":
            detector_state.baseline_amplitude,

        "current_rate":
            detector_state.last_rate,

        "current_amplitude":
            detector_state.last_amplitude,

        "deviation_percent":
            deviation_percent,

        "signal_quality":
            detector_state.last_signal_quality,

        "abnormal_score":
            detector_state.abnormal_score,

        # Compatibility with monitoring.py
        "score":
            detector_state.abnormal_score,

        "detector_score":
            detector_state.abnormal_score,

        "timestamp": (
            detector_state.last_updated.isoformat()
            if detector_state.last_updated
            else None
        ),
    }


# ============================================================
# UTILITIES
# ============================================================

def _mean(values):
    if not values:
        return None

    return sum(values) / len(values)


def _is_reliable_signal(
    signal_quality: str,
) -> bool:
    if not signal_quality:
        return False

    quality = str(
        signal_quality
    ).upper()

    if quality in {
        "UNKNOWN",
        "UNRELIABLE",
        "LOST",
        "SIGNAL_LOSS",
        "MOTION_ARTIFACT",
        "POOR",
    }:
        return False

    return True


def _severity_rank(
    state: str,
) -> int:
    ranking = {
        "NORMAL": 0,
        "WATCH": 1,
        "WARNING": 2,
        "DISTRESS": 3,
        "SIGNAL_UNRELIABLE": -1,
    }

    return ranking.get(
        state,
        0,
    )


# ============================================================
# GET CURRENT DETECTOR STATE
# ============================================================

def get_detector_state(
    patient_id: int,
):
    with _lock:
        state = _states.get(
            patient_id
        )

        if not state:
            return {
                "patient_id":
                    patient_id,

                "state":
                    "NORMAL",

                "detector_state":
                    "NORMAL",

                "previous_state":
                    "NORMAL",

                "changed":
                    False,

                "reliable":
                    False,

                "reason":
                    "Waiting for respiratory data",

                "baseline_rate":
                    None,

                "baseline_amplitude":
                    None,

                "current_rate":
                    None,

                "current_amplitude":
                    None,

                "deviation_percent":
                    None,

                "signal_quality":
                    "UNKNOWN",

                "abnormal_score":
                    0,

                "score":
                    0,

                "detector_score":
                    0,

                "timestamp":
                    None,
            }

        return _result(
            state,

            reliable=
                _is_reliable_signal(
                    state.last_signal_quality
                ),

            reason=
                state.last_reason,
        )


# ============================================================
# RESET DETECTOR
# ============================================================

def reset_detector(
    patient_id: int,
):
    with _lock:
        _states.pop(
            patient_id,
            None,
        )


# ============================================================
# BASELINE LEARNING
# ============================================================

def _learn_baseline(
    state: DetectorState,
    rate: float,
    amplitude: Optional[float],
):
    """
    Learn the initial respiratory baseline.

    The first BASELINE_MIN_SAMPLES reliable measurements
    are used for prototype baseline establishment.
    """

    if (
        len(
            state.baseline_rate_samples
        )
        < BASELINE_MIN_SAMPLES
    ):
        state.baseline_rate_samples.append(
            rate
        )

        if (
            amplitude is not None
            and amplitude > 0
        ):
            state.baseline_amplitude_samples.append(
                amplitude
            )

        state.baseline_rate = _mean(
            state.baseline_rate_samples
        )

        state.baseline_amplitude = _mean(
            state.baseline_amplitude_samples
        )

        return True

    return False


# ============================================================
# BASELINE SLOW ADAPTATION
# ============================================================

def _adapt_baseline(
    state: DetectorState,
    rate: float,
    amplitude: Optional[float],
):
    """
    Very slowly adapt the baseline while measurements
    are considered normal.

    This prevents normal long-term drift from permanently
    appearing abnormal.
    """

    if state.baseline_rate is not None:
        state.baseline_rate = (
            state.baseline_rate * 0.98
            + rate * 0.02
        )

    if (
        amplitude is not None
        and amplitude > 0
        and state.baseline_amplitude
        is not None
    ):
        state.baseline_amplitude = (
            state.baseline_amplitude
            * 0.98
            + amplitude
            * 0.02
        )


# ============================================================
# CLASSIFY ONE MEASUREMENT
# ============================================================

def _measurement_abnormality(
    state: DetectorState,
    rate: float,
    amplitude: Optional[float],
):
    """
    Returns:

        abnormality_score_increment,
        reason

    The scenario name is intentionally NOT provided here.
    """

    baseline_rate = (
        state.baseline_rate
    )

    baseline_amplitude = (
        state.baseline_amplitude
    )

    if (
        baseline_rate is None
        or baseline_rate <= 0
    ):
        return (
            0,
            "Waiting for baseline",
        )

    rate_ratio = (
        rate / baseline_rate
    )


    # ========================================================
    # VERY FAST RESPIRATORY RATE
    # ========================================================

    if (
        rate_ratio
        >= VERY_FAST_RATE_RATIO
    ):
        return (
            3,
            (
                "Respiratory rate is "
                "substantially above baseline"
            ),
        )


    # ========================================================
    # FAST RESPIRATORY RATE
    # ========================================================

    if (
        rate_ratio
        >= FAST_RATE_RATIO
    ):
        return (
            2,
            (
                "Respiratory rate is "
                "persistently above baseline"
            ),
        )


    # ========================================================
    # VERY SLOW RESPIRATORY RATE
    # ========================================================

    if (
        rate_ratio
        <= VERY_SLOW_RATE_RATIO
    ):
        return (
            3,
            (
                "Respiratory rate is "
                "substantially below baseline"
            ),
        )


    # ========================================================
    # SLOW RESPIRATORY RATE
    # ========================================================

    if (
        rate_ratio
        <= SLOW_RATE_RATIO
    ):
        return (
            2,
            (
                "Respiratory rate is "
                "persistently below baseline"
            ),
        )


    # ========================================================
    # RESPIRATORY MOTION AMPLITUDE
    # ========================================================

    if (
        amplitude is not None
        and baseline_amplitude is not None
        and baseline_amplitude > 0
    ):
        amplitude_ratio = (
            amplitude
            / baseline_amplitude
        )


        # ----------------------------------------------------
        # EXTREMELY LOW RESPIRATORY MOTION
        # ----------------------------------------------------

        if (
            amplitude_ratio
            <= PAUSE_AMPLITUDE_RATIO
        ):
            return (
                4,
                (
                    "Respiratory motion is "
                    "temporarily very low"
                ),
            )


        # ----------------------------------------------------
        # VERY SHALLOW RESPIRATORY MOTION
        # ----------------------------------------------------

        if (
            amplitude_ratio
            <= VERY_SHALLOW_AMPLITUDE_RATIO
        ):
            return (
                3,
                (
                    "Respiratory waveform amplitude "
                    "is substantially below baseline"
                ),
            )


        # ----------------------------------------------------
        # SHALLOW RESPIRATORY MOTION
        # ----------------------------------------------------

        if (
            amplitude_ratio
            <= SHALLOW_AMPLITUDE_RATIO
        ):
            return (
                2,
                (
                    "Respiratory waveform amplitude "
                    "is below baseline"
                ),
            )


    return (
        0,
        (
            "Respiratory pattern is "
            "close to baseline"
        ),
    )


# ============================================================
# STATE FROM PERSISTENCE SCORE
# ============================================================

def _state_from_score(
    score: int,
):
    if score >= DISTRESS_SCORE:
        return "DISTRESS"

    if score >= WARNING_SCORE:
        return "WARNING"

    if score >= WATCH_SCORE:
        return "WATCH"

    return "NORMAL"


# ============================================================
# MAIN DETECTOR
# ============================================================

def process_measurement(
    patient_id: int,
    respiratory_rate,
    amplitude=None,
    signal_quality="UNKNOWN",
):
    """
    Process exactly ONE respiratory measurement.

    IMPORTANT:

    This function has no knowledge of scenario names.

    Therefore:

        NORMAL simulation
        FAST simulation
        SHALLOW simulation
        ASTHMA_ATTACK simulation
        ESP32 / CSI live measurements

    all enter the SAME detector.

    That prevents the simulator from directly deciding
    WARNING or DISTRESS.
    """

    with _lock:

        # ====================================================
        # GET / CREATE STATE
        # ====================================================

        if patient_id not in _states:
            _states[
                patient_id
            ] = DetectorState(
                patient_id=patient_id
            )

        state = _states[
            patient_id
        ]

        previous_state = (
            state.state
        )

        state.last_updated = (
            datetime.now(
                timezone.utc
            )
        )

        state.last_signal_quality = (
            str(
                signal_quality
            ).upper()
            if signal_quality
            else "UNKNOWN"
        )


        # ====================================================
        # SIGNAL QUALITY GATE
        # ====================================================

        if not _is_reliable_signal(
            signal_quality
        ):
            state.last_rate = None
            state.last_amplitude = None

            state.state = (
                "SIGNAL_UNRELIABLE"
            )

            state.last_reason = (
                "Respiratory signal is "
                "currently unreliable"
            )

            state.recovery_score = 0

            return _result(
                state,

                reliable=False,

                reason=
                    state.last_reason,

                changed=(
                    previous_state
                    != state.state
                ),

                previous_state=
                    previous_state,
            )


        # ====================================================
        # VALIDATE RESPIRATORY RATE
        # ====================================================

        try:
            rate = float(
                respiratory_rate
            )

        except (
            TypeError,
            ValueError,
        ):
            state.state = (
                "SIGNAL_UNRELIABLE"
            )

            state.last_reason = (
                "Respiratory rate is unavailable"
            )

            return _result(
                state,

                reliable=False,

                reason=
                    state.last_reason,

                changed=(
                    previous_state
                    != state.state
                ),

                previous_state=
                    previous_state,
            )


        if rate <= 0:
            state.state = (
                "SIGNAL_UNRELIABLE"
            )

            state.last_reason = (
                "Respiratory rate is unavailable"
            )

            return _result(
                state,

                reliable=False,

                reason=
                    state.last_reason,

                changed=(
                    previous_state
                    != state.state
                ),

                previous_state=
                    previous_state,
            )


        state.last_rate = rate


        # ====================================================
        # PARSE RESPIRATORY MOTION AMPLITUDE
        # ====================================================

        parsed_amplitude = None

        if amplitude is not None:
            try:
                parsed_amplitude = float(
                    amplitude
                )

            except (
                TypeError,
                ValueError,
            ):
                parsed_amplitude = None

        state.last_amplitude = (
            parsed_amplitude
        )


        # ====================================================
        # LEARN BASELINE
        # ====================================================

        learning = _learn_baseline(
            state,
            rate,
            parsed_amplitude,
        )

        if learning:
            state.state = "NORMAL"

            state.abnormal_score = 0
            state.recovery_score = 0

            state.last_reason = (
                "Learning respiratory baseline"
            )

            return _result(
                state,

                reliable=True,

                reason=
                    state.last_reason,

                changed=(
                    previous_state
                    != state.state
                ),

                previous_state=
                    previous_state,
            )


        # ====================================================
        # ANALYZE MEASUREMENT
        # ====================================================

        abnormality, reason = (
            _measurement_abnormality(
                state,
                rate,
                parsed_amplitude,
            )
        )


        # ====================================================
        # ABNORMAL MEASUREMENT
        # ====================================================

        if abnormality > 0:

            state.recovery_score = 0

            state.abnormal_score += (
                abnormality
            )

            new_state = (
                _state_from_score(
                    state.abnormal_score
                )
            )

            state.state = (
                new_state
            )

            state.last_reason = (
                reason
            )


        # ====================================================
        # NORMAL / RECOVERY MEASUREMENT
        # ====================================================

        else:

            state.recovery_score += 1

            state.abnormal_score = max(
                0,
                state.abnormal_score - 2,
            )

            if (
                previous_state
                in {
                    "WATCH",
                    "WARNING",
                    "DISTRESS",
                    "SIGNAL_UNRELIABLE",
                }
                and state.recovery_score
                < RECOVERY_SCORE
            ):
                state.state = "WATCH"

                state.last_reason = (
                    "Respiratory pattern is "
                    "returning toward baseline"
                )

            else:
                state.state = (
                    _state_from_score(
                        state.abnormal_score
                    )
                )

                if (
                    state.state
                    == "NORMAL"
                ):
                    state.last_reason = (
                        "Respiratory pattern is "
                        "close to baseline"
                    )

                    _adapt_baseline(
                        state,
                        rate,
                        parsed_amplitude,
                    )


        # ====================================================
        # RESULT
        # ====================================================

        return _result(
            state,

            reliable=True,

            reason=
                state.last_reason,

            changed=(
                previous_state
                != state.state
            ),

            previous_state=
                previous_state,
        )