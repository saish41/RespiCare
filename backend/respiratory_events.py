from datetime import datetime

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)

from sqlalchemy.orm import Session

from database import get_db

from auth import get_current_user

from models import (
    RespiratoryEvent,
    User,
)

from connections import can_access_patient


router = APIRouter(
    prefix="/respiratory-events",
    tags=["Respiratory Events"],
)


# =========================================================
# SERIALIZER
# =========================================================

def serialize_event(event):
    duration_seconds = None

    if (
        event.started_at
        and event.ended_at
    ):
        duration_seconds = max(
            0,
            int(
                (
                    event.ended_at
                    - event.started_at
                ).total_seconds()
            ),
        )

    return {
        "id": event.id,

        "patient_id":
            event.patient_id,

        "event_type":
            event.event_type,

        "highest_state":
            event.highest_state,

        "source":
            event.source,

        "started_at":
            event.started_at,

        "ended_at":
            event.ended_at,

        "duration_seconds":
            duration_seconds,

        "baseline_rate":
            event.baseline_rate,

        "starting_rate":
            event.starting_rate,

        "minimum_rate":
            event.minimum_rate,

        "maximum_rate":
            event.maximum_rate,

        "maximum_deviation_percent":
            event.maximum_deviation_percent,

        "signal_quality":
            event.signal_quality,

        "progression":
            (
                event.progression.split(">")
                if event.progression
                else []
            ),

        "alert_generated":
            event.alert_generated,

        "status":
            event.status,
    }


# =========================================================
# EVENT HISTORY
# =========================================================

@router.get(
    "/patient/{patient_id}"
)
def get_patient_events(
    patient_id: int,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    if not can_access_patient(
        current_user,
        patient_id,
        db,
    ):
        raise HTTPException(
            status_code=403,
            detail="Access denied.",
        )

    limit = max(
        1,
        min(limit, 500),
    )

    events = (
        db.query(RespiratoryEvent)
        .filter(
            RespiratoryEvent.patient_id
            == patient_id
        )
        .order_by(
            RespiratoryEvent.started_at.desc()
        )
        .limit(limit)
        .all()
    )

    return [
        serialize_event(event)
        for event in events
    ]


# =========================================================
# INTERNAL EVENT RECORDER
#
# Called by monitoring service.
# Not an HTTP endpoint.
# =========================================================

STATE_RANK = {
    "NORMAL": 0,
    "WATCH": 1,
    "WARNING": 2,
    "DISTRESS": 3,
}


def classify_event(
    respiratory_rate,
    baseline_rate,
    amplitude=None,
    baseline_amplitude=None,
):
    if (
        respiratory_rate is None
        or baseline_rate is None
        or baseline_rate <= 0
    ):
        return "RESPIRATORY_PATTERN_CHANGE"

    ratio = (
        respiratory_rate
        / baseline_rate
    )

    if ratio >= 1.25:
        return "FAST_BREATHING_PATTERN"

    if ratio <= 0.75:
        return "SLOW_BREATHING_PATTERN"

    if (
        amplitude is not None
        and baseline_amplitude is not None
        and baseline_amplitude > 0
        and (
            amplitude
            / baseline_amplitude
        ) <= 0.6
    ):
        return "SHALLOW_BREATHING_PATTERN"

    return "RESPIRATORY_PATTERN_CHANGE"


def update_respiratory_event(
    db: Session,
    patient_id: int,
    detector_result: dict,
    respiratory_rate: float | None,
    source: str,
    signal_quality: str,
    amplitude: float | None = None,
):
    state = str(
        detector_result.get(
            "state",
            detector_result.get(
                "detector_state",
                "NORMAL",
            ),
        )
    ).upper()

    baseline_rate = (
        detector_result.get(
            "baseline_rate"
        )
    )

    baseline_amplitude = (
        detector_result.get(
            "baseline_amplitude"
        )
    )

    # Signal problems should not be stored as
    # respiratory irregularities.
    if state == "SIGNAL_UNRELIABLE":
        return None

    open_event = (
        db.query(RespiratoryEvent)
        .filter(
            RespiratoryEvent.patient_id
            == patient_id,

            RespiratoryEvent.status
            == "OPEN",
        )
        .order_by(
            RespiratoryEvent.started_at.desc()
        )
        .first()
    )

    # =====================================================
    # NORMAL = CLOSE EXISTING EVENT
    # =====================================================

    if state == "NORMAL":
        if open_event:
            open_event.ended_at = (
                datetime.utcnow()
            )

            open_event.status = "CLOSED"

            progression = (
                open_event.progression
                or ""
            )

            states = [
                value
                for value
                in progression.split(">")
                if value
            ]

            if (
                not states
                or states[-1] != "NORMAL"
            ):
                states.append("NORMAL")

            open_event.progression = ">".join(
                states
            )

            db.commit()
            db.refresh(open_event)

        return open_event

    # =====================================================
    # ONLY WATCH/WARNING/DISTRESS OPEN EVENTS
    # =====================================================

    if state not in {
        "WATCH",
        "WARNING",
        "DISTRESS",
    }:
        return None

    deviation = None

    if (
        respiratory_rate is not None
        and baseline_rate is not None
        and baseline_rate > 0
    ):
        deviation = (
            (
                respiratory_rate
                - baseline_rate
            )
            / baseline_rate
        ) * 100

    # =====================================================
    # CREATE EVENT
    # =====================================================

    if not open_event:
        event_type = classify_event(
            respiratory_rate,
            baseline_rate,
            amplitude,
            baseline_amplitude,
        )

        open_event = RespiratoryEvent(
            patient_id=patient_id,

            event_type=event_type,

            highest_state=state,

            source=source,

            started_at=datetime.utcnow(),

            baseline_rate=
                baseline_rate,

            starting_rate=
                respiratory_rate,

            minimum_rate=
                respiratory_rate,

            maximum_rate=
                respiratory_rate,

            maximum_deviation_percent=(
                abs(deviation)
                if deviation is not None
                else None
            ),

            signal_quality=
                signal_quality,

            progression=state,

            alert_generated=(
                state in {
                    "WARNING",
                    "DISTRESS",
                }
            ),

            status="OPEN",
        )

        db.add(open_event)
        db.commit()
        db.refresh(open_event)

        return open_event

    # =====================================================
    # UPDATE EXISTING EVENT
    # =====================================================

    if respiratory_rate is not None:
        if (
            open_event.minimum_rate
            is None
            or respiratory_rate
            < open_event.minimum_rate
        ):
            open_event.minimum_rate = (
                respiratory_rate
            )

        if (
            open_event.maximum_rate
            is None
            or respiratory_rate
            > open_event.maximum_rate
        ):
            open_event.maximum_rate = (
                respiratory_rate
            )

    if deviation is not None:
        absolute_deviation = abs(
            deviation
        )

        if (
            open_event.maximum_deviation_percent
            is None
            or absolute_deviation
            > open_event.maximum_deviation_percent
        ):
            open_event.maximum_deviation_percent = (
                absolute_deviation
            )

    current_rank = STATE_RANK.get(
        open_event.highest_state,
        0,
    )

    new_rank = STATE_RANK.get(
        state,
        0,
    )

    if new_rank > current_rank:
        open_event.highest_state = state

    progression = (
        open_event.progression
        or ""
    )

    states = [
        value
        for value
        in progression.split(">")
        if value
    ]

    if (
        not states
        or states[-1] != state
    ):
        states.append(state)

    open_event.progression = ">".join(
        states
    )

    if state in {
        "WARNING",
        "DISTRESS",
    }:
        open_event.alert_generated = True

    open_event.signal_quality = (
        signal_quality
    )

    db.commit()
    db.refresh(open_event)

    return open_event