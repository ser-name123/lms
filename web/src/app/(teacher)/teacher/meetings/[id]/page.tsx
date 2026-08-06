"use client";

import { useParams } from "next/navigation";

import { Topbar } from "@/components/layout/topbar";
import { MeetingDetail } from "@/components/meetings/meeting-detail";

export default function TeacherMeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <Topbar title="Meeting" subtitle="Join, read the minutes and track your action items" />
      <MeetingDetail id={id} backHref="/teacher/meetings" />
    </>
  );
}
