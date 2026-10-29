import { escapeHtml } from "./util.mjs";
import { getDeparture, getPolicy, getTour, grossPaidAmount } from "./business.mjs";

const PRINT_CSS = `
  * { box-sizing: border-box; }
  body { font-family: "DM Sans", Arial, sans-serif; color: #1d2b24; margin: 0; background: #f4f2ed; }
  .sheet { background: #fff; max-width: 820px; margin: 24px auto; padding: 40px; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,.08); }
  .brand { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #244b39; padding-bottom: 16px; margin-bottom: 24px; }
  .brand h1 { font-family: Georgia, serif; font-size: 26px; margin: 0; color: #244b39; letter-spacing: .5px; }
  .brand small { color: #6b7a72; }
  h2 { font-size: 20px; margin: 24px 0 8px; color: #244b39; }
  h3 { font-size: 15px; margin: 18px 0 6px; color: #244b39; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e6e3dc; vertical-align: top; }
  th { background: #f3f1eb; font-weight: 600; color: #43544b; }
  .muted { color: #6b7a72; }
  .code { font-family: ui-monospace, monospace; font-size: 18px; letter-spacing: 1px; background: #f3f1eb; padding: 4px 10px; border-radius: 6px; display: inline-block; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .box { border: 1px solid #e6e3dc; border-radius: 8px; padding: 14px; }
  .total { font-size: 18px; font-weight: 700; color: #244b39; }
  .qr { float: right; width: 120px; height: 120px; }
  .actions { text-align: center; margin: 20px auto; }
  .actions button { background: #244b39; color: #fff; border: 0; padding: 10px 20px; border-radius: 999px; font-size: 14px; cursor: pointer; }
  @media print {
    body { background: #fff; }
    .sheet { box-shadow: none; margin: 0; max-width: none; border-radius: 0; padding: 0; }
    .actions { display: none; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    @page { size: A4; margin: 16mm; }
  }
`;

function page(title, body) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PRINT_CSS}</style></head><body><div class="sheet">${body}</div><div class="actions"><button onclick="window.print()">In / Lưu PDF</button></div></body></html>`;
}

export function voucherHtml(db, booking, { fullDocuments = false } = {}) {
  const departure = getDeparture(db, booking.departureId);
  const tour = getTour(db, departure.tourId);
  const destination = db.destinations.find((d) => d.id === tour.destinationId);
  const policy = getPolicy(db, tour);
  const passengers = db.passengers.filter((p) => p.bookingId === booking.id);
  const gross = grossPaidAmount(db, booking.id);
  const remaining = Math.max(0, booking.totalPrice - gross);
  const rows = passengers.map((p, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(p.fullName)}</td>
      <td>${p.type === "adult" ? "Người lớn" : p.type === "child" ? "Trẻ em" : "Em bé"}</td>
      <td>${p.gender === "male" ? "Nam" : p.gender === "female" ? "Nữ" : "Khác"}</td>
      <td>${p.dateOfBirth.split("-").reverse().join("/")}</td>
      <td>${escapeHtml(fullDocuments ? p.idNumber || "—" : p.idNumber || (p.passportNumber || "—"))}</td>
      <td>${escapeHtml(p.specialRequest || "—")}</td>
    </tr>`).join("");
  const body = `
    <div class="brand">
      <div><h1>VietTrails</h1><small>Hành trình Việt, trọn vẹn từng khoảnh khắc</small></div>
      <div style="text-align:right">
        <div class="code">${escapeHtml(booking.code)}</div>
        <div class="muted" style="font-size:12px;margin-top:4px">Voucher xác nhận dịch vụ</div>
        <img class="qr" alt="Mã QR đơn ${escapeHtml(booking.code)}" src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(booking.code)}" />
      </div>
    </div>
    <h2>${escapeHtml(tour.name)}</h2>
    <p class="muted">${escapeHtml(destination?.name || "")} · ${tour.durationDays} ngày ${tour.durationNights} đêm</p>
    <div class="grid">
      <div class="box">
        <h3>Chuyến đi</h3>
        <div>Khởi hành: <strong>${departure.departureDate.split("-").reverse().join("/")}</strong></div>
        <div>Kết thúc: ${departure.returnDate.split("-").reverse().join("/")}</div>
        <div>Điểm hẹn: ${escapeHtml(departure.meetingPoint)}</div>
        <div>Giờ hẹn: <strong>${escapeHtml(departure.meetingTime)}</strong></div>
      </div>
      <div class="box">
        <h3>Người liên hệ</h3>
        <div><strong>${escapeHtml(booking.contactName)}</strong></div>
        <div>${escapeHtml(booking.contactPhone)}</div>
        <div>${escapeHtml(booking.contactEmail)}</div>
        <div class="muted" style="margin-top:6px">Hotline 24/7: 1900 6868</div>
      </div>
    </div>
    <h3>Hành khách (${passengers.length})</h3>
    <table>
      <thead><tr><th>#</th><th>Họ tên</th><th>Loại</th><th>Giới tính</th><th>Ngày sinh</th><th>Giấy tờ</th><th>Yêu cầu</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="grid">
      <div class="box">
        <h3>Thanh toán</h3>
        <div>Tổng giá trị: <strong>${booking.totalPrice.toLocaleString("vi-VN")} đ</strong></div>
        <div>Đã thanh toán: <strong>${gross.toLocaleString("vi-VN")} đ</strong></div>
        <div>Còn lại: <strong>${remaining.toLocaleString("vi-VN")} đ</strong></div>
        ${booking.balanceDueDate && remaining > 0 ? `<div class="muted">Hạn thanh toán: ${booking.balanceDueDate.split("-").reverse().join("/")}</div>` : ""}
      </div>
      <div class="box">
        <h3>Chính sách hủy — ${escapeHtml(policy.name)}</h3>
        <table style="margin:0"><tbody>
          ${policy.tiers.map((t) => `<tr><td>${t.maxDaysBefore === null ? `Từ ${t.minDaysBefore} ngày` : t.minDaysBefore === 0 ? "Ngày khởi hành / no-show" : `${t.minDaysBefore}–${t.maxDaysBefore} ngày`}</td><td>${t.feePercent}%</td></tr>`).join("")}
        </tbody></table>
      </div>
    </div>
    <p class="muted" style="font-size:12px;margin-top:18px">Vui lòng có mặt trước giờ hẹn 15 phút và mang theo giấy tờ tuỳ thân. Voucher được phát hành lúc ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}. Mã đơn dùng để tra cứu tại mọi quầy VietTrails.</p>
  `;
  return page(`Voucher ${booking.code}`, body);
}

export function manifestHtml(db, departure, { fullDocuments = false, exportedBy = null } = {}) {
  const tour = getTour(db, departure.tourId);
  const bookings = db.bookings.filter((b) => b.departureId === departure.id && ["confirmed", "completed"].includes(b.status));
  const passengers = db.passengers.filter((p) => bookings.some((b) => b.id === p.bookingId));
  const assignments = db.assignments.filter((a) => a.departureId === departure.id);
  const guide = assignments.length ? db.guides.find((g) => g.id === assignments[0].guideId) : null;
  const vehicle = assignments.length ? db.vehicles.find((v) => v.id === assignments[0].vehicleId) : null;
  const rows = passengers.map((p, index) => {
    const booking = bookings.find((b) => b.id === p.bookingId);
    return `<tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(p.fullName)}</td>
      <td>${p.type === "adult" ? "NL" : p.type === "child" ? "TE" : "EB"}</td>
      <td>${p.gender === "male" ? "Nam" : p.gender === "female" ? "Nữ" : "Khác"}</td>
      <td>${p.dateOfBirth.split("-").reverse().join("/")}</td>
      <td>${escapeHtml(p.idNumber || p.passportNumber || "—")}</td>
      <td>${escapeHtml(booking.contactPhone)}</td>
      <td>${escapeHtml(p.specialRequest || "—")}</td>
      <td>${escapeHtml(booking.code)}</td>
    </tr>`;
  }).join("");
  const body = `
    <div class="brand">
      <div><h1>Manifest chuyến đi</h1><small>${escapeHtml(tour.name)} · ${departure.departureDate.split("-").reverse().join("/")}</small></div>
      <div style="text-align:right;font-size:12px" class="muted">
        Xuất lúc ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}<br>
        Người xuất: ${escapeHtml(exportedBy || "Hệ thống")}<br>
        ${fullDocuments ? "BẢN ĐẦY ĐỦ GIẤY TỜ" : "Bản che giấy tờ"}
      </div>
    </div>
    <div class="grid">
      <div class="box">
        <h3>Thông tin chuyến</h3>
        <div>Khởi hành: <strong>${departure.departureDate.split("-").reverse().join("/")}</strong> · ${escapeHtml(departure.meetingTime)}</div>
        <div>Điểm hẹn: ${escapeHtml(departure.meetingPoint)}</div>
        <div>Sức chứa: ${departure.seatsTaken}/${departure.capacity} · Tối thiểu: ${departure.minPaxToRun}</div>
        <div>Trạng thái: ${escapeHtml(departure.status)} ${departure.isGuaranteed ? "· Đảm bảo khởi hành" : ""}</div>
      </div>
      <div class="box">
        <h3>Điều hành</h3>
        <div>HDV: <strong>${escapeHtml(guide?.fullName || "Chưa gán")}</strong> ${guide ? `· ${escapeHtml(guide.phone)}` : ""}</div>
        <div>Xe: ${escapeHtml(vehicle?.name || "Chưa gán")} ${vehicle ? `· ${escapeHtml(vehicle.plate)}` : ""}</div>
        <div>Tổng khách: <strong>${passengers.length}</strong> (${bookings.length} đơn)</div>
        <div>Điện thoại khẩn cấp: 1900 6868</div>
      </div>
    </div>
    <h3>Danh sách khách</h3>
    <table>
      <thead><tr><th>#</th><th>Họ tên</th><th>Loại</th><th>Giới tính</th><th>Ngày sinh</th><th>Giấy tờ</th><th>SĐT</th><th>Yêu cầu đặc biệt</th><th>Mã đơn</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="9" class="muted">Chưa có khách nào trong chuyến.</td></tr>`}</tbody>
    </table>
    <p class="muted" style="font-size:12px">Tài liệu chứa dữ liệu cá nhân. Chỉ sử dụng cho điều hành chuyến. Việc xuất dữ liệu được ghi nhật ký theo quy định.</p>
  `;
  return page(`Manifest ${departure.departureDate}`, body);
}
