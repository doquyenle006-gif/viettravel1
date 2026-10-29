import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { AdminBookingRow, AdminDepartureRow, Meta } from "../../types";
import { api, isApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { useSession } from "../../lib/session";
import { formatDate, formatDateTime, formatVnd } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { Icon } from "../../components/Icon";
import { DataTable, EmptyState, ErrorState, Field, Notice, Skeleton, StatusChip, Tabs } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { AdminHeader, AdminPagination, CHANNEL_LABELS, useAdminParams } from "./shared";

interface TourOption { id: number; name: string }

interface ChangeRequestRow {
  id: number;
  bookingId: number;
  type: "cancel" | "change_date" | "change_pax" | "transfer" | "update_passenger";
  status: string;
  bookingCode: string;
  customerName: string;
  customerEmail: string;
  departureDate: string;
  tourName: string;
  requesterName: string;
  feeQuote: { fee?: number; amountDue?: number; refund?: number; daysToDeparture?: number; feePercent?: number } | null;
  payload: { newDepartureId?: number; reasonCode?: string; note?: string; from?: string; to?: string };
  createdAt: string;
}

export default function AdminBookingsPage() {
  const { get, update, setPage } = useAdminParams();
  const { user } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const tab = get("tab", "bookings");
  const tours = useApi<TourOption[]>("/admin/tours?perPage=100", []);
  const [q, setQ] = useState(get("q"));
  const [createOpen, setCreateOpen] = useState(false);
  const [departures, setDepartures] = useState<AdminDepartureRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [rejectRequest, setRejectRequest] = useState<ChangeRequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const page = Number(get("page", "1"));
  const canUpdate = user?.permissions.includes("booking:update") ?? false;
  const isGuide = user?.roles.includes("guide") ?? false;

  const query = new URLSearchParams();
  for (const key of ["q", "status", "paymentStatus", "tourId", "channel", "overdue", "from", "to"]) if (get(key)) query.set(key, get(key));
  query.set("page", String(page));
  query.set("perPage", "20");
  const bookings = useApi<AdminBookingRow[]>(`/admin/bookings?${query.toString()}`, [get("q"), get("status"), get("paymentStatus"), get("tourId"), get("channel"), get("overdue"), get("from"), get("to"), page]);
  const changeQuery = new URLSearchParams();
  if (get("requestStatus")) changeQuery.set("status", get("requestStatus"));
  changeQuery.set("page", String(Number(get("requestPage", "1"))));
  changeQuery.set("perPage", "20");
  const requests = useApi<ChangeRequestRow[]>(`/admin/change-requests?${changeQuery.toString()}`, [get("requestStatus"), get("requestPage")]);
  const meta = bookings.meta as Meta | undefined;
  const requestsMeta = requests.meta as Meta | undefined;

  const [form, setForm] = useState({
    departureId: "", contactName: "", contactEmail: "", contactPhone: "",
    channel: "counter", internalNote: "", adults: 2, children: 0, infants: 0,
    passengers: [] as { fullName: string; gender: "female" | "male" | "other"; dateOfBirth: string }[],
  });

  useEffect(() => {
    const total = form.adults + form.children + form.infants;
    setForm((current) => {
      if (current.passengers.length === total) return current;
      const passengers = [...current.passengers];
      while (passengers.length < total) passengers.push({ fullName: "", gender: "female", dateOfBirth: "" });
      return { ...current, passengers: passengers.slice(0, total) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.adults, form.children, form.infants]);

  const openCreate = async () => {
    setCreateOpen(true);
    setFormError(null);
    if (!departures.length) {
      try {
        const list = await api<AdminDepartureRow[]>("/admin/departures?status=open&perPage=100");
        setDepartures(list);
      } catch (err) {
        setFormError(isApiError(err) ? err.message : "Chưa tải được lịch khởi hành.");
      }
    }
  };

  const createBooking = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const result = await api<{ code: string }>("/admin/bookings", {
        method: "POST",
        body: {
          departureId: Number(form.departureId),
          contact: { fullName: form.contactName, email: form.contactEmail, phone: form.contactPhone },
          passengers: form.passengers,
          channel: form.channel, internalNote: form.internalNote || null,
        },
      });
      setCreateOpen(false);
      toast.success(`Đã tạo đơn ${result.code}.`);
      navigate(`/admin/bookings/${result.code}`);
    } catch (err) {
      setFormError(isApiError(err) ? err.message : "Chưa tạo được đơn.");
    } finally {
      setSaving(false);
    }
  };

  const approveRequest = async (request: ChangeRequestRow) => {
    try {
      await api(`/admin/change-requests/${request.id}/approve`, { method: "POST", body: { note: null } });
      toast.success(request.type === "cancel" ? "Đã duyệt hủy đơn." : "Đã duyệt đổi ngày.");
      requests.reload();
      bookings.reload();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Chưa duyệt được yêu cầu.");
    }
  };

  const reject = async () => {
    if (!rejectRequest) return;
    setRejecting(true);
    try {
      await api(`/admin/change-requests/${rejectRequest.id}/reject`, { method: "POST", body: { note: rejectReason } });
      toast.success("Đã từ chối yêu cầu.");
      setRejectRequest(null);
      setRejectReason("");
      requests.reload();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Chưa từ chối được.");
    } finally {
      setRejecting(false);
    }
  };

  const set = (key: keyof typeof form, value: string | number) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <>
      <Seo title="Đơn hàng" noindex />
      <AdminHeader
        title="Đơn hàng"
        description="Hàng đợi đơn, giữ chỗ, xác nhận, hủy và yêu cầu thay đổi."
        actions={canUpdate ? <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}><Icon name="plus" size={15} /> Tạo đơn hộ khách</button> : null}
      />
      <Tabs
        items={[
          { id: "bookings", label: "Đơn hàng" },
          { id: "requests", label: "Yêu cầu hủy/đổi", badge: requests.data?.length || 0 },
        ]}
        value={tab}
        onChange={(value) => update("tab", value === "bookings" ? "" : value)}
      />

      {tab === "bookings" ? (
        <>
          <div className="admin-toolbar">
            <form className="toolbar-grow" onSubmit={(event) => { event.preventDefault(); update("q", q.trim()); }} style={{ display: "flex", gap: 8 }}>
              <input className="input" placeholder="Mã đơn, tên, email, SĐT, tour…" aria-label="Tìm đơn" value={q} onChange={(event) => setQ(event.target.value)} />
              <button type="submit" className="btn btn-outline btn-sm">Tìm</button>
            </form>
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="field-hint">Trạng thái</span>
              <select className="input" value={get("status")} onChange={(event) => update("status", event.target.value)}>
                <option value="">Tất cả</option><option value="pending">Chờ xử lý</option><option value="confirmed">Đã xác nhận</option>
                <option value="completed">Hoàn thành</option><option value="cancelled">Đã hủy</option><option value="expired">Hết hạn</option>
              </select>
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="field-hint">Thanh toán</span>
              <select className="input" value={get("paymentStatus")} onChange={(event) => update("paymentStatus", event.target.value)}>
                <option value="">Tất cả</option><option value="unpaid">Chưa thanh toán</option><option value="deposit_paid">Đã cọc</option>
                <option value="paid">Đã thanh toán đủ</option><option value="partially_refunded">Hoàn một phần</option><option value="refunded">Đã hoàn</option>
              </select>
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="field-hint">Tour</span>
              <select className="input" value={get("tourId")} onChange={(event) => update("tourId", event.target.value)}>
                <option value="">Tất cả tour</option>
                {(tours.data || []).map((tour) => <option key={tour.id} value={tour.id}>{tour.name}</option>)}
              </select>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={get("overdue") === "balance"} onChange={(event) => update("overdue", event.target.checked ? "balance" : "")} />
              <span>Quá hạn thanh toán</span>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={get("overdue") === "hold"} onChange={(event) => update("overdue", event.target.checked ? "hold" : "")} />
              <span>Sắp hết hạn giữ chỗ</span>
            </label>
          </div>

          {bookings.loading && !bookings.data ? <Skeleton height={300} /> : bookings.error ? <ErrorState error={bookings.error} onRetry={bookings.reload} /> : (
            <>
              <DataTable
                rows={bookings.data || []}
                rowKey={(row) => row.code}
                onRowClick={(row) => navigate(`/admin/bookings/${row.code}`)}
                columns={[
                  { key: "code", header: "Mã / ngày tạo", cell: (row) => <><span className="row-title">{row.code}</span><span className="row-sub">{formatDateTime(row.createdAt)}</span></> },
                  { key: "customer", header: "Khách", cell: (row) => <>{row.customerName}<span className="row-sub">{row.customerPhone} · {CHANNEL_LABELS[row.channel] || row.channel}</span></> },
                  { key: "tour", header: "Tour / khởi hành", cell: (row) => <>{row.tour.name}<span className="row-sub">{row.departureDate ? formatDate(row.departureDate) : "—"}</span></> },
                  { key: "pax", header: "Khách", cell: (row) => `${row.adults}NL · ${row.children}TE · ${row.infants}EB` },
                  { key: "total", header: "Tổng / đã thu", align: "right", cell: (row) => isGuide ? "—" : <>{formatVnd(row.total)}<span className="row-sub">Đã thu {formatVnd(row.paid)}</span></> },
                  { key: "status", header: "Trạng thái", cell: (row) => <><StatusChip status={row.status} kind="booking" audience="admin" size="sm" /><div style={{ marginTop: 3 }}><StatusChip status={row.paymentStatus} kind="payment" size="sm" /></div></> },
                  { key: "deadline", header: "Hạn", cell: (row) => <>{row.holdExpiresAt ? `Giữ đến ${formatDateTime(row.holdExpiresAt)}` : row.balanceDueDate ? `Trả đủ ${formatDate(row.balanceDueDate)}` : "—"}{row.remaining > 0 && row.status === "confirmed" ? <span className="row-sub" style={{ color: "var(--danger)" }}>Còn {formatVnd(row.remaining)}</span> : null}</> },
                  { key: "actions", header: "", align: "right", cell: (row) => <Link to={`/admin/bookings/${row.code}`} className="btn btn-ghost btn-sm" onClick={(event) => event.stopPropagation()}>Chi tiết</Link> },
                ]}
                empty={<EmptyState icon="ticket" title="Không có đơn phù hợp" description="Thử đổi bộ lọc hoặc từ khóa." />}
              />
              <AdminPagination page={meta?.page || page} totalPages={meta?.totalPages || 1} total={meta?.total} perPage={meta?.perPage} onChange={setPage} />
            </>
          )}
        </>
      ) : (
        <div style={{ marginTop: 16 }}>
          <div className="admin-toolbar">
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="field-hint">Trạng thái yêu cầu</span>
              <select className="input" value={get("requestStatus")} onChange={(event) => update("requestStatus", event.target.value)}>
                <option value="">Tất cả</option><option value="submitted">Chờ duyệt</option><option value="completed">Hoàn tất</option><option value="rejected">Từ chối</option>
              </select>
            </label>
          </div>
          {requests.loading && !requests.data ? <Skeleton height={240} /> : requests.error ? <ErrorState error={requests.error} onRetry={requests.reload} /> : (
            <>
              <DataTable
                rows={requests.data || []}
                rowKey={(row) => row.id}
                columns={[
                  { key: "booking", header: "Đơn", cell: (row) => <Link to={`/admin/bookings/${row.bookingCode}`} className="row-title">{row.bookingCode}</Link> },
                  { key: "type", header: "Loại", cell: (row) => row.type === "cancel" ? "Hủy đơn" : row.type === "change_date" ? "Đổi ngày" : row.type },
                  { key: "customer", header: "Khách", cell: (row) => <>{row.customerName}<span className="row-sub">{row.tourName} · {formatDate(row.departureDate)}</span></> },
                  { key: "fee", header: "Phí / chênh lệch", align: "right", cell: (row) => <>{formatVnd(row.feeQuote?.fee || 0)}<span className="row-sub">Cần thu {formatVnd(row.feeQuote?.amountDue || 0)}</span></> },
                  { key: "status", header: "Trạng thái", cell: (row) => <StatusChip status={row.status} kind="change" size="sm" /> },
                  { key: "created", header: "Gửi lúc", cell: (row) => formatDateTime(row.createdAt) },
                  {
                    key: "actions", header: "", align: "right",
                    cell: (row) => row.status === "submitted" ? (
                      <span className="table-actions">
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => approveRequest(row)}>Duyệt</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRejectRequest(row); setRejectReason(""); }}>Từ chối</button>
                      </span>
                    ) : "—",
                  },
                ]}
                empty={<EmptyState icon="refresh" title="Không có yêu cầu" description="Yêu cầu hủy/đổi từ khách sẽ xuất hiện tại đây." />}
              />
              <AdminPagination page={requestsMeta?.page || 1} totalPages={requestsMeta?.totalPages || 1} total={requestsMeta?.total} perPage={requestsMeta?.perPage} onChange={(value) => update("requestPage", String(value), false)} />
            </>
          )}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Tạo đơn hộ khách"
        description="Dùng cho khách tại quầy/điện thoại. Đơn sẽ ở trạng thái giữ chỗ và gửi email hướng dẫn thanh toán."
        size="lg"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(false)}>Hủy</button><button type="button" className="btn btn-primary" onClick={createBooking} disabled={saving}>{saving ? "Đang tạo…" : "Tạo đơn"}</button></>}
      >
        {formError ? <Notice tone="danger">{formError}</Notice> : null}
        <div className="form-grid-2">
          <Field label="Lịch khởi hành" htmlFor="admin-departure" required className="field--full">
            <select id="admin-departure" className="input" value={form.departureId} onChange={(event) => set("departureId", event.target.value)}>
              <option value="">Chọn lịch còn chỗ</option>
              {departures.filter((departure) => departure.status === "open" && departure.seatsLeft > 0).map((departure) => (
                <option key={departure.id} value={departure.id}>{formatDate(departure.departureDate)} — {departure.tourName} — còn {departure.seatsLeft} chỗ</option>
              ))}
            </select>
          </Field>
          <Field label="Họ tên người liên hệ" htmlFor="admin-name" required><input id="admin-name" className="input" value={form.contactName} onChange={(event) => set("contactName", event.target.value)} /></Field>
          <Field label="Email" htmlFor="admin-email" required><input id="admin-email" type="email" className="input" value={form.contactEmail} onChange={(event) => set("contactEmail", event.target.value)} /></Field>
          <Field label="Số điện thoại" htmlFor="admin-phone" required><input id="admin-phone" type="tel" className="input" value={form.contactPhone} onChange={(event) => set("contactPhone", event.target.value)} /></Field>
          <Field label="Kênh bán" htmlFor="admin-channel">
            <select id="admin-channel" className="input" value={form.channel} onChange={(event) => set("channel", event.target.value)}>
              <option value="counter">Tại quầy</option><option value="phone">Điện thoại</option><option value="agent">Đại lý</option>
            </select>
          </Field>
          <Field label="Người lớn" htmlFor="admin-adults"><input id="admin-adults" type="number" min={1} max={20} className="input" value={form.adults} onChange={(event) => set("adults", Math.max(1, Number(event.target.value)))} /></Field>
          <Field label="Trẻ em" htmlFor="admin-children"><input id="admin-children" type="number" min={0} max={20} className="input" value={form.children} onChange={(event) => set("children", Number(event.target.value))} /></Field>
          <Field label="Em bé" htmlFor="admin-infants"><input id="admin-infants" type="number" min={0} max={20} className="input" value={form.infants} onChange={(event) => set("infants", Number(event.target.value))} /></Field>
          <Field label="Ghi chú nội bộ" htmlFor="admin-note" className="field--full"><input id="admin-note" className="input" value={form.internalNote} onChange={(event) => set("internalNote", event.target.value)} /></Field>
        </div>
        <h3 style={{ fontSize: 13, marginTop: 12 }}>Hành khách</h3>
        {form.passengers.map((passenger, index) => (
          <div key={index} className="itinerary-editor-row">
            <div className="form-grid-3">
              <Field label={`Họ tên #${index + 1}`} htmlFor={`admin-p-${index}`} required>
                <input id={`admin-p-${index}`} className="input" value={passenger.fullName} onChange={(event) => setForm({ ...form, passengers: form.passengers.map((row, idx) => idx === index ? { ...row, fullName: event.target.value } : row) })} />
              </Field>
              <Field label="Giới tính" htmlFor={`admin-g-${index}`}>
                <select id={`admin-g-${index}`} className="input" value={passenger.gender} onChange={(event) => setForm({ ...form, passengers: form.passengers.map((row, idx) => idx === index ? { ...row, gender: event.target.value as "female" | "male" | "other" } : row) })}>
                  <option value="female">Nữ</option><option value="male">Nam</option><option value="other">Khác</option>
                </select>
              </Field>
              <Field label="Ngày sinh" htmlFor={`admin-d-${index}`} required>
                <input id={`admin-d-${index}`} type="date" className="input" max={new Date().toISOString().slice(0, 10)} value={passenger.dateOfBirth} onChange={(event) => setForm({ ...form, passengers: form.passengers.map((row, idx) => idx === index ? { ...row, dateOfBirth: event.target.value } : row) })} />
              </Field>
            </div>
          </div>
        ))}
      </Modal>

      <Modal
        open={Boolean(rejectRequest)}
        onClose={() => setRejectRequest(null)}
        title="Từ chối yêu cầu"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setRejectRequest(null)}>Hủy</button><button type="button" className="btn btn-danger" onClick={reject} disabled={rejecting || rejectReason.trim().length < 5}>{rejecting ? "Đang xử lý…" : "Từ chối"}</button></>}
      >
        <Field label="Lý do từ chối" htmlFor="reject-reason" required hint="Tối thiểu 5 ký tự — sẽ gửi cho khách.">
          <textarea id="reject-reason" className="input textarea" rows={3} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
        </Field>
      </Modal>
    </>
  );
}
