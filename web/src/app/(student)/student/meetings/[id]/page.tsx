"use client";

import { useParams } from "next/navigation";

import { Topbar } from "@/components/layout/topbar";
import { MeetingDetail } from "@/components/meetings/meeting-detail";

export default function StudentMeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <Topbar title="Meeting" subtitle="Your meeting with the academy" />
      <MeetingDetail id={id} backHref="/student/meetings" />
    </>
  );
}
