import { Link } from "react-router-dom";
import { Seo } from "../components/Seo";
import { Icon } from "../components/Icon";

export default function NotFoundPage() {
  return (
    <>
      <Seo title="Không tìm thấy trang" noindex />
      <div className="container not-found">
        <p className="eyebrow">404</p>
        <h1>Lạc đường rồi</h1>
        <p>Trang bạn tìm không tồn tại hoặc đã được di chuyển. Hãy quay về hành trình chính.</p>
        <div className="inline-actions" style={{ justifyContent: "center" }}>
          <Link to="/" className="btn btn-primary"><Icon name="home" size={16} /> Về trang chủ</Link>
          <Link to="/tours" className="btn btn-outline">Khám phá tour</Link>
          <Link to="/contact" className="btn btn-ghost">Liên hệ hỗ trợ</Link>
        </div>
      </div>
    </>
  );
}
