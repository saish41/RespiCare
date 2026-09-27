from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Literal


# =========================================================
# AUTHENTICATION
# =========================================================

class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Literal["PATIENT", "FAMILY", "DOCTOR"]


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


# =========================================================
# HEALTH
# =========================================================

class HealthResponse(BaseModel):
    status: str
    app: str
    version: str