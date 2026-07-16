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
import { fetchStudentsTeachers, fetchStudents, fetchEmployees } from "@/lib/api";

const MEETING_TYPES = ["1-on-1 Meeting", "Group Meeting", "Staff Call", "Parent-Teacher Meeting"] as const;
const MEETING_STATUSES = ["Upcoming", "In Progress", "Completed", "Cancelled"] as const;
const RSVP_STATUSES = ["Accepted", "Declined", "Pending"] as const;

// Fallback lists
const FALLBACK_TEACHERS = [
  "Sheikh Abdul Rahman",
  "Ustadha Fatima",
  "Sheikh Muhammad Al-Mansoori",
  "Ustadha Zaynab",
  "Sheikh Yasir Qadhi"
];

const FALLBACK_STUDENTS = [
  { name: "Ahmad Ali", email: "ahmad@example.com" },
  { name: "Sara Khan", email: "sara@example.com" },
  { name: "Zayd Ahmed", email: "zayd@example.com" },
  { name: "Yusuf Hussain", email: "yusuf@example.com" },
  { name: "Mariam Omar", email: "mariam@example.com" }
];

const FALLBACK_STAFF = [
  { name: "Farhan Ali", email: "farhan@example.com", role: "Supervisor" },
  { name: "Aisha Siddiqa", email: "aisha@example.com", role: "Coach" },
  { name: "Bilal Mansoor", email: "bilal@example.com", role: "Admin" }
];

// Initial 30 Mock Meetings
const INITIAL_MEETINGS = [
  { id: "meet-1", topic: "Tajweed Articulation Feedback Session", type: "1-on-1 Meeting", timeStart: "2026-07-16T15:00", timeEnd: "2026-07-16T15:30", link: "https://zoom.us/j/1112223330", host: "Sheikh Abdul Rahman", status: "In Progress", agenda: "Discussing throat articulation progress and vocal rules check.", attendees: [{ name: "Ahmad Ali", role: "Student", email: "ahmad@example.com", status: "Accepted" }] },
  { id: "meet-2", topic: "Quran Hifz Review (Juz 30)", type: "1-on-1 Meeting", timeStart: "2026-07-16T16:00", timeEnd: "2026-07-16T16:30", link: "https://zoom.us/j/1112223331", host: "Ustadha Fatima", status: "Upcoming", agenda: "Weekly review session for Quran memorization check.", attendees: [{ name: "Sara Khan", role: "Student", email: "sara@example.com", status: "Accepted" }] },
  { id: "meet-3", topic: "Quranic Arabic Grammar Q&A Session", type: "Group Meeting", timeStart: "2026-07-16T18:00", timeEnd: "2026-07-16T19:00", link: "https://zoom.us/j/1112223332", host: "Sheikh Yasir Qadhi", status: "Upcoming", agenda: "Reviewing verbs root sheets and case endings declensions.", attendees: [{ name: "Zayd Ahmed", role: "Student", email: "zayd@example.com", status: "Accepted" }, { name: "Yusuf Hussain", role: "Student", email: "yusuf@example.com", status: "Pending" }, { name: "Sara Khan", role: "Student", email: "sara@example.com", status: "Accepted" }] },
  { id: "meet-4", topic: "Weekly Academic Progress Review", type: "Staff Call", timeStart: "2026-07-16T10:00", timeEnd: "2026-07-16T11:00", link: "https://zoom.us/j/1112223333", host: "Sheikh Yasir Qadhi", status: "Completed", agenda: "Discussing student evaluations, study trackers and leave requests.", attendees: [{ name: "Sheikh Abdul Rahman", role: "Teacher", email: "rahman@example.com", status: "Accepted" }, { name: "Ustadha Fatima", role: "Teacher", email: "fatima@example.com", status: "Accepted" }, { name: "Ustadha Zaynab", role: "Teacher", email: "zaynab@example.com", status: "Declined" }] },
  { id: "meet-5", topic: "Zayd's Tajweed Evaluation Review", type: "Parent-Teacher Meeting", timeStart: "2026-07-17T15:00", timeEnd: "2026-07-17T15:30", link: "https://zoom.us/j/1112223334", host: "Ustadha Fatima", status: "Upcoming", agenda: "Feedback session with Zayd's father regarding pronunciation goals.", attendees: [{ name: "Abu Zayd (Parent)", role: "Parent", email: "abuzayd@example.com", status: "Accepted" }, { name: "Zayd Ahmed", role: "Student", email: "zayd@example.com", status: "Accepted" }] },
  { id: "meet-6", topic: "Arabic Conversation Practical Practice", type: "Group Meeting", timeStart: "2026-07-18T14:00", timeEnd: "2026-07-18T15:00", link: "https://zoom.us/j/1112223335", host: "Ustadha Zaynab", status: "Upcoming", agenda: "Practicing restaurant ordering and shopping scripts dialogue.", attendees: [{ name: "Yusuf Hussain", role: "Student", email: "yusuf@example.com", status: "Accepted" }, { name: "Mariam Omar", role: "Student", email: "mariam@example.com", status: "Accepted" }] },
  { id: "meet-7", topic: "Noorani Qaida Articulation Test Check", type: "1-on-1 Meeting", timeStart: "2026-07-16T11:00", timeEnd: "2026-07-16T11:30", link: "https://zoom.us/j/1112223336", host: "Ustadha Fatima", status: "Completed", agenda: "Reviewing basic alphabet connection shapes and short vowels.", attendees: [{ name: "Yusuf Hussain", role: "Student", email: "yusuf@example.com", status: "Accepted" }] },
  { id: "meet-8", topic: "Monthly Board Meeting", type: "Staff Call", timeStart: "2026-07-15T16:00", timeEnd: "2026-07-15T18:00", link: "https://zoom.us/j/1112223337", host: "Sheikh Yasir Qadhi", status: "Completed", agenda: "Quarterly review of lms platform scaling and payment plans.", attendees: [{ name: "Sheikh Abdul Rahman", role: "Teacher", email: "rahman@example.com", status: "Accepted" }, { name: "Sheikh Muhammad Al-Mansoori", role: "Teacher", email: "mansoori@example.com", status: "Accepted" }] },
  { id: "meet-9", topic: "Hadith Science Methodology Session", type: "Group Meeting", timeStart: "2026-07-19T17:00", timeEnd: "2026-07-19T18:00", link: "https://zoom.us/j/1112223338", host: "Sheikh Muhammad Al-Mansoori", status: "Upcoming", agenda: "Exploring narrator reliability criteria and biographies classification.", attendees: [{ name: "Ahmad Ali", role: "Student", email: "ahmad@example.com", status: "Pending" }, { name: "Zayd Ahmed", role: "Student", email: "zayd@example.com", status: "Accepted" }] },
  { id: "meet-10", topic: "Fiqh of Worship Inquiry", type: "1-on-1 Meeting", timeStart: "2026-07-16T16:30", timeEnd: "2026-07-16T17:00", link: "https://zoom.us/j/1112223339", host: "Sheikh Abdul Rahman", status: "Upcoming", agenda: "Doubt clearing call regarding tayammum and travel prayer rulings.", attendees: [{ name: "Zayd Ahmed", role: "Student", email: "zayd@example.com", status: "Accepted" }] },
  { id: "meet-11", topic: "Tafseer Juz Amma Thematic Review", type: "Group Meeting", timeStart: "2026-07-20T19:00", timeEnd: "2026-07-20T20:00", link: "https://zoom.us/j/1112223340", host: "Sheikh Yasir Qadhi", status: "Upcoming", agenda: "Thematic outline and analysis of Surah Al-Naba.", attendees: [{ name: "Sara Khan", role: "Student", email: "sara@example.com", status: "Accepted" }, { name: "Zayd Ahmed", role: "Student", email: "zayd@example.com", status: "Accepted" }, { name: "Mariam Omar", role: "Student", email: "mariam@example.com", status: "Accepted" }] },
  { id: "meet-12", topic: "Ahmad's Seerah Project Plan", type: "1-on-1 Meeting", timeStart: "2026-07-16T14:00", timeEnd: "2026-07-16T14:30", link: "https://zoom.us/j/1112223341", host: "Sheikh Abdul Rahman", status: "Completed", agenda: "Guidance on choosing early Caliphate transitions resources.", attendees: [{ name: "Ahmad Ali", role: "Student", email: "ahmad@example.com", status: "Accepted" }] },
  { id: "meet-13", topic: "Islamic Creed Q&A Session", type: "Group Meeting", timeStart: "2026-07-21T18:00", timeEnd: "2026-07-21T19:00", link: "https://zoom.us/j/1112223342", host: "Sheikh Muhammad Al-Mansoori", status: "Upcoming", agenda: "Reviewing attributes of Allah and passing criteria.", attendees: [{ name: "Ahmad Ali", role: "Student", email: "ahmad@example.com", status: "Accepted" }, { name: "Sara Khan", role: "Student", email: "sara@example.com", status: "Accepted" }] },
  { id: "meet-14", topic: "Mariam's Study Plan Discussion", type: "Parent-Teacher Meeting", timeStart: "2026-07-22T15:00", timeEnd: "2026-07-22T15:30", link: "https://zoom.us/j/1112223343", host: "Ustadha Zaynab", status: "Upcoming", agenda: "Discussing Arabic reading and calligraphy practice timelines.", attendees: [{ name: "Mariam's Mother (Parent)", role: "Parent", email: "mariam.mom@example.com", status: "Accepted" }, { name: "Mariam Omar", role: "Student", email: "mariam@example.com", status: "Accepted" }] },
  { id: "meet-15", topic: "Caligraphy Naskh Stroke Correction", type: "1-on-1 Meeting", timeStart: "2026-07-23T11:00", timeEnd: "2026-07-23T11:30", link: "https://zoom.us/j/1112223344", host: "Ustadha Zaynab", status: "Upcoming", agenda: "Evaluating student's alphabet stroke angles and thicknesses.", attendees: [{ name: "Zayd Ahmed", role: "Student", email: "zayd@example.com", status: "Pending" }] },
  { id: "meet-16", topic: "Trial Class Feedback Session", type: "Parent-Teacher Meeting", timeStart: "2026-07-16T12:30", timeEnd: "2026-07-16T13:00", link: "https://zoom.us/j/1112223345", host: "Ustadha Fatima", status: "Completed", agenda: "Evaluating Noorani Qaida basic diagnostic with Yusuf's father.", attendees: [{ name: "Yusuf's Father (Parent)", role: "Parent", email: "yusuf.father@example.com", status: "Accepted" }] },
  { id: "meet-17", topic: "Pilgrimage Rules and Logistics Q&A", type: "Group Meeting", timeStart: "2026-07-24T16:00", timeEnd: "2026-07-24T17:30", link: "https://zoom.us/j/1112223346", host: "Sheikh Abdul Rahman", status: "Upcoming", agenda: "Walkthrough of Hajj and Umrah visual charts.", attendees: [{ name: "Yusuf Hussain", role: "Student", email: "yusuf@example.com", status: "Accepted" }, { name: "Sara Khan", role: "Student", email: "sara@example.com", status: "Accepted" }, { name: "Ahmad Ali", role: "Student", email: "ahmad@example.com", status: "Declined" }] },
  { id: "meet-18", topic: "Teachers Syllabus Mapping Alignment", type: "Staff Call", timeStart: "2026-07-25T09:00", timeEnd: "2026-07-25T10:30", link: "https://zoom.us/j/1112223347", host: "Sheikh Yasir Qadhi", status: "Upcoming", agenda: "Mapping intermediate Tajweed rules to courses curriculums.", attendees: [{ name: "Sheikh Abdul Rahman", role: "Teacher", email: "rahman@example.com", status: "Accepted" }, { name: "Ustadha Fatima", role: "Teacher", email: "fatima@example.com", status: "Accepted" }] },
  { id: "meet-19", topic: "Hadith Terminology Check", type: "1-on-1 Meeting", timeStart: "2026-07-26T14:30", timeEnd: "2026-07-26T15:00", link: "https://zoom.us/j/1112223348", host: "Sheikh Muhammad Al-Mansoori", status: "Upcoming", agenda: "Verifying definitions of Hasan and Sahih classifications.", attendees: [{ name: "Yusuf Hussain", role: "Student", email: "yusuf@example.com", status: "Accepted" }] },
  { id: "meet-20", topic: "Quran Reflections Review Session", type: "Group Meeting", timeStart: "2026-07-27T17:00", timeEnd: "2026-07-27T18:00", link: "https://zoom.us/j/1112223349", host: "Sheikh Yasir Qadhi", status: "Upcoming", agenda: "Reflection journals discussion covering lessons from Surah Al-Kahf.", attendees: [{ name: "Zayd Ahmed", role: "Student", email: "zayd@example.com", status: "Accepted" }, { name: "Ahmad Ali", role: "Student", email: "ahmad@example.com", status: "Accepted" }] },
  { id: "meet-21", topic: "Parent Teacher Review: Ahmad's Progress", type: "Parent-Teacher Meeting", timeStart: "2026-07-16T14:30", timeEnd: "2026-07-16T15:00", link: "https://zoom.us/j/1112223350", host: "Sheikh Abdul Rahman", status: "Live", agenda: "Reviewing Quran memorization speed and Tajweed scores with Ahmad's Father.", attendees: [{ name: "Ahmad's Father (Parent)", role: "Parent", email: "ahmad.father@example.com", status: "Accepted" }, { name: "Ahmad Ali", role: "Student", email: "ahmad@example.com", status: "Accepted" }] },
  { id: "meet-22", topic: "Trial Session for New Arabic Enrollee", type: "1-on-1 Meeting", timeStart: "2026-07-16T15:30", timeEnd: "2026-07-16T16:00", link: "https://zoom.us/j/1112223351", host: "Ustadha Zaynab", status: "Upcoming", agenda: "General trial class to review reading skills.", attendees: [{ name: "Fatima Noor", role: "Student", email: "fatima.noor@example.com", status: "Accepted" }] },
  { id: "meet-23", topic: "Staff Coordination Meeting", type: "Staff Call", timeStart: "2026-07-16T11:00", timeEnd: "2026-07-16T12:00", link: "https://zoom.us/j/1112223352", host: "Sheikh Yasir Qadhi", status: "Completed", agenda: "General sync meeting to review platform support tickets.", attendees: [{ name: "Ustadha Fatima", role: "Teacher", email: "fatima@example.com", status: "Accepted" }, { name: "Ustadha Zaynab", role: "Teacher", email: "zaynab@example.com", status: "Accepted" }] },
  { id: "meet-24", topic: "Hajj Rituals Checklist Walkthrough", type: "Group Meeting", timeStart: "2026-07-16T17:00", timeEnd: "2026-07-16T18:00", link: "https://zoom.us/j/1112223353", host: "Sheikh Abdul Rahman", status: "Upcoming", agenda: "Reviewing rules of Muzdalifah and Arafat checklist.", attendees: [{ name: "Ahmad Ali", role: "Student", email: "ahmad@example.com", status: "Accepted" }, { name: "Sara Khan", role: "Student", email: "sara@example.com", status: "Accepted" }] },
  { id: "meet-25", topic: "Intermediate Tajweed Check-in", type: "1-on-1 Meeting", timeStart: "2026-07-16T12:00", timeEnd: "2026-07-16T12:30", link: "https://zoom.us/j/1112223354", host: "Ustadha Fatima", status: "Completed", agenda: "Verifying prolongation signs (Madd) reading.", attendees: [{ name: "Mariam Omar", role: "Student", email: "mariam@example.com", status: "Accepted" }] },
  { id: "meet-26", topic: "Seerah Course Syllabus Review", type: "Staff Call", timeStart: "2026-07-14T11:00", timeEnd: "2026-07-14T12:00", link: "https://zoom.us/j/1112223355", host: "Sheikh Yasir Qadhi", status: "Completed", agenda: "Updating course outlines for Islamic history segments.", attendees: [{ name: "Sheikh Abdul Rahman", role: "Teacher", email: "rahman@example.com", status: "Accepted" }] },
  { id: "meet-27", topic: "Qalqalah Articulation Correction", type: "1-on-1 Meeting", timeStart: "2026-07-16T15:00", timeEnd: "2026-07-16T15:30", link: "https://zoom.us/j/1112223356", host: "Ustadha Fatima", status: "Live", agenda: "Reviewing Qalqalah rules on Surah Al-Ikhlas.", attendees: [{ name: "Yusuf Hussain", role: "Student", email: "yusuf@example.com", status: "Accepted" }] },
  { id: "meet-28", topic: "Arabic Grammar Verb Quiz doubt solving", type: "1-on-1 Meeting", timeStart: "2026-07-16T19:30", timeEnd: "2026-07-16T20:00", link: "https://zoom.us/j/1112223357", host: "Ustadha Fatima", status: "Upcoming", agenda: "Solving doubt questions from mock evaluation 2.", attendees: [{ name: "Sara Khan", role: "Student", email: "sara@example.com", status: "Accepted" }] },
  { id: "meet-29", topic: "Monthly Parent-Teacher Advisory Meetup", type: "Parent-Teacher Meeting", timeStart: "2026-07-28T16:00", timeEnd: "2026-07-28T17:30", link: "https://zoom.us/j/1112223358", host: "Sheikh Yasir Qadhi", status: "Upcoming", agenda: "Advisory board feedback from student parents.", attendees: [{ name: "Ahmad's Father (Parent)", role: "Parent", email: "ahmad.father@example.com", status: "Accepted" }, { name: "Zayd's Father (Parent)", role: "Parent", email: "zayd.father@example.com", status: "Pending" }] },
  { id: "meet-30", topic: "Seerah Camp Introductory Call", type: "Group Meeting", timeStart: "2026-07-29T18:00", timeEnd: "2026-07-29T19:00", link: "https://zoom.us/j/1112223359", host: "Sheikh Yasir Qadhi", status: "Upcoming", agenda: "Explaining timeline rules and dates for summer Seerah camp.", attendees: [{ name: "Ahmad Ali", role: "Student", email: "ahmad@example.com", status: "Accepted" }, { name: "Yusuf Hussain", role: "Student", email: "yusuf@example.com", status: "Accepted" }] }
];

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState(INITIAL_MEETINGS);

  // Dynamic Lists from Database APIs
  const [dbTeachers, setDbTeachers] = useState<{ name: string; email: string }[]>(
    FALLBACK_TEACHERS.map(t => ({ name: t, email: t.toLowerCase().replace(/ /g, "") + "@example.com" }))
  );
  const [dbStudents, setDbStudents] = useState<{ name: string; email: string }[]>(FALLBACK_STUDENTS);
  const [dbStaff, setDbStaff] = useState<{ name: string; email: string; role: string }[]>(FALLBACK_STAFF);

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
      .catch(err => console.warn("Failed to fetch teachers for meetings, using fallback", err));

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
      .catch(err => console.warn("Failed to fetch students for meetings, using fallback", err));

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
      .catch(err => console.warn("Failed to fetch employees/staff for meetings, using fallback", err));
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
        meet.attendees.some(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()));
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
        setMeetings(prev => prev.filter(m => m.id !== id));
        Swal.fire({
          title: "Deleted!",
          text: "The meeting schedule has been removed.",
          icon: "success",
          background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
        });
      }
    });
  };

  const handleOpenAddModal = () => {
    setFormTopic("");
    setFormType("1-on-1 Meeting");
    setFormTimeStart(new Date().toISOString().slice(0, 16));
    setFormTimeEnd(new Date(Date.now() + 1800000).toISOString().slice(0, 16));
    setFormLink("https://zoom.us/j/1112223330");
    setFormHost(dbTeachers[0]?.name || FALLBACK_TEACHERS[0]);
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

    const newMeet = {
      id: `meet-${Date.now()}`,
      topic: formTopic,
      type: formType,
      timeStart: formTimeStart,
      timeEnd: formTimeEnd,
      link: formLink,
      host: formHost,
      status: formStatus,
      agenda: formAgenda || "No agenda provided.",
      attendees: formAttendees.length > 0 ? formAttendees : [{ name: "General Audience", role: "Guest", email: "", status: "Pending" }]
    };

    setMeetings([newMeet, ...meetings]);
    setShowAddModal(false);
    Swal.fire({
      title: "Scheduled",
      text: "Meeting scheduled successfully!",
      icon: "success",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
    });
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

    setMeetings(prev => prev.map(m => {
      if (m.id === selectedMeeting.id) {
        return {
          ...m,
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
      }
      return m;
    }));

    setShowEditModal(false);
    Swal.fire({
      title: "Saved",
      text: "Meeting updates saved successfully!",
      icon: "success",
      background: document.documentElement.classList.contains("dark") ? "#18181b" : "#ffffff"
    });
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
    
    const attendeesListStr = meet.attendees.map(a => `
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
                              {meet.attendees.map(a => a.name).join(", ")}
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
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
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
                    className="h-10 w-full rounded-xl border border-hairline bg-surface-2 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
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
