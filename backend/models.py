from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)

from database import Base


def utc_now():
    return datetime.now(timezone.utc)


# =========================================================
# USER
# =========================================================

class User(Base):
    __tablename__ = "users"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    name = Column(
        String,
        nullable=False,
    )

    email = Column(
        String,
        unique=True,
        index=True,
        nullable=False,
    )

    password_hash = Column(
        String,
        nullable=False,
    )

    role = Column(
        String,
        nullable=False,
    )

    is_active = Column(
        Boolean,
        default=True,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=utc_now,
        nullable=False,
    )


# =========================================================
# CONNECTION
# =========================================================

class Connection(Base):
    __tablename__ = "connections"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    patient_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    guardian_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    connection_type = Column(
        String,
        nullable=False,
    )

    status = Column(
        String,
        default="ACTIVE",
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=utc_now,
        nullable=False,
    )


# =========================================================
# PAIRING CODE
# =========================================================

class PairingCode(Base):
    __tablename__ = "pairing_codes"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    patient_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    code = Column(
        String,
        unique=True,
        index=True,
        nullable=False,
    )

    is_active = Column(
        Boolean,
        default=True,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=utc_now,
        nullable=False,
    )


# =========================================================
# DEVICE
# =========================================================

class Device(Base):
    __tablename__ = "devices"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    patient_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    device_code = Column(
        String,
        unique=True,
        index=True,
        nullable=False,
    )

    name = Column(
        String,
        nullable=False,
    )

    is_online = Column(
        Boolean,
        default=False,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=utc_now,
        nullable=False,
    )


# =========================================================
# RESPIRATORY READING
# =========================================================

class RespiratoryReading(Base):
    __tablename__ = "respiratory_readings"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    patient_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    respiratory_rate = Column(
        Float,
        nullable=True,
    )

    signal_quality = Column(
        String,
        default="UNKNOWN",
        nullable=False,
    )

    pattern = Column(
        String,
        default="UNKNOWN",
        nullable=False,
    )

    confidence = Column(
        Float,
        nullable=True,
    )

    source = Column(
        String,
        default="LIVE",
        nullable=False,
    )

    timestamp = Column(
        DateTime,
        default=utc_now,
        nullable=False,
        index=True,
    )


# =========================================================
# RESPIRATORY EVENT HISTORY
# =========================================================

class RespiratoryEvent(Base):
    __tablename__ = "respiratory_events"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    patient_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    event_type = Column(
        String,
        nullable=False,
    )

    highest_state = Column(
        String,
        default="WATCH",
        nullable=False,
    )

    source = Column(
        String,
        default="LIVE",
        nullable=False,
    )

    started_at = Column(
        DateTime,
        default=utc_now,
        nullable=False,
        index=True,
    )

    ended_at = Column(
        DateTime,
        nullable=True,
    )

    baseline_rate = Column(
        Float,
        nullable=True,
    )

    starting_rate = Column(
        Float,
        nullable=True,
    )

    minimum_rate = Column(
        Float,
        nullable=True,
    )

    maximum_rate = Column(
        Float,
        nullable=True,
    )

    maximum_deviation_percent = Column(
        Float,
        nullable=True,
    )

    signal_quality = Column(
        String,
        nullable=True,
    )

    progression = Column(
        String,
        default="WATCH",
        nullable=False,
    )

    alert_generated = Column(
        Boolean,
        default=False,
        nullable=False,
    )

    status = Column(
        String,
        default="OPEN",
        nullable=False,
    )


# =========================================================
# ALERT
# =========================================================

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    patient_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    alert_type = Column(
        String,
        nullable=False,
    )

    severity = Column(
        String,
        nullable=False,
    )

    message = Column(
        Text,
        nullable=False,
    )

    acknowledged = Column(
        Boolean,
        default=False,
        nullable=False,
    )

    acknowledged_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )

    created_at = Column(
        DateTime,
        default=utc_now,
        nullable=False,
        index=True,
    )


# =========================================================
# PRESCRIPTION
# =========================================================

class Prescription(Base):
    __tablename__ = "prescriptions"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    patient_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    doctor_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    medicine_name = Column(
        String,
        nullable=False,
    )

    dosage = Column(
        String,
        nullable=False,
    )

    medicine_form = Column(
        String,
        default="Tablet",
        nullable=False,
    )

    schedule = Column(
        String,
        nullable=False,
    )

    doses_per_day = Column(
        Integer,
        default=1,
        nullable=False,
    )

    dose_times = Column(
        String,
        nullable=True,
    )

    food_instruction = Column(
        String,
        default="No preference",
        nullable=False,
    )

    instructions = Column(
        Text,
        default="",
        nullable=False,
    )

    start_date = Column(
        String,
        nullable=True,
    )

    duration_days = Column(
        Integer,
        nullable=True,
    )

    status = Column(
        String,
        default="ACTIVE",
        nullable=False,
    )

    is_active = Column(
        Boolean,
        default=True,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=utc_now,
        nullable=False,
    )


# =========================================================
# INDIVIDUAL MEDICATION DOSE LOG
# =========================================================

class MedicationDoseLog(Base):
    __tablename__ = "medication_dose_logs"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    prescription_id = Column(
        Integer,
        ForeignKey("prescriptions.id"),
        nullable=False,
        index=True,
    )

    patient_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    dose_date = Column(
        String,
        nullable=False,
        index=True,
    )

    dose_number = Column(
        Integer,
        nullable=False,
    )

    scheduled_time = Column(
        String,
        nullable=True,
    )

    status = Column(
        String,
        nullable=False,
    )

    marked_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    reason = Column(
        String,
        nullable=True,
    )

    notes = Column(
        Text,
        nullable=True,
    )

    timestamp = Column(
        DateTime,
        default=utc_now,
        nullable=False,
    )


# =========================================================
# OLD MEDICATION LOG
#
# Kept only so imports elsewhere do not suddenly break.
# New medication system uses MedicationDoseLog.
# =========================================================

class MedicationLog(Base):
    __tablename__ = "medication_logs"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    prescription_id = Column(
        Integer,
        ForeignKey("prescriptions.id"),
        nullable=False,
    )

    patient_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    taken = Column(
        Boolean,
        default=False,
        nullable=False,
    )

    marked_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    timestamp = Column(
        DateTime,
        default=utc_now,
        nullable=False,
    )