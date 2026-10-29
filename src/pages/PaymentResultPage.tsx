import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { BookingDetail } from "../types";
import { api } from "../lib/api";
import { formatDate, formatVnd, openHtmlDocument } from "../lib/format";
import { Seo } from "../components/Seo";
import { Icon } from "../components/Icon";
import { StatusChip } from "../components/ui";
import { useToast } from "../components/Toast";

type ResultState = "polling" | "success" | "failed" | "unknown";

export default function PaymentResultPage() {
  const [params] = useSearchParams();
  const code = params.get("code");
  const toast = useToast();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [state, setState] = useState<ResultState>("polling");
  const started = useRef(Date.now());
  const stopped = useRef(false);

  useEffect(() => {
    if (!code) {
      setState("unknown");
      return;
    }
    let timer: number | null = null;
    const poll = async () => {
      if (stopped.current || document.visibilityState === "hidden") {
        timer = window.setTimeout(poll, 3000);
        return;
      }
      try {
        const data = await api<BookingDetail>(`/me/bookings/${encodeURIComponent(code)}`);
        setBooking(data);
        if (["confirmed", "completed"].includes(data.status) && data.grossPaid > 0) {
          setState("success");
          stopped.current = true;
          return;
        }
        if (data.status === "cancelled" || data.status === "expired") {
          setState("failed");
          stopped.current = true;
          return;
        }
        const latest = data.payments.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (latest && ["failed", "cancelled"].includes(latest.status)) {
          setState("failed");
          stopped.current = true;
          return;
        }
      } catch {
        // Keep polling; the server may still be processing the webhook.
      }
      if (Date.now() - started.current > 60000) {
        setState("unknown");
        stopped.current = true;
        return;
      }
      timer = window.setTimeout(poll, 3000);
    };
    void poll();
    return () => {
      stopped.current = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [code]);

  const downloadVoucher = async () => {
    if (!code) return;
    try {
      const data = await api<{ html: string; filename: string }>(`/me/bookings/${encodeURIComponent(code)}/voucher`);
      openHtmlDocument(data.html, data.filename);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chưa tải được voucher.");
    }
  };

  return (
    <>
      <Seo title="Kết quả thanh toán" noindex />
      <div className="container">
        <div className="payment-result">
          {state === "polling" ? (
            <>
              <span className="result-icon result-icon--pending"><span className="spinner" /></span>
              <h1 style={{ color: "var(--green)" }}>Đang xác nhận thanh toán…</h1>
              <p className="muted">Chúng tôi đang nhận xác nhận từ cổng thanh toán. Vui lòng không đóng trang. Quá trình này thường mất vài giây.</p>
              <p className="field-hint">Mã đơn: {code}</p>
            </>
          ) : null}
          {state === "success" && booking ? (
            <>
              <span className="result-icon result-icon--ok"><Icon name="check-circle" size={36} /></span>
              <h1 style={{ color: "var(--green)" }}>Thanh toán thành công</h1>
              <p className="muted">Đơn <strong>{booking.code}</strong> đã được xác nhận. Voucher và thông tin chuyến đã sẵn sàng.</p>
              <div className="summary-list" style={{ maxWidth: 380, margin: "20px auto", textAlign: "left" }}>
                <div><span>Đã thanh toán</span><strong>{formatVnd(booking.grossPaid)}</strong></div>
                <div><span>Trạng thái đơn</span><StatusChip status={booking.status} kind="booking" /></div>
                <div><span>Khởi hành</span><strong>{formatDate(booking.departure.departureDate)}</strong></div>
              </div>
              <div className="inline-actions" style={{ justifyContent: "center" }}>
                <Link to={`/account/bookings/${booking.code}`} className="btn btn-primary">Xem đơn</Link>
                <button type="button" className="btn btn-outline" onClick={downloadVoucher}>Tải voucher</button>
                <Link to="/tours" className="btn btn-ghost">Tiếp tục khám phá</Link>
              </div>
            </>
          ) : null}
          {state === "failed" ? (
            <>
              <span className="result-icon result-icon--danger"><Icon name="x-circle" size={36} /></span>
              <h1 style={{ color: "var(--green)" }}>Thanh toán chưa hoàn tất</h1>
              <p className="muted">Giao dịch không thành công hoặc đơn đã hết hạn giữ chỗ. Bạn có thể thử phương thức khác nếu đơn còn hiệu lực.</p>
              <div className="inline-actions" style={{ justifyContent: "center", marginTop: 18 }}>
                <Link to={booking ? `/booking/${booking.code}/pay` : "/account/bookings"} className="btn btn-primary">Thử phương thức khác</Link>
                <Link to="/account/bookings" className="btn btn-outline">Đơn của tôi</Link>
              </div>
            </>
          ) : null}
          {state === "unknown" ? (
            <>
              <span className="result-icon result-icon--pending"><Icon name="clock" size={34} /></span>
              <h1 style={{ color: "var(--green)" }}>Chưa xác định được kết quả</h1>
              <p className="muted">Chúng tôi sẽ gửi email khi nhận được xác nhận từ cổng thanh toán. Bạn có thể kiểm tra trong Đơn của tôi sau ít phút.</p>
              <div className="inline-actions" style={{ justifyContent: "center", marginTop: 18 }}>
                <Link to="/account/bookings" className="btn btn-primary">Kiểm tra Đơn của tôi</Link>
                {booking ? <Link to={`/account/bookings/${booking.code}`} className="btn btn-outline">Xem đơn {booking.code}</Link> : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
