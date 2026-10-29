import { useEffect, useState } from "react";
import { api, isApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { formatDateTime } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { Field, Notice, PageLoader } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { AdminHeader } from "./shared";

interface SettingRow { key: string; value: string | number | boolean; label: string; unit: string; description: string; group: string; updatedAt: string }
interface Tier { minDaysBefore: number; maxDaysBefore: number | null; feePercent: number }
interface Policy { id: number; code: string; name: string; description: string; tiers: Tier[]; active: boolean }
interface SettingsData { settings: SettingRow[]; groups: string[]; policies: Policy[] }
interface BackupRow { filename: string; size: number; createdAt: string }
interface BackupData { backups: BackupRow[]; keep: number; intervalHours: number }
interface BackupVerification { filename: string; valid: boolean; errors: string[]; size: number; checksum: string; counts: Record<string, number> }

const fileSize = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;

const GROUP_LABELS: Record<string, string> = {
  hold: "Giữ chỗ", deposit: "Đặt cọc", payment: "Thanh toán", booking: "Đặt chỗ", seat: "Chỗ ngồi",
  departure: "Lịch khởi hành", cancel: "Hủy đơn", change: "Đổi ngày", credit: "Bảo lưu",
  refund: "Hoàn tiền", discount: "Giảm giá", price: "Giá", passenger: "Hành khách",
  invoice: "Hóa đơn", review: "Đánh giá", auth: "Xác thực", ticket: "Hỗ trợ",
  notify: "Thông báo", export: "Xuất dữ liệu", bank: "Ngân hàng", hotline: "Liên hệ", support: "Liên hệ", terms: "Điều khoản",
};

export default function AdminSettingsPage() {
  const toast = useToast();
  const state = useApi<SettingsData>("/admin/settings");
  const backups = useApi<BackupData>("/admin/backups");
  const [values, setValues] = useState<Record<string, string | number | boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState<string | null>(null);
  const [backupCheck, setBackupCheck] = useState<BackupVerification | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyForm, setPolicyForm] = useState({ id: 0, code: "", name: "", description: "", active: true, tiers: [] as Tier[] });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state.data) return;
    setValues(Object.fromEntries(state.data.settings.map((setting) => [setting.key, setting.value])));
  }, [state.data]);

  if (state.loading && !state.data) return <PageLoader label="Đang tải cấu hình" />;
  if (state.error) return <Notice tone="danger">{state.error.message}</Notice>;
  if (!state.data) return null;

  const groups = [...new Set(state.data.settings.map((setting) => setting.group))];

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await api<{ updated: number }>("/admin/settings", { method: "PUT", body: { values } });
      toast.success(result.updated ? `Đã cập nhật ${result.updated} tham số.` : "Không có thay đổi.");
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa lưu được cấu hình."); }
    finally { setSaving(false); }
  };

  const openPolicy = (policy?: Policy) => {
    setPolicyForm(policy ? { ...policy, tiers: policy.tiers.map((tier) => ({ ...tier })) } : { id: 0, code: "", name: "", description: "", active: true, tiers: [{ minDaysBefore: 15, maxDaysBefore: null, feePercent: 10 }] });
    setPolicyOpen(true);
  };

  const savePolicy = async () => {
    setBusy(true);
    setError(null);
    try {
      if (policyForm.id) await api(`/admin/settings/policies/${policyForm.id}`, { method: "PUT", body: policyForm });
      else await api("/admin/settings/policies", { method: "POST", body: policyForm });
      setPolicyOpen(false);
      toast.success("Đã lưu chính sách hủy.");
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa lưu được chính sách."); }
    finally { setBusy(false); }
  };

  const updateTier = (index: number, patch: Partial<Tier>) => {
    setPolicyForm({ ...policyForm, tiers: policyForm.tiers.map((tier, idx) => idx === index ? { ...tier, ...patch } : tier) });
  };

  const createBackupNow = async () => {
    setBackupBusy("create");
    setBackupCheck(null);
    try {
      const result = await api<{ filename: string; size: number }>("/admin/backups", { method: "POST" });
      toast.success(`Đã sao lưu ${result.filename} (${fileSize(result.size)}).`);
      backups.reload();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Chưa tạo được bản sao lưu.");
    } finally {
      setBackupBusy(null);
    }
  };

  const verifyBackupFile = async (filename: string) => {
    setBackupBusy(filename);
    try {
      const result = await api<BackupVerification>(`/admin/backups/${encodeURIComponent(filename)}/verify`, { method: "POST" });
      setBackupCheck(result);
      if (result.valid) toast.success("Bản sao lưu đọc được và đủ bảng dữ liệu.");
      else toast.error("Bản sao lưu không vượt qua kiểm tra.");
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Chưa kiểm tra được bản sao lưu.");
    } finally {
      setBackupBusy(null);
    }
  };

  return (
    <>
      <Seo title="Cài đặt" noindex />
      <AdminHeader
        title="Cài đặt hệ thống"
        description="Tham số nghiệp vụ có mô tả, đơn vị và lịch sử. Thay đổi chỉ áp dụng cho đơn/chuyến tạo sau."
        actions={<button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? "Đang lưu…" : "Lưu thay đổi"}</button>}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Notice tone="warning" title="Giá trị khởi điểm cần được duyệt">
        Các con số dưới đây là mặc định của tài liệu nghiệp vụ. Chủ sản phẩm/pháp chế cần phê duyệt trước khi vận hành thật.
      </Notice>

      {groups.map((group) => (
        <div key={group} className="admin-section">
          <h2>{GROUP_LABELS[group] || group}</h2>
          <div className="form-grid-3">
            {state.data!.settings.filter((setting) => setting.group === group).map((setting) => (
              <Field
                key={setting.key}
                label={setting.label}
                htmlFor={`setting-${setting.key}`}
                hint={`${setting.key}${setting.unit ? ` · ${setting.unit}` : ""}${setting.description ? ` — ${setting.description}` : ""}`}
              >
                {typeof setting.value === "boolean" ? (
                  <label className="checkbox-row">
                    <input id={`setting-${setting.key}`} type="checkbox" checked={Boolean(values[setting.key])} onChange={(event) => setValues({ ...values, [setting.key]: event.target.checked })} />
                    <span>{Boolean(values[setting.key]) ? "Bật" : "Tắt"}</span>
                  </label>
                ) : typeof setting.value === "number" ? (
                  <input id={`setting-${setting.key}`} type="number" className="input" value={Number(values[setting.key] ?? 0)} onChange={(event) => setValues({ ...values, [setting.key]: Number(event.target.value) })} />
                ) : (
                  <input id={`setting-${setting.key}`} className="input" value={String(values[setting.key] ?? "")} onChange={(event) => setValues({ ...values, [setting.key]: event.target.value })} />
                )}
              </Field>
            ))}
          </div>
          <p className="field-hint" style={{ marginTop: 8 }}>Cập nhật gần nhất: {formatDateTime(state.data!.settings.find((setting) => setting.group === group)?.updatedAt || "")}</p>
        </div>
      ))}

      <div className="admin-section">
        <div className="panel-head">
          <h2>Chính sách hủy</h2>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => openPolicy()}>Thêm chính sách</button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Mã / tên</th><th>Các bậc phí</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
              {state.data.policies.map((policy) => (
                <tr key={policy.id}>
                  <td><span className="row-title">{policy.name}</span><span className="row-sub">{policy.code}</span></td>
                  <td>{policy.tiers.map((tier) => `${tier.maxDaysBefore === null ? `≥${tier.minDaysBefore}` : tier.minDaysBefore === 0 ? "0" : `${tier.minDaysBefore}-${tier.maxDaysBefore}`}: ${tier.feePercent}%`).join(" · ")}</td>
                  <td>{policy.active ? "Đang dùng" : "Tạm ngưng"}</td>
                  <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => openPolicy(policy)}>Sửa</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-section">
        <div className="panel-head">
          <h2>Sao lưu & khôi phục</h2>
          <button type="button" className="btn btn-outline btn-sm" onClick={createBackupNow} disabled={backupBusy === "create"}>
            {backupBusy === "create" ? "Đang sao lưu…" : "Sao lưu ngay"}
          </button>
        </div>
        <p className="field-hint">
          Tự động mỗi {backups.data?.intervalHours ?? 24} giờ, giữ {backups.data?.keep ?? 14} bản gần nhất trong
          <code> server/data/backups</code>. Kiểm thử khôi phục chỉ đọc và xác minh cấu trúc, không ghi đè dữ liệu đang chạy.
        </p>
        {backups.error ? <Notice tone="danger">{backups.error.message}</Notice> : null}
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Tệp</th><th>Kích thước</th><th>Thời điểm</th><th></th></tr></thead>
            <tbody>
              {(backups.data?.backups ?? []).map((row) => (
                <tr key={row.filename}>
                  <td className="row-title">{row.filename}</td>
                  <td>{fileSize(row.size)}</td>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td style={{ textAlign: "right" }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => verifyBackupFile(row.filename)} disabled={backupBusy === row.filename}>
                      {backupBusy === row.filename ? "Đang kiểm tra…" : "Kiểm thử khôi phục"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!backups.loading && !(backups.data?.backups ?? []).length ? <p className="muted">Chưa có bản sao lưu nào.</p> : null}
        {backupCheck ? (
          <Notice tone={backupCheck.valid ? "success" : "danger"} title={backupCheck.valid ? "Bản sao lưu hợp lệ" : "Bản sao lưu lỗi"}>
            {backupCheck.valid
              ? `${backupCheck.filename} · ${fileSize(backupCheck.size)} · ${Object.entries(backupCheck.counts).filter(([key]) => ["tours", "departures", "bookings", "payments"].includes(key)).map(([key, value]) => `${key}: ${value}`).join(" · ")}`
              : backupCheck.errors.join(" ")}
          </Notice>
        ) : null}
      </div>

      <Modal
        open={policyOpen}
        onClose={() => setPolicyOpen(false)}
        title={policyForm.id ? "Sửa chính sách hủy" : "Thêm chính sách hủy"}
        size="lg"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setPolicyOpen(false)}>Hủy</button><button type="button" className="btn btn-primary" onClick={savePolicy} disabled={busy}>{busy ? "Đang lưu…" : "Lưu chính sách"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="form-grid-2">
          <Field label="Tên chính sách" htmlFor="policy-name" required><input id="policy-name" className="input" value={policyForm.name} onChange={(event) => setPolicyForm({ ...policyForm, name: event.target.value })} /></Field>
          <Field label="Mã" htmlFor="policy-code"><input id="policy-code" className="input" value={policyForm.code} onChange={(event) => setPolicyForm({ ...policyForm, code: event.target.value.toUpperCase() })} /></Field>
          <Field label="Mô tả" htmlFor="policy-desc" className="field--full"><textarea id="policy-desc" className="input textarea" rows={2} value={policyForm.description} onChange={(event) => setPolicyForm({ ...policyForm, description: event.target.value })} /></Field>
        </div>
        <h3 style={{ fontSize: 13 }}>Bậc phí</h3>
        {policyForm.tiers.map((tier, index) => (
          <div key={index} className="itinerary-editor-row">
            <div className="form-grid-3">
              <Field label="Từ (ngày trước KH)" htmlFor={`tier-min-${index}`}><input id={`tier-min-${index}`} type="number" min={0} className="input" value={tier.minDaysBefore} onChange={(event) => updateTier(index, { minDaysBefore: Number(event.target.value) })} /></Field>
              <Field label="Đến (để trống = không giới hạn)" htmlFor={`tier-max-${index}`}><input id={`tier-max-${index}`} type="number" min={0} className="input" value={tier.maxDaysBefore ?? ""} onChange={(event) => updateTier(index, { maxDaysBefore: event.target.value === "" ? null : Number(event.target.value) })} /></Field>
              <Field label="Phí (%)" htmlFor={`tier-fee-${index}`}><input id={`tier-fee-${index}`} type="number" min={0} max={100} className="input" value={tier.feePercent} onChange={(event) => updateTier(index, { feePercent: Number(event.target.value) })} /></Field>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPolicyForm({ ...policyForm, tiers: policyForm.tiers.filter((_, idx) => idx !== index) })}>Xóa bậc</button>
          </div>
        ))}
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setPolicyForm({ ...policyForm, tiers: [...policyForm.tiers, { minDaysBefore: 0, maxDaysBefore: null, feePercent: 100 }] })}>Thêm bậc</button>
        <p className="field-hint">Bậc phải không chồng lấn. Phí tính trên giá trị đơn và không vượt số tiền đã thu.</p>
      </Modal>
    </>
  );
}
