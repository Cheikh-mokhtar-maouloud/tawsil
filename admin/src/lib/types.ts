export type OrderStatus = "searching" | "accepted" | "picked_up" | "delivered" | "cancelled" | "no_courier";
export type OrderType = "letter" | "small" | "large";

export type PublicUser = {
  id: number;
  phone?: string;
  name: string;
  role: "customer" | "courier";
  status: "active" | "pending" | "suspended";
  vehicle?: string | null;
  plate?: string | null;
  available: boolean;
  rating: number | null;
  hasDocuments: boolean;
};

export type Order = {
  id: number;
  type: OrderType;
  status: OrderStatus;
  pickup: { address: string; lat: number; lng: number };
  dropoff: { address: string; lat: number; lng: number };
  recipient: { name: string; phone: string | null };
  notes: string | null;
  distanceKm: number;
  price: number;
  courierFee: number;
  paymentMethod: string;
  deliveryCode?: string;
  rating: number | null;
  ratingComment: string | null;
  cancelReason: string | null;
  customer: PublicUser;
  courier: PublicUser | null;
  createdAt: string;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  cashSettled: boolean;
};

export type TimelineMessage = {
  id: number;
  kind: "text" | "voice" | "system" | "call";
  senderId: number | null;
  senderRole: "customer" | "courier" | "system";
  senderName: string | null;
  body: string | null;
  hasAudio: boolean;
  purged: boolean;
  duration: number | null;
  call: { status: string; duration: number | null } | null;
  callId: number | null;
  createdAt: string;
  listenedAt: string | null;
};

export type TimelineCall = {
  id: number;
  callerId: number;
  calleeId: number;
  status: string;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  duration: number | null;
  hasRecording: boolean;
};

export type Complaint = {
  id: number;
  order_id: number;
  opened_by: number;
  opened_by_name: string;
  opened_by_role: "customer" | "courier";
  reason: string;
  details: string | null;
  status: "open" | "reviewing" | "resolved";
  decision: "customer" | "courier" | "info_requested" | null;
  decision_note: string | null;
  assigned_name: string | null;
  decided_by_name?: string | null;
  decided_at: string | null;
  created_at: string;
};

export type AccessEntry = {
  id: number;
  admin_name: string;
  username?: string;
  complaint_id: number | null;
  order_id: number | null;
  target_type: string;
  target_id: number;
  action: string;
  created_at: string;
};
