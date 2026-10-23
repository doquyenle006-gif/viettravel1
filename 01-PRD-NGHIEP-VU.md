# Tài liệu nghiệp vụ hoàn chỉnh — Hệ thống quản lý đặt tour VietTrails

| Thuộc tính | Giá trị |
|---|---|
| Phiên bản tài liệu | 2.0 (bản mục tiêu đầy đủ) |
| Thay thế / mở rộng | `docs/PRD.md` v1.0 (bản mô tả frontend minh họa) |
| Vai trò của tài liệu | **Nguồn sự thật nghiệp vụ**. Ba tài liệu còn lại (`02-UI-AI-IMPLEMENTATION.md`, `03-TECH-FRONTEND-AI.md`, `04-TECH-ADMIN-AI.md`) tham chiếu mã `LN-`, `BR-`, `FR-`, trạng thái và mã lỗi định nghĩa ở đây |
| Đối tượng đọc | Chủ sản phẩm, quản lý vận hành, kế toán, thiết kế, frontend, backend, QA, AI lập trình |
| Trạng thái | Đặc tả **mục tiêu**. Mục 14 đối chiếu với hiện trạng mã nguồn |

> **Cách đọc.** Tài liệu mô tả hệ thống như một công ty lữ hành vận hành thật: có lịch khởi hành, tồn chỗ, giữ chỗ, đặt cọc, thanh toán, hủy/hoàn tiền, điều hành đoàn, hóa đơn và báo cáo.
> Các **con số mặc định** (tỷ lệ cọc, phí hủy, thời gian giữ chỗ…) là giá trị khởi điểm, đều nằm trong bảng cấu hình ở Phụ lục B và **phải được chủ sản phẩm/pháp chế duyệt** trước khi vận hành. Nội dung về pháp lý chỉ để định hướng, không phải tư vấn pháp lý.

**Quy ước mã**

| Mã | Ý nghĩa |
|---|---|
| `M01…M16` | Phân hệ (module) |
| `LN-xx` | Luồng nghiệp vụ |
| `BR-xx` | Quy tắc nghiệp vụ |
| `FR-<module>-xx` | Yêu cầu chức năng |
| `P0 / P1 / P2` | Mức ưu tiên: P0 bắt buộc để vận hành thật; P1 nên có ngay sau; P2 mở rộng |
| Trạng thái | `snake_case` tiếng Anh trong dữ liệu/API; nhãn tiếng Việt chỉ dùng ở giao diện |

---

## 1. Tổng quan

### 1.1 Bài toán

Một công ty lữ hành bán **tour trọn gói** theo **lịch khởi hành** cố định. Mỗi chuyến có số chỗ giới hạn, giá theo độ tuổi, hạn chót thanh toán và chính sách hủy. Công ty cần:

1. Bán tour trực tuyến 24/7 mà **không bán quá số chỗ**.
2. Thu tiền đúng (cọc, phần còn lại), đối soát được với cổng thanh toán/ngân hàng.
3. Điều hành chuyến: chốt đoàn, danh sách khách, hướng dẫn viên, xe, khách sạn.
4. Xử lý ngoại lệ: khách đổi/hủy, chuyến thiếu khách phải hủy, thiên tai, hoàn tiền.
5. Có số liệu: doanh thu, tỷ lệ lấp đầy, tỷ lệ hủy, lợi nhuận từng chuyến, công nợ.

### 1.2 Mục tiêu và chỉ số

| Mục tiêu | Chỉ số (KPI) | Mục tiêu gợi ý |
|---|---|---|
| Không bán vượt chỗ | Số đơn vượt tồn chỗ | 0 |
| Chuyển đổi đặt tour | Tỷ lệ hoàn tất thanh toán / số đơn bắt đầu checkout | ≥ 55% |
| Thu tiền đúng hạn | Tỷ lệ đơn thanh toán đủ trước `balance_due_date` | ≥ 95% |
| Vận hành chuyến | Tỷ lệ chuyến đủ khách tối thiểu (`min_pax`) | ≥ 85% |
| Hài lòng | Điểm đánh giá trung bình; tỷ lệ khiếu nại / số khách | ≥ 4,5/5; ≤ 2% |
| Chính xác tài chính | Số giao dịch chưa đối soát quá 48 giờ | 0 |
| Tốc độ xử lý | Thời gian xử lý đơn thủ công; thời gian hoàn tiền | ≤ 4 giờ làm việc; ≤ 7 ngày làm việc |

KPI chỉ đo được khi đã gắn sự kiện analytics (mục 10, 11).

### 1.3 Phạm vi

**Trong phạm vi:** tour nội địa trọn gói (khởi hành ghép đoàn và đoàn riêng), bán online + bán tại quầy/điện thoại, thanh toán trực tuyến và chuyển khoản, điều hành chuyến, CSKH, báo cáo.

**Ngoài phạm vi bản này (ghi để không hiểu nhầm):** bán vé máy bay/khách sạn lẻ, tour quốc tế có xin visa (chỉ lưu trường hộ chiếu), kế toán tổng hợp đầy đủ (chỉ xuất dữ liệu sang phần mềm kế toán), ứng dụng di động native, chatbot tư vấn tự động.

---

## 2. Thuật ngữ

| Thuật ngữ | Giải nghĩa |
|---|---|
| **Tour** (sản phẩm) | Mẫu hành trình: nội dung, lịch trình, điều kiện. Chưa gắn ngày cụ thể |
| **Lịch khởi hành** (`departure`) | Một lần chạy của tour vào một ngày cụ thể: có giá, số chỗ, trạng thái. **Booking luôn đặt vào lịch khởi hành, không đặt vào tour** |
| **Chỗ** (`seat`) | Một suất tham gia. Người lớn và trẻ em chiếm chỗ; em bé mặc định không chiếm chỗ (cấu hình) |
| **Giữ chỗ** (`hold`) | Chỗ được khóa tạm cho đơn `pending` đến `hold_expires_at` |
| **Đặt cọc** (`deposit`) | Khoản trả trước để xác nhận đơn |
| **Hạn thanh toán đủ** (`balance_due_date`) | Ngày muộn nhất phải trả hết phần còn lại |
| **Đảm bảo khởi hành** (`is_guaranteed`) | Chuyến đã đủ `min_pax` và công ty cam kết chạy |
| **Chốt đoàn** | Mốc (`go_nogo_date`) công ty quyết định chạy hay hủy chuyến theo số khách |
| **Manifest** | Danh sách khách và yêu cầu đặc biệt của một chuyến, dùng cho điều hành/HDV |
| **Voucher** | Chứng từ xác nhận dịch vụ gửi khách sau khi đơn được xác nhận |
| **Bảo lưu** (`credit`) | Số tiền khách được giữ lại để dùng cho đơn sau thay vì hoàn tiền |
| **No-show** | Khách không có mặt tại điểm đón đúng giờ |
| **Ghép đoàn / đoàn riêng** | Nhiều khách lẻ đi chung một chuyến / một nhóm thuê trọn chuyến |

---

## 3. Tác nhân và quyền hạn

### 3.1 Tác nhân

| Mã vai trò | Tên | Nhiệm vụ chính |
|---|---|---|
| `guest` | Khách vãng lai | Xem tour, tìm kiếm, gửi yêu cầu tư vấn. Không đặt tour được |
| `customer` | Khách hàng | Đặt tour, thanh toán, quản lý đơn, đánh giá |
| `sales` | Nhân viên tư vấn/bán hàng (CSKH) | Tạo đơn hộ khách, xác nhận đơn, xử lý yêu cầu đổi/hủy, trả lời ticket |
| `operator` | Điều hành | Mở/đóng lịch, chốt đoàn, gán HDV/xe, xuất manifest, xử lý sự cố chuyến |
| `tour_manager` | Quản lý sản phẩm | Tạo/sửa/xuất bản tour, đặt giá, chính sách |
| `accountant` | Kế toán | Xác nhận thanh toán thủ công, duyệt/xử lý hoàn tiền, đối soát, hóa đơn |
| `content_editor` | Nội dung/marketing | Banner, bài viết, SEO, mã khuyến mãi, duyệt đánh giá |
| `guide` | Hướng dẫn viên | Chỉ xem manifest chuyến được gán; báo cáo sự cố |
| `super_admin` | Quản trị hệ thống | Toàn quyền; quản lý người dùng nội bộ, vai trò, cấu hình |

Hệ thống **hiện có** chỉ có `admin` và `user`. Đối chiếu: `admin → super_admin`, `user → customer`. Các vai trò mới do `super_admin` cấp.

### 3.2 Ma trận quyền theo chức năng (RBAC)

Ký hiệu: ● toàn quyền · ◐ có điều kiện (ghi chú) · ○ chỉ xem · — không có.

| Chức năng | customer | sales | operator | tour_manager | accountant | content_editor | guide | super_admin |
|---|---|---|---|---|---|---|---|---|
| Xem tour công khai | ● | ● | ● | ● | ● | ● | ● | ● |
| Tạo/sửa/xuất bản tour | — | — | ○ | ● | — | ◐ (SEO/ảnh) | — | ● |
| Tạo/sửa lịch khởi hành, giá | — | ○ | ● | ● | ○ | — | — | ● |
| Hủy lịch khởi hành | — | — | ◐ cần lý do | ◐ cần lý do | — | — | — | ● |
| Đặt tour cho chính mình | ● | — | — | — | — | — | — | — |
| Tạo đơn hộ khách | — | ● | ◐ | — | — | — | — | ● |
| Xem đơn | ◐ chỉ đơn của mình | ● | ● | ○ | ● | — | ◐ chỉ khách chuyến được gán | ● |
| Xác nhận / hủy đơn | ◐ hủy đơn của mình theo chính sách | ● | ◐ | — | — | — | — | ● |
| Ghi nhận thanh toán thủ công | — | ◐ tạo yêu cầu | — | — | ● | — | — | ● |
| Duyệt hoàn tiền | — | ◐ tạo yêu cầu | — | — | ● | — | — | ● |
| Xuất hóa đơn | — | — | — | — | ● | — | — | ● |
| Mã khuyến mãi | — | ○ | — | ◐ | — | ● | — | ● |
| Duyệt đánh giá | — | ◐ | — | — | — | ● | — | ● |
| Ticket / khiếu nại | ◐ của mình | ● | ◐ | — | — | — | — | ● |
| Xuất danh sách khách (dữ liệu cá nhân) | — | ◐ | ● | — | ◐ | — | ◐ chuyến được gán | ● |
| Báo cáo vận hành | — | ○ | ● | ● | ● | ◐ | — | ● |
| Báo cáo tài chính | — | — | — | ◐ doanh thu theo tour | ● | — | — | ● |
| Quản lý người dùng, vai trò, cấu hình | — | — | — | — | — | — | — | ● |
| Xem nhật ký thao tác | — | — | — | — | ◐ phần tài chính | — | — | ● |

**Nguyên tắc (BR-01):** quyền kiểm tra **ở máy chủ cho từng yêu cầu**, mặc định từ chối (deny-by-default). Ẩn nút ở giao diện chỉ để dễ dùng. Khách chỉ truy cập được bản ghi của chính mình (kiểm tra theo đối tượng, chống IDOR).

---

## 4. Bản đồ phân hệ

| Mã | Phân hệ | Mục đích | Người dùng chính | Ưu tiên |
|---|---|---|---|---|
| M01 | Danh mục nền | Điểm đến, danh mục, vùng miền, chính sách hủy, tham số cấu hình | tour_manager, super_admin | P0 |
| M02 | Sản phẩm tour | Nội dung, lịch trình theo ngày, bao gồm/không bao gồm, ảnh, SEO, xuất bản | tour_manager, content_editor | P0 |
| M03 | Lịch khởi hành & giá | Ngày chạy, tồn chỗ, giá theo độ tuổi, đóng/mở bán, đảm bảo khởi hành | operator, tour_manager | P0 |
| M04 | Khám phá & tìm kiếm | Danh sách, lọc, chi tiết, bản đồ, điểm đến, đánh giá | customer, guest | P0 |
| M05 | Tài khoản & xác thực | Đăng ký, xác minh email, đăng nhập, quên mật khẩu, hồ sơ, bảo mật | customer, nhân viên | P0 |
| M06 | Đặt tour (booking) | Báo giá, giữ chỗ, hành khách, vòng đời đơn, đơn tạo hộ | customer, sales | P0 |
| M07 | Thanh toán | Cổng online, chuyển khoản, tiền mặt, đối soát, công nợ | customer, accountant | P0 |
| M08 | Hủy, đổi, hoàn tiền | Yêu cầu thay đổi, tính phí hủy, hoàn tiền, bảo lưu | customer, sales, accountant | P0 |
| M09 | Thông báo | Email/SMS/Zalo, thông báo trong ứng dụng, mẫu và nhật ký gửi | hệ thống | P0 (email), P1 (SMS/Zalo) |
| M10 | Điều hành chuyến | Chốt đoàn, manifest, HDV, xe, nhà cung cấp, chi phí, sự cố | operator, guide | P1 |
| M11 | Chứng từ | Voucher, hợp đồng/xác nhận dịch vụ, hóa đơn điện tử | accountant, customer | P1 |
| M12 | Khuyến mãi | Mã giảm giá, ưu đãi đặt sớm | content_editor | P1 |
| M13 | Đánh giá & CSKH | Đánh giá sau chuyến, ticket, yêu cầu tour riêng, liên hệ | customer, sales | P1 |
| M14 | Báo cáo & phân tích | Doanh thu, lấp đầy, hủy, lợi nhuận chuyến, công nợ | quản lý | P1 |
| M15 | Nội dung (CMS) | Banner, trang chính sách, bài viết | content_editor | P2 |
| M16 | Quản trị hệ thống | Người dùng nội bộ, vai trò, cấu hình, nhật ký thao tác, sao lưu | super_admin | P0 |

---

## 5. Mô hình dữ liệu nghiệp vụ

### 5.1 Thực thể và thuộc tính chính

Tên cột ở dạng `snake_case` (DB); JSON API dùng `camelCase`. Chi tiết DDL ở `04-TECH-ADMIN-AI.md`.

| Thực thể | Thuộc tính nghiệp vụ chính |
|---|---|
| **User** | `id`, `full_name`, `email` (duy nhất), `phone`, `role`, `email_verified_at`, `status` (`active`/`locked`), `marketing_consent`, `created_at` |
| **Destination** | `id`, `name`, `slug`, `region` (`north`/`central`/`south`), `province`, `description`, `image`, `lat`, `lng`, `active` |
| **Category** | `id`, `name`, `slug`, `description`, `active` |
| **Tour** | `id`, `code`, `name`, `slug`, `destination_id`, `category_id`, `duration_days`, `duration_nights`, `summary`, `description`, `highlights[]`, `inclusions[]`, `exclusions[]`, `notes`, `meeting_point_default`, `min_pax`, `max_pax`, `age_infant_max`, `age_child_max`, `requires_id_document`, `requires_passport`, `deposit_percent`, `cancellation_policy_id`, `status` (`draft`/`published`/`hidden`/`archived`), `seo_title`, `seo_description`, `rating_avg`, `rating_count` (tính từ đánh giá thật) |
| **TourDay** (lịch trình) | `tour_id`, `day_no`, `title`, `content`, `meals` (`breakfast`/`lunch`/`dinner`), `accommodation`, `places[]` |
| **TourImage** | `tour_id`, `url`, `alt`, `position`, `is_cover` |
| **Departure** | `id`, `tour_id`, `departure_date`, `return_date`, `capacity`, `seats_taken`, `min_pax_to_run`, `price_adult`, `price_child`, `price_infant`, `single_supplement`, `booking_cutoff_at`, `balance_due_date`, `go_nogo_date`, `meeting_point`, `meeting_time`, `is_guaranteed`, `status`, `cancel_reason`, `version` |
| **Booking** | `id`, `code`, `user_id`, `departure_id`, `contact_name`, `contact_email`, `contact_phone`, `adults`, `children`, `infants`, `singles` (số khách ở phòng đơn), `price_snapshot` (JSON: đơn giá tại thời điểm đặt), `subtotal`, `discount_total`, `coupon_code`, `total_price`, `deposit_required`, `paid_amount`, `refunded_amount`, `balance_due_date`, `status`, `payment_status`, `hold_expires_at`, `channel` (`web`/`counter`/`phone`/`agent`), `created_by_user_id`, `customer_note`, `internal_note`, `cancel_by`, `cancel_reason_code`, `cancelled_at`, `version` |
| **BookingPassenger** | `booking_id`, `full_name`, `gender`, `date_of_birth`, `type` (`adult`/`child`/`infant`), `id_number`, `passport_number`, `nationality`, `special_request`, `is_lead` |
| **Payment** | `id`, `booking_id`, `purpose` (`deposit`/`balance`/`full`), `method`, `provider`, `amount`, `currency` (`VND`), `status`, `provider_txn_id`, `merchant_ref` (duy nhất), `idempotency_key`, `paid_at`, `proof_url`, `confirmed_by`, `raw_payload` |
| **Refund** | `id`, `booking_id`, `payment_id`, `amount`, `type` (`cash_back`/`credit`), `reason_code`, `policy_applied`, `status`, `requested_by`, `approved_by`, `processed_at`, `provider_refund_id` |
| **ChangeRequest** | `id`, `booking_id`, `type` (`cancel`/`change_date`/`change_pax`/`transfer`/`update_passenger`), `payload` (JSON), `fee_quote`, `status`, `decided_by`, `decision_note` |
| **BookingStatusHistory** | `booking_id`, `from_status`, `to_status`, `actor_id`, `actor_type` (`customer`/`staff`/`system`), `note`, `created_at` |
| **Coupon** | `code`, `type` (`percent`/`fixed`), `value`, `max_discount`, `min_order`, `valid_from`, `valid_to`, `usage_limit`, `per_user_limit`, `applies_to` (tour/danh mục/tất cả), `active` |
| **Invoice** | `id`, `booking_id`, `tax_code`, `company_name`, `address`, `email`, `invoice_no`, `issued_at`, `status` (`requested`/`issued`/`cancelled`/`replaced`) |
| **Review** | `id`, `booking_id` (duy nhất), `tour_id`, `user_id`, `rating` 1–5, `comment`, `status`, `reply` |
| **Ticket** / **Inquiry** | `id`, `user_id?`, `subject`, `message`, `booking_id?`, `type` (`support`/`complaint`/`custom_tour`), `status`, `assigned_to`, `sla_due_at` |
| **Guide / Vehicle / Supplier** | Hồ sơ HDV, xe, nhà cung cấp (khách sạn, nhà hàng, vận chuyển) |
| **DepartureAssignment** | `departure_id`, `guide_id`, `vehicle_id`, `note` |
| **DepartureCost** | `departure_id`, `supplier_id?`, `category`, `amount`, `note` (để tính lợi nhuận chuyến) |
| **Notification / OutboxMessage** | `type`, `channel`, `recipient`, `template`, `payload`, `status`, `attempts`, `sent_at` |
| **AuditLog** | `actor_id`, `actor_role`, `action`, `entity`, `entity_id`, `before`, `after`, `ip`, `user_agent`, `created_at` (chỉ thêm, không sửa/xóa) |
| **Setting** | `key`, `value`, `updated_by` (Phụ lục B) |

### 5.2 Quan hệ chính

```
Destination 1─n Tour n─1 Category          Tour 1─n TourDay / TourImage
Tour 1─n Departure 1─n Booking n─1 User
Booking 1─n BookingPassenger / Payment / Refund / ChangeRequest / BookingStatusHistory / Invoice
Booking 1─0..1 Review                       Departure 1─n DepartureAssignment / DepartureCost
Coupon 1─n Booking (qua coupon_code)        User 1─n Ticket
```

**Ràng buộc nghiệp vụ cứng (BR-02):**

- `booking.total_price = subtotal − discount_total` và `subtotal` tính **từ `price_snapshot`**, không từ giá tour hiện hành.
- `booking.paid_amount = Σ payment.succeeded − Σ refund.completed`.
- `departure.seats_taken ≤ departure.capacity` luôn đúng (ràng buộc CHECK + cập nhật nguyên tử, xem tài liệu 04).
- Một `Review` ứng với đúng một `Booking` đã `completed`.
- Không xóa cứng `Booking`, `Payment`, `Refund`, `AuditLog`. Chỉ đổi trạng thái hoặc ẩn danh theo chính sách lưu trữ.

---

## 6. Vòng đời và máy trạng thái

Chuyển trạng thái **chỉ do máy chủ thực hiện**, trong một giao dịch CSDL, và luôn ghi `BookingStatusHistory`/`AuditLog`. Chuyển không có trong bảng ⇒ lỗi `INVALID_STATE_TRANSITION` (HTTP 409).

### 6.1 Lịch khởi hành (`departure.status`)

| Từ | Đến | Ai/khi nào | Hệ quả |
|---|---|---|---|
| — | `draft` | operator tạo | Chưa hiển thị cho khách |
| `draft` | `open` | operator/tour_manager mở bán (cần đủ giá, sức chứa, điểm đón) | Hiển thị và nhận đơn |
| `open` | `full` | Hệ thống khi `seats_taken = capacity` | Ẩn nút đặt, hiện “Hết chỗ”, cho phép danh sách chờ (nếu bật) |
| `full` | `open` | Hệ thống khi có chỗ trống lại (hủy/hết hạn giữ chỗ) | Gửi thông báo cho danh sách chờ |
| `open`/`full` | `closed` | Hệ thống tới `booking_cutoff_at` hoặc operator đóng thủ công | Không nhận đơn mới; đơn đang chờ thanh toán vẫn xử lý |
| `open`/`full`/`closed` | `cancelled` | operator/tour_manager, **bắt buộc lý do** | Kích hoạt LN-09 (công ty hủy) cho mọi đơn |
| `closed` | `departed` | Hệ thống vào ngày khởi hành | Khóa chỉnh sửa khách/giá |
| `departed` | `completed` | Hệ thống sau `return_date` | Chuyển các đơn `confirmed` sang `completed`, mở đánh giá |

`is_guaranteed` đặt `true` khi `seats_taken ≥ min_pax_to_run` (hoặc operator chốt thủ công). Chuyến đã đảm bảo khởi hành chỉ được hủy với lý do bất khả kháng hoặc do phê duyệt của `super_admin`.

### 6.2 Đơn đặt (`booking.status`)

| Từ | Đến | Ai/khi nào | Điều kiện và hệ quả |
|---|---|---|---|
| — | `pending` | customer/sales tạo đơn | Giữ chỗ: `seats_taken += n`; đặt `hold_expires_at`; sinh `code` |
| `pending` | `confirmed` | Hệ thống khi `paid_amount ≥ deposit_required`; hoặc sales xác nhận thủ công (đơn công nợ/đại lý) | Giữ chỗ chắc chắn; gửi voucher/xác nhận; xóa `hold_expires_at` |
| `pending` | `expired` | Hệ thống khi quá `hold_expires_at` mà chưa đủ cọc | Trả chỗ: `seats_taken −= n`; thông báo khách |
| `pending` | `cancelled` | customer hoặc staff | Trả chỗ; không phát sinh phí (chưa thu tiền) hoặc hoàn khoản đã thu theo BR-30 |
| `confirmed` | `cancelled` | customer (theo chính sách), staff, hoặc hệ thống (không thanh toán đủ trước hạn; công ty hủy chuyến) | Trả chỗ; tính phí hủy (BR-28…BR-31); tạo `Refund` nếu có tiền hoàn |
| `confirmed` | `completed` | Hệ thống khi chuyến `completed` | Mở đánh giá; chốt doanh thu |
| `expired` | `pending` | sales “mở lại” trong 24 giờ nếu còn chỗ | Giữ chỗ lại; ghi lý do |

Các trạng thái cuối: `completed`, `cancelled`, `expired` (riêng `expired → pending` là ngoại lệ có kiểm soát).

`cancel_by` ∈ {`customer`, `staff`, `company`, `system`}; `cancel_reason_code` ∈ {`customer_request`, `unpaid`, `no_show`, `min_pax_not_met`, `force_majeure`, `operational`, `duplicate`, `fraud`, `other`}.

### 6.3 Thanh toán của đơn (`booking.payment_status`) — suy ra từ số tiền

| Giá trị | Điều kiện |
|---|---|
| `unpaid` | `paid_amount = 0` |
| `deposit_paid` | `0 < paid_amount < total_price` |
| `paid` | `paid_amount ≥ total_price` |
| `partially_refunded` | `refunded_amount > 0` và `refunded_amount < Σ đã thu` |
| `refunded` | `refunded_amount = Σ đã thu` và `Σ đã thu > 0` |

Trường này **tính lại mỗi khi có thay đổi tiền** (không cho sửa tay). Chênh lệch `paid_amount > total_price` (trả dư) tạo cảnh báo `overpaid` cho kế toán.

### 6.4 Giao dịch thanh toán (`payment.status`)

`initiated → pending → succeeded` · `pending → failed | expired | cancelled`.
Giao dịch `succeeded` **không bao giờ bị sửa hay xóa**. Sai sót xử lý bằng hoàn tiền/điều chỉnh có ghi chú.

### 6.5 Hoàn tiền (`refund.status`)

`requested → approved → processing → completed` · `requested → rejected` · `processing → failed → processing (thử lại)`.
Người tạo yêu cầu **khác** người duyệt (tách nhiệm vụ). Khoản lớn hơn ngưỡng `refund.dual_approval_threshold` cần hai người duyệt.

### 6.6 Yêu cầu thay đổi (`change_request.status`)

`submitted → approved → completed` · `submitted → rejected` · `submitted → withdrawn` (khách rút). Yêu cầu hủy trong thời gian được phép tự phục vụ có thể **tự duyệt** (BR-32).

### 6.7 Các vòng đời phụ

| Đối tượng | Trạng thái |
|---|---|
| Tour | `draft → published ⇄ hidden → archived` (không xuất bản nếu thiếu: ảnh bìa, ít nhất 1 ngày lịch trình, chính sách hủy, ít nhất 1 lịch khởi hành mở) |
| Đánh giá | `pending → approved | rejected`, `approved → hidden` |
| Hóa đơn | `requested → issued → cancelled | replaced` |
| Ticket | `open → in_progress → waiting_customer → resolved → closed` (`resolved` tự `closed` sau 7 ngày không phản hồi) |
| Tài khoản | `active ⇄ locked`; `pending_verification` cho tới khi xác minh email |

---

## 7. Các luồng nghiệp vụ

Mỗi luồng gồm: mục tiêu, tác nhân, tiền điều kiện, **luồng chính**, **luồng thay thế/ngoại lệ**, hậu điều kiện, quy tắc và thông báo liên quan.

### LN-01 Thiết lập danh mục nền và tạo sản phẩm tour (M01, M02)

- **Tác nhân:** tour_manager (chính), content_editor (ảnh/SEO).
- **Tiền điều kiện:** đã có điểm đến, danh mục, chính sách hủy.
1. Tạo/duy trì **điểm đến** và **danh mục**. Tên không trùng (không phân biệt hoa thường). Đổi tên cập nhật mọi tour liên quan. Không xóa nếu còn tham chiếu, chỉ `active=false`.
2. Tạo **tour ở trạng thái `draft`**. Nhập: tên (≥ 6 ký tự), điểm đến, danh mục, thời lượng (ngày/đêm), mô tả, điểm nổi bật.
3. Nhập **lịch trình theo ngày** (`TourDay`): tiêu đề, nội dung, bữa ăn, nơi nghỉ, danh sách địa điểm (dùng cho bản đồ).
4. Nhập **bao gồm / không bao gồm**, lưu ý, điều kiện trẻ em (`age_infant_max`, `age_child_max`), yêu cầu giấy tờ (`requires_id_document`, `requires_passport`), `min_pax`, `max_pax`, `deposit_percent`, gán **chính sách hủy**.
5. Tải **ảnh** (bìa + thư viện, có `alt`). Hệ thống kiểm tra loại/kích thước, tạo ảnh thu nhỏ.
6. Xem trước giao diện khách. **Xuất bản** (`published`): hệ thống kiểm tra điều kiện ở 6.7; thiếu thì liệt kê từng mục thiếu.
7. Ghi `AuditLog` mọi lần sửa; lưu `version` để phát hiện hai người sửa cùng lúc.
- **Ngoại lệ:** sửa tour đã có đơn → chỉ cảnh báo (không thay đổi đơn cũ vì có `price_snapshot`). Thay đổi **nội dung ảnh hưởng quyền lợi** (lịch trình, bao gồm) khi đã có đơn `confirmed` → hệ thống đề xuất gửi thông báo thay đổi (LN-10, mục “công ty thay đổi”).
- **Ẩn thay vì xóa:** tour đã có đơn chỉ được `hidden`/`archived` (BR-03).
- **Hậu điều kiện:** tour `published` xuất hiện công khai nếu có ít nhất một lịch khởi hành `open`.

### LN-02 Mở lịch khởi hành và định giá (M03)

- **Tác nhân:** operator, tour_manager. **Tiền điều kiện:** tour `published` hoặc `draft` có đủ nội dung.
1. Tạo lịch: chọn tour, **ngày đi**, tự tính `return_date` theo thời lượng; hỗ trợ **tạo hàng loạt** (mỗi thứ Sáu hàng tuần trong 3 tháng).
2. Nhập `capacity`, `min_pax_to_run`, giá `adult`/`child`/`infant`, `single_supplement`, điểm đón + giờ đón.
3. Hệ thống **gợi ý/tính** `booking_cutoff_at`, `balance_due_date`, `go_nogo_date` từ cấu hình (Phụ lục B); operator có thể chỉnh.
4. Kiểm tra: ngày đi > hiện tại + `departure.min_lead_days`; giá > 0 và ≤ trần; `capacity ≥ min_pax_to_run`; không trùng (tour + ngày + giờ đón).
5. Chuyển `open`. Hệ thống tự tính `seats_taken` bằng 0.
- **Thay đổi sau khi mở bán:**
  - Tăng sức chứa: luôn được.
  - **Giảm** sức chứa: không được xuống dưới `seats_taken`.
  - **Đổi giá:** chỉ áp cho đơn **mới**; đơn cũ giữ `price_snapshot`.
  - **Đổi ngày:** coi là “công ty đổi lịch”, bắt buộc theo LN-10 (khách được chọn đổi hoặc hoàn tiền 100%).
- **Đóng bán sớm / hủy chuyến:** theo 6.1; hủy cần lý do và kích hoạt LN-09.

### LN-03 Khách khám phá và tìm tour (M04)

- **Tác nhân:** guest, customer.
1. Vào trang chủ/danh sách; **tìm kiếm** theo từ khóa (tên, điểm đến, vùng); **lọc** theo danh mục, vùng, **khoảng ngày khởi hành**, số khách, thời lượng, khoảng giá; **sắp xếp** theo nổi bật/giá/ngày gần nhất/đánh giá.
2. Danh sách chỉ hiện tour `published` có **ít nhất một lịch `open` còn chỗ** trong tương lai; hiển thị **giá từ** (giá người lớn thấp nhất trong các lịch), ngày gần nhất, số chỗ còn nếu ≤ 5 (“Chỉ còn 3 chỗ”).
3. Trang chi tiết: ảnh, mô tả, lịch trình theo ngày có bản đồ từng địa điểm, bao gồm/không bao gồm, chính sách hủy tóm tắt, đánh giá thật, **bộ chọn lịch khởi hành** (lịch tháng; ngày hết chỗ/đã đóng bị vô hiệu kèm lý do).
4. Chọn ngày + số người lớn/trẻ em/em bé → hệ thống hiển thị **tổng tạm tính** (gọi báo giá, BR-14).
5. “Đặt ngay” → LN-04. Chưa đăng nhập thì chuyển đăng nhập rồi quay lại với lựa chọn được giữ.
- **Ngoại lệ:** tour không tồn tại/ẩn → trang 404 có gợi ý tour khác; tour không còn lịch mở → hiển thị “Liên hệ tư vấn” và nút **đăng ký nhận thông báo** (P2) hoặc gửi yêu cầu (LN-13).
- **SEO:** mỗi tour/điểm đến có URL `slug` ổn định, thẻ meta, dữ liệu có cấu trúc.

### LN-04 Đặt tour trực tuyến (M06) — luồng trung tâm

- **Tác nhân:** customer. **Tiền điều kiện:** đã đăng nhập và **email đã xác minh** (BR-06); lịch `open`.

| Bước | Hành động của khách | Hành động của hệ thống |
|---|---|---|
| 1 | Chọn lịch + số khách (từ trang chi tiết) | Báo giá lần 1 (không giữ chỗ) |
| 2 | Nhập **người liên hệ** (điền sẵn từ tài khoản) và **danh sách hành khách** (họ tên, giới tính, ngày sinh; giấy tờ nếu tour yêu cầu; yêu cầu đặc biệt) | Kiểm tra: số hành khách khớp số đã chọn; **loại khách tính theo ngày sinh tại ngày khởi hành** (BR-10); nếu loại khách đổi so với lựa chọn ban đầu thì tính lại giá và báo cho khách |
| 3 | Xem lại: tổng chi tiết, **mã giảm giá** (tùy chọn), chọn **mức thanh toán** (đặt cọc hoặc trả toàn bộ — nếu chuyến còn ≤ `payment.full_required_days` ngày thì chỉ trả toàn bộ), tick **đồng ý điều khoản + chính sách hủy** | Báo giá lần 2 có áp mã; hiển thị hạn thanh toán và phí hủy theo mốc |
| 4 | Bấm “Xác nhận đặt chỗ” (gửi kèm `Idempotency-Key`) | **Trong một giao dịch:** kiểm tra lịch còn `open`; trừ chỗ nguyên tử (BR-08); tạo `Booking(pending)` + hành khách + snapshot giá; ghi lịch sử; đặt `hold_expires_at` (BR-09); trả mã đơn |
| 5 | Chọn phương thức thanh toán → LN-05 | Tạo `Payment(initiated)` và chuyển hướng/hiển thị mã QR |
| 6 | Thanh toán xong, quay lại trang kết quả | Chờ webhook → xác nhận đơn → trang “Đặt tour thành công” + email |

- **Ngoại lệ:**
  - **Hết chỗ giữa chừng** (người khác đặt trước): bước 4 trả `SEAT_UNAVAILABLE` kèm số chỗ còn lại; khách giữ nguyên dữ liệu đã nhập để đổi số lượng/ngày khác. **Không** tạo đơn.
  - **Lịch bị đóng** (`DEPARTURE_CLOSED`): đề xuất lịch gần nhất.
  - **Mã giảm giá sai:** báo lý do cụ thể (hết hạn, hết lượt, chưa đủ giá trị tối thiểu, không áp dụng tour này); không chặn đặt chỗ.
  - **Gửi lặp/đúp nhấp:** cùng `Idempotency-Key` trả lại **chính đơn đã tạo**, không tạo đơn thứ hai.
  - **Mất mạng sau bước 4:** khách mở “Đơn của tôi” vẫn thấy đơn `pending` còn hạn giữ chỗ để thanh toán tiếp.
  - **Đơn trùng:** cùng khách + cùng lịch + còn `pending` → hỏi khách “tiếp tục đơn cũ?” trước khi tạo mới (giảm giữ chỗ thừa).
  - **Hết hạn giữ chỗ** khi đang ở trang thanh toán → LN-05 mục “thanh toán muộn”.
- **Hậu điều kiện:** có `Booking`, chỗ bị trừ, thông báo “đã nhận đơn, chờ thanh toán”.

### LN-05 Thanh toán (M07)

- **Tác nhân:** customer, accountant, hệ thống.

**A. Cổng thanh toán trực tuyến (VNPay, MoMo, ZaloPay hoặc cổng tương đương)**
1. Khách chọn phương thức; hệ thống tạo `Payment(initiated)` với `merchant_ref` duy nhất và số tiền do **máy chủ** quyết định (cọc hoặc toàn bộ hoặc số còn lại).
2. Chuyển khách sang cổng (hoặc hiển thị QR/deeplink); `Payment → pending`.
3. Cổng gọi **webhook (IPN)** về máy chủ: xác thực **chữ ký**, tìm `merchant_ref`, **đối chiếu số tiền** với `Payment.amount`.
4. Hợp lệ → `Payment → succeeded` (idempotent: gọi lại không cộng tiền lần hai), cập nhật `paid_amount`, tính lại `payment_status`; nếu `paid_amount ≥ deposit_required` và đơn `pending` → `confirmed` (LN-07).
5. Trang kết quả của khách **chỉ đọc trạng thái từ máy chủ** (không tin tham số trên URL trả về từ cổng).

**B. Chuyển khoản ngân hàng (VietQR)**
1. Hệ thống hiển thị thông tin tài khoản, **số tiền**, **nội dung chuyển khoản = mã đơn** và mã QR.
2. Khách chuyển khoản; có thể tải **ảnh chứng từ** (`proof_url`) → `Payment(pending)`.
3. Kế toán đối chiếu sao kê → bấm **xác nhận** (ghi `confirmed_by`, `paid_at` theo sao kê) hoặc **từ chối** kèm lý do. Nếu có tích hợp đối soát tự động qua ngân hàng (P2), hệ thống tự khớp theo nội dung + số tiền.

**C. Tiền mặt/POS tại quầy:** sales/accountant ghi nhận thanh toán, in phiếu thu; có giới hạn quyền (BR-18).

**D. Thanh toán phần còn lại:** trước `balance_due_date` hệ thống nhắc (T−7, T−3, T−1 so với hạn). Khách vào “Đơn của tôi” → “Thanh toán phần còn lại”.

- **Ngoại lệ:**
  - **Thanh toán thất bại/hủy:** `Payment → failed/cancelled`, đơn vẫn `pending` đến hết hạn giữ chỗ; khách có thể thử phương thức khác.
  - **Thanh toán muộn** (tiền về khi đơn đã `expired`): hệ thống kiểm tra còn chỗ → nếu còn, **tự mở lại** đơn `pending → confirmed`; nếu hết chỗ, tạo **cảnh báo cho kế toán** và khoản hoàn tiền 100% (khách chọn hoàn hoặc đổi lịch). Không để tiền “mồ côi”.
  - **Webhook trùng/đến trễ/sai thứ tự:** xử lý idempotent theo `merchant_ref` + `provider_txn_id`.
  - **Sai số tiền** (thiếu/thừa): `PAYMENT_AMOUNT_MISMATCH` → ghi nhận ở trạng thái “cần xử lý”, không tự xác nhận; kế toán xử lý (yêu cầu bù hoặc hoàn phần dư).
  - **Cổng không phản hồi:** tác vụ nền **truy vấn lại trạng thái** các giao dịch `pending` quá 15 phút.
  - **Không thanh toán đủ trước `balance_due_date`:** nhắc lần cuối, sau đó **tự hủy** (`cancel_reason_code=unpaid`) theo BR-27 và áp phí hủy theo chính sách.
  - **Tranh chấp/chargeback:** kế toán gắn cờ, tạm khóa hoàn tiền thêm, lưu bằng chứng.
- **Hậu điều kiện:** mọi khoản tiền có `Payment` tương ứng; tổng khớp `paid_amount`.

### LN-06 Đặt tour tại quầy/điện thoại và yêu cầu tư vấn (M06, M13)

- **Tác nhân:** sales.
1. Tiếp nhận khách (gọi/đến quầy/Zalo). Tìm khách theo SĐT/email; chưa có thì **tạo hồ sơ khách** (gửi email mời kích hoạt tài khoản).
2. Chọn lịch, số khách, nhập hành khách như LN-04.
3. Nhân viên có thể **đặt `channel` = `counter`/`phone`/`agent`**, áp giá/giảm giá thủ công **trong hạn mức quyền** (BR-17; vượt hạn mức cần quản lý duyệt, ghi lý do).
4. Chọn: thu tiền ngay (LN-05 C) hoặc **giữ chỗ có thời hạn** (mặc định `hold.hours_offline`), hoặc **công nợ** (đại lý/doanh nghiệp có hợp đồng; cần `credit_terms`).
5. Hệ thống gửi email xác nhận/đường dẫn thanh toán cho khách.
- **Ngoại lệ:** khách quen yêu cầu giữ chỗ lâu hơn mặc định → gia hạn `hold_expires_at` tối đa `hold.max_extend_hours`, có ghi lý do, mỗi đơn tối đa 1 lần (BR-09).

### LN-07 Xác nhận đơn, voucher, hợp đồng và hóa đơn (M11)

1. Khi đơn chuyển `confirmed` (do cọc hoặc sales xác nhận): sinh **voucher/xác nhận dịch vụ** (PDF) gồm mã đơn, tour, ngày giờ và điểm đón, danh sách hành khách, tổng tiền, đã trả/còn lại, hạn thanh toán, chính sách hủy, hotline 24/7.
2. Gửi email + hiển thị tải về trong “Đơn của tôi”.
3. **Hợp đồng lữ hành/điều khoản:** lưu phiên bản điều khoản khách đã đồng ý (`terms_version`, thời điểm, IP). Với đoàn/doanh nghiệp, sinh hợp đồng theo mẫu để ký.
4. **Hóa đơn:** khách bấm “Yêu cầu xuất hóa đơn” và nhập mã số thuế, tên công ty, địa chỉ, email (kiểm tra mã số thuế đúng định dạng 10 hoặc 13 số). Kế toán xuất hóa đơn điện tử qua nhà cung cấp và lưu `invoice_no`. Hạn gửi yêu cầu: `invoice.request_deadline_days` ngày sau khi chuyến kết thúc.
- **Ngoại lệ:** hủy đơn đã xuất hóa đơn → kế toán lập hóa đơn điều chỉnh/thay thế/hủy theo quy định hiện hành; hệ thống không cho xóa hóa đơn.

### LN-08 Khách quản lý đơn của mình (M06)

1. “Đơn của tôi”: danh sách (có phân trang, lọc theo trạng thái), chi tiết đơn có **dòng thời gian** (đặt → thanh toán → xác nhận → …), số tiền đã trả/còn lại và **hạn**, nút hành động phù hợp trạng thái.
2. **Sửa thông tin hành khách** (đính chính họ tên, giấy tờ, yêu cầu đặc biệt) tự phục vụ đến `passenger.edit_cutoff_days` ngày trước khởi hành; sau mốc đó gửi yêu cầu cho sales. **Không sửa** ngày sinh làm đổi loại khách/giá (phải qua ChangeRequest `change_pax`).
3. Thanh toán/thanh toán phần còn lại, tải voucher, yêu cầu hóa đơn.
4. **Yêu cầu hủy / đổi ngày / đổi số khách / chuyển nhượng** → LN-09, LN-10.
5. Sau chuyến: **đánh giá** (LN-12).

### LN-09 Hủy đơn và hoàn tiền (M08)

**A. Khách hủy (tự phục vụ hoặc qua sales)**
1. Khách bấm “Hủy đơn” → hệ thống hiển thị **báo giá hủy** (`cancellation-quote`): phần trăm phí theo **số ngày còn lại tới ngày khởi hành** (BR-28), số tiền đã trả, **số tiền hoàn dự kiến** và thời gian hoàn.
2. Khách nhập lý do (bắt buộc chọn) và xác nhận (xác nhận hai bước).
3. Đơn `pending` chưa thu tiền: hủy ngay, trả chỗ. Đơn `confirmed`: tạo `ChangeRequest(cancel)`; nếu nằm trong cửa sổ tự duyệt (BR-32) → tự `approved`, ngược lại chờ sales.
4. Hệ thống: đơn `cancelled`, **trả chỗ** (`seats_taken −= n`), tạo `Refund(requested)` nếu số hoàn > 0.
5. Kế toán duyệt → xử lý hoàn về **đúng phương thức đã thanh toán** (BR-30) → `Refund(completed)`; thông báo khách kèm ngày dự kiến tiền về.

**B. Công ty hủy chuyến** (thiếu khách, thiên tai, sự cố vận hành): theo LN-11 bước chốt đoàn.
- Hủy lịch → mọi đơn `confirmed` được đề xuất: **(1) chuyển sang lịch khác không mất phí** (nếu khách chọn, giữ giá cũ hoặc chênh lệch theo BR-34), **(2) hoàn 100%**, **(3) bảo lưu** `credit` hiệu lực `credit.valid_months` tháng.
- Thông báo **chủ động và sớm nhất có thể**; thời hạn tối thiểu `cancel.company_notice_days` ngày trước ngày đi (trừ bất khả kháng).
- Không áp phí hủy cho khách trong trường hợp này (BR-29).

**C. Bất khả kháng** (thiên tai, dịch bệnh, quyết định cơ quan nhà nước): xử lý theo chính sách riêng đã đăng công khai; mặc định hoàn 100% hoặc bảo lưu; chi phí bên thứ ba đã chi không hoàn lại ghi rõ.

**D. No-show:** operator ghi nhận ở bước điểm đón → `cancel_reason_code=no_show`, phí 100%, không hoàn.

- **Ngoại lệ:** hoàn tiền thất bại (tài khoản/thẻ không còn) → `Refund=failed`, kế toán liên hệ khách xin tài khoản ngân hàng mới, hoàn bằng chuyển khoản. Hoàn tiền **không vượt** số đã thu (`REFUND_EXCEEDS_PAID`).

### LN-10 Đổi ngày, đổi số khách, chuyển nhượng, công ty đổi thay đổi (M08)

| Loại | Điều kiện | Cách tính | Quy trình |
|---|---|---|---|
| **Đổi ngày (sang lịch khác cùng tour)** | Còn chỗ, trước mốc `change.allowed_until_days` ngày | Phí đổi theo bảng BR-33 + chênh lệch giá theo giá lịch mới | Khách tạo ChangeRequest → hệ thống kiểm tra chỗ lịch mới → báo giá chênh lệch → duyệt → **chuyển chỗ nguyên tử** (trả lịch cũ, trừ lịch mới) → thanh toán/hoàn phần chênh |
| **Tăng số khách** | Còn chỗ | Tính thêm theo giá hiện hành của lịch | Như đổi ngày; hành khách mới bổ sung thông tin |
| **Giảm số khách** | Theo chính sách hủy từng phần | Phí hủy áp cho phần giảm | Duyệt bởi sales; hoàn phần dư |
| **Chuyển nhượng người đi** | Trước mốc `transfer.allowed_until_days`, tour không có vé định danh | Phí xử lý cố định | Thay thông tin hành khách; ghi lịch sử |
| **Công ty đổi** (giờ đón, xe, khách sạn tương đương, lịch trình nhỏ) | Không làm giảm quyền lợi | Không phí | Thông báo + ghi nhận |
| **Công ty đổi lớn** (đổi ngày, đổi điểm đến, hạ hạng dịch vụ) | Làm thay đổi quyền lợi | — | Khách được **chọn chấp nhận hoặc hủy hoàn 100%** trong `change.company_response_days` ngày |

Đơn có thay đổi luôn giữ **lịch sử** (`BookingStatusHistory` + `ChangeRequest`) và tính lại `total_price` có ghi bút toán điều chỉnh, **không sửa đè** snapshot cũ.

### LN-11 Điều hành chuyến đi (M10)

- **Tác nhân:** operator, guide, sales.
1. **Theo dõi chuyến** trên lịch/bảng: số khách, tỷ lệ lấp đầy, số tiền đã thu/còn thiếu, cảnh báo (sắp tới `go_nogo_date`, thiếu khách, còn đơn chưa thanh toán đủ).
2. **Chốt đoàn** tại `go_nogo_date`:
   - `seats_taken ≥ min_pax_to_run` → `is_guaranteed=true`, gửi xác nhận “chuyến đảm bảo khởi hành”.
   - Thiếu khách → operator chọn: **(a) vẫn chạy** (công ty chấp nhận lỗ), **(b) ghép chuyến** với lịch khác cùng tour/ngày gần (cần khách đồng ý), **(c) hủy** theo LN-09B. Quyết định bắt buộc ghi lý do.
3. **Gán nguồn lực:** HDV (kiểm tra trùng lịch), xe (đủ chỗ, không trùng), nhà cung cấp (khách sạn, nhà hàng) và **ghi chi phí** (`DepartureCost`).
4. **Thanh toán đủ:** đến `balance_due_date` đơn chưa đủ tiền chuyển vào hàng đợi “chưa thanh toán đủ” → nhắc → hủy tự động (LN-05).
5. **Xuất manifest** (PDF/Excel, kiểm soát quyền; có dấu thời gian và người xuất): họ tên, tuổi, giới tính, giấy tờ, SĐT liên hệ, yêu cầu ăn uống/y tế, phân phòng, điểm đón. Gửi cho HDV/nhà xe/khách sạn.
6. **Trước chuyến (T−3, T−1):** hệ thống gửi khách thông tin tập trung (giờ, điểm đón, hotline, thời tiết, đồ cần mang, liên hệ HDV).
7. **Ngày khởi hành:** HDV (hoặc operator) **điểm danh/check-in** từng khách; đánh dấu no-show; ghi **sự cố** (hư xe, ốm, thời tiết, tai nạn) kèm mức độ.
8. Chuyến `departed → completed` sau ngày về.
- **Ngoại lệ:** sự cố nghiêm trọng → quy trình khẩn: thông báo quản lý, liên hệ khách/gia đình, lưu biên bản, kích hoạt bảo hiểm (nếu có).

### LN-12 Kết thúc chuyến, quyết toán và đánh giá (M10, M13, M14)

1. Hệ thống đóng chuyến, chuyển các đơn `confirmed → completed`, mở quyền đánh giá cho khách đã đi.
2. Gửi email “Cảm ơn và đánh giá chuyến đi” sau 1 ngày; nhắc lại 1 lần sau 7 ngày.
3. Khách chấm 1–5 sao + nhận xét (mỗi đơn một đánh giá). Đánh giá vào `pending`; content_editor/sales duyệt theo quy tắc (loại bỏ spam, thông tin cá nhân, lời lẽ vi phạm; **không xóa đánh giá tiêu cực chính đáng**, BR-40). Công ty có thể **phản hồi công khai**.
4. `rating_avg`/`rating_count` của tour **tính lại từ đánh giá đã duyệt** (không nhập tay).
5. **Quyết toán chuyến:** operator nhập đủ chi phí; kế toán chốt doanh thu − chi phí = **lợi nhuận chuyến**; chuyến chuyển `settled`.

### LN-13 Chăm sóc khách hàng, khiếu nại và tour theo yêu cầu (M13)

1. **Liên hệ/tư vấn:** biểu mẫu công khai (họ tên, SĐT/email, tour quan tâm, nội dung) → tạo `Inquiry`, gửi xác nhận tự động, gán cho sales.
2. **Tour theo yêu cầu:** thu thập số người, ngày dự kiến, ngân sách, điểm đến → sales báo giá → nếu đồng ý tạo **lịch khởi hành riêng** (đoàn riêng) và đơn.
3. **Ticket hỗ trợ/khiếu nại** gắn với đơn: có **SLA** (phản hồi đầu tiên ≤ `ticket.first_response_hours` giờ làm việc; khiếu nại nghiêm trọng ≤ 4 giờ), leo thang lên quản lý khi quá hạn; mọi trao đổi lưu theo luồng.
4. Khiếu nại dẫn đến **bồi hoàn/giảm giá** → tạo `Refund` loại `goodwill` (cần duyệt theo hạn mức).

### LN-14 Khuyến mãi và mã giảm giá (M12)

1. content_editor tạo mã: loại (`percent`/`fixed`), giá trị, **mức giảm tối đa**, đơn tối thiểu, thời hạn, **tổng lượt dùng**, lượt dùng/khách, phạm vi (tất cả/danh mục/tour/lịch), có áp cho khách mới không.
2. Khi báo giá, hệ thống kiểm tra từng điều kiện và trả **lý do cụ thể** nếu không hợp lệ.
3. **Một đơn một mã** (BR-15); không giảm xuống dưới `price.min_total_after_discount`; giảm chỉ áp lên tiền tour (không áp lên phí dịch vụ riêng, nếu có).
4. **Giữ lượt dùng** khi tạo đơn; **trả lượt** khi đơn `expired/cancelled` chưa thu tiền. Đơn đã thu tiền rồi hủy: mã **không** được trả lượt (tránh lạm dụng), trừ khi công ty hủy.
5. Báo cáo hiệu quả mã: số lượt, doanh thu, tổng giảm, tỷ lệ chuyển đổi.

### LN-15 Tài khoản và xác thực (M05)

1. **Đăng ký:** họ tên, email, SĐT (tùy chọn), mật khẩu (≥ 8 ký tự, kiểm tra mật khẩu quá phổ biến), đồng ý điều khoản; **gửi email xác minh** (liên kết dùng một lần, hết hạn 24 giờ). Vai trò luôn `customer`.
2. **Đăng nhập:** email + mật khẩu; sai quá `auth.max_failed_attempts` lần → khóa tạm `auth.lock_minutes` phút (không tiết lộ email có tồn tại hay không). Nhân viên bắt buộc **xác thực hai yếu tố** (TOTP) cho `super_admin`, `accountant` (P1 cho các vai trò khác).
3. **Quên mật khẩu:** nhập email → luôn trả thông báo trung tính → gửi liên kết đặt lại (hết hạn 30 phút, dùng một lần); sau khi đổi, **thu hồi mọi phiên đang đăng nhập** và gửi thông báo bảo mật.
4. **Hồ sơ:** đổi họ tên, SĐT; **đổi email** cần xác minh email mới; đổi mật khẩu (yêu cầu mật khẩu hiện tại); danh sách thiết bị/phiên và **đăng xuất tất cả**; danh sách hành khách đã lưu (P2).
5. **Xóa tài khoản/quyền riêng tư:** khách yêu cầu → hệ thống **ẩn danh hóa** dữ liệu cá nhân nhưng giữ bản ghi tài chính theo thời hạn lưu trữ bắt buộc (BR-44); không xóa nếu còn đơn `pending/confirmed`.
6. **Khóa tài khoản** (gian lận, lạm dụng) bởi super_admin kèm lý do; ghi nhật ký.

### LN-16 Báo cáo và đối soát tài chính (M14, M07)

1. **Đối soát hằng ngày:** so khớp `Payment.succeeded` với báo cáo giao dịch của cổng/sao kê ngân hàng; liệt kê **chênh lệch** (có ở hệ thống nhưng không có ở cổng và ngược lại); kế toán xử lý và ghi chú.
2. **Công nợ phải thu:** danh sách đơn `confirmed` còn thiếu tiền, phân nhóm theo thời hạn (trong hạn, quá hạn 1–3, 4–7, > 7 ngày).
3. **Doanh thu** hai góc nhìn: **đã thu** (theo ngày thanh toán) và **ghi nhận** (theo ngày chuyến hoàn thành). Báo rõ khác biệt khi xuất báo cáo.
4. **Báo cáo vận hành:** lấp đầy, hủy, no-show, thời gian xử lý, hiệu quả kênh bán, mã giảm giá, top tour/điểm đến.
5. Xuất CSV/Excel có ghi nhật ký người xuất; dữ liệu cá nhân chỉ khi có quyền `export:pii`.

### LN-17 Quản trị người dùng nội bộ, phân quyền và nhật ký (M16)

1. super_admin **mời** nhân viên qua email (liên kết kích hoạt, buộc đặt mật khẩu mạnh + bật 2FA nếu vai trò yêu cầu).
2. Gán **một hoặc nhiều vai trò**; quyền chi tiết theo bảng 3.2 (có thể tùy chỉnh trong `04-TECH-ADMIN-AI.md`).
3. **Nguyên tắc ít quyền nhất:** thay đổi vai trò, khóa/mở tài khoản, đổi cấu hình tài chính đều **ghi AuditLog** (ai, khi nào, trước/sau, IP).
4. Nhân viên nghỉ việc: **khóa ngay** và thu hồi mọi phiên; không xóa để giữ lịch sử thao tác.
5. Xem nhật ký: lọc theo người, đối tượng, hành động, thời gian; không cho sửa/xóa.

### LN-18 Tổng hợp tình huống ngoại lệ

| # | Tình huống | Xử lý bắt buộc |
|---|---|---|
| E1 | Hai khách đặt chỗ cuối cùng cùng lúc | Cập nhật nguyên tử có điều kiện; chỉ một đơn thành công, đơn kia nhận `SEAT_UNAVAILABLE` |
| E2 | Khách bấm “Đặt” hai lần / mạng chập chờn | `Idempotency-Key` → cùng một đơn |
| E3 | Hết hạn giữ chỗ nhưng tiền đã về | Thanh toán muộn (LN-05): mở lại nếu còn chỗ, nếu không hoàn tiền + cảnh báo |
| E4 | Webhook cổng đến hai lần | Idempotent theo `merchant_ref`, không cộng tiền hai lần |
| E5 | Khách chuyển khoản thiếu/thừa tiền | Giao dịch “cần xử lý”; kế toán yêu cầu bù hoặc hoàn phần dư |
| E6 | Chuyến thiếu khách tối thiểu | Chốt đoàn: chạy / ghép / hủy + thông báo trước `cancel.company_notice_days` |
| E7 | Thiên tai/bão, đóng cửa điểm tham quan | Bất khả kháng: đổi lịch/ bảo lưu/ hoàn tiền; thông báo hàng loạt có kiểm soát |
| E8 | Giá tour đổi sau khi khách đặt | Đơn cũ giữ `price_snapshot`; chỉ đơn mới lấy giá mới |
| E9 | Khách sinh nhật làm đổi loại khách (trẻ em → người lớn) giữa lúc đặt và ngày đi | Loại khách tính **theo ngày khởi hành**; báo khách khi nhập |
| E10 | Hai nhân viên sửa cùng một đơn/tour | Khóa lạc quan theo `version`; bên sau nhận `VERSION_CONFLICT` và xem diff |
| E11 | Mã giảm giá bị lạm dụng/hết lượt khi đang thanh toán | Giữ lượt tại bước tạo đơn; kiểm tra lại khi tạo đơn |
| E12 | Khách khiếu nại/chargeback | Gắn cờ, lưu chứng từ, tạm khóa hoàn tiền thêm, quy trình ticket |
| E13 | Khách yêu cầu xóa dữ liệu khi còn đơn hiệu lực | Từ chối có lý do, hẹn xử lý sau khi hoàn tất và hết thời hạn lưu |
| E14 | Cổng thanh toán ngừng hoạt động | Bật phương thức dự phòng (chuyển khoản), tăng thời gian giữ chỗ tạm thời bằng cấu hình |
| E15 | Lệch `seats_taken` so với tổng đơn thực tế | Tác vụ đối soát hằng đêm so khớp và cảnh báo; không tự ý sửa khi chưa xác minh |
| E16 | Nhân viên tạo đơn nhầm | Hủy kèm lý do `duplicate`/`other`; không xóa; nếu chưa thu tiền không phát sinh phí |
| E17 | Khách đặt cho người khác/đoàn lớn (> `booking.max_pax_online`) | Chuyển luồng tư vấn (LN-13) hoặc sales tạo đơn |
| E18 | Hành khách không đủ điều kiện (trẻ em đi một mình, người cao tuổi cần xác nhận sức khỏe) | Quy tắc theo tour (`requires_guardian`); cảnh báo và xác nhận cam kết |

---

## 8. Quy tắc nghiệp vụ (BR)

Các giá trị `in nghiêng đậm` là **tham số cấu hình** (Phụ lục B).

### 8.1 Dữ liệu và quyền

| Mã | Quy tắc |
|---|---|
| BR-01 | Phân quyền kiểm tra ở máy chủ cho mọi yêu cầu, mặc định từ chối; kiểm tra quyền trên **từng đối tượng** (khách chỉ thấy đơn của mình). UI ẩn nút chỉ để thuận tiện |
| BR-02 | Các ràng buộc cứng ở mục 5.2 luôn đúng; vi phạm là lỗi hệ thống cần cảnh báo |
| BR-03 | Không xóa cứng bản ghi có tham chiếu hoặc có giá trị lịch sử (tour có đơn, đơn, thanh toán, hoàn tiền, nhật ký). Dùng `hidden`/`archived`/`active=false`/ẩn danh hóa |
| BR-04 | Tên điểm đến/danh mục không trùng (không phân biệt hoa thường). Đổi tên lan sang tour liên quan; chặn xóa khi còn tham chiếu |
| BR-05 | Lưu thời điểm theo **UTC**; ngày nghiệp vụ (ngày đi, hạn thanh toán, mốc hủy) tính theo múi giờ **Asia/Ho_Chi_Minh**. Tiền là **số nguyên VND**, không dùng số thực |

### 8.2 Tài khoản

| Mã | Quy tắc |
|---|---|
| BR-06 | Đặt tour yêu cầu đăng nhập **và email đã xác minh**. Ngoại lệ: sales tạo đơn hộ khách (khách chưa kích hoạt tài khoản) |
| BR-07 | Mật khẩu tối thiểu 8 ký tự, từ chối mật khẩu phổ biến; lưu bằng thuật toán băm mật khẩu hiện đại (argon2id hoặc bcrypt); khóa tạm sau *`auth.max_failed_attempts`=5* lần sai trong *`auth.lock_minutes`=15* phút |

### 8.3 Tồn chỗ, giữ chỗ và hành khách

| Mã | Quy tắc |
|---|---|
| BR-08 | **Không bán vượt chỗ.** Trừ chỗ bằng một lệnh cập nhật có điều kiện nguyên tử (`seats_taken + n ≤ capacity` và lịch `open`); thất bại ⇒ `SEAT_UNAVAILABLE`. Mọi đường trả chỗ (hủy, hết hạn, chuyển lịch) cũng cập nhật nguyên tử |
| BR-09 | **Giữ chỗ:** *`hold.hours_default`=24* giờ; còn 4–7 ngày tới ngày đi: *`hold.hours_near`=6* giờ; còn ≤ 3 ngày: *`hold.hours_urgent`=2* giờ. Khi khách bắt đầu thanh toán online, đảm bảo còn ít nhất *`hold.min_payment_minutes`=30* phút. Gia hạn thủ công tối đa 1 lần, ≤ *`hold.max_extend_hours`=24* giờ, cần lý do |
| BR-10 | **Loại khách tính theo ngày sinh tại ngày khởi hành:** em bé `< age_infant_max` (mặc định **2 tuổi**), trẻ em `< age_child_max` (mặc định **12 tuổi**), còn lại người lớn. Ngưỡng cấu hình theo tour (nhiều đơn vị dùng mốc khác, ví dụ 5/11 tuổi) |
| BR-11 | Em bé **không chiếm chỗ** (*`seat.infant_takes_seat`=false*) và tối đa 1 em bé cho mỗi người lớn; vượt thì tính như trẻ em |
| BR-12 | Trẻ em và em bé phải đi cùng ít nhất 1 người lớn từ 18 tuổi trong cùng đơn (trừ tour dành riêng cho học sinh có người giám hộ chỉ định) |
| BR-13 | Số khách tối đa mỗi đơn trực tuyến *`booking.max_pax_online`=10*; lớn hơn chuyển tư vấn |
| BR-46 | Chống trùng: cùng khách + cùng lịch + còn đơn `pending` ⇒ hỏi tiếp tục đơn cũ; cùng `Idempotency-Key` ⇒ trả lại đơn đã tạo (khóa giữ ít nhất 24 giờ) |

### 8.4 Giá và khuyến mãi

| Mã | Quy tắc |
|---|---|
| BR-14 | **Công thức:** `subtotal = adults×price_adult + children×price_child + infants×price_infant + singles×single_supplement`; `discount` theo mã (không vượt `max_discount`, không đưa tổng xuống dưới *`price.min_total_after_discount`=0*); `total = subtotal − discount`. Máy chủ là nơi **duy nhất** tính giá; client chỉ hiển thị. Giá đã tính được lưu vào `price_snapshot` và **không đổi** khi giá lịch thay đổi |
| BR-15 | Một đơn áp tối đa **một** mã; mã không cộng dồn với ưu đãi đặt sớm trừ khi mã khai báo cho phép |
| BR-16 | Giá hiển thị là **giá đã gồm thuế** (*`price.tax_included`=true*); thuế suất và cách xuất hóa đơn theo quy định hiện hành, cấu hình ở hệ thống kế toán |
| BR-17 | Nhân viên giảm giá thủ công trong hạn mức theo vai trò (*`discount.sales_max_percent`=5*); vượt hạn mức cần `tour_manager`/`super_admin` duyệt; mọi giảm giá thủ công bắt buộc có lý do và vào nhật ký |
| BR-18 | Thu tiền mặt/POS chỉ do `accountant` hoặc `sales` được cấp quyền; mỗi lần thu in/gửi biên lai; chênh lệch kết ca được báo cáo |

### 8.5 Thanh toán

| Mã | Quy tắc |
|---|---|
| BR-19 | Số tiền của mỗi giao dịch do **máy chủ** quyết định; client không gửi số tiền |
| BR-20 | **Tiền cọc** = `total_price × deposit_percent` (mặc định *`deposit.default_percent`=30%*, cho phép 20–100% theo tour), làm tròn **lên** 1.000đ |
| BR-21 | `balance_due_date = departure_date − `*`payment.balance_due_days`=7* ngày. Nếu khi đặt chỉ còn ≤ *`payment.full_required_days`=7* ngày tới ngày đi ⇒ bắt buộc thanh toán **toàn bộ** |
| BR-22 | Đơn `pending → confirmed` khi `paid_amount ≥ deposit_required` (hoặc sales xác nhận cho đơn công nợ có hợp đồng) |
| BR-23 | Webhook cổng thanh toán: **bắt buộc xác thực chữ ký**, đối chiếu `merchant_ref` và **số tiền**, xử lý **idempotent**. Không tin tham số URL khi khách được chuyển về site |
| BR-24 | `Payment` đã `succeeded` **bất biến**. Sửa sai bằng hoàn tiền hoặc bút toán điều chỉnh có ghi chú và người duyệt |
| BR-25 | **Thanh toán muộn** (đơn đã `expired`): còn chỗ ⇒ tự mở lại và xác nhận; hết chỗ ⇒ hoàn 100% và cảnh báo kế toán |
| BR-26 | Nhắc thanh toán: trước hạn giữ chỗ 2 giờ; trước `balance_due_date` 7, 3, 1 ngày; ngày quá hạn |
| BR-27 | Quá `balance_due_date` + *`payment.grace_hours`=12* giờ chưa đủ tiền ⇒ **tự hủy** (`unpaid`) và áp phí hủy theo BR-28 trên số đã thu |

### 8.6 Hủy, đổi và hoàn tiền

| Mã | Quy tắc |
|---|---|
| BR-28 | **Bảng phí hủy mặc định** (*`STANDARD-DOMESTIC`*, tính theo số ngày lịch từ ngày hủy tới ngày khởi hành; có thể có chính sách riêng cho tour có vé máy bay/tàu): |

| Hủy trước ngày khởi hành | Phí hủy (% `total_price`) |
|---|---|
| ≥ 15 ngày | 10% |
| 8–14 ngày | 30% |
| 4–7 ngày | 50% |
| 1–3 ngày | 80% |
| Ngày khởi hành / no-show | 100% |

| Mã | Quy tắc |
|---|---|
| BR-29 | **Công ty hủy hoặc đổi lớn:** không áp phí hủy; khách chọn chuyển lịch, hoàn 100% hoặc bảo lưu |
| BR-30 | Hoàn tiền về **đúng phương thức đã thanh toán**; không trừ phí cổng thanh toán của khách; thời gian xử lý nội bộ ≤ *`refund.sla_days`=7* ngày làm việc (thời gian ngân hàng/cổng tính thêm). Khoản ≥ *`refund.dual_approval_threshold`=20.000.000đ* cần hai người duyệt |
| BR-31 | **Phí hủy không vượt số tiền đã thu**: hệ thống không truy thu; thiệt hại lớn hơn xử lý ngoài hệ thống theo hợp đồng. Hủy đơn chưa thu tiền: không phí. Chi phí bên thứ ba không hoàn lại (vé máy bay, vé tàu…) phải **công bố ở trang tour** và được nhập thành khoản trừ riêng |
| BR-32 | **Tự phục vụ:** khách tự hủy và được tự duyệt khi còn ≥ *`cancel.self_service_min_days`=4* ngày tới ngày đi; ít hơn thì cần sales/quản lý duyệt |
| BR-33 | **Phí đổi ngày:** ≥ 15 ngày: miễn phí lần đầu; 8–14 ngày: 10% `total_price`; 4–7 ngày: 30%; < 4 ngày: không cho đổi (hủy rồi đặt mới). Chỉ đổi sang lịch cùng tour; mỗi đơn đổi tối đa *`change.max_times`=1* lần |
| BR-34 | Khi **công ty** hủy/đổi và khách chuyển lịch khác: giữ giá cũ nếu giá mới cao hơn; hoàn chênh lệch nếu giá mới thấp hơn. Khi **khách** tự đổi: trả chênh lệch nếu giá mới cao hơn, không hoàn nếu thấp hơn |
| BR-35 | **Bảo lưu (`credit`)** có hiệu lực *`credit.valid_months`=12* tháng, gắn với tài khoản, không quy đổi tiền mặt, ghi trong sổ có số dư và lịch sử dùng |

### 8.7 Chuyến đi và điều hành

| Mã | Quy tắc |
|---|---|
| BR-36 | `go_nogo_date = departure_date − `*`departure.go_nogo_days`=7* ngày. Tại mốc này chuyến phải được chốt: đảm bảo, ghép hoặc hủy |
| BR-37 | Hủy do thiếu khách phải thông báo cho mọi khách trước ít nhất *`cancel.company_notice_days`=5* ngày (trừ bất khả kháng) |
| BR-38 | Một HDV/xe không được gán cho hai chuyến trùng thời gian; xe phải đủ chỗ |
| BR-39 | Xuất manifest/dữ liệu cá nhân yêu cầu quyền, có **dấu thời gian + người xuất** trong nhật ký, tệp tạm tự xóa sau *`export.file_ttl_hours`=24* giờ |
| BR-47 | Ngày khởi hành tối thiểu cách hiện tại *`departure.min_lead_days`=1* ngày khi mở bán; `booking_cutoff_at` mặc định = ngày đi − *`departure.cutoff_days`=2* ngày (đoàn ghép) |

### 8.8 Đánh giá, thông báo và dữ liệu cá nhân

| Mã | Quy tắc |
|---|---|
| BR-40 | Chỉ khách có đơn `completed` được đánh giá, mỗi đơn một lần, trong *`review.window_days`=60* ngày. Kiểm duyệt chỉ để loại spam, dữ liệu cá nhân, ngôn từ vi phạm; **không xóa đánh giá tiêu cực chính đáng** |
| BR-42 | Thông báo giao dịch (xác nhận, thanh toán, thay đổi, hủy) **bắt buộc gửi**; thông báo tiếp thị chỉ khi khách đồng ý và luôn có cách hủy đăng ký |
| BR-43 | Số giấy tờ (CCCD/hộ chiếu) **mã hóa khi lưu**, che khi hiển thị (chỉ 4 số cuối), xem đầy đủ cần quyền và để lại nhật ký |
| BR-44 | Thời hạn lưu dữ liệu tài chính/chứng từ theo quy định kế toán hiện hành (do kế toán trưởng/pháp chế xác định); dữ liệu cá nhân không còn cần thiết được ẩn danh hóa |
| BR-45 | Thu thập dữ liệu cá nhân phải có thông báo mục đích và sự đồng ý rõ ràng, tuân thủ quy định bảo vệ dữ liệu cá nhân hiện hành (Nghị định 13/2023/NĐ-CP; pháp chế xác nhận khi vận hành) |

---

## 9. Yêu cầu chức năng (FR)

| ID | Yêu cầu | Luồng | Ưu tiên |
|---|---|---|---|
| FR-M01-01 | CRUD điểm đến, danh mục (tạm ẩn, chặn xóa khi còn tham chiếu) | LN-01 | P0 |
| FR-M01-02 | CRUD chính sách hủy theo bậc (ngày → %) và gán cho tour | LN-01, 09 | P0 |
| FR-M01-03 | Quản lý tham số cấu hình (Phụ lục B) có lịch sử thay đổi | LN-17 | P0 |
| FR-M02-01 | CRUD tour với `draft/published/hidden/archived` và kiểm tra điều kiện xuất bản | LN-01 | P0 |
| FR-M02-02 | Lịch trình theo ngày (tiêu đề, nội dung, bữa ăn, nơi nghỉ, địa điểm) | LN-01 | P0 |
| FR-M02-03 | Bao gồm/không bao gồm, lưu ý, quy định trẻ em, giấy tờ, `min_pax/max_pax`, `deposit_percent` | LN-01 | P0 |
| FR-M02-04 | Tải ảnh (kiểm tra loại/kích thước, ảnh thu nhỏ, `alt`, ảnh bìa, sắp xếp) | LN-01 | P0 |
| FR-M02-05 | Slug ổn định, trường SEO; khóa lạc quan theo `version`; nhân bản tour | LN-01 | P0/P1 |
| FR-M03-01 | CRUD lịch khởi hành; tạo hàng loạt theo quy tắc lặp | LN-02 | P0 |
| FR-M03-02 | Giá theo loại khách, phụ thu phòng đơn, mốc `cutoff/balance_due/go_nogo` tự gợi ý | LN-02 | P0 |
| FR-M03-03 | Tồn chỗ nguyên tử; trạng thái `open/full/closed` tự động | LN-02, 04 | P0 |
| FR-M03-04 | Lịch tháng và danh sách lịch; đóng/mở/hủy có lý do | LN-02 | P0 |
| FR-M03-05 | Danh sách chờ khi hết chỗ | LN-03 | P2 |
| FR-M04-01 | Danh sách tour tìm/lọc/sắp xếp/phân trang **phía máy chủ** | LN-03 | P0 |
| FR-M04-02 | Chi tiết tour, bộ chọn lịch, báo giá tức thời | LN-03 | P0 |
| FR-M04-03 | Bản đồ địa điểm và khoảng cách (đã có) | LN-03 | P1 |
| FR-M04-04 | Điểm đến, đánh giá thật, URL slug, sitemap, dữ liệu có cấu trúc | LN-03 | P1 |
| FR-M04-05 | Yêu thích (wishlist) | LN-03 | P2 |
| FR-M05-01 | Đăng ký + xác minh email; gửi lại liên kết | LN-15 | P0 |
| FR-M05-02 | Đăng nhập, khóa tạm khi sai nhiều lần, phiên do máy chủ cấp (làm mới/thu hồi) | LN-15 | P0 |
| FR-M05-03 | Quên và đặt lại mật khẩu; đổi mật khẩu; thu hồi phiên | LN-15 | P0 |
| FR-M05-04 | Hồ sơ, đổi email có xác minh, danh sách phiên, đăng xuất tất cả | LN-15 | P1 |
| FR-M05-05 | 2FA (TOTP) cho nhân viên | LN-15, 17 | P1 |
| FR-M05-06 | Yêu cầu xóa/ẩn danh hóa dữ liệu | LN-15 | P1 |
| FR-M06-01 | API báo giá (coupon, loại khách, cọc, hạn) | LN-04 | P0 |
| FR-M06-02 | Tạo đơn + giữ chỗ nguyên tử + `Idempotency-Key` | LN-04 | P0 |
| FR-M06-03 | Danh sách hành khách, kiểm tra tuổi/giấy tờ theo tour | LN-04 | P0 |
| FR-M06-04 | Đơn của tôi: danh sách, chi tiết, dòng thời gian, đồng hồ giữ chỗ | LN-08 | P0 |
| FR-M06-05 | Sửa thông tin hành khách trong hạn | LN-08 | P1 |
| FR-M06-06 | Tạo đơn hộ khách, kênh bán, giữ chỗ có thời hạn, công nợ | LN-06 | P0 |
| FR-M06-07 | Hàng đợi đơn admin: tìm/lọc/sắp xếp/phân trang máy chủ; chuyển trạng thái hợp lệ; ghi chú nội bộ; gia hạn giữ chỗ | LN-06, 08 | P0 |
| FR-M07-01 | Tích hợp ít nhất 1 cổng online + webhook an toàn + truy vấn lại giao dịch treo | LN-05 | P0 |
| FR-M07-02 | Chuyển khoản VietQR, tải chứng từ, kế toán xác nhận/từ chối | LN-05 | P0 |
| FR-M07-03 | Thanh toán phần còn lại, thanh toán muộn, nhắc thanh toán | LN-05 | P0 |
| FR-M07-04 | Ghi nhận tiền mặt/POS và biên lai | LN-05 | P1 |
| FR-M07-05 | Đối soát giao dịch và công nợ phải thu | LN-16 | P1 |
| FR-M08-01 | Báo giá hủy; hủy tự phục vụ; hủy theo duyệt | LN-09 | P0 |
| FR-M08-02 | Quy trình hoàn tiền (yêu cầu → duyệt → xử lý → hoàn tất), tách người duyệt | LN-09 | P0 |
| FR-M08-03 | Đổi ngày/đổi số khách/chuyển nhượng với tính chênh lệch | LN-10 | P1 |
| FR-M08-04 | Hủy hàng loạt khi hủy chuyến; bảo lưu (credit) | LN-09, 11 | P1 |
| FR-M09-01 | Hàng đợi gửi thông báo (outbox), thử lại, nhật ký gửi | mục 10 | P0 |
| FR-M09-02 | Mẫu thông báo có biến và phiên bản | mục 10 | P0 |
| FR-M09-03 | SMS/Zalo; thông báo trong ứng dụng | mục 10 | P1 |
| FR-M10-01 | Bảng điều khiển chuyến (lấp đầy, tiền thu, cảnh báo) | LN-11 | P1 |
| FR-M10-02 | Chốt đoàn, đảm bảo khởi hành, ghép/hủy | LN-11 | P1 |
| FR-M10-03 | Quản lý HDV, xe, nhà cung cấp; gán không trùng | LN-11 | P1 |
| FR-M10-04 | Manifest PDF/Excel có kiểm soát và nhật ký | LN-11 | P1 |
| FR-M10-05 | Chi phí chuyến, lợi nhuận, quyết toán | LN-12 | P1 |
| FR-M10-06 | Check-in, no-show, ghi sự cố | LN-11 | P2 |
| FR-M11-01 | Voucher PDF tự sinh; lưu phiên bản điều khoản đã đồng ý | LN-07 | P1 |
| FR-M11-02 | Yêu cầu và xuất hóa đơn điện tử, hóa đơn điều chỉnh | LN-07 | P1 |
| FR-M12-01 | CRUD mã giảm giá, kiểm tra điều kiện, giữ/trả lượt | LN-14 | P1 |
| FR-M12-02 | Ưu đãi đặt sớm theo lịch; báo cáo hiệu quả mã | LN-14 | P2 |
| FR-M13-01 | Đánh giá sau chuyến; kiểm duyệt; phản hồi; tính lại điểm trung bình | LN-12 | P1 |
| FR-M13-02 | Ticket hỗ trợ/khiếu nại có SLA và leo thang | LN-13 | P1 |
| FR-M13-03 | Liên hệ/tư vấn và yêu cầu tour riêng | LN-13 | P1 |
| FR-M14-01 | Dashboard điều hành (số liệu có nguồn máy chủ) | LN-16 | P0 |
| FR-M14-02 | Báo cáo doanh thu đã thu/ghi nhận, lấp đầy, hủy, công nợ, lợi nhuận chuyến, kênh, mã | LN-16 | P1 |
| FR-M14-03 | Xuất CSV/Excel có kiểm soát và nhật ký | LN-16 | P1 |
| FR-M15-01 | Banner, trang chính sách, bài viết (CMS) | — | P2 |
| FR-M16-01 | Mời/khóa người dùng nội bộ, gán vai trò | LN-17 | P0 |
| FR-M16-02 | Nhật ký thao tác bất biến, tra cứu/lọc | LN-17 | P0 |
| FR-M16-03 | Sao lưu tự động, kiểm thử khôi phục, giám sát cảnh báo | — | P0 |

---

## 10. Thông báo

| Sự kiện | Người nhận | Kênh | Thời điểm |
|---|---|---|---|
| Xác minh email / chào mừng | Khách | Email | Ngay |
| Đặt lại mật khẩu / đã đổi mật khẩu | Khách/nhân viên | Email | Ngay |
| Đã nhận đơn (chờ thanh toán, hạn giữ chỗ) | Khách | Email, in-app | Ngay |
| Sắp hết hạn giữ chỗ | Khách | Email, SMS/Zalo | Còn 2 giờ; còn 30 phút |
| Đơn hết hạn | Khách | Email | Ngay |
| Đã nhận thanh toán (biên lai) | Khách | Email, SMS | Ngay |
| Thanh toán thất bại | Khách | Email, in-app | Ngay |
| Xác nhận đơn + voucher | Khách | Email, SMS/Zalo | Ngay |
| Nhắc thanh toán phần còn lại | Khách | Email, SMS/Zalo | T−7, T−3, T−1 so với hạn; ngày quá hạn |
| Đơn bị hủy + bảng tính phí | Khách | Email | Ngay |
| Hoàn tiền: đã tiếp nhận / đã duyệt / đã chuyển | Khách | Email | Mỗi bước |
| Yêu cầu đổi/hủy: đã nhận / kết quả | Khách | Email, in-app | Ngay |
| **Công ty đổi/hủy chuyến (ưu tiên cao)** | Khách | Email + SMS/Zalo | Ngay; nhắc lại nếu khách chưa phản hồi sau 24 giờ |
| Thông tin trước chuyến (giờ, điểm đón, HDV, hotline) | Khách | Email, SMS/Zalo | T−3 và T−1 |
| Mời đánh giá | Khách | Email | T+1 sau ngày về; nhắc T+7 |
| Phản hồi ticket | Khách | Email, in-app | Ngay |
| Đã xuất hóa đơn | Khách | Email | Ngay |
| Có đơn mới / đơn chờ xác nhận | sales | In-app, email tóm tắt | Ngay / hằng ngày |
| Thanh toán cần xử lý (lệch tiền, chuyển khoản chờ xác nhận, thanh toán muộn) | accountant | In-app, email | Ngay |
| Hoàn tiền chờ duyệt | accountant | In-app | Ngay |
| Chuyến sắp tới `go_nogo_date`, thiếu khách, còn chỗ ít | operator | In-app, email | T−10, T−7 |
| Lỗi hệ thống: webhook lỗi, hàng đợi gửi kẹt, lệch tồn chỗ | super_admin | Email/kênh cảnh báo | Ngay |

**Quy tắc:** mẫu có phiên bản, hỗ trợ biến; gửi qua **outbox** với thử lại lũy thoái; nội dung **không chứa** số giấy tờ hay dữ liệu nhạy cảm; liên kết hành động yêu cầu đăng nhập; gửi lỗi quá *`notify.max_attempts`=5* lần thì cảnh báo; có chống gửi trùng theo khóa (`type + entity + mốc thời gian`).

---

## 11. Báo cáo, KPI và sự kiện phân tích

### 11.1 Định nghĩa chỉ số

| Chỉ số | Công thức |
|---|---|
| Tỷ lệ lấp đầy | `Σ seats_taken (đơn confirmed/completed) / Σ capacity` của các chuyến đã khởi hành trong kỳ |
| Tỷ lệ hủy | Đơn `cancelled` (do khách/nhân viên) ÷ đơn đã `confirmed` trong kỳ; tách riêng `expired` và hủy do công ty |
| Tỷ lệ chuyển đổi | Đơn `confirmed` ÷ phiên bắt đầu checkout |
| Giá trị đơn trung bình | `avg(total_price)` của đơn `confirmed + completed` |
| **Doanh thu đã thu** | `Σ Payment.succeeded − Σ Refund.completed` theo ngày giao dịch |
| **Doanh thu ghi nhận** | `Σ (total_price − phần hoàn)` của đơn `completed`, theo ngày chuyến kết thúc |
| Công nợ phải thu | `Σ (total_price − paid_amount)` của đơn `confirmed`, phân nhóm theo tuổi nợ |
| Lợi nhuận chuyến | Doanh thu ghi nhận − `Σ DepartureCost` |
| Thời gian đặt trước | `avg(departure_date − created_at)` |
| Thời gian xử lý hoàn tiền | `avg(processed_at − requested_at)` |
| Tuân thủ SLA ticket | Ticket phản hồi đầu tiên đúng hạn ÷ tổng ticket |
| Hiệu quả mã giảm giá | Lượt dùng, doanh thu, tổng giảm, tỷ lệ đơn hoàn tất |

### 11.2 Sự kiện analytics tối thiểu

`view_tour`, `select_departure`, `start_checkout`, `submit_passengers`, `apply_coupon` (kết quả), `create_booking`, `start_payment` (phương thức), `payment_success/failed`, `cancel_booking`, `search` (từ khóa, số kết quả), `submit_inquiry`, `submit_review`. Không gửi dữ liệu cá nhân vào analytics.

---

## 12. Yêu cầu phi chức năng

| Nhóm | Yêu cầu |
|---|---|
| Hiệu năng | Danh sách/chi tiết tour LCP ≤ 2,5 giây trên 4G (đo thực tế); API đọc p95 ≤ 500 ms, ghi p95 ≤ 1 giây; chịu tối thiểu 100 phiên checkout đồng thời; phân trang/tìm kiếm phía máy chủ |
| Sẵn sàng và phục hồi | Mục tiêu 99,5% mỗi tháng; sao lưu CSDL hằng ngày + nhật ký nhị phân (RPO ≤ 15 phút), RTO ≤ 4 giờ, **thử khôi phục hằng tháng** |
| Bảo mật | HTTPS bắt buộc (HSTS); xác thực/phân quyền phía máy chủ; chống IDOR, CSRF, XSS, SQL injection; giới hạn tốc độ đăng nhập và API; CORS theo danh sách nguồn; CSP; 2FA nhân viên; mã hóa dữ liệu nhạy cảm; quản lý bí mật ngoài mã nguồn; quét phụ thuộc; mục tiêu OWASP ASVS mức 2 |
| Quyền riêng tư | Theo BR-43…BR-45; ghi nhận đồng ý; ẩn danh hóa; hạn chế dữ liệu trong log |
| Toàn vẹn dữ liệu | Giao dịch CSDL cho mọi thay đổi tiền/chỗ; khóa ngoại; ràng buộc CHECK; đối soát tồn chỗ hằng đêm |
| Khả năng truy vết | `requestId` xuyên suốt; nhật ký có cấu trúc; nhật ký thao tác bất biến |
| Khả dụng giao diện | WCAG 2.1 AA; điều khiển bằng bàn phím; thiết kế ưu tiên di động (360px trở lên) |
| Quốc tế hóa | Mặc định `vi-VN`, múi giờ `Asia/Ho_Chi_Minh`, tiền VND; chuẩn bị khóa văn bản để thêm tiếng Anh (P2) |
| Tương thích | Hai phiên bản mới nhất của Chrome/Edge/Firefox/Safari; iOS Safari 15+ |
| Vận hành | Giám sát và cảnh báo: webhook lỗi, hàng đợi gửi kẹt, đơn `pending` bất thường, lệch tồn chỗ, tỷ lệ lỗi 5xx |
| Kiểm thử | Unit cho quy tắc tiền/chỗ; kiểm thử đồng thời (race) cho tồn chỗ; kiểm thử quyền/IDOR; E2E cho luồng đặt-thanh toán-hủy |

---

## 13. Tích hợp bên ngoài

| Nhóm | Mục đích | Ghi chú |
|---|---|---|
| Cổng thanh toán (VNPay/MoMo/ZaloPay hoặc tương đương) | Thanh toán online, hoàn tiền | Chữ ký webhook, môi trường sandbox, truy vấn trạng thái; chọn nhà cung cấp theo hợp đồng |
| Ngân hàng/VietQR | Chuyển khoản, đối soát sao kê | P2: tự khớp giao dịch |
| Email giao dịch | Thông báo bắt buộc | SPF/DKIM/DMARC; theo dõi bounce |
| SMS brand name / Zalo ZNS | Nhắc quan trọng | Cần đăng ký thương hiệu/mẫu |
| Hóa đơn điện tử | Phát hành hóa đơn | Nhà cung cấp được cấp phép |
| Bản đồ | Bản đồ địa điểm, khoảng cách | Hiện dùng Google Maps nhúng + OpenStreetMap |
| Lưu trữ tệp | Ảnh, chứng từ, PDF | Lưu ngoài thư mục web công khai nếu là tệp nhạy cảm; liên kết tạm thời có chữ ký |
| Chống bot | Biểu mẫu đăng ký, liên hệ, đăng nhập | CAPTCHA/thử thách bất đồng bộ |
| Giám sát lỗi, analytics | Quan sát hệ thống và hành vi | Không đẩy dữ liệu cá nhân |

---

## 14. Phân kỳ triển khai và đối chiếu hiện trạng

### 14.1 Phân kỳ

| Giai đoạn | Nội dung | Điều kiện hoàn thành |
|---|---|---|
| **P0 — Nền tảng vận hành thật** | Xác thực/phân quyền phía máy chủ + RBAC; lịch khởi hành + tồn chỗ nguyên tử; đặt tour có hành khách; giữ chỗ/hết hạn; 1 cổng thanh toán + chuyển khoản; hủy/hoàn tiền cơ bản; email giao dịch; xác minh/đặt lại mật khẩu; audit log; sao lưu | AC-01…AC-20 đạt; kiểm thử đồng thời tồn chỗ đạt; không còn thao tác ghi nào không qua kiểm tra quyền |
| **P1 — Vận hành và tăng trưởng** | Điều hành (manifest, HDV, xe, chi phí), voucher/hóa đơn, đổi ngày, khuyến mãi, đánh giá, ticket, báo cáo, SMS/Zalo, 2FA | AC-21…AC-30 đạt |
| **P2 — Mở rộng** | Danh sách chờ, hành khách đã lưu, CMS/blog, đa ngôn ngữ, cổng đại lý, tự động đối soát ngân hàng, PWA | Theo kế hoạch kinh doanh |

### 14.2 Đối chiếu với mã nguồn hiện có (bản mô tả trong `docs/PRD.md` v1.0)

| Hạng mục | Hiện có | Cần làm để đạt bản mục tiêu |
|---|---|---|
| Tour | Một `departureDate` và một giá trên tour | Tách **Departure** (nhiều lịch, giá theo loại khách, sức chứa) |
| Đặt chỗ | Số khách + liên hệ; giới hạn 1–10 | Danh sách hành khách, loại khách theo ngày sinh, giữ chỗ nguyên tử, hết hạn, idempotency |
| Mã đơn | Sinh ở trình duyệt | Máy chủ sinh trong giao dịch |
| Trạng thái đơn | `pending/confirmed/completed/cancelled` | Thêm `expired`, `payment_status` suy ra từ tiền, `ChangeRequest` |
| Thanh toán | Chưa có | Payment, Refund, webhook, đối soát, công nợ |
| Hủy | Khách chỉ hủy được đơn `pending` | Chính sách theo bậc, báo giá hủy, hoàn tiền, bảo lưu |
| Xác thực | Mật khẩu kiểm tra ở máy chủ (bcrypt), phiên lưu `localStorage`, API **không kiểm tra người gọi** | Phiên do máy chủ cấp (token ngắn hạn + làm mới), RBAC ở từng endpoint, xác minh email, quên mật khẩu, khóa tạm, 2FA nhân viên |
| Vai trò | `admin`, `user` | 9 vai trò theo mục 3 |
| Xếp hạng tour | `rating`/`reviews` admin nhập tay | Tính từ đánh giá đã duyệt |
| Ảnh | Chỉ nhập URL | Tải lên, kiểm tra, thu nhỏ |
| Phân trang/tìm kiếm | Client, tải toàn bộ | Phía máy chủ |
| Thông báo | Không | Outbox + mẫu + kênh |
| Người dùng, nhật ký, cấu hình | Chưa có | M16 |
| Điều hành, chứng từ, khuyến mãi, đánh giá, ticket, báo cáo | Chưa có (dashboard cơ bản) | M10–M14 |
| Tài liệu | README/Technical còn đoạn mô tả cũ (localStorage, tài khoản demo) | Cập nhật sau mỗi giai đoạn |

---

## 15. Tiêu chí nghiệm thu (AC)

Định dạng: **Cho** (điều kiện) · **Khi** (hành động) · **Thì** (kết quả quan sát được).

| ID | Kịch bản |
|---|---|
| AC-01 | **Cho** lịch còn 1 chỗ, **khi** hai khách gửi đặt chỗ đồng thời, **thì** đúng 1 đơn tạo thành công, đơn kia nhận `SEAT_UNAVAILABLE`, `seats_taken = capacity` |
| AC-02 | **Cho** khách đã đăng nhập và xác minh, **khi** gửi cùng một yêu cầu đặt chỗ hai lần với cùng `Idempotency-Key`, **thì** chỉ có một đơn và hai phản hồi trùng mã đơn |
| AC-03 | **Cho** khách chưa xác minh email, **khi** đặt tour, **thì** bị từ chối với `EMAIL_NOT_VERIFIED` kèm hướng dẫn gửi lại liên kết |
| AC-04 | **Cho** hành khách sinh nhật làm đổi loại khách trước ngày đi, **khi** nhập ngày sinh, **thì** loại và giá tính theo **ngày khởi hành** và khách được thông báo thay đổi |
| AC-05 | **Cho** đơn `pending`, **khi** quá `hold_expires_at`, **thì** đơn thành `expired`, chỗ được trả, khách nhận email, lượt mã giảm giá được trả |
| AC-06 | **Cho** webhook cổng báo thành công đúng chữ ký và số tiền, **khi** nhận hai lần, **thì** `paid_amount` chỉ tăng một lần và đơn `confirmed` có voucher |
| AC-07 | **Cho** webhook sai chữ ký hoặc sai số tiền, **khi** nhận, **thì** không thay đổi đơn, ghi nhật ký và (sai số tiền) tạo mục “cần xử lý” cho kế toán |
| AC-08 | **Cho** tiền về sau khi đơn `expired` và lịch còn chỗ, **khi** xử lý, **thì** đơn tự mở lại thành `confirmed`; nếu hết chỗ thì tạo hoàn tiền 100% và cảnh báo |
| AC-09 | **Cho** chuyến còn ≤ 7 ngày, **khi** khách tạo đơn, **thì** chỉ cho chọn thanh toán toàn bộ |
| AC-10 | **Cho** đơn `confirmed` thiếu tiền quá hạn + thời gian ân hạn, **khi** tác vụ nền chạy, **thì** đơn bị hủy `unpaid`, trả chỗ, phí hủy tính trên số đã thu |
| AC-11 | **Cho** khách hủy đơn còn 10 ngày, **khi** xem báo giá hủy, **thì** hiển thị phí 30%, số hoàn dự kiến, và sau xác nhận đơn `cancelled`, chỗ được trả, tạo `Refund(requested)` |
| AC-12 | **Cho** khách hủy còn 2 ngày (dưới ngưỡng tự phục vụ), **khi** gửi yêu cầu, **thì** chuyển hàng đợi sales và **không** tự hủy |
| AC-13 | **Cho** người tạo yêu cầu hoàn tiền, **khi** chính họ cố duyệt, **thì** bị từ chối `FORBIDDEN` |
| AC-14 | **Cho** khoản hoàn lớn hơn số đã thu, **khi** gửi, **thì** `REFUND_EXCEEDS_PAID` |
| AC-15 | **Cho** admin hủy lịch có 8 đơn `confirmed`, **khi** xác nhận có lý do, **thì** cả 8 đơn chuyển sang quy trình công ty hủy, không áp phí, khách nhận thông báo ưu tiên cao |
| AC-16 | **Cho** khách A, **khi** gọi trực tiếp API xem đơn của khách B, **thì** `404/403`, không lộ dữ liệu |
| AC-17 | **Cho** nhân viên `content_editor`, **khi** gọi API xác nhận thanh toán, **thì** `FORBIDDEN` dù UI không hiển thị nút |
| AC-18 | **Cho** hai nhân viên cùng sửa một tour, **khi** người thứ hai lưu bằng `version` cũ, **thì** `VERSION_CONFLICT` và không ghi đè |
| AC-19 | **Cho** đăng nhập sai quá 5 lần, **khi** thử lần tiếp, **thì** bị khóa tạm, thông báo không tiết lộ email có tồn tại |
| AC-20 | **Cho** mọi thao tác đổi tiền/trạng thái/quyền, **khi** thực hiện, **thì** có bản ghi AuditLog bất biến (ai, khi nào, trước/sau) |
| AC-21 | **Cho** chuyến đến `go_nogo_date` thiếu khách, **khi** operator chọn hủy, **thì** bắt buộc lý do và kích hoạt thông báo/hoàn tiền theo LN-09B |
| AC-22 | **Cho** HDV, **khi** mở manifest chuyến không được gán, **thì** bị từ chối; chuyến được gán chỉ thấy dữ liệu cần thiết, giấy tờ che 4 số cuối |
| AC-23 | **Cho** đổi ngày còn 10 ngày, **khi** chọn lịch còn chỗ, **thì** tính phí 10% + chênh lệch giá, chỗ chuyển nguyên tử, lịch sử ghi đầy đủ |
| AC-24 | **Cho** mã giảm giá hết lượt/hết hạn, **khi** áp dụng, **thì** hiển thị lý do cụ thể và vẫn đặt được không có mã |
| AC-25 | **Cho** khách có đơn `completed`, **khi** gửi đánh giá, **thì** vào hàng đợi duyệt; sau duyệt `rating_avg` của tour được tính lại |
| AC-26 | **Cho** yêu cầu hóa đơn với mã số thuế sai định dạng, **khi** gửi, **thì** báo lỗi theo trường |
| AC-27 | **Cho** báo cáo doanh thu, **khi** chọn kỳ, **thì** hiển thị riêng “đã thu” và “ghi nhận”, tổng khớp với bảng giao dịch |
| AC-28 | **Cho** tác vụ đối soát đêm, **khi** `seats_taken` lệch tổng đơn thực tế, **thì** tạo cảnh báo và không tự sửa |
| AC-29 | **Cho** khách yêu cầu xóa tài khoản còn đơn hiệu lực, **khi** gửi, **thì** bị từ chối có lý do và hướng dẫn |
| AC-30 | **Cho** mọi trang khách và admin ở 360px, **khi** kiểm tra, **thì** không tràn ngang và thao tác chính dùng được bằng bàn phím/cảm ứng |

---

## 16. Rủi ro, giả định và quyết định cần chủ sản phẩm duyệt

| # | Nội dung | Mức |
|---|---|---|
| D1 | Chốt **bảng phí hủy/đổi** (BR-28, BR-33) và ngoại lệ cho tour có vé máy bay/tàu | Cao |
| D2 | Chốt **tỷ lệ cọc**, hạn thanh toán đủ, thời gian giữ chỗ (BR-09, 20, 21) | Cao |
| D3 | Chọn **nhà cung cấp thanh toán**, hóa đơn điện tử, SMS/Zalo; ký hợp đồng và lấy môi trường thử | Cao |
| D4 | Có bán **đoàn ghép lẻ** và **đoàn riêng** không; có cổng **đại lý** không | Trung bình |
| D5 | Tour có **vé máy bay**: chính sách xuất vé và hủy riêng | Trung bình |
| D6 | Ngưỡng tuổi em bé/trẻ em từng tour (BR-10) | Trung bình |
| D7 | Chính sách **bảo lưu** (BR-35) và **bất khả kháng** | Trung bình |
| D8 | Thời hạn lưu dữ liệu, mẫu đồng ý, người chịu trách nhiệm dữ liệu cá nhân | Cao |
| D9 | Có bán **bảo hiểm du lịch** kèm đơn không | Thấp |
| D10 | Thông tin **giấy phép kinh doanh lữ hành**, điều khoản mua bán, hợp đồng mẫu do pháp chế soạn | Cao |

**Rủi ro kỹ thuật chính:** bán vượt chỗ khi đồng thời cao (giảm bằng cập nhật nguyên tử + kiểm thử race); lệch tiền do webhook (idempotent + đối soát); lộ dữ liệu cá nhân hành khách (mã hóa + RBAC + log); lệ thuộc cổng thanh toán (phương thức dự phòng chuyển khoản).

---

## Phụ lục A — Mã lỗi nghiệp vụ

| Mã | HTTP | Khi nào |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Sai dữ liệu đầu vào, kèm `fields` |
| `UNAUTHENTICATED` | 401 | Thiếu/hết hạn phiên |
| `FORBIDDEN` | 403 | Không đủ quyền |
| `NOT_FOUND` | 404 | Không có/không được xem |
| `EMAIL_TAKEN` | 409 | Email đã đăng ký |
| `EMAIL_NOT_VERIFIED` | 403 | Chưa xác minh email |
| `ACCOUNT_LOCKED` | 423 | Khóa tạm/khóa quản trị |
| `RATE_LIMITED` | 429 | Quá giới hạn tốc độ |
| `SEAT_UNAVAILABLE` | 409 | Không đủ chỗ |
| `DEPARTURE_CLOSED` | 409 | Lịch không nhận đơn |
| `HOLD_EXPIRED` | 409 | Hết hạn giữ chỗ |
| `INVALID_STATE_TRANSITION` | 409 | Chuyển trạng thái không hợp lệ |
| `VERSION_CONFLICT` | 409 | Phiên bản đã đổi (khóa lạc quan) |
| `IDEMPOTENCY_CONFLICT` | 409 | Cùng khóa nhưng nội dung khác |
| `COUPON_INVALID` | 422 | Mã không hợp lệ (`reason`: `expired`, `used_up`, `min_order`, `not_applicable`, `already_used`) |
| `PAYMENT_AMOUNT_MISMATCH` | 409 | Số tiền không khớp |
| `PAYMENT_ALREADY_SETTLED` | 409 | Đơn đã thanh toán đủ |
| `CANCEL_NOT_ALLOWED` | 409 | Không được hủy/đổi ở trạng thái hoặc thời điểm này |
| `REFUND_EXCEEDS_PAID` | 422 | Hoàn vượt số đã thu |
| `HAS_DEPENDENCIES` | 409 | Còn dữ liệu tham chiếu, không xóa được |
| `INTERNAL_ERROR` | 500 | Lỗi hệ thống (không lộ chi tiết, kèm `requestId`) |

## Phụ lục B — Tham số cấu hình và giá trị mặc định

| Khóa | Mặc định | Ý nghĩa |
|---|---|---|
| `hold.hours_default` / `hours_near` / `hours_urgent` | 24 / 6 / 2 | Giờ giữ chỗ theo độ gần ngày đi |
| `hold.min_payment_minutes` | 30 | Tối thiểu còn lại khi bắt đầu thanh toán |
| `hold.max_extend_hours` | 24 | Gia hạn giữ chỗ tối đa |
| `deposit.default_percent` | 30 | % cọc mặc định |
| `payment.balance_due_days` | 7 | Hạn thanh toán đủ trước ngày đi |
| `payment.full_required_days` | 7 | Còn ≤ ngày này: bắt buộc trả toàn bộ |
| `payment.grace_hours` | 12 | Ân hạn trước khi tự hủy vì chưa trả đủ |
| `booking.max_pax_online` | 10 | Số khách tối đa mỗi đơn online |
| `seat.infant_takes_seat` | false | Em bé có chiếm chỗ không |
| `departure.go_nogo_days` | 7 | Mốc chốt đoàn |
| `departure.cutoff_days` | 2 | Đóng bán trước ngày đi |
| `departure.min_lead_days` | 1 | Khoảng cách tối thiểu khi mở bán |
| `cancel.self_service_min_days` | 4 | Khách tự hủy tự động duyệt nếu còn ≥ |
| `cancel.company_notice_days` | 5 | Thông báo hủy chuyến tối thiểu |
| `change.max_times` | 1 | Số lần đổi ngày |
| `credit.valid_months` | 12 | Hạn bảo lưu |
| `refund.sla_days` | 7 | Ngày làm việc xử lý hoàn tiền nội bộ |
| `refund.dual_approval_threshold` | 20.000.000 | Ngưỡng cần hai người duyệt (VND) |
| `discount.sales_max_percent` | 5 | Hạn mức giảm giá thủ công của sales |
| `price.min_total_after_discount` | 0 | Tổng tối thiểu sau giảm |
| `passenger.edit_cutoff_days` | 3 | Khách tự sửa hành khách đến mốc này |
| `invoice.request_deadline_days` | 7 | Hạn yêu cầu hóa đơn sau chuyến |
| `review.window_days` | 60 | Hạn đánh giá sau chuyến |
| `auth.max_failed_attempts` / `auth.lock_minutes` | 5 / 15 | Khóa tạm đăng nhập |
| `ticket.first_response_hours` | 8 | SLA phản hồi đầu |
| `notify.max_attempts` | 5 | Số lần thử gửi thông báo |
| `export.file_ttl_hours` | 24 | Thời gian tệp xuất tồn tại |

Mọi thay đổi tham số được ghi nhật ký (người đổi, giá trị cũ/mới) và có hiệu lực **cho đơn tạo sau đó**.
