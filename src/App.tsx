import { Component, type ErrorInfo, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { ToastProvider } from "./components/Toast";
import { PageLoader } from "./components/ui";
import { useSessionStore } from "./lib/session";
import { RequireAdmin, RequireAuth, RequirePermission, RequireVerified, RedirectIfAuthed } from "./app/guards";

const SiteLayout = lazy(() => import("./components/SiteLayout").then((m) => ({ default: m.SiteLayout })));
const AdminLayout = lazy(() => import("./components/AdminLayout").then((m) => ({ default: m.AdminLayout })));

const HomePage = lazy(() => import("./pages/HomePage"));
const ToursPage = lazy(() => import("./pages/ToursPage"));
const TourDetailPage = lazy(() => import("./pages/TourDetailPage"));
const DestinationsPage = lazy(() => import("./pages/DestinationsPage"));
const DestinationDetailPage = lazy(() => import("./pages/DestinationDetailPage"));
const CategoriesPage = lazy(() => import("./pages/CategoriesPage"));
const CategoryDetailPage = lazy(() => import("./pages/CategoryDetailPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const PolicyPage = lazy(() => import("./pages/PolicyPage"));
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const RegisterPage = lazy(() => import("./pages/auth/RegisterPage"));
const VerifyEmailPage = lazy(() => import("./pages/auth/VerifyEmailPage"));
const ForgotPasswordPage = lazy(() => import("./pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage"));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const PayPage = lazy(() => import("./pages/PayPage"));
const PaymentResultPage = lazy(() => import("./pages/PaymentResultPage"));
const PaymentGatewayPage = lazy(() => import("./pages/PaymentGatewayPage"));
const AccountLayout = lazy(() => import("./pages/account/AccountLayout"));
const AccountBookingsPage = lazy(() => import("./pages/account/AccountBookingsPage"));
const AccountBookingDetailPage = lazy(() => import("./pages/account/AccountBookingDetailPage"));
const AccountProfilePage = lazy(() => import("./pages/account/AccountProfilePage"));
const AccountSecurityPage = lazy(() => import("./pages/account/AccountSecurityPage"));
const DevOutboxPage = lazy(() => import("./pages/DevOutboxPage"));
const ForbiddenPage = lazy(() => import("./pages/ForbiddenPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

const AdminDashboardPage = lazy(() => import("./pages/admin/AdminDashboardPage"));
const AdminToursPage = lazy(() => import("./pages/admin/AdminToursPage"));
const AdminTourEditorPage = lazy(() => import("./pages/admin/AdminTourEditorPage"));
const AdminDeparturesPage = lazy(() => import("./pages/admin/AdminDeparturesPage"));
const AdminDepartureDetailPage = lazy(() => import("./pages/admin/AdminDepartureDetailPage"));
const AdminBookingsPage = lazy(() => import("./pages/admin/AdminBookingsPage"));
const AdminBookingDetailPage = lazy(() => import("./pages/admin/AdminBookingDetailPage"));
const AdminPaymentsPage = lazy(() => import("./pages/admin/AdminPaymentsPage"));
const AdminRefundsPage = lazy(() => import("./pages/admin/AdminRefundsPage"));
const AdminInvoicesPage = lazy(() => import("./pages/admin/AdminInvoicesPage"));
const AdminCustomersPage = lazy(() => import("./pages/admin/AdminCustomersPage"));
const AdminCustomerDetailPage = lazy(() => import("./pages/admin/AdminCustomerDetailPage"));
const AdminCouponsPage = lazy(() => import("./pages/admin/AdminCouponsPage"));
const AdminReviewsPage = lazy(() => import("./pages/admin/AdminReviewsPage"));
const AdminTicketsPage = lazy(() => import("./pages/admin/AdminTicketsPage"));
const AdminTicketDetailPage = lazy(() => import("./pages/admin/AdminTicketDetailPage"));
const AdminResourcesPage = lazy(() => import("./pages/admin/AdminResourcesPage"));
const AdminReportsPage = lazy(() => import("./pages/admin/AdminReportsPage"));
const AdminCatalogPage = lazy(() => import("./pages/admin/AdminCatalogPage"));
const AdminContentPage = lazy(() => import("./pages/admin/AdminContentPage"));
const AdminUsersPage = lazy(() => import("./pages/admin/AdminUsersPage"));
const AdminSettingsPage = lazy(() => import("./pages/admin/AdminSettingsPage"));
const AdminAuditPage = lazy(() => import("./pages/admin/AdminAuditPage"));

function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);
  return null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) console.error("[ui]", error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="container narrow-page">
          <div className="panel">
            <h1>Có lỗi giao diện</h1>
            <p>Trang này gặp sự cố. Dữ liệu của bạn trên máy chủ vẫn an toàn.</p>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Tải lại trang</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Perm({ permission, children }: { permission: string; children: ReactNode }) {
  return <RequirePermission permission={permission}>{children}</RequirePermission>;
}

function AppProviders({ children }: { children: ReactNode }) {
  const init = useSessionStore((state) => state.init);
  useEffect(() => {
    void init();
  }, [init]);
  return <ToastProvider>{children}</ToastProvider>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <BrowserRouter>
          <ScrollToTop />
          <Suspense fallback={<PageLoader label="Đang tải trang" />}>
            <Routes>
              <Route element={<SiteLayout />}>
                <Route index element={<HomePage />} />
                <Route path="tours" element={<ToursPage />} />
                <Route path="tours/:slug" element={<TourDetailPage />} />
                <Route path="destinations" element={<DestinationsPage />} />
                <Route path="destinations/:slug" element={<DestinationDetailPage />} />
                <Route path="danh-muc" element={<CategoriesPage />} />
                <Route path="categories/:slug" element={<CategoryDetailPage />} />
                <Route path="contact" element={<ContactPage />} />
                <Route path="policies/:slug" element={<PolicyPage />} />
                <Route path="login" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
                <Route path="register" element={<RedirectIfAuthed><RegisterPage /></RedirectIfAuthed>} />
                <Route path="verify-email" element={<VerifyEmailPage />} />
                <Route path="forgot-password" element={<RedirectIfAuthed><ForgotPasswordPage /></RedirectIfAuthed>} />
                <Route path="reset-password" element={<ResetPasswordPage />} />
                <Route path="dev-outbox" element={<DevOutboxPage />} />
                <Route path="checkout" element={<RequireAuth><RequireVerified><CheckoutPage /></RequireVerified></RequireAuth>} />
                <Route path="booking/:code/pay" element={<RequireAuth><PayPage /></RequireAuth>} />
                <Route path="payment/result" element={<RequireAuth><PaymentResultPage /></RequireAuth>} />
                <Route path="account" element={<RequireAuth><AccountLayout /></RequireAuth>}>
                  <Route index element={<Navigate to="bookings" replace />} />
                  <Route path="bookings" element={<AccountBookingsPage />} />
                  <Route path="bookings/:code" element={<AccountBookingDetailPage />} />
                  <Route path="profile" element={<AccountProfilePage />} />
                  <Route path="security" element={<AccountSecurityPage />} />
                </Route>
                <Route path="403" element={<ForbiddenPage />} />
                <Route path="my-bookings" element={<Navigate to="/account/bookings" replace />} />
                <Route path="profile" element={<Navigate to="/account/profile" replace />} />
                <Route path="booking" element={<Navigate to="/checkout" replace />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>

              <Route path="payment/gateway/:merchantRef" element={<PaymentGatewayPage />} />

              <Route path="admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
                <Route index element={<AdminDashboardPage />} />
                <Route path="tours" element={<Perm permission="tour:read"><AdminToursPage /></Perm>} />
                <Route path="tours/new" element={<Perm permission="tour:create"><AdminTourEditorPage /></Perm>} />
                <Route path="tours/:id" element={<Perm permission="tour:read"><AdminTourEditorPage /></Perm>} />
                <Route path="departures" element={<Perm permission="departure:read"><AdminDeparturesPage /></Perm>} />
                <Route path="departures/:id" element={<Perm permission="departure:read"><AdminDepartureDetailPage /></Perm>} />
                <Route path="bookings" element={<Perm permission="booking:read"><AdminBookingsPage /></Perm>} />
                <Route path="bookings/:code" element={<Perm permission="booking:read"><AdminBookingDetailPage /></Perm>} />
                <Route path="payments" element={<Perm permission="payment:read"><AdminPaymentsPage /></Perm>} />
                <Route path="refunds" element={<Perm permission="refund:read"><AdminRefundsPage /></Perm>} />
                <Route path="invoices" element={<Perm permission="invoice:read"><AdminInvoicesPage /></Perm>} />
                <Route path="customers" element={<Perm permission="customer:read"><AdminCustomersPage /></Perm>} />
                <Route path="customers/:id" element={<Perm permission="customer:read"><AdminCustomerDetailPage /></Perm>} />
                <Route path="coupons" element={<Perm permission="coupon:read"><AdminCouponsPage /></Perm>} />
                <Route path="reviews" element={<Perm permission="review:read"><AdminReviewsPage /></Perm>} />
                <Route path="tickets" element={<Perm permission="ticket:handle"><AdminTicketsPage /></Perm>} />
                <Route path="tickets/:id" element={<Perm permission="ticket:handle"><AdminTicketDetailPage /></Perm>} />
                <Route path="resources/:type" element={<Perm permission="operations:manage"><AdminResourcesPage /></Perm>} />
                <Route path="reports" element={<Perm permission="report:view"><AdminReportsPage /></Perm>} />
                <Route path="catalog/:type" element={<Perm permission="tour:read"><AdminCatalogPage /></Perm>} />
                <Route path="content" element={<Perm permission="content:manage"><AdminContentPage /></Perm>} />
                <Route path="users" element={<Perm permission="user:manage"><AdminUsersPage /></Perm>} />
                <Route path="settings" element={<Perm permission="settings:manage"><AdminSettingsPage /></Perm>} />
                <Route path="audit-logs" element={<Perm permission="audit:view"><AdminAuditPage /></Perm>} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AppProviders>
    </ErrorBoundary>
  );
}
