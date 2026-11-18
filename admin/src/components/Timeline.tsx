"use client";

import { fmtDuration, fmtTime, fmtDateTime } from "@/lib/format";
import type { Order, TimelineCall, TimelineMessage } from "@/lib/types";
import { ProtectedMedia } from "./ui";

type Item = { at: string; key: string; node: React.ReactNode; cls?: string };

/**
 * السجل الزمني الكامل للطلب: مراحل الطلب، الرسائل النصية والصوتية، المكالمات المسجلة، وصورة الاستلام.
 * الإدارة تستمع من هنا عند مراجعة الشكوى.
 */
export default function Timeline({
  order,
  messages,
  calls,
  complaintId,
}: {
  order: Order;
  messages: TimelineMessage[];
  calls: TimelineCall[];
  complaintId?: number;
}) {
  const who = (role: string, name: string | null) =>
    role === "customer" ? `الزبون${name ? ` (${name})` : ""}` : role === "courier" ? `الموصّل${name ? ` (${name})` : ""}` : "النظام";
  const callById = new Map(calls.map((c) => [c.id, c]));
  const items: Item[] = [];

  items.push({ at: order.createdAt, key: "created", cls: "system", node: <span>أنشأ الزبون الطلب</span> });
  if (order.pickedUpAt)
    items.push({
      at: order.pickedUpAt,
      key: "pickup",
      node: (
        <>
          <span>
            <b>الموصّل</b> · صورة الشحنة عند الاستلام
          </span>
          <ProtectedMedia type="pickup_photo" id={order.id} complaintId={complaintId} />
        </>
      ),
    });

  for (const m of messages) {
    if (m.kind === "system") {
      items.push({ at: m.createdAt, key: `m${m.id}`, cls: "system", node: <span>{m.body}</span> });
    } else if (m.kind === "text") {
      items.push({
        at: m.createdAt,
        key: `m${m.id}`,
        node: (
          <span>
            <b>{who(m.senderRole, m.senderName)}</b> · «{m.body}»
          </span>
        ),
      });
    } else if (m.kind === "voice") {
      items.push({
        at: m.createdAt,
        key: `m${m.id}`,
        node: (
          <>
            <span>
              <b>{who(m.senderRole, m.senderName)}</b> · رسالة صوتية{m.body ? ` (${m.body})` : ""}
              {m.listenedAt ? <span className="muted"> · استمع إليها الطرف الآخر</span> : null}
            </span>
            {m.hasAudio ? (
              <ProtectedMedia type="message" id={m.id} complaintId={complaintId} duration={m.duration} />
            ) : (
              <span className="badge b-gray">حُذف بعد انتهاء مدة الحفظ</span>
            )}
          </>
        ),
      });
    } else if (m.kind === "call") {
      const c = m.callId ? callById.get(m.callId) : undefined;
      const answered = m.call?.status === "ended";
      items.push({
        at: m.createdAt,
        key: `m${m.id}`,
        cls: "call",
        node: (
          <>
            <span>
              <b>{m.body}</b> · من {who(m.senderRole, m.senderName)}
              {answered ? ` · ${fmtDuration(m.call?.duration)}` : ""}
            </span>
            {answered && c?.hasRecording ? (
              <ProtectedMedia type="call" id={c.id} complaintId={complaintId} label="استمع للتسجيل" primary />
            ) : answered ? (
              <span className="badge b-gray">التسجيل غير متوفر</span>
            ) : null}
          </>
        ),
      });
    }
  }

  items.sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div>
      {items.map((it) => (
        <div key={it.key} className={`tl-item ${it.cls ?? ""}`}>
          <span className="tl-time" title={fmtDateTime(it.at)}>
            {fmtTime(it.at)}
          </span>
          <div className="tl-body">{it.node}</div>
        </div>
      ))}
    </div>
  );
}
