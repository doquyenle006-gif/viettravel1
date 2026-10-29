import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Category, Destination, ItineraryDay, TourStatus } from "../../types";
import { api, isApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { useSession } from "../../lib/session";
import { formatDateTime } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { Icon } from "../../components/Icon";
import { TourCover } from "../../components/CoverArt";
import { Field, Notice, PageLoader, StatusChip, Tabs } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";

interface PolicyOption {
  id: number;
  name: string;
  tiers: { minDaysBefore: number; maxDaysBefore: number | null; feePercent: number }[];
}

interface AdminTour {
  id: number;
  code: string;
  name: string;
  slug: string;
  status: TourStatus;
  destinationId: number;
  categoryId: number;
  durationDays: number;
  durationNights: number;
  summary: string;
  description: string;
  highlights: string[];
  itinerary: ItineraryDay[];
  inclusions: string[];
  exclusions: string[];
  notes: string | null;
  meetingPointDefault: string;
  minPax: number;
  maxPax: number;
  ageInfantMax: number;
  ageChildMax: number;
  requiresIdDocument: boolean;
  requiresPassport: boolean;
  depositPercent: number;
  cancellationPolicyId: number;
  seoTitle: string;
  seoDescription: string;
  cover: string | null;
  images: { url: string; alt: string }[];
  version: number;
  bookingCount: number;
  publishIssues: string[];
  departures: { id: number; departureDate: string; status: string; seatsTaken: number; capacity: number }[];
  history: { id: number; action: string; createdAt: string; actorId: number; after: Record<string, unknown> | null }[];
}

interface FormState {
  name: string;
  slug: string;
  destinationId: string;
  categoryId: string;
  durationDays: number;
  durationNights: number;
  summary: string;
  description: string;
  highlights: string;
  inclusions: string;
  exclusions: string;
  notes: string;
  meetingPointDefault: string;
  minPax: number;
  maxPax: number;
  ageInfantMax: number;
  ageChildMax: number;
  requiresIdDocument: boolean;
  requiresPassport: boolean;
  depositPercent: number;
  cancellationPolicyId: string;
  seoTitle: string;
  seoDescription: string;
  cover: string;
  images: { url: string; alt: string }[];
  itinerary: ItineraryDay[];
}

function emptyForm(): FormState {
  return {
    name: "", slug: "", destinationId: "", categoryId: "", durationDays: 3, durationNights: 2,
    summary: "", description: "", highlights: "", inclusions: "", exclusions: "", notes: "",
    meetingPointDefault: "Văn phòng VietTrails — 18 Lý Thường Kiệt, Hoàn Kiếm, Hà Nội",
    minPax: 8, maxPax: 30, ageInfantMax: 2, ageChildMax: 12,
    requiresIdDocument: false, requiresPassport: false, depositPercent: 30,
    cancellationPolicyId: "", seoTitle: "", seoDescription: "", cover: "", images: [],
    itinerary: [{ dayNo: 1, title: "", content: "", meals: ["breakfast"], accommodation: null, places: [] }],
  };
}

function formFromTour(tour: AdminTour): FormState {
  return {
    name: tour.name, slug: tour.slug, destinationId: String(tour.destinationId), categoryId: String(tour.categoryId),
    durationDays: tour.durationDays, durationNights: tour.durationNights,
    summary: tour.summary, description: tour.description,
    highlights: tour.highlights.join("\n"), inclusions: tour.inclusions.join("\n"), exclusions: tour.exclusions.join("\n"),
    notes: tour.notes || "", meetingPointDefault: tour.meetingPointDefault,
    minPax: tour.minPax, maxPax: tour.maxPax, ageInfantMax: tour.ageInfantMax, ageChildMax: tour.ageChildMax,
    requiresIdDocument: tour.requiresIdDocument, requiresPassport: tour.requiresPassport,
    depositPercent: tour.depositPercent, cancellationPolicyId: String(tour.cancellationPolicyId || ""),
    seoTitle: tour.seoTitle, seoDescription: tour.seoDescription, cover: tour.cover || "",
    images: tour.images || [], itinerary: tour.itinerary?.length ? structuredClone(tour.itinerary) : emptyForm().itinerary,
  };
}

const splitLines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);

export default function AdminTourEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useSession();
  const isNew = !id;
  const tourState = useApi<AdminTour>(id ? `/admin/tours/${id}` : null, [id]);
  const destinations = useApi<Destination[]>("/admin/catalog/destinations", []);
  const categories = useApi<Category[]>("/admin/catalog/categories", []);
  const policies = useApi<PolicyOption[]>("/admin/policies", []);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [tab, setTab] = useState("general");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishIssues, setPublishIssues] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const baseline = useRef("");
  const initializedNew = useRef(false);

  const canEdit = user?.permissions.includes("tour:update") ?? false;
  const canSeo = user?.permissions.includes("tour:seo") ?? false;
  const canWrite = canEdit || canSeo;
  const canPublish = user?.permissions.includes("tour:publish") ?? false;
  const onlySeo = !canEdit && canSeo;

  useEffect(() => {
    if (isNew) {
      if (initializedNew.current) return;
      if (!destinations.data?.length || !categories.data?.length || !policies.data?.length) return;
      const next = emptyForm();
      next.destinationId = String(destinations.data[0].id);
      next.categoryId = String(categories.data[0].id);
      next.cancellationPolicyId = String(policies.data[0].id);
      setForm(next);
      baseline.current = JSON.stringify(next);
      initializedNew.current = true;
      return;
    }
    if (tourState.data) {
      const next = formFromTour(tourState.data);
      setForm(next);
      baseline.current = JSON.stringify(next);
      setSavedAt(tourState.data.history?.[0]?.createdAt || null);
    }
  }, [isNew, destinations.data, categories.data, policies.data, tourState.data]);

  const dirty = useMemo(() => JSON.stringify(form) !== baseline.current, [form]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const buildPayload = () => {
    if (onlySeo) {
      return { version: tourState.data?.version, seoTitle: form.seoTitle, seoDescription: form.seoDescription, cover: form.cover || null, images: form.images };
    }
    return {
      version: tourState.data?.version,
      name: form.name, slug: form.slug || undefined,
      destinationId: Number(form.destinationId), categoryId: Number(form.categoryId),
      durationDays: Number(form.durationDays), durationNights: Number(form.durationNights),
      summary: form.summary, description: form.description,
      highlights: splitLines(form.highlights), inclusions: splitLines(form.inclusions), exclusions: splitLines(form.exclusions),
      notes: form.notes || null, meetingPointDefault: form.meetingPointDefault,
      minPax: Number(form.minPax), maxPax: Number(form.maxPax),
      ageInfantMax: Number(form.ageInfantMax), ageChildMax: Number(form.ageChildMax),
      requiresIdDocument: form.requiresIdDocument, requiresPassport: form.requiresPassport,
      depositPercent: Number(form.depositPercent), cancellationPolicyId: Number(form.cancellationPolicyId),
      seoTitle: form.seoTitle || form.name, seoDescription: form.seoDescription,
      cover: form.cover || null, images: form.images, itinerary: form.itinerary,
    };
  };

  const save = async (): Promise<AdminTour | null> => {
    setSaving(true);
    setError(null);
    setPublishIssues([]);
    try {
      const payload = buildPayload();
      if (isNew) {
        const created = await api<AdminTour>("/admin/tours", { method: "POST", body: payload });
        toast.success("Đã tạo tour ở trạng thái nháp.");
        navigate(`/admin/tours/${created.id}`, { replace: true });
        return created;
      }
      await api(`/admin/tours/${id}`, { method: "PUT", body: payload });
      baseline.current = JSON.stringify(form);
      setSavedAt(new Date().toISOString());
      toast.success("Đã lưu tour.");
      tourState.reload();
      return tourState.data;
    } catch (err) {
      if (isApiError(err)) {
        setError(err.message);
        if (err.fields) setPublishIssues(Object.values(err.fields));
        if (err.code === "VERSION_CONFLICT") toast.error("Tour vừa được người khác cập nhật. Hãy tải lại trang.");
      } else setError("Chưa lưu được tour.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (isNew) {
      toast.info("Hãy lưu tour trước khi xuất bản.");
      return;
    }
    if (dirty) {
      const saved = await save();
      if (!saved) return;
    }
    setPublishing(true);
    setError(null);
    setPublishIssues([]);
    try {
      await api(`/admin/tours/${id}/publish`, { method: "POST" });
      toast.success("Tour đã được xuất bản.");
      tourState.reload();
    } catch (err) {
      if (isApiError(err)) {
        setError(err.message);
        setPublishIssues((err.extra?.issues as string[]) || []);
      } else setError("Chưa xuất bản được tour.");
    } finally {
      setPublishing(false);
    }
  };

  const changeStatus = async (action: "hide" | "archive") => {
    try {
      await api(`/admin/tours/${id}/${action}`, { method: "POST" });
      toast.success(action === "hide" ? "Đã ẩn tour." : "Đã chuyển tour vào lưu trữ.");
      tourState.reload();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Chưa đổi được trạng thái.");
    }
  };

  const addImage = () => {
    if (!imageUrl.trim()) return;
    setForm((current) => ({ ...current, images: [...current.images, { url: imageUrl.trim(), alt: imageAlt.trim() || form.name || "Ảnh tour" }] }));
    setImageUrl("");
    setImageAlt("");
    setImageOpen(false);
  };

  const uploadImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      toast.error("Chỉ nhận ảnh PNG, JPG hoặc WEBP.");
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      toast.error("Ảnh tối đa 1,5MB trong bản demo.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({ ...current, images: [...current.images, { url: String(reader.result), alt: file.name.replace(/\.[^.]+$/, "") }] }));
      toast.success("Đã thêm ảnh. Đừng quên kiểm tra mô tả alt.");
    };
    reader.readAsDataURL(file);
  };

  const moveDay = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= form.itinerary.length) return;
    const next = [...form.itinerary];
    [next[index], next[target]] = [next[target], next[index]];
    next.forEach((day, idx) => { day.dayNo = idx + 1; });
    set("itinerary", next);
  };

  const updateDay = (index: number, patch: Partial<ItineraryDay>) => {
    set("itinerary", form.itinerary.map((day, idx) => idx === index ? { ...day, ...patch } : day));
  };

  const addDay = () => set("itinerary", [...form.itinerary, { dayNo: form.itinerary.length + 1, title: "", content: "", meals: ["breakfast"], accommodation: null, places: [] }]);

  const removeDay = (index: number) => {
    const next = form.itinerary.filter((_, idx) => idx !== index).map((day, idx) => ({ ...day, dayNo: idx + 1 }));
    set("itinerary", next);
  };

  if (!isNew && tourState.loading && !tourState.data) return <PageLoader label="Đang tải tour" />;
  if (!isNew && tourState.error) return <Notice tone="danger">{tourState.error.message}</Notice>;

  const tour = tourState.data;
  const tabs = onlySeo
    ? [{ id: "seo", label: "SEO" }, { id: "images", label: "Ảnh" }, { id: "history", label: "Lịch sử" }]
    : [
      { id: "general", label: "Thông tin chung" }, { id: "itinerary", label: "Lịch trình" },
      { id: "pricing", label: "Giá & chính sách" }, { id: "images", label: "Ảnh" },
      { id: "departures", label: "Lịch khởi hành" }, { id: "seo", label: "SEO" }, { id: "history", label: "Lịch sử" },
    ];

  return (
    <>
      <Seo title={isNew ? "Tạo tour" : `Sửa tour ${tour?.name || ""}`} noindex />
      <div className="editor-topbar">
        <div>
          <Link to="/admin/tours" className="text-link" style={{ fontSize: 12 }}>← Danh sách tour</Link>
          <h1>{isNew ? "Tạo tour mới" : form.name || "Tour"}</h1>
          <div className="inline-actions" style={{ marginTop: 6, gap: 8 }}>
            {tour ? <StatusChip status={tour.status} kind="tour" /> : <span className="chip chip--muted">Chưa lưu</span>}
            {tour ? <span className="chip chip--muted chip--sm">v{tour.version}</span> : null}
            <span className="save-state">{dirty ? "Có thay đổi chưa lưu" : savedAt ? `Đã lưu ${formatDateTime(savedAt)}` : "Chưa có thay đổi"}</span>
          </div>
        </div>
        <div className="admin-page-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate("/admin/tours")}>Hủy</button>
          {canWrite ? <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? "Đang lưu…" : "Lưu"}</button> : null}
          {canPublish && tour ? (
            <button type="button" className="btn btn-accent btn-sm" onClick={publish} disabled={publishing || tour.status === "published"}>
              {publishing ? "Đang xuất bản…" : "Xuất bản"}
            </button>
          ) : null}
          {canPublish && tour && tour.status === "published" ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => changeStatus("hide")}>Ẩn</button> : null}
          {canPublish && tour && tour.status !== "archived" ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => changeStatus("archive")}>Lưu trữ</button> : null}
        </div>
      </div>
      {error ? <Notice tone="danger" title="Không lưu được">{error}</Notice> : null}
      {publishIssues.length ? <Notice tone="warning" title="Điều kiện xuất bản">{publishIssues.join(" · ")}</Notice> : null}
      {tour?.publishIssues?.length && tour.status !== "published" ? <Notice tone="info" title="Còn thiếu để xuất bản">{tour.publishIssues.join(" · ")}</Notice> : null}
      {tour?.bookingCount ? <Notice tone="neutral">Tour đã có {tour.bookingCount} đơn. Thay đổi giá/lịch không ảnh hưởng đơn cũ nhờ price snapshot.</Notice> : null}

      <Tabs items={tabs} value={tab} onChange={setTab} className="editor-tabs" />

      <div style={{ marginTop: 16 }}>
        {tab === "general" ? (
          <div className="admin-section">
            <h2>Thông tin chung</h2>
            <div className="form-grid-2">
              <Field label="Tên tour" htmlFor="tour-name" required>
                <input id="tour-name" className="input" value={form.name} onChange={(event) => set("name", event.target.value)} disabled={!canEdit} />
              </Field>
              <Field label="Slug URL" htmlFor="tour-slug" hint="Để trống để hệ thống tự tạo từ tên.">
                <input id="tour-slug" className="input" value={form.slug} onChange={(event) => set("slug", event.target.value)} disabled={!canEdit} />
              </Field>
              <Field label="Điểm đến" htmlFor="tour-destination" required>
                <select id="tour-destination" className="input" value={form.destinationId} onChange={(event) => set("destinationId", event.target.value)} disabled={!canEdit}>
                  <option value="">Chọn điểm đến</option>
                  {(destinations.data || []).map((destination) => <option key={destination.id} value={destination.id}>{destination.name}</option>)}
                </select>
              </Field>
              <Field label="Danh mục" htmlFor="tour-category" required>
                <select id="tour-category" className="input" value={form.categoryId} onChange={(event) => set("categoryId", event.target.value)} disabled={!canEdit}>
                  <option value="">Chọn danh mục</option>
                  {(categories.data || []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </Field>
              <Field label="Số ngày" htmlFor="tour-days" required><input id="tour-days" type="number" min={1} max={30} className="input" value={form.durationDays} onChange={(event) => set("durationDays", Number(event.target.value))} disabled={!canEdit} /></Field>
              <Field label="Số đêm" htmlFor="tour-nights" required><input id="tour-nights" type="number" min={0} max={30} className="input" value={form.durationNights} onChange={(event) => set("durationNights", Number(event.target.value))} disabled={!canEdit} /></Field>
              <Field label="Tóm tắt" htmlFor="tour-summary" className="field--full" hint="Hiển thị trên thẻ tour và kết quả tìm kiếm.">
                <input id="tour-summary" className="input" value={form.summary} onChange={(event) => set("summary", event.target.value)} disabled={!canEdit} />
              </Field>
              <Field label="Mô tả" htmlFor="tour-description" className="field--full">
                <textarea id="tour-description" className="input textarea" rows={5} value={form.description} onChange={(event) => set("description", event.target.value)} disabled={!canEdit} />
              </Field>
              <Field label="Điểm nổi bật" htmlFor="tour-highlights" className="field--full" hint="Mỗi dòng một mục.">
                <textarea id="tour-highlights" className="input textarea" rows={4} value={form.highlights} onChange={(event) => set("highlights", event.target.value)} disabled={!canEdit} />
              </Field>
              <Field label="Bao gồm" htmlFor="tour-inclusions" hint="Mỗi dòng một mục.">
                <textarea id="tour-inclusions" className="input textarea" rows={5} value={form.inclusions} onChange={(event) => set("inclusions", event.target.value)} disabled={!canEdit} />
              </Field>
              <Field label="Không bao gồm" htmlFor="tour-exclusions" hint="Mỗi dòng một mục.">
                <textarea id="tour-exclusions" className="input textarea" rows={5} value={form.exclusions} onChange={(event) => set("exclusions", event.target.value)} disabled={!canEdit} />
              </Field>
              <Field label="Lưu ý" htmlFor="tour-notes" className="field--full">
                <textarea id="tour-notes" className="input textarea" rows={3} value={form.notes} onChange={(event) => set("notes", event.target.value)} disabled={!canEdit} />
              </Field>
              <Field label="Điểm đón mặc định" htmlFor="tour-meeting" className="field--full">
                <input id="tour-meeting" className="input" value={form.meetingPointDefault} onChange={(event) => set("meetingPointDefault", event.target.value)} disabled={!canEdit} />
              </Field>
            </div>
          </div>
        ) : null}

        {tab === "itinerary" ? (
          <div className="admin-section">
            <h2>Lịch trình theo ngày</h2>
            {form.itinerary.map((day, index) => (
              <div key={index} className="itinerary-editor-row">
                <div className="inline-actions" style={{ justifyContent: "space-between", marginBottom: 10 }}>
                  <strong>Ngày {day.dayNo}</strong>
                  <span className="table-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveDay(index, -1)} disabled={index === 0 || !canEdit} aria-label="Đưa ngày lên">↑</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveDay(index, 1)} disabled={index === form.itinerary.length - 1 || !canEdit} aria-label="Đưa ngày xuống">↓</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeDay(index)} disabled={form.itinerary.length <= 1 || !canEdit}><Icon name="trash" size={13} /></button>
                  </span>
                </div>
                <div className="form-grid-2">
                  <Field label="Tiêu đề ngày" htmlFor={`day-title-${index}`} required className="field--full">
                    <input id={`day-title-${index}`} className="input" value={day.title} onChange={(event) => updateDay(index, { title: event.target.value })} disabled={!canEdit} />
                  </Field>
                  <Field label="Nội dung" htmlFor={`day-content-${index}`} className="field--full">
                    <textarea id={`day-content-${index}`} className="input textarea" rows={3} value={day.content} onChange={(event) => updateDay(index, { content: event.target.value })} disabled={!canEdit} />
                  </Field>
                  <Field label="Bữa ăn" htmlFor={`day-meals-${index}`}>
                    <div className="inline-actions">
                      {(["breakfast", "lunch", "dinner"] as const).map((meal) => (
                        <label key={meal} className="checkbox-row">
                          <input type="checkbox" checked={day.meals.includes(meal)} onChange={(event) => {
                            const meals = event.target.checked ? [...day.meals, meal] : day.meals.filter((item) => item !== meal);
                            updateDay(index, { meals });
                          }} disabled={!canEdit} />
                          <span>{meal === "breakfast" ? "Sáng" : meal === "lunch" ? "Trưa" : "Tối"}</span>
                        </label>
                      ))}
                    </div>
                  </Field>
                  <Field label="Nơi nghỉ" htmlFor={`day-stay-${index}`}>
                    <input id={`day-stay-${index}`} className="input" value={day.accommodation || ""} onChange={(event) => updateDay(index, { accommodation: event.target.value || null })} disabled={!canEdit} />
                  </Field>
                  <Field label="Địa điểm (cách nhau bởi dấu phẩy)" htmlFor={`day-places-${index}`} className="field--full">
                    <input id={`day-places-${index}`} className="input" value={day.places.join(", ")} onChange={(event) => updateDay(index, { places: event.target.value.split(",").map((place) => place.trim()).filter(Boolean) })} disabled={!canEdit} />
                  </Field>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-outline btn-sm" onClick={addDay} disabled={!canEdit}><Icon name="plus" size={14} /> Thêm ngày</button>
          </div>
        ) : null}

        {tab === "pricing" ? (
          <div className="admin-section">
            <h2>Giá, sức chứa và chính sách</h2>
            <div className="form-grid-3">
              <Field label="Khách tối thiểu" htmlFor="tour-min" required><input id="tour-min" type="number" min={1} className="input" value={form.minPax} onChange={(event) => set("minPax", Number(event.target.value))} disabled={!canEdit} /></Field>
              <Field label="Khách tối đa" htmlFor="tour-max" required><input id="tour-max" type="number" min={1} className="input" value={form.maxPax} onChange={(event) => set("maxPax", Number(event.target.value))} disabled={!canEdit} /></Field>
              <Field label="Tỷ lệ cọc (%)" htmlFor="tour-deposit" required hint="Từ 20% đến 100%."><input id="tour-deposit" type="number" min={20} max={100} className="input" value={form.depositPercent} onChange={(event) => set("depositPercent", Number(event.target.value))} disabled={!canEdit} /></Field>
              <Field label="Tuổi tối đa của em bé" htmlFor="tour-infant" required><input id="tour-infant" type="number" min={0} max={12} className="input" value={form.ageInfantMax} onChange={(event) => set("ageInfantMax", Number(event.target.value))} disabled={!canEdit} /></Field>
              <Field label="Tuổi tối đa của trẻ em" htmlFor="tour-child" required><input id="tour-child" type="number" min={1} max={18} className="input" value={form.ageChildMax} onChange={(event) => set("ageChildMax", Number(event.target.value))} disabled={!canEdit} /></Field>
              <Field label="Chính sách hủy" htmlFor="tour-policy" required>
                <select id="tour-policy" className="input" value={form.cancellationPolicyId} onChange={(event) => set("cancellationPolicyId", event.target.value)} disabled={!canEdit}>
                  <option value="">Chọn chính sách</option>
                  {(policies.data || []).map((policy) => <option key={policy.id} value={policy.id}>{policy.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="inline-actions" style={{ marginTop: 8 }}>
              <label className="checkbox-row"><input type="checkbox" checked={form.requiresIdDocument} onChange={(event) => set("requiresIdDocument", event.target.checked)} disabled={!canEdit} /> <span>Bắt buộc CCCD/CMND khi đặt</span></label>
              <label className="checkbox-row"><input type="checkbox" checked={form.requiresPassport} onChange={(event) => set("requiresPassport", event.target.checked)} disabled={!canEdit} /> <span>Bắt buộc hộ chiếu</span></label>
            </div>
          </div>
        ) : null}

        {tab === "images" ? (
          <div className="admin-section">
            <h2>Ảnh tour</h2>
            <p className="field-hint">Ảnh bìa bắt buộc để xuất bản. Mỗi ảnh cần mô tả alt.</p>
            <div className="inline-actions" style={{ marginBottom: 14 }}>
              <label className="btn btn-outline btn-sm" style={{ cursor: "pointer" }}>
                <Icon name="upload" size={14} /> Tải ảnh lên
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadImage} style={{ display: "none" }} />
              </label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImageOpen(true)}>Thêm bằng URL</button>
            </div>
            <Field label="Ảnh bìa hiện tại" htmlFor="tour-cover">
              <div className="inline-actions" style={{ marginBottom: 8 }}>
                <div style={{ width: 180, height: 110, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
                  <TourCover cover={form.cover} seed={form.slug || "vietnam"} alt={form.name || "Ảnh bìa"} />
                </div>
                <input id="tour-cover" className="input" placeholder="URL ảnh, data:image… hoặc art:halong" value={form.cover} onChange={(event) => set("cover", event.target.value)} style={{ flex: 1 }} />
              </div>
            </Field>
            <div className="image-grid">
              {form.images.map((image, index) => (
                <div key={`${image.url.slice(0, 24)}-${index}`} className="image-item">
                  <TourCover cover={image.url} seed={form.slug || "vietnam"} alt={image.alt} />
                  <button type="button" aria-label={`Xóa ảnh ${image.alt}`} onClick={() => set("images", form.images.filter((_, idx) => idx !== index))}><Icon name="x" size={14} /></button>
                  <span className="sr-only">{image.alt}</span>
                  <button type="button" className="btn btn-sm" style={{ position: "absolute", left: 6, bottom: 6 }} onClick={() => set("cover", image.url)}>Đặt bìa</button>
                </div>
              ))}
            </div>
            {!form.images.length ? <p className="muted">Chưa có ảnh thư viện. Ảnh bìa vẫn có thể dùng màu minh hoạ của hệ thống.</p> : null}
          </div>
        ) : null}

        {tab === "departures" ? (
          <div className="admin-section">
            <h2>Lịch khởi hành ({tour?.departures.length || 0})</h2>
            {tour ? (
              <>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Ngày</th><th>Trạng thái</th><th>Chỗ</th><th></th></tr></thead>
                    <tbody>
                      {tour.departures.slice(0, 12).map((departure) => (
                        <tr key={departure.id}>
                          <td>{departure.departureDate.split("-").reverse().join("/")}</td>
                          <td><StatusChip status={departure.status} kind="departure" size="sm" /></td>
                          <td>{departure.seatsTaken}/{departure.capacity}</td>
                          <td><Link to={`/admin/departures/${departure.id}`} className="text-link">Chi tiết</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Link to={`/admin/departures?tourId=${tour.id}`} className="btn btn-outline btn-sm" style={{ marginTop: 12 }}>Quản lý lịch khởi hành</Link>
              </>
            ) : <p className="muted">Lưu tour trước để tạo lịch khởi hành.</p>}
          </div>
        ) : null}

        {tab === "seo" ? (
          <div className="admin-section">
            <h2>SEO & chia sẻ</h2>
            <div className="form-grid-2">
              <Field label="Tiêu đề SEO" htmlFor="tour-seo-title" className="field--full"><input id="tour-seo-title" className="input" value={form.seoTitle} onChange={(event) => set("seoTitle", event.target.value)} disabled={!canEdit && !canSeo} /></Field>
              <Field label="Mô tả SEO" htmlFor="tour-seo-description" className="field--full" hint={`${form.seoDescription.length}/160 ký tự`}>
                <textarea id="tour-seo-description" className="input textarea" rows={3} maxLength={200} value={form.seoDescription} onChange={(event) => set("seoDescription", event.target.value)} disabled={!canEdit && !canSeo} />
              </Field>
              <Field label="Slug URL" htmlFor="tour-seo-slug" className="field--full">
                <input id="tour-seo-slug" className="input" value={form.slug} onChange={(event) => set("slug", event.target.value)} disabled={!canEdit} />
              </Field>
            </div>
            <p className="field-hint">Dữ liệu có cấu trúc JSON-LD được tạo tự động từ tên, giá từ và đánh giá thật.</p>
          </div>
        ) : null}

        {tab === "history" ? (
          <div className="admin-section">
            <h2>Lịch sử thay đổi</h2>
            {tour?.history?.length ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Hành động</th><th>Thời điểm</th><th>Chi tiết</th></tr></thead>
                  <tbody>
                    {tour.history.slice().reverse().map((row) => (
                      <tr key={row.id}>
                        <td className="row-title">{row.action}</td>
                        <td>{formatDateTime(row.createdAt)}</td>
                        <td><code style={{ fontSize: 11 }}>{row.after ? JSON.stringify(row.after).slice(0, 120) : "—"}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted">Chưa có bản ghi.</p>}
          </div>
        ) : null}
      </div>

      <div className="form-actions" style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
        {canWrite ? <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Đang lưu…" : "Lưu thay đổi"}</button> : null}
        <button type="button" className="btn btn-ghost" onClick={() => navigate("/admin/tours")}>Về danh sách</button>
      </div>

      <Modal
        open={imageOpen}
        onClose={() => setImageOpen(false)}
        title="Thêm ảnh bằng URL"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setImageOpen(false)}>Hủy</button><button type="button" className="btn btn-primary" onClick={addImage}>Thêm ảnh</button></>}
      >
        <Field label="URL ảnh" htmlFor="image-url" required><input id="image-url" className="input" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://…" /></Field>
        <Field label="Mô tả alt" htmlFor="image-alt" required hint="Mô tả nội dung ảnh cho trình đọc màn hình."><input id="image-alt" className="input" value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} /></Field>
      </Modal>
    </>
  );
}
