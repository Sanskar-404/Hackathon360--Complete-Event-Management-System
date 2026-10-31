from datetime import datetime, timezone
from uuid import uuid4
import csv, io
from fastapi import FastAPI, Depends, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
import qrcode
from app.core.config import settings
from app.database import Base, engine, get_db, SessionLocal
from app.models import *
from app.schemas import *
from app.security import *
from fastapi.security import OAuth2PasswordRequestForm

app = FastAPI(title=settings.app_name, version="1.0.0", description="Hackathon operations API")
app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

def log(db, actor, action, entity, entity_id, details=""):
    db.add(AuditLog(actor_id=actor.id if actor else None, action=action, entity_type=entity, entity_id=str(entity_id), details=details))

def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if not db.query(Event).first():
            db.add(Event(name="College Innovation Hackathon 2026", description="A demo event managed with HACKOS.", mode="hybrid", location="Main Auditorium", start_date="2026-11-20", end_date="2026-11-21", team_min=2, team_max=4))
            db.commit()
    finally:
        db.close()

@app.on_event("startup")
def startup():
    seed()

@app.get("/")
def root():
    return {"name": "HACKOS", "status": "running", "docs": "/docs"}

@app.get("/api/health")
def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}

@app.post("/api/auth/register")
def register(data: RegisterIn, db: Session = Depends(get_db)):
    if db.query(User).filter(func.lower(User.email) == data.email.lower()).first():
        raise HTTPException(409, "An account with this email already exists")
    user = User(name=data.name, email=data.email.lower(), password_hash=hash_password(data.password), role="participant")
    db.add(user); db.commit(); db.refresh(user)
    log(db, user, "user.registered", "user", user.id); db.commit()
    return {"access_token": create_token(user.id), "token_type": "bearer", "user": user_out(user)}

def user_out(user):
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}

@app.post("/api/auth/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(func.lower(User.email) == data.email.lower()).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password")
    return {"access_token": create_token(user.id), "token_type": "bearer", "user": user_out(user)}

@app.get("/api/auth/me")
def me(user: User = Depends(current_user)):
    return user_out(user)

@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db), user: User = Depends(current_user)):
    event_count = db.query(Event).count()
    participant_count = db.query(Registration).count()
    team_count = db.query(Team).count()
    attendance_count = db.query(Attendance).count()
    submission_count = db.query(Submission).count()
    return {"events": event_count, "participants": participant_count, "teams": team_count,
            "attendance": attendance_count, "submissions": submission_count,
            "role": user.role, "my_tasks": db.query(Task).filter(Task.assigned_to == user.id).count(), "recent_activity": [
                {"action": x.action, "entity": x.entity_type, "created_at": x.created_at.isoformat()}
                for x in db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(6).all()
            ]}

@app.get("/api/events")
def list_events(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return [event_out(e) for e in db.query(Event).order_by(Event.id.desc()).all()]

def event_out(e):
    return {"id":e.id,"name":e.name,"description":e.description,"mode":e.mode,"location":e.location,
            "start_date":e.start_date,"end_date":e.end_date,"team_min":e.team_min,"team_max":e.team_max,
            "registration_limit":e.registration_limit}

@app.post("/api/events")
def create_event(data: EventIn, db: Session = Depends(get_db), user: User = Depends(require_roles("organizer","admin"))):
    if data.team_min > data.team_max: raise HTTPException(400, "Minimum team size cannot exceed maximum")
    event = Event(**data.model_dump()); db.add(event); db.commit(); db.refresh(event)
    log(db,user,"event.created","event",event.id,event.name); db.commit()
    return event_out(event)

@app.post("/api/events/{event_id}/register")
def register_for_event(event_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role != "participant": raise HTTPException(403, "Only participant accounts can register for events")
    event = db.get(Event,event_id)
    if not event: raise HTTPException(404,"Event not found")
    existing = db.query(Registration).filter_by(event_id=event_id,user_id=user.id).first()
    if existing: return {"message":"Already registered","registration_id":existing.id,"participant_code":existing.participant_code}
    count = db.query(Registration).filter_by(event_id=event_id).count()
    if count >= event.registration_limit: raise HTTPException(409,"Registration limit reached")
    reg = Registration(event_id=event_id,user_id=user.id,participant_code="HKS-"+uuid4().hex[:10].upper())
    db.add(reg); db.commit(); db.refresh(reg)
    log(db,user,"participant.registered","registration",reg.id); db.commit()
    return {"message":"Registration successful","registration_id":reg.id,"participant_code":reg.participant_code}

@app.get("/api/participants")
def participants(db: Session = Depends(get_db), user: User = Depends(require_roles("organizer","admin","volunteer"))):
    rows = db.query(Registration,User,Event).join(User,Registration.user_id==User.id).join(Event,Registration.event_id==Event.id).all()
    return [{"registration_id":r.id,"name":u.name,"email":u.email,"role":u.role,"event":e.name,
             "event_id":e.id,"status":r.status,"participant_code":r.participant_code} for r,u,e in rows]

@app.post("/api/teams")
def create_team(data: TeamIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role != "participant": raise HTTPException(403, "Only participants can create teams")
    event = db.get(Event,data.event_id)
    if not event: raise HTTPException(404,"Event not found")
    reg = db.query(Registration).filter_by(event_id=data.event_id,user_id=user.id).first()
    if not reg: raise HTTPException(403,"Register for this event before creating a team")
    existing = db.query(TeamMember).join(Team, TeamMember.team_id == Team.id).filter(
        TeamMember.user_id == user.id, Team.event_id == data.event_id
    ).first()
    if existing: raise HTTPException(409,"You already belong to a team in this event")
    if event.team_max < 1: raise HTTPException(400, "This event has an invalid team-size limit")
    team = Team(event_id=data.event_id,name=data.name,leader_id=user.id); db.add(team); db.flush()
    db.add(TeamMember(team_id=team.id,user_id=user.id)); log(db,user,"team.created","team",team.id)
    db.commit(); db.refresh(team)
    return {"id":team.id,"name":team.name,"event_id":team.event_id,"leader_id":team.leader_id}

@app.get("/api/teams")
def teams(db: Session = Depends(get_db), user: User = Depends(current_user)):
    result=[]
    for t in db.query(Team).all():
        members=db.query(TeamMember).filter_by(team_id=t.id).all()
        leader=db.get(User,t.leader_id)
        result.append({"id":t.id,"name":t.name,"event_id":t.event_id,"leader":leader.name if leader else "",
                       "members":[user_out(db.get(User,m.user_id)) for m in members if db.get(User,m.user_id)]})
    return result



@app.post("/api/teams/{team_id}/members")
def add_team_member(team_id: int, data: dict, db: Session = Depends(get_db),
                    user: User = Depends(current_user)):
    """Team leader adds an already registered participant by email."""
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    if team.leader_id != user.id and user.role not in ("organizer", "admin"):
        raise HTTPException(403, "Only the team leader can add members")
    email = str(data.get("email", "")).strip().lower()
    if not email:
        raise HTTPException(400, "Participant email is required")
    member = db.query(User).filter(func.lower(User.email) == email).first()
    if not member or member.role != "participant":
        raise HTTPException(404, "Participant account not found")
    registration = db.query(Registration).filter_by(event_id=team.event_id, user_id=member.id).first()
    if not registration:
        raise HTTPException(400, "Participant must register for this event first")
    event = db.get(Event, team.event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    if db.query(TeamMember).filter_by(user_id=member.id).join(Team, TeamMember.team_id == Team.id).filter(Team.event_id == team.event_id).first():
        raise HTTPException(409, "Participant already belongs to a team in this event")
    count = db.query(TeamMember).filter_by(team_id=team.id).count()
    if count >= event.team_max:
        raise HTTPException(409, f"Team is full (maximum {event.team_max} members)")
    db.add(TeamMember(team_id=team.id, user_id=member.id))
    log(db, user, "team.member_added", "team", team.id, member.email)
    db.commit()
    return {"message": f"{member.name} added to {team.name}", "member": user_out(member)}

@app.get("/api/teams/mine")
def my_teams(db: Session = Depends(get_db), user: User = Depends(current_user)):
    memberships = db.query(TeamMember).filter_by(user_id=user.id).all()
    result = []
    for membership in memberships:
        team = db.get(Team, membership.team_id)
        if not team:
            continue
        event = db.get(Event, team.event_id)
        members = db.query(TeamMember).filter_by(team_id=team.id).all()
        result.append({
            "id": team.id, "name": team.name, "event_id": team.event_id,
            "event": event.name if event else "", "leader_id": team.leader_id,
            "leader": (db.get(User, team.leader_id).name if db.get(User, team.leader_id) else ""),
            "members": [user_out(db.get(User, m.user_id)) for m in members if db.get(User, m.user_id)]
        })
    return result

@app.post("/api/attendance/sync")
def sync_attendance(items: list[CheckinIn], db: Session = Depends(get_db),
                    user: User = Depends(require_roles("organizer", "admin", "volunteer"))):
    """Idempotently process check-ins queued while a device was offline."""
    results = []
    for item in items[:500]:
        reg = db.query(Registration).filter_by(
            event_id=item.event_id, participant_code=item.participant_code
        ).first()
        if not reg:
            results.append({"sync_id": item.sync_id, "status": "not_found"})
            continue
        existing = db.query(Attendance).filter_by(event_id=item.event_id, user_id=reg.user_id).first()
        if existing:
            results.append({"sync_id": item.sync_id, "status": "already_checked_in"})
            continue
        record = Attendance(event_id=item.event_id, user_id=reg.user_id,
                            source="offline_sync", sync_id=item.sync_id)
        db.add(record)
        db.flush()
        log(db, user, "attendance.synced", "attendance", record.id, item.sync_id or "")
        results.append({"sync_id": item.sync_id, "status": "checked_in"})
    db.commit()
    return {"processed": len(results), "results": results}

@app.post("/api/attendance/checkin")
def checkin(data: CheckinIn, db: Session = Depends(get_db), user: User = Depends(require_roles("organizer","admin","volunteer"))):
    reg=db.query(Registration).filter_by(event_id=data.event_id,participant_code=data.participant_code).first()
    if not reg: raise HTTPException(404,"Participant code not found for this event")
    existing=db.query(Attendance).filter_by(event_id=data.event_id,user_id=reg.user_id).first()
    if existing: return {"status":"already_checked_in","checked_in_at":existing.checked_in_at.isoformat()}
    record=Attendance(event_id=data.event_id,user_id=reg.user_id,source=data.source,sync_id=data.sync_id)
    db.add(record); db.flush(); log(db,user,"attendance.checked_in","attendance",record.id,data.source); db.commit()
    return {"status":"checked_in","checked_in_at":record.checked_in_at.isoformat()}

@app.get("/api/attendance")
def attendance(db: Session = Depends(get_db), user: User = Depends(require_roles("organizer","admin","volunteer"))):
    rows=db.query(Attendance,User,Event).join(User,Attendance.user_id==User.id).join(Event,Attendance.event_id==Event.id).all()
    return [{"id":a.id,"participant":u.name,"email":u.email,"event":e.name,"source":a.source,"checked_in_at":a.checked_in_at.isoformat()} for a,u,e in rows]

@app.post("/api/announcements")
def create_announcement(data: AnnouncementIn, db: Session = Depends(get_db), user: User = Depends(require_roles("organizer","admin"))):
    obj=Announcement(**data.model_dump()); db.add(obj); db.flush(); log(db,user,"announcement.created","announcement",obj.id); db.commit()
    return {"id":obj.id,"title":obj.title,"message":obj.message,"created_at":obj.created_at.isoformat()}

@app.get("/api/announcements")
def announcements(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return [{"id":x.id,"event_id":x.event_id,"title":x.title,"message":x.message,"created_at":x.created_at.isoformat()} for x in db.query(Announcement).order_by(Announcement.created_at.desc()).all()]

@app.post("/api/schedule")
def create_schedule(data: ScheduleIn, db: Session = Depends(get_db), user: User = Depends(require_roles("organizer","admin"))):
    obj=ScheduleItem(**data.model_dump()); db.add(obj); db.flush(); log(db,user,"schedule.created","schedule",obj.id); db.commit()
    return {"id":obj.id,**data.model_dump()}

@app.get("/api/schedule")
def schedule(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return [{"id":x.id,"event_id":x.event_id,"title":x.title,"starts_at":x.starts_at,"ends_at":x.ends_at,"venue":x.venue} for x in db.query(ScheduleItem).order_by(ScheduleItem.starts_at).all()]

@app.post("/api/submissions")
def submit(data: SubmissionIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role != "participant": raise HTTPException(403, "Only participants can submit projects")
    team=db.get(Team,data.team_id)
    if not team or team.event_id != data.event_id: raise HTTPException(404,"Team not found for event")
    if team.leader_id != user.id and user.role not in ("organizer","admin"): raise HTTPException(403,"Only team leader can submit")
    obj=Submission(**data.model_dump()); db.add(obj); db.flush(); log(db,user,"submission.created","submission",obj.id); db.commit()
    return {"id":obj.id,"title":obj.title,"submitted_at":obj.submitted_at.isoformat(),"version":obj.version}

@app.get("/api/submissions")
def submissions(db: Session = Depends(get_db), user: User = Depends(current_user)):
    query = db.query(Submission, Team).join(Team, Submission.team_id == Team.id)
    if user.role == "participant":
        team_ids = [m.team_id for m in db.query(TeamMember).filter_by(user_id=user.id).all()]
        query = query.filter(Submission.team_id.in_(team_ids)) if team_ids else query.filter(Submission.id == -1)
    rows = query.all()
    return [{"id":s.id,"event_id":s.event_id,"team":t.name,"team_id":t.id,"title":s.title,"description":s.description,
             "repo_url":s.repo_url,"demo_url":s.demo_url,"submitted_at":s.submitted_at.isoformat()} for s,t in rows]

@app.post("/api/judging/scores")
def save_score(data: ScoreIn, db: Session = Depends(get_db), user: User = Depends(require_roles("judge","organizer","admin"))):
    sub=db.get(Submission,data.submission_id)
    if not sub: raise HTTPException(404,"Submission not found")
    score=db.query(Score).filter_by(submission_id=data.submission_id,judge_id=user.id).first()
    before = "new" if not score else f"previous total={score.innovation+score.implementation+score.impact+score.ux}"
    if not score: score=Score(submission_id=data.submission_id,judge_id=user.id); db.add(score)
    for k,v in data.model_dump(exclude={"submission_id"}).items(): setattr(score,k,v)
    score.updated_at=datetime.now(timezone.utc); db.flush()
    log(db,user,"score.saved","score",score.id,before); db.commit()
    return {"id":score.id,"total":score.innovation+score.implementation+score.impact+score.ux}

@app.get("/api/results")
def results(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows=db.query(Submission,Team).join(Team,Submission.team_id==Team.id).all()
    out=[]
    for s,t in rows:
        scores=db.query(Score).filter_by(submission_id=s.id).all()
        vals=[x.innovation+x.implementation+x.impact+x.ux for x in scores]
        out.append({"submission_id":s.id,"team":t.name,"project":s.title,"judges":len(vals),
                    "average_score":round(sum(vals)/len(vals),2) if vals else 0})
    return sorted(out,key=lambda x:x["average_score"],reverse=True)

@app.get("/api/audit")
def audit(db: Session = Depends(get_db), user: User = Depends(require_roles("organizer","admin"))):
    rows=db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(250).all()
    return [{"id":x.id,"actor_id":x.actor_id,"action":x.action,"entity_type":x.entity_type,"entity_id":x.entity_id,
             "details":x.details,"created_at":x.created_at.isoformat()} for x in rows]

@app.get("/api/reports/participants.csv")
def export_participants(db: Session = Depends(get_db), user: User = Depends(require_roles("organizer","admin"))):
    rows=db.query(Registration,User,Event).join(User,Registration.user_id==User.id).join(Event,Registration.event_id==Event.id).all()
    buf=io.StringIO(); w=csv.writer(buf); w.writerow(["Name","Email","Event","Status","Participant Code"])
    for r,u,e in rows: w.writerow([u.name,u.email,e.name,r.status,r.participant_code])
    return StreamingResponse(iter([buf.getvalue()]),media_type="text/csv",headers={"Content-Disposition":"attachment; filename=hackos_participants.csv"})



# ---- Account setup and role-based workspaces --------------------------------

@app.post("/api/auth/bootstrap-organizer")
def bootstrap_organizer(data: BootstrapOrganizerIn, db: Session = Depends(get_db)):
    """Create the first organizer account. This endpoint closes permanently after setup."""
    if settings.bootstrap_key.startswith("CHANGE-THIS-"):
        raise HTTPException(503, "Set HACKOS_BOOTSTRAP_KEY in backend/.env before creating the first organizer")
    if data.bootstrap_key != settings.bootstrap_key:
        raise HTTPException(403, "Invalid organizer setup key")
    if db.query(User).filter(User.role.in_(["organizer", "admin"])).first():
        raise HTTPException(409, "An organizer account has already been created")
    if db.query(User).filter(func.lower(User.email) == data.email.lower()).first():
        raise HTTPException(409, "An account with this email already exists")
    user = User(name=data.name, email=data.email.lower(), password_hash=hash_password(data.password), role="organizer")
    db.add(user); db.commit(); db.refresh(user)
    log(db, user, "organizer.bootstrap_completed", "user", user.id); db.commit()
    return {"access_token": create_token(user.id), "token_type": "bearer", "user": user_out(user)}

@app.post("/api/staff")
def create_staff(data: StaffCreateIn, db: Session = Depends(get_db),
                 user: User = Depends(require_roles("organizer", "admin"))):
    allowed = {"judge", "mentor", "volunteer"}
    if data.role not in allowed:
        raise HTTPException(400, "Staff role must be judge, mentor, or volunteer")
    if db.query(User).filter(func.lower(User.email) == data.email.lower()).first():
        raise HTTPException(409, "An account with this email already exists")
    member = User(name=data.name, email=data.email.lower(), password_hash=hash_password(data.password), role=data.role)
    db.add(member); db.commit(); db.refresh(member)
    log(db, user, "staff.account_created", "user", member.id, data.role); db.commit()
    return user_out(member)

@app.get("/api/staff")
def list_staff(db: Session = Depends(get_db), user: User = Depends(require_roles("organizer", "admin"))):
    rows = db.query(User).filter(User.role.in_(["organizer", "admin", "judge", "mentor", "volunteer"])).order_by(User.name).all()
    return [user_out(x) for x in rows]

@app.get("/api/tasks")
def list_tasks(db: Session = Depends(get_db), user: User = Depends(current_user)):
    query = db.query(Task)
    if user.role not in ("organizer", "admin"):
        query = query.filter(Task.assigned_to == user.id)
    rows = query.order_by(Task.created_at.desc()).all()
    return [{
        "id": x.id, "title": x.title, "description": x.description,
        "assigned_to": x.assigned_to,
        "assignee": db.get(User, x.assigned_to).name if db.get(User, x.assigned_to) else "Unknown",
        "assigned_by": x.assigned_by, "status": x.status, "due_date": x.due_date,
        "created_at": x.created_at.isoformat()
    } for x in rows]

@app.post("/api/tasks")
def create_task(data: TaskIn, db: Session = Depends(get_db),
                user: User = Depends(require_roles("organizer", "admin"))):
    assignee = db.get(User, data.assigned_to)
    if not assignee or assignee.role not in ("judge", "mentor", "volunteer", "participant"):
        raise HTTPException(400, "Choose a valid HACKOS account to assign this task")
    task = Task(title=data.title, description=data.description, assigned_to=assignee.id,
                assigned_by=user.id, due_date=data.due_date, status="todo")
    db.add(task); db.flush()
    log(db, user, "task.assigned", "task", task.id, f"assigned to {assignee.email}")
    db.commit(); db.refresh(task)
    return {"id": task.id, "title": task.title, "description": task.description,
            "assigned_to": task.assigned_to, "assignee": assignee.name,
            "status": task.status, "due_date": task.due_date}

@app.patch("/api/tasks/{task_id}")
def update_task(task_id: int, data: TaskStatusIn, db: Session = Depends(get_db),
                user: User = Depends(current_user)):
    if data.status not in ("todo", "in_progress", "done"):
        raise HTTPException(400, "Status must be todo, in_progress, or done")
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if user.role not in ("organizer", "admin") and task.assigned_to != user.id:
        raise HTTPException(403, "You can only update tasks assigned to your account")
    task.status = data.status
    log(db, user, "task.status_updated", "task", task.id, data.status)
    db.commit()
    return {"id": task.id, "status": task.status}

@app.get("/api/mentor/teams")
def mentor_teams(db: Session = Depends(get_db), user: User = Depends(require_roles("mentor"))):
    rows = db.query(Team, Event, User).join(Event, Team.event_id == Event.id).join(User, Team.leader_id == User.id).all()
    result = []
    for team, event, leader in rows:
        projects = db.query(Submission).filter_by(team_id=team.id).all()
        result.append({
            "id": team.id, "team": team.name, "event": event.name,
            "leader": leader.name, "leader_email": leader.email,
            "projects": [{"title": p.title, "description": p.description, "repo_url": p.repo_url,
                          "demo_url": p.demo_url, "submitted_at": p.submitted_at.isoformat()} for p in projects]
        })
    return result


@app.get("/api/participants/{event_id}/my-pass")
def my_pass(event_id:int, db:Session=Depends(get_db), user:User=Depends(current_user)):
    reg=db.query(Registration).filter_by(event_id=event_id,user_id=user.id).first()
    if not reg: raise HTTPException(404,"You are not registered for this event")
    return {"participant_code":reg.participant_code,"event_id":event_id,"participant":user.name}

@app.get("/api/participants/{event_id}/my-pass.png")
def my_pass_png(event_id:int, db:Session=Depends(get_db), user:User=Depends(current_user)):
    reg=db.query(Registration).filter_by(event_id=event_id,user_id=user.id).first()
    if not reg: raise HTTPException(404,"You are not registered for this event")
    img=qrcode.make(reg.participant_code); b=io.BytesIO(); img.save(b,format="PNG")
    return Response(content=b.getvalue(),media_type="image/png")
