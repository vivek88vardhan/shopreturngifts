import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import StoreLayout from "@/components/store/StoreLayout";
import AdminAuthGate from "@/components/admin/AdminAuthGate";
import AdminLayout from "@/components/admin/AdminLayout";
import HomePage from "@/pages/HomePage";
import ProductsPage from "@/pages/ProductsPage";
import ProductDetailPage from "@/pages/ProductDetailPage";
import CategoriesPage from "@/pages/CategoriesPage";
import CartPage from "@/pages/CartPage";
import CheckoutPage from "@/pages/CheckoutPage";
import CheckoutFailurePage from "@/pages/CheckoutFailurePage";
import CheckoutSuccessPage from "@/pages/CheckoutSuccessPage";
import OrdersPage from "@/pages/OrdersPage";
import OrderDetailPage from "@/pages/OrderDetailPage";
import ProfilePage from "@/pages/ProfilePage";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import ContactPage from "@/pages/ContactPage";
import AuthCallbackPage from "@/pages/AuthCallbackPage";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminCategories from "@/pages/admin/AdminCategories";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminOrderReconciliation from "@/pages/admin/AdminOrderReconciliation";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminConfig from "@/pages/admin/AdminConfig";
import AdminCoupons from "@/pages/admin/AdminCoupons";
import AdminDealers from "@/pages/admin/AdminDealers";
import AdminNotifications from "@/pages/admin/AdminNotifications";
import AdminAuditLog from "@/pages/admin/AdminAuditLog";
import AdminRewards from "@/pages/admin/AdminRewards";
import NotFound from "./pages/NotFound.tsx";
import NotificationInboxSync from "@/components/notifications/NotificationInboxSync";
import ErrorNotificationPeek from "@/components/notifications/ErrorNotificationPeek";

const App = () => (
  <TooltipProvider>
    <Toaster />
    <NotificationInboxSync />
    <ErrorNotificationPeek />
    <BrowserRouter>
      <Routes>
          {/* Store routes */}
          <Route element={<StoreLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/products/:productId" element={<ProductDetailPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/checkout/success" element={<CheckoutSuccessPage />} />
            <Route path="/checkout/failure" element={<CheckoutFailurePage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders/:orderId" element={<OrderDetailPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
          </Route>

          {/* Admin routes — auth gate waits for persist hydration and valid admin JWT */}
          <Route path="/admin" element={<AdminAuthGate />}>
            <Route element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="products" element={<AdminProducts />} />
              <Route path="categories" element={<AdminCategories />} />
              <Route path="orders" element={<AdminOrders />} />
              <Route path="order-reconciliation" element={<AdminOrderReconciliation />} />
              <Route path="coupons" element={<AdminCoupons />} />
              <Route path="rewards" element={<AdminRewards />} />
              <Route path="dealers" element={<AdminDealers />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="notifications" element={<AdminNotifications />} />
              <Route path="audit-log" element={<AdminAuditLog />} />
              <Route path="config" element={<AdminConfig />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
