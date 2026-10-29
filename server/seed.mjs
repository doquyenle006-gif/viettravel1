import {
  addDays, bookingCode, dayNumber, hashPassword, nowIso, todayVN,
} from "./util.mjs";

const DEMO_PASSWORD = "Demo@1234";

const DESTINATIONS = [
  { name: "Vịnh Hạ Long", slug: "vinh-ha-long", region: "north", province: "Quảng Ninh", lat: 20.9101, lng: 107.1839, description: "Di sản thiên nhiên thế giới với hàng nghìn đảo đá vôi nhô lên giữa mặt nước xanh ngọc." },
  { name: "Sa Pa", slug: "sa-pa", region: "north", province: "Lào Cai", lat: 22.3364, lng: 103.8438, description: "Thị trấn trong mây, ruộng bậc thang và những bản làng của đồng bào vùng cao." },
  { name: "Đà Nẵng", slug: "da-nang", region: "central", province: "Đà Nẵng", lat: 16.0544, lng: 108.2022, description: "Thành phố biển hiện đại, cửa ngõ tới Hội An, Bà Nà và bán đảo Sơn Trà." },
  { name: "Hội An", slug: "hoi-an", region: "central", province: "Quảng Nam", lat: 15.8801, lng: 108.3380, description: "Phố cổ đèn lồng, những mái ngói rêu phong và dòng sông Hoài lấp lánh." },
  { name: "Nha Trang", slug: "nha-trang", region: "central", province: "Khánh Hòa", lat: 12.2388, lng: 109.1967, description: "Vịnh biển êm, đảo san hô và hải sản tươi rói quanh năm." },
  { name: "Phú Quốc", slug: "phu-quoc", region: "south", province: "Kiên Giang", lat: 10.2899, lng: 103.9840, description: "Đảo ngọc với bãi cát trắng, hoàng hôn và những khu nghỉ dưỡng ven biển." },
  { name: "Đà Lạt", slug: "da-lat", region: "central", province: "Lâm Đồng", lat: 11.9404, lng: 108.4583, description: "Thành phố cao nguyên mát lạnh, rừng thông, hồ nước và ngàn loài hoa." },
  { name: "Ninh Bình", slug: "ninh-binh", region: "north", province: "Ninh Bình", lat: 20.2506, lng: 105.9745, description: "Non nước hữu tình, hang động Tràng An và cố đô Hoa Lư." },
  { name: "Huế", slug: "hue", region: "central", province: "Thừa Thiên Huế", lat: 16.4637, lng: 107.5909, description: "Cố đô trầm mặc bên sông Hương, đại nội, lăng tẩm và ẩm thực cung đình." },
  { name: "Cần Thơ", slug: "can-tho", region: "south", province: "Cần Thơ", lat: 10.0452, lng: 105.7469, description: "Thủ phủ miền Tây, chợ nổi Cái Răng và những vườn trái cây trù phú." },
  { name: "Hà Giang", slug: "ha-giang", region: "north", province: "Hà Giang", lat: 22.8233, lng: 104.9836, description: "Cao nguyên đá Đồng Văn, đèo Mã Pí Lèng và vòng cung huyền thoại." },
  { name: "Quy Nhơn", slug: "quy-nhon", region: "central", province: "Bình Định", lat: 13.7829, lng: 109.2196, description: "Biển xanh hoang sơ, tháp Chăm cổ và những eo vịnh yên bình." },
];

const CATEGORIES = [
  { name: "Biển đảo", slug: "bien-dao", description: "Những hành trình ven biển và hải đảo." },
  { name: "Núi & trekking", slug: "nui-trekking", description: "Chinh phục núi cao, bản làng và cung đường đẹp." },
  { name: "Văn hoá - Di sản", slug: "van-hoa-di-san", description: "Di sản, phố cổ, làng nghề và ẩm thực bản địa." },
  { name: "Nghỉ dưỡng", slug: "nghi-duong", description: "Kỳ nghỉ chậm, resort và không gian thư giãn." },
  { name: "Khám phá", slug: "kham-pha", description: "Trải nghiệm mới lạ dành cho người ưa dịch chuyển." },
];

const TOUR_SEED = [
  {
    slug: "vinh-ha-long-hanh-trinh-di-san", name: "Vịnh Hạ Long — Hành trình di sản", dest: 0, cat: 2,
    days: 3, nights: 2, base: 3450000, durationLabel: "3N2Đ",
    summary: "Du thuyền qua vịnh di sản, kayak hang Luồn và đêm trên vịnh giữa muôn trùng đảo đá.",
    highlights: ["Du thuyền qua vịnh di sản", "Kayak hang Luồn", "Đêm trên vịnh", "Hải sản tươi tại làng chài"],
    dayTitles: ["Hà Nội — Bãi Cháy — lên du thuyền", "Vịnh Hạ Long — hang Luồn — đảo Ti Tốp", "Làng chài — về Hà Nội"],
    incl: ["Xe đưa đón Hà Nội", "Du thuyền 2 đêm", "Các bữa ăn theo chương trình", "Vé tham quan vịnh", "HDV suốt tuyến"],
  },
  {
    slug: "sapa-may-ngan-va-ruong-bac-thang", name: "Sa Pa — Mây ngàn và ruộng bậc thang", dest: 1, cat: 1,
    days: 4, nights: 3, base: 4290000, durationLabel: "4N3Đ",
    summary: "Trekking qua bản H'Mông, ngắm thung lũng Mường Hoa và chạm tay vào mây Fansipan.",
    highlights: ["Trekking Tả Van", "Cáp treo Fansipan", "Chợ tình Sa Pa", "Homestay bản làng"],
    dayTitles: ["Hà Nội — Sa Pa", "Trekking Y Linh Hồ", "Fansipan — thung lũng Mường Hoa", "Bản Cát Cát — về Hà Nội"],
    incl: ["Xe giường nằm khứ hồi", "Homestay 3 đêm", "Cáp treo Fansipan", "HDV bản địa"],
  },
  {
    slug: "da-nang-hoi-an-bien-va-pho-co", name: "Đà Nẵng — Hội An, biển và phố cổ", dest: 2, cat: 0,
    days: 4, nights: 3, base: 5150000, durationLabel: "4N3Đ",
    summary: "Bán đảo Sơn Trà, cầu Vàng và đêm phố cổ Hội An trong một hành trình miền Trung.",
    highlights: ["Bà Nà Hills — cầu Vàng", "Phố cổ Hội An", "Bãi biển Mỹ Khê", "Sông Hoài về đêm"],
    dayTitles: ["Đà Nẵng — Sơn Trà — Mỹ Khê", "Bà Nà Hills — cầu Vàng", "Hội An — phố cổ", "Hội An — Đà Nẵng"],
    incl: ["Khách sạn 3 đêm", "Xe đưa đón", "Vé Bà Nà Hills", "HDV"],
  },
  {
    slug: "nha-trang-vinh-xanh-va-hai-dao", name: "Nha Trang — Vịnh xanh và hải đảo", dest: 4, cat: 0,
    days: 3, nights: 2, base: 3990000, durationLabel: "3N2Đ",
    summary: "Lặn ngắm san hô, tiệc hải sản trên đảo và tắm bùn khoáng giữa thành phố biển.",
    highlights: ["Tour 3 đảo", "Lặn ngắm san hô", "Tắm bùn khoáng", "Chợ đêm Nha Trang"],
    dayTitles: ["Nha Trang — tắm bùn khoáng", "Tour 3 đảo — lặn san hô", "Nha Trang — tự do — về"],
    incl: ["Khách sạn 2 đêm", "Tour 3 đảo", "Lặn san hô", "HDV"],
  },
  {
    slug: "phu-quoc-nang-vang-bien-ngoc", name: "Phú Quốc — Nắng vàng, biển ngọc", dest: 5, cat: 3,
    days: 4, nights: 3, base: 7890000, durationLabel: "4N3Đ",
    summary: "Bãi Sao, hoàng hôn Nam đảo và resort ven biển cho một kỳ nghỉ trọn vẹn.",
    highlights: ["Bãi Sao", "Cáp treo Hòn Thơm", "Hoàng hôn Dinh Cậu", "Chợ đêm Phú Quốc"],
    dayTitles: ["Phú Quốc — nhận phòng — Dinh Cậu", "Bãi Sao — Hòn Thơm", "Làng chài — chợ đêm", "Tự do — về"],
    incl: ["Resort 3 đêm", "Cáp treo Hòn Thơm", "Xe đưa đón sân bay", "HDV"],
  },
  {
    slug: "da-lat-thanh-pho-cua-ngan-hoa", name: "Đà Lạt — Thành phố của ngàn hoa", dest: 6, cat: 3,
    days: 3, nights: 2, base: 2950000, durationLabel: "3N2Đ",
    summary: "Săn mây trên đỉnh Hòn Bồ, dạo hồ Tuyền Lâm và ngủ giữa rừng thông.",
    highlights: ["Săn mây Hòn Bồ", "Hồ Tuyền Lâm", "Vườn hoa thành phố", "Cà phê ven đồi"],
    dayTitles: ["Đà Lạt — hồ Tuyền Lâm", "Săn mây — thác Datanla", "Vườn hoa — về"],
    incl: ["Khách sạn 2 đêm", "Xe đưa đón", "Vé tham quan", "HDV"],
  },
  {
    slug: "ninh-binh-non-nuoc-huu-tinh", name: "Ninh Bình — Non nước hữu tình", dest: 7, cat: 2,
    days: 2, nights: 1, base: 1890000, durationLabel: "2N1Đ",
    summary: "Thuyền nan Tràng An, leo Hang Múa và cố đô Hoa Lư trong hai ngày thong thả.",
    highlights: ["Tràng An", "Hang Múa", "Cố đô Hoa Lư", "Ẩm thực dê núi"],
    dayTitles: ["Hà Nội — Tràng An — Hang Múa", "Hoa Lư — Tuyệt Tình Cốc — về"],
    incl: ["Xe đưa đón", "Khách sạn 1 đêm", "Thuyền Tràng An", "HDV"],
  },
  {
    slug: "hue-co-do-tram-mac", name: "Huế — Cố đô trầm mặc", dest: 8, cat: 2,
    days: 3, nights: 2, base: 3290000, durationLabel: "3N2Đ",
    summary: "Đại Nội, lăng Khải Định, chùa Thiên Mụ và ẩm thực cung đình bên sông Hương.",
    highlights: ["Đại Nội", "Lăng Khải Định", "Chùa Thiên Mụ", "Ca Huế trên sông Hương"],
    dayTitles: ["Huế — Đại Nội", "Lăng tẩm — Thiên Mụ", "Chợ Đông Ba — về"],
    incl: ["Khách sạn 2 đêm", "Vé tham quan", "Ca Huế", "HDV"],
  },
  {
    slug: "can-tho-cho-noi-mien-tay", name: "Cần Thơ — Chợ nổi miền Tây", dest: 9, cat: 2,
    days: 2, nights: 1, base: 1750000, durationLabel: "2N1Đ",
    summary: "Chợ nổi Cái Răng, vườn trái cây và một đêm bên bến Ninh Kiều.",
    highlights: ["Chợ nổi Cái Răng", "Vườn trái cây", "Bến Ninh Kiều", "Đờn ca tài tử"],
    dayTitles: ["Cần Thơ — Ninh Kiều", "Chợ nổi — vườn trái cây — về"],
    incl: ["Xe đưa đón", "Khách sạn 1 đêm", "Thuyền chợ nổi", "HDV"],
  },
  {
    slug: "ha-giang-vong-cung-da-huyen-thoai", name: "Hà Giang — Vòng cung đá huyền thoại", dest: 10, cat: 1,
    days: 4, nights: 3, base: 4650000, durationLabel: "4N3Đ",
    summary: "Đèo Mã Pí Lèng, sông Nho Quế và những bản làng trên cao nguyên đá.",
    highlights: ["Đèo Mã Pí Lèng", "Sông Nho Quế", "Dinh Vua Mèo", "Cột cờ Lũng Cú"],
    dayTitles: ["Hà Giang — Quản Bạ", "Đồng Văn — Mã Pí Lèng", "Lũng Cú — Mèo Vạc", "Về Hà Nội"],
    incl: ["Xe đưa đón", "Homestay 3 đêm", "Thuyền sông Nho Quế", "HDV"],
  },
  {
    slug: "quy-nhon-bien-xanh-hoang-so", name: "Quy Nhơn — Biển xanh hoang sơ", dest: 11, cat: 0,
    days: 3, nights: 2, base: 3390000, durationLabel: "3N2Đ",
    summary: "Eo Gió, Kỳ Co và tháp Chăm cổ — miền biển còn giữ nét nguyên sơ.",
    highlights: ["Eo Gió", "Kỳ Co", "Tháp Chăm", "Hải sản Nhơn Lý"],
    dayTitles: ["Quy Nhơn — Eo Gió", "Kỳ Co — Nhơn Lý", "Tháp Chăm — về"],
    incl: ["Khách sạn 2 đêm", "Xe đưa đón", "Vé tham quan", "HDV"],
  },
  {
    slug: "hoi-an-dem-pho-co", name: "Hội An — Đêm phố cổ", dest: 3, cat: 2,
    days: 3, nights: 2, base: 3150000, durationLabel: "3N2Đ",
    summary: "Đèn lồng, sông Hoài, làng rau Trà Quế và một lớp học nấu ăn đầy hương vị.",
    highlights: ["Phố cổ Hội An", "Làng rau Trà Quế", "Lớp nấu ăn", "Thả đèn hoa đăng"],
    dayTitles: ["Hội An — phố cổ", "Trà Quế — nấu ăn", "An Bàng — về"],
    incl: ["Khách sạn 2 đêm", "Lớp nấu ăn", "Xe đạp", "HDV"],
  },
];

function buildItinerary(tour, destination) {
  return tour.dayTitles.map((title, index) => ({
    dayNo: index + 1,
    title,
    content: `Ngày ${index + 1}: ${title}. Quý khách tập trung tại điểm hẹn, khởi hành cùng hướng dẫn viên VietTrails. Lịch trình được sắp xếp nhịp nhàng, có thời gian nghỉ ngơi và tự do khám phá ${destination.name}. Hướng dẫn viên sẽ thông tin chi tiết về văn hoá, ẩm thực và những điểm dừng chân địa phương.`,
    meals: index === 0 ? ["lunch", "dinner"] : index === tour.dayTitles.length - 1 ? ["breakfast", "lunch"] : ["breakfast", "lunch", "dinner"],
    accommodation: index === tour.dayTitles.length - 1 ? null : "Khách sạn/homestay 3 sao tại trung tâm",
    places: [destination.name, `${destination.province}`, tour.highlights[index % tour.highlights.length]],
  }));
}

function baseSettings() {
  return {
    "hold.hours_default": 24, "hold.hours_near": 6, "hold.hours_urgent": 2,
    "hold.min_payment_minutes": 30, "hold.max_extend_hours": 24,
    "deposit.default_percent": 30, "payment.balance_due_days": 7,
    "payment.full_required_days": 7, "payment.grace_hours": 12,
    "booking.max_pax_online": 10, "seat.infant_takes_seat": false,
    "departure.go_nogo_days": 7, "departure.cutoff_days": 2, "departure.min_lead_days": 1,
    "cancel.self_service_min_days": 4, "cancel.company_notice_days": 5,
    "change.max_times": 1, "credit.valid_months": 12,
    "refund.sla_days": 7, "refund.dual_approval_threshold": 20000000,
    "discount.sales_max_percent": 5, "price.min_total_after_discount": 0,
    "passenger.edit_cutoff_days": 3, "invoice.request_deadline_days": 7,
    "review.window_days": 60, "auth.max_failed_attempts": 5, "auth.lock_minutes": 15,
    "ticket.first_response_hours": 8, "notify.max_attempts": 5, "export.file_ttl_hours": 24,
    "hotline": "1900 6868", "support_email": "hotro@viettrails.vn",
    "bank.name": "Ngân hàng TMCP Kỹ thương Việt Nam (Techcombank)",
    "bank.bin": "970407",
    "bank.accountName": "CÔNG TY TNHH VIETTRAILS",
    "bank.accountNumber": "1903 6868 6868",
    "bank.branch": "Chi nhánh Hà Nội",
    "payment.vnpay_enabled": true, "payment.momo_enabled": true, "payment.zalopay_enabled": true,
    "payment.bank_transfer_enabled": true,
    "terms.version": "2026-01",
  };
}

export function createSeed() {
  const now = nowIso();
  const today = todayVN();
  let seq = 0;
  const next = () => ++seq;
  const ids = {};

  const db = {
    version: 1,
    createdAt: now,
    _seq: {},
    settings: {},
    cancellationPolicies: [],
    destinations: [],
    categories: [],
    tours: [],
    departures: [],
    users: [],
    sessions: [],
    authTokens: [],
    bookings: [],
    passengers: [],
    payments: [],
    refunds: [],
    changeRequests: [],
    bookingHistory: [],
    coupons: [],
    couponUsages: [],
    invoices: [],
    reviews: [],
    tickets: [],
    ticketMessages: [],
    guides: [],
    vehicles: [],
    suppliers: [],
    assignments: [],
    costs: [],
    incidents: [],
    notifications: [],
    outbox: [],
    auditLogs: [],
    contentPages: [],
    banners: [],
    credits: [],
    creditHistory: [],
    idempotency: [],
    webhookEvents: [],
    alerts: [],
    waitlist: [],
  };

  const setSeq = (key, value) => { db._seq[key] = value; };
  const push = (collection, record) => {
    const id = next();
    const row = { id, ...record };
    db[collection].push(row);
    return row;
  };
  const settingMeta = {
    "hold.hours_default": ["Giữ chỗ mặc định", "Giờ", "Thời gian giữ chỗ cho đơn chờ thanh toán"],
    "hold.hours_near": ["Giữ chỗ khi gần ngày đi", "Giờ", "Áp dụng khi còn 4–7 ngày tới ngày khởi hành"],
    "hold.hours_urgent": ["Giữ chỗ khi rất gần ngày đi", "Giờ", "Áp dụng khi còn ≤ 3 ngày"],
    "hold.min_payment_minutes": ["Thời gian tối thiểu khi thanh toán", "Phút", "Gia hạn giữ chỗ khi bắt đầu thanh toán"],
    "hold.max_extend_hours": ["Gia hạn giữ chỗ tối đa", "Giờ", "Một lần cho mỗi đơn"],
    "deposit.default_percent": ["Tỷ lệ cọc mặc định", "%", "Dùng khi tour không đặt riêng"],
    "payment.balance_due_days": ["Hạn thanh toán đủ trước ngày đi", "Ngày", ""],
    "payment.full_required_days": ["Bắt buộc trả toàn bộ", "Ngày", "Còn ≤ số ngày này thì không cho đặt cọc"],
    "payment.grace_hours": ["Ân hạn thanh toán", "Giờ", "Trước khi tự hủy đơn quá hạn"],
    "booking.max_pax_online": ["Số khách tối đa mỗi đơn online", "Khách", ""],
    "seat.infant_takes_seat": ["Em bé chiếm chỗ", "Đúng/Sai", ""],
    "departure.go_nogo_days": ["Mốc chốt đoàn", "Ngày", "Trước ngày khởi hành"],
    "departure.cutoff_days": ["Đóng bán trước ngày đi", "Ngày", ""],
    "departure.min_lead_days": ["Báo trước tối thiểu khi mở bán", "Ngày", ""],
    "cancel.self_service_min_days": ["Ngưỡng tự phục vụ khi hủy", "Ngày", "Khách tự hủy được duyệt ngay"],
    "cancel.company_notice_days": ["Báo trước khi công ty hủy chuyến", "Ngày", ""],
    "change.max_times": ["Số lần đổi ngày tối đa", "Lần", ""],
    "credit.valid_months": ["Hiệu lực bảo lưu", "Tháng", ""],
    "refund.sla_days": ["SLA hoàn tiền", "Ngày làm việc", ""],
    "refund.dual_approval_threshold": ["Ngưỡng cần hai người duyệt", "VND", ""],
    "discount.sales_max_percent": ["Hạn mức giảm giá của sales", "%", ""],
    "price.min_total_after_discount": ["Tổng tối thiểu sau giảm", "VND", ""],
    "passenger.edit_cutoff_days": ["Hạn khách tự sửa hành khách", "Ngày", "Trước ngày khởi hành"],
    "invoice.request_deadline_days": ["Hạn yêu cầu hóa đơn", "Ngày", "Sau khi chuyến kết thúc"],
    "review.window_days": ["Hạn gửi đánh giá", "Ngày", "Sau khi chuyến kết thúc"],
    "auth.max_failed_attempts": ["Số lần đăng nhập sai tối đa", "Lần", ""],
    "auth.lock_minutes": ["Thời gian khóa tạm", "Phút", ""],
    "ticket.first_response_hours": ["SLA phản hồi đầu tiên", "Giờ làm việc", ""],
    "notify.max_attempts": ["Số lần thử gửi thông báo", "Lần", ""],
    "export.file_ttl_hours": ["Thời gian sống của tệp xuất", "Giờ", ""],
    "hotline": ["Hotline", "", "Hiển thị trên website"],
    "support_email": ["Email hỗ trợ", "", ""],
    "bank.name": ["Ngân hàng nhận chuyển khoản", "", ""],
    "bank.bin": ["Mã BIN ngân hàng (VietQR)", "", ""],
    "bank.accountName": ["Tên chủ tài khoản", "", ""],
    "bank.accountNumber": ["Số tài khoản", "", ""],
    "bank.branch": ["Chi nhánh", "", ""],
    "payment.vnpay_enabled": ["Bật VNPay", "Đúng/Sai", ""],
    "payment.momo_enabled": ["Bật MoMo", "Đúng/Sai", ""],
    "payment.zalopay_enabled": ["Bật ZaloPay", "Đúng/Sai", ""],
    "payment.bank_transfer_enabled": ["Bật chuyển khoản", "Đúng/Sai", ""],
    "terms.version": ["Phiên bản điều khoản", "", "Khách phải đồng ý phiên bản hiện tại"],
  };
  for (const [key, value] of Object.entries(baseSettings())) {
    const meta = settingMeta[key] || ["Tham số hệ thống", "", ""];
    db.settings[key] = {
      key, value, label: meta[0], unit: meta[1], description: meta[2],
      group: key.split(".")[0], updatedAt: now, updatedBy: null,
    };
  }

  // Cancellation policies
  db.cancellationPolicies.push({
    id: next(), code: "STANDARD-DOMESTIC", name: "Chính sách hủy tour nội địa tiêu chuẩn",
    description: "Áp dụng cho tour ghép đoàn nội địa. Tính theo số ngày còn lại tới ngày khởi hành.",
    tiers: [
      { minDaysBefore: 15, maxDaysBefore: null, feePercent: 10 },
      { minDaysBefore: 8, maxDaysBefore: 14, feePercent: 30 },
      { minDaysBefore: 4, maxDaysBefore: 7, feePercent: 50 },
      { minDaysBefore: 1, maxDaysBefore: 3, feePercent: 80 },
      { minDaysBefore: 0, maxDaysBefore: 0, feePercent: 100 },
    ],
    active: true, createdAt: now,
  });
  db.cancellationPolicies.push({
    id: next(), code: "FLEXIBLE", name: "Chính sách linh hoạt",
    description: "Áp dụng cho một số tour nghỉ dưỡng theo thoả thuận.",
    tiers: [
      { minDaysBefore: 10, maxDaysBefore: null, feePercent: 0 },
      { minDaysBefore: 5, maxDaysBefore: 9, feePercent: 20 },
      { minDaysBefore: 0, maxDaysBefore: 4, feePercent: 50 },
    ],
    active: true, createdAt: now,
  });
  const policyId = db.cancellationPolicies[0].id;
  setSeq("cancellationPolicies", seq);

  for (const d of DESTINATIONS) {
    db.destinations.push({ id: next(), ...d, image: null, active: true, createdAt: now });
  }
  for (const c of CATEGORIES) {
    db.categories.push({ id: next(), ...c, active: true, createdAt: now });
  }
  for (const t of TOUR_SEED) {
    const dest = db.destinations[t.dest];
    const seeds = ["halong", "sapa", "danang", "hoian", "nhatrang", "phuquoc", "dalat", "ninhbinh", "hue", "cantho", "hagiang", "quynhon"];
    const cover = seeds[t.dest] || "vietnam";
    db.tours.push({
      id: next(), code: `T-${t.slug.slice(0, 6).toUpperCase()}`, name: t.name, slug: t.slug,
      destinationId: dest.id, categoryId: db.categories[t.cat].id,
      durationDays: t.days, durationNights: t.nights,
      summary: t.summary,
      description: `${t.summary} Hành trình do VietTrails thiết kế cho nhóm nhỏ, khởi hành theo lịch cố định, có hướng dẫn viên người Việt am hiểu địa phương. Chúng tôi chọn khách sạn trung tâm, bữa ăn bản địa và thời gian tự do hợp lý để mỗi ngày đều đáng nhớ.`,
      highlights: t.highlights,
      itinerary: buildItinerary(t, dest),
      inclusions: [...t.incl, "Bảo hiểm du lịch theo chương trình", "Nước uống trên xe"],
      exclusions: ["Chi phí cá nhân", "Đồ uống có cồn", "Phụ thu phòng đơn", "Tiền tip hướng dẫn viên"],
      notes: "Giá đã bao gồm thuế. Trẻ em dưới 2 tuổi miễn phí nếu không chiếm chỗ. Vui lòng mang giấy tờ tuỳ thân khi khởi hành.",
      meetingPointDefault: "Văn phòng VietTrails — 18 Lý Thường Kiệt, Hoàn Kiếm, Hà Nội",
      minPax: 8, maxPax: 30, ageInfantMax: 2, ageChildMax: 12,
      requiresIdDocument: false, requiresPassport: false,
      depositPercent: 30, cancellationPolicyId: policyId,
      status: "published", seoTitle: t.name, seoDescription: t.summary,
      cover: `art:${cover}`, images: [],
      ratingAvg: 0, ratingCount: 0, version: 1, createdAt: now, updatedAt: now,
    });
  }
  setSeq("destinations", db.destinations.length ? db.destinations.at(-1).id : 0);
  setSeq("categories", db.categories.length ? db.categories.at(-1).id : 0);
  setSeq("tours", db.tours.length ? db.tours.at(-1).id : 0);

  // Departures
  const offsetSets = [4, 9, 15, 21, 28, 35, 43, 51, 60, 70, 80, 92, 105, 120, 135, 150];
  for (const [ti, tour] of db.tours.entries()) {
    const seed = TOUR_SEED[ti];
    for (const [oi, offset] of offsetSets.entries()) {
      const date = addDays(today, offset);
      const capacity = 18 + ((ti * 3 + oi * 2) % 14);
      let seatsTaken = 0;
      if (oi === 0) seatsTaken = Math.max(0, capacity - (ti % 3 === 0 ? 2 : 5));
      else if (oi === 2 && ti % 4 === 0) seatsTaken = capacity;
      else seatsTaken = (ti * 2 + oi * 3) % 7;
      const status = seatsTaken >= capacity ? "full" : "open";
      const adult = Math.round(seed.base / 1000) * 1000;
      db.departures.push({
        id: next(), tourId: tour.id, departureDate: date, returnDate: addDays(date, tour.durationDays - 1),
        capacity, seatsTaken, minPaxToRun: tour.minPax,
        priceAdult: adult, priceChild: Math.round(adult * 0.7 / 1000) * 1000,
        priceInfant: Math.round(adult * 0.3 / 1000) * 1000,
        singleSupplement: Math.round(adult * 0.25 / 1000) * 1000,
        bookingCutoffAt: new Date(dayNumber(date) * 86400000 - 2 * 86400000 - 7 * 3600000).toISOString(),
        balanceDueDate: addDays(date, -7), goNogoDate: addDays(date, -7),
        meetingPoint: tour.meetingPointDefault, meetingTime: "06:30",
        isGuaranteed: false, status, cancelReason: null, version: 1, createdAt: now,
      });
    }
  }
  setSeq("departures", db.departures.length ? db.departures.at(-1).id : 0);

  // Users
  const staff = [
    ["Nguyễn Minh Quân", "admin@viettrails.vn", "super_admin", "0901234567"],
    ["Trần Thu Hà", "manager@viettrails.vn", "tour_manager", "0901234568"],
    ["Lê Hoàng Lan", "sales@viettrails.vn", "sales", "0901234569"],
    ["Phạm Đức Anh", "operator@viettrails.vn", "operator", "0901234570"],
    ["Vũ Thanh Mai", "accountant@viettrails.vn", "accountant", "0901234571"],
    ["Đỗ Khánh Linh", "content@viettrails.vn", "content_editor", "0901234572"],
    ["Hoàng Văn Nam", "guide@viettrails.vn", "guide", "0901234573"],
  ];
  for (const [fullName, email, role, phone] of staff) {
    db.users.push({
      id: next(), fullName, email, phone, passwordHash: hashPassword(DEMO_PASSWORD),
      roles: [role], emailVerifiedAt: now, status: "active", marketingConsent: false,
      failedLoginCount: 0, lockedUntil: null, mfaEnabled: false, createdAt: now, termsVersion: "2026-01",
    });
  }
  const customer = {
    id: next(), fullName: "Nguyễn An Nhiên", email: "customer@viettrails.vn", phone: "0912345678",
    passwordHash: hashPassword(DEMO_PASSWORD), roles: ["customer"], emailVerifiedAt: now,
    status: "active", marketingConsent: true, failedLoginCount: 0, lockedUntil: null,
    mfaEnabled: false, createdAt: now, termsVersion: "2026-01",
  };
  db.users.push(customer);
  db.users.push({
    id: next(), fullName: "Trần Chưa Xác Minh", email: "newbie@viettrails.vn", phone: "0987654321",
    passwordHash: hashPassword(DEMO_PASSWORD), roles: ["customer"], emailVerifiedAt: null,
    status: "active", marketingConsent: false, failedLoginCount: 0, lockedUntil: null,
    mfaEnabled: false, createdAt: now, termsVersion: "2026-01",
  });
  setSeq("users", db.users.length ? db.users.at(-1).id : 0);

  // Reviews users (reuse customer & staff)
  const reviewComments = [
    "Hướng dẫn viên chu đáo, lịch trình vừa phải. Bữa ăn rất ngon và phong cảnh đẹp hơn mong đợi.",
    "Khách sạn sạch, vị trí thuận tiện. Gia đình tôi có trẻ nhỏ và được hỗ trợ rất nhiều.",
    "Chuyến đi đúng giờ, xe thoải mái. Điểm trừ nhỏ là thời gian tự do hơi ít, nhưng tổng thể rất đáng tiền.",
    "Một trải nghiệm đáng nhớ, đặc biệt là phần trekking và homestay bản làng. Sẽ quay lại VietTrails.",
    "Dịch vụ ổn, thông tin trước chuyến rõ ràng. Nhân viên tư vấn phản hồi nhanh.",
    "Phú Quốc đẹp ngoài sức tưởng tượng. Resort tốt, hướng dẫn viên thân thiện.",
  ];

  const policy = db.cancellationPolicies[0];
  const calcFee = (total, days) => {
    const tier = policy.tiers.find((t) => days >= t.minDaysBefore && (t.maxDaysBefore === null || days <= t.maxDaysBefore)) || policy.tiers.at(-1);
    return Math.round((total * tier.feePercent) / 100);
  };

  const makePassengers = (bookingId, names, baseDob) => {
    names.forEach(([fullName, gender, type], i) => {
      const dob = type === "adult" ? "1988-05-12" : type === "child" ? "2017-08-20" : "2025-02-10";
      db.passengers.push({
        id: next(), bookingId, fullName, gender, dateOfBirth: dob, type,
        idNumber: null, passportNumber: null, nationality: "Việt Nam",
        specialRequest: i === 0 ? "Ăn chay" : null, isLead: i === 0,
      });
    });
  };

  const addHistory = (bookingId, fromStatus, toStatus, note, actorType = "system", actorId = null, at = now) => {
    db.bookingHistory.push({
      id: next(), bookingId, fromStatus, toStatus, actorId, actorType, note, createdAt: at,
    });
  };

  const createPastReviewBooking = (tourIndex, rating, commentIndex, daysAgo) => {
    const tour = db.tours[tourIndex];
    const seed = TOUR_SEED[tourIndex];
    const date = addDays(today, -daysAgo);
    const dep = {
      id: next(), tourId: tour.id, departureDate: date, returnDate: addDays(date, tour.durationDays - 1),
      capacity: 24, seatsTaken: 18, minPaxToRun: tour.minPax,
      priceAdult: seed.base, priceChild: Math.round(seed.base * 0.7 / 1000) * 1000,
      priceInfant: Math.round(seed.base * 0.3 / 1000) * 1000,
      singleSupplement: Math.round(seed.base * 0.25 / 1000) * 1000,
      bookingCutoffAt: new Date(dayNumber(date) * 86400000 - 9 * 86400000).toISOString(),
      balanceDueDate: addDays(date, -7), goNogoDate: addDays(date, -7),
      meetingPoint: tour.meetingPointDefault, meetingTime: "06:30", isGuaranteed: true,
      status: "completed", cancelReason: null, version: 1, createdAt: now,
    };
    db.departures.push(dep);
    const adults = 2;
    const total = adults * dep.priceAdult;
    const code = bookingCode(new Date(date));
    const booking = {
      id: next(), code, userId: customer.id, departureId: dep.id,
      contactName: customer.fullName, contactEmail: customer.email, contactPhone: customer.phone,
      adults, children: 0, infants: 0, singles: 0,
      priceSnapshot: [{ type: "adult", qty: adults, unitPrice: dep.priceAdult, amount: total }],
      subtotal: total, discountTotal: 0, couponCode: null, totalPrice: total,
      depositRequired: Math.ceil((total * 0.3) / 1000) * 1000, paidAmount: total, refundedAmount: 0,
      balanceDueDate: dep.balanceDueDate, status: "completed", paymentStatus: "paid",
      holdExpiresAt: null, channel: "web", createdByUserId: customer.id,
      customerNote: null, internalNote: null, cancelBy: null, cancelReasonCode: null,
      cancelledAt: null, termsVersion: "2026-01", changeCount: 0, version: 1,
      createdAt: new Date(dayNumber(date) * 86400000 - 20 * 86400000).toISOString(),
      updatedAt: now,
    };
    db.bookings.push(booking);
    makePassengers(booking.id, [["Nguyễn An Nhiên", "female", "adult"], ["Nguyễn Bảo Nam", "male", "adult"]], "1988-05-12");
    const payment = {
      id: next(), bookingId: booking.id, purpose: "full", method: "vnpay", provider: "vnpay",
      amount: total, currency: "VND", status: "succeeded", providerTxnId: `VNP-${next()}`,
      merchantRef: `VT-${booking.code}-PAST`, idempotencyKey: null, paidAt: booking.createdAt,
      proofUrl: null, confirmedBy: null, note: null, rawPayload: null, createdAt: booking.createdAt,
    };
    db.payments.push(payment);
    addHistory(booking.id, null, "pending", "Khách tạo đơn trên website", "customer", customer.id, booking.createdAt);
    addHistory(booking.id, "pending", "confirmed", "Thanh toán toàn bộ đã được xác nhận", "system", null, booking.createdAt);
    addHistory(booking.id, "confirmed", "completed", "Chuyến đã kết thúc", "system", null, now);
    const review = {
      id: next(), bookingId: booking.id, tourId: tour.id, userId: customer.id, rating,
      comment: reviewComments[commentIndex % reviewComments.length],
      status: "approved", reply: commentIndex % 2 === 0 ? "Cảm ơn bạn đã tin tưởng VietTrails. Hẹn gặp lại trên hành trình tới!" : null,
      createdAt: now, approvedAt: now, approvedBy: null,
    };
    db.reviews.push(review);
    return booking;
  };

  // Approved reviews for first six tours (real completed bookings)
  const reviewRatings = [5, 5, 4, 5, 4, 5];
  for (let i = 0; i < 6; i++) createPastReviewBooking(i, reviewRatings[i], i, 26 + i * 2);

  // A completed booking without review so the customer can test the review flow
  createPastReviewBooking(6, 5, 5, 18);
  db.reviews.pop(); // remove the seeded review for this booking

  // Recompute ratings from approved reviews
  for (const tour of db.tours) {
    const reviews = db.reviews.filter((r) => r.tourId === tour.id && r.status === "approved");
    tour.ratingCount = reviews.length;
    tour.ratingAvg = reviews.length ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10 : 0;
  }

  const addBookingWithPayment = (tourIndex, departureOffset, { adults, children = 0, infants = 0, paidPercent, status, paymentMethod = "vnpay", cancel = null, holdHours = 20 }) => {
    const tour = db.tours[tourIndex];
    const dep = db.departures.find((d) => d.tourId === tour.id && d.status === "open" && d.departureDate === addDays(today, departureOffset));
    if (!dep) return null;
    const subtotal = adults * dep.priceAdult + children * dep.priceChild + infants * dep.priceInfant;
    const total = subtotal;
    const deposit = Math.ceil((total * (tour.depositPercent / 100)) / 1000) * 1000;
    const paid = Math.round((total * paidPercent) / 100 / 1000) * 1000;
    const code = bookingCode();
    const booking = {
      id: next(), code, userId: customer.id, departureId: dep.id,
      contactName: customer.fullName, contactEmail: customer.email, contactPhone: customer.phone,
      adults, children, infants, singles: 0,
      priceSnapshot: [
        ...(adults ? [{ type: "adult", qty: adults, unitPrice: dep.priceAdult, amount: adults * dep.priceAdult }] : []),
        ...(children ? [{ type: "child", qty: children, unitPrice: dep.priceChild, amount: children * dep.priceChild }] : []),
        ...(infants ? [{ type: "infant", qty: infants, unitPrice: dep.priceInfant, amount: infants * dep.priceInfant }] : []),
      ],
      subtotal, discountTotal: 0, couponCode: null, totalPrice: total, depositRequired: deposit,
      paidAmount: paid, refundedAmount: 0, balanceDueDate: dep.balanceDueDate,
      status, paymentStatus: paid >= total ? "paid" : paid > 0 ? "deposit_paid" : "unpaid",
      holdExpiresAt: status === "pending" ? new Date(Date.now() + holdHours * 3600000).toISOString() : null,
      channel: "web", createdByUserId: customer.id, customerNote: null, internalNote: null,
      cancelBy: null, cancelReasonCode: null, cancelledAt: null, termsVersion: "2026-01",
      changeCount: 0, version: 1, createdAt: now, updatedAt: now,
    };
    if (cancel) {
      booking.status = "cancelled";
      booking.cancelBy = "customer";
      booking.cancelReasonCode = cancel.reason;
      booking.cancelledAt = now;
      booking.refundedAmount = cancel.refunded || 0;
      booking.paymentStatus = cancel.refunded >= paid ? "refunded" : cancel.refunded > 0 ? "partially_refunded" : booking.paymentStatus;
    }
    db.bookings.push(booking);
    dep.seatsTaken += adults + children + (infants > adults ? infants - adults : 0) + (infants && !db.settings["seat.infant_takes_seat"].value ? 0 : 0);
    if (dep.seatsTaken >= dep.capacity) dep.status = "full";
    const names = [];
    for (let i = 0; i < adults; i++) names.push([i === 0 ? customer.fullName : `Nguyễn Văn ${["Bình", "Cường", "Dũng"][i % 3]}`, i === 0 ? "female" : "male", "adult"]);
    for (let i = 0; i < children; i++) names.push([`Nguyễn Bé ${["Na", "Bin", "Tí"][i % 3]}`, "other", "child"]);
    for (let i = 0; i < infants; i++) names.push([`Nguyễn Em ${["Bông", "Mít"][i % 2]}`, "other", "infant"]);
    makePassengers(booking.id, names);
    if (paid > 0) {
      db.payments.push({
        id: next(), bookingId: booking.id, purpose: paid >= total ? "full" : "deposit",
        method: paymentMethod, provider: paymentMethod, amount: paid, currency: "VND", status: "succeeded",
        providerTxnId: `TXN-${next()}`, merchantRef: `VT-${booking.code}-1`,
        idempotencyKey: null, paidAt: now, proofUrl: null, confirmedBy: null, note: null,
        rawPayload: null, createdAt: now,
      });
    }
    addHistory(booking.id, null, "pending", "Khách tạo đơn trên website", "customer", customer.id, now);
    if (status !== "pending") addHistory(booking.id, "pending", "confirmed", "Đã nhận cọc", "system", null, now);
    if (cancel) {
      addHistory(booking.id, "confirmed", "cancelled", `Khách hủy — ${cancel.reason}`, "customer", customer.id, now);
      const fee = calcFee(total, cancel.days);
      const refundAmount = Math.max(0, paid - fee);
      if (refundAmount > 0) {
        db.refunds.push({
          id: next(), bookingId: booking.id, paymentId: db.payments.find((p) => p.bookingId === booking.id)?.id || null,
          amount: refundAmount, type: "cash_back", reasonCode: cancel.reason,
          policyApplied: `Hủy trước ${cancel.days} ngày — phí ${Math.round((fee / total) * 100)}%`,
          status: "completed", requestedBy: customer.id, approvedBy: 1, processedAt: now,
          providerRefundId: `RF-${next()}`, note: null, createdAt: now, updatedAt: now,
        });
      }
    }
    return booking;
  };

  addBookingWithPayment(2, 21, { adults: 2, children: 1, paidPercent: 30, status: "confirmed" });
  addBookingWithPayment(3, 9, { adults: 2, paidPercent: 0, status: "pending" });
  addBookingWithPayment(4, 28, { adults: 2, paidPercent: 100, status: "confirmed", cancel: { reason: "customer_request", days: 10, refunded: 0 } });
  addBookingWithPayment(5, 43, { adults: 1, paidPercent: 100, status: "confirmed" });

  // Complete refund for the cancelled sample booking
  const cancelled = db.bookings.find((b) => b.status === "cancelled");
  if (cancelled) {
    const paid = cancelled.paidAmount;
    const fee = calcFee(cancelled.totalPrice, 10);
    cancelled.refundedAmount = paid - fee;
    cancelled.paymentStatus = "partially_refunded";
    const refund = db.refunds.find((r) => r.bookingId === cancelled.id);
    if (refund) refund.amount = paid - fee;
  }

  // Coupons
  const couponSeeds = [
    ["SUMMER10", "Ưu đãi hè 10%", "percent", 10, 500000, 2000000, addDays(today, -30), addDays(today, 60), 100, 2],
    ["EARLY300", "Đặt sớm giảm 300.000đ", "fixed", 300000, null, 3000000, addDays(today, -10), addDays(today, 90), 50, 1],
    ["HALONG15", "Hạ Long 15%", "percent", 15, 800000, 0, addDays(today, -5), addDays(today, 120), 30, 1],
    ["OLD10", "Mã đã hết hạn", "percent", 10, 300000, 0, addDays(today, -90), addDays(today, -30), 20, 1],
    ["HETLUOT", "Mã đã hết lượt", "fixed", 200000, null, 0, addDays(today, -10), addDays(today, 30), 1, 1],
  ];
  for (const [code, name, type, value, maxDiscount, minOrder, validFrom, validTo, usageLimit, perUserLimit] of couponSeeds) {
    db.coupons.push({
      id: next(), code, name, type, value, maxDiscount, minOrder,
      validFrom, validTo, usageLimit, perUserLimit, usedCount: code === "HETLUOT" ? 1 : 0,
      appliesTo: code === "HALONG15" ? { type: "tour", tourIds: [db.tours[0].id] } : { type: "all" },
      active: true, newCustomersOnly: false, createdAt: now,
    });
  }

  // Tickets / inquiries
  db.tickets.push({
    id: next(), code: `TK-${String(seq).padStart(4, "0")}`, userId: customer.id,
    subject: "Hỏi về hành lý mang theo khi trekking Sa Pa",
    message: "Chào VietTrails, tôi đi tour Sa Pa 4N3Đ vào tháng sau. Có cần mang giày trekking riêng không?",
    bookingId: null, type: "support", status: "open", priority: "normal", assignedTo: 3,
    slaDueAt: new Date(Date.now() + 8 * 3600000).toISOString(), createdAt: now, updatedAt: now,
  });
  db.ticketMessages.push({
    id: next(), ticketId: db.tickets[0].id, userId: customer.id, actorType: "customer",
    message: "Chào VietTrails, tôi đi tour Sa Pa 4N3Đ vào tháng sau. Có cần mang giày trekking riêng không?",
    createdAt: now,
  });
  db.tickets.push({
    id: next(), code: `INQ-${String(seq).padStart(4, "0")}`, userId: null, fullName: "Lê Thu Trang",
    email: "thutrang@example.com", phone: "0933111222",
    subject: "Yêu cầu tour riêng cho 20 người",
    message: "Công ty chúng tôi muốn tổ chức team building tại Đà Nẵng — Hội An cho 20 người, dự kiến tháng 12. Nhờ VietTrails báo giá.",
    bookingId: null, type: "custom_tour", status: "open", priority: "high", assignedTo: 3,
    slaDueAt: new Date(Date.now() + 4 * 3600000).toISOString(), createdAt: now, updatedAt: now,
  });
  db.ticketMessages.push({
    id: next(), ticketId: db.tickets[1].id, userId: null, actorType: "customer",
    message: "Công ty chúng tôi muốn tổ chức team building tại Đà Nẵng — Hội An cho 20 người, dự kiến tháng 12. Nhờ VietTrails báo giá.",
    createdAt: now,
  });

  // Resources
  const guides = [
    ["Nguyễn Thị Hồng", "0909123456", "Tiếng Việt, Tiếng Anh", "Miền Bắc"],
    ["Trần Quốc Bảo", "0909123457", "Tiếng Việt, Tiếng Pháp", "Miền Trung"],
    ["Lâm Thanh Tùng", "0909123458", "Tiếng Việt, Tiếng Anh", "Miền Nam"],
  ];
  for (const [fullName, phone, languages, region] of guides) {
    db.guides.push({ id: next(), fullName, phone, languages, region, status: "active", note: null, createdAt: now });
  }
  db.vehicles.push(
    { id: next(), name: "Ford Transit 16 chỗ", plate: "29B-123.45", seats: 16, driverName: "Nguyễn Văn Hùng", driverPhone: "0911222333", status: "active", note: null, createdAt: now },
    { id: next(), name: "Hyundai County 29 chỗ", plate: "29F-678.90", seats: 29, driverName: "Trần Minh Sơn", driverPhone: "0911222334", status: "active", note: null, createdAt: now },
  );
  db.suppliers.push(
    { id: next(), name: "Khách sạn Hạ Long Pearl", category: "hotel", contactName: "Ms. Thu", phone: "0203388888", email: "booking@halongpearl.vn", address: "Bãi Cháy, Hạ Long", note: "Khách sạn 4 sao", status: "active", createdAt: now },
    { id: next(), name: "Nhà hàng Biển Xanh", category: "restaurant", contactName: "Mr. Hải", phone: "0203399999", email: "info@bienxanh.vn", address: "Hòn Gai, Hạ Long", note: "Hải sản", status: "active", createdAt: now },
  );
  const guideUser = db.users.find((u) => u.email === "guide@viettrails.vn");
  if (guideUser && db.guides[0]) {
    db.guides[0].userId = guideUser.id;
    const guidedDeparture = db.departures.find((d) => d.tourId === db.tours[2].id && d.departureDate === addDays(today, 21));
    if (guidedDeparture) {
      db.assignments.push({
        id: next(), departureId: guidedDeparture.id, guideId: db.guides[0].id,
        vehicleId: db.vehicles[0].id, note: "Phân công mẫu cho tài khoản hướng dẫn viên", createdAt: now,
      });
    }
  }

  // Content
  db.contentPages.push(
    {
      id: next(), slug: "dieu-khoan", title: "Điều khoản sử dụng và hợp đồng lữ hành",
      body: "<h2>1. Phạm vi áp dụng</h2><p>Điều khoản này áp dụng cho khách hàng đặt tour trực tuyến và tại quầy của VietTrails.</p><h2>2. Xác nhận đặt tour</h2><p>Đơn hàng được xác nhận khi khách thanh toán đủ tiền cọc theo quy định hoặc có xác nhận bằng văn bản từ nhân viên VietTrails.</p><h2>3. Trách nhiệm của hai bên</h2><p>VietTrails có trách nhiệm cung cấp dịch vụ đúng chương trình. Khách hàng có trách nhiệm cung cấp thông tin chính xác và tuân thủ pháp luật tại điểm đến.</p>",
      updatedAt: now,
    },
    {
      id: next(), slug: "chinh-sach-huy", title: "Chính sách hủy và hoàn tiền",
      body: "<h2>Bảng phí hủy tour nội địa</h2><table><thead><tr><th>Thời điểm hủy</th><th>Phí hủy</th></tr></thead><tbody><tr><td>Từ 15 ngày trước khởi hành</td><td>10%</td></tr><tr><td>8–14 ngày</td><td>30%</td></tr><tr><td>4–7 ngày</td><td>50%</td></tr><tr><td>1–3 ngày</td><td>80%</td></tr><tr><td>Ngày khởi hành / no-show</td><td>100%</td></tr></tbody></table><p>Phí hủy không vượt quá số tiền đã thanh toán. Hoàn tiền về đúng phương thức đã thanh toán, trong tối đa 7 ngày làm việc.</p><p>Khi VietTrails hủy chuyến vì không đủ khách hoặc bất khả kháng, khách được hoàn 100%, chuyển lịch miễn phí hoặc bảo lưu theo thoả thuận.</p>",
      updatedAt: now,
    },
    {
      id: next(), slug: "thanh-toan", title: "Hướng dẫn thanh toán",
      body: "<h2>Đặt cọc và thanh toán phần còn lại</h2><p>Khách có thể đặt cọc 30% giá trị đơn (trừ trường hợp chuyến khởi hành trong vòng 7 ngày, khi đó cần thanh toán toàn bộ). Phần còn lại thanh toán trước hạn ghi trên đơn.</p><h2>Chuyển khoản</h2><p>Nội dung chuyển khoản là mã đơn. Sau khi chuyển, khách tải ảnh chứng từ để kế toán đối chiếu.</p><h2>Cổng trực tuyến</h2><p>Hệ thống hỗ trợ VNPay, MoMo và ZaloPay ở môi trường sandbox cho bản demo này.</p>",
      updatedAt: now,
    },
    {
      id: next(), slug: "quyen-rieng-tu", title: "Chính sách quyền riêng tư",
      body: "<p>VietTrails chỉ thu thập dữ liệu cần thiết để phục vụ đặt tour, thanh toán và điều hành chuyến. Số giấy tờ được che khi hiển thị và chỉ nhân sự có quyền mới xem đầy đủ, mỗi lần xem đều được ghi nhật ký.</p><p>Bạn có thể yêu cầu cập nhật hoặc xoá dữ liệu cá nhân; yêu cầu xoá sẽ được xử lý sau khi hoàn tất nghĩa vụ lưu trữ tài chính.</p>",
      updatedAt: now,
    },
  );
  db.banners.push(
    { id: next(), title: "Hành trình Việt, trọn vẹn từng khoảnh khắc", subtitle: "Tour trọn gói, lịch khởi hành linh hoạt, đồng hành cùng hướng dẫn viên bản địa.", image: "art:halong", ctaLabel: "Khám phá tour", ctaHref: "/tours", active: true, position: 1 },
    { id: next(), title: "Đặt sớm — chọn chỗ đẹp", subtitle: "Ưu đãi cho các chuyến khởi hành tháng tới, số chỗ có hạn.", image: "art:sapa", ctaLabel: "Xem ưu đãi", ctaHref: "/tours?sort=price_asc", active: true, position: 2 },
    { id: next(), title: "Phú Quốc gọi tên bạn", subtitle: "Resort ven biển, cáp treo Hòn Thơm và hoàng hôn Nam đảo.", image: "art:phuquoc", ctaLabel: "Xem tour Phú Quốc", ctaHref: "/tours/phu-quoc-nang-vang-bien-ngoc", active: true, position: 3 },
  );

  // Audit seed entry
  db.auditLogs.push({
    id: next(), actorId: 1, actorRole: "super_admin", action: "seed.create",
    entity: "system", entityId: null, before: null, after: { message: "Khởi tạo dữ liệu mẫu VietTrails" },
    ip: "127.0.0.1", userAgent: "seed-script", createdAt: now,
  });

  db._seq = {
    destinations: db.destinations.length ? db.destinations.at(-1).id : 0,
    categories: db.categories.length ? db.categories.at(-1).id : 0,
    tours: db.tours.length ? db.tours.at(-1).id : 0,
    departures: db.departures.length ? db.departures.at(-1).id : 0,
    users: db.users.length ? db.users.at(-1).id : 0,
    cancellationPolicies: db.cancellationPolicies.length ? db.cancellationPolicies.at(-1).id : 0,
  };
  // Id sequence for every collection must be at least the max existing id
  for (const key of Object.keys(db)) {
    if (!Array.isArray(db[key])) continue;
    const max = db[key].reduce((m, row) => Math.max(m, Number(row.id) || 0), 0);
    db._seq[key] = Math.max(db._seq[key] || 0, max);
  }
  return db;
}

