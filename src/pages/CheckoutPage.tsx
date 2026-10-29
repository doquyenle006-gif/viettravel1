import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Departure, PassengerInput, Quote, TourDetail } from "../types";
import { api, isApiError } from "../lib/api";
import { useApi } from "../lib/hooks";
import { usePublicConfig } from "../lib/config";
import { useSession } from "../lib/session";
import { COUPON_REASONS } from "../lib/errors";
import { formatDate, formatDateLong, formatPax, formatVnd } from "../lib/format";
import { classLabel, validDob } from "../lib/validate";
import { Seo } from "../components/Seo";
import { CoverArt } from "../components/CoverArt";
import { CouponInput, PassengerForm, PriceSummary, StepIndicator, validateContactDraft, validatePassengerDrafts, type PassengerDraft } from "../components/booking";
import { Field, Notice, PageLoader, ErrorState, EmptyState, Skeleton } from "../components/ui";
import { Icon } from "../components/Icon";
import { useToast } from "../components/Toast";
import { Modal } from "../components/Modal";

interface Lookup {
  departure: Departure;
  tour: TourDetail;
}

interface StoredDraft {
  departureId: number;
  adults: number;
  children: number;
  infants: number;
  contact: { fullName: string; email: string; phone: string };
  passengers: { fullName: string; gender: "male" | "female" | "other"; dateOfBirth: string }[];
}

const DRAFT_KEY = "vt_checkout_draft";

function readDraft(): StoredDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) as StoredDraft : null;
  } catch {
    return null;
  }
}

function createPassenger(): PassengerDraft {
  return {
    key: crypto.randomUUID(), fullName: "", gender: "female", dateOfBirth: "",
    nationality: "Việt Nam", idNumber: "", passportNumber: "", specialRequest: "",
  };
}

export default function CheckoutPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const config = usePublicConfig();
  const toast = useToast();
  const { user } = useSession();
  const stored = useRef<StoredDraft | null>(readDraft());
  const queryDepartureId = Number(params.get("departure")) || stored.current?.departureId || 0;
  const initialAdults = Number(params.get("adults")) || stored.current?.adults || 2;
  const initialChildren = Number(params.get("children")) || stored.current?.children || 0;
  const initialInfants = Number(params.get("infants")) || stored.current?.infants || 0;
  const totalPax = Math.max(1, initialAdults + initialChildren + initialInfants);

  const [passengers, setPassengers] = useState<PassengerDraft[]>(() => {
    const fromDraft = stored.current?.passengers;
    if (fromDraft && fromDraft.length === totalPax) {
      return fromDraft.map((passenger) => ({ ...createPassenger(), ...passenger }));
    }
    return Array.from({ length: totalPax }, createPassenger);
  });
  const [contact, setContact] = useState(() => ({
    fullName: user?.fullName || stored.current?.contact.fullName || "",
    email: user?.email || stored.current?.contact.email || "",
    phone: user?.phone || stored.current?.contact.phone || "",
  }));
  const [customerNote, setCustomerNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<"deposit" | "full">("deposit");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [continueExisting, setContinueExisting] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSeatModal, setShowSeatModal] = useState(false);
  const idempotency = useRef<{ signature: string; key: string } | null>(null);
  const lookup = useApi<Lookup>(queryDepartureId ? `/departures/${queryDepartureId}` : null, [queryDepartureId]);

  useEffect(() => {
    if (!queryDepartureId) return;
    const draft: StoredDraft = {
      departureId: queryDepartureId,
      adults: initialAdults, children: initialChildren, infants: initialInfants,
      contact,
      passengers: passengers.map((passenger) => ({
        fullName: passenger.fullName, gender: passenger.gender, dateOfBirth: passenger.dateOfBirth,
      })),
    };
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* storage can be unavailable */ }
  }, [queryDepartureId, passengers, contact, initialAdults, initialChildren, initialInfants]);

  const dobs = passengers.map((passenger) => passenger.dateOfBirth);
  const allDobsValid = dobs.length > 0 && dobs.every(validDob);
  const dobKey = dobs.join("|");

  useEffect(() => {
    if (!queryDepartureId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setQuoteLoading(true);
      setQuoteError(null);
      api<Quote>("/bookings/quote", {
        method: "POST",
        body: {
          departureId: queryDepartureId,
          adults: initialAdults, children: initialChildren, infants: initialInfants,
          couponCode: couponCode || undefined,
          passengerDobs: allDobsValid ? dobs : undefined,
        },
        signal: controller.signal,
      })
        .then((data) => {
          setQuote(data);
          setQuoteError(null);
          setCouponError(data.coupon && !data.coupon.valid ? COUPON_REASONS[data.coupon.reason || ""] || "Mã giảm giá không áp dụng cho đơn này." : null);
          if (data.fullPaymentRequired) setPurpose("full");
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setQuote(null);
          if (isApiError(error)) {
            const extra = error.extra as { seatsLeft?: number } | undefined;
            setQuoteError(extra?.seatsLeft !== undefined ? `Chuyến chỉ còn ${extra.seatsLeft} chỗ. Vui lòng giảm số khách hoặc chọn lịch khác.` : error.message);
            if (error.code === "SEAT_UNAVAILABLE") setShowSeatModal(true);
          } else {
            setQuoteError("Chưa kết nối được máy chủ để tính giá.");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setQuoteLoading(false);
        });
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [queryDepartureId, initialAdults, initialChildren, initialInfants, couponCode, allDobsValid, dobKey]);

  const updatePassenger = (index: number, patch: Partial<PassengerDraft>) => {
    setPassengers((current) => current.map((passenger, i) => i === index ? { ...passenger, ...patch } : passenger));
    setSubmitError(null);
  };

  const useMe = () => {
    if (!user) return;
    updatePassenger(0, { fullName: user.fullName, nationality: "Việt Nam" });
    setContact((current) => ({ ...current, fullName: user.fullName, email: user.email, phone: user.phone || current.phone }));
  };

  const focusFirstError = () => {
    window.setTimeout(() => {
      const element = document.querySelector<HTMLElement>(".checkout-main .field--error input, .checkout-main .field--error select, .checkout-main .field--error textarea");
      element?.focus();
      element?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 50);
  };

  const toReview = () => {
    const passengerErrors = validatePassengerDrafts(passengers, lookup.data!.tour);
    const contactErrorValues = validateContactDraft(contact);
    setErrors(passengerErrors);
    setContactErrors(contactErrorValues);
    if (Object.keys(passengerErrors).length || Object.keys(contactErrorValues).length) {
      focusFirstError();
      return;
    }
    if (quoteError) {
      toast.error(quoteError);
      return;
    }
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    if (!lookup.data || !quote) {
      toast.error("Chưa có báo giá hợp lệ. Vui lòng chọn lại lịch.");
      return;
    }
    if (quote.existingPending && !continueExisting) {
      setSubmitError("Bạn đang có một đơn chờ thanh toán cho chuyến này. Hãy tiếp tục đơn cũ hoặc xác nhận tạo đơn mới.");
      return;
    }
    if (!termsAccepted) {
      setSubmitError("Bạn cần đọc và đồng ý Điều khoản và Chính sách hủy trước khi xác nhận.");
      return;
    }
    const payloadPassengers: PassengerInput[] = passengers.map(({ key: _key, ...passenger }) => ({
      ...passenger,
      idNumber: passenger.idNumber || undefined,
      passportNumber: passenger.passportNumber || undefined,
      specialRequest: passenger.specialRequest || undefined,
    }));
    const payload = {
      departureId: queryDepartureId,
      contact,
      passengers: payloadPassengers,
      couponCode: couponCode || undefined,
      payment: { purpose },
      customerNote: customerNote || undefined,
      termsAccepted,
      termsVersion: config.termsVersion,
      continueExisting,
    };
    const signature = JSON.stringify(payload);
    if (!idempotency.current || idempotency.current.signature !== signature) {
      idempotency.current = { signature, key: crypto.randomUUID() };
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await api<{ code: string; booking: { code: string }; replayed?: boolean }>("/bookings", {
        method: "POST",
        headers: { "Idempotency-Key": idempotency.current.key },
        body: payload,
        timeoutMs: 30000,
      });
      sessionStorage.removeItem(DRAFT_KEY);
      toast.success(`Đã giữ chỗ cho đơn ${result.code}.`);
      navigate(`/booking/${result.code}/pay?purpose=${purpose}`, { replace: true });
    } catch (error) {
      if (isApiError(error)) {
        const fields = error.fields || {};
        const passengerFields: Record<string, string> = {};
        const contactFields: Record<string, string> = {};
        for (const [key, message] of Object.entries(fields)) {
          if (key.startsWith("passengers.")) passengerFields[key] = message;
          else if (["fullName", "email", "phone"].includes(key)) contactFields[key] = message;
        }
        if (Object.keys(passengerFields).length) setErrors(passengerFields);
        if (Object.keys(contactFields).length) setContactErrors(contactFields);
        if (error.code === "DUPLICATE_PENDING") {
          const extra = error.extra as { existingPending?: { code: string } } | undefined;
          setSubmitError(`Bạn đang có đơn ${extra?.existingPending?.code || ""} chờ thanh toán. Tiếp tục đơn cũ hoặc chọn tạo đơn mới.`);
        } else if (error.code === "SEAT_UNAVAILABLE") {
          setShowSeatModal(true);
          setSubmitError(error.message);
        } else if (error.code === "DEPARTURE_CLOSED") {
          setSubmitError("Chuyến đã đóng bán. Vui lòng chọn lịch khác.");
        } else if (error.code === "EMAIL_NOT_VERIFIED") {
          setSubmitError("Email chưa được xác minh. Vui lòng xác minh email trước khi đặt tour.");
        } else if (error.code === "IDEMPOTENCY_CONFLICT") {
          setSubmitError("Yêu cầu không khớp với lần gửi trước. Vui lòng tải lại trang checkout.");
        } else {
          setSubmitError(error.message);
        }
        focusFirstError();
      } else {
        setSubmitError("Mất kết nối khi giữ chỗ. Đừng gửi lại ngay — hãy kiểm tra Đơn của tôi trước, hoặc bấm thử lại với cùng khóa.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!queryDepartureId) {
    return (
      <div className="container narrow-page">
        <EmptyState
          icon="calendar"
          title="Chưa chọn lịch khởi hành"
          description="Hãy chọn tour và ngày khởi hành trước khi tiếp tục đặt chỗ."
          action={<Link to="/tours" className="btn btn-primary">Khám phá tour</Link>}
        />
      </div>
    );
  }
  if (lookup.loading && !lookup.data) return <div className="container narrow-page"><PageLoader label="Đang tải thông tin chuyến" /></div>;
  if (lookup.error) return <div className="container narrow-page"><ErrorState error={lookup.error} onRetry={lookup.reload} /></div>;
  if (!lookup.data) return null;

  const { tour, departure } = lookup.data;
  const reclassified = quote?.reclassified || [];
  const couponResult = quote?.coupon || null;
  const canDeposit = !quote?.fullPaymentRequired;
  const dueNow = quote ? (purpose === "full" ? quote.total : quote.deposit.amount) : 0;

  const summary = (
    <div className="summary-card">
      <div className="summary-tour">
        <CoverArt seed={tour.slug} alt={tour.name} />
        <div>
          <strong>{tour.name}</strong>
          <span>{formatDateLong(departure.departureDate)} · {quote ? formatPax(quote.adults, quote.children, quote.infants) : formatPax(initialAdults, initialChildren, initialInfants)}</span>
        </div>
      </div>
      <div className="summary-list">
        <div><span>Điểm đón</span><strong>{departure.meetingPoint.split(",")[0]}</strong></div>
        <div><span>Giờ đón</span><strong>{departure.meetingTime}</strong></div>
        <div><span>Thời lượng</span><strong>{tour.durationDays}N{tour.durationNights}Đ</strong></div>
      </div>
      <div className="summary-divider" />
      <PriceSummary quote={quote} loading={quoteLoading} error={quoteError} />
      <div className="summary-divider" />
      <div className="summary-list">
        <div><span>Cần thanh toán bây giờ</span><strong style={{ color: "var(--green)", fontSize: 16 }}>{formatVnd(dueNow)}</strong></div>
      </div>
      <p className="passenger-hint" style={{ marginTop: 10 }}>
        Giá và tồn chỗ được máy chủ kiểm tra lại khi bấm xác nhận. Chỗ chỉ được giữ sau khi đơn được tạo.
      </p>
    </div>
  );

  return (
    <>
      <Seo title="Đặt tour" noindex />
      <div className="container checkout-layout">
        <div className="checkout-main">
          <StepIndicator current={step} steps={["Hành khách", "Xem lại & mã giảm", "Thanh toán"]} />
          {submitError ? <Notice tone="danger" title="Chưa thể xác nhận">{submitError}</Notice> : null}
          {reclassified.length ? (
            <Notice tone="warning" title="Giá đã được cập nhật theo ngày sinh">
              {reclassified.map((row) => `Hành khách ${row.index}: ${row.from === "adult" ? "người lớn" : row.from === "child" ? "trẻ em" : "em bé"} → ${row.to === "adult" ? "người lớn" : row.to === "child" ? "trẻ em" : "em bé"}`).join("; ")}. Hệ thống tính lại theo loại khách tại ngày khởi hành.
            </Notice>
          ) : null}

          {step === 1 ? (
            <>
              <PassengerForm
                passengers={passengers}
                onChange={updatePassenger}
                errors={errors}
                tour={tour}
                departureDate={departure.departureDate}
                contact={contact}
                onContactChange={(patch) => setContact((current) => ({ ...current, ...patch }))}
                contactErrors={contactErrors}
                onUseMe={useMe}
              />
              <div className="checkout-section">
                <Field label="Ghi chú cho VietTrails" htmlFor="customer-note" hint="Tối đa 500 ký tự. Không nhập số giấy tờ tại đây.">
                  <textarea id="customer-note" className="input textarea" maxLength={500} value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} />
                </Field>
              </div>
              <div className="checkout-actions">
                <Link to={`/tours/${tour.slug}`} className="btn btn-ghost">← Chọn lại lịch</Link>
                <button type="button" className="btn btn-primary btn-lg" onClick={toReview} disabled={!quote || quoteLoading || Boolean(quoteError)}>
                  Xem lại & thanh toán
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="checkout-section">
                <div className="panel-head">
                  <div><h2>Xác nhận thông tin</h2><p className="muted">Kiểm tra kỹ trước khi giữ chỗ.</p></div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep(1)}>Sửa</button>
                </div>
                <div className="form-grid">
                  <div><span className="field-hint">Người liên hệ</span><strong>{contact.fullName}</strong><div className="muted">{contact.email} · {contact.phone}</div></div>
                  <div><span className="field-hint">Chuyến đi</span><strong>{formatDate(departure.departureDate)}</strong><div className="muted">{departure.meetingPoint} · {departure.meetingTime}</div></div>
                </div>
                <div className="table-wrap" style={{ marginTop: 16 }}>
                  <table className="data-table">
                    <thead><tr><th>Hành khách</th><th>Loại</th><th>Ngày sinh</th><th>Yêu cầu</th></tr></thead>
                    <tbody>
                      {passengers.map((passenger) => (
                        <tr key={passenger.key}>
                          <td>{passenger.fullName}</td>
                          <td>{passenger.dateOfBirth ? classLabel(passengerAgeType(passenger.dateOfBirth, departure.departureDate, tour.ageInfantMax, tour.ageChildMax)) : "—"}</td>
                          <td>{formatDate(passenger.dateOfBirth)}</td>
                          <td>{passenger.specialRequest || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="checkout-section">
                <h2>Mã giảm giá</h2>
                <p>Mỗi đơn chỉ áp dụng một mã. Mã không hợp lệ không chặn việc đặt chỗ.</p>
                <CouponInput
                  value={couponCode}
                  onChange={(value) => { setCouponCode(value); setCouponError(null); }}
                  onApply={() => { setCouponError(null); }}
                  loading={quoteLoading}
                  result={couponResult}
                  error={couponError}
                />
              </div>

              <div className="checkout-section">
                <h2>Mức thanh toán</h2>
                <p>{quote?.fullPaymentRequired ? `Chuyến khởi hành trong ${quote.daysToDeparture} ngày nên cần thanh toán toàn bộ.` : "Bạn có thể đặt cọc để giữ chỗ và trả phần còn lại trước hạn."}</p>
                {quote ? (
                  <>
                    {canDeposit ? (
                      <label className="radio-card">
                        <input type="radio" name="purpose" checked={purpose === "deposit"} onChange={() => setPurpose("deposit")} />
                        <span><strong>Đặt cọc {quote.deposit.percent}% — {formatVnd(quote.deposit.amount)}</strong><span>Còn lại {formatVnd(quote.deposit.balance)} trước ngày {formatDate(quote.balanceDueDate)}</span></span>
                      </label>
                    ) : null}
                    <label className="radio-card">
                      <input type="radio" name="purpose" checked={purpose === "full" || !canDeposit} onChange={() => setPurpose("full")} disabled={!canDeposit} />
                      <span><strong>Thanh toán toàn bộ — {formatVnd(quote.total)}</strong><span>Xác nhận đơn ngay khi thanh toán thành công</span></span>
                    </label>
                  </>
                ) : <Skeleton height={60} />}
              </div>

              {quote?.existingPending ? (
                <Notice tone="warning" title="Bạn đang có đơn chờ thanh toán">
                  Đơn <Link className="text-link" to={`/booking/${quote.existingPending.code}/pay`}>{quote.existingPending.code}</Link> vẫn còn hiệu lực giữ chỗ. Bạn nên tiếp tục đơn cũ để tránh giữ chỗ trùng.
                  <label className="checkbox-row" style={{ marginTop: 8 }}>
                    <input type="checkbox" checked={continueExisting} onChange={(event) => setContinueExisting(event.target.checked)} />
                    <span>Tôi hiểu và muốn tạo một đơn mới cho chuyến này.</span>
                  </label>
                </Notice>
              ) : null}

              <div className="checkout-section">
                <h2>Điều khoản & xác nhận</h2>
                <label className="checkbox-row">
                  <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
                  <span>
                    Tôi đã đọc và đồng ý <a href="/policies/dieu-khoan" target="_blank" rel="noopener noreferrer">Điều khoản sử dụng</a>,{" "}
                    <a href="/policies/chinh-sach-huy" target="_blank" rel="noopener noreferrer">Chính sách hủy</a> và hiểu rằng chỗ chỉ được giữ sau khi đơn được tạo.
                  </span>
                </label>
                <p className="field-hint" style={{ marginTop: 8 }}>Phiên bản điều khoản: {config.termsVersion}.</p>
              </div>

              <div className="checkout-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>← Sửa hành khách</button>
                <button type="button" className="btn btn-primary btn-lg" onClick={submit} disabled={submitting || !quote || quoteLoading || Boolean(quoteError)}>
                  {submitting ? "Đang giữ chỗ…" : "Xác nhận đặt chỗ"}
                </button>
              </div>
              <p className="field-hint" style={{ textAlign: "right", marginTop: 6 }}>Bấm một lần — hệ thống chống tạo đơn trùng bằng Idempotency-Key.</p>
            </>
          )}
        </div>
        <aside className="checkout-aside">
          {summary}
          <div className="trust-note" style={{ justifyContent: "center" }}><Icon name="shield" size={14} /> Thanh toán an toàn · Hỗ trợ {config.hotline}</div>
        </aside>
      </div>

      <Modal
        open={showSeatModal}
        onClose={() => setShowSeatModal(false)}
        title="Chuyến đã hết chỗ"
        size="sm"
        footer={<button type="button" className="btn btn-primary" onClick={() => { setShowSeatModal(false); navigate(`/tours/${tour.slug}`); }}>Chọn lịch khác</button>}
      >
        <p>{quoteError || "Rất tiếc, chuyến này không còn đủ chỗ cho số khách đã chọn."} Dữ liệu bạn đã nhập vẫn được giữ lại.</p>
      </Modal>
    </>
  );
}

function passengerAgeType(dob: string, departureDate: string, infantMax: number, childMax: number): "adult" | "child" | "infant" {
  const [by, bm, bd] = dob.split("-").map(Number);
  const [y, m, d] = departureDate.split("-").map(Number);
  const age = y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
  return age < infantMax ? "infant" : age < childMax ? "child" : "adult";
}
