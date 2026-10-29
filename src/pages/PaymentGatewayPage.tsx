import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, isApiError } from "../lib/api";
import { Seo } from "../components/Seo";
import { Icon } from "../components/Icon";
import { ErrorState, Notice, PageLoader } from "../components/ui";
import { formatVnd } from "../lib/format";
import { useToast } from "../components/Toast";

interface SandboxInfo {
  merchantRef: string;
  amount: number;
  method: string;
  status: string;
  bookingCode: string;
  tourName: string;
  contactEmail: string;
  createdAt: string;
}

export default function PaymentGatewayPage() {
  const { merchantRef } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [info, setInfo] = useState<SandboxInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [processing, setProcessing] = useState<"success" | "fail" | null>(null);

  useEffect(() => {
    if (!merchantRef) return;
    api<SandboxInfo>(`/sandbox/payments/${encodeURIComponent(merchantRef)}`)
      .then(setInfo)
      .catch((err: unknown) => setError(err instanceof Error ? err : new Error("Không tìm thấy giao dịch.")))
      .finally(() => setLoading(false));
  }, [merchantRef]);

  const complete = async (result: "success" | "fail") => {
    if (!merchantRef || !info) return;
    setProcessing(result);
    try {
      const response = await api<{ outcome?: string; payment?: { status: string } }>(`/sandbox/payments/${encodeURIComponent(merchantRef)}/complete`, {
        method: "POST",
        body: { result },
      });
      if (result === "fail") toast.info("Giao dịch đã được hủy trên cổng sandbox.");
      else toast.success("Cổng sandbox báo thanh toán thành công.");
      if (response.outcome === "amount_mismatch") toast.error("Số tiền không khớp — giao dịch đã được chuyển cho kế toán.");
      navigate(`/payment/result?code=${encodeURIComponent(info.bookingCode)}`, { replace: true });
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không hoàn tất được giao dịch sandbox.");
      setProcessing(null);
    }
  };

  return (
    <div className="gateway-shell">
      <Seo title="Cổng thanh toán sandbox" noindex />
      <div className="gateway-card">
        <div className="gateway-brand">
          <span className="brand-mark" style={{ width: 34, height: 34 }}><Icon name="compass" size={18} /></span>
          VietTrails · Cổng thanh toán
        </div>
        {loading ? <PageLoader label="Đang tải giao dịch" /> : null}
        {error ? <ErrorState error={error} /> : null}
        {info ? (
          <>
            <Notice tone="warning" title="Môi trường sandbox">
              Đây là cổng mô phỏng cho bản demo. Không nhập thông tin thẻ thật. Hành vi xử lý webhook, chữ ký và idempotency giống môi trường thật.
            </Notice>
            <span className="field-hint">Mã giao dịch</span>
            <div className="order-code" style={{ margin: "4px 0 12px" }}>{info.merchantRef}</div>
            <div className="gateway-amount">{formatVnd(info.amount)}</div>
            <p className="gateway-note">{info.tourName} · Đơn {info.bookingCode}</p>
            <div className="summary-list" style={{ marginTop: 16 }}>
              <div><span>Phương thức</span><strong>{info.method === "vnpay" ? "VNPay" : info.method === "momo" ? "MoMo" : info.method === "zalopay" ? "ZaloPay" : info.method}</strong></div>
              <div><span>Email nhận biên nhận</span><strong>{info.contactEmail}</strong></div>
              <div><span>Trạng thái</span><strong>{info.status}</strong></div>
            </div>
            <div className="inline-actions" style={{ marginTop: 22 }}>
              <button type="button" className="btn btn-primary btn-lg" onClick={() => complete("success")} disabled={Boolean(processing)}>
                {processing === "success" ? "Đang xử lý…" : "Mô phỏng thanh toán thành công"}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => complete("fail")} disabled={Boolean(processing)}>
                {processing === "fail" ? "Đang hủy…" : "Hủy giao dịch"}
              </button>
            </div>
            <p className="gateway-note" style={{ marginTop: 18 }}>Bạn sẽ được đưa về trang kết quả. Trang kết quả chỉ đọc trạng thái từ máy chủ VietTrails, không tin tham số URL.</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
