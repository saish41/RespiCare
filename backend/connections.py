import random
import string

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import User, Connection, PairingCode
from auth import get_current_user, require_role


router = APIRouter(
    prefix="/connections",
    tags=["Connections"]
)


# =========================================================
# SCHEMAS
# =========================================================

class PairRequest(BaseModel):
    code: str


# =========================================================
# HELPER
# =========================================================

def generate_code():
    return "".join(
        random.choices(
            string.ascii_uppercase + string.digits,
            k=6
        )
    )


# =========================================================
# PATIENT: GENERATE PAIRING CODE
# =========================================================

@router.post("/generate-code")
def create_pairing_code(
    current_user: User = Depends(
        require_role("PATIENT")
    ),
    db: Session = Depends(get_db)
):

    # Disable previous codes
    old_codes = db.query(PairingCode).filter(
        PairingCode.patient_id == current_user.id,
        PairingCode.is_active == True
    ).all()

    for old_code in old_codes:
        old_code.is_active = False

    # Make sure generated code is unique
    while True:
        code = generate_code()

        existing = db.query(PairingCode).filter(
            PairingCode.code == code
        ).first()

        if not existing:
            break

    pairing_code = PairingCode(
        patient_id=current_user.id,
        code=code,
        is_active=True
    )

    db.add(pairing_code)
    db.commit()
    db.refresh(pairing_code)

    return {
        "message": "Pairing code generated",
        "code": pairing_code.code
    }


# =========================================================
# FAMILY / DOCTOR: CONNECT TO PATIENT
# =========================================================

@router.post("/pair")
def pair_with_patient(
    data: PairRequest,
    current_user: User = Depends(
        require_role("FAMILY", "DOCTOR")
    ),
    db: Session = Depends(get_db)
):

    code = data.code.strip().upper()

    pairing_code = db.query(PairingCode).filter(
        PairingCode.code == code,
        PairingCode.is_active == True
    ).first()

    if not pairing_code:
        raise HTTPException(
            status_code=404,
            detail="Invalid or expired pairing code"
        )

    patient = db.query(User).filter(
        User.id == pairing_code.patient_id,
        User.role == "PATIENT"
    ).first()

    if not patient:
        raise HTTPException(
            status_code=404,
            detail="Patient not found"
        )

    existing_connection = db.query(Connection).filter(
        Connection.patient_id == patient.id,
        Connection.guardian_id == current_user.id
    ).first()

    if existing_connection:
        raise HTTPException(
            status_code=409,
            detail="You are already connected to this patient"
        )

    connection = Connection(
        patient_id=patient.id,
        guardian_id=current_user.id,
        connection_type=current_user.role,
        status="ACTIVE"
    )

    db.add(connection)

    # One-time code
    pairing_code.is_active = False

    db.commit()
    db.refresh(connection)

    return {
        "message": "Successfully connected",
        "connection_id": connection.id,
        "patient": {
            "id": patient.id,
            "name": patient.name,
            "email": patient.email
        },
        "connection_type": connection.connection_type
    }


# =========================================================
# PATIENT: SEE FAMILY + DOCTORS
# =========================================================

@router.get("/my-connections")
def patient_connections(
    current_user: User = Depends(
        require_role("PATIENT")
    ),
    db: Session = Depends(get_db)
):

    connections = db.query(Connection).filter(
        Connection.patient_id == current_user.id,
        Connection.status == "ACTIVE"
    ).all()

    result = []

    for connection in connections:

        connected_user = db.query(User).filter(
            User.id == connection.guardian_id
        ).first()

        if connected_user:
            result.append({
                "connection_id": connection.id,
                "user_id": connected_user.id,
                "name": connected_user.name,
                "email": connected_user.email,
                "role": connected_user.role
            })

    return result


# =========================================================
# FAMILY / DOCTOR: SEE LINKED PATIENTS
# =========================================================

@router.get("/my-patients")
def linked_patients(
    current_user: User = Depends(
        require_role("FAMILY", "DOCTOR")
    ),
    db: Session = Depends(get_db)
):

    connections = db.query(Connection).filter(
        Connection.guardian_id == current_user.id,
        Connection.status == "ACTIVE"
    ).all()

    result = []

    for connection in connections:

        patient = db.query(User).filter(
            User.id == connection.patient_id
        ).first()

        if patient:
            result.append({
                "connection_id": connection.id,
                "patient_id": patient.id,
                "name": patient.name,
                "email": patient.email
            })

    return result


# =========================================================
# REMOVE CONNECTION
# =========================================================

@router.delete("/{connection_id}")
def remove_connection(
    connection_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    connection = db.query(Connection).filter(
        Connection.id == connection_id,
        Connection.status == "ACTIVE"
    ).first()

    if not connection:
        raise HTTPException(
            status_code=404,
            detail="Connection not found"
        )

    allowed = (
        connection.patient_id == current_user.id
        or
        connection.guardian_id == current_user.id
    )

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot remove this connection"
        )

    connection.status = "REMOVED"

    db.commit()

    return {
        "message": "Connection removed"
    }


# =========================================================
# AUTHORIZATION HELPER
# =========================================================

def can_access_patient(
    user: User,
    patient_id: int,
    db: Session
):
    """
    Central permission check used later by monitoring,
    alerts and medications.
    """

    # Patient accessing themselves
    if user.role == "PATIENT":
        return user.id == patient_id

    # Family/Doctor must have an ACTIVE connection
    connection = db.query(Connection).filter(
        Connection.patient_id == patient_id,
        Connection.guardian_id == user.id,
        Connection.status == "ACTIVE"
    ).first()

    return connection is not None