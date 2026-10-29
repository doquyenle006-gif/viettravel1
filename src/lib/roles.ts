export const ROLE_LABELS: Record<string, string> = {
  customer: "Khách hàng",
  sales: "Tư vấn / bán hàng",
  operator: "Điều hành",
  tour_manager: "Quản lý sản phẩm",
  accountant: "Kế toán",
  content_editor: "Nội dung / marketing",
  guide: "Hướng dẫn viên",
  super_admin: "Quản trị hệ thống",
};

export function roleText(roles: string[]): string {
  return roles.map((role) => ROLE_LABELS[role] || role).join(" · ");
}
