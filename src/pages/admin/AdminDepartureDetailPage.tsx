import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { AdminBookingRow, AdminDepartureRow } from "../../types";
import { api, isApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { useSession } from "../../lib/session";
import { formatDate, formatDateTime, formatVnd, openHtmlDocument } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { Icon } from "../../components/Icon";
import { DataTable, EmptyState, ErrorState, Field, Notice, PageLoader, StatusChip, Tabs } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { AdminHeader, SEVERITY_LABELS, useAdminParams } from "./shared";

interface GuideOption { id: number; fullName: string; phone: string }
interface VehicleOption { id: number; name: string; plate: string; seats: number }
interface SupplierOption { id: number; name: string }

interface Detail {
  departure: AdminDepartureRow;
  tour: { id: number; name: string; slug: string; durationDays: number; durationNights: number };
  bookings: AdminBookingRow[];
  assignments: { id: number; guideId: number | null; vehicleId: number | null; note: string | null; guide: GuideOption | null; vehicle: VehicleOption | null }[];
  costs: { id: number; category: string; amount: number; note: string | null; supplierId: number | null }[];
  costTotal: number;
  revenue: number;
  profit: number;
  incidents: { id: number; type: string; severity: string; description: string; status: string; createdAt: string; resolution?: string | null }[];
  history: { id: number; action: string; createdAt: string; after: Record<string, unknown> | null }[];
  manifestCount: number;
  guideView?: boolean;
}

const COST_CATEGORIES = ["hotel", "restaurant", "transport", "guide", "ticket", "other"];

export default function AdminDepartureDetailPage() {
  const { id } = useParams();
  const { user } = useSession();
  const toast = useToast();
  const { get } = useAdminParams();
  const state = useApi<Detail>(id ? `/admin/departures/${id}` : null, [id]);
  const data = state.data;
  const [tab, setTab] = useState(get("tab", "bookings"));
  const canOps = user?.permissions.includes("operations:manage") ?? false;
  const canManifest = user?.permissions.includes("manifest:read") ?? false;
  const canCheckin = canOps || canManifest;
  const canFullDocs = user?.permissions.includes("export:pii") ?? false;
  const [guideOpen, setGuideOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [goNoGoOpen, setGoNoGoOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guides, setGuides] = useState<GuideOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [mergeOptions, setMergeOptions] = useState<AdminDepartureRow[]>([]);
  const [assignForm, setAssignForm] = useState({ guideId: "", vehicleId: "", note: "" });
  const [costForm, setCostForm] = useState({ category: "hotel", amount: 0, note: "", supplierId: "" });
  const [incidentForm, setIncidentForm] = useState({ type: "vehicle", severity: "medium", description: "" });
  const [goNoGoForm, setGoNoGoForm] = useState({ decision: "run", reason: "", mergeIntoId: "" });
  const [cancelForm, setCancelForm] = useState({ reason: "", reasonCode: "operational" });

  useEffect(() => {
    if (!data) return;
    setAssignForm((current) => ({
      ...current,
      guideId: data.assignments[0]?.guideId ? String(data.assignments[0].guideId) : "",
      vehicleId: data.assignments[0]?.vehicleId ? String(data.assignments[0].vehicleId) : "",
      note: data.assignments[0]?.note || "",
    }));
  }, [data]);

  const loadResources = async () => {
    if (!canOps) return;
    try {
      if (!guides.length) setGuides((await api<GuideOption[]>("/admin/resources/guides")).filter((guide) => guide.id));
      if (!vehicles.length) setVehicles(await api<VehicleOption[]>("/admin/resources/vehicles"));
      if (!suppliers.length) setSuppliers(await api<SupplierOption[]>("/admin/resources/suppliers"));
      if (!mergeOptions.length && data) {
        const list = await api<AdminDepartureRow[]>(`/admin/departures?tourId=${data.tour.id}&perPage=100`);
        setMergeOptions(list.filter((row) => row.id !== data.departure.id && ["open", "full"].includes(row.status) && row.seatsLeft > 0));
      }
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Chưa tải được nguồn lực.");
    }
  };

  const openAssign = async () => { setGuideOpen(true); setError(null); await loadResources(); };
  const openCost = async () => { setCostOpen(true); setError(null); await loadResources(); };
  const openGoNoGo = async () => { setGoNoGoOpen(true); setError(null); await loadResources(); };

  const updateStatus = async (status: "open" | "closed") => {
    if (!data) return;
    setBusy(true);
    try {
      await api(`/admin/departures/${data.departure.id}`, { method: "PATCH", body: { status, version: data.departure.version } });
      toast.success(status === "open" ? "Đã mở bán chuyến." : "Đã đóng bán chuyến.");
      state.reload();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Chưa đổi được trạng thái.");
    } finally { setBusy(false); }
  };

  const saveAssignment = async () => {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/departures/${data.departure.id}/assignment`, {
        method: "POST",
        body: { guideId: assignForm.guideId ? Number(assignForm.guideId) : null, vehicleId: assignForm.vehicleId ? Number(assignForm.vehicleId) : null, note: assignForm.note || null },
      });
      setGuideOpen(false);
      toast.success("Đã phân công nguồn lực.");
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa phân công được."); }
    finally { setBusy(false); }
  };

  const addCost = async () => {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/departures/${data.departure.id}/costs`, { method: "POST", body: { ...costForm, amount: Number(costForm.amount), supplierId: costForm.supplierId ? Number(costForm.supplierId) : null } });
      setCostOpen(false);
      setCostForm({ category: "hotel", amount: 0, note: "", supplierId: "" });
      toast.success("Đã thêm chi phí.");
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa thêm được chi phí."); }
    finally { setBusy(false); }
  };

  const deleteCost = async (costId: number) => {
    try {
      await api(`/admin/departures/${id}/costs/${costId}`, { method: "DELETE" });
      toast.success("Đã xóa chi phí.");
      state.reload();
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa xóa được."); }
  };

  const addIncident = async () => {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/departures/${data.departure.id}/incidents`, { method: "POST", body: incidentForm });
      setIncidentOpen(false);
      setIncidentForm({ type: "vehicle", severity: "medium", description: "" });
      toast.success("Đã ghi nhận sự cố.");
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa ghi nhận được sự cố."); }
    finally { setBusy(false); }
  };

  const goNoGo = async () => {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/departures/${data.departure.id}/go-no-go`, {
        method: "POST",
        body: { decision: goNoGoForm.decision, reason: goNoGoForm.reason, mergeIntoId: goNoGoForm.mergeIntoId ? Number(goNoGoForm.mergeIntoId) : null },
      });
      setGoNoGoOpen(false);
      toast.success(goNoGoForm.decision === "run" ? "Chuyến đã được đảm bảo khởi hành." : goNoGoForm.decision === "cancel" ? "Đã hủy chuyến và thông báo khách." : "Đã ghép chuyến.");
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa chốt được đoàn."); }
    finally { setBusy(false); }
  };

  const cancelDeparture = async () => {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ affected: string[] }>(`/admin/departures/${data.departure.id}/cancel`, { method: "POST", body: cancelForm });
      setCancelOpen(false);
      toast.success(`Đã hủy chuyến. ${result.affected.length} đơn được chuyển quy trình hoàn tiền.`);
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa hủy được chuyến."); }
    finally { setBusy(false); }
  };

  const manifest = async (full: boolean) => {
    if (!data) return;
    try {
      const result = await api<{ html: string; filename: string }>(`/admin/departures/${data.departure.id}/manifest${full ? "?full=1" : ""}`);
      openHtmlDocument(result.html, result.filename);
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa xuất được manifest."); }
  };

  const checkin = async (bookingId: number, status: "checked_in" | "no_show") => {
    try {
      await api(`/admin/departures/${id}/checkin`, { method: "POST", body: { bookingId, status } });
      toast.success(status === "no_show" ? "Đã ghi nhận no-show." : "Đã điểm danh khách.");
      state.reload();
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa điểm danh được."); }
  };

  if (state.loading && !data) return <PageLoader label="Đang tải chuyến" />;
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!data) return null;
  const dep = data.departure;

  return (
    <>
      <Seo title={`Chuyến ${dep.departureDate}`} noindex />
      <AdminHeader
        title={`${data.tour.name} — ${formatDate(dep.departureDate)}`}
        description={`${dep.meetingTime} · ${dep.meetingPoint} · ${data.manifestCount} khách · ${dep.seatsTaken}/${dep.capacity} chỗ`}
        actions={
          <>
            {(user?.permissions.includes("tour:read")) ? <Link to={`/admin/tours/${data.tour.id}`} className="btn btn-ghost btn-sm">Sửa tour</Link> : null}
            {canManifest ? <button type="button" className="btn btn-outline btn-sm" onClick={() => manifest(false)}><Icon name="printer" size={14} /> Manifest</button> : null}
            {canFullDocs ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => manifest(true)}>In đầy đủ giấy tờ</button> : null}
            {canOps && ["open", "full"].includes(dep.status) ? <button type="button" className="btn btn-outline btn-sm" onClick={() => updateStatus("closed")} disabled={busy}>Đóng bán</button> : null}
            {canOps && ["closed", "draft"].includes(dep.status) ? <button type="button" className="btn btn-outline btn-sm" onClick={() => updateStatus("open")} disabled={busy}>Mở bán</button> : null}
            {canOps && !["cancelled", "completed"].includes(dep.status) ? <button type="button" className="btn btn-accent btn-sm" onClick={openGoNoGo}>Chốt đoàn</button> : null}
            {canOps && !["cancelled", "completed", "departed"].includes(dep.status) ? <button type="button" className="btn btn-danger btn-sm" onClick={() => setCancelOpen(true)}>Hủy chuyến</button> : null}
          </>
        }
      />
      {dep.cancelReason ? <Notice tone="danger" title="Chuyến đã hủy">{dep.cancelReason}</Notice> : null}
      <div className="stat-grid">
        <div className="stat-card stat-card--info"><span>Lấp đầy</span><strong>{dep.seatsTaken}/{dep.capacity}</strong><small>{dep.fillRate}% · tối thiểu {dep.minPaxToRun}</small></div>
        {!data.guideView ? (
          <>
            <div className="stat-card stat-card--ok"><span>Đã thu</span><strong>{formatVnd(dep.collected)}</strong><small>Doanh thu dự kiến {formatVnd(data.revenue)}</small></div>
            <div className="stat-card stat-card--pending"><span>Còn thiếu</span><strong>{formatVnd(dep.outstanding)}</strong><small>{data.bookings.length} đơn</small></div>
            <div className={`stat-card ${data.profit >= 0 ? "stat-card--ok" : "stat-card--danger"}`}><span>Lợi nhuận tạm tính</span><strong>{formatVnd(data.profit)}</strong><small>Chi phí {formatVnd(data.costTotal)}</small></div>
          </>
        ) : null}
      </div>

      <Tabs
        items={[
          { id: "bookings", label: "Đơn & khách", badge: data.bookings.length },
          { id: "operations", label: "Điều hành & chi phí" },
          { id: "incidents", label: "Sự cố", badge: data.incidents.filter((incident) => incident.status === "open").length },
          ...(data.guideView ? [] : [{ id: "history", label: "Lịch sử" }]),
        ]}
        value={tab}
        onChange={setTab}
      />

      <div style={{ marginTop: 16 }}>
        {tab === "bookings" ? (
          <div className="admin-section">
            <div className="panel-head"><h2>Danh sách đơn ({data.bookings.length})</h2><span className="chip chip--info chip--sm">{data.manifestCount} hành khách</span></div>
            <DataTable
              rows={data.bookings}
              rowKey={(row) => row.code}
              columns={[
                { key: "code", header: "Mã đơn", cell: (row) => <Link to={`/admin/bookings/${row.code}`} className="row-title">{row.code}</Link> },
                { key: "customer", header: "Khách", cell: (row) => <>{row.customerName}<span className="row-sub">{row.customerPhone}</span></> },
                { key: "pax", header: "Khách", cell: (row) => `${row.adults}NL · ${row.children}TE · ${row.infants}EB` },
                { key: "status", header: "Trạng thái", cell: (row) => <><StatusChip status={row.status} kind="booking" audience="admin" size="sm" /><div style={{ marginTop: 3 }}><StatusChip status={row.paymentStatus} kind="payment" size="sm" /></div></> },
                { key: "total", header: "Tổng", align: "right", cell: (row) => data.guideView ? "—" : formatVnd(row.total) },
                { key: "paid", header: "Đã thu", align: "right", cell: (row) => data.guideView ? "—" : formatVnd(row.paid) },
                { key: "checkin", header: "Điểm danh", cell: (row) => canCheckin && ["confirmed", "completed"].includes(row.status) ? (
                  <span className="table-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => checkin(row.id, "checked_in")}>Có mặt</button>
                    <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => checkin(row.id, "no_show")}>No-show</button>
                  </span>
                ) : "—" },
              ]}
              empty={<EmptyState icon="ticket" title="Chưa có đơn" />}
            />
          </div>
        ) : null}

        {tab === "operations" ? (
          <div className="admin-detail-layout">
            <div>
              <div className="admin-section">
                <div className="panel-head"><h2>Phân công</h2>{canOps ? <button type="button" className="btn btn-outline btn-sm" onClick={openAssign}><Icon name="users" size={14} /> Phân công</button> : null}</div>
                {data.assignments.length ? data.assignments.map((assignment) => (
                  <div key={assignment.id} className="admin-kv">
                    <div><span>Hướng dẫn viên</span><strong>{assignment.guide?.fullName || "Chưa gán"} {assignment.guide ? `· ${assignment.guide.phone}` : ""}</strong></div>
                    <div><span>Xe</span><strong>{assignment.vehicle?.name || "Chưa gán"} {assignment.vehicle ? `· ${assignment.vehicle.plate}` : ""}</strong></div>
                    <div><span>Ghi chú</span><span>{assignment.note || "—"}</span></div>
                  </div>
                )) : <p className="muted">Chưa phân công HDV/xe.</p>}
              </div>
              {!data.guideView ? (
                <div className="admin-section">
                  <div className="panel-head"><h2>Chi phí chuyến</h2>{canOps ? <button type="button" className="btn btn-outline btn-sm" onClick={openCost}><Icon name="plus" size={14} /> Thêm chi phí</button> : null}</div>
                  {data.costs.length ? (
                    <div className="table-wrap"><table className="data-table">
                      <thead><tr><th>Loại</th><th>Nhà cung cấp</th><th>Số tiền</th><th>Ghi chú</th><th></th></tr></thead>
                      <tbody>{data.costs.map((cost) => (
                        <tr key={cost.id}>
                          <td>{COST_CATEGORIES.includes(cost.category) ? cost.category : cost.category}</td>
                          <td>{suppliers.find((supplier) => supplier.id === cost.supplierId)?.name || "—"}</td>
                          <td>{formatVnd(cost.amount)}</td>
                          <td>{cost.note || "—"}</td>
                          <td>{canOps ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteCost(cost.id)}><Icon name="trash" size={13} /></button> : null}</td>
                        </tr>
                      ))}</tbody>
                    </table></div>
                  ) : <p className="muted">Chưa ghi nhận chi phí.</p>}
                </div>
              ) : null}
            </div>
            <aside className="admin-card">
              <h2>Phân công chuyến</h2>
              <div className="admin-kv">
                <div><span>HDV</span><strong>{data.assignments[0]?.guide?.fullName || "Chưa gán"}</strong></div>
                <div><span>Xe</span><strong>{data.assignments[0]?.vehicle?.name || "Chưa gán"}</strong></div>
                <div><span>Số khách</span><strong>{data.manifestCount}</strong></div>
              </div>
            </aside>
            {!data.guideView ? (
              <aside className="admin-card">
                <h2>Tổng hợp tài chính</h2>
                <div className="admin-kv">
                  <div><span>Doanh thu dự kiến</span><strong>{formatVnd(data.revenue)}</strong></div>
                  <div><span>Đã thu</span><strong>{formatVnd(dep.collected)}</strong></div>
                  <div><span>Còn phải thu</span><strong>{formatVnd(dep.outstanding)}</strong></div>
                  <div><span>Chi phí</span><strong>{formatVnd(data.costTotal)}</strong></div>
                  <div><span>Lợi nhuận tạm tính</span><strong style={{ color: data.profit >= 0 ? "var(--ok)" : "var(--danger)" }}>{formatVnd(data.profit)}</strong></div>
                </div>
              </aside>
            ) : null}
          </div>
        ) : null}

        {tab === "incidents" ? (
          <div className="admin-section">
            <div className="panel-head"><h2>Sự cố chuyến</h2>{canCheckin ? <button type="button" className="btn btn-outline btn-sm" onClick={() => setIncidentOpen(true)}><Icon name="alert" size={14} /> Ghi nhận</button> : null}</div>
            {data.incidents.length ? (
              <div className="booking-list">
                {data.incidents.map((incident) => (
                  <div key={incident.id} className="admin-alert" style={{ background: incident.status === "open" ? "var(--pending-bg)" : "var(--surface-2)", color: "var(--text)" }}>
                    <Icon name="alert" size={16} />
                    <div style={{ flex: 1 }}>
                      <strong>{incident.type} · {SEVERITY_LABELS[incident.severity] || incident.severity}</strong>
                      <p style={{ fontSize: 12.5 }}>{incident.description}</p>
                      <span className="row-sub">{formatDateTime(incident.createdAt)} · {incident.status === "open" ? "Đang mở" : "Đã xử lý"}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="muted">Không có sự cố.</p>}
          </div>
        ) : null}

        {tab === "history" ? (
          <div className="admin-section">
            <h2>Nhật ký chuyến</h2>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Hành động</th><th>Thời điểm</th><th>Dữ liệu</th></tr></thead>
              <tbody>{data.history.slice().reverse().map((row) => (
                <tr key={row.id}><td>{row.action}</td><td>{formatDateTime(row.createdAt)}</td><td><code style={{ fontSize: 11 }}>{row.after ? JSON.stringify(row.after).slice(0, 140) : "—"}</code></td></tr>
              ))}</tbody>
            </table></div>
          </div>
        ) : null}
      </div>

      <Modal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        title="Phân công hướng dẫn viên & xe"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setGuideOpen(false)}>Hủy</button><button type="button" className="btn btn-primary" onClick={saveAssignment} disabled={busy}>{busy ? "Đang lưu…" : "Lưu phân công"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="Hướng dẫn viên" htmlFor="assign-guide">
          <select id="assign-guide" className="input" value={assignForm.guideId} onChange={(event) => setAssignForm({ ...assignForm, guideId: event.target.value })}>
            <option value="">Chưa gán</option>
            {guides.map((guide) => <option key={guide.id} value={guide.id}>{guide.fullName} · {guide.phone}</option>)}
          </select>
        </Field>
        <Field label="Xe" htmlFor="assign-vehicle">
          <select id="assign-vehicle" className="input" value={assignForm.vehicleId} onChange={(event) => setAssignForm({ ...assignForm, vehicleId: event.target.value })}>
            <option value="">Chưa gán</option>
            {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name} · {vehicle.plate} · {vehicle.seats} chỗ</option>)}
          </select>
        </Field>
        <Field label="Ghi chú" htmlFor="assign-note"><input id="assign-note" className="input" value={assignForm.note} onChange={(event) => setAssignForm({ ...assignForm, note: event.target.value })} /></Field>
        <p className="field-hint">Hệ thống chặn gán trùng lịch HDV/xe và kiểm tra xe đủ chỗ.</p>
      </Modal>

      <Modal
        open={costOpen}
        onClose={() => setCostOpen(false)}
        title="Thêm chi phí chuyến"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setCostOpen(false)}>Hủy</button><button type="button" className="btn btn-primary" onClick={addCost} disabled={busy}>{busy ? "Đang lưu…" : "Thêm chi phí"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="Loại chi phí" htmlFor="cost-category"><select id="cost-category" className="input" value={costForm.category} onChange={(event) => setCostForm({ ...costForm, category: event.target.value })}>{COST_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></Field>
        <Field label="Nhà cung cấp" htmlFor="cost-supplier"><select id="cost-supplier" className="input" value={costForm.supplierId} onChange={(event) => setCostForm({ ...costForm, supplierId: event.target.value })}><option value="">Không chọn</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></Field>
        <Field label="Số tiền (VND)" htmlFor="cost-amount" required><input id="cost-amount" type="number" step="1000" min={0} className="input" value={costForm.amount} onChange={(event) => setCostForm({ ...costForm, amount: Number(event.target.value) })} /></Field>
        <Field label="Ghi chú" htmlFor="cost-note"><input id="cost-note" className="input" value={costForm.note} onChange={(event) => setCostForm({ ...costForm, note: event.target.value })} /></Field>
      </Modal>

      <Modal
        open={incidentOpen}
        onClose={() => setIncidentOpen(false)}
        title="Ghi nhận sự cố"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setIncidentOpen(false)}>Hủy</button><button type="button" className="btn btn-primary" onClick={addIncident} disabled={busy}>{busy ? "Đang lưu…" : "Ghi nhận"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="form-grid-2">
          <Field label="Loại" htmlFor="incident-type"><select id="incident-type" className="input" value={incidentForm.type} onChange={(event) => setIncidentForm({ ...incidentForm, type: event.target.value })}><option value="vehicle">Xe</option><option value="weather">Thời tiết</option><option value="health">Sức khỏe</option><option value="accident">Tai nạn</option><option value="other">Khác</option></select></Field>
          <Field label="Mức độ" htmlFor="incident-severity"><select id="incident-severity" className="input" value={incidentForm.severity} onChange={(event) => setIncidentForm({ ...incidentForm, severity: event.target.value })}><option value="low">Thấp</option><option value="medium">Trung bình</option><option value="high">Cao</option><option value="critical">Nghiêm trọng</option></select></Field>
          <Field label="Mô tả" htmlFor="incident-desc" required className="field--full"><textarea id="incident-desc" className="input textarea" rows={4} value={incidentForm.description} onChange={(event) => setIncidentForm({ ...incidentForm, description: event.target.value })} /></Field>
        </div>
      </Modal>

      <Modal
        open={goNoGoOpen}
        onClose={() => setGoNoGoOpen(false)}
        title="Chốt đoàn"
        description="Quyết định bắt buộc có lý do và được ghi nhật ký."
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setGoNoGoOpen(false)}>Hủy</button><button type="button" className="btn btn-primary" onClick={goNoGo} disabled={busy}>{busy ? "Đang xử lý…" : "Xác nhận"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="Quyết định" htmlFor="gonogo-decision">
          <select id="gonogo-decision" className="input" value={goNoGoForm.decision} onChange={(event) => setGoNoGoForm({ ...goNoGoForm, decision: event.target.value })}>
            <option value="run">Vẫn chạy — đảm bảo khởi hành</option>
            <option value="merge">Ghép sang lịch khác</option>
            <option value="cancel">Hủy chuyến</option>
          </select>
        </Field>
        {goNoGoForm.decision === "merge" ? (
          <Field label="Lịch nhận ghép" htmlFor="gonogo-merge" required>
            <select id="gonogo-merge" className="input" value={goNoGoForm.mergeIntoId} onChange={(event) => setGoNoGoForm({ ...goNoGoForm, mergeIntoId: event.target.value })}>
              <option value="">Chọn lịch cùng tour</option>
              {mergeOptions.map((departure) => <option key={departure.id} value={departure.id}>{formatDate(departure.departureDate)} — còn {departure.seatsLeft} chỗ</option>)}
            </select>
          </Field>
        ) : null}
        <Field label="Lý do" htmlFor="gonogo-reason" required><textarea id="gonogo-reason" className="input textarea" rows={3} value={goNoGoForm.reason} onChange={(event) => setGoNoGoForm({ ...goNoGoForm, reason: event.target.value })} /></Field>
        <p className="field-hint">Hiện có {dep.seatsTaken} khách · tối thiểu cần {dep.minPaxToRun}. Hủy chuyến sẽ hoàn 100% và thông báo khách.</p>
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Hủy chuyến"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setCancelOpen(false)}>Giữ chuyến</button><button type="button" className="btn btn-danger" onClick={cancelDeparture} disabled={busy}>{busy ? "Đang xử lý…" : "Hủy chuyến & hoàn tiền"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Notice tone="danger" title="Hậu quả">
          {data.bookings.filter((booking) => ["pending", "confirmed"].includes(booking.status)).length} đơn đang hiệu lực sẽ bị hủy. Khách được hoàn 100% khoản đã thu, không áp phí hủy, và nhận thông báo ưu tiên cao.
        </Notice>
        <Field label="Lý do hủy" htmlFor="cancel-dep-reason" required><textarea id="cancel-dep-reason" className="input textarea" rows={3} value={cancelForm.reason} onChange={(event) => setCancelForm({ ...cancelForm, reason: event.target.value })} /></Field>
        <Field label="Mã lý do" htmlFor="cancel-dep-code">
          <select id="cancel-dep-code" className="input" value={cancelForm.reasonCode} onChange={(event) => setCancelForm({ ...cancelForm, reasonCode: event.target.value })}>
            <option value="min_pax_not_met">Không đủ khách tối thiểu</option>
            <option value="force_majeure">Bất khả kháng</option>
            <option value="operational">Sự cố vận hành</option>
            <option value="other">Khác</option>
          </select>
        </Field>
        {dep.isGuaranteed ? <Notice tone="warning">Chuyến đã đảm bảo khởi hành. Chỉ super_admin hoặc lý do bất khả kháng mới được hủy.</Notice> : null}
      </Modal>
    </>
  );
}
