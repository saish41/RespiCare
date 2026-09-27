import threading
import time

from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
)

from pydantic import BaseModel

from sqlalchemy.orm import Session

from database import get_db

from auth import (
    get_current_user,
    require_role,
)

from connections import can_access_patient

from models import (
    RespiratoryReading,
    User,
)

from simulator import (
    generate_reading,
    get_simulation_state,
    start_simulation,
    stop_simulation,
)

from respiratory_detector import (
    get_detector_state,
    process_measurement,
    reset_detector,
)

from alerts import (
    create_detector_alert,
)

from respiratory_events import (
    update_respiratory_event,
)


# =========================================================
# ROUTER
# =========================================================

router = APIRouter(
    prefix="/monitoring",
    tags=["Monitoring"],
)


# =========================================================
# REQUEST MODELS
# =========================================================

class SimulationStartRequest(BaseModel):
    scenario: str


class LiveReadingRequest(BaseModel):
    respiratory_rate: float | None = None

    signal_quality: str = "GOOD"

    pattern: str = "UNKNOWN"

    confidence: float | None = None

    amplitude: float | None = None


# =========================================================
# SIMULATION PROCESSING CACHE
#
# Important:
# Multiple dashboards may request /current.
#
# We only process one simulation measurement per patient
# per measurement interval.
#
# Everyone else receives the same processed result.
# =========================================================

SIMULATION_TICK_SECONDS = 0.50


_simulation_cache = {}

_simulation_last_processed = {}

_simulation_locks = {}

_simulation_global_lock = threading.Lock()


# =========================================================
# TIME HELPERS
# =========================================================

def utc_now_iso():
    return datetime.now(
        timezone.utc
    ).isoformat()


# =========================================================
# PATIENT LOCK
# =========================================================

def get_patient_lock(
    patient_id: int,
):
    with _simulation_global_lock:

        if (
            patient_id
            not in _simulation_locks
        ):
            _simulation_locks[
                patient_id
            ] = threading.Lock()

        return _simulation_locks[
            patient_id
        ]


# =========================================================
# CLEAR SIMULATION CACHE
# =========================================================

def clear_simulation_cache(
    patient_id: int,
):
    with _simulation_global_lock:

        _simulation_cache.pop(
            patient_id,
            None,
        )

        _simulation_last_processed.pop(
            patient_id,
            None,
        )


# =========================================================
# ACCESS HELPER
# =========================================================

def ensure_patient_access(
    current_user: User,
    patient_id: int,
    db: Session,
):
    if not can_access_patient(
        current_user,
        patient_id,
        db,
    ):
        raise HTTPException(
            status_code=403,
            detail=(
                "You do not have access "
                "to this patient."
            ),
        )


# =========================================================
# DETECTOR RESULT HELPERS
# =========================================================

def detector_value(
    detector_result,
    key,
    default=None,
):
    if detector_result is None:
        return default

    if isinstance(
        detector_result,
        dict,
    ):
        return detector_result.get(
            key,
            default,
        )

    return getattr(
        detector_result,
        key,
        default,
    )


def serialize_detector(
    detector_result,
):
    if detector_result is None:
        return {
            "detector_state":
                "NORMAL",

            "baseline_rate":
                None,

            "baseline_amplitude":
                None,

            "deviation_percent":
                None,

            "detector_score":
                0,
        }

    state = detector_value(
        detector_result,
        "state",
        None,
    )

    if state is None:
        state = detector_value(
            detector_result,
            "detector_state",
            "NORMAL",
        )

    return {
        "detector_state":
            state,

        "baseline_rate":
            detector_value(
                detector_result,
                "baseline_rate",
                None,
            ),

        "baseline_amplitude":
            detector_value(
                detector_result,
                "baseline_amplitude",
                None,
            ),

        "deviation_percent":
            detector_value(
                detector_result,
                "deviation_percent",
                None,
            ),

        "detector_score":
            detector_value(
                detector_result,
                "score",
                detector_value(
                    detector_result,
                    "detector_score",
                    0,
                ),
            ),
    }


# =========================================================
# SIMULATION SCENARIOS
# =========================================================

@router.get("/scenarios")
def get_scenarios(
    current_user: User = Depends(
        get_current_user
    ),
):
    return [
        {
            "id": "NORMAL",
            "name": "Normal Breathing",
            "description": (
                "Stable simulated respiratory "
                "measurements."
            ),
        },
        {
            "id": "FAST",
            "name": "Fast Breathing",
            "description": (
                "Respiratory rate gradually "
                "increases."
            ),
        },
        {
            "id": "SLOW",
            "name": "Slow Breathing",
            "description": (
                "Respiratory rate gradually "
                "decreases."
            ),
        },
        {
            "id": "SHALLOW",
            "name": "Shallow Breathing",
            "description": (
                "Respiratory motion becomes "
                "faster and shallower."
            ),
        },
        {
            "id": "ASTHMA_ATTACK",
            "name": "Asthma-like Distress",
            "description": (
                "Controlled simulation of "
                "progressively faster, shallower "
                "and irregular respiratory motion."
            ),
        },
        {
            "id": "BREATHING_PAUSE",
            "name": "Breathing Pause",
            "description": (
                "Simulated waveform develops "
                "increasing respiratory pauses."
            ),
        },
        {
            "id": "RECOVERY",
            "name": "Recovery",
            "description": (
                "Measurements gradually return "
                "toward baseline."
            ),
        },
        {
            "id": "MOTION_ARTIFACT",
            "name": "Motion Artifact",
            "description": (
                "Movement makes the respiratory "
                "signal unsuitable for analysis."
            ),
        },
        {
            "id": "SIGNAL_LOSS",
            "name": "Signal Loss",
            "description": (
                "Respiratory signal becomes "
                "unavailable."
            ),
        },
    ]


# =========================================================
# START SIMULATION
#
# PATIENT ONLY.
#
# Family and Doctor cannot control simulation even if
# they manually call this endpoint.
# =========================================================

@router.post(
    "/patient/{patient_id}/simulation/start"
)
def start_patient_simulation(
    patient_id: int,
    payload: SimulationStartRequest,
    current_user: User = Depends(
        require_role("PATIENT")
    ),
):
    # =====================================================
    # PATIENT-ONLY SIMULATION CONTROL
    # =====================================================

    if current_user.id != patient_id:
        raise HTTPException(
            status_code=403,
            detail=(
                "You can only control simulation "
                "for your own account."
            ),
        )

    # =====================================================
    # NORMALIZE SCENARIO
    # =====================================================

    scenario = (
        payload.scenario
        .strip()
        .upper()
    )

    # =====================================================
    # COMPATIBILITY ALIASES
    # =====================================================

    scenario_aliases = {
        "FAST_BREATHING":
            "FAST",

        "SLOW_BREATHING":
            "SLOW",

        "SHALLOW_BREATHING":
            "SHALLOW",

        "ASTHMA_LIKE_DISTRESS":
            "ASTHMA_ATTACK",

        "ASTHMA_DISTRESS":
            "ASTHMA_ATTACK",
    }

    scenario = scenario_aliases.get(
        scenario,
        scenario,
    )

    # =====================================================
    # ALLOWED SCENARIOS
    # =====================================================

    allowed = {
        "NORMAL",
        "FAST",
        "SLOW",
        "SHALLOW",
        "ASTHMA_ATTACK",
        "BREATHING_PAUSE",
        "RECOVERY",
        "MOTION_ARTIFACT",
        "SIGNAL_LOSS",
    }

    if scenario not in allowed:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unknown simulation scenario."
            ),
        )

    # =====================================================
    # CLEAR OLD SIMULATION CACHE
    # =====================================================

    clear_simulation_cache(
        patient_id
    )

    # =====================================================
    # START SIMULATION
    # =====================================================

    try:
        state = start_simulation(
            patient_id,
            scenario,
        )

    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    return {
        "message":
            "Simulation started.",

        "patient_id":
            patient_id,

        "scenario":
            scenario,

        "simulation":
            state,
    }


# =========================================================
# STOP SIMULATION
#
# PATIENT ONLY.
# =========================================================

@router.post(
    "/patient/{patient_id}/simulation/stop"
)
def stop_patient_simulation(
    patient_id: int,
    current_user: User = Depends(
        require_role("PATIENT")
    ),
):
    if current_user.id != patient_id:
        raise HTTPException(
            status_code=403,
            detail=(
                "You can only control simulation "
                "for your own account."
            ),
        )

    stop_simulation(
        patient_id
    )

    clear_simulation_cache(
        patient_id
    )

    return {
        "message":
            "Simulation stopped.",

        "patient_id":
            patient_id,

        "mode":
            "LIVE",
    }


# =========================================================
# PROCESS ONE SIMULATION TICK
# =========================================================

def process_simulation_tick(
    patient_id: int,
    db: Session,
):
    lock = get_patient_lock(
        patient_id
    )

    with lock:

        now = time.monotonic()

        last_processed = (
            _simulation_last_processed.get(
                patient_id
            )
        )

        cached = (
            _simulation_cache.get(
                patient_id
            )
        )

        # -------------------------------------------------
        # Another dashboard has already processed this tick.
        # Return exactly the same result.
        # -------------------------------------------------

        if (
            cached is not None
            and last_processed is not None
            and (
                now
                - last_processed
            )
            < SIMULATION_TICK_SECONDS
        ):
            return cached

        # -------------------------------------------------
        # Generate measurement
        # -------------------------------------------------

        reading = generate_reading(
            patient_id
        )

        if not reading:
            return None

        respiratory_rate = (
            reading.get(
                "respiratory_rate"
            )
        )

        simulated_volume = (
            reading.get(
                "simulated_volume"
            )
        )

        signal_quality = (
            reading.get(
                "signal_quality",
                "UNKNOWN",
            )
        )

        # -------------------------------------------------
        # Detector
        #
        # Simulator provides measurements.
        # It does NOT decide WARNING/DISTRESS.
        # -------------------------------------------------

        detector_result = (
            process_measurement(
                patient_id=patient_id,

                respiratory_rate=
                    respiratory_rate,

                amplitude=
                    simulated_volume,

                signal_quality=
                    signal_quality,
            )
        )

        detector = serialize_detector(
            detector_result
        )

        # -------------------------------------------------
        # Alert
        # -------------------------------------------------

        create_detector_alert(
            db=db,

            patient_id=patient_id,

            detector_result=
                detector_result,
        )

        # -------------------------------------------------
        # Persistent respiratory event history
        # -------------------------------------------------

        update_respiratory_event(
            db=db,

            patient_id=patient_id,

            detector_result=
                detector_result,

            respiratory_rate=
                respiratory_rate,

            amplitude=
                simulated_volume,

            source="SIMULATION",

            signal_quality=
                signal_quality,
        )

        # -------------------------------------------------
        # Build monitoring result
        # -------------------------------------------------

        result = {
            "patient_id":
                patient_id,

            "mode":
                "DEMO",

            "source":
                "SIMULATION",

            "status":
                "MONITORING",

            "scenario":
                reading.get(
                    "scenario"
                ),

            "respiratory_rate":
                respiratory_rate,

            # IMPORTANT:
            # This is simulated amplitude/volume.
            # CSI does not directly provide calibrated
            # tidal volume in mL.
            "simulated_volume":
                simulated_volume,

            "signal_quality":
                signal_quality,

            "pattern":
                reading.get(
                    "pattern",
                    "SIMULATED",
                ),

            "confidence":
                reading.get(
                    "confidence"
                ),

            "waveform":
                reading.get(
                    "waveform",
                    [],
                ),

            "progress":
                reading.get(
                    "progress",
                    0,
                ),

            **detector,

            "timestamp":
                utc_now_iso(),
        }

        # -------------------------------------------------
        # Cache AFTER successful processing
        # -------------------------------------------------

        _simulation_cache[
            patient_id
        ] = result

        _simulation_last_processed[
            patient_id
        ] = now

        return result


# =========================================================
# CURRENT MONITORING STATE
#
# Patient / linked Family / linked Doctor
# can all read this endpoint.
# =========================================================

@router.get(
    "/patient/{patient_id}/current"
)
def get_current_monitoring(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    ensure_patient_access(
        current_user,
        patient_id,
        db,
    )

    # -----------------------------------------------------
    # SIMULATION
    # -----------------------------------------------------

    simulation_state = (
        get_simulation_state(
            patient_id
        )
    )

    if simulation_state:
        result = (
            process_simulation_tick(
                patient_id,
                db,
            )
        )

        if result:
            return result

    # -----------------------------------------------------
    # LIVE MODE
    #
    # Detector was already processed when the measurement
    # was POSTed to /reading.
    #
    # GET does NOT process the detector.
    # -----------------------------------------------------

    latest = (
        db.query(
            RespiratoryReading
        )
        .filter(
            RespiratoryReading.patient_id
            == patient_id
        )
        .order_by(
            RespiratoryReading.timestamp.desc()
        )
        .first()
    )

    detector_result = (
        get_detector_state(
            patient_id
        )
    )

    detector = serialize_detector(
        detector_result
    )

    if latest:
        quality = str(
            latest.signal_quality
            or "UNKNOWN"
        ).upper()

        unreliable = quality in {
            "UNKNOWN",
            "UNRELIABLE",
            "SIGNAL_LOSS",
            "LOST",
            "POOR",
            "MOTION_ARTIFACT",
        }

        return {
            "patient_id":
                patient_id,

            "mode":
                "LIVE",

            "source":
                latest.source
                or "LIVE",

            "status":
                (
                    "SIGNAL_UNRELIABLE"
                    if unreliable
                    else "MONITORING"
                ),

            "scenario":
                None,

            "respiratory_rate":
                latest.respiratory_rate,

            "simulated_volume":
                None,

            "signal_quality":
                latest.signal_quality,

            "pattern":
                latest.pattern,

            "confidence":
                latest.confidence,

            "waveform":
                [],

            "progress":
                None,

            **detector,

            "timestamp":
                (
                    latest.timestamp.isoformat()
                    if latest.timestamp
                    else utc_now_iso()
                ),
        }

    # -----------------------------------------------------
    # NO LIVE DATA
    #
    # Do not invent 15 BPM.
    # Do not animate fake respiration.
    # -----------------------------------------------------

    return {
        "patient_id":
            patient_id,

        "mode":
            "LIVE",

        "source":
            "LIVE",

        "status":
            "WAITING_FOR_DEVICE",

        "scenario":
            None,

        "respiratory_rate":
            None,

        "simulated_volume":
            None,

        "signal_quality":
            "UNKNOWN",

        "pattern":
            "NO_DATA",

        "confidence":
            None,

        "waveform":
            [],

        "progress":
            None,

        **detector,

        "timestamp":
            utc_now_iso(),
    }


# =========================================================
# LIVE RESPIRATORY READING
#
# MVP:
# Patient's own authenticated session can submit.
#
# Later the ESP32/device ingestion endpoint should use
# device authentication instead of user JWT.
# =========================================================

@router.post(
    "/patient/{patient_id}/reading"
)
def submit_live_reading(
    patient_id: int,
    payload: LiveReadingRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("PATIENT")
    ),
):
    if current_user.id != patient_id:
        raise HTTPException(
            status_code=403,
            detail=(
                "You can only submit monitoring "
                "data for your own account."
            ),
        )

    # -----------------------------------------------------
    # If real data arrives, LIVE wins.
    # Stop demo simulation so the two sources do not mix.
    # -----------------------------------------------------

    if get_simulation_state(
        patient_id
    ):
        stop_simulation(
            patient_id
        )

        clear_simulation_cache(
            patient_id
        )

    signal_quality = (
        payload.signal_quality
        .strip()
        .upper()
    )

    # -----------------------------------------------------
    # Save raw/processed respiratory reading
    # -----------------------------------------------------

    reading = RespiratoryReading(
        patient_id=
            patient_id,

        respiratory_rate=
            payload.respiratory_rate,

        signal_quality=
            signal_quality,

        pattern=
            payload.pattern,

        confidence=
            payload.confidence,

        source=
            "LIVE",
    )

    db.add(reading)
    db.commit()
    db.refresh(reading)

    # -----------------------------------------------------
    # Detector processes this measurement exactly once.
    # -----------------------------------------------------

    detector_result = (
        process_measurement(
            patient_id=patient_id,

            respiratory_rate=
                payload.respiratory_rate,

            amplitude=
                payload.amplitude,

            signal_quality=
                signal_quality,
        )
    )

    detector = serialize_detector(
        detector_result
    )

    # -----------------------------------------------------
    # Alert
    # -----------------------------------------------------

    create_detector_alert(
        db=db,

        patient_id=patient_id,

        detector_result=
            detector_result,
    )

    # -----------------------------------------------------
    # Persistent respiratory event
    # -----------------------------------------------------

    update_respiratory_event(
        db=db,

        patient_id=patient_id,

        detector_result=
            detector_result,

        respiratory_rate=
            payload.respiratory_rate,

        amplitude=
            payload.amplitude,

        source="LIVE",

        signal_quality=
            signal_quality,
    )

    return {
        "message":
            "Respiratory reading recorded.",

        "reading": {
            "id":
                reading.id,

            "patient_id":
                patient_id,

            "respiratory_rate":
                reading.respiratory_rate,

            "signal_quality":
                reading.signal_quality,

            "pattern":
                reading.pattern,

            "confidence":
                reading.confidence,

            "source":
                reading.source,

            "timestamp":
                (
                    reading.timestamp.isoformat()
                    if reading.timestamp
                    else utc_now_iso()
                ),
        },

        "detector":
            detector,
    }


# =========================================================
# RAW MONITORING HISTORY
#
# This remains useful for technical inspection.
#
# Respiratory irregularity history is provided separately by:
#
# GET /respiratory-events/patient/{patient_id}
# =========================================================

@router.get(
    "/patient/{patient_id}/history"
)
def get_monitoring_history(
    patient_id: int,

    limit: int = Query(
        default=100,
        ge=1,
        le=500,
    ),

    db: Session = Depends(get_db),

    current_user: User = Depends(
        get_current_user
    ),
):
    ensure_patient_access(
        current_user,
        patient_id,
        db,
    )

    readings = (
        db.query(
            RespiratoryReading
        )
        .filter(
            RespiratoryReading.patient_id
            == patient_id
        )
        .order_by(
            RespiratoryReading.timestamp.desc()
        )
        .limit(limit)
        .all()
    )

    return [
        {
            "id":
                reading.id,

            "patient_id":
                reading.patient_id,

            "respiratory_rate":
                reading.respiratory_rate,

            "signal_quality":
                reading.signal_quality,

            "pattern":
                reading.pattern,

            "confidence":
                reading.confidence,

            "source":
                reading.source,

            "timestamp":
                (
                    reading.timestamp.isoformat()
                    if reading.timestamp
                    else None
                ),
        }
        for reading in readings
    ]


# =========================================================
# DETECTOR STATUS
# =========================================================

@router.get(
    "/patient/{patient_id}/detector"
)
def get_patient_detector(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    ensure_patient_access(
        current_user,
        patient_id,
        db,
    )

    detector_result = (
        get_detector_state(
            patient_id
        )
    )

    return {
        "patient_id":
            patient_id,

        **serialize_detector(
            detector_result
        ),
    }


# =========================================================
# RESET DETECTOR
#
# Patient only.
#
# Useful when beginning a clean demo/calibration session.
# Family/Doctor cannot reset the patient's detector.
# =========================================================

@router.post(
    "/patient/{patient_id}/detector/reset"
)
def reset_patient_detector(
    patient_id: int,
    current_user: User = Depends(
        require_role("PATIENT")
    ),
):
    if current_user.id != patient_id:
        raise HTTPException(
            status_code=403,
            detail=(
                "You can only reset your own "
                "monitoring detector."
            ),
        )

    reset_detector(
        patient_id
    )

    clear_simulation_cache(
        patient_id
    )

    return {
        "message":
            "Respiratory detector reset.",

        "patient_id":
            patient_id,
    }