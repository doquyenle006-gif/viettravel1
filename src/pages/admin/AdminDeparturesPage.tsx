import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { AdminDepartureRow, Meta } from "../../types";
import { api, isApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { useSession } from "../../lib/session";
import { addDaysIso, formatDate, formatVnd, todayIso } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { Icon } from "../../components/Icon";
import { DataTable, EmptyState, ErrorState, Field, Notice, Skeleton, StatusChip } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { AdminHeader, AdminPagination, useAdminParams } from "./shared";

interface TourOption { id: number; name: string }

const WEEKDAYS = [
  { value: 1, label: "Thứ 2" }, { value: 2, label: "Thứ 3" }, { value: 3, label: "Thứ 4" },
  { value: 4, label: "Thứ 5" }, { value: 5, label: "Thứ 6" }, { value: 6, label: "Thứ 7" }, { value: 0, label: "CN" },
];

interface BulkPreview {
  planned: { departureDate: string; returnDate: string; capacity: number; priceAdult: number; priceChild: number; priceInfant: number }[];
  existing: string[];
  total: number;
}

export default function AdminDeparturesPage() {
  const { get, update, setPage } = useAdminParams();
  const { user } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null);
  const tours = useApi<TourOption[]>("/admin/tours?perPage=100", []);
  const page = Number(get("page", "1"));
  const query = new URLSearchParams();
  for (const key of ["q", "tourId", "status", "from", "to", "attention"]) if (get(key)) query.set(key, get(key));
  query.set("page", String(page));
  query.set("perPage", "30");
  const state = useApi<AdminDepartureRow[]>(`/admin/departures?${query.toString()}`, [get("q"), get("tourId"), get("status"), get("from"), get("to"), get("attention"), page]);
  const meta = state.meta as Meta | undefined;
  const canCreate = user?.permissions.includes("departure:create") ?? false;

  const [form, setForm] = useState({
    tourId: "", departureDate: addDaysIso(todayIso(), 14), capacity: 24, minPaxToRun: 8,
    priceAdult: 3000000, priceChild: 2100000, priceInfant: 0, singleSupplement: 750000,
    meetingPoint: "", meetingTime: "06:30", status: "open",
  });
  const [bulkForm, setBulkForm] = useState({
    tourId: "", fromDate: addDaysIso(todayIso(), 7), toDate: addDaysIso(todayIso(), 90),
    weekdays: [5] as number[], capacity: 24, minPaxToRun: 8, priceAdult: 3000000,
    priceChild: 2100000, priceInfant: 0, singleSupplement: 750000, meetingPoint: "", meetingTime: "06:30",
  });

  useEffect(() => {
    if (tours.data?.length && !form.tourId) setForm((current) => ({ ...current, tourId: String(tours.data?.[0]?.id || "") }));
    if (tours.data?.length && !bulkForm.tourId) setBulkForm((current) => ({ ...current, tourId: String(tours.data?.[0]?.id || "") }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tours.data]);

  const createDeparture = async () => {
    setSaving(true);
    setError(null);
    try {
      await api("/admin/departures", {
        method: "POST",
        body: {
          ...form, tourId: Number(form.tourId),
          capacity: Number(form.capacity), minPaxToRun: Number(form.minPaxToRun),
          priceAdult: Number(form.priceAdult), priceChild: Number(form.priceChild),
          priceInfant: Number(form.priceInfant), singleSupplement: Number(form.singleSupplement),
        },
      });
      setCreateOpen(false);
      toast.success("Đã tạo lịch khởi hành.");
      state.reload();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Chưa tạo được lịch.");
    } finally {
      setSaving(false);
    }
  };

  const previewBulk = async () => {
    setSaving(true);
    setError(null);
    try {
      const data = await api<BulkPreview>("/admin/departures/bulk", { method: "POST", body: { ...bulkForm, tourId: Number(bulkForm.tourId), preview: true } });
      setBulkPreview(data);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Chưa xem trước được.");
    } finally {
      setSaving(false);
    }
  };

  const createBulk = async () => {
    setSaving(true);
    setError(null);
    try {
      const data = await api<{ created: AdminDepartureRow[]; existing: string[] }>("/admin/departures/bulk", { method: "POST", body: { ...bulkForm, tourId: Number(bulkForm.tourId) } });
      setBulkOpen(false);
      setBulkPreview(null);
      toast.success(`Đã tạo ${data.created.length} lịch khởi hành.`);
      state.reload();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Chưa tạo được lịch hàng loạt.");
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof typeof form, type = "number", step = "1000") => (
    <Field label={label} htmlFor={`dep-${key}`}>
      <input id={`dep-${key}`} type={type} step={step} className="input" value={String(form[key])} onChange={(event) => setForm({ ...form, [key]: type === "number" ? Number(event.target.value) : event.target.value })} />
    </Field>
  );

  return (
    <>
      <Seo title="Lịch khởi hành" noindex />
      <AdminHeader
        title="Lịch khởi hành"
        description="Theo dõi tồn chỗ, đóng/mở bán, chốt đoàn và hủy chuyến."
        actions={canCreate ? (
          <>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setBulkOpen(true)}><Icon name="calendar" size={15} /> Tạo hàng loạt</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}><Icon name="plus" size={15} /> Tạo lịch</button>
          </>
        ) : null}
      />
      <div className="admin-toolbar">
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-hint">Tour</span>
          <select className="input" value={get("tourId")} onChange={(event) => update("tourId", event.target.value)}>
            <option value="">Tất cả tour</option>
            {(tours.data || []).map((tour) => <option key={tour.id} value={tour.id}>{tour.name}</option>)}
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-hint">Trạng thái</span>
          <select className="input" value={get("status")} onChange={(event) => update("status", event.target.value)}>
            <option value="">Tất cả</option>
            <option value="open">Đang mở bán</option>
            <option value="full">Hết chỗ</option>
            <option value="closed">Đã đóng bán</option>
            <option value="departed">Đã khởi hành</option>
            <option value="completed">Đã kết thúc</option>
            <option value="cancelled">Đã hủy</option>
            <option value="draft">Nháp</option>
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-hint">Từ ngày</span>
          <input className="input" type="date" value={get("from")} onChange={(event) => update("from", event.target.value)} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-hint">Đến ngày</span>
          <input className="input" type="date" value={get("to")} onChange={(event) => update("to", event.target.value)} />
        </label>
        <label className="checkbox-row" style={{ marginLeft: 4 }}>
          <input type="checkbox" checked={get("attention") === "1"} onChange={(event) => update("attention", event.target.checked ? "1" : "")} />
          <span>Cần chú ý</span>
        </label>
      </div>

      {state.loading && !state.data ? <Skeleton height={300} /> : state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : (
        <>
          <DataTable
            rows={state.data || []}
            rowKey={(row) => row.id}
            onRowClick={(row) => navigate(`/admin/departures/${row.id}`)}
            columns={[
              { key: "date", header: "Ngày đi", cell: (row) => <><span className="row-title">{formatDate(row.departureDate)}</span><span className="row-sub">{row.returnDate ? `Về ${formatDate(row.returnDate)}` : ""} · {row.meetingTime}</span></> },
              { key: "tour", header: "Tour", cell: (row) => row.tourName },
              { key: "status", header: "Trạng thái", cell: (row) => <><StatusChip status={row.status} kind="departure" size="sm" />{row.isGuaranteed ? <span className="chip chip--ok chip--sm" style={{ marginLeft: 4 }}>Đảm bảo</span> : null}</> },
              { key: "fill", header: "Lấp đầy", cell: (row) => <><span className="row-title">{row.seatsTaken}/{row.capacity}</span><span className="row-sub">{row.fillRate}%</span></> },
              { key: "bookings", header: "Đơn", align: "center", cell: (row) => row.bookings },
              ...(user?.roles.includes("guide") ? [] : [
                { key: "revenue", header: "Đã thu", align: "right" as const, cell: (row: AdminDepartureRow) => formatVnd(row.collected) },
                { key: "outstanding", header: "Còn thiếu", align: "right" as const, cell: (row: AdminDepartureRow) => <span style={{ color: row.outstanding > 0 ? "var(--danger)" : undefined }}>{formatVnd(row.outstanding)}</span> },
              ]),
              { key: "actions", header: "", align: "right", cell: (row) => <Link to={`/admin/departures/${row.id}`} className="btn btn-ghost btn-sm" onClick={(event) => event.stopPropagation()}>Chi tiết</Link> },
            ]}
            empty={<EmptyState icon="calendar" title="Chưa có lịch khởi hành" description="Tạo lịch để bắt đầu nhận đơn." action={canCreate ? <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>Tạo lịch</button> : undefined} />}
          />
          <AdminPagination page={meta?.page || page} totalPages={meta?.totalPages || 1} total={meta?.total} perPage={meta?.perPage} onChange={setPage} />
        </>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Tạo lịch khởi hành"
        size="lg"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(false)}>Hủy</button><button type="button" className="btn btn-primary" onClick={createDeparture} disabled={saving}>{saving ? "Đang tạo…" : "Tạo lịch"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="form-grid-2">
          <Field label="Tour" htmlFor="dep-tour" required>
            <select id="dep-tour" className="input" value={form.tourId} onChange={(event) => setForm({ ...form, tourId: event.target.value })}>
              {(tours.data || []).map((tour) => <option key={tour.id} value={tour.id}>{tour.name}</option>)}
            </select>
          </Field>
          <Field label="Ngày khởi hành" htmlFor="dep-date" required>
            <input id="dep-date" type="date" className="input" min={addDaysIso(todayIso(), 1)} value={form.departureDate} onChange={(event) => setForm({ ...form, departureDate: event.target.value })} />
          </Field>
          {field("Sức chứa", "capacity")}
          {field("Khách tối thiểu", "minPaxToRun")}
          {field("Giá người lớn", "priceAdult")}
          {field("Giá trẻ em", "priceChild")}
          {field("Giá em bé", "priceInfant")}
          {field("Phụ thu phòng đơn", "singleSupplement")}
          <Field label="Điểm đón" htmlFor="dep-meeting"><input id="dep-meeting" className="input" value={form.meetingPoint} onChange={(event) => setForm({ ...form, meetingPoint: event.target.value })} placeholder="Mặc định theo tour nếu để trống" /></Field>
          <Field label="Giờ đón" htmlFor="dep-time"><input id="dep-time" className="input" value={form.meetingTime} onChange={(event) => setForm({ ...form, meetingTime: event.target.value })} /></Field>
          <Field label="Trạng thái" htmlFor="dep-status">
            <select id="dep-status" className="input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="draft">Nháp</option>
              <option value="open">Mở bán ngay</option>
            </select>
          </Field>
        </div>
      </Modal>

      <Modal
        open={bulkOpen}
        onClose={() => { setBulkOpen(false); setBulkPreview(null); }}
        title="Tạo lịch hàng loạt"
        description="Chọn khoảng ngày và thứ trong tuần. Hệ thống xem trước các lịch sẽ tạo, bỏ qua lịch đã tồn tại."
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setBulkOpen(false)}>Hủy</button>
            {!bulkPreview ? <button type="button" className="btn btn-outline" onClick={previewBulk} disabled={saving}>Xem trước</button> : null}
            {bulkPreview ? <button type="button" className="btn btn-primary" onClick={createBulk} disabled={saving || !bulkPreview.planned.length}>{saving ? "Đang tạo…" : `Tạo ${bulkPreview.planned.length} lịch`}</button> : null}
          </>
        }
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="form-grid-2">
          <Field label="Tour" htmlFor="bulk-tour" required>
            <select id="bulk-tour" className="input" value={bulkForm.tourId} onChange={(event) => { setBulkForm({ ...bulkForm, tourId: event.target.value }); setBulkPreview(null); }}>
              {(tours.data || []).map((tour) => <option key={tour.id} value={tour.id}>{tour.name}</option>)}
            </select>
          </Field>
          <Field label="Giá người lớn" htmlFor="bulk-price" required><input id="bulk-price" type="number" step="1000" className="input" value={bulkForm.priceAdult} onChange={(event) => setBulkForm({ ...bulkForm, priceAdult: Number(event.target.value) })} /></Field>
          <Field label="Từ ngày" htmlFor="bulk-from"><input id="bulk-from" type="date" className="input" value={bulkForm.fromDate} onChange={(event) => { setBulkForm({ ...bulkForm, fromDate: event.target.value }); setBulkPreview(null); }} /></Field>
          <Field label="Đến ngày" htmlFor="bulk-to"><input id="bulk-to" type="date" className="input" value={bulkForm.toDate} onChange={(event) => { setBulkForm({ ...bulkForm, toDate: event.target.value }); setBulkPreview(null); }} /></Field>
          <Field label="Sức chứa" htmlFor="bulk-capacity"><input id="bulk-capacity" type="number" className="input" value={bulkForm.capacity} onChange={(event) => setBulkForm({ ...bulkForm, capacity: Number(event.target.value) })} /></Field>
          <Field label="Khách tối thiểu" htmlFor="bulk-min"><input id="bulk-min" type="number" className="input" value={bulkForm.minPaxToRun} onChange={(event) => setBulkForm({ ...bulkForm, minPaxToRun: Number(event.target.value) })} /></Field>
          <Field label="Thứ trong tuần" htmlFor="bulk-weekdays" className="field--full">
            <div className="inline-actions" id="bulk-weekdays">
              {WEEKDAYS.map((day) => (
                <label key={day.value} className="checkbox-row">
                  <input type="checkbox" checked={bulkForm.weekdays.includes(day.value)} onChange={(event) => {
                    const weekdays = event.target.checked ? [...bulkForm.weekdays, day.value] : bulkForm.weekdays.filter((value) => value !== day.value);
                    setBulkForm({ ...bulkForm, weekdays });
                    setBulkPreview(null);
                  }} />
                  <span>{day.label}</span>
                </label>
              ))}
            </div>
          </Field>
        </div>
        {bulkPreview ? (
          <div className="admin-section" style={{ marginTop: 14 }}>
            <h3>Xem trước {bulkPreview.planned.length} lịch mới</h3>
            {bulkPreview.existing.length ? <Notice tone="warning">Bỏ qua {bulkPreview.existing.length} lịch đã tồn tại: {bulkPreview.existing.map((date) => formatDate(date)).join(", ")}</Notice> : null}
            <div className="table-wrap" style={{ maxHeight: 260, overflowY: "auto" }}>
              <table className="data-table">
                <thead><tr><th>Ngày đi</th><th>Ngày về</th><th>Chỗ</th><th>Giá người lớn</th></tr></thead>
                <tbody>{bulkPreview.planned.map((row) => (
                  <tr key={row.departureDate}><td>{formatDate(row.departureDate)}</td><td>{formatDate(row.returnDate)}</td><td>{row.capacity}</td><td>{formatVnd(row.priceAdult)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
