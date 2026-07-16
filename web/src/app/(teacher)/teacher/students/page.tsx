"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Search,
  Mail,
  MapPin,
  Globe,
  Loader2,
  Calendar,
  Contact,
  Award,
  BookOpen,
  Filter,
} from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { fetchTeacherStudents, resolveFileUrl } from "@/lib/api";

export default function TeacherStudents() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState("ALL");

  useEffect(() => {
    fetchTeacherStudents()
      .then((res) => {
        setStudents(res);
      })
      .catch((err) => {
        console.error("Failed to fetch students roster", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Compute unique countries list for filtering
  const uniqueCountries = Array.from(new Set(students.map((s) => s.country))).filter(Boolean);

  const filtered = students.filter((s) => {
    const q = searchQuery.toLowerCase();
    const fullName = `${s.firstName} ${s.lastName}`.toLowerCase();
    const matchesSearch =
      fullName.includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.studentCode?.toLowerCase().includes(q);

    const matchesCountry = countryFilter === "ALL" || s.country === countryFilter;

    return matchesSearch && matchesCountry;
  });

  if (loading) {
    return (
      <>
        <Topbar title="My Students" subtitle="Manage your students details" />
        <div className="flex h-[calc(100vh-4.5rem)] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" />
            <p className="mt-3 text-sm font-bold text-ink-3">Loading student roster...</p>
          </div>
        </div>
      </>
    );
  }

  // Quick stats values
  const totalCount = students.length;
  const regionsCount = uniqueCountries.length;

  return (
    <>
      <Topbar title="My Students" subtitle="Review active student details for your assigned courses" />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-full mx-auto">
        
        {/* Futuristic Roster Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
            <div className="size-12 rounded-2xl bg-accent-soft/20 text-accent flex items-center justify-center shrink-0">
              <Users className="size-6" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Total Enrolled</span>
              <h4 className="text-xl font-black text-ink leading-none mt-1">{totalCount} Students</h4>
            </div>
          </Card>

          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
            <div className="size-12 rounded-2xl bg-good-soft/20 text-good flex items-center justify-center shrink-0">
              <Globe className="size-6" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Global Locations</span>
              <h4 className="text-xl font-black text-ink leading-none mt-1">{regionsCount} Regions</h4>
            </div>
          </Card>

          <Card className="border border-hairline bg-surface rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition">
            <div className="size-12 rounded-2xl bg-warning-soft/20 text-warning flex items-center justify-center shrink-0">
              <Award className="size-6" />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold text-ink-3 uppercase tracking-wider">Average Progress</span>
              <h4 className="text-xl font-black text-ink leading-none mt-1">Grade A+</h4>
            </div>
          </Card>
        </div>

        {/* Filters control center bar */}
        <Card className="border border-hairline bg-surface rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
            
            <h3 className="font-extrabold text-sm text-ink flex items-center gap-2">
              <Contact className="size-4.5 text-accent" />
              Class Roster ({filtered.length})
            </h3>

            {/* Filter controls */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              
              {/* Region Selector */}
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3 pointer-events-none" />
                <select
                  value={countryFilter}
                  onChange={(e) => setCountryFilter(e.target.value)}
                  className="h-9.5 pl-9 pr-8 rounded-xl border border-hairline bg-surface text-xs font-bold text-ink-2 focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer appearance-none min-w-[150px]"
                >
                  <option value="ALL">All Regions</option>
                  {uniqueCountries.map((c: any) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Text Search */}
              <div className="relative sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search students by name, ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9.5 w-full pl-9 pr-4 rounded-xl border border-hairline bg-surface text-xs focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-ink-3"
                />
              </div>

            </div>

          </div>
        </Card>

        {/* Student Cards Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((s) => (
              <Card key={s.id} className="border border-hairline bg-surface rounded-3xl p-5 flex flex-col items-center text-center space-y-4 hover:shadow-md transition">
                {/* Avatar */}
                <div className="size-16 rounded-2xl overflow-hidden bg-accent-soft/25 text-accent flex items-center justify-center font-extrabold text-lg border border-hairline">
                  {s.avatarUrl ? (
                    <img
                      src={resolveFileUrl(s.avatarUrl)}
                      alt={`${s.firstName} ${s.lastName}`}
                      className="size-full object-cover"
                    />
                  ) : (
                    <span>
                      {s.firstName.substring(0, 1).toUpperCase()}
                      {s.lastName.substring(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Name */}
                <div className="space-y-1">
                  <h4 className="font-extrabold text-xs text-ink truncate leading-tight">
                    {s.firstName} {s.lastName}
                  </h4>
                  <span className="inline-block text-[8px] text-ink-3 font-extrabold uppercase tracking-wider">
                    Student ID: {s.studentCode}
                  </span>
                </div>

                {/* Info Block */}
                <div className="w-full border-t border-hairline pt-3 space-y-2 text-left text-[11px] font-semibold text-ink-2">
                  <p className="flex items-center gap-2">
                    <Mail className="size-3.5 text-ink-3 shrink-0" />
                    <span className="truncate" title={s.email}>{s.email}</span>
                  </p>
                  {s.phone && (
                    <p className="flex items-center gap-2">
                      <span className="text-[10px] text-ink-3 shrink-0 font-extrabold w-3.5 text-center">TEL</span>
                      <span className="truncate">{s.phone}</span>
                    </p>
                  )}
                  {s.country && (
                    <p className="flex items-center gap-2">
                      <MapPin className="size-3.5 text-ink-3 shrink-0" />
                      <span>{s.country}</span>
                    </p>
                  )}
                  <p className="flex items-center gap-2 text-[10px] text-ink-3">
                    <Calendar className="size-3.5 text-ink-3 shrink-0" />
                    <span>Enrolled: {new Date(s.joinedAt).toLocaleDateString()}</span>
                  </p>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 space-y-3 bg-surface border border-hairline rounded-3xl p-6">
            <Users className="size-14 text-ink-3/30 mx-auto" />
            <h5 className="font-extrabold text-sm text-ink">No students found</h5>
            <p className="text-xs text-ink-3 max-w-[280px] mx-auto leading-relaxed">
              There are no students currently enrolled in your courses matching the search details.
            </p>
          </div>
        )}
      </main>
    </>
  );
}
