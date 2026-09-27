from datetime import datetime, timedelta, timezone
import os

import bcrypt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import (
    UserRegister,
    UserLogin,
    UserResponse,
    LoginResponse,
)


# =========================================================
# ENVIRONMENT CONFIG
# =========================================================

load_dotenv()

SECRET_KEY = os.getenv(
    "SECRET_KEY",
    "respicare-development-secret-key"
)

ALGORITHM = os.getenv(
    "ALGORITHM",
    "HS256"
)

ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv(
        "ACCESS_TOKEN_EXPIRE_MINUTES",
        "1440"
    )
)


# =========================================================
# ROUTER
# =========================================================

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)


# =========================================================
# BEARER AUTHENTICATION
# =========================================================

bearer_scheme = HTTPBearer()


# =========================================================
# PASSWORD FUNCTIONS
# =========================================================

def hash_password(password: str) -> str:
    """
    Hash password using bcrypt before storing it.
    """

    password_bytes = password.encode("utf-8")

    hashed_password = bcrypt.hashpw(
        password_bytes,
        bcrypt.gensalt()
    )

    return hashed_password.decode("utf-8")


def verify_password(
    plain_password: str,
    hashed_password: str
) -> bool:
    """
    Compare entered password against stored bcrypt hash.
    """

    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )

    except (ValueError, TypeError):
        return False


# =========================================================
# CREATE JWT
# =========================================================

def create_access_token(user: User) -> str:

    expiration = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(user.id),
        "role": user.role,
        "exp": expiration
    }

    return jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM
    )


# =========================================================
# GET CURRENT LOGGED-IN USER
# =========================================================

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(
        bearer_scheme
    ),
    db: Session = Depends(get_db)
) -> User:

    authentication_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token"
    )

    token = credentials.credentials

    try:

        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        user_id = payload.get("sub")

        if user_id is None:
            raise authentication_error

        user_id = int(user_id)

    except (JWTError, ValueError):

        raise authentication_error

    user = db.query(User).filter(
        User.id == user_id
    ).first()

    if user is None:
        raise authentication_error

    if not user.is_active:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )

    return user


# =========================================================
# ROLE PROTECTION
# =========================================================

def require_role(*allowed_roles):
    """
    Protect routes based on user role.

    Examples:

    Depends(require_role("PATIENT"))

    Depends(require_role("FAMILY", "DOCTOR"))
    """

    def role_checker(
        current_user: User = Depends(get_current_user)
    ) -> User:

        if current_user.role not in allowed_roles:

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource"
            )

        return current_user

    return role_checker


# =========================================================
# REGISTER
# =========================================================

@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED
)
def register(
    data: UserRegister,
    db: Session = Depends(get_db)
):

    name = data.name.strip()
    email = data.email.lower().strip()

    # -----------------------------------------------------
    # Validate name
    # -----------------------------------------------------

    if len(name) < 2:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please enter a valid name"
        )

    # -----------------------------------------------------
    # Validate password
    # -----------------------------------------------------

    if len(data.password) < 6:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least 6 characters"
        )

    # bcrypt supports passwords up to 72 bytes
    if len(data.password.encode("utf-8")) > 72:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is too long"
        )

    # -----------------------------------------------------
    # Duplicate email check
    # -----------------------------------------------------

    existing_user = db.query(User).filter(
        User.email == email
    ).first()

    if existing_user:

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists"
        )

    # -----------------------------------------------------
    # Create account
    # -----------------------------------------------------

    new_user = User(
        name=name,
        email=email,
        password_hash=hash_password(
            data.password
        ),
        role=data.role,
        is_active=True
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user


# =========================================================
# LOGIN
# =========================================================

@router.post(
    "/login",
    response_model=LoginResponse
)
def login(
    data: UserLogin,
    db: Session = Depends(get_db)
):

    email = data.email.lower().strip()

    user = db.query(User).filter(
        User.email == email
    ).first()

    # -----------------------------------------------------
    # User does not exist
    # -----------------------------------------------------

    if user is None:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    # -----------------------------------------------------
    # Password check
    # -----------------------------------------------------

    if not verify_password(
        data.password,
        user.password_hash
    ):

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    # -----------------------------------------------------
    # Account status
    # -----------------------------------------------------

    if not user.is_active:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )

    # -----------------------------------------------------
    # Create JWT
    # -----------------------------------------------------

    access_token = create_access_token(
        user
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


# =========================================================
# CURRENT USER
# =========================================================

@router.get(
    "/me",
    response_model=UserResponse
)
def get_me(
    current_user: User = Depends(
        get_current_user
    )
):

    return current_user