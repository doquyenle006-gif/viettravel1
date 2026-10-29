import { useParams } from "react-router-dom";
import DOMPurify from "dompurify";
import { useApi } from "../lib/hooks";
import { Seo } from "../components/Seo";
import { Breadcrumbs, ErrorState, Skeleton } from "../components/ui";
import { formatDate } from "../lib/format";

interface ContentPage {
  id: number;
  slug: string;
  title: string;
  body: string;
  updatedAt: string;
}

export default function PolicyPage() {
  const { slug } = useParams();
  const state = useApi<ContentPage>(slug ? `/policies/${encodeURIComponent(slug)}` : null, [slug]);
  if (state.loading) return <div className="container policy-page"><Skeleton height={40} width="50%" /><Skeleton height={400} /></div>;
  if (state.error) return <div className="container narrow-page"><ErrorState error={state.error} onRetry={state.reload} /></div>;
  if (!state.data) return null;
  return (
    <>
      <Seo title={state.data.title} description={state.data.title} />
      <div className="container policy-page">
        <Breadcrumbs items={[{ label: "Trang chủ", href: "/" }, { label: state.data.title }]} />
        <h1 style={{ color: "var(--green)", fontSize: 34 }}>{state.data.title}</h1>
        <p className="muted" style={{ margin: "6px 0 20px" }}>Cập nhật lần cuối: {formatDate(state.data.updatedAt)}</p>
        <div className="prose" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(state.data.body) }} />
      </div>
    </>
  );
}
