import { LandingLayout } from '../../components/landing/LandingLayout';
import { usePageMeta } from '../../hooks/usePageMeta';

export function Terms() {
  usePageMeta('Terms of Service — Taskly', 'The terms for using Taskly during beta.');

  return (
    <LandingLayout>
      <section className="pt-20 pb-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold font-heading text-gray-900 mb-3">Terms of Service</h1>
          <p className="text-gray-500 mb-10">Full terms will be published here before public launch.</p>

          <div className="glass-card space-y-4">
            <p className="text-lg text-gray-800 font-medium">The short version, while Taskly is in beta:</p>
            <p className="text-gray-600">
              Taskly is early software offered free during beta and provided “as is,” without
              warranties. Features may change, and occasional issues are expected — please back up
              anything you can’t afford to lose.
            </p>
            <p className="text-gray-600">
              You’re responsible for the content you add, and you agree not to misuse the service.
              Complete terms covering accounts, acceptable use, and liability are being written and
              will replace this page before launch.
            </p>
            <p className="text-gray-600">
              Questions before then? Reach out using the contact details in the footer.
            </p>
          </div>
        </div>
      </section>
    </LandingLayout>
  );
}
