from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)

from sqlalchemy.orm import Session

from database import get_db

from models import (
    Alert,
    User,
)

from auth import (
    get_current_user,
)

from connections import (
    can_access_patient,
)


router = APIRouter(
    prefix="/alerts",
    tags=["Alerts"],
)


# ============================================================
# SERIALIZER
# ============================================================

def serialize_alert(alert: Alert):
    return {
        "id": alert.id,

        "patient_id": alert.patient_id,

        "alert_type": alert.alert_type,

        "severity": alert.severity,

        "message": alert.message,

        "acknowledged": bool(
            alert.acknowledged
        ),

        "acknowledged_by": (
            alert.acknowledged_by
        ),

        "created_at": (
            alert.created_at.isoformat()
            if alert.created_at
            else None
        ),
    }


# ============================================================
# CREATE DETECTOR ALERT
# ============================================================

def create_detector_alert(
    db: Session,
    patient_id: int,
    detector_result: dict,
):
    """
    Called internally by monitoring.py.

    WATCH does not create an alert.

    WARNING and DISTRESS create persistent database alerts.

    Duplicate alerts are suppressed while an equivalent
    unacknowledged alert already exists.
    """

    state = detector_result.get(
        "state",
        "NORMAL",
    )

    previous_state = detector_result.get(
        "previous_state",
        "NORMAL",
    )

    changed = detector_result.get(
        "changed",
        False,
    )


    # --------------------------------------------------------
    # ONLY WARNING / DISTRESS CREATE ALERTS
    # --------------------------------------------------------

    if state not in {
        "WARNING",
        "DISTRESS",
    }:
        return None


    # --------------------------------------------------------
    # ONLY CREATE WHEN ENTERING / ESCALATING STATE
    # --------------------------------------------------------

    if not changed:
        return None


    severity = (
        "HIGH"
        if state == "WARNING"
        else "CRITICAL"
    )


    alert_type = (
        "RESPIRATORY_PATTERN_CHANGE"
        if state == "WARNING"
        else "RESPIRATORY_DISTRESS_PATTERN"
    )


    reason = detector_result.get(
        "reason",
        "Persistent respiratory-pattern change detected",
    )


    current_rate = detector_result.get(
        "current_rate"
    )

    baseline_rate = detector_result.get(
        "baseline_rate"
    )


    details = reason


    if (
        current_rate is not None
        and baseline_rate is not None
    ):
        details += (
            f". Current rate "
            f"{current_rate:.1f} BPM; "
            f"baseline "
            f"{baseline_rate:.1f} BPM."
        )


    # --------------------------------------------------------
    # DUPLICATE SUPPRESSION
    # --------------------------------------------------------

    existing = (
        db.query(Alert)
        .filter(
            Alert.patient_id == patient_id,
            Alert.alert_type == alert_type,
            Alert.acknowledged == False,
        )
        .order_by(
            Alert.created_at.desc()
        )
        .first()
    )


    if existing:
        return existing


    # --------------------------------------------------------
    # CREATE ALERT
    # --------------------------------------------------------

    alert = Alert(
        patient_id=patient_id,

        alert_type=alert_type,

        severity=severity,

        message=details,

        acknowledged=False,

        created_at=datetime.now(
            timezone.utc
        ),
    )


    db.add(alert)

    db.commit()

    db.refresh(alert)


    print(
        f"[RESPICARE ALERT] "
        f"patient={patient_id} "
        f"state={state} "
        f"severity={severity}"
    )


    return alert


# ============================================================
# GET MY ALERTS
# ============================================================

@router.get("/my-alerts")
def get_my_alerts(
    db: Session = Depends(get_db),

    current_user: User = Depends(
        get_current_user
    ),
):
    """
    PATIENT:
        alerts belonging to themselves.

    FAMILY / DOCTOR:
        alerts belonging to actively connected patients.
    """

    role = str(
        current_user.role
    ).upper()


    # --------------------------------------------------------
    # PATIENT
    # --------------------------------------------------------

    if role == "PATIENT":

        alerts = (
            db.query(Alert)
            .filter(
                Alert.patient_id
                == current_user.id
            )
            .order_by(
                Alert.created_at.desc()
            )
            .limit(100)
            .all()
        )


        return [
            serialize_alert(alert)
            for alert in alerts
        ]


    # --------------------------------------------------------
    # FAMILY / DOCTOR
    # --------------------------------------------------------

    if role in {
        "FAMILY",
        "DOCTOR",
    }:

        from models import Connection


        connections = (
            db.query(Connection)
            .filter(
                Connection.guardian_id
                == current_user.id,

                Connection.status
                == "ACTIVE",
            )
            .all()
        )


        patient_ids = [
            connection.patient_id
            for connection
            in connections
        ]


        if not patient_ids:
            return []


        alerts = (
            db.query(Alert)
            .filter(
                Alert.patient_id.in_(
                    patient_ids
                )
            )
            .order_by(
                Alert.created_at.desc()
            )
            .limit(100)
            .all()
        )


        return [
            serialize_alert(alert)
            for alert in alerts
        ]


    raise HTTPException(
        status_code=403,
        detail="Role not permitted.",
    )


# ============================================================
# GET PATIENT ALERTS
# ============================================================

@router.get(
    "/patient/{patient_id}"
)
def get_patient_alerts(
    patient_id: int,

    db: Session = Depends(get_db),

    current_user: User = Depends(
        get_current_user
    ),
):
    allowed = can_access_patient(
        current_user,
        patient_id,
        db,
    )


    if not allowed:
        raise HTTPException(
            status_code=403,
            detail=(
                "You do not have access "
                "to this patient."
            ),
        )


    alerts = (
        db.query(Alert)
        .filter(
            Alert.patient_id
            == patient_id
        )
        .order_by(
            Alert.created_at.desc()
        )
        .limit(100)
        .all()
    )


    return [
        serialize_alert(alert)
        for alert in alerts
    ]


# ============================================================
# ACKNOWLEDGE ALERT
# ============================================================

@router.post(
    "/{alert_id}/acknowledge"
)
def acknowledge_alert(
    alert_id: int,

    db: Session = Depends(get_db),

    current_user: User = Depends(
        get_current_user
    ),
):
    alert = (
        db.query(Alert)
        .filter(
            Alert.id == alert_id
        )
        .first()
    )


    if not alert:
        raise HTTPException(
            status_code=404,
            detail="Alert not found.",
        )


    allowed = can_access_patient(
        current_user,
        alert.patient_id,
        db,
    )


    if not allowed:
        raise HTTPException(
            status_code=403,
            detail=(
                "You do not have access "
                "to this alert."
            ),
        )


    alert.acknowledged = True

    alert.acknowledged_by = (
        current_user.id
    )


    db.commit()

    db.refresh(alert)


    return {
        "message": (
            "Alert acknowledged."
        ),

        "alert": serialize_alert(
            alert
        ),
    }