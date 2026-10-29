import { useEffect } from "react";

interface SeoProps {
  title: string;
  description?: string;
  noindex?: boolean;
  jsonLd?: Record<string, unknown>;
}

export function Seo({ title, description, noindex, jsonLd }: SeoProps) {
  useEffect(() => {
    document.title = `${title} — VietTrails`;
  }, [title]);

  return (
    <>
      {description ? <meta name="description" content={description} /> : null}
      {noindex ? <meta name="robots" content="noindex,nofollow" /> : null}
      {jsonLd ? <script type="application/ld+json">{JSON.stringify(jsonLd)}</script> : null}
    </>
  );
}
