import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, post, patch, token } from './api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const ROLE_COPY = {
  organizer: 'Command center for your event: people, operations, staff and delivery.',
  judge: 'Review project submissions, apply the rubric and publish fair evaluations.',
  mentor: 'Support teams, review progress and complete your assigned mentoring tasks.',
  participant: 'Build your team, manage your project and stay on top of event updates.',
  volunteer: 'Keep check-in, participant support and event-day operations moving.'
};

const NAV = {
  organizer: ['Overview', 'Events', 'Participants', 'Teams', 'Attendance', 'Announcements', 'Schedule', 'Submissions', 'Judging', 'Leaderboard', 'Staff & Tasks', 'Audit Logs'],
  judge: ['Overview', 'Submissions', 'Judging', 'Leaderboard', 'Announcements', 'Schedule'],
  mentor: ['Overview', 'My Tasks', 'My Teams', 'Submissions', 'Announcements', 'Schedule'],
  participant: ['Overview', 'Events', 'My Team', 'My Submissions', 'Announcements', 'Schedule', 'Results'],
  volunteer: ['Overview', 'Participants', 'Attendance', 'Announcements', 'Schedule']
};

const TITLES = {
  organizer: 'Event control center',
  judge: 'Evaluation workspace',
  mentor: 'Mentor workspace',
  participant: 'Builder workspace',
  volunteer: 'Event operations'
};

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Table({ rows = [], columns = [], empty = 'Nothing here yet.' }) {
  if (!rows?.length) return <div className="empty-state">{empty}</div>;
  return <div className="table-wrap"><table><thead><tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead>
    <tbody>{rows.map((row, i) => <tr key={row.id ?? row.registration_id ?? i}>
      {columns.map(c => <td key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? '—')}</td>)}
    </tr>)}</tbody></table></div>;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('Overview');
  const [authMode, setAuthMode] = useState('login');
  const [auth, setAuth] = useState({ name: '', email: '', password: '', bootstrap_key: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);
  const [overview, setOverview] = useState({});
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState({});
  const [offline, setOffline] = useState(!navigator.onLine);
  const [passImage, setPassImage] = useState('');

  const role = user?.role || 'participant';
  const nav = NAV[role] || NAV.participant;

  useEffect(() => {
    const on = () => setOffline(!navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);

  useEffect(() => {
    if (!token()) return;
    api('/api/auth/me').then(setUser).catch(() => localStorage.removeItem('hackos_token'));
  }, []);

  useEffect(() => {
    const syncQueued = async () => {
      if (!navigator.onLine || !token()) return;
      const queued = JSON.parse(localStorage.getItem('hackos_attendance_queue') || '[]');
      if (!queued.length) return;
      try {
        const result = await post('/api/attendance/sync', queued);
        const completed = new Set((result.results || []).map(x => x.sync_id));
        const remaining = queued.filter(x => !completed.has(x.sync_id));
        localStorage.setItem('hackos_attendance_queue', JSON.stringify(remaining));
        setNotice(`Offline attendance sync complete: ${result.processed} record(s) processed.`);
      } catch (e) { setError(`Attendance is saved on this device and will sync later. ${e.message}`); }
    };
    window.addEventListener('online', syncQueued);
    syncQueued();
    return () => window.removeEventListener('online', syncQueued);
  }, [user]);

  useEffect(() => {
    if (user) loadPage();
  }, [user, page]);

  useEffect(() => {
    let objectUrl = '';
    const eventId = Number(form.pass_event_id);
    if (user?.role === 'participant' && eventId > 0) {
      fetch(`${API_BASE}/api/participants/${eventId}/my-pass.png`, {
        headers: { Authorization: `Bearer ${token()}` }
      }).then(response => {
        if (!response.ok) throw new Error('Register for this event before viewing your pass.');
        return response.blob();
      }).then(blob => {
        objectUrl = URL.createObjectURL(blob);
        setPassImage(objectUrl);
      }).catch(() => setPassImage(''));
    } else setPassImage('');
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [user, form.pass_event_id]);

  async function loadPage() {
    if (!user) return;
    setBusy(true); setError('');
    try {
      if (page === 'Overview') {
        const [dash, myTasks] = await Promise.all([api('/api/dashboard'), api('/api/tasks')]);
        setOverview(dash); setTasks(myTasks);
        return;
      }
      const paths = {
        'Events': '/api/events',
        'Participants': '/api/participants',
        'Teams': '/api/teams',
        'My Team': '/api/teams/mine',
        'Attendance': '/api/attendance',
        'Announcements': '/api/announcements',
        'Schedule': '/api/schedule',
        'Submissions': '/api/submissions',
        'My Submissions': '/api/submissions',
        'Judging': '/api/submissions',
        'Leaderboard': '/api/results',
        'Results': '/api/results',
        'Audit Logs': '/api/audit',
        'Staff & Tasks': '/api/tasks',
        'My Tasks': '/api/tasks',
        'My Teams': '/api/mentor/teams'
      };
      const result = await api(paths[page] || '/api/dashboard');
      setRows(result);
      if (page === 'Events') setEvents(result);
      if (page === 'Staff & Tasks') {
        const people = await api('/api/staff');
        setStaff(people);
      }
    } catch (e) {
      setError(e.message);
      setRows([]);
    } finally {
      setBusy(false);
    }
  }

  async function submitAuth(e) {
    e.preventDefault(); setError(''); setNotice(''); setBusy(true);
    try {
      let result;
      if (authMode === 'login') {
        result = await post('/api/auth/login', { email: auth.email, password: auth.password });
      } else if (authMode === 'register') {
        result = await post('/api/auth/register', { name: auth.name, email: auth.email, password: auth.password });
      } else {
        result = await post('/api/auth/bootstrap-organizer', {
          name: auth.name, email: auth.email, password: auth.password, bootstrap_key: auth.bootstrap_key
        });
      }
      localStorage.setItem('hackos_token', result.access_token);
      setUser(result.user); setPage('Overview');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  function signOut() {
    localStorage.removeItem('hackos_token');
    setUser(null); setRows([]); setOverview({}); setTasks([]);
    setAuthMode('login'); setAuth({ name: '', email: '', password: '', bootstrap_key: '' });
  }

  async function runAction(fn, success) {
    setError(''); setNotice('');
    try {
      await fn();
      setNotice(success || 'Saved successfully.');
      await loadPage();
    } catch (e) { setError(e.message); }
  }

  async function registerForEvent(eventId) {
    await runAction(() => post(`/api/events/${eventId}/register`, {}), 'You are registered for this event.');
  }

  async function submitCheckin(eventId, participantCode) {
    const payload = { event_id: Number(eventId), participant_code: participantCode.trim(), source: 'online' };
    try {
      await post('/api/attendance/checkin', payload);
      setNotice('Participant checked in successfully.');
      setForm({});
      await loadPage();
    } catch (e) {
      if (!navigator.onLine || /fetch|network|failed to fetch/i.test(e.message)) {
        const queue = JSON.parse(localStorage.getItem('hackos_attendance_queue') || '[]');
        const syncId = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);
        queue.push({ ...payload, source: 'offline', sync_id: syncId });
        localStorage.setItem('hackos_attendance_queue', JSON.stringify(queue));
        setNotice(`Saved offline on this device. ${queue.length} check-in(s) waiting to sync.`);
      } else setError(e.message);
    }
  }

  async function updateTask(id, status) {
    await runAction(() => patch(`/api/tasks/${id}`, { status }), 'Task status updated.');
  }

  if (!user) {
    return <main className="auth-screen">
      <div className="auth-visual">
        <div className="brand"><span className="brand-icon">H</span><span>HACKOS<small>HACKATHON OPERATIONS SYSTEM</small></span></div>
        <div className="auth-hero">
          <div className="kicker"><i/> BUILD · COLLABORATE · SHIP</div>
          <h1>Make the next<br/><em>big thing</em> happen.</h1>
          <p>One connected command center for organizers, judges, mentors, participants and volunteers.</p>
          <div className="hero-tags"><span>01 / ORGANIZE</span><span>02 / CREATE</span><span>03 / EVALUATE</span></div>
        </div>
        <div className="auth-foot">DESIGNED FOR THE ENERGY OF HACKATHONS <b>✳</b></div>
      </div>
      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="mobile-brand brand"><span className="brand-icon">H</span><span>HACKOS<small>OPERATIONS SYSTEM</small></span></div>
          <div className="eyebrow">YOUR HACKATHON STARTS HERE</div>
          <h2>{authMode === 'login' ? 'Welcome back.' : authMode === 'register' ? 'Join the build.' : 'Create your control room.'}</h2>
          <p className="subtext">{authMode === 'login' ? 'Sign in to continue to your role-based workspace.' : authMode === 'register' ? 'Create a participant account to register for events.' : 'One-time setup for the first event organizer account.'}</p>
          <div className="auth-tabs">
            <button className={authMode === 'login' ? 'selected' : ''} onClick={() => {setAuthMode('login');setError('');}}>Sign in</button>
            <button className={authMode === 'register' ? 'selected' : ''} onClick={() => {setAuthMode('register');setError('');}}>Create account</button>
          </div>
          <form onSubmit={submitAuth} className="auth-form">
            {authMode !== 'login' && <Field label="Full name"><input required minLength="2" value={auth.name} onChange={e => setAuth({...auth, name:e.target.value})} placeholder="Your name"/></Field>}
            <Field label="Email address"><input required type="email" autoComplete="email" value={auth.email} onChange={e => setAuth({...auth, email:e.target.value})} placeholder="you@example.com"/></Field>
            <Field label="Password"><input required type="password" minLength={authMode === 'login' ? 1 : 10} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} value={auth.password} onChange={e => setAuth({...auth, password:e.target.value})} placeholder={authMode === 'login' ? 'Enter your password' : 'At least 10 characters'}/></Field>
            {authMode === 'bootstrap' && <Field label="Organizer setup key"><input required type="password" value={auth.bootstrap_key} onChange={e => setAuth({...auth, bootstrap_key:e.target.value})} placeholder="Key configured in backend/.env"/></Field>}
            <button className="btn-primary auth-submit" disabled={busy}>{busy ? 'Please wait…' : authMode === 'login' ? 'Enter workspace  →' : authMode === 'register' ? 'Create participant account  →' : 'Create organizer account  →'}</button>
          </form>
          {authMode === 'login' && <button className="text-link" onClick={() => {setAuthMode('bootstrap');setError('');}}>First-time organizer setup</button>}
          {error && <div className="alert error-alert">{error}</div>}
          <div className="auth-note"><b>SECURE ROLE ACCESS</b><br/>Participant accounts are self-created. Organizer assigns judge, mentor and volunteer access.</div>
          <div className="auth-bottom">HACKOS <span>✳</span> EVENT OPERATIONS, REIMAGINED</div>
        </div>
      </section>
    </main>;
  }

  const title = TITLES[role] || 'HACKOS workspace';
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand side-brand"><span className="brand-icon">H</span><span>HACKOS<small>OPERATIONS SYSTEM</small></span></div>
      <div className="event-chip"><span className="pulse"/> LIVE WORKSPACE <b>{role.toUpperCase()}</b></div>
      <nav>{nav.map((item, i) => <button key={item} className={page === item ? 'nav-active' : ''} onClick={() => setPage(item)}><span className="nav-index">{String(i+1).padStart(2,'0')}</span>{item}<span className="nav-arrow">↗</span></button>)}</nav>
      <div className="sidebar-user"><div className="avatar">{user.name?.slice(0,1).toUpperCase()}</div><div><b>{user.name}</b><small>{role}</small></div><button title="Sign out" onClick={signOut}>↗</button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div><div className="breadcrumb">HACKOS / <b>{page.toUpperCase()}</b></div><h1>{page}</h1></div><div className="topbar-right"><span className={offline ? 'connection offline' : 'connection'}><i/>{offline ? 'OFFLINE' : 'SYSTEM ONLINE'}</span><div className="top-user">{user.name?.slice(0,1).toUpperCase()}</div></div></header>
      {error && <div className="alert error-alert">{error}</div>}
      {notice && <div className="alert success-alert">{notice}</div>}
      {busy && <div className="loading-line">SYNCING WORKSPACE…</div>}

      {page === 'Overview' && <div className="content">
        <div className="welcome-block"><div><div className="eyebrow">{title.toUpperCase()}</div><h2>Hey {user.name.split(' ')[0]},<br/><em>let’s make it happen.</em></h2><p>{ROLE_COPY[role] || ROLE_COPY.participant}</p></div><div className="welcome-mark">H<span>✳</span></div></div>
        <div className="metric-grid">
          {(role === 'organizer' ? [['EVENTS',overview.events],['PARTICIPANTS',overview.participants],['TEAMS',overview.teams],['CHECK-INS',overview.attendance],['SUBMISSIONS',overview.submissions]] :
            role === 'judge' ? [['PROJECTS TO REVIEW',overview.submissions],['EVENTS',overview.events],['YOUR TASKS',overview.my_tasks]] :
            role === 'mentor' ? [['TEAMS TO SUPPORT',overview.teams],['YOUR TASKS',overview.my_tasks],['PROJECTS',overview.submissions]] :
            role === 'volunteer' ? [['PARTICIPANTS',overview.participants],['CHECK-INS',overview.attendance],['EVENTS',overview.events]] :
            [['EVENTS OPEN',overview.events],['YOUR TEAMS',overview.teams],['PROJECTS SUBMITTED',overview.submissions]]
          ).map(([label, value], i) => <div className="metric" key={label}><div>{label}<span>0{i+1}</span></div><strong>{value ?? 0}</strong><small>LIVE PLATFORM DATA</small></div>)}
        </div>
        <div className="section-heading"><div><div className="eyebrow">YOUR NEXT MOVES</div><h3>{role === 'organizer' ? 'Operations pulse' : role === 'judge' ? 'Evaluation queue' : role === 'mentor' ? 'Mentor action list' : role === 'volunteer' ? 'Event-day checklist' : 'Your hackathon journey'}</h3></div><span className="live-badge">● LIVE</span></div>
        {tasks.length ? <div className="task-grid">{tasks.slice(0,6).map(t => <TaskCard key={t.id} task={t} onUpdate={updateTask} canUpdate={t.assigned_to === user.id || ['organizer','admin'].includes(role)}/>)}</div> :
          <div className="empty-panel"><span>✳</span><b>No tasks assigned yet</b><p>{role === 'organizer' ? 'Create tasks and assign work to your judges, mentors and volunteers from Staff & Tasks.' : 'Your organizer will assign tasks here. Keep an eye on announcements and the schedule.'}</p></div>}
      </div>}

      {page === 'Events' && <div className="content">
        {role === 'organizer' && <Panel title="Launch a new event" subtitle="Set the format, venue and team rules."><form className="form-grid" onSubmit={e=>{e.preventDefault();runAction(()=>post('/api/events',form), 'Event created.');setForm({});}}>
          <Field label="Event name"><input required value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})}/></Field>
          <Field label="Location"><input value={form.location||''} onChange={e=>setForm({...form,location:e.target.value})}/></Field>
          <Field label="Start date"><input type="date" value={form.start_date||''} onChange={e=>setForm({...form,start_date:e.target.value})}/></Field>
          <Field label="End date"><input type="date" value={form.end_date||''} onChange={e=>setForm({...form,end_date:e.target.value})}/></Field>
          <Field label="Format"><select value={form.mode||'hybrid'} onChange={e=>setForm({...form,mode:e.target.value})}><option value="offline">Offline</option><option value="online">Online</option><option value="hybrid">Hybrid</option></select></Field>
          <Field label="Team size (min)"><input type="number" min="1" value={form.team_min??2} onChange={e=>setForm({...form,team_min:Number(e.target.value)})}/></Field>
          <Field label="Team size (max)"><input type="number" min="1" value={form.team_max??4} onChange={e=>setForm({...form,team_max:Number(e.target.value)})}/></Field>
          <Field label="Registration limit"><input type="number" min="1" value={form.registration_limit??200} onChange={e=>setForm({...form,registration_limit:Number(e.target.value)})}/></Field>
          <Field label="Description"><textarea value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})}/></Field>
          <button className="btn-primary">Create event +</button>
        </form></Panel>}
        <Panel title="Hackathon events" subtitle="Browse events and registration status."><Table rows={rows} empty="No events have been published yet." columns={[
          {key:'id',label:'ID'},{key:'name',label:'Event'},{key:'mode',label:'Format'},{key:'location',label:'Location'},{key:'start_date',label:'Starts'},
          ...(role === 'participant' ? [{key:'register',label:'Action',render:r=><button className="btn-small" onClick={()=>registerForEvent(r.id)}>Register</button>}] : [])
        ]}/></Panel>
        {role === 'participant' && <Panel title="My event pass" subtitle="Enter the event ID you registered for to display your QR pass.">
          <form className="form-grid" onSubmit={e=>{e.preventDefault();setNotice('Your pass is shown below when registered.');}}>
            <Field label="Event ID"><input type="number" min="1" value={form.pass_event_id||''} onChange={e=>setForm({...form,pass_event_id:e.target.value})}/></Field>
            <button className="btn-primary" type="submit">Show my pass</button>
          </form>
          {form.pass_event_id && (passImage ? <div className="pass-card"><img alt="Participant QR pass" width="180" height="180" src={passImage}/><p>Keep this QR code ready for event check-in.</p></div> : <p className="muted-note">Pass not available. Confirm your event registration.</p>)}
        </Panel>}
      </div>}

      {page === 'Participants' && <div className="content"><Panel title="Participant directory" subtitle="Verified registrations across events."><Table rows={rows} columns={[{key:'name',label:'Name'},{key:'email',label:'Email'},{key:'event',label:'Event'},{key:'status',label:'Status'},{key:'participant_code',label:'Pass code'}]}/></Panel></div>}

      {(page === 'Teams' || page === 'My Team') && <div className="content">
        {role === 'participant' && <Panel title="Create your team" subtitle="Register for an event before creating your team."><form className="form-grid" onSubmit={e=>{e.preventDefault();runAction(()=>post('/api/teams',{event_id:Number(form.event_id),name:form.name}), 'Team created.');}}>
          <Field label="Event ID"><input required type="number" min="1" value={form.event_id||''} onChange={e=>setForm({...form,event_id:e.target.value})}/></Field>
          <Field label="Team name"><input required value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})}/></Field>
          <button className="btn-primary">Create team +</button>
        </form></Panel>}
        {role === 'participant' && <Panel title="Add a registered teammate" subtitle="Only your team leader can add participants who have registered for the same event."><form className="form-grid" onSubmit={e=>{e.preventDefault();runAction(()=>post(`/api/teams/${Number(form.member_team_id)}/members`,{email:form.member_email}),'Team member added.');setForm({...form,member_email:''});}}>
          <Field label="Your team ID"><input required type="number" min="1" value={form.member_team_id||''} onChange={e=>setForm({...form,member_team_id:e.target.value})}/></Field>
          <Field label="Teammate email"><input required type="email" value={form.member_email||''} onChange={e=>setForm({...form,member_email:e.target.value})}/></Field>
          <button className="btn-primary">Add teammate +</button>
        </form></Panel>}
        <Panel title="Team directory" subtitle="Team membership and team leaders."><Table rows={rows} columns={[{key:'name',label:'Team'},{key:'event',label:'Event'},{key:'event_id',label:'Event ID'},{key:'leader',label:'Team lead'},{key:'members',label:'Members',render:r=>r.members?.map(m=>m.name).join(', ')||'—'}]}/></Panel>
      </div>}

      {page === 'Attendance' && <div className="content">
        {['organizer','volunteer'].includes(role) && <Panel title="Check-in station" subtitle="Scan the participant QR pass or enter its code. Offline check-ins are queued on this device.">
          <form className="form-grid" onSubmit={e=>{e.preventDefault();submitCheckin(form.event_id||1,form.participant_code||'');}}>
            <Field label="Event ID"><input required type="number" value={form.event_id||1} onChange={e=>setForm({...form,event_id:e.target.value})}/></Field>
            <Field label="Participant pass code"><input required value={form.participant_code||''} onChange={e=>setForm({...form,participant_code:e.target.value})} placeholder="HKS-XXXXXXXXXX"/></Field>
            <button className="btn-primary">Confirm check-in</button>
          </form>
          <QRScanner onCode={code=>setForm(f=>({...f,participant_code:code}))}/>
          <p className="muted-note">Pending offline check-ins: {JSON.parse(localStorage.getItem('hackos_attendance_queue')||'[]').length}</p>
        </Panel>}
        <Panel title="Attendance log" subtitle="Live check-in records."><Table rows={rows} columns={[{key:'participant',label:'Participant'},{key:'email',label:'Email'},{key:'event',label:'Event'},{key:'source',label:'Source'},{key:'checked_in_at',label:'Checked in'}]}/></Panel>
      </div>}

      {page === 'Announcements' && <div className="content">
        {role === 'organizer' && <Panel title="Publish an update" subtitle="Keep every team aligned."><form className="form-grid" onSubmit={e=>{e.preventDefault();runAction(()=>post('/api/announcements',{event_id:Number(form.event_id||1),title:form.title,message:form.message}),'Announcement published.');}}>
          <Field label="Event ID"><input type="number" value={form.event_id||1} onChange={e=>setForm({...form,event_id:e.target.value})}/></Field>
          <Field label="Title"><input required value={form.title||''} onChange={e=>setForm({...form,title:e.target.value})}/></Field>
          <Field label="Message"><textarea required value={form.message||''} onChange={e=>setForm({...form,message:e.target.value})}/></Field>
          <button className="btn-primary">Publish announcement</button>
        </form></Panel>}
        <Panel title="Latest announcements" subtitle="Official event updates."><Table rows={rows} columns={[{key:'title',label:'Title'},{key:'message',label:'Message'},{key:'created_at',label:'Published'}]}/></Panel>
      </div>}

      {page === 'Schedule' && <div className="content">
        {['organizer','admin'].includes(role) && <Panel title="Add schedule item" subtitle="Publish a session, milestone or venue."><form className="form-grid" onSubmit={e=>{e.preventDefault();runAction(()=>post('/api/schedule',{event_id:Number(form.schedule_event_id||1),title:form.schedule_title,starts_at:form.starts_at,ends_at:form.ends_at||'',venue:form.venue||''}),'Schedule item published.');setForm({});}}>
          <Field label="Event ID"><input type="number" min="1" value={form.schedule_event_id||1} onChange={e=>setForm({...form,schedule_event_id:e.target.value})}/></Field>
          <Field label="Session title"><input required value={form.schedule_title||''} onChange={e=>setForm({...form,schedule_title:e.target.value})}/></Field>
          <Field label="Starts at"><input required type="datetime-local" value={form.starts_at||''} onChange={e=>setForm({...form,starts_at:e.target.value})}/></Field>
          <Field label="Ends at"><input type="datetime-local" value={form.ends_at||''} onChange={e=>setForm({...form,ends_at:e.target.value})}/></Field>
          <Field label="Venue / meeting link"><input value={form.venue||''} onChange={e=>setForm({...form,venue:e.target.value})}/></Field>
          <button className="btn-primary">Publish schedule item</button>
        </form></Panel>}
        <Panel title="Event schedule" subtitle="Sessions, milestones and venues."><Table rows={rows} columns={[{key:'title',label:'Session'},{key:'starts_at',label:'Starts'},{key:'ends_at',label:'Ends'},{key:'venue',label:'Venue'}]}/></Panel>
      </div>}

      {(page === 'Submissions' || page === 'My Submissions') && <div className="content">
        {role === 'participant' && <Panel title="Submit your project" subtitle="Only the team leader can submit the project."><form className="form-grid" onSubmit={e=>{e.preventDefault();runAction(()=>post('/api/submissions',{event_id:Number(form.event_id),team_id:Number(form.team_id),title:form.title,description:form.description||'',repo_url:form.repo_url||'',demo_url:form.demo_url||''}),'Project submitted.');}}>
          <Field label="Event ID"><input required type="number" value={form.event_id||''} onChange={e=>setForm({...form,event_id:e.target.value})}/></Field>
          <Field label="Team ID"><input required type="number" value={form.team_id||''} onChange={e=>setForm({...form,team_id:e.target.value})}/></Field>
          <Field label="Project title"><input required value={form.title||''} onChange={e=>setForm({...form,title:e.target.value})}/></Field>
          <Field label="Repository URL"><input value={form.repo_url||''} onChange={e=>setForm({...form,repo_url:e.target.value})}/></Field>
          <Field label="Demo URL"><input value={form.demo_url||''} onChange={e=>setForm({...form,demo_url:e.target.value})}/></Field>
          <Field label="Description"><textarea value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})}/></Field>
          <button className="btn-primary">Submit project ↗</button>
        </form></Panel>}
        <Panel title="Project submissions" subtitle="Projects submitted to this hackathon."><Table rows={rows} columns={[{key:'id',label:'ID'},{key:'title',label:'Project'},{key:'team',label:'Team'},{key:'repo_url',label:'Repository'},{key:'submitted_at',label:'Submitted'}]}/></Panel>
      </div>}

      {page === 'Judging' && <div className="content">
        {role === 'judge' && <Panel title="Score a project" subtitle="Innovation /20 · Implementation /30 · Impact /25 · UX /25"><form className="form-grid" onSubmit={e=>{e.preventDefault();runAction(()=>post('/api/judging/scores',{submission_id:Number(form.submission_id),innovation:Number(form.innovation||0),implementation:Number(form.implementation||0),impact:Number(form.impact||0),ux:Number(form.ux||0),comments:form.comments||''}),'Evaluation saved.');}}>
          <Field label="Submission ID"><input required type="number" value={form.submission_id||''} onChange={e=>setForm({...form,submission_id:e.target.value})}/></Field>
          <Field label="Innovation /20"><input type="number" min="0" max="20" value={form.innovation??0} onChange={e=>setForm({...form,innovation:e.target.value})}/></Field>
          <Field label="Implementation /30"><input type="number" min="0" max="30" value={form.implementation??0} onChange={e=>setForm({...form,implementation:e.target.value})}/></Field>
          <Field label="Impact /25"><input type="number" min="0" max="25" value={form.impact??0} onChange={e=>setForm({...form,impact:e.target.value})}/></Field>
          <Field label="User experience /25"><input type="number" min="0" max="25" value={form.ux??0} onChange={e=>setForm({...form,ux:e.target.value})}/></Field>
          <Field label="Comments"><textarea value={form.comments||''} onChange={e=>setForm({...form,comments:e.target.value})}/></Field>
          <button className="btn-primary">Save evaluation</button>
        </form></Panel>}
        <Panel title="Projects in the review queue" subtitle="Use the submission ID above when scoring."><Table rows={rows} columns={[{key:'id',label:'Submission ID'},{key:'title',label:'Project'},{key:'team',label:'Team'},{key:'submitted_at',label:'Submitted'}]}/></Panel>
      </div>}

      {(page === 'Leaderboard' || page === 'Results') && <div className="content"><Panel title="Live leaderboard" subtitle="Average score across submitted judge evaluations."><Table rows={rows} columns={[{key:'team',label:'Team'},{key:'project',label:'Project'},{key:'judges',label:'Judges'},{key:'average_score',label:'Average score'}]}/></Panel></div>}

      {page === 'Staff & Tasks' && <div className="content">
        <Panel title="Create a staff account" subtitle="Organizer-controlled access keeps privileged roles protected."><form className="form-grid" onSubmit={e=>{e.preventDefault();runAction(()=>post('/api/staff',{name:form.staff_name,email:form.staff_email,password:form.staff_password,role:form.staff_role||'mentor'}),'Staff account created.');setForm({});}}>
          <Field label="Full name"><input required value={form.staff_name||''} onChange={e=>setForm({...form,staff_name:e.target.value})}/></Field>
          <Field label="Email"><input required type="email" value={form.staff_email||''} onChange={e=>setForm({...form,staff_email:e.target.value})}/></Field>
          <Field label="Temporary password (10+ characters)"><input required minLength="10" value={form.staff_password||''} onChange={e=>setForm({...form,staff_password:e.target.value})}/></Field>
          <Field label="Role"><select value={form.staff_role||'mentor'} onChange={e=>setForm({...form,staff_role:e.target.value})}><option value="mentor">Mentor</option><option value="judge">Judge</option><option value="volunteer">Volunteer</option></select></Field>
          <button className="btn-primary">Create staff login +</button>
        </form></Panel>
        <Panel title="Assign work" subtitle="Give a clear task to a mentor, judge, volunteer or participant."><form className="form-grid" onSubmit={e=>{e.preventDefault();runAction(()=>post('/api/tasks',{title:form.task_title,description:form.task_description||'',assigned_to:Number(form.assigned_to),due_date:form.due_date||''}),'Task assigned.');}}>
          <Field label="Task title"><input required value={form.task_title||''} onChange={e=>setForm({...form,task_title:e.target.value})}/></Field>
          <Field label="Assign to"><select required value={form.assigned_to||''} onChange={e=>setForm({...form,assigned_to:e.target.value})}><option value="">Select account</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}</select></Field>
          <Field label="Due date"><input type="date" value={form.due_date||''} onChange={e=>setForm({...form,due_date:e.target.value})}/></Field>
          <Field label="Details"><textarea value={form.task_description||''} onChange={e=>setForm({...form,task_description:e.target.value})}/></Field>
          <button className="btn-primary">Assign task ↗</button>
        </form></Panel>
        <Panel title="All assigned tasks" subtitle="Track progress across the team."><Table rows={rows} columns={[{key:'title',label:'Task'},{key:'assignee',label:'Assigned to'},{key:'status',label:'Status'},{key:'due_date',label:'Due'}]}/></Panel>
        <Panel title="Staff directory" subtitle="Accounts created by the organizer."><Table rows={staff} columns={[{key:'name',label:'Name'},{key:'email',label:'Email'},{key:'role',label:'Role'}]}/></Panel>
      </div>}

      {page === 'My Tasks' && <div className="content"><div className="task-grid">{rows.map(t=><TaskCard key={t.id} task={t} onUpdate={updateTask} canUpdate/>)}</div>{!rows.length&&<div className="empty-panel"><b>No assigned tasks yet.</b><p>Your organizer will add tasks here.</p></div>}</div>}

      {page === 'My Teams' && <div className="content"><Panel title="Teams you can support" subtitle="Mentor view of team and project progress."><Table rows={rows} columns={[{key:'team',label:'Team'},{key:'event',label:'Event'},{key:'leader',label:'Team lead'},{key:'leader_email',label:'Contact'},{key:'projects',label:'Projects',render:r=>r.projects?.map(p=>p.title).join(', ')||'No submission yet'}]}/></Panel></div>}

      {page === 'Audit Logs' && <div className="content"><Panel title="Audit trail" subtitle="Trace key actions across the platform."><Table rows={rows} columns={[{key:'action',label:'Action'},{key:'entity_type',label:'Type'},{key:'entity_id',label:'Record'},{key:'details',label:'Details'},{key:'created_at',label:'Time'}]}/></Panel></div>}

      <footer>HACKOS <span>✳</span> BUILT FOR THE BUILDERS · ROLE-BASED HACKATHON OPERATIONS</footer>
    </main>
  </div>;
}

function QRScanner({ onCode }) {
  const videoRef = useRef(null);
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState('');
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const detectorAvailable = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  useEffect(() => {
    if (!active || !detectorAvailable) return;
    let stream;
    let stopped = false;
    let timer;
    (async () => {
      try {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const scan = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length && codes[0].rawValue) {
              onCodeRef.current(codes[0].rawValue);
              setMessage('QR code detected. Confirm the check-in using the button above.');
              setActive(false);
              return;
            }
          } catch {}
          timer = setTimeout(scan, 500);
        };
        scan();
      } catch (e) { setMessage(`Camera unavailable: ${e.message}`); setActive(false); }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach(track => track.stop());
    };
  }, [active, detectorAvailable]);

  return <div className="qr-scanner">
    <button type="button" className="btn-small" onClick={()=>{setMessage('');setActive(v=>!v);}}>
      {active ? 'Stop QR scanner' : 'Open camera QR scanner'}
    </button>
    {active && (detectorAvailable ? <video ref={videoRef} muted playsInline className="qr-video"/> :
      <p className="muted-note">This browser does not support built-in QR scanning. Enter the code printed below the participant QR pass.</p>)}
    {message && <p className="muted-note">{message}</p>}
  </div>;
}

function Panel({ title, subtitle, children }) {
  return <section className="panel"><div className="panel-heading"><div><div className="eyebrow">WORKSPACE MODULE</div><h3>{title}</h3><p>{subtitle}</p></div><span className="panel-mark">✳</span></div>{children}</section>;
}

function TaskCard({ task, onUpdate, canUpdate }) {
  return <article className="task-card"><div className="task-top"><span className={`task-status ${task.status}`}>{(task.status||'todo').replace('_',' ')}</span>{task.due_date && <small>DUE {task.due_date}</small>}</div><h4>{task.title}</h4><p>{task.description || 'No additional details provided.'}</p>{task.assignee && <small className="assignee">ASSIGNED TO · {task.assignee}</small>}
    {canUpdate && <div className="task-actions"><button onClick={()=>onUpdate(task.id,'todo')}>To do</button><button onClick={()=>onUpdate(task.id,'in_progress')}>In progress</button><button onClick={()=>onUpdate(task.id,'done')}>Done ✓</button></div>}
  </article>;
}
