"use client";

import Link from "next/link";
import { CalendarClock, Users, ListChecks, Paperclip } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AttendanceBadge, MEETING_TYPE_LABELS, MeetingStatusBadge, MinutesBadge,
  fmtDateTime, fmtDuration, relativeWhen,
} from "./shared";
import type { MeetingListRow } from "@/lib/api";

/**
 * One meeting as a card. Used by every panel's list, so a meeting looks the
 * same to the teacher who has to attend it and the admin who scheduled it.
 */
export function MeetingCard({ m, href }: { m: MeetingListRow; href: string }) {
  const when = relativeWhen(m.startsAt, m.endsAt, m.status);
  return (
    <Link href={href} className="block">
      <Card className="border border-hairline bg-surface transition hover:border-accent hover:shadow-sm">
        <CardBody className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-ink">{m.title}</p>
              <p className="mt-0.5 text-[11px] text-ink-3">
                {MEETING_TYPE_LABELS[m.type] ?? m.type} · {fmtDateTime(m.startsAt)} · {fmtDuration(m.durationMins)}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <Badge tone={when.tone}>{when.label}</Badge>
              <MeetingStatusBadge status={m.status} />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-ink-3">
            <span className="flex items-center gap-1">
              <Users className="size-3.5" /> {m.participantCount}
              {m.status === "COMPLETED" ? ` · ${m.attendedCount} attended` : ""}
            </span>
            {m.actionItemCount ? (
              <span className="flex items-center gap-1">
                <ListChecks className="size-3.5" /> {m.actionItemCount}
              </span>
            ) : null}
            {m.attachmentCount ? (
              <span className="flex items-center gap-1">
                <Paperclip className="size-3.5" /> {m.attachmentCount}
              </span>
            ) : null}
            {m.organizerName ? <span>· {m.organizerName}</span> : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {/*
              * Minutes state is shown only once a meeting is over — flagging
              * "No minutes" on something scheduled for next week is noise, and
              * it is the outstanding ones a supervisor is looking for.
              */}
            {m.status === "COMPLETED" || new Date(m.endsAt) < new Date() ? (
              <MinutesBadge status={m.minutesStatus} />
            ) : null}
            {m.myStatus && m.myStatus !== "INVITED" ? <AttendanceBadge status={m.myStatus} /> : null}
            {m.seriesId ? <Badge tone="neutral">Recurring</Badge> : null}
            {m.isOrganizer ? <Badge tone="accent">You organise this</Badge> : null}
          </div>

          {m.cancelReason ? (
            <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">{m.cancelReason}</p>
          ) : null}
        </CardBody>
      </Card>
    </Link>
  );
}

export function EmptyMeetings({ text }: { text: string }) {
  return (
    <Card className="border border-hairline bg-surface">
      <CardBody className="p-12 text-center">
        <CalendarClock className="mx-auto size-8 text-ink-3" />
        <p className="mt-3 text-sm font-bold text-ink">Nothing here</p>
        <p className="mt-1 text-xs text-ink-3">{text}</p>
      </CardBody>
    </Card>
  );
}
