import { LandingLayout } from '../../components/landing/LandingLayout';
import { usePageMeta } from '../../hooks/usePageMeta';

export function PrivacyPolicy() {
  usePageMeta('Privacy Policy — Taskly', 'How Taskly handles the data you create.');

  return (
    <LandingLayout>
      <section className="pt-20 pb-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold font-heading text-gray-900 mb-3">Privacy Policy</h1>
          <p className="text-gray-500 mb-10">A full policy will be published here before public launch.</p>

          <div className="glass-card space-y-4">
            <p className="text-lg text-gray-800 font-medium">The short version, while Taskly is in beta:</p>
            <p className="text-gray-600">
              Taskly stores only what it needs to plan your day — the tasks, schedule, energy
              preferences, and sleep entries you create — so the app can build and adjust your
              schedule for you.
            </p>
            <p className="text-gray-600">
              Your account is secured through Supabase authentication. A complete privacy policy
              covering data retention, third-party processors, and your rights is being written and
              will replace this page before launch.
            </p>
            <p className="text-gray-600">
              Have a question in the meantime? Reach out using the contact details in the footer.
            </p>
          </div>
        </div>
      </section>
    </LandingLayout>
  );
}
