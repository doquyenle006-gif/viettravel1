export const ALL_PERMISSIONS = [
  "admin:access",
  "tour:read",
  "tour:create",
  "tour:update",
  "tour:publish",
  "tour:seo",
  "departure:read",
  "departure:create",
  "departure:update",
  "departure:cancel",
  "booking:read",
  "booking:update",
  "booking:cancel",
  "payment:read",
  "payment:confirm",
  "refund:read",
  "refund:approve",
  "invoice:read",
  "invoice:manage",
  "customer:read",
  "customer:update",
  "coupon:read",
  "coupon:manage",
  "review:read",
  "review:moderate",
  "ticket:handle",
  "operations:manage",
  "manifest:read",
  "manifest:export",
  "report:view",
  "report:financial",
  "content:manage",
  "user:manage",
  "role:manage",
  "settings:manage",
  "audit:view",
  "export:pii",
];

const SALES = [
  "admin:access", "tour:read", "departure:read", "booking:read", "booking:update", "booking:cancel",
  "customer:read", "customer:update", "payment:read", "review:read", "ticket:handle",
  "report:view", "manifest:read",
];

const OPERATOR = [
  "admin:access", "tour:read", "departure:read", "departure:create", "departure:update",
  "departure:cancel", "booking:read", "booking:update", "booking:cancel", "customer:read",
  "operations:manage", "manifest:read", "manifest:export", "report:view", "ticket:handle",
];

const TOUR_MANAGER = [
  "admin:access", "tour:read", "tour:create", "tour:update", "tour:publish", "tour:seo",
  "departure:read", "departure:create", "departure:update", "departure:cancel",
  "booking:read", "customer:read", "coupon:read", "report:view", "report:financial",
];

const ACCOUNTANT = [
  "admin:access", "payment:read", "payment:confirm", "refund:read", "refund:approve",
  "invoice:read", "invoice:manage", "booking:read", "customer:read", "report:view",
  "report:financial", "audit:view", "export:pii",
];

const CONTENT_EDITOR = [
  "admin:access", "tour:read", "tour:seo", "coupon:read", "coupon:manage", "review:read",
  "review:moderate", "content:manage", "report:view",
];

const GUIDE = ["admin:access", "departure:read", "manifest:read", "booking:read"];

export const ROLE_PERMISSIONS = {
  customer: [],
  sales: SALES,
  operator: OPERATOR,
  tour_manager: TOUR_MANAGER,
  accountant: ACCOUNTANT,
  content_editor: CONTENT_EDITOR,
  guide: GUIDE,
  super_admin: ALL_PERMISSIONS,
};

export const ROLES = Object.keys(ROLE_PERMISSIONS);

export const ROLE_LABELS = {
  customer: "Khách hàng",
  sales: "Tư vấn / bán hàng",
  operator: "Điều hành",
  tour_manager: "Quản lý sản phẩm",
  accountant: "Kế toán",
  content_editor: "Nội dung / marketing",
  guide: "Hướng dẫn viên",
  super_admin: "Quản trị hệ thống",
};

export function permissionsFor(roles = []) {
  const set = new Set();
  for (const role of roles) {
    for (const perm of ROLE_PERMISSIONS[role] || []) set.add(perm);
  }
  return [...set].sort();
}

export function hasPermission(user, permission) {
  if (!user) return false;
  if (!permission) return true;
  return permissionsFor(user.roles).includes(permission);
}

export function roleLabel(roles = []) {
  return (roles.length ? roles : ["customer"]).map((r) => ROLE_LABELS[r] || r).join(" · ");
}
