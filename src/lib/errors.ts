export const ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: "Vui lòng kiểm tra lại các trường được đánh dấu.",
  UNAUTHENTICATED: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  NOT_FOUND: "Không tìm thấy nội dung bạn yêu cầu.",
  EMAIL_TAKEN: "Email này đã được đăng ký. Bạn thử đăng nhập nhé.",
  EMAIL_NOT_VERIFIED: "Vui lòng xác minh email trước khi đặt tour.",
  ACCOUNT_LOCKED: "Tài khoản tạm thời bị khóa. Vui lòng thử lại sau ít phút hoặc liên hệ hỗ trợ.",
  RATE_LIMITED: "Bạn thao tác quá nhanh, vui lòng thử lại sau ít giây.",
  SEAT_UNAVAILABLE: "Rất tiếc, chuyến này chỉ còn ít chỗ hơn số bạn chọn.",
  DEPARTURE_CLOSED: "Chuyến này đã đóng bán.",
  HOLD_EXPIRED: "Thời gian giữ chỗ đã hết.",
  INVALID_STATE_TRANSITION: "Thao tác không hợp lệ với trạng thái hiện tại của đơn.",
  VERSION_CONFLICT: "Bản ghi vừa được cập nhật bởi người khác.",
  IDEMPOTENCY_CONFLICT: "Yêu cầu này không khớp với yêu cầu trước đó. Vui lòng tải lại trang.",
  COUPON_INVALID: "Mã giảm giá không hợp lệ.",
  PAYMENT_AMOUNT_MISMATCH: "Số tiền thanh toán chưa khớp. Chúng tôi sẽ liên hệ để xử lý.",
  PAYMENT_ALREADY_SETTLED: "Đơn này đã được thanh toán đủ.",
  CANCEL_NOT_ALLOWED: "Đơn không thể hủy/đổi vào thời điểm này. Vui lòng liên hệ hỗ trợ.",
  REFUND_EXCEEDS_PAID: "Số tiền hoàn không được vượt số tiền đã thu.",
  HAS_DEPENDENCIES: "Không thể xóa vì còn dữ liệu liên quan. Bạn có thể tạm ẩn thay vì xóa.",
  INTERNAL_ERROR: "Có lỗi hệ thống. Vui lòng thử lại sau.",
};

export const COUPON_REASONS: Record<string, string> = {
  expired: "Mã đã hết hạn.",
  used_up: "Mã đã hết lượt sử dụng.",
  min_order: "Đơn chưa đạt giá trị tối thiểu để dùng mã này.",
  not_applicable: "Mã không áp dụng cho tour hoặc ngày khởi hành này.",
  already_used: "Bạn đã sử dụng mã này.",
  not_found: "Mã giảm giá không tồn tại.",
  inactive: "Mã đã ngừng áp dụng.",
  not_started: "Mã chưa tới thời gian sử dụng.",
};

export const CANCEL_REASONS = [
  { value: "customer_request", label: "Thay đổi kế hoạch" },
  { value: "other", label: "Lý do khác" },
];

export const STAFF_CANCEL_REASONS = [
  { value: "customer_request", label: "Khách yêu cầu hủy" },
  { value: "unpaid", label: "Không thanh toán đủ" },
  { value: "no_show", label: "No-show" },
  { value: "min_pax_not_met", label: "Không đủ khách tối thiểu" },
  { value: "force_majeure", label: "Bất khả kháng" },
  { value: "operational", label: "Sự cố vận hành" },
  { value: "duplicate", label: "Đơn trùng" },
  { value: "fraud", label: "Gian lận" },
  { value: "other", label: "Khác" },
];
