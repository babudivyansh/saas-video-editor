import { EmptyState } from "@/app/components/ui/EmptyState";
import { Card } from "@/app/components/ui/Card";
import { FEATURE_MAINTENANCE_MESSAGE } from "@/lib/feature-maintenance-registry";

/**
 * What a user sees in place of a feature an admin has put in maintenance
 * (admin Ops → Maintenance). proxy.ts rewrites the feature's pages here, so
 * the URL and the dashboard chrome stay as they were.
 */
export function FeatureMaintenance({ featureName }: { featureName?: string }) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10" role="status">
      <Card shadow padding="md">
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          }
          title={featureName ?? "This feature"}
          subtitle={FEATURE_MAINTENANCE_MESSAGE}
          action={{ label: "Back to Home", href: "/dashboard" }}
        />
      </Card>
    </div>
  );
}
