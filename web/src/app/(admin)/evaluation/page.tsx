"use client";

import { useState } from "react";
import { 
  Users, 
  CalendarDays, 
  MapPin, 
  BookOpen, 
  GraduationCap, 
  Search, 
  Video, 
  ClipboardCheck, 
  Mail, 
  Phone, 
  XCircle, 
  Eye,
  Award
} from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis } from "recharts";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface RequestItem {
  id: string;
  name: string;
  email: string;
  date: string;
  mobile: string;
  country: string;
  course: string;
  prefTeacherGender: "Male" | "Female" | "Any";
  status: "PENDING" | "SCHEDULED" | "COMPLETED";
  age?: number;
  timezone?: string;
  goals?: string;
  scheduledTime?: string;
  assignedTeacher?: string;
  meetLink?: string;
  grades?: {
    pronunciation: string;
    fluency: string;
    focus: string;
  };
  recommendedLevel?: string;
  evaluationNotes?: string;
}

const INITIAL_REQUESTS: RequestItem[] = [
  { id: "ALFST-044", name: "Siva Kumar", email: "siva.kumar@example.com", date: "Jul 11, 2026", mobile: "+91 78787 87166", country: "India", course: "Quran", prefTeacherGender: "Male", status: "PENDING", age: 12, timezone: "GMT+5:30", goals: "Wants to learn basic Quran reading from scratch with correct Tajweed rules." },
  { id: "ALFST-040", name: "Sara Al-Mansoori", email: "sara.mansoori@example.ae", date: "Jun 23, 2026", mobile: "+971 50 123 4567", country: "United Arab Emirates", course: "Quran", prefTeacherGender: "Female", status: "COMPLETED", age: 8, timezone: "GMT+4:00", goals: "Needs a patient female teacher for online Tajweed lessons. Child is shy.", scheduledTime: "2026-06-25 15:30", assignedTeacher: "Ustadha Maryam", meetLink: "https://meet.google.com/abc-defg-hij", recommendedLevel: "Quran — Level 1", grades: { pronunciation: "A", fluency: "B", focus: "A" }, evaluationNotes: "Excellent focus. Needs slight correction on heavy letters." },
  { id: "ALFST-038", name: "Dinesh Kumar", email: "dinesh.k@example.com", date: "Jun 22, 2026", mobile: "+91 98778 58585", country: "India", course: "Quran", prefTeacherGender: "Male", status: "COMPLETED", age: 15, timezone: "GMT+5:30", goals: "Already knows basic reading. Wants to improve fluency.", scheduledTime: "2026-06-24 18:00", assignedTeacher: "Ustadh Bilal", meetLink: "https://meet.google.com/xyz-pdqr-wxy", recommendedLevel: "Quran — Level 3", grades: { pronunciation: "B", fluency: "A", focus: "B" }, evaluationNotes: "Fluency is good, but needs to work on stretching rules (Madd)." },
  { id: "ALFST-032", name: "Raj Kumar", email: "raj.k@example.com", date: "Jun 22, 2026", mobile: "+91 91768 76776", country: "India", course: "Arabic", prefTeacherGender: "Male", status: "PENDING", age: 19, timezone: "GMT+5:30", goals: "University student wanting to learn conversational Arabic." },
  { id: "ALFST-030", name: "Aisha Rahman", email: "aisha.r@example.co.uk", date: "Jun 21, 2026", mobile: "+44 7911 123456", country: "United Kingdom", course: "Islamic Studies", prefTeacherGender: "Female", status: "SCHEDULED", age: 10, timezone: "GMT+1:00", goals: "Wants to learn Islamic etiquette, history, and short Surahs.", scheduledTime: "2026-07-18 16:00", assignedTeacher: "Ustadha Zainab", meetLink: "https://meet.google.com/wxy-zabc-def" },
  { id: "ALFST-028", name: "Yusuf Al-Bahraini", email: "yusuf.b@example.bh", date: "Jun 20, 2026", mobile: "+973 1712 3456", country: "Bahrain", course: "Quran", prefTeacherGender: "Any", status: "PENDING", age: 6, timezone: "GMT+3:00", goals: "Very young beginner. Wants interactive lessons." },
  { id: "ALFST-025", name: "Zaid Al-Harbi", email: "zaid.h@example.com", date: "Jun 19, 2026", mobile: "+966 50 987 6543", country: "Saudi Arabia", course: "Arabic", prefTeacherGender: "Male", status: "SCHEDULED", age: 24, timezone: "GMT+3:00", goals: "Adult learner trying to master classical Arabic reading for study.", scheduledTime: "2026-07-16 11:30", assignedTeacher: "Ustadh Yusuf", meetLink: "https://meet.google.com/qwe-rtyu-iop" },
  { id: "ALFST-022", name: "John Doe", email: "john.doe@example.com", date: "Jun 15, 2026", mobile: "+1 555 123 4567", country: "United States", course: "Quran", prefTeacherGender: "Male", status: "PENDING", age: 32, timezone: "GMT-5:00", goals: "Revert student wanting to learn correct pronunciation of Surah Al-Fatihah." }
];

const TEACHERS = ["Ustadh Yusuf", "Ustadha Maryam", "Ustadh Bilal", "Ustadha Zainab"];
const LEVELS = ["Beginner Alphabet", "Quran — Level 1", "Quran — Level 2", "Quran — Level 3", "Arabic Conversational — Level 1", "Islamic Studies Junior"];

const PIE_COLORS = ["#5b73e8", "#886cff", "#ffb822"];

export default function EvaluationDashboard() {
  const [requests, setRequests] = useState<RequestItem[]>(INITIAL_REQUESTS);
  const [activeTab, setActiveTab] = useState<"pending" | "scheduled" | "completed">("pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  
  // Modals state
  const [selectedStudent, setSelectedStudent] = useState<RequestItem | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [evaluationModalOpen, setEvaluationModalOpen] = useState(false);

  // Form states
  const [scheduleForm, setScheduleForm] = useState({ teacher: TEACHERS[0], dateTime: "", note: "" });
  const [evaluationForm, setEvaluationForm] = useState({ pronunciation: "A", fluency: "A", focus: "A", recommendedLevel: LEVELS[1], notes: "" });

  // Handle schedule submit
  const handleScheduleRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !scheduleForm.dateTime) return;

    setRequests(prev => prev.map(req => {
      if (req.id === selectedStudent.id) {
        return {
          ...req,
          status: "SCHEDULED",
          scheduledTime: scheduleForm.dateTime,
          assignedTeacher: scheduleForm.teacher,
          meetLink: `https://meet.google.com/${Math.random().toString(36).substring(2, 5)}-${Math.random().toString(36).substring(2, 6)}-${Math.random().toString(36).substring(2, 5)}`
        };
      }
      return req;
    }));

    setScheduleModalOpen(false);
    setSelectedStudent(null);
    setScheduleForm({ teacher: TEACHERS[0], dateTime: "", note: "" });
    setActiveTab("scheduled");
  };

  // Handle evaluation submit
  const handleEvaluateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;

    setRequests(prev => prev.map(req => {
      if (req.id === selectedStudent.id) {
        return {
          ...req,
          status: "COMPLETED",
          grades: {
            pronunciation: evaluationForm.pronunciation,
            fluency: evaluationForm.fluency,
            focus: evaluationForm.focus
          },
          recommendedLevel: evaluationForm.recommendedLevel,
          evaluationNotes: evaluationForm.notes
        };
      }
      return req;
    }));

    setEvaluationModalOpen(false);
    setSelectedStudent(null);
    setEvaluationForm({ pronunciation: "A", fluency: "A", focus: "A", recommendedLevel: LEVELS[1], notes: "" });
    setActiveTab("completed");
  };

  // Dynamic Chart calculations based on current state
  const totalInquiries = requests.length;
  const pendingCount = requests.filter(r => r.status === "PENDING").length;
  const scheduledCount = requests.filter(r => r.status === "SCHEDULED").length;
  const completedCount = requests.filter(r => r.status === "COMPLETED").length;

  // 1. Total Requests Gender ratio (Unscheduled/Pending requests focus)
  const pendingGenderData = [
    { name: "Male", value: requests.filter(r => r.prefTeacherGender === "Male").length },
    { name: "Female", value: requests.filter(r => r.prefTeacherGender === "Female").length },
    { name: "Any", value: requests.filter(r => r.prefTeacherGender === "Any").length }
  ].filter(d => d.value > 0);

  // 2. Country Counts
  const countryCounts = requests.reduce((acc, curr) => {
    acc[curr.country] = (acc[curr.country] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const countryData = Object.entries(countryCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // 3. Course Interest
  const courseCounts = requests.reduce((acc, curr) => {
    acc[curr.course] = (acc[curr.course] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const courseData = Object.entries(courseCounts).map(([name, count]) => ({
    name,
    count
  }));

  // Filtering list
  const filteredRequests = requests.filter(req => {
    const matchesTab = 
      (activeTab === "pending" && req.status === "PENDING") ||
      (activeTab === "scheduled" && req.status === "SCHEDULED") ||
      (activeTab === "completed" && req.status === "COMPLETED");

    const matchesSearch = 
      req.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.mobile.includes(searchTerm);

    const matchesCountry = countryFilter === "" || req.country === countryFilter;
    const matchesCourse = courseFilter === "" || req.course === courseFilter;

    return matchesTab && matchesSearch && matchesCountry && matchesCourse;
  });

  const uniqueCountries = Array.from(new Set(requests.map(r => r.country)));
  const uniqueCourses = Array.from(new Set(requests.map(r => r.course)));

  return (
    <>
      <Topbar title="Evaluation & Trial Classes" subtitle="Review incoming requests, schedule trial classes, and evaluate trial performance" />

      <div className="animate-fade-up space-y-6 p-4 sm:p-6">
        
        {/* Dynamic Analytics Dashboard */}
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          
          {/* Donut Chart: Requests split */}
          <Card className="p-5 bg-surface border border-hairline flex flex-col justify-between h-[230px]">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-3">Total Requests</h3>
              <p className="text-3xl font-black tracking-tight text-ink mt-1">{totalInquiries}</p>
            </div>
            <div className="flex items-center justify-between gap-2 mt-2 flex-1">
              <div className="w-[110px] h-[110px] relative shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pendingGenderData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={30}
                      outerRadius={45}
                      stroke="var(--surface)"
                      strokeWidth={2}
                    >
                      {pendingGenderData.map((slice, i) => (
                        <Cell key={slice.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                  <span className="text-[10px] font-bold text-ink-3">Pending</span>
                  <span className="text-sm font-black text-ink">{pendingCount}</span>
                </div>
              </div>
              <ul className="text-2xs font-semibold text-ink-2 space-y-1 flex-1 pl-2">
                {pendingGenderData.map((slice, i) => (
                  <li key={slice.name} className="flex items-center gap-1.5 justify-between">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="size-2 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="truncate">{slice.name}</span>
                    </div>
                    <span className="tnum font-bold text-ink">{slice.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          {/* List Card: Top Countries */}
          <Card className="p-5 bg-surface border border-hairline flex flex-col justify-between h-[230px]">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-3">Countries</h3>
              <p className="text-xs text-ink-3 mt-0.5">Top demographic regions</p>
            </div>
            <div className="space-y-3.5 my-auto">
              {countryData.map((c) => (
                <div key={c.name} className="flex items-center justify-between text-xs border-b border-hairline/30 pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded-lg bg-surface-2 border border-hairline">
                      <MapPin className="size-3.5 text-accent" />
                    </span>
                    <span className="font-semibold text-ink-2 truncate max-w-[120px]">{c.name}</span>
                  </div>
                  <span className="tnum font-bold text-ink bg-surface-3 px-2 py-0.5 rounded-full text-2xs">{c.count} requests</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Recharts Pie: Teacher Preference */}
          <Card className="p-5 bg-surface border border-hairline flex flex-col justify-between h-[230px]">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-3">Teacher Preference</h3>
              <p className="text-xs text-ink-3 mt-0.5">Requested coach gender profile</p>
            </div>
            <div className="flex items-center justify-between flex-1 mt-2">
              <div className="w-[110px] h-[110px] relative shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pendingGenderData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={0}
                      outerRadius={45}
                      stroke="var(--surface)"
                      strokeWidth={2}
                    >
                      {pendingGenderData.map((slice, i) => (
                        <Cell key={slice.name} fill={PIE_COLORS[(i + 1) % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="text-2xs font-semibold text-ink-2 space-y-1.5 flex-1 pl-2">
                {pendingGenderData.map((slice, i) => (
                  <li key={slice.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full shrink-0" style={{ background: PIE_COLORS[(i + 1) % PIE_COLORS.length] }} />
                      {slice.name}
                    </span>
                    <span className="tnum font-bold text-ink">{Math.round((slice.value / totalInquiries) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          {/* Bar Chart: Course interest */}
          <Card className="p-5 bg-surface border border-hairline flex flex-col justify-between h-[230px]">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-3">Course Interest</h3>
              <p className="text-xs text-ink-3 mt-0.5">Distribution across courses</p>
            </div>
            <div className="h-[120px] w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={courseData} layout="vertical" margin={{ left: -10, right: 10, top: 5, bottom: 5 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={90} axisLine={false} tickLine={false} style={{ fontSize: "10px", fontWeight: "bold", fill: "var(--ink-2)" }} />
                  <Tooltip cursor={{ fill: "transparent" }} contentStyle={{ fontSize: "10px", background: "var(--surface)", border: "1px solid var(--border)" }} />
                  <Bar dataKey="count" fill="var(--accent)" radius={[0, 4, 4, 0]} barSize={10} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

        </div>

        {/* Tab Controls & Filters */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-hairline pb-2">
            
            {/* Nav Tabs */}
            <div className="flex gap-1.5 bg-surface-2 p-1 rounded-xl border border-hairline w-fit">
              <button
                onClick={() => { setActiveTab("pending"); setSearchTerm(""); }}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === "pending" ? "bg-surface text-accent shadow-sm border border-hairline/80" : "text-ink-3 hover:text-ink-2"}`}
              >
                Requests
                <Badge className="ml-2 font-bold bg-accent/10 text-accent hover:bg-accent/10 border-0">{pendingCount}</Badge>
              </button>
              <button
                onClick={() => { setActiveTab("scheduled"); setSearchTerm(""); }}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === "scheduled" ? "bg-surface text-accent shadow-sm border border-hairline/80" : "text-ink-3 hover:text-ink-2"}`}
              >
                Scheduled Trials
                <Badge className="ml-2 font-bold bg-[#886cff]/10 text-[#886cff] hover:bg-[#886cff]/10 border-0">{scheduledCount}</Badge>
              </button>
              <button
                onClick={() => { setActiveTab("completed"); setSearchTerm(""); }}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === "completed" ? "bg-surface text-accent shadow-sm border border-hairline/80" : "text-ink-3 hover:text-ink-2"}`}
              >
                Completed
                <Badge className="ml-2 font-bold bg-green-500/10 text-green-500 hover:bg-green-500/10 border-0">{completedCount}</Badge>
              </button>
            </div>

            {/* Live Filter Controls */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
                <input
                  type="text"
                  placeholder="Search name, code, phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-9.5 w-60 rounded-xl border border-hairline bg-surface pr-3 pl-9.5 text-xs text-ink placeholder:text-ink-3 focus:outline-none focus:border-[#5b73e8] transition-all"
                />
              </div>

              {/* Country Filter */}
              <select
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                className="h-9.5 rounded-xl border border-hairline bg-surface px-3 text-xs text-ink focus:outline-none focus:border-[#5b73e8]"
              >
                <option value="">All Countries</option>
                {uniqueCountries.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              {/* Course Filter */}
              <select
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                className="h-9.5 rounded-xl border border-hairline bg-surface px-3 text-xs text-ink focus:outline-none focus:border-[#5b73e8]"
              >
                <option value="">All Courses</option>
                {uniqueCourses.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

          </div>
        </div>

        {/* Data Table */}
        <Card className="border border-hairline bg-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-[11px] font-bold uppercase tracking-wider text-ink-3 bg-surface-2/20">
                  <th className="px-5 py-4">Student ID</th>
                  <th className="px-5 py-4">Student Name</th>
                  <th className="px-5 py-4">Date</th>
                  <th className="px-5 py-4">Mobile</th>
                  <th className="px-5 py-4">Country</th>
                  <th className="px-5 py-4">Course</th>
                  
                  {activeTab === "pending" && <th className="px-5 py-4">Preferred Coach</th>}
                  
                  {activeTab === "scheduled" && (
                    <>
                      <th className="px-5 py-4">Assigned Coach</th>
                      <th className="px-5 py-4">Schedule Time</th>
                      <th className="px-5 py-4">Meeting URL</th>
                    </>
                  )}

                  {activeTab === "completed" && (
                    <>
                      <th className="px-5 py-4">Coach</th>
                      <th className="px-5 py-4">Grade (P/F/F)</th>
                      <th className="px-5 py-4">Recommended Level</th>
                    </>
                  )}

                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {filteredRequests.length > 0 ? (
                  filteredRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-surface-2/30 transition-colors group">
                      <td className="px-5 py-4 font-bold text-xs text-ink-3 tracking-wider">{req.id}</td>
                      <td className="px-5 py-4 font-semibold text-ink group-hover:text-accent transition-colors">{req.name}</td>
                      <td className="px-5 py-4 text-xs font-semibold text-ink-2">{req.date}</td>
                      <td className="px-5 py-4 text-xs font-semibold text-ink-2">{req.mobile}</td>
                      <td className="px-5 py-4 text-xs font-semibold text-ink-2">{req.country}</td>
                      <td className="px-5 py-4">
                        <Badge className="bg-accent-soft text-accent border-0 font-bold text-[10px]">{req.course}</Badge>
                      </td>

                      {activeTab === "pending" && (
                        <td className="px-5 py-4 text-xs font-semibold text-ink-2">
                          <span className="px-2 py-0.5 rounded bg-surface-3">{req.prefTeacherGender} Teacher</span>
                        </td>
                      )}

                      {activeTab === "scheduled" && (
                        <>
                          <td className="px-5 py-4 text-xs font-bold text-ink-2">{req.assignedTeacher}</td>
                          <td className="px-5 py-4 text-xs font-bold text-accent">{req.scheduledTime}</td>
                          <td className="px-5 py-4">
                            <a 
                              href={req.meetLink} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="text-xs text-[#886cff] font-bold hover:underline inline-flex items-center gap-1 bg-[#886cff]/10 px-2 py-1 rounded-lg"
                            >
                              <Video className="size-3.5" />
                              Join Class
                            </a>
                          </td>
                        </>
                      )}

                      {activeTab === "completed" && (
                        <>
                          <td className="px-5 py-4 text-xs font-bold text-ink-2">{req.assignedTeacher}</td>
                          <td className="px-5 py-4 text-xs font-black">
                            <span className="text-green-500 font-bold bg-green-500/10 px-1.5 py-0.5 rounded mr-1">P: {req.grades?.pronunciation}</span>
                            <span className="text-blue-500 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded">F: {req.grades?.fluency}</span>
                          </td>
                          <td className="px-5 py-4">
                            <Badge className="bg-zinc-100 dark:bg-zinc-800 text-ink font-bold text-[10px]">{req.recommendedLevel}</Badge>
                          </td>
                        </>
                      )}

                      <td className="px-5 py-4">
                        {req.status === "PENDING" && (
                          <Badge className="bg-[#ffb822]/10 text-[#ffb822] hover:bg-[#ffb822]/10 font-extrabold text-[10px] border-0">PENDING</Badge>
                        )}
                        {req.status === "SCHEDULED" && (
                          <Badge className="bg-[#886cff]/10 text-[#886cff] hover:bg-[#886cff]/10 font-extrabold text-[10px] border-0">SCHEDULED</Badge>
                        )}
                        {req.status === "COMPLETED" && (
                          <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/10 font-extrabold text-[10px] border-0">COMPLETED</Badge>
                        )}
                      </td>
                      
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedStudent(req)}
                            title="View Student Profile"
                            className="p-1.5 rounded-lg border border-hairline bg-surface text-ink-3 hover:text-accent hover:border-accent/30 hover:bg-accent-soft/20 transition-all cursor-pointer"
                          >
                            <Eye className="size-4" />
                          </button>

                          {req.status === "PENDING" && (
                            <button
                              onClick={() => { setSelectedStudent(req); setScheduleModalOpen(true); }}
                              className="px-3 h-8 rounded-lg bg-accent text-white font-bold text-2xs hover:bg-[#4860e6] transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                            >
                              <CalendarDays className="size-3" />
                              Schedule
                            </button>
                          )}

                          {req.status === "SCHEDULED" && (
                            <button
                              onClick={() => { setSelectedStudent(req); setEvaluationModalOpen(true); }}
                              className="px-3 h-8 rounded-lg bg-green-600 text-white font-bold text-2xs hover:bg-green-700 transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                            >
                              <ClipboardCheck className="size-3" />
                              Evaluate
                            </button>
                          )}

                          {req.status === "COMPLETED" && (
                            <div className="px-3 py-1 bg-green-500/10 text-green-500 rounded-lg text-2xs font-extrabold flex items-center gap-1 border border-green-500/20">
                              <Award className="size-3" />
                              Evaluated
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={activeTab === "scheduled" ? 10 : activeTab === "completed" ? 10 : 8} className="px-5 py-12 text-center text-ink-3 font-semibold">
                      No trial inquiries found matching your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

      </div>

      {/* MODAL 1: SCHEDULE MODAL */}
      {scheduleModalOpen && selectedStudent && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface border border-hairline w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-scale-up p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <h3 className="font-bold text-base text-ink flex items-center gap-2">
                <CalendarDays className="size-5 text-accent" />
                Schedule Evaluation Class
              </h3>
              <button 
                onClick={() => { setScheduleModalOpen(false); setSelectedStudent(null); }}
                className="size-8 rounded-full bg-surface-2 hover:bg-surface-3 transition-colors grid place-items-center text-ink-2 cursor-pointer"
              >
                <XCircle className="size-4" />
              </button>
            </div>

            <div className="text-xs bg-accent-soft text-accent p-3.5 rounded-2xl border border-accent/10 space-y-1">
              <p className="font-bold">Student: {selectedStudent.name}</p>
              <p className="font-semibold text-2xs text-ink-3">Course: {selectedStudent.course} • Preference: {selectedStudent.prefTeacherGender} Teacher</p>
            </div>

            <form onSubmit={handleScheduleRequest} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-2xs font-bold uppercase tracking-wider text-ink-3">Assign Academic Coach</label>
                <select
                  value={scheduleForm.teacher}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, teacher: e.target.value }))}
                  className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-xs text-ink focus:outline-none focus:border-[#5b73e8]"
                >
                  {TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-2xs font-bold uppercase tracking-wider text-ink-3">Trial Date & Time</label>
                <input
                  type="datetime-local"
                  required
                  value={scheduleForm.dateTime}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, dateTime: e.target.value }))}
                  className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-xs text-ink focus:outline-none focus:border-[#5b73e8]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-2xs font-bold uppercase tracking-wider text-ink-3">Special Instructions (Optional)</label>
                <textarea
                  value={scheduleForm.note}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, note: e.target.value }))}
                  placeholder="e.g. child is beginner, wants focused Tajweed..."
                  className="w-full h-20 p-3 rounded-xl border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-[#5b73e8] resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setScheduleModalOpen(false); setSelectedStudent(null); }}
                  className="h-10 px-4 font-bold text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="h-10 px-5 font-bold text-xs bg-accent text-white hover:bg-indigo-600 rounded-xl"
                >
                  Submit Schedule
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EVALUATION GRADING MODAL */}
      {evaluationModalOpen && selectedStudent && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface border border-hairline w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-scale-up p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <h3 className="font-bold text-base text-ink flex items-center gap-2">
                <ClipboardCheck className="size-5 text-green-600" />
                Trial Evaluation & Grading
              </h3>
              <button 
                onClick={() => { setEvaluationModalOpen(false); setSelectedStudent(null); }}
                className="size-8 rounded-full bg-surface-2 hover:bg-surface-3 transition-colors grid place-items-center text-ink-2 cursor-pointer"
              >
                <XCircle className="size-4" />
              </button>
            </div>

            <div className="text-xs bg-green-500/10 text-green-600 p-3.5 rounded-2xl border border-green-500/10">
              <p className="font-bold">Student: {selectedStudent.name}</p>
              <p className="font-semibold text-2xs text-ink-3">Trial run by: {selectedStudent.assignedTeacher} at {selectedStudent.scheduledTime}</p>
            </div>

            <form onSubmit={handleEvaluateRequest} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1.5 block text-3xs font-bold uppercase tracking-wider text-ink-3">Pronunciation</label>
                  <select
                    value={evaluationForm.pronunciation}
                    onChange={(e) => setEvaluationForm(prev => ({ ...prev, pronunciation: e.target.value }))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none"
                  >
                    <option value="A">A (Excellent)</option>
                    <option value="B">B (Good)</option>
                    <option value="C">C (Needs Work)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-3xs font-bold uppercase tracking-wider text-ink-3">Reading Fluency</label>
                  <select
                    value={evaluationForm.fluency}
                    onChange={(e) => setEvaluationForm(prev => ({ ...prev, fluency: e.target.value }))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none"
                  >
                    <option value="A">A (Fluent)</option>
                    <option value="B">B (Moderate)</option>
                    <option value="C">C (Slow)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-3xs font-bold uppercase tracking-wider text-ink-3">Student Focus</label>
                  <select
                    value={evaluationForm.focus}
                    onChange={(e) => setEvaluationForm(prev => ({ ...prev, focus: e.target.value }))}
                    className="h-10 w-full rounded-xl border border-hairline bg-surface px-2.5 text-xs text-ink focus:outline-none"
                  >
                    <option value="A">A (Highly Attentive)</option>
                    <option value="B">B (Attentive)</option>
                    <option value="C">C (Distracted)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-2xs font-bold uppercase tracking-wider text-ink-3">Recommended Course Level</label>
                <select
                  value={evaluationForm.recommendedLevel}
                  onChange={(e) => setEvaluationForm(prev => ({ ...prev, recommendedLevel: e.target.value }))}
                  className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-xs text-ink focus:outline-none"
                >
                  {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-2xs font-bold uppercase tracking-wider text-ink-3">Academic Coach Notes & Feedback</label>
                <textarea
                  required
                  value={evaluationForm.notes}
                  onChange={(e) => setEvaluationForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Enter trial performance feedback, specific struggles, recommended focus areas..."
                  className="w-full h-24 p-3 rounded-xl border border-hairline bg-surface text-xs text-ink focus:outline-none focus:border-[#5b73e8] resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setEvaluationModalOpen(false); setSelectedStudent(null); }}
                  className="h-10 px-4 font-bold text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="h-10 px-5 font-bold text-xs bg-green-600 text-white hover:bg-green-700 rounded-xl"
                >
                  Complete Evaluation
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: INQUIRY STUDENT DETAILS MODAL */}
      {selectedStudent && !scheduleModalOpen && !evaluationModalOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface border border-hairline w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl animate-scale-up p-6 space-y-5">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-hairline pb-3.5">
              <div>
                <span className="text-3xs font-extrabold text-ink-3 uppercase tracking-widest">{selectedStudent.id}</span>
                <h3 className="font-bold text-lg text-ink mt-0.5">{selectedStudent.name}</h3>
              </div>
              <button 
                onClick={() => setSelectedStudent(null)}
                className="size-8 rounded-full bg-surface-2 hover:bg-surface-3 transition-colors grid place-items-center text-ink-2 cursor-pointer"
              >
                <XCircle className="size-4" />
              </button>
            </div>

            {/* Profile Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="border border-hairline p-3 rounded-xl bg-surface-2/30 space-y-1">
                <p className="text-[10px] font-bold text-ink-3 uppercase tracking-wider">Inquiry Info</p>
                <p className="font-semibold text-ink-2">Course Interest: <span className="font-bold text-accent">{selectedStudent.course}</span></p>
                <p className="font-semibold text-ink-2">Age: <span className="font-bold text-ink">{selectedStudent.age || "N/A"} years</span></p>
                <p className="font-semibold text-ink-2">Preferred Coach: <span className="font-bold text-ink">{selectedStudent.prefTeacherGender} Teacher</span></p>
              </div>

              <div className="border border-hairline p-3 rounded-xl bg-surface-2/30 space-y-1">
                <p className="text-[10px] font-bold text-ink-3 uppercase tracking-wider">Contact & Location</p>
                <p className="font-semibold text-ink-2 flex items-center gap-1.5"><Mail className="size-3 text-ink-3" /> {selectedStudent.email}</p>
                <p className="font-semibold text-ink-2 flex items-center gap-1.5"><Phone className="size-3 text-ink-3" /> {selectedStudent.mobile}</p>
                <p className="font-semibold text-ink-2 flex items-center gap-1.5"><MapPin className="size-3 text-ink-3" /> {selectedStudent.country} ({selectedStudent.timezone || "N/A"})</p>
              </div>
            </div>

            {/* Focus Goals */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-ink-3 uppercase tracking-wider">Focus & Goals</p>
              <div className="p-3.5 border border-hairline bg-surface-2/10 rounded-2xl text-xs text-ink-2 leading-relaxed">
                {selectedStudent.goals || "No specific learning goals specified by the student."}
              </div>
            </div>

            {/* Trial Class Data if scheduled/completed */}
            {(selectedStudent.status === "SCHEDULED" || selectedStudent.status === "COMPLETED") && (
              <div className="border border-hairline p-4 rounded-2xl bg-surface-3/50 space-y-2.5">
                <p className="text-[10px] font-bold text-ink-3 uppercase tracking-wider flex items-center gap-1">
                  <CalendarDays className="size-3.5 text-accent" />
                  Trial Class Details
                </p>
                <div className="grid grid-cols-2 gap-3 text-2xs">
                  <p className="font-semibold text-ink-2">Assigned Teacher: <span className="font-bold text-ink">{selectedStudent.assignedTeacher}</span></p>
                  <p className="font-semibold text-ink-2">Scheduled Time: <span className="font-bold text-accent">{selectedStudent.scheduledTime}</span></p>
                </div>
                {selectedStudent.meetLink && (
                  <div className="text-2xs bg-surface border border-hairline px-3 py-2 rounded-xl flex items-center justify-between">
                    <span className="font-bold text-ink-3 truncate max-w-[150px]">{selectedStudent.meetLink}</span>
                    <a 
                      href={selectedStudent.meetLink} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="text-xs text-[#886cff] font-bold hover:underline inline-flex items-center gap-1"
                    >
                      <Video className="size-3.5" />
                      Open Link
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Evaluation Results if completed */}
            {selectedStudent.status === "COMPLETED" && selectedStudent.grades && (
              <div className="border border-hairline p-4 rounded-2xl bg-green-500/5 space-y-3">
                <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider flex items-center gap-1">
                  <Award className="size-3.5 text-green-600" />
                  Academic Coach Evaluation Report
                </p>
                <div className="grid grid-cols-3 gap-2.5 text-center">
                  <div className="bg-surface border border-green-500/10 p-2 rounded-xl">
                    <span className="block text-[8px] font-bold text-ink-3 uppercase">Pronunciation</span>
                    <span className="text-base font-black text-green-600">{selectedStudent.grades.pronunciation}</span>
                  </div>
                  <div className="bg-surface border border-green-500/10 p-2 rounded-xl">
                    <span className="block text-[8px] font-bold text-ink-3 uppercase">Fluency</span>
                    <span className="text-base font-black text-blue-500">{selectedStudent.grades.fluency}</span>
                  </div>
                  <div className="bg-surface border border-green-500/10 p-2 rounded-xl">
                    <span className="block text-[8px] font-bold text-ink-3 uppercase">Focus</span>
                    <span className="text-base font-black text-amber-500">{selectedStudent.grades.focus}</span>
                  </div>
                </div>
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-ink-2">Recommended course level: <span className="font-bold text-green-600">{selectedStudent.recommendedLevel}</span></p>
                  <p className="text-ink-3 leading-normal bg-surface p-3 rounded-xl border border-hairline mt-1">{selectedStudent.evaluationNotes}</p>
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex justify-end gap-2 border-t border-hairline pt-3 bg-surface">
              <Button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="h-10 px-5 font-bold text-xs cursor-pointer"
              >
                Close Profile
              </Button>
              {selectedStudent.status === "PENDING" && (
                <Button
                  type="button"
                  onClick={() => setScheduleModalOpen(true)}
                  className="h-10 px-5 font-bold text-xs bg-accent text-white hover:bg-indigo-600 rounded-xl cursor-pointer"
                >
                  Schedule Trial Now
                </Button>
              )}
              {selectedStudent.status === "SCHEDULED" && (
                <Button
                  type="button"
                  onClick={() => setEvaluationModalOpen(true)}
                  className="h-10 px-5 font-bold text-xs bg-green-600 text-white hover:bg-green-700 rounded-xl cursor-pointer"
                >
                  Grade Trial Evaluation
                </Button>
              )}
            </div>

          </div>
        </div>
      )}
    </>
  );
}
