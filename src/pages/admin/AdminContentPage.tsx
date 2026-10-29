import { useState } from "react";
import { Link } from "react-router-dom";
import { api, isApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { formatDate } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { DataTable, EmptyState, ErrorState, Field, Notice, PageLoader } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { AdminHeader, AdminTabs, useAdminParams } from "./shared";

interface ContentItem {
  pages: { id: number; slug: string; title: string; body: string; updatedAt: string }[];
  banners: { id: number; title: string; subtitle: string; image: string | null; ctaLabel: string; ctaHref: string; active: boolean; position: number }[];
}

export default function AdminContentPage() {
  const { get, update } = useAdminParams();
  const toast = useToast();
  const tab = get("tab", "pages");
  const state = useApi<ContentItem>("/admin/content");
  const [pageOpen, setPageOpen] = useState(false);
  const [pageForm, setPageForm] = useState({ id: 0, title: "", slug: "", body: "" });
  const [bannerOpen, setBannerOpen] = useState(false);
  const [bannerForm, setBannerForm] = useState({ id: 0, title: "", subtitle: "", image: "", ctaLabel: "Khám phá", ctaHref: "/tours", position: 1, active: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savePage = async () => {
    setBusy(true);
    setError(null);
    try {
      if (pageForm.id) await api(`/admin/content/pages/${pageForm.id}`, { method: "PUT", body: pageForm });
      else await api("/admin/content/pages", { method: "POST", body: pageForm });
      setPageOpen(false);
      toast.success("Đã lưu trang nội dung.");
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa lưu được trang."); }
    finally { setBusy(false); }
  };

  const saveBanner = async () => {
    setBusy(true);
    setError(null);
    try {
      if (bannerForm.id) await api(`/admin/content/banners/${bannerForm.id}`, { method: "PUT", body: bannerForm });
      else await api("/admin/content/banners", { method: "POST", body: bannerForm });
      setBannerOpen(false);
      toast.success("Đã lưu banner.");
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa lưu được banner."); }
    finally { setBusy(false); }
  };

  const deletePage = async (id: number) => {
    try { await api(`/admin/content/pages/${id}`, { method: "DELETE" }); state.reload(); toast.success("Đã xóa trang."); }
    catch (err) { toast.error(isApiError(err) ? err.message : "Chưa xóa được."); }
  };
  const deleteBanner = async (id: number) => {
    try { await api(`/admin/content/banners/${id}`, { method: "DELETE" }); state.reload(); toast.success("Đã xóa banner."); }
    catch (err) { toast.error(isApiError(err) ? err.message : "Chưa xóa được."); }
  };

  if (state.loading && !state.data) return <PageLoader label="Đang tải nội dung" />;
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!state.data) return null;

  return (
    <>
      <Seo title="Nội dung" noindex />
      <AdminHeader
        title="Nội dung"
        description="Banner trang chủ, trang chính sách và nội dung công khai."
        actions={
          tab === "pages"
            ? <button type="button" className="btn btn-primary btn-sm" onClick={() => { setPageForm({ id: 0, title: "", slug: "", body: "" }); setPageOpen(true); setError(null); }}>Tạo trang</button>
            : <button type="button" className="btn btn-primary btn-sm" onClick={() => { setBannerForm({ id: 0, title: "", subtitle: "", image: "art:halong", ctaLabel: "Khám phá", ctaHref: "/tours", position: 1, active: true }); setBannerOpen(true); setError(null); }}>Tạo banner</button>
        }
      />
      <AdminTabs items={[{ id: "pages", label: "Trang chính sách" }, { id: "banners", label: "Banner" }]} value={tab} onChange={(value) => update("tab", value === "pages" ? "" : value)} />
      <div style={{ marginTop: 14 }}>
        {tab === "pages" ? (
          <DataTable
            rows={state.data.pages}
            rowKey={(row) => row.id}
            columns={[
              { key: "title", header: "Tiêu đề", cell: (row) => <><span className="row-title">{row.title}</span><span className="row-sub">/policies/{row.slug}</span></> },
              { key: "updated", header: "Cập nhật", cell: (row) => formatDate(row.updatedAt) },
              { key: "actions", header: "", align: "right", cell: (row) => <span className="table-actions"><Link to={`/policies/${row.slug}`} className="btn btn-ghost btn-sm" target="_blank">Xem</Link><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setPageForm({ ...row }); setPageOpen(true); setError(null); }}>Sửa</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => deletePage(row.id)}>Xóa</button></span> },
            ]}
            empty={<EmptyState icon="file-text" title="Chưa có trang" />}
          />
        ) : (
          <DataTable
            rows={state.data.banners.slice().sort((a, b) => a.position - b.position)}
            rowKey={(row) => row.id}
            columns={[
              { key: "title", header: "Banner", cell: (row) => <><span className="row-title">{row.title}</span><span className="row-sub">{row.subtitle}</span></> },
              { key: "position", header: "Vị trí", align: "center", cell: (row) => row.position },
              { key: "cta", header: "CTA", cell: (row) => `${row.ctaLabel} → ${row.ctaHref}` },
              { key: "active", header: "Hiển thị", cell: (row) => row.active ? "Có" : "Không" },
              { key: "actions", header: "", align: "right", cell: (row) => <span className="table-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setBannerForm({ ...row, image: row.image || "" }); setBannerOpen(true); setError(null); }}>Sửa</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteBanner(row.id)}>Xóa</button></span> },
            ]}
            empty={<EmptyState icon="sparkles" title="Chưa có banner" />}
          />
        )}
      </div>

      <Modal
        open={pageOpen}
        onClose={() => setPageOpen(false)}
        title={pageForm.id ? "Sửa trang" : "Tạo trang"}
        size="lg"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setPageOpen(false)}>Hủy</button><button type="button" className="btn btn-primary" onClick={savePage} disabled={busy}>{busy ? "Đang lưu…" : "Lưu"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="form-grid-2">
          <Field label="Tiêu đề" htmlFor="content-title" required><input id="content-title" className="input" value={pageForm.title} onChange={(event) => setPageForm({ ...pageForm, title: event.target.value })} /></Field>
          <Field label="Slug" htmlFor="content-slug" required hint="Dùng trong URL /policies/:slug."><input id="content-slug" className="input" value={pageForm.slug} onChange={(event) => setPageForm({ ...pageForm, slug: event.target.value })} /></Field>
          <Field label="Nội dung HTML" htmlFor="content-body" className="field--full" hint="Nội dung được lọc bằng DOMPurify khi hiển thị."><textarea id="content-body" className="input textarea" rows={12} value={pageForm.body} onChange={(event) => setPageForm({ ...pageForm, body: event.target.value })} /></Field>
        </div>
      </Modal>

      <Modal
        open={bannerOpen}
        onClose={() => setBannerOpen(false)}
        title={bannerForm.id ? "Sửa banner" : "Tạo banner"}
        size="md"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setBannerOpen(false)}>Hủy</button><button type="button" className="btn btn-primary" onClick={saveBanner} disabled={busy}>{busy ? "Đang lưu…" : "Lưu"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="Tiêu đề" htmlFor="banner-title" required><input id="banner-title" className="input" value={bannerForm.title} onChange={(event) => setBannerForm({ ...bannerForm, title: event.target.value })} /></Field>
        <Field label="Phụ đề" htmlFor="banner-subtitle"><input id="banner-subtitle" className="input" value={bannerForm.subtitle} onChange={(event) => setBannerForm({ ...bannerForm, subtitle: event.target.value })} /></Field>
        <Field label="Ảnh (art:halong hoặc URL)" htmlFor="banner-image"><input id="banner-image" className="input" value={bannerForm.image} onChange={(event) => setBannerForm({ ...bannerForm, image: event.target.value })} /></Field>
        <div className="form-grid-2">
          <Field label="Nhãn CTA" htmlFor="banner-cta"><input id="banner-cta" className="input" value={bannerForm.ctaLabel} onChange={(event) => setBannerForm({ ...bannerForm, ctaLabel: event.target.value })} /></Field>
          <Field label="Liên kết CTA" htmlFor="banner-href"><input id="banner-href" className="input" value={bannerForm.ctaHref} onChange={(event) => setBannerForm({ ...bannerForm, ctaHref: event.target.value })} /></Field>
          <Field label="Vị trí" htmlFor="banner-position"><input id="banner-position" type="number" min={1} className="input" value={bannerForm.position} onChange={(event) => setBannerForm({ ...bannerForm, position: Number(event.target.value) })} /></Field>
          <label className="checkbox-row" style={{ marginTop: 24 }}><input type="checkbox" checked={bannerForm.active} onChange={(event) => setBannerForm({ ...bannerForm, active: event.target.checked })} /> <span>Hiển thị</span></label>
        </div>
      </Modal>
    </>
  );
}
