export type Role = 'customer' | 'courier';
export type OrderStatus = 'searching' | 'accepted' | 'picked_up' | 'delivered' | 'cancelled' | 'no_courier';
export type OrderType = 'letter' | 'small' | 'large';

export type User = {
  id: number;
  phone?: string;
  name: string;
  role: Role;
  status: 'active' | 'pending' | 'suspended';
  language: 'ar' | 'fr';
  vehicle?: string | null;
  plate?: string | null;
  available: boolean;
  rating: number | null;
  hasDocuments: boolean;
};

export type Party = Pick<User, 'id' | 'name' | 'role' | 'vehicle' | 'plate' | 'rating'> & { lat?: number; lng?: number };

export type Order = {
  id: number;
  type: OrderType;
  status: OrderStatus;
  pickup: { address: string; lat: number; lng: number };
  dropoff: { address: string; lat: number; lng: number };
  recipient: { name: string; phone: string | null };
  notes: string | null;
  locationVoice: { url: string; duration: number | null } | null;
  distanceKm: number;
  price: number;
  courierFee?: number;
  paymentMethod: string;
  deliveryCode?: string;
  pickupPhoto: string | null;
  rating: number | null;
  cancelReason: string | null;
  customer: Party;
  courier: Party | null;
  createdAt: string;
  deliveredAt: string | null;
};

export type Message = {
  id: number;
  orderId: number;
  kind: 'text' | 'voice' | 'system' | 'call';
  senderId: number | null;
  senderRole: Role | 'system';
  senderName: string | null;
  body: string | null;
  audioUrl: string | null;
  purged: boolean;
  duration: number | null;
  call: { status: string; duration: number | null } | null;
  createdAt: string;
  listenedAt: string | null;
};

export type Quote = {
  distanceKm: number;
  price: number;
  courierFee: number;
  currency: string;
  tooFar: boolean;
  maxDistanceKm: number;
};

export type Offer = { order: Order; distanceToPickupKm?: number; expiresAt: number };

export type CallInfo = {
  callId: number;
  orderId: number;
  channel: string;
  appId: string;
  uid: number;
  token: string;
  incoming: boolean;
  peerName: string;
};
