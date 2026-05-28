import { Mail, MessageCircle, Building2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import ContactForm from '@/components/store/ContactForm';

export default function ContactPage() {
  const { user } = useAuthStore();

  return (
    <div className="sf-container py-12 sm:py-16">
      <div className="mx-auto max-w-4xl">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
            <MessageCircle className="h-6 w-6 text-accent" />
          </div>
          <h1 className="mt-4 text-3xl font-bold text-foreground sm:text-4xl">Get in Touch</h1>
          <p className="mt-3 text-base text-muted-foreground">
            Questions, partnership opportunities, or feedback — we'd love to hear from you.
          </p>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="rounded-lg border bg-card p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-foreground">Send us a message</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Fill out the form below and we&apos;ll get back to you within 1–2 business days. Use any email you
              actually check (Gmail, Yahoo, Outlook, iCloud, etc.) — we only use it to reply to you.
            </p>
            <div className="mt-6">
              <ContactForm defaultName={user?.name} defaultEmail={user?.email} />
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border bg-card p-5">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-semibold">General Inquiries</h3>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Have a question about our products, ingredients, or shipping? We're here to help.
              </p>
            </div>

            <div className="rounded-lg border bg-card p-5">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-semibold">Become a Dealer</h3>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Interested in stocking ShopReturnGifts products? Choose "Dealership / Partnership" in the form.
              </p>
            </div>

            <div className="rounded-lg border bg-card p-5">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-semibold">Issues & Complaints</h3>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Something not right with your order? Let us know and we'll make it right.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
