import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Send, CheckCircle2 } from 'lucide-react';
import { toast } from '@/lib/inboxToast';
import { API_BASE_URL } from '@/lib/api';

const CONTACT_SUBJECTS = [
  { value: 'general', label: 'General Inquiry' },
  { value: 'dealership', label: 'Dealership / Partnership' },
  { value: 'complaint', label: 'Issue or Complaint' },
] as const;

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name too long'),
  email: z.string().trim().email('Invalid email').max(255, 'Email too long'),
  subject: z.enum(['general', 'dealership', 'complaint']),
  message: z.string().trim().min(10, 'Please provide at least 10 characters').max(2000, 'Message too long'),
});

interface ContactFormProps {
  defaultName?: string;
  defaultEmail?: string;
  onSuccess?: () => void;
}

export default function ContactForm({ defaultName = '', defaultEmail = '', onSuccess }: ContactFormProps) {
  const [form, setForm] = useState({
    name: defaultName,
    email: defaultEmail,
    subject: 'general' as 'general' | 'dealership' | 'complaint',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = contactSchema.safeParse(form);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      toast.error(firstError?.message || 'Please fix form errors');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to send message');
      }
      setSubmitted(true);
      toast.success("Message sent — we'll be in touch soon!");
      setForm({ name: defaultName, email: defaultEmail, subject: 'general', message: '' });
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-success/30 bg-success/5 p-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-success" />
        <h3 className="mt-4 text-lg font-semibold">Message sent!</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Thanks for reaching out. Our team will get back to you within 1–2 business days.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => setSubmitted(false)}>
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="contact-name">Name</Label>
          <Input
            id="contact-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Your full name"
            maxLength={100}
            disabled={submitting}
            className="mt-1"
            required
          />
        </div>
        <div>
          <Label htmlFor="contact-email">Your email (for our reply)</Label>
          <Input
            id="contact-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@gmail.com or any address you use"
            maxLength={255}
            disabled={submitting}
            className="mt-1"
            autoComplete="email"
            required
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Personal or work addresses are fine. This is not restricted to our domain — we need it so we can write back.
          </p>
        </div>
      </div>

      <div>
        <Label htmlFor="contact-subject">Subject</Label>
        <Select
          value={form.subject}
          onValueChange={(v) => setForm({ ...form, subject: v as typeof form.subject })}
          disabled={submitting}
        >
          <SelectTrigger id="contact-subject" className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONTACT_SUBJECTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="contact-message">Message</Label>
        <Textarea
          id="contact-message"
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          placeholder="Tell us how we can help..."
          rows={5}
          maxLength={2000}
          disabled={submitting}
          className="mt-1"
          required
        />
        <p className="mt-1 text-xs text-muted-foreground">{form.message.length}/2000 characters</p>
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="w-full bg-accent text-accent-foreground hover:bg-accent-hover sm:w-auto"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" /> Send Message
          </>
        )}
      </Button>
    </form>
  );
}
