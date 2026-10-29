export type Role =
  | "customer" | "sales" | "operator" | "tour_manager" | "accountant"
  | "content_editor" | "guide" | "super_admin";

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled" | "expired";
export type PaymentStatus = "unpaid" | "deposit_paid" | "paid" | "partially_refunded" | "refunded";
export type PaymentTxnStatus = "initiated" | "pending" | "succeeded" | "failed" | "cancelled" | "expired";
export type DepartureStatus = "draft" | "open" | "full" | "closed" | "departed" | "completed" | "cancelled";
export type TourStatus = "draft" | "published" | "hidden" | "archived";
export type RefundStatus = "requested" | "approved" | "processing" | "completed" | "rejected" | "failed";
export type PassengerType = "adult" | "child" | "infant";
export type BookingAction =
  | "pay_deposit" | "pay_balance" | "cancel" | "request_cancel" | "request_change"
  | "edit_passengers" | "download_voucher" | "request_invoice" | "review";

export type IsoDate = string;
export type IsoDateTime = string;

export interface SessionUser {
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
  roles: Role[];
  primaryRole: Role;
  permissions: string[];
  emailVerified: boolean;
  status: "active" | "locked";
  marketingConsent: boolean;
  mfaEnabled: boolean;
  createdAt: string;
}

export interface PublicConfig {
  appName: string;
  hotline: string;
  supportEmail: string;
  bank: { name: string; bin?: string; accountName: string; accountNumber: string; branch: string };
  paymentMethods: { id: string; label: string; description: string; enabled: boolean }[];
  termsVersion: string;
  maxPaxOnline: number;
  depositDefaultPercent: number;
  fullRequiredDays: number;
  balanceDueDays: number;
  selfServiceMinDays: number;
  passengerEditCutoffDays: number;
  reviewWindowDays: number;
  invoiceDeadlineDays: number;
  refundSlaDays: number;
  holdMinPaymentMinutes: number;
  devOutbox: boolean;
  serverTime: string;
}

export interface Destination {
  id: number;
  name: string;
  slug: string;
  region: "north" | "central" | "south";
  province: string;
  description: string;
  image: string | null;
  lat: number | null;
  lng: number | null;
  active: boolean;
  tourCount?: number;
  cover?: string;
  fromPrice?: number | null;
  tours?: TourSummary[];
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  active: boolean;
  tourCount?: number;
  tours?: TourSummary[];
}

export interface TourSummary {
  id: number;
  slug: string;
  name: string;
  summary?: string;
  destinationName: string;
  destinationSlug?: string;
  region?: string;
  category: string;
  categorySlug?: string;
  durationDays: number;
  durationNights: number;
  cover: string | null;
  images?: { url: string; alt: string }[];
  priceFrom: number | null;
  nextDeparture: IsoDate | null;
  seatsLeftNext: number | null;
  ratingAvg: number | null;
  ratingCount: number;
  status?: TourStatus;
}

export interface ItineraryDay {
  dayNo: number;
  title: string;
  content: string;
  meals: ("breakfast" | "lunch" | "dinner")[];
  accommodation: string | null;
  places: string[];
}

export interface CancellationPolicy {
  id?: number;
  name: string;
  description?: string;
  tiers: { minDaysBefore: number; maxDaysBefore: number | null; feePercent: number }[];
}

export interface TourDetail extends TourSummary {
  description: string;
  highlights: string[];
  itinerary: ItineraryDay[];
  inclusions: string[];
  exclusions: string[];
  notes: string | null;
  meetingPointDefault: string;
  ageInfantMax: number;
  ageChildMax: number;
  requiresIdDocument: boolean;
  requiresPassport: boolean;
  depositPercent: number;
  minPax: number;
  maxPax: number;
  seoTitle: string;
  seoDescription: string;
  destination: Destination | null;
  cancellationPolicy: CancellationPolicy;
  departures: Departure[];
  related: TourSummary[];
  reviews: ReviewPublic[];
}

export interface Departure {
  id: number;
  tourId: number;
  departureDate: IsoDate;
  returnDate: IsoDate;
  status: DepartureStatus;
  seatsLeft: number;
  capacity?: number;
  seatsTaken?: number;
  isGuaranteed: boolean;
  priceAdult: number;
  priceChild: number;
  priceInfant: number;
  singleSupplement: number;
  meetingPoint: string;
  meetingTime: string;
  bookingCutoffAt: IsoDateTime;
  balanceDueDate?: IsoDate;
  minPaxToRun?: number;
  cancelReason?: string | null;
}

export interface QuoteLine {
  type: PassengerType | "single_supplement";
  qty: number;
  unitPrice: number;
  amount: number;
}

export interface Quote {
  departureId: number;
  departure: Departure;
  lines: QuoteLine[];
  subtotal: number;
  discountTotal: number;
  total: number;
  coupon: { code: string; valid: boolean; reason?: string; discount?: number; minOrder?: number } | null;
  deposit: { percent: number; amount: number; dueNow: number; balance: number };
  balanceDueDate: IsoDate;
  fullPaymentRequired: boolean;
  daysToDeparture: number;
  adults: number;
  children: number;
  infants: number;
  singles: number;
  seatsRequired: number;
  seatsLeft: number;
  reclassified: { index: number; from: PassengerType; to: PassengerType }[];
  notices: string[];
  existingPending: { code: string; holdExpiresAt: IsoDateTime } | null;
  serverTime: string;
}

export interface PassengerInput {
  fullName: string;
  gender: "male" | "female" | "other";
  dateOfBirth: IsoDate;
  idNumber?: string;
  passportNumber?: string;
  nationality?: string;
  specialRequest?: string;
}

export interface Passenger extends PassengerInput {
  id: number;
  bookingId: number;
  type: PassengerType;
  isLead: boolean;
  idNumber?: string;
  passportNumber?: string;
}

export interface Payment {
  id: number;
  bookingId: number;
  purpose: "deposit" | "balance" | "full";
  method: string;
  provider: string;
  amount: number;
  status: PaymentTxnStatus;
  merchantRef: string;
  providerTxnId: string | null;
  paidAt: IsoDateTime | null;
  proofUrl: string | null;
  confirmedBy: number | null;
  note: string | null;
  flag?: string | null;
  createdAt: IsoDateTime;
  reconciledAt?: IsoDateTime | null;
}

export interface Refund {
  id: number;
  bookingId: number;
  paymentId: number | null;
  amount: number;
  type: "cash_back" | "credit";
  reasonCode: string;
  policyApplied: string;
  status: RefundStatus;
  requestedBy: number | null;
  approvedBy: number | null;
  approvals?: { by: number; at: string }[];
  processedAt: IsoDateTime | null;
  providerRefundId: string | null;
  note: string | null;
  createdAt: IsoDateTime;
}

export interface ChangeRequest {
  id: number;
  bookingId: number;
  type: "cancel" | "change_date" | "change_pax" | "transfer" | "update_passenger";
  payload: { newDepartureId?: number; reasonCode?: string; note?: string; from?: string; to?: string };
  feeQuote: Record<string, unknown> | null;
  status: "submitted" | "approved" | "rejected" | "completed" | "withdrawn";
  requestedBy: number | null;
  decidedBy: number | null;
  decisionNote: string | null;
  createdAt: IsoDateTime;
}

export interface BookingHistoryRow {
  id: number;
  bookingId: number;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  actorId: number | null;
  actorType: "customer" | "staff" | "system";
  note: string | null;
  createdAt: IsoDateTime;
}

export interface Invoice {
  id: number;
  bookingId: number;
  taxCode: string;
  companyName: string;
  address: string;
  email: string;
  invoiceNo: string | null;
  issuedAt: IsoDateTime | null;
  status: "requested" | "issued" | "cancelled" | "replaced";
  requestedAt: string;
  cancelReason?: string;
}

export interface ReviewPublic {
  id: number;
  rating: number;
  comment: string;
  user: string;
  reply: string | null;
  createdAt: string;
}

export interface BookingSummary {
  code: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  tour: { id: number; slug: string; name: string; cover: string | null; destinationName?: string; durationDays?: number };
  departure: Departure;
  adults: number;
  children: number;
  infants: number;
  total: number;
  paidAmount: number;
  grossPaid: number;
  remaining: number;
  holdExpiresAt: IsoDateTime | null;
  balanceDueDate: IsoDate | null;
  channel?: string;
  createdAt: string;
  allowedActions: BookingAction[];
}

export interface BookingDetail extends BookingSummary {
  contact: { fullName: string; email: string; phone: string };
  singles: number;
  priceSnapshot: QuoteLine[];
  subtotal: number;
  discountTotal: number;
  couponCode: string | null;
  depositRequired: number;
  refundedAmount: number;
  customerNote: string | null;
  cancelBy?: "customer" | "staff" | "company" | "system" | null;
  cancelReasonCode?: string | null;
  cancelledAt?: string | null;
  version: number;
  passengers: Passenger[];
  payments: Payment[];
  refunds: Refund[];
  history: BookingHistoryRow[];
  changeRequests: ChangeRequest[];
  invoice: Invoice | null;
  review: { id: number; rating: number; comment: string; status: string; reply: string | null } | null;
  cancellationPolicy: CancellationPolicy;
  serverTime: string;
}

export interface Review {
  id: number;
  bookingId: number;
  tourId: number;
  userId: number;
  rating: number;
  comment: string;
  status: "pending" | "approved" | "rejected" | "hidden";
  reply: string | null;
  createdAt: string;
}

export interface Notification {
  id: number;
  userId: number | null;
  type: string;
  title: string;
  content: string;
  channel: string;
  readAt: string | null;
  link: string | null;
  priority: string;
  createdAt: string;
}

export interface Meta {
  page?: number;
  perPage?: number;
  total?: number;
  totalPages?: number;
  serverTime?: string;
  [key: string]: unknown;
}

export interface HomeData {
  banners: { id: number; title: string; subtitle: string; image: string; ctaLabel: string; ctaHref: string }[];
  featured: TourSummary[];
  tours: TourSummary[];
  destinations: Destination[];
  categories: Category[];
  stats: { tours: number; destinations: number; completedBookings: number; ratingAvg: number | null; reviewCount: number };
  reviews: { id: number; rating: number; comment: string; user: string; tour: string; reply: string | null }[];
}

export interface AdminDepartureRow extends Departure {
  tourName: string;
  tourSlug: string;
  fillRate: number;
  bookings: number;
  revenue: number;
  collected: number;
  outstanding: number;
  costTotal: number;
  version: number;
  createdAt: string;
}

export interface AdminBookingRow {
  id: number;
  code: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  tour: { id: number; name: string; slug: string };
  departureId: number;
  departureDate: string;
  returnDate: string;
  adults: number;
  children: number;
  infants: number;
  total: number;
  paid: number;
  remaining: number;
  holdExpiresAt: string | null;
  balanceDueDate: string | null;
  channel: string;
  assignedTo: number | null;
  assignedName: string | null;
  createdAt: string;
  version: number;
  cancelBy?: string | null;
  cancelReasonCode?: string | null;
}

export interface AdminUserRow {
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
  roles: Role[];
  roleLabels: string[];
  status: "active" | "locked";
  emailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface TicketRow {
  id: number;
  code: string;
  userId: number | null;
  subject: string;
  message: string;
  type: "support" | "complaint" | "custom_tour";
  status: "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  assignedTo: number | null;
  assignedName?: string | null;
  slaDueAt: string;
  slaOverdue?: boolean;
  createdAt: string;
  customerName?: string | null;
  customerEmail?: string | null;
}
