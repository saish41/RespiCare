from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user, require_role
from connections import can_access_patient
from models import (
    MedicationDoseLog,
    Prescription,
    User,
)


router = APIRouter(
    prefix="/medications",
    tags=["Medications"],
)


# ============================================================
# REQUEST MODELS
# ============================================================


class PrescriptionCreate(BaseModel):
    patient_id: int

    medicine_name: str
    dosage: str

    medicine_form: str = "Tablet"

    schedule: str = ""

    doses_per_day: int = Field(
        default=1,
        ge=1,
        le=4,
    )

    dose_times: list[str] = Field(
        default_factory=list
    )

    food_instruction: str = ""
    instructions: str = ""

    start_date: str

    duration_days: int | None = Field(
        default=None,
        ge=1,
    )


class DoseStatusRequest(BaseModel):
    prescription_id: int

    dose_number: int = Field(
        ge=1,
        le=10,
    )

    status: str

    dose_date: str

    reason: str = ""
    notes: str = ""


class LegacyTakenRequest(BaseModel):
    prescription_id: int
    taken: bool


# ============================================================
# BASIC HELPERS
# ============================================================


def parse_date(
    value: str | None,
):
    if not value:
        return None

    try:
        return date.fromisoformat(
            value
        )

    except ValueError:
        return None


def parse_time_string(
    value: str,
):
    """
    Validate HH:MM time.
    """

    try:
        datetime.strptime(
            value,
            "%H:%M",
        )

        return value

    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid dose time '{value}'. "
                "Use HH:MM format."
            ),
        )


# ============================================================
# DOSE TIME PARSING
#
# Supports:
#
# 08:00,14:00,20:00
#
# AND older values such as:
#
# ["08:00", "20:00"]
# ============================================================


def parse_dose_times(
    prescription: Prescription,
):
    raw = prescription.dose_times

    if not raw:
        return []

    # --------------------------------------------------------
    # Already a Python list
    # --------------------------------------------------------

    if isinstance(
        raw,
        list,
    ):
        return [
            str(item).strip()
            for item in raw
            if str(item).strip()
        ]

    raw = str(raw).strip()

    if not raw:
        return []

    # --------------------------------------------------------
    # Handle older JSON-like strings
    #
    # ["08:00", "20:00"]
    # --------------------------------------------------------

    if (
        raw.startswith("[")
        and raw.endswith("]")
    ):
        cleaned = (
            raw
            .replace("[", "")
            .replace("]", "")
            .replace('"', "")
            .replace("'", "")
        )

        return [
            item.strip()
            for item
            in cleaned.split(",")
            if item.strip()
        ]

    # --------------------------------------------------------
    # Current storage format
    #
    # 08:00,14:00,20:00
    # --------------------------------------------------------

    return [
        item.strip()
        for item
        in raw.split(",")
        if item.strip()
    ]


# ============================================================
# EFFECTIVE DOSE TIMES
#
# THIS FIXES THE 400 ERROR.
#
# Schedule generation AND dose recording now use the exact
# same function.
#
# Older prescriptions without dose_times still work.
# ============================================================


def get_effective_dose_times(
    prescription: Prescription,
):
    times = parse_dose_times(
        prescription
    )

    if times:
        return times

    # --------------------------------------------------------
    # Fallback for prescriptions created before dose_times
    # existed.
    # --------------------------------------------------------

    fallback_times = [
        "08:00",
        "14:00",
        "20:00",
        "22:00",
    ]

    try:
        count = int(
            prescription.doses_per_day
            or 1
        )

    except (
        TypeError,
        ValueError,
    ):
        count = 1

    count = max(
        1,
        min(
            count,
            len(fallback_times),
        ),
    )

    return fallback_times[
        :count
    ]


# ============================================================
# PRESCRIPTION ACTIVE CHECK
# ============================================================


def prescription_active_on(
    prescription: Prescription,
    target_date: date,
):
    if not prescription.is_active:
        return False

    if (
        str(
            prescription.status
            or "ACTIVE"
        ).upper()
        != "ACTIVE"
    ):
        return False

    start = parse_date(
        prescription.start_date
    )

    if start:
        if target_date < start:
            return False

        if prescription.duration_days:
            end = (
                start
                + timedelta(
                    days=
                        prescription.duration_days
                        - 1
                )
            )

            if target_date > end:
                return False

    return True


# ============================================================
# DOCTOR NAME
# ============================================================


def doctor_name(
    prescription: Prescription,
    db: Session,
):
    doctor = (
        db.query(User)
        .filter(
            User.id
            == prescription.doctor_id
        )
        .first()
    )

    return (
        doctor.name
        if doctor
        else "Doctor"
    )


# ============================================================
# SERIALIZE DOSE LOG
# ============================================================


def serialize_log(
    log: MedicationDoseLog | None,
):
    if not log:
        return None

    return {
        "id":
            log.id,

        "prescription_id":
            log.prescription_id,

        "patient_id":
            log.patient_id,

        "dose_date":
            log.dose_date,

        "dose_number":
            log.dose_number,

        "scheduled_time":
            log.scheduled_time,

        "status":
            log.status,

        "marked_by":
            log.marked_by,

        "reason":
            log.reason,

        "notes":
            log.notes,

        "timestamp": (
            log.timestamp.isoformat()
            if log.timestamp
            else None
        ),
    }


# ============================================================
# SERIALIZE PRESCRIPTION
# ============================================================


def serialize_prescription(
    prescription: Prescription,
    db: Session,
):
    return {
        "id":
            prescription.id,

        "patient_id":
            prescription.patient_id,

        "doctor_id":
            prescription.doctor_id,

        "doctor_name":
            doctor_name(
                prescription,
                db,
            ),

        "medicine_name":
            prescription.medicine_name,

        "dosage":
            prescription.dosage,

        "medicine_form":
            prescription.medicine_form,

        "schedule":
            prescription.schedule,

        "doses_per_day":
            prescription.doses_per_day,

        # IMPORTANT:
        # Use effective times so old prescriptions display
        # the same times they can actually record.
        "dose_times":
            get_effective_dose_times(
                prescription
            ),

        "food_instruction":
            prescription.food_instruction,

        "instructions":
            prescription.instructions,

        "start_date":
            prescription.start_date,

        "duration_days":
            prescription.duration_days,

        "status":
            prescription.status,

        "is_active":
            prescription.is_active,

        "created_at": (
            prescription.created_at.isoformat()
            if prescription.created_at
            else None
        ),
    }


# ============================================================
# ACCESS CHECK
# ============================================================


def ensure_access(
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


# ============================================================
# GET PRESCRIPTION
# ============================================================


def get_prescription_or_404(
    prescription_id: int,
    db: Session,
):
    prescription = (
        db.query(Prescription)
        .filter(
            Prescription.id
            == prescription_id
        )
        .first()
    )

    if not prescription:
        raise HTTPException(
            status_code=404,
            detail=(
                "Prescription not found."
            ),
        )

    return prescription


# ============================================================
# BUILD DAILY SCHEDULE FOR ONE PRESCRIPTION
# ============================================================


def build_prescription_schedule(
    prescription: Prescription,
    target_date: date,
    db: Session,
):
    if not prescription_active_on(
        prescription,
        target_date,
    ):
        return []

    # --------------------------------------------------------
    # IMPORTANT:
    # Same dose-time source as record_dose().
    # --------------------------------------------------------

    times = get_effective_dose_times(
        prescription
    )

    results = []

    for (
        index,
        scheduled_time,
    ) in enumerate(
        times,
        start=1,
    ):
        log = (
            db.query(
                MedicationDoseLog
            )
            .filter(
                MedicationDoseLog
                .prescription_id
                == prescription.id,

                MedicationDoseLog
                .dose_date
                == target_date.isoformat(),

                MedicationDoseLog
                .dose_number
                == index,
            )
            .order_by(
                MedicationDoseLog
                .id
                .desc()
            )
            .first()
        )

        results.append(
            {
                "prescription_id":
                    prescription.id,

                "patient_id":
                    prescription.patient_id,

                "dose_number":
                    index,

                "dose_date":
                    target_date.isoformat(),

                "scheduled_time":
                    scheduled_time,

                "medicine_name":
                    prescription.medicine_name,

                "dosage":
                    prescription.dosage,

                "medicine_form":
                    prescription.medicine_form,

                "food_instruction":
                    prescription.food_instruction,

                "instructions":
                    prescription.instructions,

                "doctor_name":
                    doctor_name(
                        prescription,
                        db,
                    ),

                "record":
                    serialize_log(
                        log
                    ),

                "status": (
                    str(
                        log.status
                    ).upper()
                    if log
                    else "PENDING"
                ),
            }
        )

    return results


# ============================================================
# BUILD COMPLETE PATIENT DAY
# ============================================================


def build_patient_day(
    patient_id: int,
    target_date: date,
    db: Session,
):
    prescriptions = (
        db.query(Prescription)
        .filter(
            Prescription.patient_id
            == patient_id
        )
        .order_by(
            Prescription
            .created_at
            .desc()
        )
        .all()
    )

    schedule = []

    active_prescriptions = []

    for prescription in prescriptions:
        doses = (
            build_prescription_schedule(
                prescription,
                target_date,
                db,
            )
        )

        if doses:
            schedule.extend(
                doses
            )

            active_prescriptions.append(
                serialize_prescription(
                    prescription,
                    db,
                )
            )

    schedule.sort(
        key=lambda item:
            item["scheduled_time"]
    )

    return {
        "date":
            target_date.isoformat(),

        "schedule":
            schedule,

        "prescriptions":
            active_prescriptions,
    }


# ============================================================
# CREATE PRESCRIPTION
#
# DOCTOR ONLY
# ============================================================


@router.post(
    "/prescriptions"
)
def create_prescription(
    payload: PrescriptionCreate,

    db: Session = Depends(
        get_db
    ),

    current_user: User = Depends(
        require_role(
            "DOCTOR"
        )
    ),
):
    ensure_access(
        current_user,
        payload.patient_id,
        db,
    )

    medicine_name = (
        payload
        .medicine_name
        .strip()
    )

    dosage = (
        payload
        .dosage
        .strip()
    )

    if not medicine_name:
        raise HTTPException(
            status_code=400,
            detail=(
                "Medicine name is required."
            ),
        )

    if not dosage:
        raise HTTPException(
            status_code=400,
            detail=(
                "Dosage is required."
            ),
        )

    start = parse_date(
        payload.start_date
    )

    if not start:
        raise HTTPException(
            status_code=400,
            detail=(
                "Start date must use "
                "YYYY-MM-DD format."
            ),
        )

    times = [
        parse_time_string(
            value.strip()
        )
        for value
        in payload.dose_times
        if value.strip()
    ]

    if (
        len(times)
        != payload.doses_per_day
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Number of dose times must "
                "match doses per day."
            ),
        )

    prescription = Prescription(
        patient_id=
            payload.patient_id,

        doctor_id=
            current_user.id,

        medicine_name=
            medicine_name,

        dosage=
            dosage,

        medicine_form=(
            payload
            .medicine_form
            .strip()
            or "Tablet"
        ),

        schedule=(
            payload
            .schedule
            .strip()
            or
            (
                f"{payload.doses_per_day} "
                "dose(s) daily"
            )
        ),

        doses_per_day=
            payload.doses_per_day,

        dose_times=
            ",".join(
                times
            ),

        food_instruction=
            payload
            .food_instruction
            .strip(),

        instructions=
            payload
            .instructions
            .strip(),

        start_date=
            payload.start_date,

        duration_days=
            payload.duration_days,

        status=
            "ACTIVE",

        is_active=
            True,
    )

    db.add(
        prescription
    )

    db.commit()

    db.refresh(
        prescription
    )

    return (
        serialize_prescription(
            prescription,
            db,
        )
    )


# ============================================================
# GET PATIENT PRESCRIPTIONS
# ============================================================


@router.get(
    "/patient/{patient_id}"
)
def get_patient_prescriptions(
    patient_id: int,

    db: Session = Depends(
        get_db
    ),

    current_user: User = Depends(
        get_current_user
    ),
):
    ensure_access(
        current_user,
        patient_id,
        db,
    )

    prescriptions = (
        db.query(
            Prescription
        )
        .filter(
            Prescription.patient_id
            == patient_id
        )
        .order_by(
            Prescription
            .created_at
            .desc()
        )
        .all()
    )

    today = date.today()

    result = []

    for prescription in prescriptions:
        data = serialize_prescription(
            prescription,
            db,
        )

        data["today"] = {
            "date":
                today.isoformat(),

            "doses":
                build_prescription_schedule(
                    prescription,
                    today,
                    db,
                ),
        }

        result.append(
            data
        )

    return result


# ============================================================
# DAILY MEDICATION TRACKER
# ============================================================


@router.get(
    "/patient/{patient_id}/tracker"
)
def daily_tracker(
    patient_id: int,

    target_date: str = Query(
        alias="date"
    ),

    db: Session = Depends(
        get_db
    ),

    current_user: User = Depends(
        get_current_user
    ),
):
    ensure_access(
        current_user,
        patient_id,
        db,
    )

    parsed = parse_date(
        target_date
    )

    if not parsed:
        raise HTTPException(
            status_code=400,
            detail=(
                "Date must use "
                "YYYY-MM-DD."
            ),
        )

    result = (
        build_patient_day(
            patient_id,
            parsed,
            db,
        )
    )

    schedule = (
        result["schedule"]
    )

    result["summary"] = {
        "scheduled":
            len(schedule),

        "taken":
            sum(
                1
                for item
                in schedule
                if item["status"]
                == "TAKEN"
            ),

        "not_taken":
            sum(
                1
                for item
                in schedule
                if item["status"]
                == "NOT_TAKEN"
            ),

        "pending":
            sum(
                1
                for item
                in schedule
                if item["status"]
                == "PENDING"
            ),
    }

    return result


# ============================================================
# WEEKLY MEDICATION TRACKER
# ============================================================


@router.get(
    "/patient/{patient_id}/week"
)
def weekly_tracker(
    patient_id: int,

    start_date: str,

    today: str | None = None,

    db: Session = Depends(
        get_db
    ),

    current_user: User = Depends(
        get_current_user
    ),
):
    ensure_access(
        current_user,
        patient_id,
        db,
    )

    start = parse_date(
        start_date
    )

    local_today = (
        parse_date(
            today
        )
        if today
        else date.today()
    )

    if not start:
        raise HTTPException(
            status_code=400,
            detail=(
                "start_date must use "
                "YYYY-MM-DD."
            ),
        )

    if not local_today:
        local_today = (
            date.today()
        )

    days = []

    totals = {
        "scheduled": 0,
        "taken": 0,
        "not_taken": 0,
        "missed": 0,
        "pending": 0,
    }

    for offset in range(7):
        target = (
            start
            + timedelta(
                days=offset
            )
        )

        day_data = (
            build_patient_day(
                patient_id,
                target,
                db,
            )
        )

        summary = {
            "scheduled": 0,
            "taken": 0,
            "not_taken": 0,
            "missed": 0,
            "pending": 0,
        }

        for item in day_data[
            "schedule"
        ]:
            summary[
                "scheduled"
            ] += 1

            recorded = (
                item["status"]
            )

            if (
                recorded
                == "TAKEN"
            ):
                summary[
                    "taken"
                ] += 1

            elif (
                recorded
                == "NOT_TAKEN"
            ):
                summary[
                    "not_taken"
                ] += 1

            elif (
                target
                < local_today
            ):
                summary[
                    "missed"
                ] += 1

            else:
                summary[
                    "pending"
                ] += 1

        for key in totals:
            totals[key] += (
                summary[key]
            )

        days.append(
            {
                "date":
                    target.isoformat(),

                **summary,
            }
        )

    scheduled = (
        totals["scheduled"]
    )

    completion = (
        round(
            (
                totals["taken"]
                / scheduled
            )
            * 100,
            1,
        )
        if scheduled
        else 0
    )

    return {
        "start_date":
            start.isoformat(),

        "days":
            days,

        "summary": {
            **totals,

            "completion_percent":
                completion,
        },
    }


# ============================================================
# RECORD ONE DOSE
#
# PATIENT + FAMILY
#
# Doctor is read-only.
# ============================================================


@router.post(
    "/dose"
)
def record_dose(
    payload: DoseStatusRequest,

    db: Session = Depends(
        get_db
    ),

    current_user: User = Depends(
        get_current_user
    ),
):
    role = str(
        current_user.role
    ).upper()

    if role not in {
        "PATIENT",
        "FAMILY",
    }:
        raise HTTPException(
            status_code=403,
            detail=(
                "Doctors can view medication "
                "adherence but cannot record "
                "a dose for the patient."
            ),
        )

    prescription = (
        get_prescription_or_404(
            payload.prescription_id,
            db,
        )
    )

    ensure_access(
        current_user,
        prescription.patient_id,
        db,
    )

    parsed_date = parse_date(
        payload.dose_date
    )

    if not parsed_date:
        raise HTTPException(
            status_code=400,
            detail=(
                "dose_date must use "
                "YYYY-MM-DD."
            ),
        )

    # --------------------------------------------------------
    # CRITICAL FIX
    #
    # Previously this called parse_dose_times().
    #
    # Now it uses the exact same effective times as the
    # tracker UI/schedule.
    #
    # This fixes "Invalid dose number" for old prescriptions.
    # --------------------------------------------------------

    times = (
        get_effective_dose_times(
            prescription
        )
    )

    if (
        payload.dose_number < 1
        or
        payload.dose_number
        > len(times)
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid dose number."
            ),
        )

    status = (
        payload
        .status
        .strip()
        .upper()
    )

    if status not in {
        "TAKEN",
        "NOT_TAKEN",
        "PENDING",
    }:
        raise HTTPException(
            status_code=400,
            detail=(
                "Dose status must be "
                "TAKEN, NOT_TAKEN, "
                "or PENDING."
            ),
        )

    existing = (
        db.query(
            MedicationDoseLog
        )
        .filter(
            MedicationDoseLog
            .prescription_id
            == prescription.id,

            MedicationDoseLog
            .dose_date
            == payload.dose_date,

            MedicationDoseLog
            .dose_number
            == payload.dose_number,
        )
        .first()
    )

    # --------------------------------------------------------
    # RETURN DOSE TO PENDING
    # --------------------------------------------------------

    if status == "PENDING":
        if existing:
            db.delete(
                existing
            )

            db.commit()

        return {
            "message":
                "Dose returned to pending.",

            "status":
                "PENDING",
        }

    actor = (
        f"{role} • "
        f"{current_user.name}"
    )

    scheduled_time = (
        times[
            payload.dose_number
            - 1
        ]
    )

    # --------------------------------------------------------
    # UPDATE EXISTING LOG
    # --------------------------------------------------------

    if existing:
        log = existing

        log.status = status

        log.marked_by = (
            actor
        )

        log.reason = (
            payload
            .reason
            .strip()
        )

        log.notes = (
            payload
            .notes
            .strip()
        )

        log.scheduled_time = (
            scheduled_time
        )

        log.timestamp = (
            datetime.now(
                timezone.utc
            )
        )

    # --------------------------------------------------------
    # CREATE NEW LOG
    # --------------------------------------------------------

    else:
        log = (
            MedicationDoseLog(
                prescription_id=
                    prescription.id,

                patient_id=
                    prescription.patient_id,

                dose_date=
                    payload.dose_date,

                dose_number=
                    payload.dose_number,

                scheduled_time=
                    scheduled_time,

                status=
                    status,

                marked_by=
                    actor,

                reason=
                    payload
                    .reason
                    .strip(),

                notes=
                    payload
                    .notes
                    .strip(),

                timestamp=
                    datetime.now(
                        timezone.utc
                    ),
            )
        )

        db.add(
            log
        )

    db.commit()

    db.refresh(
        log
    )

    return {
        "message":
            "Dose status recorded.",

        "dose":
            serialize_log(
                log
            ),
    }


# ============================================================
# MEDICATION HISTORY
# ============================================================


@router.get(
    "/patient/{patient_id}/history"
)
def medication_history(
    patient_id: int,

    days: int = Query(
        default=30,
        ge=1,
        le=365,
    ),

    db: Session = Depends(
        get_db
    ),

    current_user: User = Depends(
        get_current_user
    ),
):
    ensure_access(
        current_user,
        patient_id,
        db,
    )

    cutoff = (
        date.today()
        - timedelta(
            days=days
        )
    ).isoformat()

    logs = (
        db.query(
            MedicationDoseLog
        )
        .filter(
            MedicationDoseLog
            .patient_id
            == patient_id,

            MedicationDoseLog
            .dose_date
            >= cutoff,
        )
        .order_by(
            MedicationDoseLog
            .dose_date
            .desc(),

            MedicationDoseLog
            .scheduled_time
            .desc(),
        )
        .all()
    )

    result = []

    for log in logs:
        prescription = (
            db.query(
                Prescription
            )
            .filter(
                Prescription.id
                == log.prescription_id
            )
            .first()
        )

        result.append(
            {
                **serialize_log(
                    log
                ),

                "medicine_name": (
                    prescription.medicine_name
                    if prescription
                    else "Medication"
                ),

                "dosage": (
                    prescription.dosage
                    if prescription
                    else ""
                ),

                "medicine_form": (
                    prescription.medicine_form
                    if prescription
                    else ""
                ),
            }
        )

    return result


# ============================================================
# STOP PRESCRIPTION
#
# Prescribing doctor only.
# ============================================================


@router.delete(
    "/prescriptions/{prescription_id}"
)
def stop_prescription(
    prescription_id: int,

    db: Session = Depends(
        get_db
    ),

    current_user: User = Depends(
        require_role(
            "DOCTOR"
        )
    ),
):
    prescription = (
        get_prescription_or_404(
            prescription_id,
            db,
        )
    )

    if (
        prescription.doctor_id
        != current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail=(
                "Only the prescribing "
                "doctor can stop this "
                "prescription."
            ),
        )

    prescription.status = (
        "STOPPED"
    )

    prescription.is_active = (
        False
    )

    db.commit()

    return {
        "message":
            "Prescription stopped.",

        "prescription_id":
            prescription_id,
    }


# ============================================================
# LEGACY COMPATIBILITY
#
# Old FamilyDashboard / older UI may still call:
#
# POST /medications/taken
#
# Keep temporarily until every old widget is migrated.
# ============================================================


@router.post(
    "/taken"
)
def legacy_taken(
    payload: LegacyTakenRequest,

    db: Session = Depends(
        get_db
    ),

    current_user: User = Depends(
        get_current_user
    ),
):
    prescription = (
        get_prescription_or_404(
            payload.prescription_id,
            db,
        )
    )

    ensure_access(
        current_user,
        prescription.patient_id,
        db,
    )

    role = str(
        current_user.role
    ).upper()

    if role not in {
        "PATIENT",
        "FAMILY",
    }:
        raise HTTPException(
            status_code=403,
            detail=(
                "Doctors cannot record "
                "medication doses."
            ),
        )

    # --------------------------------------------------------
    # Same effective schedule used everywhere.
    # --------------------------------------------------------

    times = (
        get_effective_dose_times(
            prescription
        )
    )

    today_string = (
        date.today()
        .isoformat()
    )

    existing = (
        db.query(
            MedicationDoseLog
        )
        .filter(
            MedicationDoseLog
            .prescription_id
            == prescription.id,

            MedicationDoseLog
            .dose_date
            == today_string,

            MedicationDoseLog
            .dose_number
            == 1,
        )
        .first()
    )

    if payload.taken:
        if existing:
            existing.status = (
                "TAKEN"
            )

            existing.marked_by = (
                f"{role} • "
                f"{current_user.name}"
            )

            existing.timestamp = (
                datetime.now(
                    timezone.utc
                )
            )

        else:
            db.add(
                MedicationDoseLog(
                    prescription_id=
                        prescription.id,

                    patient_id=
                        prescription.patient_id,

                    dose_date=
                        today_string,

                    dose_number=
                        1,

                    scheduled_time=
                        times[0],

                    status=
                        "TAKEN",

                    marked_by=(
                        f"{role} • "
                        f"{current_user.name}"
                    ),

                    reason=
                        "",

                    notes=
                        "",

                    timestamp=
                        datetime.now(
                            timezone.utc
                        ),
                )
            )

    else:
        if existing:
            db.delete(
                existing
            )

    db.commit()

    return {
        "message":
            "Legacy medication status updated."
    }