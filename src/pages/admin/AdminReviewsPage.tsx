import { useState } from "react";
import type { Meta } from "../../types";
import { api, isApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { useSession } from "../../lib/session";
import { formatDateTime } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { RatingStars, DataTable, EmptyState, ErrorState, Field, Notice, Skeleton, StatusChip } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { AdminHeader, AdminPagination, useAdminParams } from "./shared";

interface ReviewRow {
  id: number;
  rating: number;
  comment: string;
  status: "pending" | "approved" | "rejected" | "hidden";
  reply: string | null;
  createdAt: string;
  userName: string;
  userEmail: string;
  tourName: string;
  tourSlug: string;
  bookingCode: string | null;
}

export default function AdminReviewsPage() {
  const { get, update, setPage } = useAdminParams();
  const { user } = useSession();
  const toast = useToast();
  const status = get("status");
  const page = Number(get("page", "1"));
  const [q, setQ] = useState(get("q"));
  const canModerate = user?.permissions.includes("review:moderate") ?? false;
  const [rejectTarget, setRejectTarget] = useState<ReviewRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [replyTarget, setReplyTarget] = useState<ReviewRow | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (get("q")) query.set("q", get("q"));
  query.set("page", String(page));
  query.set("perPage", "20");
  const state = useApi<ReviewRow[]>(`/admin/reviews?${query.toString()}`, [status, get("q"), page]);
  const meta = state.meta as Meta | undefined;

  const moderate = async (row: ReviewRow, action: "approve" | "hide") => {
    try {
      await api(`/admin/reviews/${row.id}/${action}`, { method: "POST" });
      toast.success(action === "approve" ? "Đã duyệt đánh giá." : "Đã ẩn đánh giá.");
      state.reload();
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa duyệt được."); }
  };

  const reject = async () => {
    if (!rejectTarget) return;
    setBusy(true);
    try {
      await api(`/admin/reviews/${rejectTarget.id}/reject`, { method: "POST", body: { reason: rejectReason } });
      toast.success("Đã từ chối đánh giá.");
      setRejectTarget(null);
      setRejectReason("");
      state.reload();
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa từ chối được."); }
    finally { setBusy(false); }
  };

  const sendReply = async () => {
    if (!replyTarget) return;
    setBusy(true);
    try {
      await api(`/admin/reviews/${replyTarget.id}/reply`, { method: "POST", body: { reply } });
      toast.success("Đã gửi phản hồi.");
      setReplyTarget(null);
      setReply("");
      state.reload();
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa gửi được phản hồi."); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Seo title="Đánh giá" noindex />
      <AdminHeader title="Đánh giá" description="Duyệt đánh giá thật từ khách đã đi, phản hồi công khai. Không xóa đánh giá tiêu cực chính đáng." />
      <div className="admin-toolbar">
        <form className="toolbar-grow" onSubmit={(event) => { event.preventDefault(); update("q", q.trim()); }} style={{ display: "flex", gap: 8 }}>
          <input className="input" placeholder="Khách, nội dung, tour…" aria-label="Tìm đánh giá" value={q} onChange={(event) => setQ(event.target.value)} />
          <button type="submit" className="btn btn-outline btn-sm">Tìm</button>
        </form>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-hint">Trạng thái</span>
          <select className="input" value={status} onChange={(event) => update("status", event.target.value)}>
            <option value="">Tất cả</option><option value="pending">Chờ duyệt</option><option value="approved">Đã duyệt</option><option value="rejected">Từ chối</option><option value="hidden">Đã ẩn</option>
          </select>
        </label>
      </div>
      {state.loading && !state.data ? <Skeleton height={280} /> : state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : (
        <>
          <DataTable
            rows={state.data || []}
            rowKey={(row) => row.id}
            columns={[
              { key: "review", header: "Đánh giá", cell: (row) => <><RatingStars value={row.rating} size={13} /><p style={{ fontSize: 12.5, marginTop: 4, maxWidth: 380 }}>{row.comment}</p>{row.reply ? <span className="row-sub">Phản hồi: {row.reply}</span> : null}</> },
              { key: "user", header: "Khách / tour", cell: (row) => <>{row.userName}<span className="row-sub">{row.tourName} · {row.bookingCode}</span></> },
              { key: "status", header: "Trạng thái", cell: (row) => <StatusChip status={row.status} kind="review" size="sm" /> },
              { key: "created", header: "Gửi lúc", cell: (row) => formatDateTime(row.createdAt) },
              {
                key: "actions", header: "", align: "right",
                cell: (row) => canModerate ? (
                  <span className="table-actions">
                    {row.status !== "approved" ? <button type="button" className="btn btn-primary btn-sm" onClick={() => moderate(row, "approve")}>Duyệt</button> : null}
                    {row.status !== "hidden" ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => moderate(row, "hide")}>Ẩn</button> : null}
                    {row.status !== "rejected" ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRejectTarget(row); setRejectReason(""); }}>Từ chối</button> : null}
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => { setReplyTarget(row); setReply(row.reply || ""); }}>Phản hồi</button>
                  </span>
                ) : "—",
              },
            ]}
            empty={<EmptyState icon="star" title="Không có đánh giá" description="Đánh giá sau chuyến sẽ xuất hiện tại đây." />}
          />
          <AdminPagination page={meta?.page || page} totalPages={meta?.totalPages || 1} total={meta?.total} perPage={meta?.perPage} onChange={setPage} />
        </>
      )}

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="Từ chối đánh giá"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setRejectTarget(null)}>Hủy</button><button type="button" className="btn btn-danger" onClick={reject} disabled={busy || rejectReason.trim().length < 10}>{busy ? "Đang xử lý…" : "Từ chối"}</button></>}
      >
        <Field label="Lý do" htmlFor="review-reject" required hint="Tối thiểu 10 ký tự. Chỉ dùng cho spam, dữ liệu cá nhân hoặc ngôn từ vi phạm."><textarea id="review-reject" className="input textarea" rows={3} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} /></Field>
      </Modal>

      <Modal
        open={Boolean(replyTarget)}
        onClose={() => setReplyTarget(null)}
        title="Phản hồi công khai"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setReplyTarget(null)}>Hủy</button><button type="button" className="btn btn-primary" onClick={sendReply} disabled={busy || reply.trim().length < 5}>{busy ? "Đang gửi…" : "Gửi phản hồi"}</button></>}
      >
        <Field label="Nội dung phản hồi" htmlFor="review-reply" required hint="5–1000 ký tự."><textarea id="review-reply" className="input textarea" rows={4} maxLength={1000} value={reply} onChange={(event) => setReply(event.target.value)} /></Field>
        <Notice tone="neutral">Phản hồi sẽ hiển thị công khai cùng đánh giá đã duyệt.</Notice>
      </Modal>
    </>
  );
}
