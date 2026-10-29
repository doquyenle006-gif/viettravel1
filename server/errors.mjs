export class ApiError extends Error {
  constructor(status, code, message, fields, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.extra = extra;
  }
}

export const MESSAGES = {
  VALIDATION_ERROR: "Vui lòng kiểm tra lại các trường được đánh dấu.",
  UNAUTHENTICATED: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  NOT_FOUND: "Không tìm thấy nội dung bạn yêu cầu.",
  EMAIL_TAKEN: "Email này đã được đăng ký. Bạn thử đăng nhập nhé.",
  EMAIL_NOT_VERIFIED: "Vui lòng xác minh email trước khi đặt tour.",
  ACCOUNT_LOCKED: "Tài khoản tạm thời bị khóa. Vui lòng thử lại sau ít phút hoặc liên hệ hỗ trợ.",
  RATE_LIMITED: "Bạn thao tác quá nhanh, vui lòng thử lại sau ít giây.",
  SEAT_UNAVAILABLE: "Rất tiếc, chuyến này không còn đủ chỗ.",
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

export function apiError(code, status, message, fields, extra) {
  return new ApiError(status, code, message || MESSAGES[code] || MESSAGES.INTERNAL_ERROR, fields, extra);
}
