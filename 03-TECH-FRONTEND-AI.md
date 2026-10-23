# Tài liệu kỹ thuật AI phía Frontend — VietTrails (bản mục tiêu đầy đủ)

| Thuộc tính | Giá trị |
|---|---|
| Phiên bản tài liệu | 2.0 |
| Thay thế / mở rộng | Phần A của `docs/TECHNICAL-DOCUMENTATION.md` v1.0 |
| Phụ thuộc | `01-PRD-NGHIEP-VU.md` (nghiệp vụ), `02-UI-AI-IMPLEMENTATION.md` (giao diện), `04-TECH-ADMIN-AI.md` (API, CSDL, quyền) |
| Đối tượng | Frontend developer, reviewer, QA, **AI lập trình** |
| Phạm vi | Ứng dụng React dành cho **khách** (`/`, `/tours`, `/checkout`, `/account/*`…) và **khung chung** (API client, xác thực, lỗi, định dạng) dùng lại cho khu `/admin` |

> **Nguyên tắc nền tảng.** Máy chủ là **nguồn sự thật duy nhất** cho giá, tồn chỗ, trạng thái, quyền và thời hạn. Frontend **hiển thị, thu thập đầu vào, kiểm tra sơ bộ để phản hồi nhanh** — không quyết định nghiệp vụ. Mọi mục “client tự tính” ở bản hiện tại (mã đơn, tổng tiền, quyền ghi) phải chuyển sang máy chủ.

---

## 1. Công nghệ và ràng buộc

### 1.1 Nền hiện có (giữ nguyên)

React 19 · TypeScript (strict) · Vite · React Router 7 · Zustand 5 · CSS toàn cục (`src/styles.css`) · build `tsc -b && vite build`.

### 1.2 Bổ sung **đề xuất** (cần người phụ trách duyệt trước khi cài)

| Thư viện | Mục đích | Lý do |
|---|---|---|
| `@tanstack/react-query` | Trạng thái máy chủ (cache, refetch, hủy, thử lại) | Thay mô hình “nạp toàn bộ dữ liệu vào Zustand” (`DatabaseGate`) vốn không chạy được với phân trang/tìm kiếm máy chủ |
| `zod` | Schema kiểm tra dữ liệu + suy ra kiểu | Một nguồn quy tắc cho biểu mẫu; kiểm tra phản hồi API |
| `react-hook-form` + `@hookform/resolvers` | Biểu mẫu lớn (hành khách) | Hiệu năng form động, tích hợp zod |
| `date-fns` (+ `date-fns-tz`) | Ngày/múi giờ | Tính tuổi theo ngày khởi hành, định dạng `vi-VN`, `Asia/Ho_Chi_Minh` |
| `dompurify` | Lọc HTML từ CMS | Chỉ khi hiển thị nội dung CMS dạng HTML |
| `vitest`, `@testing-library/react`, `msw`, `@playwright/test`, `eslint` + `typescript-eslint`, `prettier` | Kiểm thử và chất lượng | `package.json` hiện **chưa có** test/lint |

Không thêm thư viện UI (component kit) nếu CSS/component nội bộ đủ dùng (xem `02`, mục 2.3).

### 1.3 Ràng buộc cố định

- TypeScript strict; **cấm `any`** và `@ts-ignore` để lách lỗi nghiệp vụ.
- Mọi truy cập mạng đi qua **một** module `src/lib/api` — không `fetch` rải rác trong component.
- Biến môi trường `VITE_*` **không phải bí mật** (bị nhúng vào bundle).
- Tiền: số nguyên VND. Thời điểm: chuỗi ISO 8601 UTC. Ngày nghiệp vụ: `YYYY-MM-DD` (múi giờ `Asia/Ho_Chi_Minh`).

---

## 2. Kiến trúc

```
Trình duyệt
  └─ main.tsx → <AppProviders> (QueryClient, Session, Router, ErrorBoundary)
       └─ App routes (lazy) → Page
            ├─ features/<domain>/hooks (useQuery / useMutation)  ← trạng thái máy chủ
            ├─ features/<domain>/components (UI theo miền)
            ├─ stores (Zustand): session · checkoutDraft · uiPrefs   ← trạng thái cục bộ
            └─ lib/api (fetch + envelope + auth + lỗi + idempotency)
                  └─ HTTPS → API /api/v1  (xem 04-TECH-ADMIN-AI.md)
```

**Phân loại trạng thái (bắt buộc tuân thủ):**

| Loại | Công cụ | Ví dụ | Không được |
|---|---|---|---|
| Dữ liệu máy chủ | React Query | tour, lịch, đơn, báo giá | Sao chép vào Zustand |
| Phiên đăng nhập | Zustand (**bộ nhớ**) | `user`, `permissions`, `accessToken` | Lưu token vào `localStorage`/`sessionStorage` |
| Nháp checkout | Zustand (bộ nhớ) + `sessionStorage` **chỉ trường không nhạy cảm** | lịch, số khách, họ tên | Lưu số giấy tờ/hộ chiếu |
| Trạng thái URL | Search params | bộ lọc, trang, sắp xếp | Giữ trong state riêng làm lệch URL |
| Trạng thái form | react-hook-form | giá trị ô nhập, lỗi | Dùng làm nguồn dữ liệu nghiệp vụ |
| UI tạm | `useState` | dialog mở/đóng, tab | |

---

## 3. Cấu trúc thư mục mục tiêu

```text
src/
  app/            AppProviders.tsx, routes.tsx, AppBootstrap.tsx, ErrorBoundary.tsx
  components/     (dùng chung) StatusChip, DataTable, ConfirmDialog, ... (02 §2.3)
  features/
    auth/         api.ts, hooks.ts, sessionStore.ts, guards/, pages/
    catalog/      tours + destinations + categories: api.ts, hooks.ts, types.ts, components/
    departures/   api.ts, hooks.ts, components/ (DepartureCalendar, PaxStepper)
    checkout/     checkoutStore.ts, machine.ts, schemas.ts, steps/, components/
    bookings/     api.ts, hooks.ts, types.ts, components/ (Timeline, ActionsPanel)
    payments/     api.ts, hooks.ts, components/ (PaymentMethodPicker, BankTransferPanel), usePaymentPolling.ts
    reviews/      api.ts, hooks.ts, components/
    support/      contact/inquiry/tickets
    maps/         (giữ nguyên)
  lib/
    api/          client.ts, errors.ts, envelope.ts, idempotency.ts, endpoints.ts
    format/       money.ts, date.ts, phone.ts
    age.ts        tính loại khách theo ngày khởi hành
    result.ts     (giữ)   id.ts (bỏ phần sinh mã đơn)
    analytics.ts  seo.tsx  a11y/ (useFocusTrap, announce)
  pages/          Trang khách theo route; pages/admin/ (xem 04)
  styles.css      tokens (02 §2.2)
```

**Quy ước:** `features/<x>` không import chéo nội bộ của `features/<y>` (chỉ qua `index.ts` công khai). `components/` không biết về nghiệp vụ của một feature cụ thể.

---

## 4. Định tuyến và chốt truy cập

### 4.1 Bảng tuyến phía khách

Chi tiết màn hình ở `02`, mục 3. Mọi trang `lazy()`; các trang cần dữ liệu hiển thị `Skeleton` qua `Suspense`/trạng thái `isPending`.

| Route | Guard | Dữ liệu (query key) |
|---|---|---|
| `/` | — | `['home']` |
| `/tours` | — | `['tours', params]` |
| `/tours/:slug` | — | `['tour', slug]`, `['departures', tourId, month]`, `['reviews', tourId, page]` |
| `/checkout` | `RequireAuth` + `RequireVerified` | `['quote', payload]` (mutation) |
| `/booking/:code/pay` | `RequireAuth` | `['me','booking', code]` |
| `/payment/result` | `RequireAuth` | `['me','booking', code]` (thăm dò) |
| `/account/*` | `RequireAuth` | `['me', ...]` |
| `/login`, `/register`, `/forgot-password`… | `RedirectIfAuthed` | — |

### 4.2 Guards

```tsx
// Phiên có 3 trạng thái để tránh chuyển hướng nhầm khi đang khởi tạo
type SessionStatus = "loading" | "anonymous" | "authenticated";

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();
  if (status === "loading") return <PageSkeleton />;
  if (status === "anonymous") {
    return <Navigate to="/login" state={{ from: safeFrom(location) }} replace />;
  }
  return <>{children}</>;
}
```

- `safeFrom` chỉ nhận **đường dẫn nội bộ** bắt đầu bằng `/` và không bắt đầu bằng `//` (chống open redirect).
- `RequireVerified`: nếu `user.emailVerified === false` hiển thị màn “Xác minh email để tiếp tục” kèm nút gửi lại (không chuyển đi nơi khác).
- `RequirePermission perm="booking:read"` dùng cho `/admin` (xem `04`). Quyền lấy từ **`permissions[]` do máy chủ trả**, không tra bảng vai trò trong bundle.
- Chuyển hướng tương thích: `/my-bookings`, `/profile`, `/booking` (xem `02` §3).

### 4.3 Khởi tạo ứng dụng (`AppBootstrap`)

Thay `DatabaseGate`. Thứ tự: (1) gọi `POST /auth/refresh` (cookie httpOnly) rồi `GET /me` để khôi phục phiên → `status`; (2) `GET /config/public` (phương thức thanh toán bật, `maxPaxOnline`, hotline, thông tin chuyển khoản hiển thị, cờ tính năng). Hai việc chạy song song; trang công khai **không bị chặn** chờ phiên. Lỗi tải cấu hình: dùng mặc định an toàn và hiển thị banner.

---

## 5. Lớp API (`src/lib/api`)

### 5.1 Hợp đồng chung

- Cơ sở: `VITE_API_BASE_URL` (mặc định `/api/v1`). JSON `camelCase`. `credentials: "include"` (cookie làm mới phiên).
- **Phong bì phản hồi thành công:** `{ "data": T, "meta"?: { page, perPage, total, totalPages, serverTime } }`.
- **Phong bì lỗi:** `{ "error": { "code": string, "message": string, "fields"?: Record<string,string>, "requestId"?: string, ...extra } }`; xem mã lỗi ở PRD Phụ lục A.
- Mỗi yêu cầu gắn `X-Request-Id` (UUID); máy chủ trả lại cùng giá trị để truy vết.

### 5.2 Lỗi và kết quả

```ts
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,          // union mã lỗi PRD Phụ lục A
    message: string,
    public fields?: Record<string, string>,
    public requestId?: string,
    public extra?: Record<string, unknown>, // ví dụ { seatsLeft: 2 }, { reason: "expired" }
  ) { super(message); }
}
export class NetworkError extends Error {}        // mất mạng/timeout
export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
```

Các hàm trong `api.ts` **ném** `ApiError`/`NetworkError`; hooks React Query bắt và component dùng `error`. Hàm `result.ts` (`MutationResult`) chỉ còn dùng ở chỗ cần nhánh rẽ tại chỗ (không bắt buộc).

### 5.3 Client lõi (rút gọn)

```ts
// client.ts
let accessToken: string | null = null;           // chỉ trong bộ nhớ
let refreshing: Promise<boolean> | null = null;  // single-flight

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<ApiResponse<T>> {
  const res = await send(path, opts);
  if (res.status === 401 && !opts.skipAuthRetry) {
    refreshing ??= doRefresh().finally(() => (refreshing = null));
    if (await refreshing) return api<T>(path, { ...opts, skipAuthRetry: true });
    sessionStore.getState().expire();            // → "anonymous"
  }
  return parse<T>(res);
}
```

Yêu cầu của client:

1. **Single-flight refresh:** nhiều yêu cầu cùng 401 chỉ gọi `/auth/refresh` một lần.
2. **Hủy yêu cầu:** nhận `signal`; React Query truyền sẵn. Tìm kiếm/báo giá hủy yêu cầu cũ.
3. **Thử lại:** chỉ cho yêu cầu `GET` hoặc yêu cầu ghi có `Idempotency-Key`; tối đa 2 lần, lùi lũy thừa; **không** thử lại 4xx.
4. **Timeout** mặc định 15 giây (30 giây cho tải tệp) → `NetworkError`.
5. **Idempotency:** hàm trợ giúp `withIdempotency(key)` thêm header `Idempotency-Key`.
6. Không ghi vào console/analytics nội dung body có dữ liệu cá nhân.

### 5.4 Điểm cuối khách dùng (hợp đồng chi tiết ở `04`, mục 6)

| Nhóm | Hàm |
|---|---|
| Danh mục | `listTours(params)`, `getTour(slug)`, `listDepartures(tourId, {from,to})`, `listDestinations()`, `listCategories()`, `listReviews(tourId, page)` |
| Báo giá | `quote(payload)` — `POST /bookings/quote` |
| Đặt chỗ | `createBooking(payload, idempotencyKey)`, `listMyBookings(params)`, `getMyBooking(code)`, `updatePassengers(code, body)` |
| Thanh toán | `initiatePayment(code, {purpose, method})`, `listPayments(code)`, `uploadTransferProof(paymentId, file)` |
| Hủy/đổi | `getCancellationQuote(code)`, `cancelBooking(code, body)`, `createChangeRequest(code, body)` |
| Chứng từ | `getVoucherUrl(code)`, `requestInvoice(code, body)` |
| Tài khoản | `register`, `login`, `logout`, `refresh`, `me`, `updateMe`, `changePassword`, `verifyEmail`, `resendVerification`, `forgotPassword`, `resetPassword`, `listSessions`, `revokeSession`, `deleteAccountRequest` |
| Khác | `createInquiry`, `createTicket`, `createReview`, `getPublicConfig` |

---

## 6. Kiểu dữ liệu hợp đồng (TypeScript)

Nguồn sự thật là **OpenAPI** do backend xuất bản (`04`, mục 6). Ưu tiên **sinh kiểu tự động** (`openapi-typescript`); khối dưới đây là bản tham chiếu, phải khớp PRD mục 5–6.

```ts
export type Role = "customer" | "super_admin" | "tour_manager" | "sales"
  | "operator" | "accountant" | "content_editor" | "guide";

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled" | "expired";
export type PaymentStatus = "unpaid" | "deposit_paid" | "paid" | "partially_refunded" | "refunded";
export type PaymentTxnStatus = "initiated" | "pending" | "succeeded" | "failed" | "cancelled" | "expired";
export type PaymentPurpose = "deposit" | "balance" | "full";
export type PaymentMethod = "vnpay" | "momo" | "zalopay" | "bank_transfer" | "cash" | "pos_card";
export type DepartureStatus = "draft" | "open" | "full" | "closed" | "departed" | "completed" | "cancelled";
export type TourStatus = "draft" | "published" | "hidden" | "archived";
export type RefundStatus = "requested" | "approved" | "processing" | "completed" | "rejected" | "failed";
export type PassengerType = "adult" | "child" | "infant";
export type Money = number;            // VND, số nguyên
export type IsoDateTime = string;      // "2026-03-13T07:30:00Z"
export type IsoDate = string;          // "2026-03-13"

export interface SessionUser {
  id: number; fullName: string; email: string; phone: string | null;
  role: Role; emailVerified: boolean; permissions: string[]; mfaEnabled: boolean;
}

export interface TourSummary {
  id: number; slug: string; name: string; destinationName: string; category: string;
  durationDays: number; durationNights: number; cover: string;
  priceFrom: Money | null; nextDeparture: IsoDate | null; seatsLeftNext: number | null;
  ratingAvg: number | null; ratingCount: number;
}
export interface TourDetail extends TourSummary {
  summary: string; description: string; highlights: string[];
  itinerary: { dayNo: number; title: string; content: string; meals: ("breakfast"|"lunch"|"dinner")[];
               accommodation: string | null; places: string[] }[];
  inclusions: string[]; exclusions: string[]; notes: string | null;
  images: { url: string; alt: string }[];
  ageInfantMax: number; ageChildMax: number;
  requiresIdDocument: boolean; requiresPassport: boolean;
  depositPercent: number; minPax: number; maxPax: number;
  cancellationPolicy: { name: string; tiers: { minDaysBefore: number; maxDaysBefore: number | null; feePercent: number }[] };
}
export interface Departure {
  id: number; tourId: number; departureDate: IsoDate; returnDate: IsoDate;
  status: DepartureStatus; seatsLeft: number; isGuaranteed: boolean;
  priceAdult: Money; priceChild: Money; priceInfant: Money; singleSupplement: Money;
  meetingPoint: string; meetingTime: string; bookingCutoffAt: IsoDateTime;
}

export interface PassengerInput {
  fullName: string; gender: "male" | "female" | "other"; dateOfBirth: IsoDate;
  idNumber?: string; passportNumber?: string; nationality?: string;
  specialRequest?: string; isLead?: boolean;
}
export interface QuoteRequest {
  departureId: number; adults: number; children: number; infants: number;
  singles?: number; couponCode?: string;
  passengers?: Pick<PassengerInput, "dateOfBirth">[]; // để máy chủ phân loại theo ngày sinh
}
export interface Quote {
  lines: { type: PassengerType | "single_supplement"; qty: number; unitPrice: Money; amount: Money }[];
  subtotal: Money; discountTotal: Money; total: Money;
  coupon?: { code: string; valid: boolean; reason?: string; discount?: Money };
  deposit: { percent: number; amount: Money; dueNow: Money };
  balanceDueDate: IsoDate; fullPaymentRequired: boolean;
  reclassified?: { index: number; from: PassengerType; to: PassengerType }[];
  seatsLeft: number;
}
export interface CreateBookingRequest {
  departureId: number;
  contact: { fullName: string; email: string; phone: string };
  passengers: PassengerInput[]; singles?: number; couponCode?: string;
  payment: { purpose: "deposit" | "full" };
  customerNote?: string; termsVersion: string;
}
export interface Booking {
  code: string; status: BookingStatus; paymentStatus: PaymentStatus;
  departure: Pick<Departure, "id"|"departureDate"|"returnDate"|"meetingPoint"|"meetingTime">;
  tour: { slug: string; name: string; cover: string };
  contact: { fullName: string; email: string; phone: string };
  adults: number; children: number; infants: number;
  total: Money; paidAmount: Money; refundedAmount: Money; depositRequired: Money;
  balanceDueDate: IsoDate | null; holdExpiresAt: IsoDateTime | null;
  allowedActions: BookingAction[];       // máy chủ quyết định nút nào hiện
  priceSnapshot: Quote["lines"];
  createdAt: IsoDateTime; version: number;
}
export type BookingAction = "pay_deposit" | "pay_balance" | "cancel" | "request_cancel"
  | "request_change" | "edit_passengers" | "download_voucher" | "request_invoice" | "review";
```

**`allowedActions` do máy chủ trả:** giao diện **chỉ hiển thị nút nằm trong danh sách này** (không tự suy luận từ trạng thái) → quy tắc đổi ở máy chủ không cần sửa client.

---

## 7. Xác thực và phiên (phía client)

| Mục | Quy định |
|---|---|
| Access token | JWT ngắn hạn (~15 phút) **chỉ giữ trong bộ nhớ**; mất khi tải lại trang |
| Refresh token | Cookie `HttpOnly; Secure; SameSite=Lax`, xoay vòng mỗi lần làm mới; client **không đọc được** |
| Khôi phục phiên | Khi mở trang: `POST /auth/refresh` → nếu 200 thì `GET /me` |
| Hết hạn giữa chừng | Interceptor làm mới 1 lần; thất bại → `sessionStore.expire()` và áp dụng quy tắc “Phiên hết hạn” (`02` §7) |
| Đăng xuất | `POST /auth/logout` (thu hồi refresh) → xóa phiên bộ nhớ + xóa cache React Query + xóa nháp checkout |
| Đăng xuất mọi thiết bị | `POST /auth/logout-all` |
| Đồng bộ nhiều tab | `BroadcastChannel("session")` phát `logout` để các tab khác cập nhật |
| Không làm | Không lưu token/`SessionUser` trong `localStorage`; **bỏ** khóa `viettrails-session`/`viettrails-profile` hiện có (xóa khi migrate) |

Quyền hiển thị: `useCan("booking:read")` đọc từ `user.permissions`. Đây chỉ để **ẩn/hiện control**; không dùng làm ranh giới bảo mật (máy chủ kiểm tra lại từng yêu cầu).

---

## 8. Quản lý dữ liệu máy chủ (React Query)

### 8.1 Quy ước khóa và cấu hình

| Dữ liệu | Query key | `staleTime` | Ghi chú |
|---|---|---|---|
| Danh sách tour | `['tours', params]` | 60 s | `placeholderData: keepPreviousData` khi đổi trang/lọc |
| Chi tiết tour | `['tour', slug]` | 5 phút | |
| Lịch khởi hành | `['departures', tourId, month]` | **15 s** | Tồn chỗ đổi nhanh; refetch khi focus cửa sổ |
| Báo giá | mutation (không cache) | — | Mỗi lần đổi đầu vào gọi lại, hủy cái cũ |
| Đơn của tôi | `['me','bookings', params]`, `['me','booking', code]` | 0 | Luôn tươi |
| Cấu hình công khai | `['config']` | 10 phút | |

Mặc định: `retry: 1` (không thử lại 4xx), `refetchOnWindowFocus: true` cho dữ liệu tồn chỗ/đơn, `gcTime` 5 phút. Lỗi 401 không bị thử lại ở tầng query (đã xử lý ở `client.ts`).

### 8.2 Vô hiệu hóa cache sau thao tác ghi

| Mutation | Vô hiệu hóa |
|---|---|
| `createBooking` | `['me','bookings']`, `['departures', tourId]` |
| `initiatePayment` / thăm dò thấy đổi | `['me','booking', code]`, `['me','bookings']` |
| `cancelBooking`, `createChangeRequest` | `['me','booking', code]`, `['me','bookings']`, `['departures']` |
| `updatePassengers` | `['me','booking', code]` |
| `createReview` | `['me','booking', code]`, `['reviews', tourId]` |
| `login/logout` | **Xóa toàn bộ cache** (`queryClient.clear()`) |

**Không** cập nhật lạc quan (optimistic) cho tiền, chỗ, trạng thái đơn; chỉ dùng cho tương tác nhẹ (yêu thích).

---

## 9. Luồng checkout phía client

### 9.1 Máy trạng thái

```ts
type CheckoutPhase =
  | "editing_passengers"   // bước 1
  | "reviewing"            // bước 2
  | "submitting"           // đang POST /bookings
  | "created"              // đã có code → sang trang thanh toán
  | "failed";              // lỗi có thể thử lại

type CheckoutEvent =
  | { type: "PASSENGERS_VALID" } | { type: "BACK" } | { type: "SUBMIT" }
  | { type: "CREATED"; code: string } | { type: "FAILED"; error: ApiError | NetworkError }
  | { type: "RETRY" };
```

Cài đặt bằng `useReducer` (hoặc store nhỏ) trong `features/checkout/machine.ts`; **hàm thuần có test**. Chuyển trạng thái bất hợp lệ bị bỏ qua.

### 9.2 Dữ liệu nháp

```ts
interface CheckoutDraft {
  departureId: number; adults: number; children: number; infants: number;
  singles: number; couponCode?: string;
  contact: { fullName: string; email: string; phone: string };
  passengers: PassengerInput[];       // chỉ trong bộ nhớ
  paymentPurpose: "deposit" | "full";
  termsAccepted: boolean;
  idempotency: { key: string; payloadHash: string } | null;
}
```

- Lưu `sessionStorage` **chỉ**: `departureId`, số khách, `couponCode`, `contact`, họ tên/ngày sinh/giới tính hành khách. **Không** lưu `idNumber`, `passportNumber`, yêu cầu đặc biệt.
- Xóa nháp khi đăng xuất, khi tạo đơn thành công, hoặc khi `departureId` không còn hợp lệ.

### 9.3 Báo giá

- Hook `useQuote(draft)`: debounce 300 ms, gọi `quote()` khi đổi lịch/số khách/mã/ngày sinh; hủy yêu cầu cũ.
- Kết quả có `reclassified` → hiển thị banner “Giá đã được cập nhật vì hành khách N thuộc nhóm trẻ em tại ngày khởi hành” (`02` §4.3).
- `fullPaymentRequired=true` → chỉ cho chọn “Thanh toán toàn bộ”.
- `coupon.valid=false` → hiển thị `coupon.reason` qua bảng thông điệp (`02` §8.2); **không** chặn nút “Xác nhận”.
- Lỗi báo giá `SEAT_UNAVAILABLE/DEPARTURE_CLOSED` → khóa nút xác nhận, hiển thị hướng xử lý.

### 9.4 Khóa idempotency

```ts
function ensureIdempotencyKey(draft: CheckoutDraft, payload: CreateBookingRequest) {
  const hash = stableHash(payload);
  if (draft.idempotency?.payloadHash === hash) return draft.idempotency.key; // thử lại cùng nội dung
  const key = crypto.randomUUID();                                           // nội dung đổi → khóa mới
  draft.idempotency = { key, payloadHash: hash };
  return key;
}
```

- Bấm “Thử lại” sau lỗi mạng/5xx dùng **đúng khóa cũ** (nếu nội dung không đổi) để tránh tạo đơn thứ hai (AC-02).
- `IDEMPOTENCY_CONFLICT` → tải lại trang checkout (nháp được dựng lại).

### 9.5 Tạo đơn thành công

Điều hướng `replace` tới `/booking/:code/pay` (không để nút Back quay về form đã gửi). Lưu `serverTime` từ `meta` để tính đồng hồ (9.6).

### 9.6 Đồng hồ giữ chỗ (`useHoldCountdown`)

```ts
// offset = serverNow − clientNow, tính tại thời điểm nhận phản hồi
function useHoldCountdown(holdExpiresAt: IsoDateTime | null, serverOffsetMs: number) {
  // trả { remainingMs, level: "ok"|"warn"|"expired" }
  // cập nhật mỗi 1 giây khi tab hiển thị; tạm dừng khi document.hidden; tính lại khi visible
}
```

- Dùng **thời điểm tuyệt đối của máy chủ** + offset, **không** đếm lùi từ số giây (tránh lệch khi tab ngủ).
- `level="warn"` khi còn < 30 phút; `expired` khi ≤ 0 → gọi `refetch` đơn để lấy trạng thái thật (không tự đổi sang “hết hạn” chỉ vì đồng hồ client).
- Thông báo cho trình đọc màn hình ở mốc 30/10/5/1 phút qua `announce()` (`aria-live="polite"`), không đọc từng giây.

### 9.7 Thăm dò kết quả thanh toán (`usePaymentPolling`)

```ts
const INTERVALS = [2000, 2000, 3000, 3000, 5000, 5000, 5000, 5000, 5000, 5000]; // ~38 s, sau đó mỗi 5 s đến 60 s
// Dừng khi: paymentStatus đổi (≠ trước khi thanh toán) hoặc booking.status ∈ {confirmed, expired, cancelled}
// hoặc quá 60 s ⇒ kết quả "unknown" (hướng dẫn kiểm tra Đơn của tôi + chờ email)
// Tạm dừng khi document.hidden; hủy yêu cầu khi rời trang (AbortController)
```

- **Không** tin `?vnp_ResponseCode=…`/tham số tương tự trên URL quay về; chỉ dùng chúng cho **chẩn đoán** (log không chứa dữ liệu nhạy cảm). Quyết định hiển thị dựa trên `GET /me/bookings/:code`.
- Chuyển khoản: không thăm dò; hiển thị trạng thái “Chờ kế toán xác nhận” và làm mới khi người dùng quay lại tab.

---

## 10. Kiểm tra dữ liệu (validation)

### 10.1 Nguyên tắc

- Một schema `zod` cho mỗi biểu mẫu trong `features/<x>/schemas.ts`; dùng với react-hook-form (`zodResolver`).
- Thông điệp lỗi tiếng Việt cụ thể; schema **phản chiếu** quy tắc máy chủ. Khi khác nhau, **máy chủ thắng**: lỗi `fields` từ API được gắn vào ô tương ứng (`setError`).
- Cùng một hàm tính loại khách ở schema và ở hiển thị:

```ts
// lib/age.ts — thuần, có test
export function ageOn(dob: IsoDate, onDate: IsoDate): number {
  const [by, bm, bd] = dob.split("-").map(Number);
  const [y, m, d] = onDate.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}
export function classify(dob: IsoDate, departureDate: IsoDate, infantMax: number, childMax: number): PassengerType {
  const age = ageOn(dob, departureDate);
  return age < infantMax ? "infant" : age < childMax ? "child" : "adult";
}
```

### 10.2 Quy tắc chính (khớp `02` §8.1, PRD BR-10…BR-13)

| Trường/quy tắc | Biểu thức kiểm tra |
|---|---|
| Họ tên | `trim`, 2–100 ký tự |
| Email | `z.string().email().max(254)` |
| SĐT | Chuẩn hóa `+84…→0…`, `/^0\d{8,10}$/` |
| Ngày sinh | Hợp lệ, `≤ hôm nay` |
| Số hành khách | Bằng `adults+children+infants`; mỗi đơn ≤ `config.maxPaxOnline` |
| BR-12 | Có trẻ em/em bé ⇒ có ≥ 1 người lớn (tuổi ≥ 18 nếu tour yêu cầu) |
| BR-11 | Số em bé ≤ số người lớn |
| Giấy tờ | Bắt buộc theo `requiresIdDocument/requiresPassport`; CCCD 12 số; hộ chiếu `/^[A-Z0-9]{6,9}$/` |
| Mã giảm | `trim().toUpperCase()`, `/^[A-Z0-9_-]{3,32}$/` |
| Mã số thuế | `/^\d{10}(-\d{3})?$/` |
| Mật khẩu | ≥ 8 ký tự (độ mạnh chỉ để gợi ý; máy chủ kiểm tra danh sách mật khẩu phổ biến) |

---

## 11. Xử lý lỗi và ngoại tuyến

- `ErrorBoundary` cấp ứng dụng và cấp route: hiển thị `ErrorState` + `requestId` (nếu có) + nút tải lại; **không** hiển thị stack trace.
- Bảng ánh xạ `ErrorCode → { message, action }` ở `lib/api/errorMessages.ts` (theo `02` §8.2); component gọi `describeError(error)` để lấy nội dung thống nhất.
- `useOnlineStatus()` (`navigator.onLine` + sự kiện) → banner “Bạn đang ngoại tuyến”; thao tác ghi bị chặn với giải thích.
- `NetworkError` khi tạo đơn/thanh toán: **không** báo thành công; hướng dẫn kiểm tra “Đơn của tôi” trước khi thử lại (tránh nhầm đơn đã tạo).
- Báo lỗi lên dịch vụ giám sát (nếu có) với `requestId`, đường dẫn, mã lỗi — **loại bỏ** body, email, SĐT, số giấy tờ.

---

## 12. Định dạng, quốc tế hóa, SEO

### 12.1 Định dạng (`lib/format`)

- `formatVnd(n)`: `Intl.NumberFormat("vi-VN", { style:"currency", currency:"VND", maximumFractionDigits:0 })`.
- `formatDate(isoDate)`, `formatDateTime(isoDateTime)` theo `Asia/Ho_Chi_Minh`; **không** dùng `new Date("YYYY-MM-DD")` để phân tích ngày nghiệp vụ (lệch múi giờ) — tách chuỗi hoặc dùng `date-fns` với giá trị `parseISO` + múi giờ cố định.
- `formatPhone`, `maskId` (chỉ 4 số cuối).

### 12.2 Quốc tế hóa

Tất cả chuỗi hiển thị đặt trong `src/locales/vi.ts` dưới dạng khóa (ví dụ `booking.hold.expiring`) ngay từ đầu để P2 thêm `en.ts` không phải sửa component. Chưa cần thư viện i18n ở P0–P1; dùng hàm `t(key, params)` nhỏ nếu cần.

### 12.3 SEO

- React 19 hỗ trợ thẻ `<title>`, `<meta>`, `<link rel="canonical">` ngay trong component (được đưa lên `<head>`): dùng ở `TourDetailPage`, `ToursPage`, `DestinationDetailPage`.
- JSON-LD (`<script type="application/ld+json">`) cho tour: `TouristTrip`/`Product` + `AggregateRating` (chỉ khi có đánh giá thật) + `Offer` (giá từ).
- **Giới hạn của SPA:** trình thu thập có thể không chạy JS đầy đủ. Quyết định cần chủ dự án duyệt: **(a)** tiền kết xuất (prerender/SSG) cho trang công khai, hoặc **(b)** máy chủ chèn thẻ meta + JSON-LD vào `index.html` theo URL. `sitemap.xml` và `robots.txt` do backend sinh.
- Trang `/checkout`, `/account/*`, `/payment/result`: `<meta name="robots" content="noindex">`.

---

## 13. Hiệu năng

- Tách mã theo route; thư viện nặng (bản đồ, editor, biểu đồ) tải động.
- Ảnh: `srcset/sizes`, `loading="lazy"`, `decoding="async"`, kích thước cố định; ưu tiên ảnh WebP/AVIF do backend/CDN cung cấp.
- Tránh render lại: `memo` cho thẻ tour; khóa danh sách ổn định (`id`).
- Danh sách rất dài (admin): ảo hóa dòng.
- Ngân sách: bundle JS ban đầu của trang chủ **≤ 200 KB gzip** (gợi ý, đo bằng `vite build` + công cụ phân tích); LCP ≤ 2,5 s, CLS ≤ 0,1, INP ≤ 200 ms.
- Preconnect tới API/CDN ảnh/bản đồ; font `swap`.

## 14. Bảo mật phía frontend

| Chủ đề | Quy định |
|---|---|
| XSS | Không dùng `dangerouslySetInnerHTML`; nếu bắt buộc (nội dung CMS) thì lọc bằng DOMPurify với danh sách thẻ cho phép tối thiểu |
| Chuyển hướng | `from`/`returnUrl` chỉ cho phép đường dẫn nội bộ (`safeFrom`) |
| Token | Chỉ bộ nhớ; không đưa vào URL, `localStorage`, log, analytics |
| Dữ liệu nhạy cảm | Không ghi số giấy tờ vào URL/log/analytics/`sessionStorage`; che khi hiển thị |
| CSP | Phối hợp backend: `default-src 'self'`; cho phép `frame-src` Google Maps, domain cổng thanh toán; không `unsafe-inline` script |
| Iframe bản đồ | `loading="lazy"`, `referrerpolicy="no-referrer-when-downgrade"`, `sandbox` phù hợp |
| Liên kết ngoài | `rel="noopener noreferrer"` với `target="_blank"` |
| Phụ thuộc | `npm audit`/công cụ quét trong CI; khóa phiên bản (`package-lock.json`); không dùng script bên thứ ba không cần thiết |
| Tải tệp | Kiểm tra loại/kích thước ở client (chỉ để phản hồi); máy chủ kiểm tra lại |
| Bí mật | Không đưa khóa riêng/secret vào bundle (`VITE_*` công khai) |
| Quyền | `useCan` chỉ ẩn/hiện; **tuyệt đối không** coi là kiểm soát truy cập |

## 15. Khả năng truy cập — triển khai kỹ thuật

- Hook dùng chung `useFocusTrap`, `useAnnounce` (vùng live ẩn), `useRovingFocus` (lưới lịch).
- Mọi thành phần của `02` §2.3 có thuộc tính ARIA nêu trong `02` §10; thêm test `@testing-library` + `jest-axe`/`vitest-axe` cho các thành phần chính.
- `prefers-reduced-motion`: tắt chuyển động không cần thiết.
- Thông báo lỗi biểu mẫu liên kết bằng `aria-describedby`; focus lỗi đầu tiên sau khi gửi.

## 16. Phân tích sử dụng (analytics)

Bọc trong `lib/analytics.ts` một hàm `track(event, props)` (no-op khi chưa cấu hình/chưa có đồng ý nếu yêu cầu). Sự kiện theo PRD §11.2. **Cấm** đưa email, SĐT, họ tên, số giấy tờ, nội dung nhận xét vào thuộc tính sự kiện; dùng `bookingCode` băm hoặc không dùng.

---

## 17. Kiểm thử

| Tầng | Công cụ | Phạm vi bắt buộc |
|---|---|---|
| Unit | Vitest | `age.ts`, `format/*`, `machine.ts`, `ensureIdempotencyKey`, `safeFrom`, schemas, `describeError` |
| Component | Testing Library + axe | `DepartureCalendar` (bàn phím), `PaxStepper`, `PassengerForm` (đổi loại khách), `CouponInput`, `HoldCountdown`, `ConfirmDialog` (focus trap) |
| Tích hợp | Vitest + MSW | Checkout: thành công; `SEAT_UNAVAILABLE`; thử lại cùng khóa; mã giảm sai; `UNAUTHENTICATED` làm mới phiên; thăm dò thanh toán (fake timers): thành công/thất bại/quá 60 s |
| E2E | Playwright (trên môi trường thử có backend thật hoặc giả lập đầy đủ) | **E1:** tìm tour → chọn lịch → đặt → thanh toán sandbox → thấy đơn `confirmed`. **E2:** đặt → để hết hạn giữ chỗ → thấy `expired`. **E3:** hủy đơn có báo giá hủy. **E4:** 360px không tràn ngang. **E5:** đăng ký → xác minh email (hộp thư thử) → đặt tour |
| Truy cập | axe-core trong Playwright | Các trang chính không có lỗi nghiêm trọng |

Mục tiêu độ phủ: **≥ 90%** cho `lib/age`, `format`, `machine`, `idempotency`; **≥ 70%** tổng. Không báo “test đạt” khi chưa chạy.

## 18. Môi trường, build và CI

| Biến | Ý nghĩa |
|---|---|
| `VITE_API_BASE_URL` | Gốc API (`/api/v1`) |
| `VITE_APP_ENV` | `development` / `staging` / `production` |
| `VITE_SENTRY_DSN` (tùy chọn) | Giám sát lỗi (khóa công khai) |
| `VITE_ANALYTICS_ID` (tùy chọn) | Mã phân tích |

Scripts cần có trong `package.json`: `dev`, `build` (`tsc -b && vite build`), `preview`, `typecheck`, `lint`, `test`, `test:e2e`, `format:check`.
**CI (mỗi pull request):** cài sạch (`npm ci`) → `typecheck` → `lint` → `test` → `build` → quét phụ thuộc → (nhánh chính) `test:e2e` trên staging. Triển khai SPA: máy chủ phải **rewrite mọi route về `index.html`** (deep-link); cache dài cho tệp băm tên, `no-cache` cho `index.html`.

---

## 19. Lộ trình chuyển đổi từ mã hiện có

| Hiện có | Hành động |
|---|---|
| `app/DatabaseGate.tsx` (nạp tour/điểm đến/danh mục/đơn) | Thay bằng `AppBootstrap` + truy vấn theo route (React Query). Xóa logic “nạp tất cả” |
| `features/{tours,destinations,categories}/store.ts` | Chuyển thành `api.ts + hooks.ts`; bỏ `ensurePermission` ở khách (khu admin xem `04`) |
| `features/bookings/store.ts`, `pages/BookingPage.tsx` | Tách `features/checkout` + `features/bookings`; bỏ sinh mã đơn client (`lib/id.ts`), gỡ giới hạn 1–10 cứng (đọc từ `config`) |
| `features/auth/store.ts` (phiên `localStorage`) | `sessionStore` bộ nhớ + refresh cookie; xóa khóa `viettrails-*` ở lần chạy đầu |
| `features/auth/permissions.ts` (bảng `admin/user` trong bundle), `accounts.ts` (tài khoản demo) | Bỏ bảng cố định; dùng `permissions[]` từ `/me`; **xóa** tài khoản demo khỏi bundle |
| `lib/api.ts` | Mở rộng: phong bì, refresh single-flight, hủy, thử lại, idempotency, `ApiError` có `code/fields` |
| `pages/MyBookingsPage.tsx`, `ProfilePage.tsx` | Chuyển sang `/account/bookings`, `/account/profile` (giữ chuyển hướng cũ) |
| Phân trang client (`usePagination`) | Dùng khi dữ liệu nhỏ; danh sách tour/đơn/admin chuyển sang **phân trang máy chủ** qua search params |
| `rating/reviews` nhập tay ở tour | Hiển thị `ratingAvg/ratingCount` từ máy chủ; thêm danh sách đánh giá |
| `features/admin/validation.ts` | Chuyển thành schema zod; thêm các trường mới (xem `04`) |

---

## 20. Công việc giao cho AI (backlog frontend)

| Mã | Công việc | Phụ thuộc | Nghiệm thu |
|---|---|---|---|
| T-FE-01 | Thiết lập công cụ: lint, test, MSW, scripts, CI | — | `npm run typecheck && lint && test && build` sạch |
| T-FE-02 | `lib/api` mới (phong bì, `ApiError`, refresh, idempotency, hủy) + test | 01 | Unit/MSW đạt; AC-02 (phần client) |
| T-FE-03 | `AppProviders`, `AppBootstrap`, `sessionStore`, guards, `safeFrom` | 02 | Không flicker chuyển hướng; open-redirect bị chặn |
| T-FE-04 | Đăng ký/đăng nhập/xác minh/quên-đặt lại mật khẩu/bảo mật | 03 | AC-03, AC-19 |
| T-FE-05 | Catalog: `/tours`, `/tours/:slug`, bộ lọc URL, phân trang máy chủ | 02 | `02` §4.1–4.2 |
| T-FE-06 | `DepartureCalendar`, `PaxStepper`, `useQuote` | 05 | AC-04, AC-09; bàn phím |
| T-FE-07 | Checkout: máy trạng thái, form hành khách, mã giảm, idempotency | 06 | AC-01, AC-02, AC-04 |
| T-FE-08 | Thanh toán + kết quả: `PaymentMethodPicker`, `BankTransferPanel`, `usePaymentPolling`, `useHoldCountdown` | 07 | AC-05, AC-06, AC-08 |
| T-FE-09 | Đơn của tôi + chi tiết + hủy/đổi dựa trên `allowedActions` | 08 | AC-11, AC-12 |
| T-FE-10 | Đánh giá, liên hệ/ticket, hóa đơn, voucher | 09 | AC-25, AC-26 |
| T-FE-11 | SEO (meta, JSON-LD), noindex đúng route, quyết định prerender | 05 | Kiểm tra bằng công cụ |
| T-FE-12 | Hiệu năng + accessibility audit; E2E E1–E5 | tất cả | AC-30; Core Web Vitals đạt |

## 21. Quy ước làm việc cho AI (frontend)

1. Đọc `01`, `02`, tài liệu này và file liên quan **trước** khi sửa; nêu giả định nếu thiếu dữ liệu nghiệp vụ.
2. Một thay đổi = một mục đích; không refactor ngoài phạm vi.
3. Mọi logic **tính tiền, tồn chỗ, quyền, trạng thái** đặt ở máy chủ; client chỉ hiển thị kết quả (`allowedActions`, `Quote`).
4. Bắt buộc có test cho hàm thuần và luồng lỗi đã nêu ở mục 17.
5. Kiểm tra thủ công: 360px, bàn phím, trạng thái lỗi/loading/rỗng, console sạch.
6. Chạy `typecheck`, `lint`, `test`, `build`; **báo kết quả thật**, không suy đoán.
7. Không commit bí mật; không dùng dữ liệu cá nhân thật trong fixture/test.
8. Gặp mâu thuẫn giữa tài liệu: ưu tiên `01-PRD-NGHIEP-VU.md` về nghiệp vụ, `04-TECH-ADMIN-AI.md` về hợp đồng API; báo mâu thuẫn trong bàn giao.
