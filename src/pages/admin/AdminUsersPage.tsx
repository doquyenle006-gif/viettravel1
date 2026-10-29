import { useState } from "react";
import type { Meta } from "../../types";
import { api, isApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { useSession } from "../../lib/session";
import { formatDate, formatDateTime } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { DataTable, EmptyState, ErrorState, Field, Notice, Skeleton, StatusChip } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { AdminHeader, AdminPagination, AdminTabs, useAdminParams } from "./shared";

interface UserRow {
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
  roles: string[];
  roleLabels: string[];
  status: "active" | "locked";
  emailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

interface RoleDef { code: string; label: string; permissions: string[] }
interface RoleMatrix { roles: RoleDef[]; permissions: string[]; labels: Record<string, string> }

export default function AdminUsersPage() {
  const { get, update, setPage } = useAdminParams();
  const { user } = useSession();
  const toast = useToast();
  const tab = get("tab", "users");
  const [q, setQ] = useState(get("q"));
  const page = Number(get("page", "1"));
  const query = new URLSearchParams();
  for (const key of ["q", "role", "status"]) if (get(key)) query.set(key, get(key));
  query.set("page", String(page));
  query.set("perPage", "20");
  const state = useApi<UserRow[]>(`/admin/users?${query.toString()}`, [get("q"), get("role"), get("status"), page]);
  const matrix = useApi<RoleMatrix>("/admin/roles", []);
  const meta = state.meta as Meta | undefined;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ fullName: "", email: "", roles: [] as string[] });
  const [roleTarget, setRoleTarget] = useState<UserRow | null>(null);
  const [roleSelection, setRoleSelection] = useState<string[]>([]);
  const [lockTarget, setLockTarget] = useState<UserRow | null>(null);
  const [lockReason, setLockReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleOptions = (matrix.data?.roles || []).filter((role) => role.code !== "customer");

  const invite = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/admin/users/invite", { method: "POST", body: inviteForm });
      setInviteOpen(false);
      setInviteForm({ fullName: "", email: "", roles: [] });
      toast.success("Đã gửi lời mời. Liên kết kích hoạt nằm trong hộp thư mô phỏng.");
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa gửi được lời mời."); }
    finally { setBusy(false); }
  };

  const saveRoles = async () => {
    if (!roleTarget) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/users/${roleTarget.id}/roles`, { method: "POST", body: { roles: roleSelection } });
      setRoleTarget(null);
      toast.success("Đã cập nhật vai trò.");
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa cập nhật được vai trò."); }
    finally { setBusy(false); }
  };

  const lock = async () => {
    if (!lockTarget) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/users/${lockTarget.id}/status`, { method: "POST", body: { status: lockTarget.status === "locked" ? "active" : "locked", reason: lockReason } });
      setLockTarget(null);
      setLockReason("");
      toast.success(lockTarget.status === "locked" ? "Đã mở khóa." : "Đã khóa và thu hồi phiên.");
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa đổi được trạng thái."); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Seo title="Người dùng & vai trò" noindex />
      <AdminHeader
        title="Người dùng & vai trò"
        description="Mời nhân viên, gán vai trò theo nguyên tắc ít quyền nhất, khóa tài khoản khi nghỉ việc."
        actions={<button type="button" className="btn btn-primary btn-sm" onClick={() => { setInviteOpen(true); setError(null); }}>Mời nhân viên</button>}
      />
      <AdminTabs items={[{ id: "users", label: "Người dùng nội bộ" }, { id: "roles", label: "Ma trận quyền" }]} value={tab} onChange={(value) => update("tab", value === "users" ? "" : value)} />
      {tab === "users" ? (
        <>
          <div className="admin-toolbar" style={{ marginTop: 14 }}>
            <form className="toolbar-grow" onSubmit={(event) => { event.preventDefault(); update("q", q.trim()); }} style={{ display: "flex", gap: 8 }}>
              <input className="input" placeholder="Tên hoặc email…" aria-label="Tìm người dùng" value={q} onChange={(event) => setQ(event.target.value)} />
              <button type="submit" className="btn btn-outline btn-sm">Tìm</button>
            </form>
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="field-hint">Vai trò</span>
              <select className="input" value={get("role")} onChange={(event) => update("role", event.target.value)}>
                <option value="">Tất cả</option>
                {roleOptions.map((role) => <option key={role.code} value={role.code}>{role.label}</option>)}
              </select>
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="field-hint">Trạng thái</span>
              <select className="input" value={get("status")} onChange={(event) => update("status", event.target.value)}>
                <option value="">Tất cả</option><option value="active">Hoạt động</option><option value="locked">Đã khóa</option>
              </select>
            </label>
          </div>
          {state.loading && !state.data ? <Skeleton height={280} /> : state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : (
            <>
              <DataTable
                rows={state.data || []}
                rowKey={(row) => row.id}
                columns={[
                  { key: "name", header: "Nhân viên", cell: (row) => <><span className="row-title">{row.fullName}</span><span className="row-sub">{row.email}</span></> },
                  { key: "roles", header: "Vai trò", cell: (row) => <span className="tag-list">{row.roleLabels.map((label) => <span key={label} className="tag">{label}</span>)}</span> },
                  { key: "status", header: "Trạng thái", cell: (row) => <><StatusChip status={row.status} kind="user" size="sm" />{row.mfaEnabled ? <span className="chip chip--ok chip--sm" style={{ marginLeft: 4 }}>2FA</span> : <span className="chip chip--muted chip--sm" style={{ marginLeft: 4 }}>Chưa 2FA</span>}</> },
                  { key: "login", header: "Đăng nhập gần nhất", cell: (row) => row.lastLoginAt ? formatDateTime(row.lastLoginAt) : "—" },
                  { key: "created", header: "Tạo", cell: (row) => formatDate(row.createdAt) },
                  {
                    key: "actions", header: "", align: "right",
                    cell: (row) => (
                      <span className="table-actions">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRoleTarget(row); setRoleSelection(row.roles.filter((role) => role !== "customer")); setError(null); }}>Vai trò</button>
                        {row.id !== user?.id ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setLockTarget(row); setLockReason(""); setError(null); }}>{row.status === "locked" ? "Mở khóa" : "Khóa"}</button> : null}
                      </span>
                    ),
                  },
                ]}
                empty={<EmptyState icon="shield" title="Chưa có nhân viên" description="Mời nhân viên để bắt đầu." />}
              />
              <AdminPagination page={meta?.page || page} totalPages={meta?.totalPages || 1} total={meta?.total} perPage={meta?.perPage} onChange={setPage} />
            </>
          )}
        </>
      ) : (
        <div style={{ marginTop: 14 }} className="admin-section">
          <h2>Ma trận quyền theo vai trò</h2>
          {matrix.loading ? <Skeleton height={300} /> : matrix.error ? <ErrorState error={matrix.error} onRetry={matrix.reload} /> : matrix.data ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Quyền</th>{matrix.data.roles.map((role) => <th key={role.code} style={{ writingMode: "vertical-rl", height: 120 }}>{role.label}</th>)}</tr></thead>
                <tbody>{matrix.data.permissions.map((permission) => (
                  <tr key={permission}><td className="row-title">{permission}</td>{matrix.data!.roles.map((role) => <td key={role.code} style={{ textAlign: "center" }}>{role.permissions.includes(permission) ? "●" : "—"}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          ) : null}
          <p className="field-hint">● toàn quyền · — không có. Quyền chi tiết vẫn được kiểm tra lại ở máy chủ cho từng yêu cầu.</p>
        </div>
      )}

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Mời nhân viên"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setInviteOpen(false)}>Hủy</button><button type="button" className="btn btn-primary" onClick={invite} disabled={busy}>{busy ? "Đang gửi…" : "Gửi lời mời"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="Họ tên" htmlFor="invite-name" required><input id="invite-name" className="input" value={inviteForm.fullName} onChange={(event) => setInviteForm({ ...inviteForm, fullName: event.target.value })} /></Field>
        <Field label="Email" htmlFor="invite-email" required><input id="invite-email" type="email" className="input" value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} /></Field>
        <Field label="Vai trò" htmlFor="invite-roles" required>
          <div id="invite-roles" style={{ display: "grid", gap: 6 }}>
            {roleOptions.map((role) => (
              <label key={role.code} className="checkbox-row">
                <input type="checkbox" checked={inviteForm.roles.includes(role.code)} onChange={(event) => setInviteForm({ ...inviteForm, roles: event.target.checked ? [...inviteForm.roles, role.code] : inviteForm.roles.filter((value) => value !== role.code) })} />
                <span>{role.label}</span>
              </label>
            ))}
          </div>
        </Field>
        <p className="field-hint">Nhân viên nhận email đặt mật khẩu (trong hộp thư mô phỏng ở môi trường demo).</p>
      </Modal>

      <Modal
        open={Boolean(roleTarget)}
        onClose={() => setRoleTarget(null)}
        title={`Gán vai trò — ${roleTarget?.fullName || ""}`}
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setRoleTarget(null)}>Hủy</button><button type="button" className="btn btn-primary" onClick={saveRoles} disabled={busy}>{busy ? "Đang lưu…" : "Lưu vai trò"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div style={{ display: "grid", gap: 6 }}>
          {roleOptions.map((role) => (
            <label key={role.code} className="checkbox-row">
              <input type="checkbox" checked={roleSelection.includes(role.code)} onChange={(event) => setRoleSelection(event.target.checked ? [...roleSelection, role.code] : roleSelection.filter((value) => value !== role.code))} />
              <span>{role.label}</span>
            </label>
          ))}
        </div>
        <p className="field-hint">Thay đổi vai trò sẽ thu hồi mọi phiên đăng nhập hiện tại của nhân viên và ghi nhật ký.</p>
      </Modal>

      <Modal
        open={Boolean(lockTarget)}
        onClose={() => setLockTarget(null)}
        title={lockTarget?.status === "locked" ? "Mở khóa tài khoản" : "Khóa tài khoản"}
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setLockTarget(null)}>Hủy</button><button type="button" className={`btn ${lockTarget?.status === "locked" ? "btn-primary" : "btn-danger"}`} onClick={lock} disabled={busy || lockReason.trim().length < 5}>{busy ? "Đang xử lý…" : "Xác nhận"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="Lý do" htmlFor="lock-user-reason" required><textarea id="lock-user-reason" className="input textarea" rows={3} value={lockReason} onChange={(event) => setLockReason(event.target.value)} /></Field>
        {lockTarget?.status !== "locked" ? <p className="field-hint">Tài khoản sẽ bị thu hồi mọi phiên ngay lập tức. Không xóa để giữ lịch sử thao tác.</p> : null}
      </Modal>
    </>
  );
}
