import { useEffect } from 'react';

/**
 * Sets the document <title> and meta description for the current page,
 * restoring the previous values when the page unmounts.
 *
 * This is client-side only: it improves browser tabs, history entries, and
 * JS-executing crawlers. Static crawlers (WhatsApp, Discord, most link
 * unfurlers) read the tags baked into index.html, so those remain the
 * brand-level source of truth until the site is prerendered.
 *
 * @param title       Full document title, used verbatim (e.g. "Features — Taskly").
 * @param description Optional meta description for this page.
 */
export function usePageMeta(title: string, description?: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    const meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta?.getAttribute('content') ?? null;
    if (description && meta) {
      meta.setAttribute('content', description);
    }

    return () => {
      document.title = previousTitle;
      if (meta && previousDescription !== null) {
        meta.setAttribute('content', previousDescription);
      }
    };
  }, [title, description]);
}
