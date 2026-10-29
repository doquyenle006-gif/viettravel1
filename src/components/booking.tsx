import { useEffect, useMemo, useRef, useState } from "react";
import type { Departure, PassengerInput, Quote, TourDetail } from "../types";
import { addDaysIso, formatDate, formatDateLong, formatPax, formatVnd, monthLabel, remainingParts, todayIso } from "../lib/format";
import { serverNow } from "../lib/time";
import { ageBandLabel, classifyPassenger, classLabel, validEmail, validPhone, normalizePhoneInput, validDob } from "../lib/validate";
import { Icon } from "./Icon";
import { CopyButton, Field, Notice, Skeleton } from "./ui";

/* ---------------- Departure calendar ---------------- */

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export function DepartureCalendar({ departures, selectedId, onSelect }: {
  departures: Departure[];
  selectedId: number | null;
  onSelect: (departure: Departure) => void;
}) {
  const today = todayIso();
  const available = departures.filter((item) => item.status === "open" || item.status === "full");
  const firstOpen = available.find((item) => item.status === "open" && item.seatsLeft > 0);
  const hasSelected = departures.some((item) => item.id === selectedId);
  const initialMonth = (firstOpen?.departureDate || departures[0]?.departureDate || today).slice(0, 7);
  const [cursor, setCursor] = useState(initialMonth);
  const gridRef = useRef<HTMLDivElement>(null);
  const minMonth = today.slice(0, 7);
  const maxMonth = addDaysIso(today, 240).slice(0, 7);
  const [year, month] = cursor.split("-").map(Number);

  const byDate = useMemo(() => {
    const map = new Map<string, Departure>();
    for (const departure of departures) map.set(departure.departureDate, departure);
    return map;
  }, [departures]);

  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const offset = (firstDay + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }

  const shiftMonth = (delta: number) => {
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    const key = next.toISOString().slice(0, 7);
    if (key < minMonth || key > maxMonth) return;
    setCursor(key);
  };

  const moveFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (!target.dataset.date) return;
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key === "Home" || event.key === "End" || offsets[event.key] !== undefined) {
      event.preventDefault();
      let nextDate = target.dataset.date;
      if (event.key === "Home") nextDate = `${year}-${String(month).padStart(2, "0")}-01`;
      else if (event.key === "End") nextDate = `${year}-${String(month).padStart(2, "0")}-${daysInMonth}`;
      else nextDate = addDaysIso(nextDate, offsets[event.key]);
      const nextMonth = nextDate.slice(0, 7);
      if (nextMonth !== cursor && nextMonth >= minMonth && nextMonth <= maxMonth) setCursor(nextMonth);
      window.setTimeout(() => {
        gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${nextDate}"]`)?.focus();
      }, 0);
    }
  };

  return (
    <div className="calendar">
      <div className="calendar-head">
        <button type="button" className="icon-btn" onClick={() => shiftMonth(-1)} aria-label="Tháng trước" disabled={cursor <= minMonth}>
          <Icon name="chevron-left" size={16} />
        </button>
        <strong>{monthLabel(year, month)}</strong>
        <button type="button" className="icon-btn" onClick={() => shiftMonth(1)} aria-label="Tháng sau" disabled={cursor >= maxMonth}>
          <Icon name="chevron-right" size={16} />
        </button>
      </div>
      <div className="calendar-grid" role="grid" aria-label={`Lịch khởi hành ${monthLabel(year, month)}`} onKeyDown={moveFocus} ref={gridRef}>
        {WEEKDAYS.map((day) => <div key={day} className="calendar-weekday" role="columnheader">{day}</div>)}
        {cells.map((date, index) => {
          if (!date) return <span key={`empty-${index}`} className="calendar-day calendar-day--empty" aria-hidden="true" />;
          const departure = byDate.get(date);
          const past = date < today;
          const isSelected = departure && departure.id === selectedId;
          let classes = "calendar-day";
          let label = formatDateLong(date);
          let disabled = true;
          if (departure) {
            if (departure.status === "cancelled") {
              classes += " calendar-day--disabled";
              label += " — chuyến đã hủy";
            } else if (departure.status === "closed" || departure.status === "departed" || departure.status === "completed") {
              classes += " calendar-day--closed";
              label += " — đã đóng bán";
            } else if (departure.status === "full" || departure.seatsLeft <= 0) {
              classes += " calendar-day--closed";
              label += " — hết chỗ";
            } else if (past) {
              classes += " calendar-day--disabled";
              label += " — đã qua";
            } else {
              classes += departure.seatsLeft <= 5 ? " calendar-day--low" : " calendar-day--available";
              if (isSelected) classes += " calendar-day--selected";
              label += ` — còn ${departure.seatsLeft} chỗ, ${formatVnd(departure.priceAdult)}`;
              disabled = false;
            }
          } else {
            classes += " calendar-day--disabled";
            label += " — không có lịch";
          }
          return (
            <button
              key={date}
              type="button"
              data-date={date}
              className={classes}
              aria-label={label}
              aria-pressed={isSelected || undefined}
              aria-disabled={disabled || undefined}
              tabIndex={isSelected || (!hasSelected && departure?.id === firstOpen?.id) ? 0 : -1}
              onClick={() => {
                if (!disabled && departure) onSelect(departure);
              }}
            >
              {Number(date.slice(8))}
              {departure && !disabled ? <small>{departure.seatsLeft} chỗ</small> : departure ? <small>—</small> : null}
            </button>
          );
        })}
      </div>
      <div className="calendar-legend">
        <span><i className="legend-dot" style={{ background: "var(--green-100)" }} /> Còn chỗ</span>
        <span><i className="legend-dot" style={{ background: "var(--accent-soft)" }} /> Còn ≤ 5</span>
        <span><i className="legend-dot" style={{ background: "var(--surface-2)" }} /> Hết chỗ/đóng</span>
      </div>
    </div>
  );
}

/* ---------------- Pax stepper ---------------- */

export function PaxStepper({ adults, children, infants, onChange, seatsLeft, maxPax, infantMax, childMax, disabled }: {
  adults: number;
  children: number;
  infants: number;
  onChange: (value: { adults: number; children: number; infants: number }) => void;
  seatsLeft: number;
  maxPax: number;
  infantMax: number;
  childMax: number;
  disabled?: boolean;
}) {
  const total = adults + children + infants;
  const seatCount = adults + children + (infants > adults ? infants - adults : 0);
  const limit = Math.min(seatsLeft, maxPax);
  const set = (next: Partial<{ adults: number; children: number; infants: number }>) => {
    const value = { adults, children, infants, ...next };
    value.adults = Math.max(1, Math.min(limit, value.adults));
    value.children = Math.max(0, Math.min(limit - value.adults, value.children));
    value.infants = Math.max(0, Math.min(value.adults, limit - value.adults - value.children, value.infants));
    onChange(value);
  };
  const Row = ({ label, hint, value, type }: { label: string; hint: string; value: number; type: "adults" | "children" | "infants" }) => (
    <div className="pax-row">
      <div className="pax-label"><strong>{label}</strong><span>{hint}</span></div>
      <div className="stepper-controls">
        <button type="button" aria-label={`Giảm ${label}`} disabled={disabled || value <= (type === "adults" ? 1 : 0)} onClick={() => set({ [type]: value - 1 })}>
          <Icon name="minus" size={14} />
        </button>
        <span aria-live="polite">{value}</span>
        <button
          type="button"
          aria-label={`Tăng ${label}`}
          disabled={disabled || total >= limit || seatCount >= limit}
          onClick={() => set({ [type]: value + 1 })}
        >
          <Icon name="plus" size={14} />
        </button>
      </div>
    </div>
  );
  return (
    <div className="pax-stepper">
      <Row label="Người lớn" hint={`Từ ${childMax} tuổi`} value={adults} type="adults" />
      <Row label="Trẻ em" hint={`${infantMax}–${childMax - 1} tuổi`} value={children} type="children" />
      <Row label="Em bé" hint={`Dưới ${infantMax} tuổi`} value={infants} type="infants" />
      <p className="passenger-hint">{ageBandLabel(infantMax, childMax)} · Tối đa {limit} khách cho lần đặt này.</p>
    </div>
  );
}

/* ---------------- Price summary ---------------- */

export function PriceSummary({ quote, loading, error, compact = false }: {
  quote: Quote | null;
  loading?: boolean;
  error?: string | null;
  compact?: boolean;
}) {
  if (loading && !quote) {
    return (
      <div className="quote-summary" aria-busy="true">
        <Skeleton height={12} width="70%" /><Skeleton height={12} width="50%" /><Skeleton height={18} width="85%" />
      </div>
    );
  }
  if (error) return <div className="quote-error" role="alert">{error}</div>;
  if (!quote) return <div className="quote-loading">Chọn ngày khởi hành để xem giá.</div>;
  return (
    <div className="quote-summary">
      {quote.lines.map((line) => (
        <div key={line.type} className="quote-line">
          <span>
            {line.type === "adult" ? "Người lớn" : line.type === "child" ? "Trẻ em" : line.type === "infant" ? "Em bé" : "Phụ thu phòng đơn"}
            {" "}× {line.qty}
          </span>
          <span>{formatVnd(line.amount)}</span>
        </div>
      ))}
      {quote.discountTotal > 0 ? (
        <div className="quote-line" style={{ color: "var(--ok)" }}>
          <span>Giảm giá {quote.coupon?.code ? `(${quote.coupon.code})` : ""}</span>
          <span>−{formatVnd(quote.discountTotal)}</span>
        </div>
      ) : null}
      <div className="quote-line quote-line--total"><span>Tạm tính</span><span>{formatVnd(quote.total)}</span></div>
      {!compact ? (
        <>
          <div className="quote-line">
            <span>{quote.fullPaymentRequired ? "Thanh toán toàn bộ" : `Đặt cọc ${quote.deposit.percent}%`}</span>
            <span>{formatVnd(quote.deposit.dueNow)}</span>
          </div>
          <div className="quote-line"><span>Còn lại</span><span>{formatVnd(quote.deposit.balance)}</span></div>
          {!quote.fullPaymentRequired ? (
            <div className="quote-line"><span>Hạn thanh toán phần còn lại</span><span>{formatDate(quote.balanceDueDate)}</span></div>
          ) : (
            <p className="passenger-hint">Chuyến khởi hành trong {quote.daysToDeparture} ngày — cần thanh toán toàn bộ.</p>
          )}
        </>
      ) : null}
      {quote.seatsLeft > 0 && quote.seatsLeft <= 10 ? <p className="seat-note">Chỉ còn {quote.seatsLeft} chỗ cho chuyến này.</p> : null}
    </div>
  );
}

/* ---------------- Hold countdown ---------------- */

export function HoldCountdown({ expiresAt, onExpire, label = "Chỗ của bạn được giữ đến" }: {
  expiresAt: string | null;
  onExpire?: () => void;
  label?: string;
}) {
  const [remaining, setRemaining] = useState(() => (expiresAt ? new Date(expiresAt).getTime() - serverNow() : 0));
  const fired = useRef(false);
  const announced = useRef<number | null>(null);
  useEffect(() => {
    fired.current = false;
    announced.current = null;
    if (!expiresAt) return;
    const tick = () => {
      const value = new Date(expiresAt).getTime() - serverNow();
      setRemaining(value);
      if (value <= 0 && !fired.current) {
        fired.current = true;
        onExpire?.();
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [expiresAt, onExpire]);

  if (!expiresAt) return null;
  const parts = remainingParts(remaining);
  const warn = remaining < 30 * 60 * 1000;
  const level = remaining <= 0 ? "expired" : warn ? "warn" : "ok";
  const threshold = remaining <= 60 * 1000 ? 1 : remaining <= 5 * 60000 ? 5 : remaining <= 10 * 60000 ? 10 : remaining <= 30 * 60000 ? 30 : null;
  const announce = threshold !== null && announced.current !== threshold;
  if (announce) announced.current = threshold;
  return (
    <div className={`hold-timer ${level === "warn" || level === "expired" ? "hold-timer--warn" : ""}`} role="timer">
      <Icon name="clock" size={15} />
      {level === "expired" ? (
        <span>Đã hết thời gian giữ chỗ</span>
      ) : (
        <span>{label} {new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(expiresAt))} — còn <time>{parts.label}</time></span>
      )}
      <span className="sr-only" aria-live="polite">
        {announce && level !== "expired" ? `Còn ${threshold} phút để hoàn tất thanh toán.` : ""}
      </span>
    </div>
  );
}

/* ---------------- Step indicator ---------------- */

export function StepIndicator({ current, steps }: { current: number; steps: string[] }) {
  return (
    <ol className="steps" aria-label="Tiến trình đặt tour">
      {steps.map((label, index) => {
        const step = index + 1;
        return (
          <li key={label} className={`step ${step === current ? "step--active" : ""} ${step < current ? "step--done" : ""}`} aria-current={step === current ? "step" : undefined}>
            <span className="step-num">{step < current ? <Icon name="check" size={14} /> : step}</span>
            <span>{label}</span>
            {step < steps.length ? <span className="step-sep" aria-hidden="true" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------- Passenger form ---------------- */

export interface PassengerDraft extends PassengerInput {
  key: string;
}

export function PassengerForm({ passengers, onChange, errors, tour, departureDate, contact, onContactChange, contactErrors, onUseMe }: {
  passengers: PassengerDraft[];
  onChange: (index: number, patch: Partial<PassengerDraft>) => void;
  errors: Record<string, string>;
  tour: TourDetail;
  departureDate: string;
  contact: { fullName: string; email: string; phone: string };
  onContactChange: (patch: Partial<{ fullName: string; email: string; phone: string }>) => void;
  contactErrors: Record<string, string>;
  onUseMe: () => void;
}) {
  return (
    <>
      <div className="checkout-section">
        <h2>Người liên hệ</h2>
        <p>Thông tin dùng để gửi xác nhận và liên hệ khi cần thiết.</p>
        <div className="form-grid">
          <Field label="Họ và tên" htmlFor="contact-name" required error={contactErrors.fullName}>
            <input id="contact-name" className="input" value={contact.fullName} onChange={(event) => onContactChange({ fullName: event.target.value })} autoComplete="name" />
          </Field>
          <Field label="Email" htmlFor="contact-email" required error={contactErrors.email}>
            <input id="contact-email" type="email" className="input" value={contact.email} onChange={(event) => onContactChange({ email: event.target.value })} autoComplete="email" />
          </Field>
          <Field label="Số điện thoại" htmlFor="contact-phone" required error={contactErrors.phone} hint="9–11 chữ số, chấp nhận +84.">
            <input id="contact-phone" type="tel" className="input" value={contact.phone} onChange={(event) => onContactChange({ phone: event.target.value })} autoComplete="tel" />
          </Field>
        </div>
      </div>

      <div className="checkout-section">
        <h2>Danh sách hành khách</h2>
        <p>Loại khách được tính tự động theo ngày sinh tại ngày khởi hành {formatDate(departureDate)}.</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onUseMe} style={{ marginBottom: 12 }}>
          <Icon name="user" size={14} /> Dùng thông tin của tôi cho hành khách 1
        </button>
        {passengers.map((passenger, index) => {
          const type = passenger.dateOfBirth ? classifyPassenger(passenger.dateOfBirth, departureDate, tour.ageInfantMax, tour.ageChildMax) : null;
          const prefix = `passengers.${index}`;
          return (
            <div className="passenger-card" key={passenger.key}>
              <div className="passenger-card-head">
                <strong>Hành khách {index + 1} {index === 0 ? "(người đại diện)" : ""}</strong>
                {type ? <span className={`passenger-type passenger-type--${type}`}>{classLabel(type)}</span> : <span className="passenger-type">Chưa nhập ngày sinh</span>}
              </div>
              <div className="form-grid">
                <Field label="Họ và tên" htmlFor={`${prefix}-name`} required error={errors[`${prefix}.fullName`]}>
                  <input
                    id={`${prefix}-name`}
                    className="input"
                    value={passenger.fullName}
                    onChange={(event) => onChange(index, { fullName: event.target.value })}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Giới tính" htmlFor={`${prefix}-gender`} required error={errors[`${prefix}.gender`]}>
                  <select id={`${prefix}-gender`} className="input" value={passenger.gender} onChange={(event) => onChange(index, { gender: event.target.value as PassengerDraft["gender"] })}>
                    <option value="female">Nữ</option>
                    <option value="male">Nam</option>
                    <option value="other">Khác</option>
                  </select>
                </Field>
                <Field label="Ngày sinh" htmlFor={`${prefix}-dob`} required error={errors[`${prefix}.dateOfBirth`]} hint="Dùng để xác định loại khách và giá.">
                  <input
                    id={`${prefix}-dob`}
                    type="date"
                    className="input"
                    max={todayIso()}
                    value={passenger.dateOfBirth}
                    onChange={(event) => onChange(index, { dateOfBirth: event.target.value })}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Quốc tịch" htmlFor={`${prefix}-nationality`}>
                  <input
                    id={`${prefix}-nationality`}
                    className="input"
                    value={passenger.nationality || "Việt Nam"}
                    onChange={(event) => onChange(index, { nationality: event.target.value })}
                    autoComplete="country-name"
                  />
                </Field>
                {tour.requiresIdDocument ? (
                  <Field label="Số CCCD/CMND" htmlFor={`${prefix}-id`} required error={errors[`${prefix}.idNumber`]} hint="9 hoặc 12 chữ số. Được che khi hiển thị.">
                    <input
                      id={`${prefix}-id`}
                      className="input"
                      value={passenger.idNumber || ""}
                      onChange={(event) => onChange(index, { idNumber: event.target.value })}
                      autoComplete="off"
                      inputMode="numeric"
                    />
                  </Field>
                ) : null}
                {tour.requiresPassport ? (
                  <Field label="Số hộ chiếu" htmlFor={`${prefix}-passport`} required error={errors[`${prefix}.passportNumber`]} hint="6–9 ký tự chữ và số.">
                    <input
                      id={`${prefix}-passport`}
                      className="input"
                      value={passenger.passportNumber || ""}
                      onChange={(event) => onChange(index, { passportNumber: event.target.value.toUpperCase() })}
                      autoComplete="off"
                    />
                  </Field>
                ) : null}
                <Field label="Yêu cầu đặc biệt" htmlFor={`${prefix}-request`} className="field--full" hint="Ăn chay, dị ứng, xe lăn… Tối đa 300 ký tự.">
                  <input
                    id={`${prefix}-request`}
                    className="input"
                    maxLength={300}
                    value={passenger.specialRequest || ""}
                    onChange={(event) => onChange(index, { specialRequest: event.target.value })}
                    autoComplete="off"
                  />
                </Field>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------------- Coupon input ---------------- */

export function CouponInput({ value, onChange, onApply, loading, result, error }: {
  value: string;
  onChange: (value: string) => void;
  onApply: () => void;
  loading?: boolean;
  result?: Quote["coupon"];
  error?: string | null;
}) {
  return (
    <div>
      <div className="coupon-row">
        <Field label="Mã giảm giá" htmlFor="coupon">
          <input
            id="coupon"
            className="input"
            value={value}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            placeholder="VD: SUMMER10"
            autoComplete="off"
          />
        </Field>
        <button type="button" className="btn btn-outline" onClick={onApply} disabled={loading || !value.trim()} style={{ marginTop: 20 }}>
          {loading ? "Đang kiểm tra…" : "Áp dụng"}
        </button>
      </div>
      {result?.valid ? <p className="coupon-feedback coupon-feedback--ok">Mã hợp lệ — giảm {formatVnd(result.discount)}.</p> : null}
      {result && !result.valid ? <p className="coupon-feedback coupon-feedback--error">Mã không áp dụng được. Bạn vẫn có thể đặt tour không kèm mã.</p> : null}
      {error ? <p className="coupon-feedback coupon-feedback--error">{error}</p> : null}
    </div>
  );
}

/* ---------------- Payment components ---------------- */

export function PaymentMethodPicker({ methods, value, onChange, disabled }: {
  methods: { id: string; label: string; description: string; enabled: boolean }[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="payment-options">
      {methods.map((method) => (
        <label key={method.id} className={`radio-card ${!method.enabled ? "radio-card--disabled" : ""}`}>
          <input
            type="radio"
            name="payment-method"
            value={method.id}
            checked={value === method.id}
            onChange={() => onChange(method.id)}
            disabled={disabled || !method.enabled}
          />
          <span style={{ display: "grid", gap: 2 }}>
            <strong>{method.label} {!method.enabled ? <span className="chip chip--muted chip--sm">Bảo trì</span> : null}</strong>
            <span>{method.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

export function BankTransferPanel({ bankInfo, bookingCode, onProof, uploading, proofPreview }: {
  bankInfo: { bank: string; bin?: string; accountName: string; accountNumber: string; branch: string; amount: number; content: string };
  bookingCode: string;
  onProof: (dataUrl: string) => void;
  uploading?: boolean;
  proofPreview?: string | null;
}) {
  const [fileError, setFileError] = useState<string | null>(null);
  const [qrFallback, setQrFallback] = useState(false);
  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setFileError(null);
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setFileError("Chỉ nhận ảnh PNG, JPG hoặc WEBP.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setFileError("Ảnh tối đa 3MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onProof(String(reader.result || ""));
    reader.readAsDataURL(file);
  };
  const bin = bankInfo.bin || "970407";
  const account = bankInfo.accountNumber.replace(/\s/g, "");
  const vietQr = `https://img.vietqr.io/image/${bin}-${account}-compact2.png?amount=${bankInfo.amount}&addInfo=${encodeURIComponent(bankInfo.content)}&accountName=${encodeURIComponent(bankInfo.accountName)}`;
  const fallbackQr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${bankInfo.content}|${bankInfo.amount}`)}`;
  return (
    <div className="bank-panel">
      <Notice tone="info" title="Chuyển khoản ngân hàng">
        Đơn sẽ được xác nhận sau khi kế toán đối chiếu chứng từ (thường trong giờ làm việc). Vui lòng giữ nguyên số tiền và nội dung.
      </Notice>
      <div className="qr-box"><img src={qrFallback ? fallbackQr : vietQr} alt={`Mã VietQR chuyển khoản cho đơn ${bookingCode}`} loading="lazy" onError={() => setQrFallback(true)} /></div>
      <div className="bank-row"><span>Ngân hàng</span><strong>{bankInfo.bank}</strong></div>
      <div className="bank-row"><span>Chủ tài khoản</span><strong>{bankInfo.accountName}</strong></div>
      <div className="bank-row"><span>Số tài khoản</span><span><strong>{bankInfo.accountNumber}</strong> <CopyButton value={bankInfo.accountNumber} /></span></div>
      <div className="bank-row"><span>Số tiền</span><span><strong>{formatVnd(bankInfo.amount)}</strong> <CopyButton value={String(bankInfo.amount)} /></span></div>
      <div className="bank-row"><span>Nội dung</span><span><strong>{bankInfo.content}</strong> <CopyButton value={bankInfo.content} /></span></div>
      <div className="upload-zone">
        <strong>Đã chuyển khoản? Tải ảnh chứng từ</strong>
        <p className="field-hint">Ảnh PNG/JPG/WEBP, tối đa 3MB.</p>
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} aria-label="Tải ảnh chứng từ chuyển khoản" />
        {uploading ? <p className="field-hint">Đang tải chứng từ…</p> : null}
        {fileError ? <p className="field-error" role="alert">{fileError}</p> : null}
        {proofPreview ? <img src={proofPreview} alt="Xem trước chứng từ" style={{ maxHeight: 160, margin: "10px auto 0", borderRadius: 8 }} /> : null}
      </div>
      <p className="passenger-hint">Hotline hỗ trợ: 1900 6868. Không chia sẻ mã OTP cho bất kỳ ai.</p>
    </div>
  );
}

/* ---------------- Passenger totals helper ---------------- */

export function paxSummary(adults: number, children: number, infants: number): string {
  return formatPax(adults, children, infants);
}

export function validatePassengerDrafts(passengers: PassengerDraft[], tour: TourDetail): Record<string, string> {
  const errors: Record<string, string> = {};
  passengers.forEach((passenger, index) => {
    const prefix = `passengers.${index}`;
    if (passenger.fullName.trim().length < 2) errors[`${prefix}.fullName`] = "Nhập họ tên hành khách.";
    if (!passenger.gender) errors[`${prefix}.gender`] = "Chọn giới tính.";
    if (!validDob(passenger.dateOfBirth)) errors[`${prefix}.dateOfBirth`] = "Ngày sinh không hợp lệ.";
    if (tour.requiresIdDocument && !/^\d{9}$|^\d{12}$/.test(passenger.idNumber || "")) errors[`${prefix}.idNumber`] = "CCCD gồm 9 hoặc 12 chữ số.";
    if (tour.requiresPassport && !/^[A-Z0-9]{6,9}$/.test(passenger.passportNumber || "")) errors[`${prefix}.passportNumber`] = "Hộ chiếu 6–9 ký tự chữ và số.";
  });
  return errors;
}

export function validateContactDraft(contact: { fullName: string; email: string; phone: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (contact.fullName.trim().length < 2) errors.fullName = "Nhập họ tên người liên hệ.";
  if (!validEmail(contact.email)) errors.email = "Email chưa đúng định dạng.";
  if (!validPhone(normalizePhoneInput(contact.phone))) errors.phone = "Số điện thoại chưa đúng định dạng.";
  return errors;
}
