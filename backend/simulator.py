import math
import random
import time


# =========================================================
# ACTIVE SIMULATIONS
# =========================================================

simulation_states = {}


# =========================================================
# SIMULATION SCENARIOS
#
# Volume values are SIMULATED breath-volume values.
# They are NOT measurements produced by Wi-Fi CSI.
#
# ASTHMA_ATTACK is a controlled demo scenario representing
# an asthma-like respiratory distress pattern.
#
# It is NOT a medical diagnosis or clinically validated
# asthma model.
# =========================================================

SCENARIOS = {

    "NORMAL": {
        "label": "Normal",
        "start_rate": 15.0,
        "target_rate": 15.0,
        "start_volume": 587.0,
        "target_volume": 587.0,
        "transition_seconds": 1,
        "pattern": "NORMAL",
    },

    "FAST": {
        "label": "Fast Breathing",
        "start_rate": 15.0,
        "target_rate": 25.0,
        "start_volume": 587.0,
        "target_volume": 500.0,
        "transition_seconds": 12,
        "pattern": "FAST_BREATHING",
    },

    "SLOW": {
        "label": "Slow Breathing",
        "start_rate": 15.0,
        "target_rate": 7.0,
        "start_volume": 587.0,
        "target_volume": 500.0,
        "transition_seconds": 12,
        "pattern": "SLOW_BREATHING",
    },

    "SHALLOW": {
        "label": "Shallow Breathing",
        "start_rate": 15.0,
        "target_rate": 24.0,
        "start_volume": 587.0,
        "target_volume": 220.0,
        "transition_seconds": 14,
        "pattern": "SHALLOW_BREATHING",
    },

    # =====================================================
    # ASTHMA-LIKE RESPIRATORY DISTRESS
    #
    # Controlled prototype/demo scenario.
    #
    # Simulates:
    #   - progressively faster breathing
    #   - progressively reduced respiratory-motion amplitude
    #   - increasing waveform irregularity
    #
    # The simulator DOES NOT decide alert severity.
    # Measurements still pass through the normal detector.
    # =====================================================

    "ASTHMA_ATTACK": {
        "label": "Asthma-like Respiratory Distress",
        "start_rate": 15.0,
        "target_rate": 30.0,
        "start_volume": 587.0,
        "target_volume": 180.0,
        "transition_seconds": 16,
        "pattern": "ASTHMA_ATTACK",
    },

    "BREATHING_PAUSE": {
        "label": "Breathing Pause",
        "start_rate": 15.0,
        "target_rate": 8.0,
        "start_volume": 587.0,
        "target_volume": 350.0,
        "transition_seconds": 14,
        "pattern": "BREATHING_PAUSE",
    },

    "RECOVERY": {
        "label": "Recovery",
        "start_rate": 24.0,
        "target_rate": 15.0,
        "start_volume": 300.0,
        "target_volume": 587.0,
        "transition_seconds": 14,
        "pattern": "RECOVERY",
    },

    # =====================================================
    # TECHNICAL VALIDATION SCENARIOS
    # =====================================================

    "MOTION_ARTIFACT": {
        "label": "Motion Artifact",
        "start_rate": None,
        "target_rate": None,
        "start_volume": None,
        "target_volume": None,
        "transition_seconds": 1,
        "pattern": "MOTION_ARTIFACT",
    },

    "SIGNAL_LOSS": {
        "label": "Signal Loss",
        "start_rate": None,
        "target_rate": None,
        "start_volume": None,
        "target_volume": None,
        "transition_seconds": 1,
        "pattern": "SIGNAL_UNRELIABLE",
    },
}


# =========================================================
# HELPERS
# =========================================================

def interpolate(start, end, progress):
    """
    Linear interpolation between two values.
    """

    if start is None or end is None:
        return None

    return start + ((end - start) * progress)


def smooth_progress(progress):
    """
    Smoothstep interpolation.

    Prevents abrupt scenario transitions and gives the
    simulator a gradual change in respiratory behaviour.
    """

    progress = max(
        0.0,
        min(1.0, progress)
    )

    return (
        progress
        * progress
        * (3 - (2 * progress))
    )


# =========================================================
# START SIMULATION
# =========================================================

def start_simulation(
    patient_id: int,
    scenario: str,
):

    scenario = (
        str(scenario)
        .strip()
        .upper()
    )

    # -----------------------------------------------------
    # Compatibility aliases
    #
    # This allows both frontend-friendly names such as
    # FAST_BREATHING and simulator keys such as FAST.
    # -----------------------------------------------------

    aliases = {
        "FAST_BREATHING": "FAST",
        "SLOW_BREATHING": "SLOW",
        "SHALLOW_BREATHING": "SHALLOW",
        "ASTHMA_LIKE_DISTRESS": "ASTHMA_ATTACK",
        "ASTHMA_DISTRESS": "ASTHMA_ATTACK",
    }

    scenario = aliases.get(
        scenario,
        scenario,
    )

    if scenario not in SCENARIOS:
        raise ValueError(
            "Unknown simulation scenario"
        )

    simulation_states[patient_id] = {
        "scenario": scenario,
        "started_at": time.time(),
        "sample": 0,
    }

    return simulation_states[
        patient_id
    ]


# =========================================================
# STOP SIMULATION
# =========================================================

def stop_simulation(patient_id: int):

    simulation_states.pop(
        patient_id,
        None,
    )


# =========================================================
# GET STATE
# =========================================================

def get_simulation_state(
    patient_id: int,
):

    return simulation_states.get(
        patient_id
    )


# =========================================================
# GENERATE READING
# =========================================================

def generate_reading(
    patient_id: int,
):

    state = simulation_states.get(
        patient_id
    )

    if not state:
        return None


    scenario_name = state["scenario"]

    config = SCENARIOS[
        scenario_name
    ]


    state["sample"] += 1


    elapsed = (
        time.time()
        - state["started_at"]
    )


    transition_seconds = (
        config["transition_seconds"]
    )


    raw_progress = min(
        elapsed / transition_seconds,
        1.0,
    )


    progress = smooth_progress(
        raw_progress
    )


    # =====================================================
    # SIGNAL LOSS
    # =====================================================

    if scenario_name == "SIGNAL_LOSS":

        return {
            "scenario": scenario_name,

            "respiratory_rate": None,

            "simulated_volume": None,

            "signal_quality":
                "UNRELIABLE",

            "pattern":
                "SIGNAL_UNRELIABLE",

            "confidence": 0.10,

            "waveform": None,

            "progress": 1.0,
        }


    # =====================================================
    # MOTION ARTIFACT
    # =====================================================

    if (
        scenario_name
        == "MOTION_ARTIFACT"
    ):

        return {
            "scenario": scenario_name,

            "respiratory_rate": None,

            "simulated_volume": None,

            "signal_quality": "POOR",

            "pattern":
                "MOTION_ARTIFACT",

            "confidence": 0.25,

            "waveform":
                random.uniform(
                    -1.8,
                    1.8,
                ),

            "progress": 1.0,
        }


    # =====================================================
    # RATE + SIMULATED VOLUME
    # =====================================================

    rate = interpolate(
        config["start_rate"],
        config["target_rate"],
        progress,
    )


    volume = interpolate(
        config["start_volume"],
        config["target_volume"],
        progress,
    )


    # Small natural variability so the signal does not
    # look mathematically perfect.

    if scenario_name == "ASTHMA_ATTACK":

        # Slightly greater irregularity as respiratory
        # distress progresses.

        rate_variability = (
            0.15
            + (progress * 0.75)
        )

        rate += random.uniform(
            -rate_variability,
            rate_variability,
        )

    else:

        rate += random.uniform(
            -0.15,
            0.15,
        )


    # =====================================================
    # BASE WAVEFORM AMPLITUDE
    # =====================================================

    # 587 mL is only the simulator's reference amplitude.
    #
    # It must NOT be interpreted as calibrated tidal
    # volume obtained from Wi-Fi CSI.

    amplitude = (
        volume / 587.0
    )


    # =====================================================
    # ASTHMA-LIKE RESPIRATORY DISTRESS BEHAVIOUR
    # =====================================================

    if scenario_name == "ASTHMA_ATTACK":

        # The volume interpolation already reduces
        # amplitude from approximately:
        #
        #     587 -> 180
        #
        # Here we add controlled irregularity so the
        # waveform becomes less regular as the simulated
        # distress progresses.

        irregularity = (
            (
                math.sin(
                    elapsed * 2.7
                )
                * 0.08
                * progress
            )
            +
            (
                math.sin(
                    elapsed * 5.1
                )
                * 0.04
                * progress
            )
        )

        amplitude *= (
            1.0 + irregularity
        )


    # =====================================================
    # BREATHING PAUSE BEHAVIOUR
    # =====================================================

    if (
        scenario_name
        == "BREATHING_PAUSE"
    ):

        # Pauses become increasingly prominent
        # as the scenario progresses.

        pause_cycle = (
            elapsed % 8.0
        )

        pause_duration = (
            0.8
            + (progress * 3.0)
        )

        if (
            pause_cycle
            < pause_duration
        ):
            amplitude *= 0.05


    # =====================================================
    # WAVEFORM
    # =====================================================

    frequency = (
        rate / 60.0
    )


    phase = (
        2
        * math.pi
        * frequency
        * elapsed
    )


    waveform = (
        math.sin(phase)
        * amplitude
    )


    # -----------------------------------------------------
    # Additional asthma-like waveform distortion
    #
    # Still periodic enough to represent respiration,
    # but progressively less regular.
    # -----------------------------------------------------

    if scenario_name == "ASTHMA_ATTACK":

        secondary_component = (
            math.sin(
                (phase * 1.65)
                + 0.7
            )
            * amplitude
            * 0.12
            * progress
        )

        waveform += (
            secondary_component
        )


    # Small sensor-like noise

    waveform += random.uniform(
        -0.025,
        0.025,
    )


    # =====================================================
    # SIGNAL QUALITY
    # =====================================================

    signal_quality = "GOOD"

    confidence = 0.96


    if (
        scenario_name
        == "BREATHING_PAUSE"
    ):

        confidence = 0.92


    elif scenario_name == "SHALLOW":

        confidence = 0.93


    elif (
        scenario_name
        == "ASTHMA_ATTACK"
    ):

        # This is confidence in the simulated respiratory
        # measurement stream, NOT confidence that a person
        # is experiencing an asthma attack.

        confidence = 0.91


    # =====================================================
    # RESULT
    # =====================================================

    return {
        "scenario":
            scenario_name,

        "respiratory_rate":
            round(rate, 1),

        "simulated_volume":
            round(volume),

        "signal_quality":
            signal_quality,

        "pattern":
            config["pattern"],

        "confidence":
            confidence,

        "waveform":
            round(
                waveform,
                4,
            ),

        "progress":
            round(
                progress,
                3,
            ),
    }