"use client";

import { useState, useEffect } from "react";
import { 
  Plus, 
  Search, 
  X, 
  Users, 
  Edit2, 
  Trash2, 
  Info,
  Calendar,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Video,
  Clock,
  User,
  Mail,
  UserPlus,
  Trash,
  PlusCircle,
  MinusCircle,
  CheckCircle2,
  CalendarDays,
  Play
} from "lucide-react";
import Swal from "sweetalert2";

import { Topbar } from "@/components/layout/topbar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fetchStudentsTeachers, fetchStudents, fetchEmployees, authHeader } from "@/lib/api";

const MEETING_TYPES = ["1-on-1 Meeting", "Group Meeting", "Staff Call", "Parent-Teacher Meeting"] as const;
const MEETING_STATUSES = ["Upcoming", "In Progress", "Completed", "Cancelled"] as const;
const RSVP_STATUSES = ["Accepted", "Declined", "Pending"] as const;

// Initial 30 Mock Meetings
const INITIAL_MEETINGS: any[] = [];

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState(INITIAL_MEETINGS);

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

  // Load meetings from the database.
  useEffect(() => {
    fetch(`${apiBase}/lms-data/meetings`, { headers: authHeader() })
      .then(res => res.json())
      .then((data: any[]) => setMeetings(data))
      .catch(console.error);
  }, [apiBase]);

  // Dynamic Lists from Database APIs
  const [dbTeachers, setDbTeachers] = useState<{ name: string; email: string }[]>([]);
  const [dbStudents, setDbStudents] = useState<{ name: string; email: string }[]>([]);
  const [dbStaff, setDbStaff] = useState<{ name: string; email: string; role: string }[]>([]);

  // Search queries for lists inside modals
  const [studentSearch, setStudentSearch] = useState("");
  const [teacherSearch, setTeacherSearch] = useState("");
  const [staffSearch, setStaffSearch] = useState("");

  // Fetch Database Invitees
  useEffect(() => {
    // 1. Fetch Teachers
    fetchStudentsTeachers()
      .then(data => {
        if (data && data.length > 0) {
          const teachers = data.map(t => ({
            name: `${t.user.firstName} ${t.user.lastName}`,
            email: t.user.email
          }));
          setDbTeachers(teachers);
        }
      })
      .catch(err => console.warn("Failed to fetch teachers for meetings", err));

    // 2. Fetch Students
    fetchStudents({ page: 1, limit: 100 })
      .then(data => {
        if (data && data.items && data.items.length > 0) {
          const students = data.items.map(s => ({
            name: `${s.user.firstName} ${s.user.lastName}`,
            email: s.user.email
          }));
          setDbStudents(students);
        }
      })
      .catch(err => console.warn("Failed to fetch students for meetings", err));

    // 3. Fetch Employees (Staff)
    fetchEmployees({ page: 1, limit: 100 })
      .then(data => {
        if (data && data.items && data.items.length > 0) {
          const staff = data.items.map(emp => ({
            name: `${emp.firstName} ${emp.lastName}`,
            email: emp.email,
            role: emp.role || "Staff"
          }));
          setDbStaff(staff);
        }
      })
      .catch(err => console.warn("Failed to fetch employees/staff for meetings", err));
  }, []);

  // Filter, sorting, and pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("time-asc");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<typeof INITIAL_MEETINGS[0] | null>(null);

  // Form Fields
  const [formTopic, setFormTopic] = useState("");
  const [formType, setFormType] = useState<typeof MEETING_TYPES[number]>("1-on-1 Meeting");
  const [formTimeStart, setFormTimeStart] = useState("");
  const [formTimeEnd, setFormTimeEnd] = useState("");
  const [formLink, setFormLink] = useState("");
  const [formHost, setFormHost] = useState("");
  const [formStatus, setFormStatus] = useState<typeof MEETING_STATUSES[number]>("Upcoming");
  const [formAgenda, setFormAgenda] = useState("");
  
  // Attendees selection states inside Add/Edit form
  const [formAttendees, setFormAttendees] = useState<{ name: string; role: string; email: string; status: string }[]>([]);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestRole, setGuestRole] = useState("Student");

  // Reset page when filter triggers
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, typeFilter, statusFilter, pageSize]);

  // Compute Stats
  const totalMeetingsCount = meetings.length;
  const liveMeetingsCount = meetings.filter(m => m.status === "Live" || m.status === "In Progress").length;
  const oneOnOneCount = meetings.filter(m => m.type === "1-on-1 Meeting").length;
  const groupOrStaffCount = meetings.filter(m => m.type === "Group Meeting" || m.type === "Staff Call").length;

  const filteredDbStudents = dbStudents.filter(s =>
    s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.email.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const filteredDbTeachers = dbTeachers.filter(t =>
    t.name.toLowerCase().includes(teacherSearch.toLowerCase()) ||
    t.email.toLowerCase().includes(teacherSearch.toLowerCase())
  );

  const filteredDbStaff = dbStaff.filter(emp =>
    emp.name.toLowerCase().includes(staffSearch.toLowerCase()) ||
    emp.email.toLowerCase().includes(staffSearch.toLowerCase()) ||
    emp.role.toLowerCase().includes(staffSearch.toLowerCase())
  );

  // Filter & Sort Logic
  const filteredMeetings = meetings
    .filter(meet => {
      const matchesSearch = 
        meet.topic.toLowerCase().includes(searchQuery.toLowerCase()) || 
        meet.host.toLowerCase().includes(searchQuery.toLowerCase()) ||
        meet.agenda.toLowerCase().includes(searchQuery.toLowerCase()) ||
        meet.attendees.some((a: any) => a.name.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesType = typeFilter === "All" || meet.type === typeFilter;
      const matchesStatus = statusFilter === "All" || meet.status === statusFilter;
      return matchesSearch && matchesType && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "time-asc":
          return a.timeStart.localeCompare(b.timeStart);
        case "time-desc":
          return b.timeStart.localeCompare(a.timeStart);
        case "title-asc":
          return a.topic.localeCompare(b.topic);
        case "title-desc":
          return b.topic.localeCompare(a.topic);
        case "attendees-desc":
          return b.attendees.length - a.attendees.length;
        default:
          return 0;
      }
    });

  // Pagination Bounds
  const totalItems = filteredMeetings.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedMeetings = filteredMeetings.slice(startIndex, startIndex + pageSize);

  // CRUD Actions
  const handleDelete = (id: string, topic: string) => {
    Swal.fire({
      title: "Cancel Meeting?",
      text: `Are you sure you want to cancel and delete "${topic}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#f85a6b",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#13222e"
    }).then((result) => {
      if (result.isConfirmed) {
        fetch(`${apiBase}/lms-data/meetings/${id}`, { method: "DELETE", headers: authHeader() })
          .then(() => {
            setMeetings(prev => prev.filter(m => m.id !== id));
            Swal.fire({
              title: "Deleted!",
              text: "The meeting schedule has been removed.",
              icon: "success",
              background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
            });
          })
          .catch(() => Swal.fire({ title: "Error", text: "Could not delete meeting.", icon: "error" }));
      }
    });
  };

  const handleOpenAddModal = () => {
    setFormTopic("");
    setFormType("1-on-1 Meeting");
    setFormTimeStart(new Date().toISOString().slice(0, 16));
    setFormTimeEnd(new Date(Date.now() + 1800000).toISOString().slice(0, 16));
    setFormLink("https://zoom.us/j/1112223330");
    setFormHost(dbTeachers[0]?.name || "");
    setFormStatus("Upcoming");
    setFormAgenda("");
    setFormAttendees([]);
    setGuestName("");
    setGuestEmail("");
    setGuestRole("Student");
    setStudentSearch("");
    setTeacherSearch("");
    setStaffSearch("");
    setShowAddModal(true);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTopic || !formTimeStart || !formTimeEnd || !formLink) {
      Swal.fire({ title: "Required Fields", text: "Please fill in the topic, times, and joining link.", icon: "error" });
      return;
    }

    const payload = {
      topic: formTopic,
      type: formType,
      timeStart: formTimeStart,
      timeEnd: formTimeEnd,
      link: formLink,
      host: formHost,
      status: formStatus,
      agenda: formAgenda || "No agenda provided.",
      // Persist exactly who was invited. This used to write a synthetic
      // "General Audience" attendee when none were picked, which put a person
      // who does not exist into the database.
      attendees: formAttendees
    };

    fetch(`${apiBase}/lms-data/meetings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(payload),
    })
      .then(res => res.json())
      .then(saved => {
        setMeetings(prev => [saved, ...prev]);
        setShowAddModal(false);
        Swal.fire({
          title: "Scheduled",
          text: "Meeting scheduled successfully!",
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
        });
      })
      .catch(() => Swal.fire({ title: "Error", text: "Could not schedule meeting.", icon: "error" }));
  };

  const handleOpenEditModal = (meet: typeof INITIAL_MEETINGS[0]) => {
    setSelectedMeeting(meet);
    setFormTopic(meet.topic);
    setFormType(meet.type as any);
    setFormTimeStart(meet.timeStart);
    setFormTimeEnd(meet.timeEnd);
    setFormLink(meet.link);
    setFormHost(meet.host);
    setFormStatus(meet.status as any);
    setFormAgenda(meet.agenda);
    setFormAttendees(meet.attendees);
    setGuestName("");
    setGuestEmail("");
    setGuestRole("Student");
    setStudentSearch("");
    setTeacherSearch("");
    setStaffSearch("");
    setShowEditModal(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMeeting) return;
    if (!formTopic || !formTimeStart || !formTimeEnd || !formLink) {
      Swal.fire({ title: "Required Fields", text: "Please fill in the topic, times, and joining link.", icon: "error" });
      return;
    }

    const payload = {
      topic: formTopic,
      type: formType,
      timeStart: formTimeStart,
      timeEnd: formTimeEnd,
      link: formLink,
      host: formHost,
      status: formStatus,
      agenda: formAgenda,
      attendees: formAttendees
    };

    fetch(`${apiBase}/lms-data/meetings/${selectedMeeting.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(payload),
    })
      .then(res => res.json())
      .then(saved => {
        setMeetings(prev => prev.map(m => (m.id === saved.id ? saved : m)));
        setShowEditModal(false);
        Swal.fire({
          title: "Saved",
          text: "Meeting updates saved successfully!",
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
        });
      })
      .catch(() => Swal.fire({ title: "Error", text: "Could not update meeting.", icon: "error" }));
  };

  // Dynamically add attendee to list
  const handleAddAttendee = () => {
    const trimmedName = guestName.trim();
    const trimmedEmail = guestEmail.trim();
    if (!trimmedName) return;

    if (formAttendees.some(a => a.email && a.email === trimmedEmail)) {
      Swal.fire({ title: "Duplicate Attendee", text: "This invitee email is already added.", icon: "warning" });
      return;
    }

    setFormAttendees([
      ...formAttendees,
      {
        name: trimmedName,
        role: guestRole,
        email: trimmedEmail,
        status: "Pending"
      }
    ]);

    setGuestName("");
    setGuestEmail("");
  };

  const handleRemoveAttendee = (idx: number) => {
    setFormAttendees(formAttendees.filter((_, i) => i !== idx));
  };

  // Toggle dynamic invitee check for Students, Teachers, or Staff
  const handleToggleInvitee = (name: string, email: string, role: string) => {
    const exists = formAttendees.some(a => a.email === email);
    if (exists) {
      setFormAttendees(formAttendees.filter(a => a.email !== email));
    } else {
      setFormAttendees([
        ...formAttendees,
        {
          name,
          role,
          email,
          status: "Pending"
        }
      ]);
    }
  };

  const handleOpenViewDetails = (meet: typeof INITIAL_MEETINGS[0]) => {
    setSelectedMeeting(meet);
    const startStr = new Date(meet.timeStart).toLocaleString();
    const endStr = new Date(meet.timeEnd).toLocaleTimeString();
    
    const attendeesListStr = meet.attendees.map((a: any) => `
      <tr class="border-b border-hairline hover:bg-surface-2/40">
        <td class="px-4 py-2 font-semibold text-xs text-ink text-left">${a.name}</td>
        <td class="px-4 py-2 text-xs text-ink-3 text-left">${a.role}</td>
        <td class="px-4 py-2 text-[10px] text-ink-3 font-mono text-left">${a.email || "N/A"}</td>
        <td class="px-4 py-2 text-right">
          <span class="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${
            a.status === 'Accepted' ? 'bg-emerald-500/10 text-emerald-500' : a.status === 'Declined' ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-500'
          }">${a.status}</span>
        </td>
      </tr>
    `).join("");

    Swal.fire({
      title: `<span class="text-base font-bold">${meet.topic}</span>`,
      html: `
        <div class="text-left mt-3 text-sm space-y-3.5">
          <div class="flex items-center justify-between border-b pb-2">
            <strong>Meeting Type:</strong> 
            <span class="text-accent font-bold">${meet.type}</span>
          </div>
          <p><strong>Host / Organizer:</strong> ${meet.host}</p>
          <p><strong>Timing:</strong> ${startStr} - ${endStr}</p>
          <p><strong>Status:</strong> ${meet.status}</p>
          <p><strong>Join Meeting:</strong> <a href="${meet.link}" target="_blank" class="text-accent underline inline-flex items-center gap-1 font-semibold">Join Video Call <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg></a></p>
          
          <div class="border-t pt-3">
            <p class="text-ink-2 font-bold mb-2"><strong>Agenda Details:</strong></p>
            <p class="text-xs text-ink-3 italic bg-surface-2 p-2.5 rounded-lg border leading-relaxed">${meet.agenda}</p>
          </div>
          
          <div class="border-t pt-3">
            <p class="text-ink-2 font-bold mb-2"><strong>Meeting Invitees / Attendees (${meet.attendees.length}):</strong></p>
            <div class="max-h-40 overflow-y-auto border border-hairline rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead class="bg-surface-2 text-[10px] font-bold text-ink-3 uppercase border-b border-hairline">
                  <tr>
                    <th class="px-4 py-1.5">Name</th>
                    <th class="px-4 py-1.5">Role</th>
                    <th class="px-4 py-1.5">Email</th>
                    <th class="px-4 py-1.5 text-right">RSVP</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-hairline">
                  ${attendeesListStr}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `,
      icon: "info",
      showCloseButton: true,
      confirmButtonText: "Close",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff",
      color: document.documentElement.classList.contains("dark") ? "#f4f4f5" : "#13222e",
      confirmButtonColor: "#59A5D8"
    });
  };

  return (
    <>
      <Topbar title="Meetings Console" subtitle="Schedule parent conferences, group study classrooms, and corporate staff calls" />
      
      <div className="animate-fade-up p-4 sm:p-6 space-y-6">
        
        {/* Statistics section */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-accent/10 text-accent">
                <CalendarDays className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{totalMeetingsCount}</p>
                <p className="text-xs font-semibold text-ink-3">Total Meetings</p>
              </div>
            </CardBody>
          </Card>
          
          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500 animate-pulse">
                <Video className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{liveMeetingsCount}</p>
                <p className="text-xs font-semibold text-ink-3">Meetings Active Now</p>
              </div>
            </CardBody>
          </Card>

          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-amber-500/10 text-amber-500">
                <User className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{oneOnOneCount}</p>
                <p className="text-xs font-semibold text-ink-3">1-on-1 Sessions</p>
              </div>
            </CardBody>
          </Card>

          <Card className="hover:scale-[1.01] transition-transform duration-200">
            <CardBody className="flex items-center gap-4 py-5">
              <span className="grid size-12 place-items-center rounded-xl bg-violet-500/10 text-violet-500">
                <Users className="size-6" />
              </span>
              <div>
                <p className="text-2xl font-bold tracking-tight text-ink">{groupOrStaffCount}</p>
                <p className="text-xs font-semibold text-ink-3">Staff & Group Calls</p>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card>
          <CardBody className="pt-5 space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              
              {/* Search field */}
              <div className="relative flex-1 max-w-xs">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
                <input
                  type="text"
                  placeholder="Search meeting, host, or attendee..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface-2 pr-4 pl-10 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-accent focus:bg-surface-3 transition-all"
                />
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                
                {/* Meeting Type Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-3 flex items-center gap-1"><Filter className="size-3" /> Type:</span>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="All">All Types</option>
                    {MEETING_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-3">Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="All">All Status</option>
                    {MEETING_STATUSES.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                {/* Sort selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-3 flex items-center gap-1"><ArrowUpDown className="size-3" /> Sort:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="h-9 rounded-xl border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="time-asc">Time (Earliest First)</option>
                    <option value="time-desc">Time (Latest First)</option>
                    <option value="title-asc">Topic (A-Z)</option>
                    <option value="title-desc">Topic (Z-A)</option>
                    <option value="attendees-desc">Attendees Count (High to Low)</option>
                  </select>
                </div>

                {/* Add meeting button */}
                <Button 
                  variant="primary" 
                  size="md" 
                  onClick={handleOpenAddModal} 
                  className="rounded-xl flex items-center gap-2"
                >
                  <Plus className="size-4" />
                  <span>Create Meeting</span>
                </Button>
              </div>
            </div>

            {/* Meetings Table Grid */}
            <div className="overflow-x-auto border border-hairline rounded-xl">
              <table className="w-full border-collapse text-left text-sm text-ink-2">
                <thead className="bg-surface-2 text-xs font-bold text-ink-3 uppercase border-b border-hairline">
                  <tr>
                    <th scope="col" className="px-6 py-4">Topic / Agenda</th>
                    <th scope="col" className="px-6 py-4">Meeting Type</th>
                    <th scope="col" className="px-6 py-4">Host / Organizer</th>
                    <th scope="col" className="px-6 py-4">Timing (Date & Duration)</th>
                    <th scope="col" className="px-6 py-4">Invitees / Attendees</th>
                    <th scope="col" className="px-6 py-4">Status</th>
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline bg-surface">
                  {paginatedMeetings.length > 0 ? (
                    paginatedMeetings.map((meet) => {
                      const startTime = new Date(meet.timeStart).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true
                      });
                      const endTime = new Date(meet.timeEnd).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true
                      });

                      const statusTone: Record<string, Tone> = {
                        "Live": "good",
                        "In Progress": "good",
                        "Upcoming": "accent",
                        "Completed": "neutral",
                        "Cancelled": "critical"
                      };

                      const typeTone: Record<string, Tone> = {
                        "1-on-1 Meeting": "neutral",
                        "Group Meeting": "accent",
                        "Staff Call": "warning",
                        "Parent-Teacher Meeting": "good"
                      };

                      return (
                        <tr 
                          key={meet.id} 
                          className="hover:bg-surface-2/60 transition-colors"
                        >
                          <td className="px-6 py-4 max-w-xs">
                            <div className="font-semibold text-ink">{meet.topic}</div>
                            <div className="text-xs text-ink-3 italic mt-1.5 truncate max-w-xs">{meet.agenda}</div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge tone={typeTone[meet.type] || "neutral"}>
                              {meet.type}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 font-semibold text-ink">
                            {meet.host}
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-xs font-semibold text-ink flex items-center gap-1.5">
                              <Clock className="size-3.5 text-accent" />
                              <span>{startTime} - {endTime}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 max-w-xs">
                            <div className="text-xs font-bold text-ink">
                              {meet.attendees.length} Invitees
                            </div>
                            <div className="text-[11px] text-ink-3 mt-1 truncate max-w-[200px]">
                              {meet.attendees.map((a: any) => a.name).join(", ")}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge tone={statusTone[meet.status] || "neutral"}>
                              {meet.status}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-1.5">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleOpenViewDetails(meet)}
                                className="rounded-lg text-ink-3 hover:text-ink hover:bg-surface-3 size-8"
                                title="View Details"
                              >
                                <Info className="size-4.5" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleOpenEditModal(meet)}
                                className="rounded-lg text-ink-3 hover:text-accent hover:bg-surface-3 size-8"
                                title="Edit Schedule"
                              >
                                <Edit2 className="size-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleDelete(meet.id, meet.topic)}
                                className="rounded-lg text-ink-3 hover:text-critical hover:bg-surface-3 size-8"
                                title="Cancel Call"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-ink-3">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <ClipboardList className="size-8 text-ink-3/60" />
                          <p className="font-semibold text-sm">No scheduled meetings matched the search parameters.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-4 border-t border-hairline text-xs font-semibold text-ink-3">
              
              {/* Page Size selector */}
              <div className="flex items-center gap-2">
                <span>Show:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="h-8 rounded-lg border border-hairline bg-surface px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value={5}>5 per page</option>
                  <option value={10}>10 per page</option>
                  <option value={20}>20 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>
                <span>of {totalItems} filtered meetings</span>
              </div>

              {/* Showing stats */}
              <div>
                Showing {totalItems > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + pageSize, totalItems)} of {totalItems} items
              </div>

              {/* Pages selectors */}
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg p-1.5 h-8 size-8 justify-center disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                
                {Array.from({ length: totalPages }).map((_, idx) => {
                  const pNum = idx + 1;
                  const isCurrent = currentPage === pNum;
                  return (
                    <Button
                      key={pNum}
                      variant={isCurrent ? "primary" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(pNum)}
                      className={cn(
                        "rounded-lg text-xs size-8 justify-center h-8 font-bold",
                        isCurrent ? "bg-accent text-accent-ink" : "text-ink hover:bg-surface-2"
                      )}
                    >
                      {pNum}
                    </Button>
                  );
                })}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-lg p-1.5 h-8 size-8 justify-center disabled:opacity-40"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Add Meeting Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
          <div className="relative w-full max-w-3xl rounded-2xl border border-hairline bg-surface shadow-2xl overflow-hidden animate-fade-in text-ink max-h-[95vh] overflow-y-auto">
            <header className="flex items-center justify-between border-b border-hairline px-6 py-4 sticky top-0 bg-surface z-10">
              <h3 className="text-base font-bold text-ink">Schedule New Meeting</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </header>
            
            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Meeting Topic / Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Arabic Grammar doubts clearing session"
                  value={formTopic}
                  onChange={(e) => setFormTopic(e.target.value)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Meeting Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as any)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {MEETING_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Host / Organizer</label>
                  <select
                    value={formHost}
                    onChange={(e) => setFormHost(e.target.value)}
                    disabled={dbTeachers.length === 0}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
                  >
                    {dbTeachers.length === 0 && (
                      <option value="">No teachers available</option>
                    )}
                    {dbTeachers.map(t => (
                      <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Start Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={formTimeStart}
                    onChange={(e) => setFormTimeStart(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">End Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={formTimeEnd}
                    onChange={(e) => setFormTimeEnd(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Video Call URL</label>
                  <input
                    type="url"
                    required
                    placeholder="https://zoom.us/j/..."
                    value={formLink}
                    onChange={(e) => setFormLink(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {MEETING_STATUSES.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dynamic Attendees Checklist Builder */}
              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1.5">Add Attendees / Invitees</label>
                
                {/* Database Quick Selects (3 Columns for Students, Teachers, Staff) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                  
                  {/* Students Section */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="block text-[10px] font-bold text-ink-3 uppercase">Students</span>
                      <input 
                        type="text" 
                        placeholder="Search..." 
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        className="h-6 w-24 rounded-lg border border-hairline bg-surface px-1.5 text-[9px] text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                    <div className="border border-hairline rounded-xl p-2 bg-surface-2 h-28 overflow-y-auto space-y-1.5 text-xs font-semibold">
                      {filteredDbStudents.length > 0 ? (
                        filteredDbStudents.map((student, idx) => {
                          const isChecked = formAttendees.some(a => a.email === student.email);
                          return (
                            <label key={`${student.email}-${idx}`} className="flex items-center gap-1.5 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleInvitee(student.name, student.email, "Student")}
                                className="rounded text-accent focus:ring-accent border-hairline size-3"
                              />
                              <span className="text-ink-2 truncate text-[11px] font-semibold" title={student.name}>{student.name}</span>
                            </label>
                          );
                        })
                      ) : (
                        <span className="text-[10px] text-ink-3 italic">No students matched</span>
                      )}
                    </div>
                  </div>

                  {/* Teachers Section */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="block text-[10px] font-bold text-ink-3 uppercase">Teachers</span>
                      <input 
                        type="text" 
                        placeholder="Search..." 
                        value={teacherSearch}
                        onChange={(e) => setTeacherSearch(e.target.value)}
                        className="h-6 w-24 rounded-lg border border-hairline bg-surface px-1.5 text-[9px] text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                    <div className="border border-hairline rounded-xl p-2 bg-surface-2 h-28 overflow-y-auto space-y-1.5 text-xs font-semibold">
                      {filteredDbTeachers.length > 0 ? (
                        filteredDbTeachers.map((teacher, idx) => {
                          const isChecked = formAttendees.some(a => a.email === teacher.email);
                          return (
                            <label key={`${teacher.email}-${idx}`} className="flex items-center gap-1.5 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleInvitee(teacher.name, teacher.email, "Teacher")}
                                className="rounded text-accent focus:ring-accent border-hairline size-3"
                              />
                              <span className="text-ink-2 truncate text-[11px] font-semibold" title={teacher.name}>{teacher.name}</span>
                            </label>
                          );
                        })
                      ) : (
                        <span className="text-[10px] text-ink-3 italic">No teachers matched</span>
                      )}
                    </div>
                  </div>

                  {/* Staff Section */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="block text-[10px] font-bold text-ink-3 uppercase">Staff</span>
                      <input 
                        type="text" 
                        placeholder="Search..." 
                        value={staffSearch}
                        onChange={(e) => setStaffSearch(e.target.value)}
                        className="h-6 w-24 rounded-lg border border-hairline bg-surface px-1.5 text-[9px] text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                    <div className="border border-hairline rounded-xl p-2 bg-surface-2 h-28 overflow-y-auto space-y-1.5 text-xs font-semibold">
                      {filteredDbStaff.length > 0 ? (
                        filteredDbStaff.map((emp, idx) => {
                          const isChecked = formAttendees.some(a => a.email === emp.email);
                          return (
                            <label key={`${emp.email}-${idx}`} className="flex items-center gap-1.5 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleInvitee(emp.name, emp.email, `Staff (${emp.role})`)}
                                className="rounded text-accent focus:ring-accent border-hairline size-3"
                              />
                              <span className="text-ink-2 truncate text-[11px] font-semibold" title={`${emp.name} (${emp.role})`}>{emp.name}</span>
                            </label>
                          );
                        })
                      ) : (
                        <span className="text-[10px] text-ink-3 italic">No staff matched</span>
                      )}
                    </div>
                  </div>

                </div>

                {/* Guest Custom Input */}
                <div className="border-t border-hairline pt-3">
                  <span className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Or Add Custom Guest (Teacher / Parent / Advisor)</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Guest Name"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      className="h-10 flex-1 rounded-xl border border-hairline bg-surface-2 px-3 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <input
                      type="email"
                      placeholder="Guest Email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      className="h-10 flex-1 rounded-xl border border-hairline bg-surface-2 px-3 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <select
                      value={guestRole}
                      onChange={(e) => setGuestRole(e.target.value)}
                      className="h-10 w-24 rounded-xl border border-hairline bg-surface-2 px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      <option value="Student">Student</option>
                      <option value="Teacher">Teacher</option>
                      <option value="Parent">Parent</option>
                      <option value="Guest">Guest</option>
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAddAttendee}
                      className="rounded-xl flex items-center gap-1 px-3.5 border border-hairline bg-surface hover:bg-surface-2"
                    >
                      <UserPlus className="size-4 text-accent" />
                      <span>Invite</span>
                    </Button>
                  </div>
                </div>

                {/* Current Invitees List */}
                <div className="mt-3">
                  <span className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Current Invitation List ({formAttendees.length})</span>
                  <div className="border border-hairline rounded-xl p-3 bg-surface-2 max-h-32 overflow-y-auto space-y-1.5">
                    {formAttendees.length > 0 ? (
                      formAttendees.map((att, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs py-1 first:pt-0 last:pb-0 border-b border-hairline last:border-none">
                          <span className="text-ink-2 font-semibold">
                            {att.name} <span className="text-[10px] text-ink-3 bg-surface border px-1 py-0.2 rounded font-bold uppercase ml-1.5">{att.role}</span>
                            {att.email && <span className="text-[10px] text-ink-3 font-mono font-normal ml-2">({att.email})</span>}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveAttendee(idx)}
                            className="text-ink-3 hover:text-critical p-0.5 rounded"
                            title="Remove invitation"
                          >
                            <MinusCircle className="size-4" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-ink-3 italic text-center py-2">No invitees added yet. Link registered students or custom guests above.</p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Meeting Agenda</label>
                <textarea
                  placeholder="Enter details on meeting agenda guidelines..."
                  value={formAgenda}
                  onChange={(e) => setFormAgenda(e.target.value)}
                  rows={2.5}
                  className="w-full rounded-xl border border-hairline bg-surface-2 p-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                />
              </div>

              <footer className="flex justify-end gap-2 pt-2 border-t border-hairline">
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary">
                  Publish Schedule
                </Button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* Edit Meeting Modal */}
      {showEditModal && selectedMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
          <div className="relative w-full max-w-3xl rounded-2xl border border-hairline bg-surface shadow-2xl overflow-hidden animate-fade-in text-ink max-h-[95vh] overflow-y-auto">
            <header className="flex items-center justify-between border-b border-hairline px-6 py-4 sticky top-0 bg-surface z-10">
              <h3 className="text-base font-bold text-ink">Edit Meeting</h3>
              <button 
                onClick={() => setShowEditModal(false)}
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </header>
            
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Meeting Topic / Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Arabic Grammar doubts clearing session"
                  value={formTopic}
                  onChange={(e) => setFormTopic(e.target.value)}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Meeting Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as any)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {MEETING_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Host / Organizer</label>
                  <select
                    value={formHost}
                    onChange={(e) => setFormHost(e.target.value)}
                    disabled={dbTeachers.length === 0}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
                  >
                    {dbTeachers.length === 0 && (
                      <option value="">No teachers available</option>
                    )}
                    {dbTeachers.map(t => (
                      <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Start Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={formTimeStart}
                    onChange={(e) => setFormTimeStart(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">End Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={formTimeEnd}
                    onChange={(e) => setFormTimeEnd(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Video Call URL</label>
                  <input
                    type="url"
                    required
                    placeholder="https://zoom.us/j/..."
                    value={formLink}
                    onChange={(e) => setFormLink(e.target.value)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {MEETING_STATUSES.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dynamic Attendees Checklist Builder */}
              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1.5">Add Attendees / Invitees</label>
                
                {/* Database Quick Selects (3 Columns for Students, Teachers, Staff) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                  
                  {/* Students Section */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="block text-[10px] font-bold text-ink-3 uppercase">Students</span>
                      <input 
                        type="text" 
                        placeholder="Search..." 
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        className="h-6 w-24 rounded-lg border border-hairline bg-surface px-1.5 text-[9px] text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                    <div className="border border-hairline rounded-xl p-2 bg-surface-2 h-28 overflow-y-auto space-y-1.5 text-xs font-semibold">
                      {filteredDbStudents.length > 0 ? (
                        filteredDbStudents.map((student, idx) => {
                          const isChecked = formAttendees.some(a => a.email === student.email);
                          return (
                            <label key={`${student.email}-${idx}`} className="flex items-center gap-1.5 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleInvitee(student.name, student.email, "Student")}
                                className="rounded text-accent focus:ring-accent border-hairline size-3"
                              />
                              <span className="text-ink-2 truncate text-[11px] font-semibold" title={student.name}>{student.name}</span>
                            </label>
                          );
                        })
                      ) : (
                        <span className="text-[10px] text-ink-3 italic">No students matched</span>
                      )}
                    </div>
                  </div>

                  {/* Teachers Section */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="block text-[10px] font-bold text-ink-3 uppercase">Teachers</span>
                      <input 
                        type="text" 
                        placeholder="Search..." 
                        value={teacherSearch}
                        onChange={(e) => setTeacherSearch(e.target.value)}
                        className="h-6 w-24 rounded-lg border border-hairline bg-surface px-1.5 text-[9px] text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                    <div className="border border-hairline rounded-xl p-2 bg-surface-2 h-28 overflow-y-auto space-y-1.5 text-xs font-semibold">
                      {filteredDbTeachers.length > 0 ? (
                        filteredDbTeachers.map((teacher, idx) => {
                          const isChecked = formAttendees.some(a => a.email === teacher.email);
                          return (
                            <label key={`${teacher.email}-${idx}`} className="flex items-center gap-1.5 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleInvitee(teacher.name, teacher.email, "Teacher")}
                                className="rounded text-accent focus:ring-accent border-hairline size-3"
                              />
                              <span className="text-ink-2 truncate text-[11px] font-semibold" title={teacher.name}>{teacher.name}</span>
                            </label>
                          );
                        })
                      ) : (
                        <span className="text-[10px] text-ink-3 italic">No teachers matched</span>
                      )}
                    </div>
                  </div>

                  {/* Staff Section */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="block text-[10px] font-bold text-ink-3 uppercase">Staff</span>
                      <input 
                        type="text" 
                        placeholder="Search..." 
                        value={staffSearch}
                        onChange={(e) => setStaffSearch(e.target.value)}
                        className="h-6 w-24 rounded-lg border border-hairline bg-surface px-1.5 text-[9px] text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                    <div className="border border-hairline rounded-xl p-2 bg-surface-2 h-28 overflow-y-auto space-y-1.5 text-xs font-semibold">
                      {filteredDbStaff.length > 0 ? (
                        filteredDbStaff.map((emp, idx) => {
                          const isChecked = formAttendees.some(a => a.email === emp.email);
                          return (
                            <label key={`${emp.email}-${idx}`} className="flex items-center gap-1.5 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleInvitee(emp.name, emp.email, `Staff (${emp.role})`)}
                                className="rounded text-accent focus:ring-accent border-hairline size-3"
                              />
                              <span className="text-ink-2 truncate text-[11px] font-semibold" title={`${emp.name} (${emp.role})`}>{emp.name}</span>
                            </label>
                          );
                        })
                      ) : (
                        <span className="text-[10px] text-ink-3 italic">No staff matched</span>
                      )}
                    </div>
                  </div>

                </div>

                {/* Guest Custom Input */}
                <div className="border-t border-hairline pt-3">
                  <span className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Or Add Custom Guest (Teacher / Parent / Advisor)</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Guest Name"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      className="h-10 flex-1 rounded-xl border border-hairline bg-surface-2 px-3 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <input
                      type="email"
                      placeholder="Guest Email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      className="h-10 flex-1 rounded-xl border border-hairline bg-surface-2 px-3 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <select
                      value={guestRole}
                      onChange={(e) => setGuestRole(e.target.value)}
                      className="h-10 w-24 rounded-xl border border-hairline bg-surface-2 px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      <option value="Student">Student</option>
                      <option value="Teacher">Teacher</option>
                      <option value="Parent">Parent</option>
                      <option value="Guest">Guest</option>
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAddAttendee}
                      className="rounded-xl flex items-center gap-1 px-3.5 border border-hairline bg-surface hover:bg-surface-2"
                    >
                      <UserPlus className="size-4 text-accent" />
                      <span>Invite</span>
                    </Button>
                  </div>
                </div>

                {/* Current Invitees List */}
                <div className="mt-3">
                  <span className="block text-[10px] font-bold text-ink-3 uppercase mb-1">Current Invitation List ({formAttendees.length})</span>
                  <div className="border border-hairline rounded-xl p-3 bg-surface-2 max-h-32 overflow-y-auto space-y-1.5">
                    {formAttendees.length > 0 ? (
                      formAttendees.map((att, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs py-1 first:pt-0 last:pb-0 border-b border-hairline last:border-none">
                          <span className="text-ink-2 font-semibold">
                            {att.name} <span className="text-[10px] text-ink-3 bg-surface border px-1 py-0.2 rounded font-bold uppercase ml-1.5">{att.role}</span>
                            {att.email && <span className="text-[10px] text-ink-3 font-mono font-normal ml-2">({att.email})</span>}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveAttendee(idx)}
                            className="text-ink-3 hover:text-critical p-0.5 rounded"
                            title="Remove invitation"
                          >
                            <MinusCircle className="size-4" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-ink-3 italic text-center py-2">No invitees added yet. Link registered students or custom guests above.</p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-3 uppercase mb-1">Meeting Agenda</label>
                <textarea
                  placeholder="Enter details on meeting agenda guidelines..."
                  value={formAgenda}
                  onChange={(e) => setFormAgenda(e.target.value)}
                  rows={2.5}
                  className="w-full rounded-xl border border-hairline bg-surface-2 p-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                />
              </div>

              <footer className="flex justify-end gap-2 pt-2 border-t border-hairline">
                <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary">
                  Save Changes
                </Button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
