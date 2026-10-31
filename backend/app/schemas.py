from pydantic import BaseModel, EmailStr, Field, HttpUrl
from typing import Optional

class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class EventIn(BaseModel):
    name: str = Field(min_length=3, max_length=180)
    description: str = ""
    mode: str = "offline"
    location: str = ""
    start_date: str = ""
    end_date: str = ""
    team_min: int = Field(default=2, ge=1, le=20)
    team_max: int = Field(default=4, ge=1, le=20)
    registration_limit: int = Field(default=200, ge=1, le=10000)

class TeamIn(BaseModel):
    event_id: int
    name: str = Field(min_length=2, max_length=120)

class AnnouncementIn(BaseModel):
    event_id: int
    title: str
    message: str

class ScheduleIn(BaseModel):
    event_id: int
    title: str
    starts_at: str
    ends_at: str = ""
    venue: str = ""

class SubmissionIn(BaseModel):
    event_id: int
    team_id: int
    title: str
    description: str = ""
    repo_url: str = ""
    demo_url: str = ""

class ScoreIn(BaseModel):
    submission_id: int
    innovation: float = Field(ge=0, le=20)
    implementation: float = Field(ge=0, le=30)
    impact: float = Field(ge=0, le=25)
    ux: float = Field(ge=0, le=25)
    comments: str = ""

class CheckinIn(BaseModel):
    event_id: int
    participant_code: str
    sync_id: Optional[str] = None
    source: str = "online"


class BootstrapOrganizerIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=10, max_length=72)
    bootstrap_key: str = Field(min_length=12, max_length=200)

class StaffCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=10, max_length=72)
    role: str

class TaskIn(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    description: str = ""
    assigned_to: int
    due_date: str = ""

class TaskStatusIn(BaseModel):
    status: str
