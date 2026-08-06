"use client";

import { useParams } from "next/navigation";

import { Topbar } from "@/components/layout/topbar";
import { MeetingDetail } from "@/components/meetings/meeting-detail";

export default function AdminMeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <Topbar title="Meeting" subtitle="Attendance, minutes and action items" />
      <MeetingDetail id={id} backHref="/meetings" />
    </>
  );
}
