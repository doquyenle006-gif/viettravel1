# Tài liệu giao diện và quy trình AI thực thi — VietTrails (bản mục tiêu đầy đủ)

| Thuộc tính | Giá trị |
|---|---|
| Phiên bản tài liệu | 2.0 |
| Thay thế / mở rộng | `docs/UI-AI-IMPLEMENTATION.md` v1.0 |
| Phụ thuộc | `01-PRD-NGHIEP-VU.md` (luồng `LN-`, quy tắc `BR-`, trạng thái, mã lỗi), `03-TECH-FRONTEND-AI.md`, `04-TECH-ADMIN-AI.md` |
| Người dùng tài liệu | Designer, frontend developer, reviewer, QA, **AI lập trình** |
| Phạm vi | Đặc tả giao diện khách + giao diện quản trị cho hệ thống đặt tour hoàn chỉnh, và quy trình giao việc giao diện cho AI |

---

## 1. Mục đích và giới hạn của AI

“AI thực thi” là **AI hỗ trợ lập trình** tạo/chỉnh mã giao diện theo đặc tả. Đây **không phải** chatbot tư vấn tích hợp cho khách.

**Quy tắc cứng đối với AI:**

1. **Không tự suy diễn chính sách kinh doanh**: phí hủy, tỷ lệ cọc, thời gian giữ chỗ, ngưỡng tuổi, quyền hạn. Lấy từ `01-PRD-NGHIEP-VU.md` hoặc cấu hình (Phụ lục B của PRD). Thiếu thì **hỏi** hoặc nêu **giả định có giới hạn** trong bản bàn giao.
2. **Không tính tiền, tồn chỗ hay quyền ở client như nguồn sự thật.** Client chỉ hiển thị kết quả máy chủ trả về (BR-14, BR-19).
3. **Không tạo dữ liệu giả dạng production**, không bịa endpoint, không bịa vai trò hay trạng thái ngoài danh mục ở mục 6.
4. **Không nhúng bí mật** (khóa API, token) vào mã nguồn/commit/prompt.
5. Mọi thay đổi do AI tạo ra phải được **người đọc, chạy kiểm tra và duyệt** trước khi merge. Không báo “đã test” nếu chưa chạy lệnh.
6. Không thêm thư viện UI hoặc hệ thống thiết kế mới khi component/CSS hiện có đáp ứng được (xem 2.3 cho danh sách bổ sung được phép đề xuất).

---

## 2. Ngôn ngữ hình ảnh và thành phần

### 2.1 Nền tảng thương hiệu (giữ nguyên bản hiện có)

- Cảm xúc: khám phá Việt Nam, gần gũi, bình tĩnh, **đáng tin cậy** (giao dịch tiền cần rõ ràng, không giục giã quá mức).
- Màu: xanh lá đậm `#244b39` (chính), nền ấm `#f8f7f4`, nhấn đất nung `#cf865b`, viền trung tính.
- Chữ: DM Sans (nội dung), Playfair Display (tiêu đề biên tập). Không dùng quá hai họ chữ.
- Ảnh tour crop thống nhất tỷ lệ 4:3 (thẻ) và 16:9 (hero/chi tiết); luôn có `alt` hữu ích.

### 2.2 Token bổ sung cho hệ thống đặt tour

Khai báo dạng CSS custom property trong `src/styles.css`, **không** dùng giá trị màu rải rác trong component.

| Nhóm | Token | Giá trị gợi ý | Ghi chú |
|---|---|---|---|
| Trạng thái | `--st-pending-fg/bg` | `#8a5a00` / `#fff4d6` | Chờ, cảnh báo nhẹ |
| | `--st-ok-fg/bg` | `#1f5f3f` / `#e3f2e9` | Đã xác nhận, thành công |
| | `--st-info-fg/bg` | `#2f4858` / `#e6eef3` | Hoàn thành, thông tin |
| | `--st-danger-fg/bg` | `#8f2d2d` / `#fbe7e7` | Hủy, lỗi, quá hạn |
| | `--st-muted-fg/bg` | `#555555` / `#ececec` | Hết hạn, ẩn, nháp |
| Khoảng cách | `--sp-1…--sp-8` | 4, 8, 12, 16, 24, 32, 48, 64 px | Thang 4px |
| Bo góc | `--radius-sm/md/lg` | 6 / 10 / 16 px | |
| Đổ bóng | `--shadow-1/2` | nhẹ / nổi (dialog, sticky bar) | |
| Điểm ngắt | `--bp-sm/md/lg/xl` | 480 / 768 / 1024 / 1280 px | Mobile-first |
| Chuyển động | `--motion-fast/base` | 120 / 200 ms | Tôn trọng `prefers-reduced-motion` |

Cặp màu trạng thái được chọn để tương phản chữ/nền ước tính ≥ 4,5:1; **phải kiểm lại bằng công cụ đo tương phản** khi đổi màu. Trạng thái luôn có **chữ + biểu tượng**, không chỉ dựa vào màu.

### 2.3 Thư viện thành phần

**Đã có (tái sử dụng):** `SiteLayout` (header/footer/TourCard/SearchBar/TrustStrip), `AdminLayout`, `RequirePermission`, `Controls` (`Notice`, `StatusBadge`, `ConfirmButton`), `Pagination` (`usePagination` + `Pagination`), `PlaceMap`.

**Cần bổ sung** (đặt ở `src/components/`, mỗi thành phần có story/trang thử nếu dự án có):

| Thành phần | Mục đích | Trạng thái/biến thể cần có |
|---|---|---|
| `DepartureCalendar` | Chọn lịch khởi hành theo tháng | ngày có lịch, ngày hết chỗ, ngày đã đóng, ngày đang chọn, còn ≤ 5 chỗ; điều hướng bàn phím |
| `PaxStepper` | Chọn số người lớn/trẻ em/em bé | min/max, vô hiệu khi hết chỗ, mô tả tuổi mỗi loại |
| `PriceSummary` | Bảng chi tiết giá, mã giảm, cọc, còn lại | loading (skeleton), lỗi báo giá, có/không mã |
| `HoldCountdown` | Đồng hồ giữ chỗ | `>30p`, `<30p` (cảnh báo), hết hạn; `role="timer"` + thông báo mốc |
| `StepIndicator` | Tiến trình checkout | bước hoàn tất/đang làm/chưa tới, bước có lỗi |
| `PassengerForm` | Nhập từng hành khách | loại khách tự tính, giấy tờ theo yêu cầu tour, lỗi theo dòng |
| `CouponInput` | Nhập mã giảm | rỗng, đang kiểm tra, hợp lệ, không hợp lệ (lý do) |
| `PaymentMethodPicker` | Chọn phương thức + mức cọc/toàn bộ | mỗi phương thức: khả dụng/bảo trì |
| `BankTransferPanel` | Hướng dẫn chuyển khoản + QR | sao chép số tài khoản/nội dung, tải chứng từ |
| `Timeline` | Lịch sử đơn/thanh toán | sự kiện, người thực hiện (khách/nhân viên/hệ thống), thời điểm |
| `StatusChip` | Hiển thị trạng thái theo bảng mục 6 | `size`, có biểu tượng |
| `ConfirmDialog` | Xác nhận thao tác nguy hiểm | nhập lý do bắt buộc, mô tả hậu quả cụ thể, `Esc` đóng, trả focus |
| `DataTable` | Bảng admin phân trang máy chủ | sắp xếp, lọc, chọn nhiều dòng, trạng thái loading/empty/error, cuộn ngang trong vùng chứa |
| `FilterBar` | Bộ lọc đồng bộ URL | chip bộ lọc đang áp dụng, nút xóa |
| `FileUploader` | Tải ảnh/chứng từ | kéo thả, tiến độ, lỗi loại/kích thước, xem trước |
| `RatingStars` | Hiển thị/chọn sao | chỉ đọc, chọn được (bàn phím) |
| `EmptyState` / `ErrorState` / `Skeleton` | Trạng thái chuẩn | kèm hành động tiếp theo |
| `Toast` / `Notice` | Phản hồi thao tác | `role="status"`/`role="alert"` |

Thư viện bên ngoài chỉ **đề xuất** khi có lý do (ví dụ trình chọn ngày/biểu đồ) và cần được duyệt; ưu tiên tự xây thành phần nhỏ bằng CSS hiện có.

---

## 3. Bản đồ màn hình — phía khách

Guard: **Công khai** (ai cũng vào được), **Cần đăng nhập**, **Cần email đã xác minh**.

| Route | Mục đích | Guard | Dữ liệu chính (từ API) | Trạng thái cần xử lý |
|---|---|---|---|---|
| `/` | Giới thiệu, tìm kiếm nhanh, tour nổi bật, điểm đến | Công khai | tour nổi bật, điểm đến | loading, rỗng, lỗi |
| `/tours` | Duyệt/tìm/lọc tour | Công khai | danh sách phân trang máy chủ, facet lọc | loading, không kết quả (nút xóa lọc), lỗi |
| `/tours/:slug` | Chi tiết + chọn lịch + báo giá | Công khai | tour, lịch khởi hành, đánh giá | không tồn tại, tour ẩn, không còn lịch mở, hết chỗ |
| `/destinations`, `/destinations/:slug` | Điểm đến, bản đồ, tour liên quan | Công khai | điểm đến | không tra được tọa độ, từ chối định vị |
| `/categories/:slug` | Danh sách tour theo danh mục | Công khai | tour theo danh mục | như `/tours` |
| `/contact` | Liên hệ/tư vấn, tour theo yêu cầu | Công khai | — | gửi thành công, lỗi, chống spam |
| `/policies/:slug` | Điều khoản, chính sách hủy, thanh toán, riêng tư | Công khai | nội dung CMS | không tồn tại |
| `/login`, `/register` | Đăng nhập, đăng ký | Công khai (đã đăng nhập thì chuyển đi) | — | lỗi theo trường, bị khóa tạm, giữ `from` |
| `/verify-email` | Xác minh email qua liên kết | Công khai | token | thành công, hết hạn, đã dùng, gửi lại |
| `/forgot-password`, `/reset-password` | Quên/đặt lại mật khẩu | Công khai | token | phản hồi trung tính, token hết hạn |
| `/checkout` | Đặt tour 3 bước | Đăng nhập + xác minh | lịch, báo giá, tài khoản | hết chỗ giữa chừng, lịch đóng, mã sai, mất kết nối |
| `/booking/:code/pay` | Thanh toán đơn | Đăng nhập (chủ đơn) | đơn, phương thức, hạn giữ chỗ | hết hạn giữ chỗ, đã trả đủ, cổng lỗi |
| `/payment/result` | Kết quả sau khi quay lại từ cổng | Đăng nhập (chủ đơn) | trạng thái đơn (thăm dò) | đang chờ, thành công, thất bại, quá thời gian chờ |
| `/account/bookings` | Danh sách đơn của tôi | Đăng nhập | đơn phân trang | rỗng, lỗi |
| `/account/bookings/:code` | Chi tiết đơn, thanh toán, hủy/đổi, voucher, hóa đơn | Đăng nhập (chủ đơn) | đơn + dòng thời gian | theo bảng hành động mục 4.6 |
| `/account/profile` | Hồ sơ, đổi email, mật khẩu | Đăng nhập | hồ sơ | lỗi, đã lưu |
| `/account/security` | Phiên/thiết bị, đăng xuất tất cả | Đăng nhập | danh sách phiên | |
| `/account/wishlist` | Tour yêu thích (P2) | Đăng nhập | | rỗng |
| `/403`, `*` | Không đủ quyền / không tìm thấy | Công khai | — | có đường quay về |

**Tương thích đường dẫn cũ:** `/my-bookings → /account/bookings`, `/profile → /account/profile`, `/booking → /checkout` (chuyển hướng 301 phía client).

---

## 4. Đặc tả chi tiết màn hình khách trọng yếu

### 4.1 Danh sách tour `/tours`

- **Bộ lọc** đồng bộ vào URL (chia sẻ/quay lại được): `q`, `category`, `region`, `destination`, `dateFrom`, `dateTo`, `pax`, `durationMin/Max`, `priceMin/Max`, `sort`, `page`.
- Sắp xếp: nổi bật, giá thấp → cao, giá cao → thấp, **ngày khởi hành gần nhất**, đánh giá cao.
- **Thẻ tour** (`TourCard`): ảnh, tên, điểm đến, thời lượng, **“Từ X đ/khách”**, ngày gần nhất, điểm đánh giá + số đánh giá, nhãn **“Chỉ còn N chỗ”** khi N ≤ 5.
- Mobile: bộ lọc mở dạng ngăn kéo (drawer) có nút “Áp dụng/Xóa”; số kết quả cập nhật bằng vùng `aria-live="polite"`.
- Không kết quả: giải thích, hiện bộ lọc đang áp dụng, nút “Xóa bộ lọc”, gợi ý tour phổ biến.
- Phân trang phía máy chủ; dòng “Hiển thị x–y trong z”; trang hiện tại có `aria-current="page"`; trang nằm trong URL.

### 4.2 Chi tiết tour `/tours/:slug`

Bố cục (desktop 2 cột, mobile 1 cột):

```
┌──────────────────────────────────────────────┬─────────────────────────┐
│ Thư viện ảnh (cover + gallery)               │ KHUNG ĐẶT TOUR (sticky) │
│ Tên tour · Điểm đến · ★4,8 (126) · 3N2Đ      │ Từ 2.950.000 đ/khách    │
│ Điểm nổi bật                                 │ [Chọn ngày khởi hành ▾] │
│ Lịch trình theo ngày (mở/đóng, bản đồ)       │ NL [−]2[+] TE [−]1[+]   │
│ Bao gồm / Không bao gồm                      │ EB [−]0[+]  (mô tả tuổi)│
│ Chính sách hủy (bảng bậc) · Lưu ý            │ Tạm tính: 8.850.000 đ   │
│ Đánh giá thật (phân trang)                   │ Cọc ngay: 2.655.000 đ   │
│ Tour liên quan                               │ [ĐẶT NGAY]              │
└──────────────────────────────────────────────┴─────────────────────────┘
```

- **Mobile:** khung đặt tour thu thành **thanh dính ở đáy** (giá từ + nút “Chọn ngày & đặt”), bấm mở bottom sheet chứa bộ chọn ngày/số khách.
- `DepartureCalendar`: hiển thị tối thiểu 3 tháng tới; ngày hết chỗ gạch/vô hiệu kèm tooltip + văn bản “Hết chỗ”; ngày `closed` “Đã đóng bán”. Chọn ngày xong hiển thị: giờ/điểm đón, số chỗ còn (nếu ≤ 10), giá từng loại khách.
- `PaxStepper`: không vượt số chỗ còn và `booking.max_pax_online`; ghi chú tuổi các loại (“Trẻ em 2–11 tuổi”, “Em bé dưới 2 tuổi”).
- **Báo giá:** mỗi lần đổi ngày/số khách gọi API báo giá (debounce 300 ms, hủy yêu cầu cũ); trong lúc chờ hiển thị skeleton ở dòng tổng, **không** tự tính tổng ở client.
- Chính sách hủy hiển thị dạng bảng bậc ngay trên trang (minh bạch trước khi đặt).
- Tour ẩn/không còn lịch mở: thay nút đặt bằng “Liên hệ tư vấn”, kèm lý do.
- Dữ liệu có cấu trúc (JSON-LD) và thẻ meta/Open Graph cho SEO.

### 4.3 Checkout `/checkout` (3 bước + thanh toán)

`StepIndicator`: **1 Hành khách → 2 Xem lại & mã giảm → 3 Thanh toán** (bước chọn lịch/số khách nằm ở trang chi tiết). Dữ liệu lựa chọn từ trang chi tiết truyền qua URL (`departure`, `adults`, `children`, `infants`) và được máy chủ kiểm tra lại.

**Cột phải cố định “Tóm tắt đơn”** (dưới cùng trên mobile, thu gọn mở được): tour, ngày đi/về, điểm đón, số khách theo loại, `PriceSummary`.

**Bước 1 — Hành khách**

| Trường | Quy tắc hiển thị/kiểm tra |
|---|---|
| Họ tên người liên hệ, email, SĐT | Điền sẵn từ tài khoản; bắt buộc; email/SĐT đúng định dạng VN (9–11 chữ số, chấp nhận +84) |
| Mỗi hành khách: họ tên, giới tính, ngày sinh | Bắt buộc; **loại khách hiển thị tự động** (Người lớn/Trẻ em/Em bé) tính theo ngày khởi hành; nếu khác lựa chọn ban đầu thì hiển thị banner “Giá đã được cập nhật vì…” |
| Số CCCD/hộ chiếu, quốc tịch | Chỉ hiện khi tour `requiresIdDocument/requiresPassport`; nhập dạng che một phần sau khi rời ô |
| Yêu cầu đặc biệt (ăn chay, dị ứng, xe lăn…) | Tùy chọn, tối đa 300 ký tự |
| Phòng đơn | Hiện khi tour có phụ thu phòng đơn; cập nhật giá |
| “Dùng thông tin của tôi cho hành khách 1” | Nút tiện ích |

Kiểm tra BR-12: có trẻ em/em bé thì phải có người lớn; lỗi hiển thị cạnh trường và tóm tắt đầu form (`role="alert"`, focus vào lỗi đầu tiên).

**Bước 2 — Xem lại & mã giảm giá**

- `CouponInput`: nhập mã → “Áp dụng”; thành công hiện dòng giảm; thất bại hiện **lý do cụ thể** (mục 8.2) và **không chặn** đặt chỗ.
- Chọn **mức thanh toán**: “Đặt cọc X đ (30%) — còn lại Y đ trước ngày D” hoặc “Thanh toán toàn bộ”. Nếu bắt buộc toàn bộ (BR-21) chỉ hiện lựa chọn đó kèm lý do.
- Hiển thị **bảng chính sách hủy** rút gọn + liên kết đầy đủ.
- Checkbox bắt buộc: “Tôi đã đọc và đồng ý Điều khoản và Chính sách hủy” (kèm liên kết mở tab mới).
- Nút chính **“Xác nhận đặt chỗ”**: bấm một lần là vô hiệu hóa, hiện “Đang giữ chỗ…”; gửi kèm `Idempotency-Key` sinh một lần cho phiên checkout.

**Kết quả bước xác nhận**

| Phản hồi | Hành vi giao diện |
|---|---|
| Thành công | Chuyển `/booking/:code/pay`; hiện `HoldCountdown` |
| `SEAT_UNAVAILABLE` | Ở lại trang, giữ dữ liệu đã nhập; thông báo “Chỉ còn N chỗ” và gợi ý giảm số khách hoặc chọn lịch gần nhất |
| `DEPARTURE_CLOSED` | Thông báo + liên kết xem lịch khác |
| `EMAIL_NOT_VERIFIED` | Hộp thoại “Xác minh email để tiếp tục” + gửi lại liên kết |
| `UNAUTHENTICATED` | Chuyển `/login` giữ nguyên dữ liệu checkout (bộ nhớ phiên) |
| Lỗi mạng/5xx | Giữ dữ liệu, nút “Thử lại” dùng **cùng** `Idempotency-Key` (không tạo đơn thứ hai) |

### 4.4 Thanh toán `/booking/:code/pay`

- Đầu trang: mã đơn, `HoldCountdown` (“Chỗ của bạn được giữ đến 14:35 — còn 23:12:05”), tóm tắt tiền: tổng, cần trả bây giờ, còn lại.
- `PaymentMethodPicker`: cổng online (VNPay/MoMo/ZaloPay…), **Chuyển khoản/VietQR**. Phương thức đang bảo trì bị vô hiệu kèm lý do.
- **Online:** bấm “Thanh toán” → chuyển sang cổng (mở cùng tab), không đóng giao diện cũ; khi quay lại về `/payment/result`.
- **Chuyển khoản:** `BankTransferPanel` hiển thị tên chủ tài khoản, số tài khoản, ngân hàng, **số tiền chính xác**, **nội dung = mã đơn** (nút sao chép), QR; cho tải ảnh chứng từ; thông báo rõ “Đơn sẽ được xác nhận sau khi kế toán đối chiếu (thường trong X giờ làm việc)”.
- Đơn đã thanh toán đủ: ẩn khu thanh toán, hiện “Đã thanh toán đủ”.
- Hết hạn giữ chỗ khi đang ở trang: chuyển sang trạng thái “Đơn đã hết hạn giữ chỗ” kèm “Kiểm tra còn chỗ & đặt lại” (BR-25 nếu tiền đã về thì thông báo hệ thống đang xử lý).

### 4.5 Kết quả thanh toán `/payment/result`

- **Không tin tham số URL từ cổng.** Trang đọc `code` rồi **thăm dò** trạng thái đơn mỗi 3 giây tối đa 60 giây (giảm dần tần suất).
- Hiển thị: “Đang xác nhận thanh toán…” (có spinner + chữ) → **Thành công** (mã đơn, số tiền đã trả, nút “Xem đơn”, “Tải voucher”) / **Thất bại** (lý do chung, nút “Thử phương thức khác”) / **Chưa xác định sau 60 giây** (“Chúng tôi sẽ gửi email khi nhận được xác nhận. Bạn có thể kiểm tra trong Đơn của tôi”).

### 4.6 Đơn của tôi

**Danh sách:** thẻ/dòng gồm mã đơn, ảnh + tên tour, ngày đi, số khách, tổng tiền, `StatusChip` (đơn) + `StatusChip` (thanh toán), “hạn” nổi bật (hạn giữ chỗ/hạn thanh toán đủ nếu có). Lọc theo trạng thái, phân trang 5–10/đơn. Rỗng: nói rõ “Bạn chưa có đơn nào” + nút “Khám phá tour”.

**Chi tiết đơn:** tiêu đề + chip; khối “Việc cần làm” (ví dụ “Thanh toán phần còn lại trước 12/03”) ; tab **Tổng quan · Hành khách · Thanh toán · Lịch sử**; `Timeline` sự kiện; bảng giá snapshot; chính sách hủy áp dụng.

**Hành động theo trạng thái** (nút chỉ hiện khi hợp lệ; quyết định cuối cùng ở máy chủ):

| Trạng thái đơn / thanh toán | Hành động hiển thị |
|---|---|
| `pending` / `unpaid` | Thanh toán ngay · Hủy đơn · (đồng hồ giữ chỗ) |
| `confirmed` / `deposit_paid` | Thanh toán phần còn lại · Tải voucher · Sửa hành khách (đến mốc) · Yêu cầu đổi ngày · Hủy đơn · Yêu cầu hóa đơn |
| `confirmed` / `paid` | Tải voucher · Sửa hành khách · Yêu cầu đổi ngày · Hủy đơn · Yêu cầu hóa đơn |
| `completed` | Viết đánh giá (trong hạn) · Yêu cầu hóa đơn (trong hạn) · Đặt lại tour |
| `cancelled` | Xem chi tiết phí/hoàn tiền · Đặt lại tour |
| `expired` | Kiểm tra còn chỗ & đặt lại · Liên hệ hỗ trợ |

**Hủy đơn (`ConfirmDialog` nhiều bước):** (1) hiển thị **báo giá hủy** từ API: ngày còn lại, % phí, số đã trả, **số hoàn dự kiến**, thời gian hoàn; (2) chọn lý do (danh sách) + ghi chú; (3) xác nhận bằng nút nêu rõ hậu quả (“Hủy đơn và hoàn 6.195.000 đ”). Đơn dưới ngưỡng tự phục vụ: nút đổi thành “Gửi yêu cầu hủy” và giải thích sẽ được nhân viên duyệt.

**Đổi ngày/số khách:** chọn lịch mới (chỉ lịch còn chỗ) → API trả **phí đổi + chênh lệch giá** → xác nhận → trạng thái “Đang chờ duyệt” hiển thị trong chi tiết đơn.

### 4.7 Đánh giá

Chỉ hiện nút khi đơn `completed` và trong hạn. Form: 1–5 sao (chọn được bằng bàn phím), nhận xét tối thiểu 20 ký tự, tùy chọn ảnh. Sau gửi: “Cảm ơn bạn, đánh giá sẽ hiển thị sau khi được duyệt”. Hiển thị phản hồi của công ty nếu có.

### 4.8 Xác thực và tài khoản

- **Đăng ký:** họ tên, email, SĐT (tùy chọn), mật khẩu + nhập lại; thước đo độ mạnh (chữ + màu); checkbox điều khoản; thành công → hiện màn hình “Kiểm tra email để xác minh” và nút gửi lại (giới hạn tốc độ hiển thị đếm ngược).
- **Đăng nhập:** lỗi chung “Email hoặc mật khẩu chưa đúng”; khi bị khóa tạm: “Tạm khóa X phút do nhập sai nhiều lần”. Giữ `from` để quay lại.
- **Quên/đặt lại mật khẩu:** luôn hiện phản hồi trung tính “Nếu email tồn tại, chúng tôi đã gửi hướng dẫn”.
- **Hồ sơ/Bảo mật:** đổi họ tên, SĐT; đổi email (yêu cầu mật khẩu, xác minh email mới); đổi mật khẩu; danh sách phiên; “Đăng xuất khỏi mọi thiết bị”; yêu cầu xóa tài khoản (giải thích điều kiện).

### 4.9 Liên hệ và yêu cầu tour riêng

Biểu mẫu: họ tên, SĐT/email, loại yêu cầu (tư vấn / tour theo yêu cầu / khiếu nại), tour quan tâm, số người, ngày dự kiến, ngân sách, nội dung. Chống spam (thử thách bất đồng bộ), xác nhận gửi kèm mã tham chiếu và thời gian phản hồi dự kiến.

---

## 5. Bản đồ màn hình — phía quản trị

Layout `AdminLayout`: thanh bên theo **quyền** (mục không có quyền **không hiển thị**), thanh trên có tìm nhanh mã đơn, chuông thông báo, tên + vai trò, đăng xuất. Mọi route admin yêu cầu phiên nhân viên (cần 2FA với vai trò bắt buộc).

| Route | Quyền cần | Nội dung chính |
|---|---|---|
| `/admin` | `admin:access` | Dashboard theo vai trò (5.1) |
| `/admin/tours`, `/admin/tours/new`, `/admin/tours/:id` | `tour:read` (+ `tour:*`) | Bảng + form nhiều tab (5.2) |
| `/admin/departures`, `/admin/departures/:id` | `departure:read` | Lịch tháng + danh sách; chi tiết chuyến (5.3) |
| `/admin/bookings`, `/admin/bookings/:code` | `booking:read` | Hàng đợi + chi tiết đơn (5.4) |
| `/admin/payments` | `payment:read` | Giao dịch, đối soát, cần xử lý |
| `/admin/refunds` | `refund:read` | Hàng đợi hoàn tiền |
| `/admin/invoices` | `invoice:read` | Yêu cầu và hóa đơn đã xuất |
| `/admin/customers`, `/admin/customers/:id` | `customer:read` | Hồ sơ, lịch sử đơn, khóa/mở |
| `/admin/coupons` | `coupon:manage` | Mã giảm giá |
| `/admin/reviews` | `review:moderate` | Duyệt/phản hồi |
| `/admin/tickets`, `/admin/inquiries` | `ticket:handle` | Hàng đợi hỗ trợ, SLA |
| `/admin/operations/guides`, `/vehicles`, `/suppliers` | `operations:*` | Danh bạ nguồn lực |
| `/admin/reports/*` | `report:*` | Doanh thu, lấp đầy, hủy, công nợ, lợi nhuận chuyến, kênh, mã |
| `/admin/destinations`, `/admin/categories` | `tour:update` | Danh mục nền |
| `/admin/content/*` | `content:manage` | Banner, trang chính sách, bài viết |
| `/admin/users`, `/admin/roles` | `user:manage`, `role:manage` | Người dùng nội bộ, vai trò |
| `/admin/settings/*` | `settings:manage` | Tham số, chính sách hủy, thanh toán, mẫu thông báo |
| `/admin/audit-logs` | `audit:view` | Nhật ký thao tác |

### 5.1 Dashboard (theo vai trò)

| Vai trò | Thẻ/biểu đồ |
|---|---|
| sales | Đơn chờ xử lý, đơn sắp hết hạn giữ chỗ (≤ 2 giờ), yêu cầu hủy/đổi chờ duyệt, ticket quá SLA |
| operator | Chuyến 14 ngày tới (lấp đầy, tiền còn thiếu), chuyến sắp tới `go_nogo_date` thiếu khách, đơn chưa đủ tiền sắp quá hạn |
| accountant | Chuyển khoản chờ xác nhận, giao dịch “cần xử lý”, hoàn tiền chờ duyệt, công nợ theo tuổi nợ, đối soát hôm nay |
| tour_manager / super_admin | Doanh thu đã thu/ghi nhận theo kỳ, lấp đầy, tỷ lệ hủy, top tour, cảnh báo hệ thống |

Số liệu có **nguồn máy chủ**; mỗi thẻ ghi mốc thời gian cập nhật và liên kết sâu tới danh sách đã lọc sẵn.

### 5.2 Biên tập tour `/admin/tours/:id`

Tab: **Thông tin chung · Lịch trình · Giá & chính sách · Ảnh · Lịch khởi hành · SEO · Lịch sử thay đổi**.
- Thanh trên cố định: trạng thái tour, nút “Lưu nháp”, “Xem trước”, “Xuất bản” (liệt kê điều kiện còn thiếu khi chưa đủ), chỉ báo “đã lưu lúc …/chưa lưu”.
- Cảnh báo rời trang khi có thay đổi chưa lưu; `VERSION_CONFLICT` hiển thị hộp thoại so sánh.
- **Lịch trình:** danh sách ngày có thể kéo-thả đổi thứ tự (có nút lên/xuống cho bàn phím), mỗi ngày có tiêu đề, nội dung, bữa ăn, nơi nghỉ, địa điểm (cho bản đồ).
- **Ảnh:** `FileUploader`, chọn ảnh bìa, `alt` bắt buộc, sắp xếp.
- Tour đã có đơn: banner “Thay đổi giá/lịch không ảnh hưởng đơn đã đặt”; đổi nội dung quyền lợi gợi ý gửi thông báo.

### 5.3 Lịch khởi hành

- **Lịch tháng** (màu theo trạng thái + tỷ lệ lấp đầy) và **danh sách**; lọc theo tour, trạng thái, khoảng ngày, “cần chú ý”.
- **Tạo hàng loạt:** chọn tour, khoảng ngày, thứ trong tuần, sức chứa, giá → **xem trước danh sách lịch sẽ tạo** và các lịch trùng trước khi xác nhận.
- **Chi tiết chuyến** `/admin/departures/:id`: thanh tóm tắt (ngày, lấp đầy `seats_taken/capacity`, `min_pax`, đảm bảo khởi hành, tiền đã thu/còn thiếu), tab **Đơn · Khách (manifest) · Điều hành (HDV/xe/NCC) · Chi phí & lợi nhuận · Sự cố · Lịch sử**; nút **Chốt đoàn**, **Đóng bán**, **Hủy chuyến** (hộp thoại bắt buộc lý do, hiển thị **số đơn và số tiền bị ảnh hưởng** trước khi xác nhận).

### 5.4 Hàng đợi đơn và chi tiết đơn

**Hàng đợi `/admin/bookings`:** cột: Mã · Khách · Tour/ngày đi · NL/TE/EB · Tổng · Đã thu · Trạng thái · TT thanh toán · Hạn (giữ chỗ/thanh toán) · Kênh · Người phụ trách · Ngày tạo. Lọc: trạng thái, trạng thái thanh toán, khoảng ngày đi, tour, kênh, người phụ trách, **“quá hạn/sắp hết hạn”**, từ khóa (mã/tên/email/SĐT). Phân trang, sắp xếp, lưu bộ lọc yêu thích. Hành động hàng loạt (có quyền): gán người phụ trách, xuất danh sách (cần `export:pii`).

**Chi tiết `/admin/bookings/:code`:**

```
┌ Mã VT260315-K7QX2   [Đã xác nhận] [Đã đặt cọc]   Kênh: Web   Phụ trách: Lan ┐
│ Hành động: [Ghi nhận thanh toán] [Gia hạn giữ chỗ] [Đổi ngày] [Hủy đơn] ...   │
├─────────────────────────────────┬──────────────────────────────────────────┤
│ Khách & liên hệ                 │ Tiền: Tổng 8.850.000 · Đã thu 2.655.000  │
│ Tour · Chuyến · Điểm đón        │ Còn 6.195.000 · Hạn 08/03                │
│ Hành khách (bảng, giấy tờ che)  │ Giao dịch (bảng) · Hoàn tiền (bảng)      │
│ Giá snapshot (chi tiết dòng)    │ Yêu cầu đổi/hủy đang chờ                 │
├─────────────────────────────────┴──────────────────────────────────────────┤
│ Tab: Lịch sử trạng thái · Ghi chú nội bộ · Thông báo đã gửi · Chứng từ      │
└────────────────────────────────────────────────────────────────────────────┘
```

- Mọi nút hành động hiển thị theo **quyền và trạng thái hợp lệ**; thao tác nguy hiểm dùng `ConfirmDialog` kèm lý do bắt buộc, nêu rõ hậu quả tiền/chỗ.
- Xem **giấy tờ đầy đủ** của hành khách là hành động riêng (nút “Hiện”), ghi nhật ký.
- Sau thao tác: cập nhật tại chỗ, `Toast` thành công; lỗi nghiệp vụ hiển thị nguyên văn thông điệp máy chủ (bảng 8.2).

### 5.5 Thanh toán, hoàn tiền, hóa đơn

- **Thanh toán:** tab “Tất cả / Chờ xác nhận (chuyển khoản) / Cần xử lý (lệch tiền, thanh toán muộn, webhook lỗi) / Đối soát”. Màn xác nhận chuyển khoản: ảnh chứng từ bên trái, thông tin đơn bên phải, nhập số tiền thực nhận + ngày nhận (từ sao kê), nút **Xác nhận** / **Từ chối (lý do)**.
- **Đối soát:** tải/nhập báo cáo cổng hoặc sao kê, hiển thị khớp/không khớp hai chiều, ghi chú xử lý.
- **Hoàn tiền:** hàng đợi theo trạng thái; nút duyệt bị vô hiệu cho **chính người tạo yêu cầu**; hiển thị công thức (đã thu − phí hủy = hoàn); khoản ≥ ngưỡng hiển thị “cần người duyệt thứ hai”.
- **Hóa đơn:** danh sách yêu cầu (mã số thuế đã kiểm tra), nhập số hóa đơn/đính kèm, thao tác thay thế/điều chỉnh.

### 5.6 Các màn quản trị khác

| Màn | Bảng/biểu mẫu chính |
|---|---|
| Khách hàng | Bảng (tên, email, SĐT, số đơn, tổng chi tiêu, trạng thái); chi tiết có đơn, ticket, số dư bảo lưu; nút khóa/mở có lý do |
| Mã giảm giá | Bảng (mã, loại, giá trị, lượt dùng/giới hạn, hiệu lực, trạng thái); form có xem trước “mã này áp cho những tour nào”; xem hiệu quả mã |
| Đánh giá | Hàng đợi duyệt (nội dung, điểm, tour, khách); duyệt/ẩn/từ chối kèm lý do; ô phản hồi công khai |
| Ticket/yêu cầu | Danh sách có SLA đếm ngược (màu theo mức), khung hội thoại, gán người, đổi trạng thái, liên kết đơn |
| HDV/xe/NCC | Danh bạ, lịch bận (không cho gán trùng), tài liệu |
| Báo cáo | Bộ lọc kỳ/tour/kênh; bảng + biểu đồ đơn giản (cột/đường); ghi chú “đã thu” vs “ghi nhận”; xuất CSV/Excel |
| Người dùng/vai trò | Mời, gán vai trò, khóa; ma trận quyền chỉ đọc cho vai trò hệ thống; cảnh báo khi cấp quyền nhạy cảm |
| Cài đặt | Nhóm tham số (Phụ lục B của PRD) có mô tả, đơn vị, giá trị mặc định, lịch sử; chính sách hủy dạng bảng bậc có kiểm tra liên tục/không chồng lấn |
| Nhật ký | Bảng lọc (người, đối tượng, hành động, thời gian); xem diff trước/sau; không có nút sửa/xóa |

---

## 6. Danh mục trạng thái hiển thị (nguồn duy nhất cho `StatusChip`)

Giá trị dữ liệu là `snake_case` tiếng Anh; nhãn dưới đây chỉ dùng ở giao diện. **Không tạo trạng thái ngoài bảng.** Mỗi chip gồm biểu tượng + nhãn + màu token.

### 6.1 Đơn (`booking.status`)

| Giá trị | Nhãn khách | Nhãn admin | Token | Biểu tượng gợi ý |
|---|---|---|---|---|
| `pending` | Đang giữ chỗ | Chờ xử lý | pending | đồng hồ |
| `confirmed` | Đã xác nhận | Đã xác nhận | ok | dấu tích |
| `completed` | Đã hoàn thành | Hoàn thành | info | cờ |
| `cancelled` | Đã hủy | Đã hủy | danger | dấu X |
| `expired` | Hết hạn giữ chỗ | Hết hạn | muted | đồng hồ gạch |

### 6.2 Thanh toán của đơn (`booking.payment_status`)

| Giá trị | Nhãn | Token |
|---|---|---|
| `unpaid` | Chưa thanh toán | pending |
| `deposit_paid` | Đã đặt cọc | info |
| `paid` | Đã thanh toán đủ | ok |
| `partially_refunded` | Đã hoàn một phần | info |
| `refunded` | Đã hoàn tiền | muted |

### 6.3 Giao dịch (`payment.status`), hoàn tiền (`refund.status`), chuyến (`departure.status`), tour (`tour.status`)

| Đối tượng | Giá trị → nhãn (token) |
|---|---|
| Giao dịch | `initiated` Đã khởi tạo (muted) · `pending` Đang chờ (pending) · `succeeded` Thành công (ok) · `failed` Thất bại (danger) · `cancelled` Đã hủy (muted) · `expired` Hết hạn (muted) |
| Hoàn tiền | `requested` Chờ duyệt (pending) · `approved` Đã duyệt (info) · `processing` Đang hoàn (info) · `completed` Đã hoàn (ok) · `rejected` Từ chối (danger) · `failed` Hoàn thất bại (danger) |
| Chuyến | `draft` Nháp (muted) · `open` Đang mở bán (ok) · `full` Hết chỗ (danger) · `closed` Đã đóng bán (muted) · `departed` Đã khởi hành (info) · `completed` Đã kết thúc (info) · `cancelled` Đã hủy (danger); kèm chip phụ “Đảm bảo khởi hành” (ok) |
| Tour | `draft` Nháp (muted) · `published` Đang hiển thị (ok) · `hidden` Đang ẩn (muted) · `archived` Lưu trữ (muted) |
| Yêu cầu đổi/hủy | `submitted` Chờ duyệt (pending) · `approved` Đã duyệt (ok) · `rejected` Từ chối (danger) · `completed` Hoàn tất (info) · `withdrawn` Đã rút (muted) |
| Đánh giá | `pending` Chờ duyệt · `approved` Đã duyệt · `rejected` Từ chối · `hidden` Đã ẩn |
| Ticket | `open` Mới · `in_progress` Đang xử lý · `waiting_customer` Chờ khách · `resolved` Đã giải quyết · `closed` Đã đóng |

---

## 7. Trạng thái giao diện chuẩn

Mọi màn có dữ liệu bất đồng bộ phải cài đủ các trạng thái sau (dùng `Skeleton/EmptyState/ErrorState`).

| Trạng thái | Quy tắc |
|---|---|
| **Loading** | Skeleton cùng kích thước nội dung (tránh nhảy bố cục); nút hành động hiển thị “Đang …” và vô hiệu; không hiển thị “rỗng” khi chưa tải xong |
| **Rỗng** | Giải thích vì sao rỗng + hành động tiếp theo (“Khám phá tour”, “Xóa bộ lọc”). Phân biệt “chưa có dữ liệu” và “không có kết quả theo bộ lọc” |
| **Lỗi tải** | Nguyên văn thông điệp thân thiện (nếu máy chủ trả), nút “Thử lại”, `requestId` cho hỗ trợ (hiện rút gọn) |
| **Lỗi nghiệp vụ** | Hiển thị ngay vị trí thao tác bằng `Notice role="alert"`; ví dụ `SEAT_UNAVAILABLE` giữ nguyên form |
| **Mất kết nối** | Banner “Bạn đang ngoại tuyến”; chặn gửi các thao tác ghi, **không** báo thành công giả |
| **Phiên hết hạn** | Lỗi `UNAUTHENTICATED` → hộp thoại “Phiên đã hết hạn, đăng nhập lại để tiếp tục” giữ nguyên dữ liệu đang nhập (admin) hoặc chuyển `/login` có `from` (khách) |
| **Không đủ quyền** | Trang 403 kèm đường quay lại; control không có quyền **không hiển thị** (không chỉ làm mờ) |
| **Xung đột phiên bản** | `VERSION_CONFLICT` → hộp thoại “Bản ghi vừa được người khác cập nhật” + xem khác biệt + “Tải lại” / “Ghi đè” (chỉ khi có quyền) |
| **Thành công** | `Toast role="status"` tự ẩn sau 5 giây, không che nội dung quan trọng; hành động không thể hoàn tác dùng thông báo cố định |
| **Đang xử lý lâu** | Quá 5 giây: hiện chữ giải thích “Việc này có thể mất vài giây”; quá 15 giây: gợi ý kiểm tra “Đơn của tôi” thay vì thử lại mù |

---

## 8. Biểu mẫu, thông điệp và định dạng

### 8.1 Quy tắc biểu mẫu

- Nhãn (`<label>`) gắn `for/id`; trường bắt buộc đánh dấu bằng chữ “(bắt buộc)” chứ không chỉ dấu `*`.
- Kiểm tra: **khi rời ô (blur)** và **khi gửi**; lỗi nằm dưới trường, `aria-invalid="true"`, `aria-describedby` trỏ tới lỗi; sau khi gửi lỗi, focus vào trường lỗi đầu tiên và có tóm tắt lỗi ở đầu form.
- Giữ nguyên dữ liệu người dùng khi có lỗi; không xóa mật khẩu trừ khi lỗi bảo mật.
- Chống gửi đúp: vô hiệu nút gửi trong lúc chờ; thao tác tạo tiền/đơn dùng khóa idempotency.
- Quy tắc kiểm tra ở client **phản chiếu** quy tắc máy chủ để phản hồi nhanh; máy chủ vẫn là quyết định cuối; lỗi theo trường từ máy chủ (`fields`) được gắn vào đúng ô.
- Trường nhạy cảm (số giấy tờ): `autocomplete="off"`, che một phần sau khi nhập, không ghi vào URL/log/analytics.

| Trường | Quy tắc |
|---|---|
| Họ tên | 2–100 ký tự, cho phép dấu tiếng Việt, loại ký tự điều khiển |
| Email | Định dạng hợp lệ, tối đa 254 ký tự |
| SĐT | Chuẩn hóa về 0xxxxxxxxx hoặc +84…; 9–11 chữ số |
| Mật khẩu | ≥ 8 ký tự; hiển thị độ mạnh; cho phép dán, có nút hiện/ẩn |
| Ngày sinh | Không ở tương lai; khớp loại khách theo ngày đi (BR-10) |
| Mã giảm giá | Chữ hoa/số, không phân biệt hoa thường khi nhập, cắt khoảng trắng |
| Mã số thuế | 10 hoặc 13 chữ số (`10-3`) |
| Số tiền (admin) | Số nguyên VND ≥ 0, hiển thị dấu chấm ngăn nghìn khi nhập |

### 8.2 Thông điệp tiếng Việt chuẩn theo mã lỗi

Giao diện hiển thị **`error.message` từ máy chủ nếu có**; bảng dưới là thông điệp dự phòng và cách xử lý hành động.

| Mã lỗi | Thông điệp dự phòng | Hành động giao diện |
|---|---|---|
| `VALIDATION_ERROR` | “Vui lòng kiểm tra lại các trường được đánh dấu.” | Gắn lỗi theo `fields`, focus ô đầu |
| `UNAUTHENTICATED` | “Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.” | Chuyển/đưa hộp thoại đăng nhập |
| `FORBIDDEN` | “Bạn không có quyền thực hiện thao tác này.” | `Notice`, không lặp lại |
| `NOT_FOUND` | “Không tìm thấy nội dung bạn yêu cầu.” | Trang/khối 404 với đường quay lại |
| `EMAIL_TAKEN` | “Email này đã được đăng ký. Bạn thử đăng nhập nhé.” | Liên kết sang đăng nhập |
| `EMAIL_NOT_VERIFIED` | “Vui lòng xác minh email trước khi đặt tour.” | Nút “Gửi lại liên kết” |
| `ACCOUNT_LOCKED` | “Tài khoản tạm thời bị khóa. Vui lòng thử lại sau ít phút hoặc liên hệ hỗ trợ.” | Hiển thị thời gian còn lại nếu có |
| `RATE_LIMITED` | “Bạn thao tác quá nhanh, vui lòng thử lại sau ít giây.” | Vô hiệu nút có đếm ngược |
| `SEAT_UNAVAILABLE` | “Rất tiếc, chuyến này chỉ còn N chỗ.” | Gợi ý đổi số khách/lịch khác |
| `DEPARTURE_CLOSED` | “Chuyến này đã đóng bán.” | Liên kết xem lịch khác |
| `HOLD_EXPIRED` | “Thời gian giữ chỗ đã hết.” | Nút “Kiểm tra còn chỗ & đặt lại” |
| `INVALID_STATE_TRANSITION` | “Thao tác không hợp lệ với trạng thái hiện tại của đơn.” | Tải lại dữ liệu đơn |
| `VERSION_CONFLICT` | “Bản ghi vừa được cập nhật bởi người khác.” | Hộp thoại xung đột (mục 7) |
| `IDEMPOTENCY_CONFLICT` | “Yêu cầu này không khớp với yêu cầu trước đó. Vui lòng tải lại trang.” | Tải lại |
| `COUPON_INVALID` | Theo `reason` (bên dưới) | Không chặn đặt chỗ |
| `PAYMENT_AMOUNT_MISMATCH` | “Số tiền thanh toán chưa khớp. Chúng tôi sẽ liên hệ để xử lý.” | Hiển thị mã tham chiếu |
| `PAYMENT_ALREADY_SETTLED` | “Đơn này đã được thanh toán đủ.” | Ẩn khu thanh toán |
| `CANCEL_NOT_ALLOWED` | “Đơn không thể hủy/đổi vào thời điểm này. Vui lòng liên hệ hỗ trợ.” | Nút liên hệ |
| `REFUND_EXCEEDS_PAID` | “Số tiền hoàn không được vượt số tiền đã thu.” | Sửa số tiền |
| `HAS_DEPENDENCIES` | “Không thể xóa vì còn dữ liệu liên quan. Bạn có thể tạm ẩn thay vì xóa.” | Gợi ý “Tạm ẩn” |
| `INTERNAL_ERROR` / mạng | “Có lỗi hệ thống. Vui lòng thử lại sau.” + mã `requestId` | “Thử lại” |

**Lý do mã giảm giá (`COUPON_INVALID.reason`):** `expired` “Mã đã hết hạn.” · `used_up` “Mã đã hết lượt sử dụng.” · `min_order` “Đơn chưa đạt giá trị tối thiểu X đ để dùng mã này.” · `not_applicable` “Mã không áp dụng cho tour hoặc ngày khởi hành này.” · `already_used` “Bạn đã sử dụng mã này.”

### 8.3 Định dạng hiển thị

- Tiền: `Intl.NumberFormat("vi-VN", {style:"currency", currency:"VND"})` hoặc helper `formatVnd` hiện có; không hiển thị số thập phân.
- Ngày: `dd/MM/yyyy` (`vi-VN`); giờ 24h `HH:mm`; ngày đi hiển thị kèm thứ (“Thứ Sáu, 13/03/2026”). Thời điểm trong nhật ký hiển thị theo múi giờ `Asia/Ho_Chi_Minh`.
- Đếm ngược giữ chỗ: `hh:mm:ss`; còn dưới 30 phút đổi sang token cảnh báo và thông báo cho trình đọc màn hình ở các mốc 30/10/5/1 phút (không đọc từng giây).
- Số lượng khách: “2 người lớn · 1 trẻ em”; không hiển thị “0 em bé”.
- Mã đơn dùng chữ đơn cách (monospace) và có nút sao chép.

---

## 9. Responsive và bố cục

- Mobile-first, kiểm tra tại **360, 390, 768, 1024, 1280 px**; không tràn ngang ở 360px.
- **Thanh dính** cho hành động chính ở mobile (đặt tour, thanh toán), không che nội dung cuối trang (chừa `padding-bottom`, tính cả `safe-area`).
- **Bảng admin** trên mobile: cuộn ngang trong vùng chứa **hoặc** chuyển thành thẻ với 3–4 trường quan trọng + nút “Chi tiết”; thao tác thiết yếu (xác nhận thanh toán, xem đơn) phải dùng được ở 360–650px.
- Dialog trên mobile mở toàn màn hình hoặc bottom sheet; khóa cuộn nền; nút chính ở vị trí với tới bằng ngón cái.
- Ảnh: `srcset/sizes`, `loading="lazy"` cho ảnh ngoài màn hình đầu, có `width/height` hoặc `aspect-ratio` để tránh CLS.

## 10. Khả năng truy cập (WCAG 2.1 AA)

- Mọi điều khiển dùng được bằng bàn phím; thứ tự Tab theo bố cục; focus **luôn nhìn thấy** và không bị header dính che.
- `ConfirmDialog`/drawer: `role="dialog"`, `aria-modal`, **bẫy focus**, `Esc` đóng, trả focus về nút mở.
- `DepartureCalendar`: mẫu lưới ngày với phím mũi tên/`PageUp`/`PageDown`/`Home`/`End`; mỗi ô có nhãn đầy đủ (“Thứ Sáu 13 tháng 3, còn 5 chỗ”).
- Thông báo động: `role="alert"` cho lỗi, `role="status"` cho thành công/tiến trình; **không** tự động chuyển trang/làm mới khiến mất ngữ cảnh.
- Biểu đồ/báo cáo có bảng dữ liệu thay thế; màu không phải kênh thông tin duy nhất.
- Nút chỉ có biểu tượng có tên truy cập; ảnh nội dung có `alt`; ảnh trang trí `alt=""`.
- Thời hạn có đếm ngược: cho phép người dùng yêu cầu thêm thời gian bằng cách liên hệ (hiển thị rõ), không chỉ dựa vào cơ chế tự động.
- Kiểm tra bằng công cụ tự động (axe/Lighthouse) **và** duyệt bằng bàn phím/trình đọc màn hình cho luồng đặt tour, thanh toán, hủy.

## 11. Hiệu năng giao diện

- Tách mã theo route (`React.lazy`) cho khu admin, bản đồ, trình soạn thảo.
- Danh sách dài: phân trang/cuộn vô hạn có điều khiển; bảng rất lớn dùng ảo hóa dòng.
- Debounce tìm kiếm/báo giá 300 ms và **hủy yêu cầu cũ** (`AbortController`).
- Font: `font-display: swap`, chỉ tải trọng lượng cần dùng.
- Mục tiêu đo thực tế (Core Web Vitals): LCP ≤ 2,5 giây, CLS ≤ 0,1, INP ≤ 200 ms cho trang danh sách/chi tiết tour trên di động.

## 12. Bản in và chứng từ

- **Voucher** và **manifest** có giao diện in riêng (`@media print`): khổ A4, ẩn thanh điều hướng, ngắt trang hợp lý, mã đơn/QR rõ ràng, mỗi trang manifest có tiêu đề cột lặp lại.
- Nội dung nhạy cảm (số giấy tờ) in dạng che theo BR-43 trừ khi người in có quyền và chọn rõ “In đầy đủ”.
- Tiêu đề tệp tải về: `VoucherVT260315-K7QX2.pdf`, `Manifest-<tour>-<ngày>.pdf`.

---

## 13. Quy trình giao nhiệm vụ cho AI

1. **Đọc bối cảnh:** `README`, `01-PRD-NGHIEP-VU.md` (luồng/quy tắc liên quan), tài liệu này, `03/04-TECH-*`, component/style hiện có, trạng thái Git.
2. **Xác định phạm vi:** route, luồng `LN-`, quy tắc `BR-`, dữ liệu, trạng thái (loading/empty/error/success/quyền), responsive, tiêu chí nghiệm thu.
3. **Lập kế hoạch tối thiểu:** liệt kê file sẽ sửa/tạo; tái sử dụng component/token; không dựng backend giả.
4. **Thực thi:** thay đổi trong phạm vi; không đổi nội dung nghiệp vụ không được yêu cầu; không refactor lan man.
5. **Kiểm tra:** chạy `npm run build` (type-check + build), test mục tiêu (nếu có), kiểm tra giao diện/console ở route bị ảnh hưởng, 360px và bàn phím.
6. **Review:** người phụ trách đối chiếu đặc tả, accessibility, dữ liệu, diff Git.
7. **Bàn giao:** tóm tắt file đổi, hành vi, lệnh đã chạy + kết quả thật, phần chưa làm/giả định.

### 13.1 Đầu vào bắt buộc của một yêu cầu UI

- Mục tiêu người dùng, route, luồng `LN-` liên quan.
- Trạng thái hiện tại và kết quả mong muốn.
- Quy tắc dữ liệu/validation (trích `BR-`), mã lỗi cần xử lý.
- Trạng thái: loading, rỗng, lỗi, thành công, quyền.
- Viewport/thiết bị và yêu cầu accessibility.
- Ràng buộc kiến trúc/thư viện, file **không được sửa**.
- Tiêu chí nghiệm thu quan sát/kiểm thử được (trích `AC-`).

### 13.2 Mẫu prompt

**Mẫu chung**

```text
Bạn đang làm việc trong ứng dụng VietTrails (React 19, TypeScript, Vite,
React Router, Zustand). Trước khi sửa, đọc docs/01-PRD-NGHIEP-VU.md,
docs/02-UI-AI-IMPLEMENTATION.md, docs/03-TECH-FRONTEND-AI.md và các file liên quan.

Mục tiêu: [mục tiêu người dùng]
Luồng/quy tắc: [LN-xx, BR-xx, AC-xx]
Route/phạm vi: [route, component, file]
Hành vi mong muốn: [quy tắc cụ thể]
Trạng thái cần xử lý: [loading / empty / error / success / quyền]
Mã lỗi cần xử lý: [SEAT_UNAVAILABLE, ...]
Responsive/accessibility: [yêu cầu]
Không làm: [ngoài phạm vi; không tính tiền/tồn chỗ ở client; không bịa endpoint]
Tiêu chí nghiệm thu:
- [điều kiện quan sát/đo được]
- [điều kiện lỗi/biên]

Tái sử dụng pattern hiện có. Nếu thiếu thông tin nghiệp vụ, hỏi hoặc nêu giả định,
đừng tự quyết chính sách. Thực hiện, chạy npm run build (và test mục tiêu nếu có),
rồi báo rõ file đã đổi, kết quả lệnh thật và giới hạn còn lại.
```

**Mẫu cho màn checkout**

```text
Triển khai bước [1|2|3] của /checkout theo mục 4.3 của 02-UI-AI-IMPLEMENTATION.md
và LN-04. Tuân thủ: BR-10, BR-12, BR-14, BR-21, BR-46.
- Mọi số tiền lấy từ API báo giá; không tự cộng/nhân ở client.
- Gửi Idempotency-Key sinh một lần cho phiên checkout; "Thử lại" dùng cùng khóa.
- Xử lý đủ bảng kết quả ở mục 4.3 (SEAT_UNAVAILABLE, DEPARTURE_CLOSED, ...).
- Giữ dữ liệu form khi lỗi; focus vào lỗi đầu tiên.
- Kiểm tra 360px và bàn phím. Dùng StepIndicator, PriceSummary, PassengerForm.
Nghiệm thu: AC-01, AC-02, AC-04, AC-09.
```

**Mẫu cho màn admin**

```text
Triển khai màn [tên] theo mục 5.x của 02-UI-AI-IMPLEMENTATION.md và 04-TECH-ADMIN-AI.md.
- Dùng DataTable phân trang/lọc/sắp xếp PHÍA MÁY CHỦ, bộ lọc đồng bộ URL.
- Chỉ hiển thị control mà người dùng có quyền; máy chủ vẫn là nơi quyết định.
- Thao tác nguy hiểm dùng ConfirmDialog có lý do bắt buộc và nêu hậu quả cụ thể.
- Xử lý VERSION_CONFLICT, INVALID_STATE_TRANSITION, HAS_DEPENDENCIES.
Nghiệm thu: [AC-xx]. Báo kết quả npm run build.
```

### 13.3 Định nghĩa “Hoàn thành” (DoD) cho một thay đổi giao diện

- [ ] Đúng đặc tả mục tương ứng, không thêm tính năng ngoài phạm vi.
- [ ] Đủ trạng thái: loading, rỗng, lỗi, thành công, không đủ quyền, mất kết nối.
- [ ] Mọi số tiền/chỗ/quyền lấy từ máy chủ; không logic nghiệp vụ nhạy cảm ở client.
- [ ] Xử lý các mã lỗi liên quan theo bảng 8.2.
- [ ] Không tràn ngang ở 360px; thao tác bằng bàn phím và cảm ứng.
- [ ] Accessibility: nhãn, lỗi, focus, vai trò ARIA, tương phản.
- [ ] `npm run build` sạch; không lỗi console mới; test mục tiêu (nếu có) đạt.
- [ ] Không bí mật/dữ liệu cá nhân thật trong mã, log, commit.
- [ ] Bản bàn giao nêu rõ file đổi, lệnh đã chạy, giả định, phần còn lại.

### 13.4 Những việc AI **không** được tự làm

- Đổi chính sách (phí hủy, cọc, hạn…) hoặc ngưỡng quyền; thêm trạng thái mới.
- Tạo endpoint/trường dữ liệu không có trong hợp đồng ở `03/04-TECH-*`.
- Tắt kiểm tra (`@ts-ignore` để lách lỗi nghiệp vụ, bỏ validate) hoặc nới quyền để “cho chạy được”.
- Lưu token, mật khẩu, số giấy tờ trong `localStorage`/URL/log.
- Xóa hoặc viết lại hàng loạt file không liên quan; sửa file được đánh dấu “không được sửa”.

---

## 14. Danh sách kiểm tra nghiệm thu giao diện

**Luồng khách**
- [ ] Tìm/lọc/sắp xếp giữ trong URL; xóa lọc hoạt động; phân trang máy chủ đúng.
- [ ] Chọn lịch: ngày hết chỗ/đã đóng không chọn được, có lý do; số khách bị giới hạn đúng.
- [ ] Giá tổng ở chi tiết, checkout, thanh toán, xác nhận, email **khớp nhau** (cùng nguồn máy chủ).
- [ ] Loại khách đổi khi ngày sinh thay đổi và thông báo cho khách.
- [ ] Hết chỗ giữa chừng: không mất dữ liệu form; không tạo đơn.
- [ ] Bấm “Xác nhận” hai lần chỉ có một đơn.
- [ ] Đồng hồ giữ chỗ đúng; hết hạn chuyển trạng thái đúng; thông báo mốc cho trình đọc màn hình.
- [ ] Trang kết quả thanh toán không tin tham số URL; xử lý thành công/thất bại/chờ quá lâu.
- [ ] Đơn của tôi: nút hiển thị theo bảng hành động 4.6; báo giá hủy khớp máy chủ.
- [ ] Xác minh email, quên mật khẩu, khóa tạm hiển thị đúng, không lộ email tồn tại.

**Luồng admin**
- [ ] Menu/nút theo quyền; gọi trực tiếp API không quyền vẫn bị từ chối (kiểm tra cùng QA backend).
- [ ] Bảng phân trang/lọc/sắp xếp **máy chủ**, đồng bộ URL, nhớ vị trí khi quay lại.
- [ ] Hủy chuyến hiển thị số đơn/tiền bị ảnh hưởng trước khi xác nhận, bắt buộc lý do.
- [ ] Hoàn tiền: người tạo không tự duyệt; công thức hiển thị đúng.
- [ ] Xác nhận chuyển khoản: đối chiếu số tiền; từ chối cần lý do.
- [ ] `VERSION_CONFLICT` có hộp thoại xử lý; thay đổi chưa lưu có cảnh báo rời trang.
- [ ] Xem giấy tờ đầy đủ là hành động riêng, ghi nhật ký; manifest in đúng.

**Chung**
- [ ] 360px không tràn; bàn phím đi hết luồng; tương phản đạt; không lỗi console.
- [ ] `npm run build` sạch.

---

## 15. Lộ trình công việc giao diện (gợi ý giao cho AI theo thứ tự)

| Mã | Công việc | Phụ thuộc | Nghiệm thu | Pha |
|---|---|---|---|---|
| U-01 | Token trạng thái, `StatusChip`, `EmptyState/ErrorState/Skeleton`, `Toast` | — | Mục 6, 7 | P0 |
| U-02 | `DataTable` + `FilterBar` đồng bộ URL, phân trang máy chủ | API phân trang | AC-30 | P0 |
| U-03 | `/tours` & `/tours/:slug` với `DepartureCalendar`, `PaxStepper`, báo giá | API departures/quote | AC-04, AC-09 | P0 |
| U-04 | `/checkout` 3 bước + `PassengerForm` + `CouponInput` + idempotency | U-03, API bookings | AC-01…05 | P0 |
| U-05 | `/booking/:code/pay`, `/payment/result`, `BankTransferPanel` | API payments | AC-06…08 | P0 |
| U-06 | Đăng ký/đăng nhập/xác minh/quên mật khẩu/bảo mật | API auth | AC-03, AC-19 | P0 |
| U-07 | Đơn của tôi + chi tiết + hủy/đổi (báo giá) | API bookings, cancellation-quote | AC-11, AC-12 | P0 |
| U-08 | Admin: hàng đợi + chi tiết đơn, thanh toán, hoàn tiền | API admin | AC-13, AC-17 | P0 |
| U-09 | Admin: tour editor nhiều tab, upload ảnh, lịch khởi hành (lịch tháng, hàng loạt) | API admin | AC-18 | P0 |
| U-10 | Admin: người dùng/vai trò, cài đặt, nhật ký | API admin | AC-20 | P0 |
| U-11 | Admin: chi tiết chuyến, manifest, HDV/xe/NCC, chi phí | API operations | AC-21, AC-22 | P1 |
| U-12 | Voucher/manifest in; hóa đơn | API documents | Mục 12 | P1 |
| U-13 | Mã giảm giá, đánh giá, ticket | API tương ứng | AC-24, AC-25 | P1 |
| U-14 | Báo cáo và dashboard theo vai trò | API reports | AC-27 | P1 |
| U-15 | Wishlist, danh sách chờ, CMS, đa ngôn ngữ | — | — | P2 |
